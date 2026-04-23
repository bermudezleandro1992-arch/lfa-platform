/**
 * app/api/recargar/verificar/route.ts
 * Verificación automática de pagos vía Binance Pay.
 *
 * Flujo:
 *  1. Verifica Firebase JWT del usuario
 *  2. Valida datos del pack y que el referencia_id no esté ya usado
 *  3. Consulta Binance Pay API: busca una tx exitosa del monto exacto en últimas 48 hs
 *  4a. Si se encuentra → acredita coins atómicamente + guarda como 'aprobado'
 *  4b. Si no se encuentra → guarda como 'pendiente' para revisión CEO (fallback)
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue }                from 'firebase-admin/firestore';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { getBinancePayTransactions } from '@/lib/binance';
import { writeLedgerEntry }          from '@/lib/ledger';

/* ─── Packs (idénticos a recargar/page.tsx) ──────────── */
const PACKS = [
  { id: 'starter',  coins: 500,   bonus: 0,    usd: 0.50 },
  { id: 'basic',    coins: 1000,  bonus: 0,    usd: 1.00 },
  { id: 'standard', coins: 2000,  bonus: 200,  usd: 2.00 },
  { id: 'popular',  coins: 3000,  bonus: 450,  usd: 3.00 },
  { id: 'pro',      coins: 5000,  bonus: 1000, usd: 5.00 },
  { id: 'vip',      coins: 10000, bonus: 2500, usd: 10.00 },
  { id: 'elite',    coins: 25000, bonus: 7500, usd: 25.00 },
] as const;

type PackId = typeof PACKS[number]['id'];

/* ─── Tolerancia de monto para comparar floats ─────── */
const AMOUNT_TOLERANCE = 0.001; // USD

