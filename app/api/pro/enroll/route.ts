import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const { league_id, team_name, logo_url, platform_id, whatsapp, country: bodyCountry } = await req.json();

    if (!league_id || !team_name?.trim() || !platform_id?.trim() || !whatsapp?.trim()) {
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 });
    }

    // Sanitize inputs
    const cleanTeam = String(team_name).trim().slice(0, 30).replace(/[<>'"`;]/g, '');
    const cleanPlatId = String(platform_id).trim().slice(0, 50).replace(/[<>'"`;]/g, '');
    const cleanWA = String(whatsapp).trim().slice(0, 20).replace(/[^+\d\s\-()]/g, '');
    const cleanLogo = String(logo_url || '⚽').slice(0, 10);

    const leagueRef = adminDb.collection('leagues').doc(league_id);
    const leagueSnap = await leagueRef.get();

    if (!leagueSnap.exists) {
      return NextResponse.json({ error: 'Liga no encontrada.' }, { status: 404 });
    }
    const league = leagueSnap.data()!;

    if (league.status !== 'inscripcion') {
      return NextResponse.json({ error: 'Las inscripciones están cerradas.' }, { status: 400 });
    }

    // Check if already enrolled
    const participantRef = leagueRef.collection('participants').doc(uid);
    const existing = await participantRef.get();
    if (existing.exists) {
      return NextResponse.json({ error: 'Ya estás inscripto en esta liga.' }, { status: 400 });
    }

    // Check capacity
    if (league.current_players >= league.max_players) {
      return NextResponse.json({ error: 'La liga está completa.' }, { status: 400 });
    }

    // Get user display name
    const userSnap = await adminDb.collection('usuarios').doc(uid).get();
    const displayName = userSnap.exists
      ? (userSnap.data()?.nombre || userSnap.data()?.displayName || 'Jugador')
      : 'Jugador';

    const country = (typeof bodyCountry === 'string' && bodyCountry.trim())
      ? bodyCountry.trim().slice(0, 30).replace(/[<>'"`;]/g, '')
      : userSnap.exists ? (userSnap.data()?.pais || userSnap.data()?.country || '') : '';

    // Batch write
    const batch = adminDb.batch();

    batch.set(participantRef, {
      uid,
      display_name: displayName,
      team_name: cleanTeam,
      logo_url: cleanLogo,
      platform_id: cleanPlatId,
      whatsapp: cleanWA,
      country,
      pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0,
      joined_at: FieldValue.serverTimestamp(),
    });

    batch.update(leagueRef, {
      current_players: FieldValue.increment(1),
    });

    // ── Crear / actualizar pro_global_ranking para que aparezca en ranking global ──
    const globalRef = adminDb.collection('pro_global_ranking').doc(uid);
    batch.set(globalRef, {
      display_name: displayName,
      team_name:    cleanTeam,
      logo_url:     cleanLogo,
      leagues_played: FieldValue.increment(1),
      total_pts: FieldValue.increment(0),
      total_pj:  FieldValue.increment(0),
      total_pg:  FieldValue.increment(0),
      total_pe:  FieldValue.increment(0),
      total_pp:  FieldValue.increment(0),
      total_gf:  FieldValue.increment(0),
      total_gc:  FieldValue.increment(0),
      last_updated: new Date().toISOString(),
    }, { merge: true });

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[pro/enroll]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
