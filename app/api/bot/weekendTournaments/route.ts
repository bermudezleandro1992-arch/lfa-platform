import { NextRequest, NextResponse } from 'next/server';
import { adminDb }                  from '@/lib/firebase-admin';
import { FieldValue }               from 'firebase-admin/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bot/weekendTournaments
//
// Crea los torneos especiales de 32 jugadores para sábado y domingo.
// El bot debe llamar este endpoint con Authorization: Bearer <BOT_SECRET>
// los viernes a las 23:00 hs (hora ARG/UTC-3) para que estén listos al
// abrir el sábado.
//
// Crea: 2 salas × 2 modos × 2 juegos × 3 regiones = 24 torneos
//   - Copa 32 Pro   (2.000 LFC) — COMPETITIVO
//   - Copa 32 Elite (10.000 LFC) — ELITE
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── Autenticación del bot ──────────────────────────────────────────────────
  const botSecret = process.env.BOT_SECRET;
  if (!botSecret) {
    return NextResponse.json({ error: 'BOT_SECRET no configurado.' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== botSecret) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  // ── Solo ejecutar sáb/dom (UTC-3) ─────────────────────────────────────────
  const now = new Date();
  const argDay = new Date(now.getTime() - 3 * 60 * 60 * 1000).getUTCDay(); // 0=Dom, 6=Sáb
  if (argDay !== 0 && argDay !== 5 && argDay !== 6) {
    // Permitir viernes (5) para pre-cargar, sábado (6) y domingo (0)
    return NextResponse.json(
      { error: 'Este endpoint solo corre viernes/sábado/domingo.' },
      { status: 400 },
    );
  }

  const ts = FieldValue.serverTimestamp();

  // ── Distribución de premios para 32 jugadores ─────────────────────────────
  function make32Prizes(entry: number) {
    const total = entry * 32;
    const fee   = Math.floor(total * 0.1);
    const pool  = total - fee;
    return {
      prize_pool:   pool,
      platform_fee: fee,
      prizes: [
        { place: 1, label: '🥇 1°', percentage: 60, coins: Math.floor(pool * 0.60) },
        { place: 2, label: '🥈 2°', percentage: 30, coins: Math.floor(pool * 0.30) },
        { place: 3, label: '🥉 3°', percentage: 10, coins: Math.floor(pool * 0.10) },
      ],
    };
  }

  const REGIONS    = ['LATAM_SUR', 'LATAM_NORTE', 'AMERICA'];
  const FC26_MODES = ['GENERAL_95', 'ULTIMATE'];
  const EFB_MODES  = ['DREAM_TEAM', 'GENUINOS'];
  const SLOTS      = [
    { entry: 2_000,  tier: 'COMPETITIVO', name: '⚡ Gran Copa 32 Pro'  },
    { entry: 10_000, tier: 'ELITE',       name: '👑 Gran Copa 32 Elite' },
  ];

  const seeds = [];

  for (const region of REGIONS) {
    for (const mode of FC26_MODES) {
      for (const slot of SLOTS) {
        const { prize_pool, platform_fee, prizes } = make32Prizes(slot.entry);
        seeds.push({
          game: 'FC26', mode, region,
          name: slot.name,
          capacity: 32,
          entry_fee: slot.entry,
          prize_pool, platform_fee, prizes,
          tier: slot.tier,
          free: false,
          special: true,
          status: 'OPEN',
          players: [],
          created_at: ts,
        });
      }
    }
    for (const mode of EFB_MODES) {
      for (const slot of SLOTS) {
        const { prize_pool, platform_fee, prizes } = make32Prizes(slot.entry);
        seeds.push({
          game: 'EFOOTBALL', mode, region,
          name: slot.name,
          capacity: 32,
          entry_fee: slot.entry,
          prize_pool, platform_fee, prizes,
          tier: slot.tier,
          free: false,
          special: true,
          status: 'OPEN',
          players: [],
          created_at: ts,
        });
      }
    }
  }

  const batch = adminDb.batch();
  for (const data of seeds) {
    batch.set(adminDb.collection('tournaments').doc(), data);
  }
  await batch.commit();

  return NextResponse.json({
    ok: true,
    created: seeds.length,
    note: '2 salas × 2 modos × 2 juegos × 3 regiones = 24 torneos especiales',
  });
}
