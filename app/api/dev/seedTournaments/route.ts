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
    if (entry === 0)    return 'FREE';
    if (entry <= 1000)  return 'RECREATIVO';
    if (entry <= 8000)  return 'COMPETITIVO';
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

  // ─── 78 salas por modo por región ─────────────────────────────────────────
  // 6 tamaños × 13 precios = 78 combinaciones
  const SALA_SLOTS: [number, number][] = [
    // FREE (6)
    [2,0],[4,0],[6,0],[8,0],[12,0],[16,0],
    // RECREATIVO 500–1.000 (18)
    [2,500],[4,500],[6,500],[8,500],[12,500],[16,500],
    [2,750],[4,750],[6,750],[8,750],[12,750],[16,750],
    [2,1000],[4,1000],[6,1000],[8,1000],[12,1000],[16,1000],
    // COMPETITIVO 2.000–8.000 (36)
    [2,2000],[4,2000],[6,2000],[8,2000],[12,2000],[16,2000],
    [2,3000],[4,3000],[6,3000],[8,3000],[12,3000],[16,3000],
    [2,4000],[4,4000],[6,4000],[8,4000],[12,4000],[16,4000],
    [2,5000],[4,5000],[6,5000],[8,5000],[12,5000],[16,5000],
    [2,6000],[4,6000],[6,6000],[8,6000],[12,6000],[16,6000],
    [2,8000],[4,8000],[6,8000],[8,8000],[12,8000],[16,8000],
    // ELITE 10.000–20.000 (18)
    [2,10000],[4,10000],[6,10000],[8,10000],[12,10000],[16,10000],
    [2,15000],[4,15000],[6,15000],[8,15000],[12,15000],[16,15000],
    [2,20000],[4,20000],[6,20000],[8,20000],[12,20000],[16,20000],
  ];

  const REGIONS     = ['LATAM_SUR', 'LATAM_NORTE', 'AMERICA', 'GLOBAL', 'EUROPA'];
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

  // Firestore batch max = 500 escrituras — 78×5×4 = 1560 salas → múltiples batches
  const BATCH_SIZE = 499;
  for (let i = 0; i < seeds.length; i += BATCH_SIZE) {
    const chunk = seeds.slice(i, i + BATCH_SIZE);
    const batch = adminDb.batch();
    for (const data of chunk) {
      batch.set(adminDb.collection('tournaments').doc(), data);
    }
    await batch.commit();
  }

  return NextResponse.json({
    ok: true,
    created: seeds.length,
    breakdown: `${REGIONS.length} regiones × 4 modos × 78 salas = ${seeds.length}`,
  });
}
