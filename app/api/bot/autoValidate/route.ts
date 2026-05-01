import { NextRequest, NextResponse } from 'next/server';
import { adminDb }                   from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';
import {
  FPS_CONFIRM_BONUS,
  FREE_TOURNAMENT_POINTS_WIN,
  FREE_TOURNAMENT_POINTS_PLAY,
} from '@/lib/constants';

/**
 * POST /api/bot/autoValidate
 *
 * El bot externo (bot-ia/main.py) llama este endpoint cada minuto.
 * Busca partidos con status=PENDING_RESULT cuyo dispute_deadline ya venció
 * y los auto-valida: el reportador es el ganador, el rival pierde por
 * no responder. Se aplican ajustes de Fair Play.
 *
 * Auth: Bearer <BOT_SECRET>
 */
export async function POST(req: NextRequest) {
  const botSecret = process.env.BOT_SECRET;
  if (!botSecret) {
    return NextResponse.json({ error: 'BOT_SECRET no configurado.' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== botSecret) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  try {
    const now = Date.now();

    // Buscar matches con status PENDING_RESULT (single-field where)
    const pendingSnap = await adminDb
      .collection('matches')
      .where('status', '==', 'PENDING_RESULT')
      .limit(50)
      .get();

    if (pendingSnap.empty) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    let processed = 0;

    for (const matchDoc of pendingSnap.docs) {
      const match    = matchDoc.data();
      const deadline = match.dispute_deadline?.toMillis?.() ?? 0;

      // Solo procesar los que ya vencieron
      if (deadline > now) continue;

      const matchRef  = matchDoc.ref;
      const winnerId  = match.reported_by as string;
      const loserId   = match.p1 === winnerId ? match.p2 : match.p1;
      const entryFee  = (match.entry_fee ?? 0) as number;
      const tournaId  = match.tournamentId as string | undefined;

      try {
        // 1. Finalizar el match
        await matchRef.update({
          status:       'FINISHED',
          winner:       winnerId,
          confirmed_by: 'BOT_AUTO',
          updated_at:   FieldValue.serverTimestamp(),
        });

        // 2. Mensaje BOT en match_chat
        const winnerSnap = await adminDb.collection('usuarios').doc(winnerId).get();
        const winnerName = winnerSnap.data()?.nombre ?? 'Jugador';

        await adminDb.collection('match_chat').add({
          matchId:       matchDoc.id,
          tournamentId:  tournaId || null,
          uid:           'BOT_LFA',
          nombre:        '🤖 BOT LFA',
          avatar_url:    null,
          rol:           'bot',
          texto:         `⏱️ Tiempo agotado. El rival no respondió. **${winnerName}** gana por auto-validación del BOT.`,
          is_bot_result: true,
          timestamp:     FieldValue.serverTimestamp(),
        });

        // 3. Fair Play: loser pierde FPS por no responder
        const loserSnap = await adminDb.collection('usuarios').doc(loserId).get();
        const loserFps  = (loserSnap.data()?.fair_play ?? 100) as number;
        const newFps    = Math.max(0, loserFps - FPS_CONFIRM_BONUS);
        await adminDb.collection('usuarios').doc(loserId).update({
          fair_play: newFps,
        });

        // 4. Distribuir premios (si es final de torneo y hay entry fee)
        if (tournaId) {
          const tournamentSnap = await adminDb.collection('tournaments').doc(tournaId).get();
          if (tournamentSnap.exists) {
            const tournament  = tournamentSnap.data()!;
            const capacity    = (tournament.capacity ?? 2) as number;
            const tEntryFee   = (tournament.entry_fee ?? entryFee) as number;

            const allMatchesSnap = await adminDb
              .collection('matches')
              .where('tournamentId', '==', tournaId)
              .get();
            const allMatches = allMatchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

            // Check se calculó ANTES del update, usar datos frescos
            const unfinished = allMatches.filter(
              (m: any) => m.id !== matchDoc.id && m.status !== 'FINISHED'
            );
            const isFinal = unfinished.length === 0 && allMatches.length >= capacity / 2;

            if (isFinal && capacity > 1) {
              const PRIZE_DISTRIBUTION: Record<number, number[]> = {
                2:[100], 4:[100], 6:[100], 8:[70,30], 12:[60,30,10],
                16:[70,30], 32:[60,25,15], 64:[50,25,15,10],
              };
              const distPcts = PRIZE_DISTRIBUTION[capacity] ?? [100];
              const pool     = Math.floor(capacity * tEntryFee * 0.9);
              const winners  = [winnerId, loserId].filter(Boolean);

              const prizeBatch = adminDb.batch();
              if (tEntryFee > 0) {
                distPcts.forEach((pct: number, i: number) => {
                  const w = winners[i]; if (!w) return;
                  const amount = Math.floor(pool * pct / 100);
                  prizeBatch.update(adminDb.collection('usuarios').doc(w), {
                    number:           FieldValue.increment(amount),
                    titulos:          FieldValue.increment(i === 0 ? 1 : 0),
                    partidos_ganados: FieldValue.increment(i === 0 ? 1 : 0),
                    partidos_jugados: FieldValue.increment(1),
                  });
                });
              } else {
                // Free tournament: Puntos de Tienda
                prizeBatch.update(adminDb.collection('usuarios').doc(winners[0]), {
                  puntos_gratis:    FieldValue.increment(FREE_TOURNAMENT_POINTS_WIN),
                  partidos_ganados: FieldValue.increment(1),
                  partidos_jugados: FieldValue.increment(1),
                });
                if (winners[1]) prizeBatch.update(adminDb.collection('usuarios').doc(winners[1]), {
                  puntos_gratis:    FieldValue.increment(FREE_TOURNAMENT_POINTS_PLAY),
                  partidos_jugados: FieldValue.increment(1),
                });
              }
              prizeBatch.update(adminDb.collection('tournaments').doc(tournaId), {
                status: 'FINISHED', winner_uid: winnerId,
              });
              await prizeBatch.commit();
            }
          }
        }

        processed++;
      } catch {
        // Continuar con el siguiente match si falla uno
      }
    }

    return NextResponse.json({ success: true, processed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
