import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid     = decoded.uid;

    const { matchId } = await req.json();
    if (!matchId) return NextResponse.json({ error: 'matchId requerido.' }, { status: 400 });

    const matchRef  = adminDb.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;

    if (match.p1 !== uid && match.p2 !== uid)
      return NextResponse.json({ error: 'No participás en este match.' }, { status: 403 });
    if (match.status !== 'PENDING_RESULT')
      return NextResponse.json({ error: 'No hay resultado pendiente de confirmación.' }, { status: 400 });
    if (match.reported_by === uid)
      return NextResponse.json({ error: 'No podés confirmar tu propio reporte.' }, { status: 400 });

    const winnerId   = match.reported_by as string;
    const loserId    = match.p1 === winnerId ? match.p2 : match.p1;
    const winnerName = (await adminDb.collection('usuarios').doc(winnerId).get()).data()?.nombre ?? 'Jugador';
    const loserName  = (await adminDb.collection('usuarios').doc(loserId).get()).data()?.nombre ?? 'Rival';

    // Marcar match como FINISHED con el ganador
    await matchRef.update({
      status:     'FINISHED',
      winner:     winnerId,
      confirmed_by: uid,
      updated_at: FieldValue.serverTimestamp(),
    });

    // Publicar en cantina
    const salaLabel = match.tournamentId ? `Sala #${(match.tournamentId as string).slice(-5).toUpperCase()}` : 'la sala';
    await adminDb.collection('cantina_messages').add({
      uid:        'BOT_LFA',
      nombre:     '🤖 BOT LFA',
      avatar_url: null,
      rol:        'bot',
      texto:      `✅ [${salaLabel}] **${loserName}** confirmó la victoria de **${winnerName}**. Marcador: ${match.score || '?'}. ¡Resultado validado!`,
      match_id:   matchId,
      tournament_id: match.tournamentId || null,
      timestamp:  FieldValue.serverTimestamp(),
      deleted:    false,
    });

    // Advance bracket: distribute prizes if final, else create next round
    const tournamentSnap = await adminDb.collection('tournaments').doc(match.tournamentId).get();
    if (!tournamentSnap.exists) return NextResponse.json({ success: true });
    const tournament = tournamentSnap.data()!;
    const capacity: number = tournament.capacity ?? 2;
    const entryFee: number = tournament.entry_fee ?? 0;

    const allMatchesSnap = await adminDb.collection('matches').where('tournamentId', '==', match.tournamentId).get();
    const allMatches = allMatchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const unfinished = allMatches.filter((m: any) => m.id !== matchId && m.status !== 'FINISHED');
    const isFinal = unfinished.length === 0 && allMatches.length >= capacity / 2;

    if (isFinal && capacity > 1) {
      const PRIZE_DISTRIBUTION: Record<number, number[]> = {
        2:[100], 4:[100], 6:[100], 8:[70,30], 12:[60,30,10], 16:[70,30], 32:[60,25,15], 64:[50,25,15,10],
      };
      const distPcts = PRIZE_DISTRIBUTION[capacity] ?? [100];
      const pool = Math.floor(capacity * entryFee * 0.9);
      const finalMatch = allMatches.find((m: any) => m.id === matchId);
      const loser = finalMatch?.p1 === winnerId ? finalMatch?.p2 : finalMatch?.p1;
      const winners = [winnerId, loser].filter(Boolean);

      const batch = adminDb.batch();
      if (entryFee > 0) {
        distPcts.forEach((pct: number, i: number) => {
          const w = winners[i]; if (!w) return;
          const amount = Math.floor(pool * pct / 100);
          batch.update(adminDb.collection('usuarios').doc(w), {
            number: FieldValue.increment(amount),
            titulos: FieldValue.increment(i === 0 ? 1 : 0),
            partidos_ganados: FieldValue.increment(i === 0 ? 1 : 0),
            partidos_jugados: FieldValue.increment(1),
          });
        });
      } else {
        if (winners[0]) batch.update(adminDb.collection('usuarios').doc(winners[0]), {
          puntos_gratis: FieldValue.increment(50), partidos_ganados: FieldValue.increment(1), partidos_jugados: FieldValue.increment(1),
        });
      }
      batch.update(adminDb.collection('tournaments').doc(match.tournamentId), {
        status: 'FINISHED', winner_uid: winnerId,
      });
      await batch.commit();
    } else if (!isFinal) {
      const currentRound = (allMatches.find((m: any) => m.id === matchId) as any)?.round ?? 'round_1';
      const roundMatches = allMatches.filter((m: any) => m.round === currentRound);
      const updatedRound = roundMatches.map((m: any) => m.id === matchId ? { ...m, winner: winnerId, status: 'FINISHED' } : m);
      const allRoundDone = updatedRound.every((m: any) => m.status === 'FINISHED');
      if (allRoundDone) {
        const roundWinners = updatedRound.map((m: any) => m.winner).filter(Boolean);
        if (roundWinners.length >= 2) {
          const roundNum = parseInt(currentRound.replace(/\D/g, '') || '1', 10);
          const nextRound = currentRound === 'final' ? 'final' : `round_${roundNum + 1}`;
          const batch = adminDb.batch();
          for (let i = 0; i + 1 < roundWinners.length; i += 2) {
            const ref = adminDb.collection('matches').doc();
            batch.set(ref, {
              tournamentId: match.tournamentId,
              p1: roundWinners[i], p2: roundWinners[i + 1],
              score: '', winner: null, status: 'WAITING', round: nextRound,
              game: tournament.game || '', entry_fee: entryFee, prize_pool: tournament.prize_pool || 0,
              created_at: FieldValue.serverTimestamp(),
            });
          }
          await batch.commit();
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Resultado confirmado. ¡Gracias!' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
