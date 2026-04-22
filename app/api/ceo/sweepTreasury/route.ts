/**
 * app/api/ceo/sweepTreasury/route.ts
 *
 * Endpoint exclusivo del CEO para enviar los fondos acumulados de la tesorería
 * (el 10% de cada torneo) a la wallet fría de LFA en Binance.
 *
 * Seguridad:
 *  - Solo el CEO puede llamarlo (verifica UID contra CEO_UID hardcodeado)
 *  - Monto mínimo de sweep: 50 USDT (evita fees de red en montos pequeños)
 *  - Transacción atómica: descuenta del treasury ANTES de llamar a Binance
 *  - Si Binance falla → reembolso automático al treasury
 *  - Registro completo en treasury_log para auditoría
 *
 * Wallet destino: LFA_TREASURY_WALLET (secret en Firebase Secret Manager)
 * Red: LFA_TREASURY_NETWORK (TRX o BSC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue }                from 'firebase-admin/firestore';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { binanceWithdraw }           from '@/lib/binance';
import type { BinanceNetwork }       from '@/lib/binance';

const CEO_UID      = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const RATE         = 1_000;   // 1000 coins = 1 USDT
const MIN_SWEEP    = 50_000;  // mínimo 50 USDT para hacer sweep (evita fees en montos pequeños)

export async function POST(req: NextRequest) {
  /* 1 ── Verificar JWT y que sea el CEO ──────────────── */
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
  if (uid !== CEO_UID) {
    return NextResponse.json({ error: 'Solo el CEO puede ejecutar esta operación.' }, { status: 403 });
  }

  /* 2 ── Leer body: monto opcional (si no se pasa, sweep total) ── */
  let montoCoins: number | null = null;
  try {
    const body = await req.json().catch(() => ({})) as { montoCoins?: number };
    if (body.montoCoins) montoCoins = Math.floor(Number(body.montoCoins));
  } catch { /* sweep total si no hay body */ }

  /* 3 ── Verificar configuración de wallet destino ─── */
  const coldWallet  = process.env.LFA_TREASURY_WALLET;
  const coldNetwork = (process.env.LFA_TREASURY_NETWORK ?? 'TRX').toUpperCase() as BinanceNetwork;

  if (!coldWallet) {
    return NextResponse.json({ error: 'LFA_TREASURY_WALLET no configurada. Agregá el secret en Firebase Console.' }, { status: 500 });
  }
  if (!/^[A-Za-z0-9]{15,100}$/.test(coldWallet)) {
    return NextResponse.json({ error: 'LFA_TREASURY_WALLET inválida.' }, { status: 500 });
  }
  if (!['TRX', 'BSC'].includes(coldNetwork)) {
    return NextResponse.json({ error: 'LFA_TREASURY_NETWORK debe ser TRX o BSC.' }, { status: 500 });
  }

  /* 4 ── Transacción atómica: leer saldo + descontar ── */
  const treasuryRef = adminDb.collection('lfa_config').doc('treasury');
  let sweepCoins    = 0;
  let logRef: FirebaseFirestore.DocumentReference | null = null;

  try {
    await adminDb.runTransaction(async (tx) => {
      const tSnap = await tx.get(treasuryRef);
      const balance = (tSnap.data()?.balance_coins ?? 0) as number;

      sweepCoins = montoCoins ?? balance;   // si no se especificó, sweep total

      if (sweepCoins <= 0) throw new Error('No hay fondos en la tesorería para hacer sweep.');
      if (sweepCoins > balance) throw new Error(`Saldo insuficiente. Tesorería tiene ${balance.toLocaleString()} coins.`);
      if (sweepCoins < MIN_SWEEP) throw new Error(`Mínimo ${MIN_SWEEP.toLocaleString()} coins ($${MIN_SWEEP / RATE} USDT) para hacer sweep.`);

      tx.set(treasuryRef, {
        balance_coins:  FieldValue.increment(-sweepCoins),
        ultimo_sweep:   FieldValue.serverTimestamp(),
      }, { merge: true });

      logRef = adminDb.collection('treasury_log').doc();
      tx.set(logRef, {
        tipo:          'SWEEP_ENVIADO',
        coins:         sweepCoins,
        usd:           sweepCoins / RATE,
        wallet_destino: coldWallet,
        network:       coldNetwork,
        estado:        'procesando',
        fecha:         FieldValue.serverTimestamp(),
        ejecutadoPor:  uid,
      });
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno.' }, { status: 400 });
  }

  /* 5 ── Enviar a Binance ───────────────────────────── */
  const montoUSDT = sweepCoins / RATE;
  const clientId  = `treasury_sweep_${Date.now()}`;

  const result = await binanceWithdraw({
    address:  coldWallet,
    amount:   montoUSDT,
    network:  coldNetwork,
    clientId,
  });

  /* 6 ── Actualizar log con resultado ─────────────── */
  if (result.ok) {
    await (logRef as unknown as FirebaseFirestore.DocumentReference).update({
      estado:     'completado',
      binance_id: result.id,
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok:         true,
      usd:        montoUSDT,
      binance_id: result.id,
      message:    `✅ Sweep de $${montoUSDT.toFixed(2)} USDT a wallet fría exitoso. ID: ${result.id}`,
    });
  }

  /* 7 ── Binance falló → reembolso al treasury ─────── */
  await adminDb.runTransaction(async (tx) => {
    tx.set(treasuryRef, { balance_coins: FieldValue.increment(sweepCoins) }, { merge: true });
    tx.set(adminDb.collection('treasury_log').doc(), {
      tipo:         'SWEEP_REEMBOLSO',
      coins:        sweepCoins,
      error:        result.error,
      fecha:        FieldValue.serverTimestamp(),
    });
  }).catch(() => {});

  await (logRef as unknown as FirebaseFirestore.DocumentReference)
    .update({ estado: 'fallido', error: result.error, updated_at: FieldValue.serverTimestamp() })
    .catch(() => {});

  return NextResponse.json({
    error: `Binance rechazó el sweep: ${result.error}. Los fondos fueron devueltos a la tesorería.`,
  }, { status: 502 });
}

/* ─── GET: consultar saldo de la tesorería ─────────── */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (decoded.uid !== CEO_UID) return NextResponse.json({ error: 'Solo el CEO.' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  const tSnap = await adminDb.collection('lfa_config').doc('treasury').get();
  const data  = tSnap.data() ?? {};
  const balance = (data.balance_coins ?? 0) as number;

  // Últimos 10 movimientos
  const logsSnap = await adminDb.collection('treasury_log')
    .orderBy('fecha', 'desc').limit(10).get();
  const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return NextResponse.json({
    balance_coins:   balance,
    balance_usdt:    balance / RATE,
    total_acumulado: data.total_acumulado ?? 0,
    ultimo_ingreso:  data.ultimo_ingreso  ?? null,
    ultimo_sweep:    data.ultimo_sweep    ?? null,
    cold_wallet:     process.env.LFA_TREASURY_WALLET ? '✅ configurada' : '❌ NO configurada',
    cold_network:    process.env.LFA_TREASURY_NETWORK ?? 'TRX',
    logs,
  });
}
