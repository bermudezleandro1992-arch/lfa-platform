import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp } from '@/lib/rateLimiter';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid     = decoded.uid;

    // Rate limit: max 5 disputes per hour per user — evita abuso de disputas
    const ip = getClientIp(req);
    if (!checkRateLimit(`dispute:${uid}`, 5, 3_600_000))
      return NextResponse.json({ error: 'Límite de disputas alcanzado. Máximo 5 por hora.' }, { status: 429 });
    if (!checkRateLimit(`dispute_ip:${ip}`, 10, 3_600_000))
      return NextResponse.json({ error: 'Demasiados intentos desde esta red.' }, { status: 429 });

    const { matchId, reason } = await req.json();
    if (!matchId || !reason?.trim()) {
      return NextResponse.json({ error: 'matchId y reason requeridos.' }, { status: 400 });
    }

    // Seguridad: limitar longitud del motivo para evitar abuso
    if (typeof reason !== 'string' || reason.trim().length > 500) {
      return NextResponse.json({ error: 'El motivo no puede superar 500 caracteres.' }, { status: 400 });
    }

    const matchRef  = adminDb.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;
    if (match.p1 !== uid && match.p2 !== uid) {
      return NextResponse.json({ error: 'No participás en este match.' }, { status: 403 });
    }
    if (match.status !== 'PENDING_RESULT') {
      return NextResponse.json({ error: 'Solo podés disputar cuando hay un resultado pendiente.' }, { status: 400 });
    }
    if (match.reported_by === uid) {
      return NextResponse.json({ error: 'No podés disputar tu propio reporte.' }, { status: 400 });
    }

    await matchRef.update({
      status:       'DISPUTE',
      dispute_by:   uid,
      dispute_reason: reason.trim(),
      updated_at:   FieldValue.serverTimestamp(),
    });

    // Registrar disputa para revisión del staff
    await adminDb.collection('disputas').add({
      matchId,
      tournamentId: match.tournamentId,
      disputedBy:   uid,
      reason:       reason.trim(),
      screenshot_url: match.screenshot_url ?? null,
      score:          match.score,
      status:         'PENDING',
      created_at:     FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, message: 'Disputa enviada. El Staff revisará el caso.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
