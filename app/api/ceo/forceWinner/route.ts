/**
 * app/api/ceo/forceWinner/route.ts
 * CEO-only endpoint to forcefully set a match winner and advance the bracket.
 * Replicates the full confirmResult logic, bypassing player ownership checks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

export async function POST(req: NextRequest) {
  /* ── Auth: CEO only ─────────────────────────────────────── */
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer '))
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  let callerUid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }
  if (callerUid !== CEO_UID)
    return NextResponse.json({ error: 'Solo el CEO puede usar esta función.' }, { status: 403 });

  /* ── Parse body ─────────────────────────────────────────── */
  let body: { matchId?: unknown; winnerSide?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Body inválido.' }, { status: 400 }); }

  const matchId    = typeof body.matchId    === 'string' ? body.matchId.trim()    : '';
  const winnerSide = typeof body.winnerSide === 'string' ? body.winnerSide.trim() : ''; // 'p1' | 'p2'

  if (!matchId || !['p1', 'p2'].includes(winnerSide))
    return NextResponse.json({ error: 'matchId y winnerSide ("p1" | "p2") son requeridos.' }, { status: 400 });

  /* ── Fetch match ────────────────────────────────────────── */
  const matchRef  = adminDb.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists)
    return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });

  const match = matchSnap.data()!;
  if (match.status === 'FINISHED')
    return NextResponse.json({ error: 'El match ya está finalizado.' }, { status: 400 });

  const winnerId = winnerSide === 'p1' ? (match.p1 as string) : (match.p2 as string);
  const loserId  = winnerSide === 'p1' ? (match.p2 as string) : (match.p1 as string);

  const [winnerSnap, loserSnap] = await Promise.all([
    adminDb.collection('usuarios').doc(winnerId).get(),
    adminDb.collection('usuarios').doc(loserId).get(),
  ]);
  const winnerName = winnerSnap.data()?.nombre ?? 'Jugador';
  const loserName  = loserSnap.data()?.nombre  ?? 'Rival';

  /* ── Mark match FINISHED ────────────────────────────────── */
  await matchRef.update({
    status:       'FINISHED',
    winner:       winnerId,
    score:        match.score || 'CEO_OVERRIDE',
    ceo_override: true,
    updated_at:   FieldValue.serverTimestamp(),
  });

  /* ── Cantina notification ───────────────────────────────── */
  const salaLabel = match.tournamentId ? `Sala #${(match.tournamentId as string).slice(-5).toUpperCase()}` : 'la sala';
  await adminDb.collection('cantina_messages').add({
    uid: 'BOT_LFA', nombre: '🤖 BOT LFA', avatar_url: null, rol: 'bot',
    texto: `⚡ [${salaLabel}] CEO override: **${winnerName}** avanza. Eliminado: **${loserName}**.`,
    match_id: matchId, tournament_id: match.tournamentId || null,
    timestamp: FieldValue.serverTimestamp(), deleted: false,
  });

  /* ── Bracket advancement (same logic as confirmResult) ───── */
  const tournamentRef  = adminDb.collection('tournaments').doc(match.tournamentId);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) return NextResponse.json({ success: true });

  const tournament  = tournamentSnap.data()!;
  const capacity    = (tournament.capacity ?? 2) as number;
  const entryFee    = (tournament.entry_fee ?? 0) as number;

  const allMatchesSnap = await adminDb.collection('matches')
    .where('tournamentId', '==', match.tournamentId).get();
  const allMatches = allMatchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>));

  // After this match is finished, how many are still pending?
  const unfinished = allMatches.filter(m => m.id !== matchId && m.status !== 'FINISHED');
  const isFinal    = unfinished.length === 0 && allMatches.length >= capacity / 2;

  if (isFinal && capacity > 1) {
    /* ── Prize distribution ─────────────────────────────── */
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
        const amount = Math.floor(pool * pct / 100);
        batch.update(adminDb.collection('usuarios').doc(w), {
          number:           FieldValue.increment(amount),
          titulos:          FieldValue.increment(i === 0 ? 1 : 0),
          partidos_ganados: FieldValue.increment(i === 0 ? 1 : 0),
          partidos_jugados: FieldValue.increment(1),
        });
      });
    } else {
      if (prizeWinners[0]) batch.update(adminDb.collection('usuarios').doc(prizeWinners[0]), {
        puntos_gratis: FieldValue.increment(50), partidos_ganados: FieldValue.increment(1), partidos_jugados: FieldValue.increment(1),
      });
    }
    batch.update(tournamentRef, { status: 'FINISHED', winner_uid: winnerId });
    await batch.commit();

  } else if (!isFinal) {
    /* ── Advance to next round ────────────────────────── */
    const currentRound  = (match.round as string) ?? 'round_1';
    const roundMatches  = allMatches.filter(m => m.round === currentRound);
    const updatedRound  = roundMatches.map(m => m.id === matchId ? { ...m, winner: winnerId, status: 'FINISHED' } : m);
    const allRoundDone  = updatedRound.every(m => m.status === 'FINISHED');

    if (allRoundDone) {
      const roundWinners = updatedRound.map(m => m.winner as string).filter(Boolean);
      if (roundWinners.length >= 2) {
        const roundNum  = parseInt(currentRound.replace(/\D/g, '') || '1', 10);
        const nextRound = currentRound === 'final' ? 'final' : `round_${roundNum + 1}`;

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
            p1_username: usernameMap[roundWinners[i]] || roundWinners[i].slice(0, 10),
            p2_username: usernameMap[roundWinners[i + 1]] || roundWinners[i + 1].slice(0, 10),
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

  return NextResponse.json({ success: true, message: `Ganador forzado: ${winnerName}. Bracket actualizado.` });
}
