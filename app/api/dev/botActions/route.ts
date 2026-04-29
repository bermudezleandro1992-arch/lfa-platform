import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

const BOT_NAMES = [
  'Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel',
  'India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa',
  'Quebec','Romeo','Sierra','Tango','Uniform','Victor','Whiskey','Xray',
  'Yankee','Zulu','Apex','Blaze','Cobra','Dagger','Eagle','Falcon',
];

const BOT_SCORES = ['3-0','3-1','3-2','2-0','2-1','4-1','4-2','5-2','1-0','2-0'];

/** Round labels in order for a given capacity */
function getRounds(capacity: number): string[] {
  const total = Math.log2(capacity);
  const rounds: string[] = [];
  for (let r = 1; r < total; r++) rounds.push(`round_${r}`);
  rounds.push('final');
  return rounds;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ensure bot user docs exist in `usuarios`. Returns bot UIDs in order. */
async function ensureBotUsers(startIdx: number, count: number): Promise<{ uid: string; name: string }[]> {
  const bots: { uid: string; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const namePart = BOT_NAMES[(startIdx + i) % BOT_NAMES.length];
    const uid      = `bot_${namePart.toLowerCase()}`;
    const ref      = adminDb.collection('usuarios').doc(uid);
    const snap     = await ref.get();
    if (!snap.exists) {
      await ref.set({
        nombre:       `BOT ${namePart}`,
        email:        `bot.${namePart.toLowerCase()}@somoslfa.bot`,
        ea_id:        `BOT-${namePart.toUpperCase()}`,
        plataforma_id:`BOT-${namePart.toUpperCase()}`,
        id_consola:   `BOT-${namePart.toUpperCase()}`,
        region:       'GLOBAL',
        number:       0,
        fair_play:    100,
        titulos:      0,
        partidos_jugados: 0,
        rol:          'bot',
        is_bot:       true,
        created_at:   FieldValue.serverTimestamp(),
      });
    }
    bots.push({ uid, name: `BOT ${namePart}` });
  }
  return bots;
}

export async function POST(req: NextRequest) {
  try {
    /* ── Auth: CEO only ── */
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (decoded.uid !== CEO_UID) {
      return NextResponse.json({ error: 'Solo el CEO puede usar esta función.' }, { status: 403 });
    }

    const { action, tournamentId } = await req.json();
    if (!action || !tournamentId) {
      return NextResponse.json({ error: 'action y tournamentId son requeridos.' }, { status: 400 });
    }

    const tournamentRef  = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();
    if (!tournamentSnap.exists) {
      return NextResponse.json({ error: 'Torneo no encontrado.' }, { status: 404 });
    }
    const t = tournamentSnap.data()!;

    /* ══════════════════════════════════════════════════════════
       ACTION: fillWithBots
       Fills empty slots with bot players and generates round_1
    ══════════════════════════════════════════════════════════ */
    if (action === 'fillWithBots') {
      if (t.status !== 'OPEN') {
        return NextResponse.json({ error: `Torneo en estado "${t.status}", debe estar OPEN.` }, { status: 400 });
      }

      const currentPlayers: string[] = t.players || [];
      const capacity: number         = t.capacity;
      const needed                   = capacity - currentPlayers.length;

      if (needed < 0) {
        return NextResponse.json({ error: 'La sala supera la capacidad.' }, { status: 400 });
      }

      /* Create bot user docs */
      const bots    = await ensureBotUsers(0, needed);
      const botUids = bots.map(b => b.uid);
      const allPlayers = shuffle([...currentPlayers, ...botUids]);

      /* Get usernames for existing real players */
      const realPlayerDocs = await Promise.all(
        currentPlayers.map(uid => adminDb.collection('usuarios').doc(uid).get()),
      );
      const usernameMap: Record<string, string> = {};
      realPlayerDocs.forEach(snap => {
        if (snap.exists) {
          const d = snap.data()!;
          usernameMap[snap.id] = d.nombre || snap.id.slice(0, 10);
        }
      });
      bots.forEach(b => { usernameMap[b.uid] = b.name; });

      /* Generate round_1 matches */
      const batch    = adminDb.batch();
      const matchIds: string[] = [];

      for (let i = 0; i < allPlayers.length; i += 2) {
        const p1Uid = allPlayers[i];
        const p2Uid = allPlayers[i + 1];
        const matchRef = adminDb.collection('matches').doc();
        matchIds.push(matchRef.id);
        batch.set(matchRef, {
          p1:          p1Uid,
          p2:          p2Uid,
          p1_username: usernameMap[p1Uid] || p1Uid.slice(0, 10),
          p2_username: usernameMap[p2Uid] || p2Uid.slice(0, 10),
          p1_ea_id:    p1Uid.startsWith('bot_') ? `BOT-${p1Uid.replace('bot_', '').toUpperCase()}` : '',
          p2_ea_id:    p2Uid.startsWith('bot_') ? `BOT-${p2Uid.replace('bot_', '').toUpperCase()}` : '',
          score:       '',
          winner:      null,
          status:      'WAITING',
          round:       'round_1',
          tournamentId,
          game:        t.game  || '',
          entry_fee:   t.entry_fee  || 0,
          prize_pool:  t.prize_pool || 0,
          created_at:  FieldValue.serverTimestamp(),
        });
      }

      /* Update tournament */
      batch.update(tournamentRef, {
        players:       allPlayers,
        status:        'ACTIVE',
        current_round: 'round_1',
        match_ids:     matchIds,
        started_at:    FieldValue.serverTimestamp(),
      });

      await batch.commit();
      return NextResponse.json({
        success: true,
        message: `${needed} bot(s) añadidos. Sala ACTIVA. Round_1: ${matchIds.length} matches generados.`,
        botsAdded:      needed,
        matchesCreated: matchIds.length,
      });
    }

    /* ══════════════════════════════════════════════════════════
       ACTION: advanceRound
       Auto-resolves all WAITING matches in the current round,
       then creates next-round matches with the winners.
    ══════════════════════════════════════════════════════════ */
    if (action === 'advanceRound') {
      if (t.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'El torneo no está ACTIVE.' }, { status: 400 });
      }

      const matchesSnap = await adminDb.collection('matches')
        .where('tournamentId', '==', tournamentId)
        .get();

      type MatchDoc = {
        id: string; p1: string; p2: string; status: string;
        winner: string | null; round: string; score: string;
        p1_username?: string; p2_username?: string;
        p1_ea_id?: string; p2_ea_id?: string;
        game?: string; entry_fee?: number; prize_pool?: number;
      };
      const allMatches: MatchDoc[] = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as MatchDoc));

      if (allMatches.length === 0) {
        return NextResponse.json({ error: 'No hay matches para este torneo.' }, { status: 400 });
      }

      /* Group by round */
      const byRound: Record<string, MatchDoc[]> = {};
      for (const m of allMatches) {
        byRound[m.round] = byRound[m.round] || [];
        byRound[m.round].push(m);
      }

      const capacity   = (t.players as string[]).length;
      const roundOrder = getRounds(capacity);

      /* Find the current active round */
      let currentRound: string | null = null;
      for (const round of roundOrder) {
        const rMatches = byRound[round] || [];
        const waiting  = rMatches.filter(m => m.status === 'WAITING' && m.p1 !== 'TBD' && m.p2 !== 'TBD');
        if (waiting.length > 0) { currentRound = round; break; }
      }

      if (!currentRound) {
        return NextResponse.json({
          error: 'No hay rondas con matches pendientes. El torneo puede estar terminado.',
        }, { status: 400 });
      }

      /* Auto-resolve waiting matches in current round */
      const currentMatches = byRound[currentRound].filter(m => m.status === 'WAITING');
      const batch          = adminDb.batch();
      const newWinners: { uid: string; p1name: string; p2name: string; p1uid: string; p2uid: string }[] = [];

      for (const match of currentMatches) {
        const p1wins   = Math.random() > 0.5;
        const winner   = p1wins ? match.p1 : match.p2;
        const baseScore = BOT_SCORES[Math.floor(Math.random() * BOT_SCORES.length)];
        const score    = p1wins ? baseScore : baseScore.split('-').reverse().join('-');

        newWinners.push({
          uid:    winner,
          p1name: match.p1_username || match.p1.slice(0, 10),
          p2name: match.p2_username || match.p2.slice(0, 10),
          p1uid:  match.p1,
          p2uid:  match.p2,
        });

        batch.update(adminDb.collection('matches').doc(match.id), {
          status:     'FINISHED',
          winner,
          score,
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      /* All winners from this round (already finished + just resolved) */
      const alreadyFinished = byRound[currentRound].filter(m => m.status === 'FINISHED');
      const allWinners = [
        ...alreadyFinished.map(m => m.winner!),
        ...newWinners.map(n => n.uid),
      ];

      /* Determine next round */
      const currentRoundIdx = roundOrder.indexOf(currentRound);
      const nextRound       = roundOrder[currentRoundIdx + 1] ?? null;
      let   tournamentFinished = false;
      let   nextRoundCreated   = false;

      const totalCurrentRoundMatches = byRound[currentRound].length;

      if (!nextRound) {
        /* Final was just resolved — mark tournament finished */
        const champion = allWinners[0];
        const champMatch = allMatches.find(m => m.p1 === champion || m.p2 === champion);
        const champName = champion
          ? (champMatch?.p1 === champion ? champMatch?.p1_username : champMatch?.p2_username) || champion.slice(0, 10)
          : '—';
        batch.update(tournamentRef, {
          status:        'FINISHED',
          winner:         champion,
          champion_name:  champName,
          finished_at:    FieldValue.serverTimestamp(),
        });
        tournamentFinished = true;

      } else if (allWinners.length === totalCurrentRoundMatches) {
        /* Round complete — create next round matches */
        for (let i = 0; i + 1 < allWinners.length; i += 2) {
          const p1Uid = allWinners[i];
          const p2Uid = allWinners[i + 1];

          /* Find username from previous match */
          const findName = (uid: string) => {
            const m = allMatches.find(x => x.p1 === uid || x.p2 === uid);
            return m ? (m.p1 === uid ? m.p1_username : m.p2_username) || uid.slice(0, 10) : uid.slice(0, 10);
          };

          const matchRef = adminDb.collection('matches').doc();
          batch.set(matchRef, {
            p1:          p1Uid,
            p2:          p2Uid,
            p1_username: findName(p1Uid),
            p2_username: findName(p2Uid),
            p1_ea_id:    p1Uid.startsWith('bot_') ? `BOT-${p1Uid.replace('bot_', '').toUpperCase()}` : '',
            p2_ea_id:    p2Uid.startsWith('bot_') ? `BOT-${p2Uid.replace('bot_', '').toUpperCase()}` : '',
            score:       '',
            winner:      null,
            status:      'WAITING',
            round:       nextRound,
            tournamentId,
            game:        t.game       || '',
            entry_fee:   t.entry_fee  || 0,
            prize_pool:  t.prize_pool || 0,
            created_at:  FieldValue.serverTimestamp(),
          });
        }
        batch.update(tournamentRef, { current_round: nextRound });
        nextRoundCreated = true;
      }

      await batch.commit();

      const nextMsg = !nextRound
        ? '🏆 TORNEO FINALIZADO.'
        : nextRoundCreated
          ? `Ronda ${nextRound} creada con ${allWinners.length / 2} matches.`
          : `Esperando que se completen los demás matches de ${currentRound}.`;

      return NextResponse.json({
        success: true,
        message: `${currentRound} avanzada. ${newWinners.length} match(es) resueltos. ${nextMsg}`,
        roundResolved:    currentRound,
        nextRound,
        tournamentFinished,
        nextRoundCreated,
        winnersCount:     newWinners.length,
      });
    }

    /* ══════════════════════════════════════════════════════════
       ACTION: resetBots
       Removes all bot players + matches, resets tournament to OPEN
    ══════════════════════════════════════════════════════════ */
    if (action === 'resetBots') {
      const currentPlayers: string[] = t.players || [];
      const realPlayers = currentPlayers.filter(uid => !uid.startsWith('bot_'));

      const matchesSnap = await adminDb.collection('matches')
        .where('tournamentId', '==', tournamentId)
        .get();

      const batch = adminDb.batch();
      matchesSnap.docs.forEach(d => batch.delete(d.ref));
      batch.update(tournamentRef, {
        players:       realPlayers,
        status:        'OPEN',
        current_round: null,
        match_ids:     [],
        winner:        null,
        champion_name: null,
      });

      await batch.commit();
      return NextResponse.json({
        success: true,
        message: `Sala reseteada. ${matchesSnap.size} match(es) eliminados. ${realPlayers.length} jugadores reales conservados.`,
        matchesDeleted:   matchesSnap.size,
        realPlayersKept:  realPlayers.length,
      });
    }

    return NextResponse.json({ error: 'Acción desconocida.' }, { status: 400 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
