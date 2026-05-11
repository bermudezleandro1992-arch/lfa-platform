import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));

    // Solo CEO, soporte o mod
    if (decoded.uid !== CEO_UID) {
      const userSnap = await adminDb.collection('usuarios').doc(decoded.uid).get();
      const rol = userSnap.data()?.rol;
      if (rol !== 'soporte' && rol !== 'mod') {
        return NextResponse.json({ error: 'Sin permisos para reabrir matches.' }, { status: 403 });
      }
    }

    const { matchId } = await req.json();
    if (!matchId || typeof matchId !== 'string') {
      return NextResponse.json({ error: 'matchId requerido.' }, { status: 400 });
    }

    const matchRef  = adminDb.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });
    }

    const match = matchSnap.data()!;

    // Resetear el match a WAITING
    await matchRef.update({
      status:           'WAITING',
      winner:           null,
      score:            '—',
      screenshot_url:   null,
      reported_by:      null,
      dispute_deadline: null,
      dispute_by:       null,
      dispute_reason:   null,
      p1_ready:         false,
      p2_ready:         false,
      p1_ready_at:      null,
      p2_ready_at:      null,
      bot_verification: null,
      updated_at:       FieldValue.serverTimestamp(),
      reopened_at:      FieldValue.serverTimestamp(),
      reopened_by:      decoded.uid,
    });

    // Obtener nombre del staff
    const staffSnap = await adminDb.collection('usuarios').doc(decoded.uid).get();
    const staffName = staffSnap.data()?.nombre ?? 'Staff';

    // Notificar en el chat de la sala
    await adminDb.collection('match_chat').add({
      matchId,
      tournamentId: match.tournamentId || null,
      uid:          'BOT_LFA',
      nombre:       '🤖 BOT LFA',
      rol:          'bot',
      texto:        `⚡ DECISIÓN STAFF (${staffName}): El partido fue reabierto. Ambos jugadores deben hacer check-in nuevamente para continuar. El resultado anterior fue anulado.`,
      timestamp:    FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: 'Match reabierto correctamente. Los jugadores recibieron notificación en el chat.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
