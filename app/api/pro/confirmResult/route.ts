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

    // Deltas
    const p1pts = winner_uid === match.player1_uid ? 3 : winner_uid === 'draw' ? 1 : 0;
    const p2pts = winner_uid === match.player2_uid ? 3 : winner_uid === 'draw' ? 1 : 0;
    const p1win = winner_uid === match.player1_uid ? 1 : 0;
    const p2win = winner_uid === match.player2_uid ? 1 : 0;
    const draw  = winner_uid === 'draw' ? 1 : 0;

    // Player 1 stats in league
    batch.update(p1Ref, {
      pj: FieldValue.increment(1),
      gf: FieldValue.increment(s1),
      gc: FieldValue.increment(s2),
      pg: FieldValue.increment(p1win),
      pe: FieldValue.increment(draw),
      pp: FieldValue.increment(winner_uid === match.player2_uid ? 1 : 0),
      pts: FieldValue.increment(p1pts),
    });

    // Player 2 stats in league
    batch.update(p2Ref, {
      pj: FieldValue.increment(1),
      gf: FieldValue.increment(s2),
      gc: FieldValue.increment(s1),
      pg: FieldValue.increment(p2win),
      pe: FieldValue.increment(draw),
      pp: FieldValue.increment(winner_uid === match.player1_uid ? 1 : 0),
      pts: FieldValue.increment(p2pts),
    });

    // ── Mantener ranking global (pro_global_ranking/{uid}) ──
    const g1Ref = adminDb.collection('pro_global_ranking').doc(match.player1_uid);
    const g2Ref = adminDb.collection('pro_global_ranking').doc(match.player2_uid);

    // Fetch participant data for names (may not exist in global yet)
    const [p1Data, p2Data] = await Promise.all([p1Ref.get(), p2Ref.get()]);

    const p1Info = p1Data.data() ?? {};
    const p2Info = p2Data.data() ?? {};

    batch.set(g1Ref, {
      display_name:   p1Info.display_name ?? match.player1_name,
      team_name:      p1Info.team_name    ?? match.player1_team,
      logo_url:       p1Info.logo_url     ?? match.player1_logo,
      total_pts:      FieldValue.increment(p1pts),
      total_pj:       FieldValue.increment(1),
      total_pg:       FieldValue.increment(p1win),
      total_pe:       FieldValue.increment(draw),
      total_pp:       FieldValue.increment(winner_uid === match.player2_uid ? 1 : 0),
      total_gf:       FieldValue.increment(s1),
      total_gc:       FieldValue.increment(s2),
      leagues_played: FieldValue.increment(0), // set on enroll
      last_updated:   new Date().toISOString(),
    }, { merge: true });

    batch.set(g2Ref, {
      display_name:   p2Info.display_name ?? match.player2_name,
      team_name:      p2Info.team_name    ?? match.player2_team,
      logo_url:       p2Info.logo_url     ?? match.player2_logo,
      total_pts:      FieldValue.increment(p2pts),
      total_pj:       FieldValue.increment(1),
      total_pg:       FieldValue.increment(p2win),
      total_pe:       FieldValue.increment(draw),
      total_pp:       FieldValue.increment(winner_uid === match.player1_uid ? 1 : 0),
      total_gf:       FieldValue.increment(s2),
      total_gc:       FieldValue.increment(s1),
      leagues_played: FieldValue.increment(0),
      last_updated:   new Date().toISOString(),
    }, { merge: true });

    await batch.commit();

    return NextResponse.json({ success: true, winner_uid });
  } catch (err) {
    console.error('[pro/confirmResult]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
