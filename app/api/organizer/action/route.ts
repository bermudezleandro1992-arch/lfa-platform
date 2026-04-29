import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// ─── Prize distribution mirrors functions/index.js ────────────────────────────
const PRIZE_DISTRIBUTION: Record<number, number[]> = {
  2:  [100],
  4:  [100],
  6:  [100],
  8:  [70, 30],
  16: [70, 30],
  32: [60, 25, 15],
  64: [50, 25, 15, 10],
};

function calcPrizePool(capacity: number, entry_fee: number) {
  return Math.floor(capacity * entry_fee * 0.9);
}

function calcPrizes(capacity: number, entry_fee: number) {
  if (entry_fee === 0) return [{ place: 1, label: "🥇 1°", percentage: 100, coins: 0 }];
  const pot = calcPrizePool(capacity, entry_fee);
  if (capacity <= 6) return [{ place: 1, label: "🥇 1°", percentage: 100, coins: pot }];
  if (capacity <= 16) return [
    { place: 1, label: "🥇 1°", percentage: 70, coins: Math.floor(pot * 0.70) },
    { place: 2, label: "🥈 2°", percentage: 30, coins: Math.floor(pot * 0.30) },
  ];
  if (capacity <= 32) return [
    { place: 1, label: "🥇 1°", percentage: 60, coins: Math.floor(pot * 0.60) },
    { place: 2, label: "🥈 2°", percentage: 25, coins: Math.floor(pot * 0.25) },
    { place: 3, label: "🥉 3°", percentage: 15, coins: Math.floor(pot * 0.15) },
  ];
  return [
    { place: 1, label: "🥇 1°", percentage: 50, coins: Math.floor(pot * 0.50) },
    { place: 2, label: "🥈 2°", percentage: 25, coins: Math.floor(pot * 0.25) },
    { place: 3, label: "🥉 3°", percentage: 15, coins: Math.floor(pot * 0.15) },
    { place: 4, label: "4°",    percentage: 10, coins: Math.floor(pot * 0.10) },
  ];
}

// ─── Bracket advancement (mirrors advanceBracket in functions/index.js) ───────

