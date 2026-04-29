import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const VALID_GAMES   = ["FC26", "EFOOTBALL"] as const;
const VALID_MODES   = ["GENERAL_95", "ULTIMATE", "DREAM_TEAM", "GENUINOS"] as const;
const VALID_REGIONS = ["LATAM_SUR", "LATAM_NORTE", "AMERICA", "EUROPA", "GLOBAL"] as const;
const VALID_CAPS    = [2, 4, 8, 16, 32] as const;

function getTier(entry_fee: number): string {
  if (entry_fee === 0)    return "FREE";
  if (entry_fee < 1000)  return "RECREATIVO";
  if (entry_fee < 10000) return "COMPETITIVO";
  return "ELITE";
}

function calcPrizePool(capacity: number, entry_fee: number) {
  return entry_fee === 0 ? 0 : Math.floor(capacity * entry_fee * 0.9);
}

function calcPrizes(capacity: number, entry_fee: number) {
  if (entry_fee === 0) return [{ place: 1, label: "🥇 1°", percentage: 100, coins: 0 }];
  const pot = calcPrizePool(capacity, entry_fee);
  if (capacity <= 6) return [{ place: 1, label: "🥇 1°", percentage: 100, coins: pot }];
  if (capacity <= 16) return [
    { place: 1, label: "🥇 1°", percentage: 70, coins: Math.floor(pot * 0.70) },
    { place: 2, label: "🥈 2°", percentage: 30, coins: Math.floor(pot * 0.30) },
  ];
  return [
    { place: 1, label: "🥇 1°", percentage: 60, coins: Math.floor(pot * 0.60) },
    { place: 2, label: "🥈 2°", percentage: 25, coins: Math.floor(pot * 0.25) },
    { place: 3, label: "🥉 3°", percentage: 15, coins: Math.floor(pot * 0.15) },
  ];
}

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
  const userSnap = await adminDb.collection("usuarios").doc(callerUid).get();
  if (!userSnap.exists || userSnap.data()?.rol !== "organizador") {
    return NextResponse.json({ error: "Sin permiso de organizador" }, { status: 403 });
  }
  const userData = userSnap.data()!;

  // ── Parse & validate body ─────────────────────────────────────────────────
  let body: {
    game:               string;
    mode:               string;
    region:             string;
    capacity:           number;
    entry_fee:          number;
    descripcion?:       string;
    premio_externo?:    boolean;
    premio_descripcion?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { game, mode, region, capacity, entry_fee, descripcion, premio_externo, premio_descripcion } = body;

  if (!(VALID_GAMES as readonly string[]).includes(game)) {
    return NextResponse.json({ error: "Juego inválido" }, { status: 400 });
  }
  if (!(VALID_MODES as readonly string[]).includes(mode)) {
    return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
  }
  if (!(VALID_REGIONS as readonly string[]).includes(region)) {
    return NextResponse.json({ error: "Región inválida" }, { status: 400 });
  }
  if (!(VALID_CAPS as readonly number[]).includes(capacity as typeof VALID_CAPS[number])) {
    return NextResponse.json({ error: "Capacidad inválida" }, { status: 400 });
  }
  if (typeof entry_fee !== "number" || entry_fee < 0 || entry_fee > 100_000) {
    return NextResponse.json({ error: "Inscripción inválida" }, { status: 400 });
  }

  // Sanitize free-text fields
  const safeDesc    = typeof descripcion       === "string" ? descripcion.slice(0, 280)       : "";
  const safePremio  = typeof premio_descripcion === "string" ? premio_descripcion.slice(0, 200) : "";

  // ── Create tournament document ────────────────────────────────────────────
  try {
    const ref = adminDb.collection("tournaments").doc();
    await ref.set({
      // Standard fields
      game,
      mode,
      region,
      tier:       getTier(entry_fee),
      free:       entry_fee === 0,
      entry_fee,
      prize_pool: calcPrizePool(capacity, entry_fee),
      prizes:     calcPrizes(capacity, entry_fee),
      capacity,
      players:    [],
      status:     "OPEN",
      spawned:    false,
      created_at: FieldValue.serverTimestamp(),
      // Organizer fields
      tipo:                "organizado",
      manual_advance:      true,
      organizador_uid:     callerUid,
      organizador_nombre:  userData.nombre  ?? null,
      organizador_avatar:  userData.avatar_url ?? null,
      organizador_twitch:  userData.twitch  ?? null,
      organizador_kick:    userData.kick    ?? null,
      organizador_youtube: userData.youtube ?? null,
      descripcion:         safeDesc || null,
      premio_externo:      premio_externo === true,
      premio_descripcion:  safePremio || null,
    });

    return NextResponse.json({ ok: true, tournamentId: ref.id });
  } catch (e) {
    console.error("[organizer/create]", e);
    return NextResponse.json({ error: "Error al crear el torneo" }, { status: 500 });
  }
}
