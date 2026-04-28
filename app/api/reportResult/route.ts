import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue, Timestamp }     from 'firebase-admin/firestore';
import { DISPUTE_MINUTES }           from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid     = decoded.uid;

    const { matchId, screenshotUrl, reportedScore } = await req.json();
    if (!matchId || !screenshotUrl) {
      return NextResponse.json({ error: 'matchId y screenshotUrl requeridos.' }, { status: 400 });
    }

    // Seguridad: solo se aceptan URLs de Firebase Storage del proyecto
    const ALLOWED_STORAGE_HOST = 'https://firebasestorage.googleapis.com/';
    if (typeof screenshotUrl !== 'string' || !screenshotUrl.startsWith(ALLOWED_STORAGE_HOST)) {
      return NextResponse.json({ error: 'URL de screenshot no válida.' }, { status: 400 });
    }

    const matchRef  = adminDb.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;
    if (match.status !== 'WAITING') {
      return NextResponse.json({ error: 'Este match ya tiene un resultado reportado.' }, { status: 400 });
    }
    if (match.p1 !== uid && match.p2 !== uid) {
      return NextResponse.json({ error: 'No participás en este match.' }, { status: 403 });
    }

    // TODO: Integrar OCR de Google Vision aquí para validar el score automáticamente
    // Por ahora se guarda el screenshot y se marca como PENDING_RESULT
    const deadlineMs     = Date.now() + DISPUTE_MINUTES * 60 * 1000;
    const disputeDeadline = Timestamp.fromMillis(deadlineMs);

    await matchRef.update({
      status:           'PENDING_RESULT',
      reported_by:      uid,
      screenshot_url:   screenshotUrl,
      score:            typeof reportedScore === 'string' && /^\d{1,2}-\d{1,2}$/.test(reportedScore.trim())
                          ? reportedScore.trim()
                          : 'Pendiente validación',
      dispute_deadline: disputeDeadline,
      updated_at:       FieldValue.serverTimestamp(),
    });

    // Obtener nombre del jugador que reportó
    const reporterSnap = await adminDb.collection('usuarios').doc(uid).get();
    const reporterName = reporterSnap.data()?.nombre ?? 'Jugador';

    // Publicar en el chat general de la sala (cantina_messages) como BOT
    const rivalId      = match.p1 === uid ? match.p2 : match.p1;
    const rivalSnap    = await adminDb.collection('usuarios').doc(rivalId).get();
    const rivalName    = rivalSnap.data()?.nombre ?? 'Rival';
    const salaLabel    = match.tournamentId ? `Sala #${match.tournamentId.slice(-5).toUpperCase()}` : 'la sala';

    await adminDb.collection('cantina_messages').add({
      uid:        'BOT_LFA',
      nombre:     '🤖 BOT LFA',
      avatar_url: null,
      rol:        'bot',
      texto:      `⚽ [${salaLabel}] **${reporterName}** reportó el resultado de su partido contra **${rivalName}**. Prueba subida. ⏳ El rival tiene ${DISPUTE_MINUTES} minutos para confirmar o disputar.`,
      screenshot_url: screenshotUrl,
      is_bot_result:  true,
      match_id:       matchId,
      timestamp:  FieldValue.serverTimestamp(),
      deleted:    false,
    });

    return NextResponse.json({
      success:         true,
      score:           typeof reportedScore === 'string' && /^\d{1,2}-\d{1,2}$/.test(reportedScore.trim())
                         ? reportedScore.trim()
                         : 'Pendiente validación',
      disputeDeadline: deadlineMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
