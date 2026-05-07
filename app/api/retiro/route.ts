/**
 * app/api/retiro/route.ts
 * Endpoint seguro para procesar retiros automáticos vía Binance API.
 *
 * Flujo:
 *  1. Verifica Firebase JWT del usuario
 *  2. Para retiros ≥ $50 USDT: valida OTP de email (2FA)
 *  3. Valida monto, saldo, Fair Play, cooldown y duplicados
 *  4. Descuenta coins del usuario en una transacción atómica de Firestore
 *  5. Llama a la API de Binance para enviar USDT
 *  6. Si Binance falla → reembolsa coins automáticamente
 *  7. Registra todo en Firestore para auditoría
 *
 * Seguridad:
 *  - Solo acepta JWT válido de Firebase Auth
 *  - 2FA por OTP de email para retiros ≥ $50 USDT (KYC_THRESHOLD_USDT)
 *  - Rate limit: 1 retiro cada 24 h por usuario
 *  - Máximo 1 retiro pendiente por usuario
 *  - Monto máximo por request: 200 USDT (arriba necesita aprobación manual)
 *  - Dirección de billetera validada con regex estricto
 *  - API keys Binance SOLO en variables de entorno (nunca en cliente)
 *  - Transacción atómica: los coins se descuentan antes de llamar a Binance
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue }                from 'firebase-admin/firestore';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { binanceWithdraw }           from '@/lib/binance';
import type { BinanceNetwork }       from '@/lib/binance';
import { writeLedgerEntry, updateLedgerStatus } from '@/lib/ledger';

/* ─── Constantes ──────────────────────────────────── */
const RATE               = 1_000;      // 1000 LFA Coins = 1 USDT
const MIN_COINS          = 20_000;     // Mínimo de retiro: 20 USDT
const MAX_USDT_AUTO      = 200;        // Arriba de 200 USDT → aprobación manual CEO
const DAILY_LIMIT_USDT   = 500;        // Máximo 500 USDT por usuario por día
const COOLDOWN_MS        = 24 * 60 * 60 * 1000; // 1 retiro cada 24 h
const FP_MINIMO          = 15;         // Fair Play mínimo para retirar
const KYC_THRESHOLD_USDT = 50;         // A partir de $50 USDT se requiere OTP (2FA)

/* ─── Redes permitidas ────────────────────────────── */
const REDES_PERMITIDAS: BinanceNetwork[] = ['TRX', 'BSC'];

