/**
 * app/api/retiro/route.ts
 * Endpoint seguro para procesar retiros automáticos vía Binance API.
 *
 * Flujo:
 *  1. Verifica Firebase JWT del usuario
 *  2. Valida monto, saldo, Fair Play, cooldown y duplicados
 *  3. Descuenta coins del usuario en una transacción atómica de Firestore
 *  4. Llama a la API de Binance para enviar USDT
 *  5. Si Binance falla → reembolsa coins automáticamente
 *  6. Registra todo en Firestore para auditoría
 *
 * Seguridad:
 *  - Solo acepta JWT válido de Firebase Auth
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

/* ─── Constantes ──────────────────────────────────── */
const RATE            = 1_000;      // 1000 LFA Coins = 1 USDT
const MIN_COINS       = 10_000;     // Mínimo de retiro: 10 USDT
const MAX_USDT_AUTO   = 200;        // Arriba de 200 USDT → aprobación manual CEO
const DAILY_LIMIT_USDT = 500;       // Máximo 500 USDT por usuario por día
const COOLDOWN_MS     = 24 * 60 * 60 * 1000; // 1 retiro cada 24 h
const FP_MINIMO       = 15;         // Fair Play mínimo para retirar
const CEO_UID         = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

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
  let body: { montoCoins?: unknown; wallet?: unknown; network?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const montoCoins = Number(body.montoCoins);
  const wallet     = typeof body.wallet  === 'string' ? body.wallet.trim()  : '';
  const network    = typeof body.network === 'string' ? body.network.toUpperCase() : '';

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
  const uRef = adminDb.collection('usuarios').doc(uid);

  /* 3 ── Transacción atómica: validar + descontar ── */
  let retiroRef: FirebaseFirestore.DocumentReference | null = null;

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

      // Descontar coins
      tx.update(uRef, {
        number: FieldValue.increment(-montoCoins),
      });

      // Crear registro de retiro (estado: procesando)
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
        fecha:            FieldValue.serverTimestamp(),
        updated_at:       FieldValue.serverTimestamp(),
      });

      // Registrar transacción para auditoría
      tx.set(adminDb.collection('transactions').doc(), {
        userId:    uid,
        type:      'RETIRO',
        amount:    -montoCoins,
        usd:       montoUSDT,
        wallet,
        network,
        timestamp: FieldValue.serverTimestamp(),
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
    // Actualizar estado a completado
    await (retiroRef as FirebaseFirestore.DocumentReference).update({
      estado:     'completado',
      binance_id: result.id,
      updated_at: FieldValue.serverTimestamp(),
    });

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
      tx.update(uRef, { number: FieldValue.increment(montoCoins) });
      tx.update(retiroRef as FirebaseFirestore.DocumentReference, {
        estado:      'fallido',
        error:       result.error ?? 'Error desconocido de Binance',
        updated_at:  FieldValue.serverTimestamp(),
      });
      // Transacción de devolución
      tx.set(adminDb.collection('transactions').doc(), {
        userId:    uid,
        type:      'RETIRO_REEMBOLSO',
        amount:    montoCoins,
        razon:     result.error ?? 'Error Binance',
        timestamp: FieldValue.serverTimestamp(),
      });
    });
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