export async function POST(req: NextRequest) {
  try {
    /* ── 1. Auth ──────────────────────────────────────── */
    const authHeader = req.headers.get('authorization') ?? '';
    const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
    }

    /* ── 2. Parsear body ──────────────────────────────── */
    const body = await req.json() as {
      packId:        string;
      referencia_id: string;
      sender_alias:  string;
      screenshotUrl: string;
    };

    const { packId, referencia_id, sender_alias, screenshotUrl } = body;

    if (!packId || !referencia_id?.trim() || !screenshotUrl) {
      return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 });
    }

    // Sanitizar referencia_id — solo alfanumérico, guiones y guiones bajos
    const refIdClean = referencia_id.trim().replace(/[^A-Za-z0-9\-_]/g, '');
    if (refIdClean.length < 4) {
      return NextResponse.json({ error: 'ID de referencia inválido.' }, { status: 400 });
    }

    const pack = PACKS.find(p => p.id === packId);
    if (!pack) return NextResponse.json({ error: 'Pack inválido.' }, { status: 400 });

    const totalCoins = pack.coins + pack.bonus;

    /* ── 3. Deduplicación: referencia_id ya usada? ────── */
    const [dupRefSnap, dupBinanceSnap] = await Promise.all([
      adminDb.collection('pagos_pendientes').where('referencia_id', '==', refIdClean).limit(1).get(),
      adminDb.collection('pagos_pendientes').where('binance_tx_id', '==', refIdClean).limit(1).get(),
    ]);

    if (!dupRefSnap.empty || !dupBinanceSnap.empty) {
      return NextResponse.json(
        { error: 'Este ID de referencia ya fue procesado. Si tenés dudas, contactá al CEO.' },
        { status: 409 },
      );
    }

    /* ── 4. Consultar Binance Pay API (últimas 48 hs) ── */
    const startTime48h = Date.now() - 48 * 60 * 60 * 1000;
    const binanceResult = await getBinancePayTransactions({ startTime: startTime48h, limit: 100 });

    let verified    = false;
    let binanceTxId = '';

    if (binanceResult.ok && binanceResult.txs) {
      // ÚNICO criterio de match: transactionId exacto + monto correcto + estado SUCCESS
      // El ID de referencia que muestra Binance Pay al emisor es el transactionId.
      // No se usa fallback por monto solamente — evita que alguien explote el conocimiento
      // de que LFA recibió $X de otra persona para auto-acreditarse monedas.
      const matchingTx = binanceResult.txs.find(tx => {
        if (tx.orderStatus !== 'SUCCESS') return false;
        const txAmount = parseFloat(tx.orderAmount);
        const amountOk = Math.abs(txAmount - pack.usd) <= AMOUNT_TOLERANCE;
        const idOk     = tx.transactionId === refIdClean;
        return amountOk && idOk;
      });

      if (matchingTx) {
        // Verificar además que este binance_tx_id no haya sido reclamado ya
        const dupTxSnap = await adminDb
          .collection('pagos_pendientes')
          .where('binance_tx_id', '==', matchingTx.transactionId)
          .limit(1)
          .get();
        if (!dupTxSnap.empty) {
          return NextResponse.json(
            { error: 'Esta transacción de Binance ya fue reclamada.' },
            { status: 409 },
          );
        }
        verified    = true;
        binanceTxId = matchingTx.transactionId;
      }
      // Si no coincide → cae a revisión manual CEO (sin fallbacks inseguros)
    }

    /* ── 5a. VERIFICADO → acreditar automáticamente ──── */
    if (verified) {
      await adminDb.runTransaction(async tx => {
        const userRef  = adminDb.collection('usuarios').doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error('Usuario no encontrado.');

        const currentBalance = (userSnap.data()?.number ?? 0) as number;

        writeLedgerEntry(tx, userRef, uid, currentBalance, {
          type:        'DEPOSIT',
          amount:      totalCoins,
          status:      'completed',
          reference_id: binanceTxId || refIdClean,
          description: `Recarga automática verificada — Pack ${pack.id.toUpperCase()} ${pack.usd} USDT · Binance Pay`,
        });

        // Guardar en pagos_pendientes como aprobado (historial CEO + billetera)
        const pagoRef = adminDb.collection('pagos_pendientes').doc();
        tx.set(pagoRef, {
          uid,
          coins:          pack.coins,
          bonus:          pack.bonus,
          coins_total:    totalCoins,
          usd:            pack.usd,
          pack_id:        pack.id,
          metodo:         'Binance Pay',
          referencia_id:  refIdClean,
          binance_tx_id:  binanceTxId,
          sender_alias:   (sender_alias ?? '').trim().slice(0, 100),
          comprobante_url: screenshotUrl,
          estado:         'aprobado',
          verificado_auto: true,
          fecha:          FieldValue.serverTimestamp(),
          aprobado_at:    FieldValue.serverTimestamp(),
        });
      });

      return NextResponse.json({
        ok:       true,
        verified: true,
        coins:    totalCoins,
        message:  `✅ Pago verificado automáticamente. Se acreditaron 🪙${totalCoins.toLocaleString()} LFA Coins a tu cuenta.`,
      });
    }

    /* ── 5b. NO VERIFICADO → guardar pendiente (fallback CEO) */
    await adminDb.collection('pagos_pendientes').add({
      uid,
      coins:           pack.coins,
      bonus:           pack.bonus,
      coins_total:     totalCoins,
      usd:             pack.usd,
      pack_id:         pack.id,
      metodo:          'Binance Pay',
      referencia_id:   refIdClean,
      sender_alias:    (sender_alias ?? '').trim().slice(0, 100),
      comprobante_url: screenshotUrl,
      estado:          'pendiente',
      verificado_auto: false,
      binance_api_ok:  binanceResult.ok,
      fecha:           FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok:      true,
      verified: false,
      pending:  true,
      message:  `⏳ Pago recibido. No pudimos verificarlo automáticamente. El equipo LFA lo revisará en hasta 24 hs y acreditará 🪙${totalCoins.toLocaleString()} Coins.`,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    console.error('[verificar-pago]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