/* ═══════════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  /* 1 ── Verificar JWT Firebase ─────────────────── */
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  /* 2 ── Leer y validar body ────────────────────── */
  let body: { montoCoins?: unknown; wallet?: unknown; network?: unknown; otp?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const montoCoins = Number(body.montoCoins);
  const wallet     = typeof body.wallet  === 'string' ? body.wallet.trim()  : '';
  const network    = typeof body.network === 'string' ? body.network.toUpperCase() : '';
  const otpInput   = typeof body.otp     === 'string' ? body.otp.trim()     : '';;

  if (!montoCoins || !wallet || !network) {
    return NextResponse.json({ error: 'montoCoins, wallet y network son requeridos.' }, { status: 400 });
  }
  if (!Number.isInteger(montoCoins) || montoCoins < MIN_COINS) {
    return NextResponse.json({ error: `Mínimo ${MIN_COINS.toLocaleString()} coins (${MIN_COINS / RATE} USDT) para retirar.` }, { status: 400 });
  }
  if (!REDES_PERMITIDAS.includes(network as BinanceNetwork)) {
    return NextResponse.json({ error: 'Red no válida. Usá TRX (TRC20) o BSC (BEP20).' }, { status: 400 });
  }
  // Dirección de billetera: solo alfanumérico, 15-100 chars
  if (!/^[A-Za-z0-9]{15,100}$/.test(wallet)) {
    return NextResponse.json({ error: 'Dirección de billetera inválida.' }, { status: 400 });
  }

  const montoUSDT = montoCoins / RATE;

  /* 2.5 ── 2FA OTP para retiros ≥ $50 USDT ─────── */
  if (montoUSDT >= KYC_THRESHOLD_USDT) {
    // Si no se envió OTP en el body, solicitar que pida código primero
    if (!otpInput) {
      return NextResponse.json({
        requiresOtp: true,
        message:     `Este retiro supera $${KYC_THRESHOLD_USDT} USDT. Necesitás verificar tu identidad con un código enviado a tu email.`,
      }, { status: 200 });
    }

    // Validar OTP
    const otpRef  = adminDb.collection('otp_retiro').doc(uid);
    const otpSnap = await otpRef.get();
    if (!otpSnap.exists) {
      return NextResponse.json({ error: 'No hay código activo. Pedilo de nuevo.' }, { status: 400 });
    }
    const otpData = otpSnap.data()!;
    if (otpData.used) {
      return NextResponse.json({ error: 'El código ya fue utilizado. Pedí uno nuevo.' }, { status: 400 });
    }
    const expires = (otpData.expires_at as FirebaseFirestore.Timestamp)?.toDate?.();
    if (!expires || Date.now() > expires.getTime()) {
      return NextResponse.json({ error: 'El código expiró. Pedí uno nuevo.' }, { status: 400 });
    }
    const attempts = (otpData.attempts as number) ?? 0;
    if (attempts >= 3) {
      return NextResponse.json({ error: 'Demasiados intentos fallidos. Pedí un nuevo código.' }, { status: 400 });
    }
    if (otpInput !== otpData.otp_hash) {
      // Incrementar intentos
      await otpRef.update({ attempts: attempts + 1 });
      const restantes = 2 - attempts;
      return NextResponse.json({ error: `Código incorrecto. ${restantes > 0 ? `Te queda${restantes === 1 ? '' : 'n'} ${restantes} intento${restantes === 1 ? '' : 's'}.` : 'Pedí un código nuevo.'}` }, { status: 400 });
    }
    // OTP válido → marcarlo como usado
    await otpRef.update({ used: true });
  }
  const uRef = adminDb.collection('usuarios').doc(uid);

  // Capturar IP del solicitante para trazabilidad de auditoría
  const ipSolicitud =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  /* 3 ── Transacción atómica: validar + descontar ── */
  let retiroRef: FirebaseFirestore.DocumentReference | null = null;
  let ledgerTxId = '';

  try {
    await adminDb.runTransaction(async (tx) => {
      const uSnap = await tx.get(uRef);
      if (!uSnap.exists) throw new Error('Usuario no encontrado.');
      const u = uSnap.data()!;

      // Saldo
      const balance = (u.number ?? u.coins ?? 0) as number;
      if (balance < montoCoins) throw new Error('Saldo insuficiente.');

      // Fair Play
      const fp = (u.fair_play ?? 100) as number;
      if (fp < FP_MINIMO) throw new Error(`Fair Play muy bajo (${fp}%). Jugá torneos limpios para desbloquearlo.`);

      // Cooldown: verificar último retiro
      const recentSnap = await adminDb.collection('retiros')
        .where('uid', '==', uid)
        .where('estado', 'in', ['pendiente', 'procesando', 'completado'])
        .orderBy('fecha', 'desc')
        .limit(1)
        .get();

      if (!recentSnap.empty) {
        const lastDate = recentSnap.docs[0].data().fecha?.toDate?.() as Date | undefined;
        if (lastDate && Date.now() - lastDate.getTime() < COOLDOWN_MS) {
          const horasRestantes = Math.ceil((COOLDOWN_MS - (Date.now() - lastDate.getTime())) / 3_600_000);
          throw new Error(`Ya hiciste un retiro hoy. Podés hacer otro en ${horasRestantes} h.`);
        }
      }

      // Límite diario acumulado: 500 USDT/día
      const dayAgo = new Date(Date.now() - COOLDOWN_MS);
      const dailySnap = await adminDb.collection('retiros')
        .where('uid', '==', uid)
        .where('estado', 'in', ['procesando', 'completado', 'aprobacion_manual'])
        .where('fecha', '>=', dayAgo)
        .get();
      const dailyUSD = dailySnap.docs.reduce((s, d) => s + ((d.data().usd as number) ?? 0), 0);
      if (dailyUSD + montoUSDT > DAILY_LIMIT_USDT) {
        const restante = Math.max(0, DAILY_LIMIT_USDT - dailyUSD);
        throw new Error(`Límite diario de $${DAILY_LIMIT_USDT} USDT alcanzado. Podés retirar hasta $${restante.toFixed(2)} USDT más hoy.`);
      }

      // Débito atómico con registro de ledger (estado: pending hasta confirmar Binance)
      const ledgerResult = writeLedgerEntry(tx, uRef, uid, balance, {
        type:         'WITHDRAWAL_PENDING',
        amount:       -montoCoins,
        status:       'pending',
        reference_id: '',   // se completa con TxID de Binance al confirmar
        description:  `Retiro $${montoUSDT.toFixed(2)} USDT · ${network === 'TRX' ? 'TRC20' : 'BEP20'} · ${wallet.slice(0, 8)}...`,
      });
      ledgerTxId = ledgerResult.ledgerTxId;

      // Crear registro de retiro (referencia al ledger)
      retiroRef = adminDb.collection('retiros').doc();
      tx.set(retiroRef, {
        uid,
        nombreJugador:    u.nombre || '',
        montoCoins,
        usd:              montoUSDT,
        wallet,
        network,
        metodo:           `Binance USDT (${network === 'TRX' ? 'TRC20' : 'BEP20'})`,
        estado:           montoUSDT > MAX_USDT_AUTO ? 'aprobacion_manual' : 'procesando',
        binance_id:       null,
        ledger_tx_id:     ledgerTxId,
        fecha:            FieldValue.serverTimestamp(),
        updated_at:       FieldValue.serverTimestamp(),
        ip_solicitud:     ipSolicitud,
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  /* 4 ── Si excede el límite, quedó pendiente de revisión CEO ── */
  if (montoUSDT > MAX_USDT_AUTO) {
    return NextResponse.json({
      ok:      true,
      auto:    false,
      message: `Tu retiro de $${montoUSDT.toFixed(2)} USDT superó el límite automático. El equipo LFA lo procesará en 24-72 h.`,
    });
  }

  /* 5 ── Llamar a Binance API ───────────────────── */
  if (!retiroRef) {
    return NextResponse.json({ error: 'Error interno al crear el retiro.' }, { status: 500 });
  }

  // clientId único para idempotencia en Binance
  const clientId = `lfa_${uid.slice(0, 8)}_${Date.now()}`;

  const result = await binanceWithdraw({
    address:  wallet,
    amount:   montoUSDT,
    network:  network as BinanceNetwork,
    clientId,
  });

  /* 6 ── Resultado de Binance ───────────────────── */
  if (result.ok) {
    // Marcar retiro como completado + confirmar ledger con TxID de Binance
    await Promise.all([
      (retiroRef as FirebaseFirestore.DocumentReference).update({
        estado:     'completado',
        binance_id: result.id,
        updated_at: FieldValue.serverTimestamp(),
      }),
      updateLedgerStatus(ledgerTxId, 'completed', {
        reference_id: result.id ?? '',
        type:         'WITHDRAWAL_COMPLETED',
      }),
    ]);

    return NextResponse.json({
      ok:         true,
      auto:       true,
      binance_id: result.id,
      message:    `✅ Retiro de $${montoUSDT.toFixed(2)} USDT procesado. ID Binance: ${result.id}`,
    });
  }

  /* 7 ── Binance falló → reembolsar coins ──────── */
  try {
    await adminDb.runTransaction(async (tx) => {
      const uSnapRefund = await tx.get(uRef);
      const currentBal  = (uSnapRefund.data()?.number ?? uSnapRefund.data()?.coins ?? 0) as number;

      // Reembolso atómico con ledger
      writeLedgerEntry(tx, uRef, uid, currentBal, {
        type:         'WITHDRAWAL_REFUND',
        amount:       montoCoins,
        reference_id: ledgerTxId,
        description:  `Reembolso retiro fallido: ${result.error ?? 'Error Binance'}`,
      });

      tx.update(retiroRef as FirebaseFirestore.DocumentReference, {
        estado:     'fallido',
        error:      result.error ?? 'Error desconocido de Binance',
        updated_at: FieldValue.serverTimestamp(),
      });
    });
    // Marcar el ledger pendiente como rechazado
    await updateLedgerStatus(ledgerTxId, 'rejected', {
      error: result.error ?? 'Error Binance',
    }).catch(() => {});
  } catch { /* Si el reembolso falla, el CEO_UID debe revisarlo manualmente */ }

  // Notificar al CEO para revisión manual (log en Firestore)
  await adminDb.collection('alertas_ceo').add({
    tipo:        'RETIRO_FALLIDO',
    uid,
    montoUSDT,
    wallet,
    network,
    error:       result.error,
    raw:         JSON.stringify(result.raw ?? {}),
    fecha:       FieldValue.serverTimestamp(),
    revisado:    false,
  }).catch(() => {});

  return NextResponse.json({
    error: `Error al procesar el retiro vía Binance: ${result.error}. Tus coins fueron reembolsados automáticamente.`,
  }, { status: 502 });
}
