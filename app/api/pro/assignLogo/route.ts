import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

/**
 * CEO assigns logo_url + optional team_name to a participant in a league.
 * Body: { league_id, participant_uid, logo_url, team_name? }
 */
export async function POST(req: NextRequest) {
  try {
    const callerUid = await verifyToken(req);
    if (callerUid !== CEO_UID) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

    const { league_id, participant_uid, logo_url, team_name } = await req.json();
    if (!league_id || !participant_uid || !logo_url) {
      return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 });
    }

    const partRef = adminDb
      .collection('leagues').doc(league_id)
      .collection('participants').doc(participant_uid);

    const update: Record<string, string> = { logo_url: String(logo_url).slice(0, 500) };
    if (team_name) update.team_name = String(team_name).slice(0, 60);

    await partRef.set(update, { merge: true });

    // Also update all league_matches that reference this participant
    const matchSnap = await adminDb.collection('league_matches')
      .where('league_id', '==', league_id)
      .get();

    const batch = adminDb.batch();
    for (const mDoc of matchSnap.docs) {
      const m = mDoc.data();
      const upd: Record<string, string> = {};
      if (m.player1_uid === participant_uid) {
        upd.player1_logo = update.logo_url;
        if (update.team_name) upd.player1_team = update.team_name;
      }
      if (m.player2_uid === participant_uid) {
        upd.player2_logo = update.logo_url;
        if (update.team_name) upd.player2_team = update.team_name;
      }
      if (Object.keys(upd).length) batch.update(mDoc.ref, upd);
    }
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[pro/assignLogo]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
