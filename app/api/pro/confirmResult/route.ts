import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/** Called by the NON-reporting player to accept the result */
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
    if (match.status !== 'validating') {
      return NextResponse.json({ error: 'El partido no está en validación.' }, { status: 400 });
    }

    const s1 = match.score?.[match.player1_uid] ?? 0;
    const s2 = match.score?.[match.player2_uid] ?? 0;
    let winner_uid: string;
    if (s1 > s2) winner_uid = match.player1_uid;
    else if (s2 > s1) winner_uid = match.player2_uid;
    else winner_uid = 'draw';

    // Close match
    await matchRef.update({
      status: 'closed',
      winner_uid,
      updated_at: new Date().toISOString(),
    });

    // Update ranking for both players atomically
    const leagueRef  = adminDb.collection('leagues').doc(match.league_id);
    const p1Ref = leagueRef.collection('participants').doc(match.player1_uid);
    const p2Ref = leagueRef.collection('participants').doc(match.player2_uid);

    const batch = adminDb.batch();

    // Player 1 stats
    batch.update(p1Ref, {
      pj: FieldValue.increment(1),
      gf: FieldValue.increment(s1),
      gc: FieldValue.increment(s2),
      pg: FieldValue.increment(winner_uid === match.player1_uid ? 1 : 0),
      pe: FieldValue.increment(winner_uid === 'draw' ? 1 : 0),
      pp: FieldValue.increment(winner_uid === match.player2_uid ? 1 : 0),
      pts: FieldValue.increment(winner_uid === match.player1_uid ? 3 : winner_uid === 'draw' ? 1 : 0),
    });

    // Player 2 stats
    batch.update(p2Ref, {
      pj: FieldValue.increment(1),
      gf: FieldValue.increment(s2),
      gc: FieldValue.increment(s1),
      pg: FieldValue.increment(winner_uid === match.player2_uid ? 1 : 0),
      pe: FieldValue.increment(winner_uid === 'draw' ? 1 : 0),
      pp: FieldValue.increment(winner_uid === match.player1_uid ? 1 : 0),
      pts: FieldValue.increment(winner_uid === match.player2_uid ? 3 : winner_uid === 'draw' ? 1 : 0),
    });

    await batch.commit();

    return NextResponse.json({ success: true, winner_uid });
  } catch (err) {
    console.error('[pro/confirmResult]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
