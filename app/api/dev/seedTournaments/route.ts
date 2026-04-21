import { NextResponse }  from 'next/server';
import { adminDb }       from '@/lib/firebase-admin';
import { FieldValue }    from 'firebase-admin/firestore';

// ⚠️  Solo disponible en desarrollo — genera 168 salas (28 por juego por región × 3 regiones × 2 juegos)
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'No disponible en producción.' }, { status: 403 });
  }

  const now = FieldValue.serverTimestamp();

  // ─── Distribución de premios ──────────────────────────────────────────────
  type Dist = { label: string; pct: number };
  const DIST: Record<number, Dist[]> = {
    2:  [{ label: '🥇 1°', pct: 100 }],
    4:  [{ label: '🥇 1°', pct: 70 }, { label: '🥈 2°', pct: 30 }],
    6:  [{ label: '🥇 1°', pct: 70 }, { label: '🥈 2°', pct: 30 }],
    8:  [{ label: '🥇 1°', pct: 70 }, { label: '🥈 2°', pct: 30 }],
    12: [{ label: '🥇 1°', pct: 60 }, { label: '🥈 2°', pct: 30 }, { label: '🥉 3°', pct: 10 }],
    16: [{ label: '🥇 1°', pct: 70 }, { label: '🥈 2°', pct: 30 }],
  };

  function makePrizes(cap: number, entry: number) {
    const total = entry * cap;
    const fee   = Math.floor(total * 0.1);
    const pool  = total - fee;
    const dist  = DIST[cap] ?? DIST[2];
    return {
      prize_pool:   pool,
      platform_fee: fee,
      prizes: dist.map((d, i) => ({
        place:      i + 1,
        label:      d.label,
        percentage: d.pct,
        coins:      Math.floor((pool * d.pct) / 100),
      })),
    };
  }

  function getTier(entry: number) {
    if (entry === 0)   return 'FREE';
    if (entry < 1000)  return 'RECREATIVO';
    if (entry < 10000) return 'COMPETITIVO';
    return 'ELITE';
  }

  function makeSala(
    game: string, mode: string, region: string,
    capacity: number, entry_fee: number,
  ) {
    const { prize_pool, platform_fee, prizes } = makePrizes(capacity, entry_fee);
    return {
      game, mode, region, capacity, entry_fee,
      prize_pool, platform_fee, prizes,
      tier: getTier(entry_fee),
      free: entry_fee === 0,
      status: 'OPEN',
      players: [],
      created_at: now,
    };
  }

  // ─── 14 salas por modo por región ─────────────────────────────────────────
  //  2p  REC  (500)       │  6p  FREE  (0)    │  8p  COM  (2000)
  //  2p  COM  (2000)      │  6p  REC   (500)  │ 12p  REC  (500)
  //  4p  FREE (0)         │  6p  COM   (2000) │ 12p  COM  (2000)
  //  4p  REC  (500)       │  8p  FREE  (0)    │ 16p  FREE (0)
  //                       │  8p  REC   (500)  │ 16p  ELT  (10000)
  // ─────────────────────────────────────────────────────────────────────────
  const SALA_SLOTS: [number, number][] = [
    [2,  500],   [2,  2000],
    [4,  0],     [4,  500],
    [6,  0],     [6,  500],   [6,  2000],
    [8,  0],     [8,  500],   [8,  2000],
    [12, 500],   [12, 2000],
    [16, 0],     [16, 10000],
  ];

  const REGIONS     = ['LATAM_SUR', 'LATAM_NORTE', 'AMERICA'];
  const FC26_MODES  = ['GENERAL_95', 'ULTIMATE'];
  const EFB_MODES   = ['DREAM_TEAM', 'GENUINOS'];

  const seeds: ReturnType<typeof makeSala>[] = [];

  for (const region of REGIONS) {
    for (const mode of FC26_MODES) {
      for (const [cap, entry] of SALA_SLOTS) {
        seeds.push(makeSala('FC26', mode, region, cap, entry));
      }
    }
    for (const mode of EFB_MODES) {
      for (const [cap, entry] of SALA_SLOTS) {
        seeds.push(makeSala('EFOOTBALL', mode, region, cap, entry));
      }
    }
  }

  // Firestore batch max = 500 escrituras; 168 < 500
  const batch = adminDb.batch();
  for (const data of seeds) {
    batch.set(adminDb.collection('tournaments').doc(), data);
  }
  await batch.commit();

  return NextResponse.json({
    ok: true,
    created: seeds.length,
    breakdown: `${REGIONS.length} regiones × 2 juegos × 2 modos × 14 salas = ${seeds.length}`,
  });
}
