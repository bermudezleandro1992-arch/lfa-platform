import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

/**
 * POST { league_id, top_n }
 * Generates single-elimination playoff bracket from top N players by pts.
 * top_n: 4 or 8 (default: 4)
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid || uid !== CEO_UID) {
      return NextResponse.json({ error: 'Solo el CEO puede iniciar playoffs.' }, { status: 403 });
    }

    const { league_id, top_n = 4 } = await req.json();
    if (!league_id) return NextResponse.json({ error: 'Falta league_id.' }, { status: 400 });

    const leagueRef  = adminDb.collection('leagues').doc(String(league_id));
    const leagueSnap = await leagueRef.get();
    if (!leagueSnap.exists) return NextResponse.json({ error: 'Liga no encontrada.' }, { status: 404 });

    const league = leagueSnap.data()!;
    if (league.status !== 'activa') {
      return NextResponse.json({ error: 'La liga debe estar activa para iniciar playoffs.' }, { status: 400 });
    }

    // Check all round-robin matches are closed
    const matchesSnap = await adminDb.collection('league_matches')
      .where('league_id', '==', String(league_id))
      .where('type', '==', 'roundrobin')
      .get();

    // Also fetch matches without type field (existing ones)
    const allMatchesSnap = await adminDb.collection('league_matches')
      .where('league_id', '==', String(league_id))
      .get();

    const openMatches = allMatchesSnap.docs.filter(d => {
      const status = d.data().status;
      const type   = d.data().type;
      if (type === 'playoff') return false; // skip existing playoffs
      return status !== 'closed' && status !== 'bye';
    });

    if (openMatches.length > 0) {
      return NextResponse.json({
        error: `Hay ${openMatches.length} partido(s) de fase regular sin cerrar.`,
      }, { status: 400 });
    }

    // Get participants sorted by pts
    const partSnap = await leagueRef.collection('participants').get();
    const players = partSnap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const bpts = (b.pts as number) || 0;
        const apts = (a.pts as number) || 0;
        if (bpts !== apts) return bpts - apts;
        const bdg = ((b.gf as number) || 0) - ((b.gc as number) || 0);
        const adg = ((a.gf as number) || 0) - ((a.gc as number) || 0);
        return bdg - adg;
      });

    const topN = Math.min(top_n, players.length);
    if (topN < 2) return NextResponse.json({ error: 'Se necesitan al menos 2 clasificados.' }, { status: 400 });

    // Single-elimination: seeded bracket
    // 1 vs topN, 2 vs topN-1, etc.
    const qualified = players.slice(0, topN);
    const batch = adminDb.batch();
    const matchPairs: number[][] = [];

    // Build bracket pairs: (1 vs N, 2 vs N-1) for semis of 4
    for (let i = 0; i < topN / 2; i++) {
      matchPairs.push([i, topN - 1 - i]);
    }

    const roundLabel = topN === 8 ? 'Cuartos de Final' : topN === 4 ? 'Semifinal' : 'Final';

    matchPairs.forEach(([ai, bi]) => {
      const home = qualified[ai] as Record<string, unknown>;
      const away = qualified[bi] as Record<string, unknown>;
      const mRef = adminDb.collection('league_matches').doc();
      batch.set(mRef, {
        league_id: String(league_id),
        type:      'playoff',
        round:     0, // playoff round
        playoff_round: roundLabel,
        player1_uid:         home.uid,
        player2_uid:         away.uid,
        player1_name:        home.display_name || '',
        player2_name:        away.display_name || '',
        player1_team:        home.team_name    || '',
        player2_team:        away.team_name    || '',
        player1_logo:        home.logo_url     || '',
        player2_logo:        away.logo_url     || '',
        player1_whatsapp:    home.whatsapp     || '',
        player2_whatsapp:    away.whatsapp     || '',
        player1_platform_id: home.platform_id  || '',
        player2_platform_id: away.platform_id  || '',
        player1_seed: ai + 1,
        player2_seed: topN - ai,
        status: 'pending',
        score:  null,
        winner_uid: null,
        photo_url: null, ocr_score: null, ocr_confidence: null,
        reported_by: null, validation_deadline: null,
        room_code: null, dispute_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    // Update league status
    batch.update(leagueRef, {
      status:        'playoffs',
      playoff_top_n: topN,
      updated_at:    FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      matches: matchPairs.length,
      round: roundLabel,
      qualified: qualified.map((p: Record<string, unknown>) => ({ uid: p.uid, team: p.team_name, pts: p.pts })),
    });
  } catch (err) {
    console.error('[pro/startPlayoffs]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
