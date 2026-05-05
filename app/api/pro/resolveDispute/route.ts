import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (uid !== CEO_UID) {
      return NextResponse.json({ error: 'Solo el CEO puede resolver disputas.' }, { status: 403 });
    }

    const { match_id, resolution } = await req.json();
    if (!match_id || !['p1','p2','draw','annul'].includes(resolution)) {
      return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
    }

    const matchRef  = adminDb.collection('league_matches').doc(String(match_id));
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;
    if (match.status !== 'dispute') {
      return NextResponse.json({ error: 'El partido no está en disputa.' }, { status: 400 });
    }

    if (resolution === 'annul') {
      await matchRef.update({ status: 'pending', dispute_reason: null, reported_by: null, score: null, updated_at: new Date().toISOString() });
      return NextResponse.json({ success: true, resolution: 'annulled' });
    }

    const winner_uid = resolution === 'p1' ? match.player1_uid
                     : resolution === 'p2' ? match.player2_uid
                     : 'draw';

    // Determine scores — use stored scores or set 0-0 for draw
    const s1 = match.score?.[match.player1_uid] ?? (resolution === 'draw' ? 0 : resolution === 'p1' ? 1 : 0);
    const s2 = match.score?.[match.player2_uid] ?? (resolution === 'draw' ? 0 : resolution === 'p2' ? 1 : 0);

    await matchRef.update({
      status: 'closed',
      winner_uid,
      ceo_resolved: true,
      updated_at: new Date().toISOString(),
    });

    // Update ranking
    const leagueRef = adminDb.collection('leagues').doc(match.league_id);
    const batch = adminDb.batch();

    const p1Ref = leagueRef.collection('participants').doc(match.player1_uid);
    const p2Ref = leagueRef.collection('participants').doc(match.player2_uid);

    batch.update(p1Ref, {
      pj:  FieldValue.increment(1),
      gf:  FieldValue.increment(s1),
      gc:  FieldValue.increment(s2),
      pg:  FieldValue.increment(winner_uid === match.player1_uid ? 1 : 0),
      pe:  FieldValue.increment(winner_uid === 'draw' ? 1 : 0),
      pp:  FieldValue.increment(winner_uid === match.player2_uid ? 1 : 0),
      pts: FieldValue.increment(winner_uid === match.player1_uid ? 3 : winner_uid === 'draw' ? 1 : 0),
    });

    batch.update(p2Ref, {
      pj:  FieldValue.increment(1),
      gf:  FieldValue.increment(s2),
      gc:  FieldValue.increment(s1),
      pg:  FieldValue.increment(winner_uid === match.player2_uid ? 1 : 0),
      pe:  FieldValue.increment(winner_uid === 'draw' ? 1 : 0),
      pp:  FieldValue.increment(winner_uid === match.player1_uid ? 1 : 0),
      pts: FieldValue.increment(winner_uid === match.player2_uid ? 3 : winner_uid === 'draw' ? 1 : 0),
    });

    await batch.commit();

    return NextResponse.json({ success: true, winner_uid });
  } catch (err) {
    console.error('[pro/resolveDispute]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
