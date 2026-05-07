import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

const DIV_ORDER = ['A', 'B', 'C', 'D', 'E'];

/**
 * Runs ascensos/descensos for a finished league.
 * - Top 4 of Div B,C,D,E → promoted to the next higher division league (same game/platform/region)
 * - Bottom 4 of Div A,B,C,D → relegated to the next lower division league
 * - Creates the new-season league if none exists in that division.
 * Body: { league_id }
 */
export async function POST(req: NextRequest) {
  try {
    const callerUid = await verifyToken(req);
    if (callerUid !== CEO_UID) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

    const { league_id } = await req.json();
    if (!league_id) return NextResponse.json({ error: 'Falta league_id.' }, { status: 400 });

    const leagueRef  = adminDb.collection('leagues').doc(String(league_id));
    const leagueSnap = await leagueRef.get();
    if (!leagueSnap.exists) return NextResponse.json({ error: 'Liga no encontrada.' }, { status: 404 });

    const league = leagueSnap.data()!;
    const division: string = league.division ?? 'GLOBAL';
    if (division === 'GLOBAL') return NextResponse.json({ error: 'Liga GLOBAL no tiene ascensos/descensos.' }, { status: 400 });

    // Fetch and sort participants by standing
    const partSnap = await adminDb.collection('leagues').doc(league_id).collection('participants').get();
    interface Participant { uid: string; pts?: number; gf?: number; gc?: number; [key: string]: unknown; }
    const participants = (partSnap.docs
      .map(d => ({ uid: d.id, ...d.data() })) as Participant[])
      .sort((a, b) => {
        const aPts = (a.pts as number) || 0;
        const bPts = (b.pts as number) || 0;
        if (bPts !== aPts) return bPts - aPts;
        const dgA = ((a.gf as number) || 0) - ((a.gc as number) || 0);
        const dgB = ((b.gf as number) || 0) - ((b.gc as number) || 0);
        if (dgB !== dgA) return dgB - dgA;
        return ((b.gf as number) || 0) - ((a.gf as number) || 0);
      });

    const total = participants.length;
    const promotionCount = Math.min(4, Math.floor(total * 0.25));
    const relegationCount = Math.min(4, Math.floor(total * 0.25));

    const divIndex = DIV_ORDER.indexOf(division);
    const upperDiv = divIndex > 0 ? DIV_ORDER[divIndex - 1] : null;
    const lowerDiv = divIndex < DIV_ORDER.length - 1 ? DIV_ORDER[divIndex + 1] : null;

    const promoted  = upperDiv ? participants.slice(0, promotionCount) : [];
    const relegated = lowerDiv ? participants.slice(total - relegationCount) : [];

    const summary = { promoted: [] as string[], relegated: [] as string[] };

    // Helper: find or create next-season league in a given division
    const findOrCreateNextLeague = async (targetDiv: string): Promise<string> => {
      const allLeagues = await adminDb.collection('leagues')
        .where('game', '==', league.game)
        .where('platform', '==', league.platform)
        .where('region', '==', league.region)
        .where('division', '==', targetDiv)
        .where('status', '==', 'inscripcion')
        .get();

      if (!allLeagues.empty) return allLeagues.docs[0].id;

      // Create new league for that division
      const newLeagueRef = await adminDb.collection('leagues').add({
        name: `${league.game === 'efootball' ? 'eFootball' : league.game === 'fc26' ? 'FC 26' : 'Mobile'} ${league.region.replace('_',' ')} — División ${targetDiv}`,
        game: league.game,
        mode: league.mode,
        platform: league.platform,
        region: league.region,
        status: 'inscripcion',
        max_players: league.max_players || 16,
        current_players: 0,
        current_round: 0,
        total_rounds: 0,
        rules: league.rules || '',
        prize_info: league.prize_info || '',
        entry_fee: league.entry_fee || 0,
        banner_url: null,
        division: targetDiv,
        country_restriction: league.country_restriction || 'GLOBAL',
        promotion_relegation: true,
        auto_created: true,
        created_at: FieldValue.serverTimestamp(),
        start_date: null,
      });
      return newLeagueRef.id;
    }

    // Register promoted players into upper div league
    if (promoted.length > 0 && upperDiv) {
      const targetLeagueId = await findOrCreateNextLeague(upperDiv);
      const batch = adminDb.batch();
      for (const p of promoted) {
        const part = p as Record<string, unknown>;
        const newPartRef = adminDb.collection('leagues').doc(targetLeagueId).collection('participants').doc(String(part.uid));
        batch.set(newPartRef, {
          uid: part.uid,
          display_name: part.display_name || '',
          team_name: part.team_name || '',
          logo_url: part.logo_url || '⚽',
          platform_id: part.platform_id || '',
          whatsapp: part.whatsapp || '',
          country: part.country || '',
          pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0,
          joined_at: FieldValue.serverTimestamp(),
          promoted_from: league_id,
        }, { merge: true });
        batch.update(
          adminDb.collection('leagues').doc(targetLeagueId),
          { current_players: FieldValue.increment(1) }
        );
        summary.promoted.push(String(part.display_name || part.uid));
      }
      await batch.commit();
    }

    // Register relegated players into lower div league
    if (relegated.length > 0 && lowerDiv) {
      const targetLeagueId = await findOrCreateNextLeague(lowerDiv);
      const batch = adminDb.batch();
      for (const p of relegated) {
        const part = p as Record<string, unknown>;
        const newPartRef = adminDb.collection('leagues').doc(targetLeagueId).collection('participants').doc(String(part.uid));
        batch.set(newPartRef, {
          uid: part.uid,
          display_name: part.display_name || '',
          team_name: part.team_name || '',
          logo_url: part.logo_url || '⚽',
          platform_id: part.platform_id || '',
          whatsapp: part.whatsapp || '',
          country: part.country || '',
          pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0,
          joined_at: FieldValue.serverTimestamp(),
          relegated_from: league_id,
        }, { merge: true });
        batch.update(
          adminDb.collection('leagues').doc(targetLeagueId),
          { current_players: FieldValue.increment(1) }
        );
        summary.relegated.push(String(part.display_name || part.uid));
      }
      await batch.commit();
    }

    // Mark original league as finalizada
    await leagueRef.update({ status: 'finalizada' });

    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    console.error('[pro/runPromoRelegation]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
