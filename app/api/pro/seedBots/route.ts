import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

// Bot roster — diverse names & teams
const BOT_ROSTER = [
  { name: 'Rodrigo Gareca', team: 'Los Cóndores FC',   country: 'Argentina', logo: '🦅', konami_id: '111-222-333', ea_id: 'RGareca_BOT',  wa: '+54911000001' },
  { name: 'Marcos Riquelme', team: 'Villa del Parque', country: 'Argentina', logo: '⭐', konami_id: '222-333-444', ea_id: 'MRiquelme_BOT', wa: '+54911000002' },
  { name: 'Carlos Valdivia', team: 'Colo Pro FC',       country: 'Chile',    logo: '🔵', konami_id: '333-444-555', ea_id: 'CValdivia_BOT', wa: '+56911000003' },
  { name: 'Sebastián Pérez', team: 'Rioplatense FC',    country: 'Uruguay',  logo: '🟡', konami_id: '444-555-666', ea_id: 'SPerez_BOT',    wa: '+59811000004' },
  { name: 'Diego Montoya',   team: 'Cafeteros Pro',     country: 'Colombia', logo: '🟠', konami_id: '555-666-777', ea_id: 'DMontoya_BOT',  wa: '+57311000005' },
  { name: 'Andrés Flores',   team: 'Lima Clásico',      country: 'Perú',     logo: '🔴', konami_id: '666-777-888', ea_id: 'AFlores_BOT',   wa: '+51911000006' },
  { name: 'Pablo Gutiérrez', team: 'Asunción United',   country: 'Paraguay', logo: '🟢', konami_id: '777-888-999', ea_id: 'PGutierrez_BOT',wa: '+59511000007' },
  { name: 'Maximiliano Ruiz',team: 'Rivadavia FC',      country: 'Argentina', logo: '🏟️', konami_id: '888-999-000', ea_id: 'MRuiz_BOT',    wa: '+54911000008' },
  { name: 'Lucas Ferreira',  team: 'Fluminense Bot',    country: 'Brasil',   logo: '💚', konami_id: '900-111-222', ea_id: 'LFerreira_BOT', wa: '+55911000009' },
  { name: 'Tomás Herrera',   team: 'El Clásico Bot',    country: 'México',   logo: '🇲🇽', konami_id: '100-200-300', ea_id: 'THerrera_BOT',  wa: '+52111000010' },
  { name: 'Santiago Cruz',   team: 'Cruzeiro Bot',      country: 'Brasil',   logo: '⚡', konami_id: '200-300-400', ea_id: 'SCruz_BOT',    wa: '+55911000011' },
  { name: 'Emiliano Vargas', team: 'LFA Dev FC',         country: 'Argentina', logo: '🤖', konami_id: '300-400-500', ea_id: 'EVargas_BOT',  wa: '+54911000012' },
];

/**
 * POST { league_id, count? }
 * CEO-only: adds N bot participants to a league for testing.
 * count: 4-12 (default: fills to max_players)
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid || uid !== CEO_UID) {
      return NextResponse.json({ error: 'Solo el CEO puede agregar bots.' }, { status: 403 });
    }

    const { league_id, count } = await req.json();
    if (!league_id) return NextResponse.json({ error: 'Falta league_id.' }, { status: 400 });

    const leagueRef  = adminDb.collection('leagues').doc(String(league_id));
    const leagueSnap = await leagueRef.get();
    if (!leagueSnap.exists) {
      return NextResponse.json({ error: 'Liga no encontrada.' }, { status: 404 });
    }

    const league = leagueSnap.data()!;
    const maxPlayers    = league.max_players || 8;
    const currentCount  = league.current_players || 0;
    const available     = maxPlayers - currentCount;

    if (available <= 0) {
      return NextResponse.json({ error: 'La liga ya está llena.' }, { status: 400 });
    }

    const toAdd = Math.min(
      count ? parseInt(count) : available,
      available,
      BOT_ROSTER.length
    );

    if (toAdd <= 0) {
      return NextResponse.json({ error: 'No se pueden agregar bots.' }, { status: 400 });
    }

    // Get existing participants to avoid re-adding
    const existingSnap = await leagueRef.collection('participants').get();
    const existingBotIds = new Set(
      existingSnap.docs.map(d => d.id).filter(id => id.startsWith('bot_'))
    );

    // Pick bots not already in league
    const selectedBots = BOT_ROSTER
      .filter((_, i) => !existingBotIds.has(`bot_${i + 1}`))
      .slice(0, toAdd);

    if (selectedBots.length === 0) {
      return NextResponse.json({ error: 'Todos los bots ya están en la liga.' }, { status: 400 });
    }

    const platformId = (bot: typeof BOT_ROSTER[0]) =>
      league.game === 'fc26' ? bot.ea_id : bot.konami_id;

    const batch = adminDb.batch();
    const now = new Date().toISOString();

    selectedBots.forEach((bot, i) => {
      const botUid = `bot_${existingBotIds.size + i + 1}`;
      const partRef = leagueRef.collection('participants').doc(botUid);
      batch.set(partRef, {
        uid:         botUid,
        display_name: bot.name,
        team_name:   bot.team,
        logo_url:    bot.logo,
        platform_id: platformId(bot),
        whatsapp:    bot.wa,
        country:     bot.country,
        pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0,
        is_bot: true,
        joined_at: now,
      });
    });

    batch.update(leagueRef, {
      current_players: FieldValue.increment(selectedBots.length),
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      added: selectedBots.length,
      bots: selectedBots.map(b => b.name),
    });
  } catch (err) {
    console.error('[pro/seedBots]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
