import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp } from '@/lib/rateLimiter';
import {
  SHOP_POINTS_PER_LFA,
  SHOP_COINS_REWARD,
  MIN_FPS_FOR_REDEMPTION,
} from '@/lib/constants';

/**
 * POST /api/tienda/canjear
 *
 * Convierte Puntos de Tienda (puntos_gratis) en LFA Coins.
 *   50.000 pts → 1.000 LFA Coins
 *
 * Requisitos:
 *   - Fair Play Score ≥ MIN_FPS_FOR_REDEMPTION (80)
 *   - Saldo de puntos ≥ SHOP_POINTS_PER_LFA (50.000)
 *   - Máx 3 canjes por hora por usuario
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid     = decoded.uid;

    // Rate limit: 3 canjes por hora por usuario
    const ip = getClientIp(req);
    if (!checkRateLimit(`tienda_canje:${uid}`, 3, 3_600_000))
      return NextResponse.json({ error: 'Límite de canjes alcanzado. Máximo 3 por hora.' }, { status: 429 });
    if (!checkRateLimit(`tienda_canje_ip:${ip}`, 10, 3_600_000))
      return NextResponse.json({ error: 'Demasiados intentos desde esta red.' }, { status: 429 });

    const userRef  = adminDb.collection('usuarios').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

    const user     = userSnap.data()!;
    const puntos   = (user.puntos_gratis ?? 0) as number;
    const fairPlay = (user.fair_play    ?? 100) as number;

    if (fairPlay < MIN_FPS_FOR_REDEMPTION) {
      return NextResponse.json({
        error: `Necesitás un Fair Play Score de al menos ${MIN_FPS_FOR_REDEMPTION}% para canjear. Tu puntaje actual: ${fairPlay}%.`,
      }, { status: 403 });
    }

    if (puntos < SHOP_POINTS_PER_LFA) {
      return NextResponse.json({
        error: `Necesitás al menos ${SHOP_POINTS_PER_LFA.toLocaleString()} puntos para canjear. Tenés ${puntos.toLocaleString()} pts.`,
      }, { status: 400 });
    }

    // Transacción: descontar puntos y acreditar coins
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.data()!;
      const pts  = (data.puntos_gratis ?? 0) as number;
      const fps  = (data.fair_play    ?? 100) as number;

      if (fps < MIN_FPS_FOR_REDEMPTION) throw new Error('fair_play insuficiente');
      if (pts < SHOP_POINTS_PER_LFA)   throw new Error('puntos insuficientes');

      tx.update(userRef, {
        puntos_gratis: FieldValue.increment(-SHOP_POINTS_PER_LFA),
        number:        FieldValue.increment(SHOP_COINS_REWARD),
      });
    });

    // Registrar el canje para auditoría
    await adminDb.collection('tienda_canjes').add({
      uid,
      puntos_descontados: SHOP_POINTS_PER_LFA,
      coins_acreditadas:  SHOP_COINS_REWARD,
      fair_play_al_canje: fairPlay,
      timestamp:          FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: `✅ ¡Canje exitoso! Se acreditaron ${SHOP_COINS_REWARD.toLocaleString()} LFA Coins a tu cuenta.`,
      coins_acreditadas: SHOP_COINS_REWARD,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
