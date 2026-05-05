import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';

/**
 * Allows a player to reopen a 'closed' match within 30 minutes of it closing.
 * Sets status back to 'challenged' so the reporter can re-upload or the rival can dispute.
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const { match_id } = await req.json();
    if (!match_id) return NextResponse.json({ error: 'Falta match_id.' }, { status: 400 });

    const matchRef  = adminDb.collection('league_matches').doc(String(match_id));
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;
    if (match.player1_uid !== uid && match.player2_uid !== uid) {
      return NextResponse.json({ error: 'No sos parte de este partido.' }, { status: 403 });
    }
    if (match.status !== 'closed') {
      return NextResponse.json({ error: 'El partido no está cerrado.' }, { status: 400 });
    }

    // Only allow reopening within 30 minutes of being closed
    const closedAt = new Date(match.updated_at).getTime();
    const REOPEN_WINDOW_MS = 30 * 60 * 1000;
    if (Date.now() - closedAt > REOPEN_WINDOW_MS) {
      return NextResponse.json({ error: 'Solo podés disputar dentro de los 30 minutos del cierre.' }, { status: 400 });
    }

    // Revert to dispute state so staff can review
    await matchRef.update({
      status: 'dispute',
      dispute_reason: `Reabierto por jugador ${uid} — requiere revisión de staff`,
      winner_uid: null,
      updated_at: new Date().toISOString(),
    });

    // Undo the participant stats (reverse the increments)
    const s1 = match.score?.[match.player1_uid] ?? 0;
    const s2 = match.score?.[match.player2_uid] ?? 0;
    const prevWinner = match.winner_uid as string;

    const leagueRef = adminDb.collection('leagues').doc(match.league_id);
    const p1Ref = leagueRef.collection('participants').doc(match.player1_uid);
    const p2Ref = leagueRef.collection('participants').doc(match.player2_uid);

    const { FieldValue } = await import('firebase-admin/firestore');
    const batch = adminDb.batch();

    batch.update(p1Ref, {
      pj:  FieldValue.increment(-1),
      gf:  FieldValue.increment(-s1),
      gc:  FieldValue.increment(-s2),
      pg:  FieldValue.increment(prevWinner === match.player1_uid ? -1 : 0),
      pe:  FieldValue.increment(prevWinner === 'draw' ? -1 : 0),
      pp:  FieldValue.increment(prevWinner === match.player2_uid ? -1 : 0),
      pts: FieldValue.increment(prevWinner === match.player1_uid ? -3 : prevWinner === 'draw' ? -1 : 0),
    });
    batch.update(p2Ref, {
      pj:  FieldValue.increment(-1),
      gf:  FieldValue.increment(-s2),
      gc:  FieldValue.increment(-s1),
      pg:  FieldValue.increment(prevWinner === match.player2_uid ? -1 : 0),
      pe:  FieldValue.increment(prevWinner === 'draw' ? -1 : 0),
      pp:  FieldValue.increment(prevWinner === match.player1_uid ? -1 : 0),
      pts: FieldValue.increment(prevWinner === match.player2_uid ? -3 : prevWinner === 'draw' ? -1 : 0),
    });

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[pro/reopenMatch]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