async function advanceBracket(
  matchId:      string,
  winnerId:     string,
  tournamentId: string,
  tournament:   FirebaseFirestore.DocumentData
) {
  const db = adminDb;

  // Mark match as FINISHED with winner
  await db.collection("matches").doc(matchId).update({
    winner: winnerId,
    status: "FINISHED",
  });

  const capacity: number = tournament.capacity ?? 2;
  const entryFee: number = tournament.entry_fee ?? 0;
  const isFree: boolean  = entryFee === 0;

  // Get all matches for this tournament
  const allMatchesSnap = await db
    .collection("matches")
    .where("tournamentId", "==", tournamentId)
    .get();

  const allMatches = allMatchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  // Determine if this was the final match
  const unfinished = allMatches.filter(
    m => m.id !== matchId && m.status !== "FINISHED"
  );
  const isFinal = unfinished.length === 0 && allMatches.length >= capacity / 2;

  if (isFinal && capacity > 1) {
    // ── Distribute prizes ───────────────────────────────────────────────────
    const finishedMatches = [...allMatches.filter(m => m.id !== matchId), { id: matchId, winner: winnerId }];
    const winners: string[] = [];

    // Winner of the last match is always 1st place
    winners.push(winnerId);

    // Find runner-up (loser of the final)
    const finalMatch = allMatches.find(m => m.id === matchId) as any;
    if (finalMatch) {
      const loser = finalMatch.p1 === winnerId ? finalMatch.p2 : finalMatch.p1;
      if (loser && loser !== "TBD") winners.push(loser);
    }

    const distPcts = PRIZE_DISTRIBUTION[capacity] ?? [100];

    if (!isFree && entryFee > 0) {
      const pool = calcPrizePool(capacity, entryFee);
      const batch = db.batch();

      distPcts.forEach((pct, i) => {
        const uid = winners[i];
        if (!uid) return;
        const amount = Math.floor(pool * pct / 100);
        batch.update(db.collection("usuarios").doc(uid), {
          number:                FieldValue.increment(amount),
          titulos:               FieldValue.increment(i === 0 ? 1 : 0),
          partidos_ganados:      FieldValue.increment(i === 0 ? 1 : 0),
          partidos_jugados:      FieldValue.increment(1),
          torneos_pagos_jugados: FieldValue.increment(1),
          fair_play:             FieldValue.increment(i === 0 ? 2 : 0),
        });
      });

      batch.update(db.collection("tournaments").doc(tournamentId), {
        status:     "FINISHED",
        winner_uid: winners[0] ?? null,
      });

      await batch.commit();
    } else {
      // Free tournament: award LFA store points (puntos_gratis) to winner
      const batch = db.batch();
      if (winners[0]) {
        batch.update(db.collection("usuarios").doc(winners[0]), {
          puntos_gratis:    FieldValue.increment(50),
          partidos_ganados: FieldValue.increment(1),
          partidos_jugados: FieldValue.increment(1),
          fair_play:        FieldValue.increment(2),
        });
      }
      if (winners[1]) {
        batch.update(db.collection("usuarios").doc(winners[1]), {
          partidos_jugados:  FieldValue.increment(1),
          partidos_perdidos: FieldValue.increment(1),
        });
      }
      batch.update(db.collection("tournaments").doc(tournamentId), {
        status:     "FINISHED",
        winner_uid: winners[0] ?? null,
      });
      await batch.commit();
    }
    return;
  }

  // ── Not the final: create next round match if all same-round matches done ──
  const currentRound = (allMatches.find(m => m.id === matchId) as any)?.round ?? "RONDA_1";

  const roundMatches = allMatches.filter(m => m.round === currentRound || m.id === matchId);
  const updatedRoundMatches = roundMatches.map(m =>
    m.id === matchId ? { ...m, winner: winnerId, status: "FINISHED" } : m
  );

  const allRoundDone = updatedRoundMatches.every(m => m.status === "FINISHED" || m.id === matchId);

  if (allRoundDone) {
    // Collect winners from this round
    const roundWinners = updatedRoundMatches
      .map(m => m.winner)
      .filter(Boolean) as string[];

    if (roundWinners.length >= 2) {
      // Extract round number and increment
      const roundNum = parseInt(currentRound.replace(/\D/g, "") || "1", 10);
      const nextRound = `RONDA_${roundNum + 1}`;

      const batch = db.batch();
      for (let i = 0; i + 1 < roundWinners.length; i += 2) {
        const ref = db.collection("matches").doc();
        batch.set(ref, {
          tournamentId,
          p1:     roundWinners[i],
          p2:     roundWinners[i + 1],
          score:  "",
          winner: null,
          status: "WAITING",
          round:  nextRound,
          created_at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  let callerUid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  // ── Verify organizer role ─────────────────────────────────────────────────
  const CEO_UID = "2bOrFxTAcPgFPoHKJHQfYxoQJpw1";
  const userSnap = await adminDb.collection("usuarios").doc(callerUid).get();
  if (!userSnap.exists || (userSnap.data()?.rol !== "organizador" && callerUid !== CEO_UID)) {
    return NextResponse.json({ error: "Sin permiso de organizador" }, { status: 403 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: {
    action:        "avanzar" | "expulsar" | "sustituir" | "agregar_jugador";
    tournamentId:  string;
    matchId?:      string;
    playerId:      string;
    substituteId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { action, tournamentId, matchId, playerId, substituteId } = body;

  if (!action || !tournamentId || !playerId) {
    return NextResponse.json({ error: "Faltan parámetros requeridos" }, { status: 400 });
  }
  if (action !== "agregar_jugador" && !matchId) {
    return NextResponse.json({ error: "Falta matchId" }, { status: 400 });
  }
  if (action !== "agregar_jugador" && !matchId) {
    return NextResponse.json({ error: "Falta matchId" }, { status: 400 });
  }

  // Validate string inputs to prevent injection
  for (const val of [tournamentId, matchId ?? "", playerId, substituteId ?? ""]) {
    if (val && !/^[\w\-]{1,128}$/.test(val)) {
      return NextResponse.json({ error: "Parámetro inválido" }, { status: 400 });
    }
  }

  // ── Fetch tournament and verify ownership ───────────────────────────────────────
  const tSnap = await adminDb.collection("tournaments").doc(tournamentId).get();
  if (!tSnap.exists) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }
  const tournament = tSnap.data()!;

  if (tournament.organizador_uid !== callerUid && callerUid !== CEO_UID) {
    return NextResponse.json({ error: "No sos el organizador de este torneo" }, { status: 403 });
  }
  if (tournament.tipo !== "organizado") {
    return NextResponse.json({ error: "Acción solo disponible en torneos organizados" }, { status: 400 });
  }

  // ── Fetch match ───────────────────────────────────────────────────────────
  // agregar_jugador doesn't need a match
  if (action === "agregar_jugador") {
    if (tournament.players.includes(playerId)) {
      return NextResponse.json({ error: "El jugador ya está inscripto" }, { status: 400 });
    }
    if (tournament.players.length >= tournament.capacity) {
      return NextResponse.json({ error: "El torneo está lleno" }, { status: 400 });
    }
    const pSnap = await adminDb.collection("usuarios").doc(playerId).get();
    if (!pSnap.exists) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    await adminDb.collection("tournaments").doc(tournamentId).update({
      players: FieldValue.arrayUnion(playerId),
    });
    return NextResponse.json({ ok: true });
  }

  const mSnap = await adminDb.collection("matches").doc(matchId!).get();
  if (!mSnap.exists) {
    return NextResponse.json({ error: "Partido no encontrado" }, { status: 404 });
  }
  const match = mSnap.data()!;

  if (match.tournamentId !== tournamentId) {
    return NextResponse.json({ error: "El partido no pertenece a este torneo" }, { status: 400 });
  }

  // ── Execute action ────────────────────────────────────────────────────────
  try {
    if (action === "avanzar") {
      // playerId is the winner
      if (match.p1 !== playerId && match.p2 !== playerId) {
        return NextResponse.json({ error: "El jugador no participa en este partido" }, { status: 400 });
      }
      if (match.status === "FINISHED") {
        return NextResponse.json({ error: "Este partido ya finalizó" }, { status: 400 });
      }
      await advanceBracket(matchId!, playerId, tournamentId, tournament);

    } else if (action === "expulsar") {
      // Opponent of the expelled player wins by default
      if (match.p1 !== playerId && match.p2 !== playerId) {
        return NextResponse.json({ error: "El jugador no participa en este partido" }, { status: 400 });
      }
      if (match.status === "FINISHED") {
        return NextResponse.json({ error: "Este partido ya finalizó" }, { status: 400 });
      }
      const opponent = match.p1 === playerId ? match.p2 : match.p1;
      if (!opponent || opponent === "TBD") {
        return NextResponse.json({ error: "No hay rival para avanzar" }, { status: 400 });
      }

      // Remove expelled player from tournament
      await adminDb.collection("tournaments").doc(tournamentId).update({
        players: tournament.players.filter((p: string) => p !== playerId),
      });

      // Refund if paid tournament
      if ((tournament.entry_fee ?? 0) > 0) {
        await adminDb.collection("usuarios").doc(playerId).update({
          number: FieldValue.increment(tournament.entry_fee),
        });
      }

      await advanceBracket(matchId, opponent, tournamentId, tournament);

    } else if (action === "sustituir") {
      if (!substituteId) {
        return NextResponse.json({ error: "Falta el ID del sustituto" }, { status: 400 });
      }
      if (match.p1 !== playerId && match.p2 !== playerId) {
        return NextResponse.json({ error: "El jugador no participa en este partido" }, { status: 400 });
      }
      if (match.status === "FINISHED") {
        return NextResponse.json({ error: "Este partido ya finalizó" }, { status: 400 });
      }

      // Verify substitute exists
      const subSnap = await adminDb.collection("usuarios").doc(substituteId).get();
      if (!subSnap.exists) {
        return NextResponse.json({ error: "Usuario sustituto no encontrado" }, { status: 404 });
      }

      const batch = adminDb.batch();

      // Update match
      const field = match.p1 === playerId ? "p1" : "p2";
      batch.update(adminDb.collection("matches").doc(matchId), { [field]: substituteId });

      // Update tournament players array
      const updatedPlayers = tournament.players
        .filter((p: string) => p !== playerId)
        .concat(substituteId);
      batch.update(adminDb.collection("tournaments").doc(tournamentId), {
        players: updatedPlayers,
      });

      await batch.commit();
    } else {
      return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[organizer/action]", e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
