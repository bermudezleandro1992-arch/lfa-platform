/**
 * /api/mod/forceClassicResult
 * Moderadores, soporte y CEO pueden forzar el resultado de un partido de torneo clásico.
 * Replica la lógica de /api/ceo/forceWinner pero accesible a moderadores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const CEO_UID    = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const STAFF_ROLES = ['mod', 'soporte'];

async function verifyStaff(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const uid = decoded.uid;
    if (uid === CEO_UID) return uid;
    const snap = await adminDb.collection('usuarios').doc(uid).get();
    const rol  = snap.data()?.rol as string | undefined;
    return rol && STAFF_ROLES.includes(rol) ? uid : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const staffUid = await verifyStaff(req);
  if (!staffUid)
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

  let body: { matchId?: unknown; winnerSide?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Body inválido.' }, { status: 400 }); }

  const matchId    = typeof body.matchId    === 'string' ? body.matchId.trim()    : '';
  const winnerSide = typeof body.winnerSide === 'string' ? body.winnerSide.trim() : '';

  if (!matchId || !['p1', 'p2'].includes(winnerSide))
    return NextResponse.json({ error: 'matchId y winnerSide ("p1"|"p2") requeridos.' }, { status: 400 });

  const matchRef  = adminDb.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });

  const match    = matchSnap.data()!;
  if (match.status === 'FINISHED')
    return NextResponse.json({ error: 'Match ya finalizado.' }, { status: 400 });

  const winnerId = winnerSide === 'p1' ? (match.p1 as string) : (match.p2 as string);
  const loserId  = winnerSide === 'p1' ? (match.p2 as string) : (match.p1 as string);

  const [winnerSnap, loserSnap] = await Promise.all([
    adminDb.collection('usuarios').doc(winnerId).get(),
    adminDb.collection('usuarios').doc(loserId).get(),
  ]);
  const winnerName = winnerSnap.data()?.nombre ?? 'Jugador';
  const loserName  = loserSnap.data()?.nombre  ?? 'Rival';

  await matchRef.update({
    status:       'FINISHED',
    winner:       winnerId,
    score:        match.score || 'MOD_OVERRIDE',
    ceo_override: true,
    resolved_by:  staffUid,
    updated_at:   FieldValue.serverTimestamp(),
  });

  /* Cantina notification */
  const salaLabel = match.tournamentId
    ? `Sala #${(match.tournamentId as string).slice(-5).toUpperCase()}` : 'la sala';
  await adminDb.collection('cantina_messages').add({
    uid: 'BOT_LFA', nombre: '🤖 BOT LFA', avatar_url: null, rol: 'bot',
    texto: `⚡ [${salaLabel}] Staff override: **${winnerName}** avanza. Eliminado: **${loserName}**.`,
    match_id: matchId, tournament_id: match.tournamentId || null,
    timestamp: FieldValue.serverTimestamp(), deleted: false,
  });

  /* Bracket advancement */
  if (!match.tournamentId) return NextResponse.json({ success: true, message: `Ganador: ${winnerName}` });

  const tournamentRef  = adminDb.collection('tournaments').doc(match.tournamentId as string);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) return NextResponse.json({ success: true });

  const tournament = tournamentSnap.data()!;
  const capacity   = (tournament.capacity ?? 2) as number;
  const entryFee   = (tournament.entry_fee ?? 0) as number;

  const allMatchesSnap = await adminDb.collection('matches')
    .where('tournamentId', '==', match.tournamentId).get();
  const allMatches = allMatchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>));

  const unfinished = allMatches.filter(m => m.id !== matchId && m.status !== 'FINISHED');
  const isFinal    = unfinished.length === 0 && allMatches.length >= capacity / 2;

  if (isFinal && capacity > 1) {
    const PRIZE_DIST: Record<number, number[]> = {
      2:[100], 4:[100], 6:[100], 8:[70,30], 12:[60,30,10],
      16:[70,30], 32:[60,25,15], 64:[50,25,15,10],
    };
    const distPcts = PRIZE_DIST[capacity] ?? [100];
    const pool     = Math.floor(capacity * entryFee * 0.9);
    const prizeWinners = [winnerId, loserId].filter(Boolean);

    const batch = adminDb.batch();
    if (entryFee > 0) {
      distPcts.forEach((pct, i) => {
        const w = prizeWinners[i]; if (!w) return;
        batch.update(adminDb.collection('usuarios').doc(w), {
          number:           FieldValue.increment(Math.floor(pool * pct / 100)),
          titulos:          FieldValue.increment(i === 0 ? 1 : 0),
          partidos_ganados: FieldValue.increment(i === 0 ? 1 : 0),
          partidos_jugados: FieldValue.increment(1),
        });
      });
    }
    batch.update(tournamentRef, { status: 'FINISHED', winner_uid: winnerId });
    await batch.commit();
  } else if (!isFinal) {
    const currentRound = (match.round as string) ?? 'round_1';
    const roundMatches = allMatches.filter(m => m.round === currentRound);
    const updatedRound = roundMatches.map(m => m.id === matchId ? { ...m, winner: winnerId, status: 'FINISHED' } : m);
    const allRoundDone = updatedRound.every(m => m.status === 'FINISHED');

    if (allRoundDone) {
      const roundWinners = updatedRound.map(m => m.winner as string).filter(Boolean);
      if (roundWinners.length >= 2) {
        const roundNum  = parseInt(currentRound.replace(/\D/g, '') || '1', 10);
        const nextRound = `round_${roundNum + 1}`;

        const usernameMap: Record<string, string> = {};
        await Promise.all(roundWinners.map(async (wuid) => {
          const snap = await adminDb.collection('usuarios').doc(wuid).get();
          usernameMap[wuid] = snap.data()?.nombre || wuid.slice(0, 10);
        }));

        const batch = adminDb.batch();
        for (let i = 0; i + 1 < roundWinners.length; i += 2) {
          const ref = adminDb.collection('matches').doc();
          batch.set(ref, {
            tournamentId: match.tournamentId,
            p1: roundWinners[i], p2: roundWinners[i + 1],
            p1_username: usernameMap[roundWinners[i]],
            p2_username: usernameMap[roundWinners[i + 1]],
            score: '', winner: null, status: 'WAITING', round: nextRound,
            game: tournament.game || '', entry_fee: entryFee,
            prize_pool: tournament.prize_pool || 0,
            created_at: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    }
  }

  return NextResponse.json({ success: true, message: `Ganador: ${winnerName}. Bracket actualizado.` });
}
