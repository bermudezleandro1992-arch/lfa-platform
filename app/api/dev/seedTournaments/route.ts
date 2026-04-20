import { NextResponse }  from 'next/server';
import { adminDb }       from '@/lib/firebase-admin';
import { FieldValue }    from 'firebase-admin/firestore';

// ⚠️  Solo disponible en desarrollo
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'No disponible en producción.' }, { status: 403 });
  }

  const now = FieldValue.serverTimestamp();

  const seeds = [
    // ── GRATIS FC26 — 2 jugadores ────────────────────
    {
      game: 'FC26', mode: 'GENERAL_95', region: 'LATAM_SUR',
      capacity: 2, entry_fee: 0, prize_pool: 0, tier: 'FREE',
      status: 'OPEN', players: [], free: true, created_at: now,
      prizes: [{ place: 1, label: '🥇 1°', percentage: 100, coins: 0 }],
    },
    // ── GRATIS FC26 — 4 jugadores ────────────────────
    {
      game: 'FC26', mode: 'GENERAL_95', region: 'LATAM_SUR',
      capacity: 4, entry_fee: 0, prize_pool: 0, tier: 'FREE',
      status: 'OPEN', players: [], free: true, created_at: now,
      prizes: [{ place: 1, label: '🥇 1°', percentage: 100, coins: 0 }],
    },
    // ── GRATIS FC26 — 6 jugadores ────────────────────
    {
      game: 'FC26', mode: 'GENERAL_95', region: 'LATAM_SUR',
      capacity: 6, entry_fee: 0, prize_pool: 0, tier: 'FREE',
      status: 'OPEN', players: [], free: true, created_at: now,
      prizes: [{ place: 1, label: '🥇 1°', percentage: 100, coins: 0 }],
    },
    // ── GRATIS FC26 — 8 jugadores ────────────────────
    {
      game: 'FC26', mode: 'GENERAL_95', region: 'LATAM_SUR',
      capacity: 8, entry_fee: 0, prize_pool: 0, tier: 'FREE',
      status: 'OPEN', players: [], free: true, created_at: now,
      prizes: [{ place: 1, label: '🥇 1°', percentage: 100, coins: 0 }],
    },
    // ── GRATIS FC26 — 12 jugadores ───────────────────
    {
      game: 'FC26', mode: 'GENERAL_95', region: 'LATAM_NORTE',
      capacity: 12, entry_fee: 0, prize_pool: 0, tier: 'FREE',
      status: 'OPEN', players: [], free: true, created_at: now,
      prizes: [{ place: 1, label: '🥇 1°', percentage: 100, coins: 0 }],
    },
    // ── RECREATIVO FC26 — 16 jugadores ───────────────
    {
      game: 'FC26', mode: 'ULTIMATE', region: 'LATAM_SUR',
      capacity: 16, entry_fee: 500, prize_pool: 7000, tier: 'RECREATIVO',
      status: 'OPEN', players: [], free: false, created_at: now,
      prizes: [
        { place: 1, label: '🥇 1°', percentage: 70, coins: 4900 },
        { place: 2, label: '🥈 2°', percentage: 30, coins: 2100 },
      ],
    },
    // ── RECREATIVO FC26 — 8 jugadores ────────────────
    {
      game: 'FC26', mode: 'GENERAL_95', region: 'LATAM_SUR',
      capacity: 8, entry_fee: 500, prize_pool: 3500, tier: 'RECREATIVO',
      status: 'OPEN', players: [], free: false, created_at: now,
      prizes: [
        { place: 1, label: '🥇 1°', percentage: 70, coins: 2450 },
        { place: 2, label: '🥈 2°', percentage: 30, coins: 1050 },
      ],
    },
    // ── COMPETITIVO FC26 — 8 jugadores ───────────────
    {
      game: 'FC26', mode: 'GENERAL_95', region: 'LATAM_SUR',
      capacity: 8, entry_fee: 1000, prize_pool: 7000, tier: 'COMPETITIVO',
      status: 'OPEN', players: [], free: false, created_at: now,
      prizes: [
        { place: 1, label: '🥇 1°', percentage: 70, coins: 4900 },
        { place: 2, label: '🥈 2°', percentage: 30, coins: 2100 },
      ],
    },
    // ── COMPETITIVO FC26 — 32 jugadores ──────────────
    {
      game: 'FC26', mode: 'GENERAL_95', region: 'AMERICA',
      capacity: 32, entry_fee: 3000, prize_pool: 84000, tier: 'COMPETITIVO',
      status: 'OPEN', players: [], free: false, created_at: now,
      prizes: [
        { place: 1, label: '🥇 1°', percentage: 60, coins: 50400 },
        { place: 2, label: '🥈 2°', percentage: 30, coins: 25200 },
        { place: 3, label: '🥉 3°', percentage: 10, coins: 8400  },
      ],
    },
    // ── COMPETITIVO FC26 — 64 jugadores ──────────────
    {
      game: 'FC26', mode: 'DREAM_TEAM', region: 'AMERICA',
      capacity: 64, entry_fee: 2000, prize_pool: 112000, tier: 'COMPETITIVO',
      status: 'OPEN', players: [], free: false, created_at: now,
      prizes: [
        { place: 1, label: '🥇 1°', percentage: 60, coins: 67200 },
        { place: 2, label: '🥈 2°', percentage: 25, coins: 28000 },
        { place: 3, label: '🥉 3°', percentage: 15, coins: 16800 },
      ],
    },
    // ── ELITE FC26 — 8 jugadores ─────────────────────
    {
      game: 'FC26', mode: 'GENERAL_95', region: 'GLOBAL',
      capacity: 8, entry_fee: 10000, prize_pool: 70000, tier: 'ELITE',
      status: 'OPEN', players: [], free: false, created_at: now,
      prizes: [
        { place: 1, label: '🥇 1°', percentage: 70, coins: 49000 },
        { place: 2, label: '🥈 2°', percentage: 30, coins: 21000 },
      ],
    },
    // ── EFOOTBALL — 2 jugadores ───────────────────────
    {
      game: 'EFOOTBALL', mode: 'DREAM_TEAM', region: 'LATAM_SUR',
      capacity: 2, entry_fee: 0, prize_pool: 0, tier: 'FREE',
      status: 'OPEN', players: [], free: true, created_at: now,
      prizes: [{ place: 1, label: '🥇 1°', percentage: 100, coins: 0 }],
    },
    // ── EFOOTBALL — 8 jugadores ───────────────────────
    {
      game: 'EFOOTBALL', mode: 'DREAM_TEAM', region: 'LATAM_SUR',
      capacity: 8, entry_fee: 0, prize_pool: 0, tier: 'FREE',
      status: 'OPEN', players: [], free: true, created_at: now,
      prizes: [{ place: 1, label: '🥇 1°', percentage: 100, coins: 0 }],
    },
    // ── EFOOTBALL — 16 jugadores ──────────────────────
    {
      game: 'EFOOTBALL', mode: 'GENUINOS', region: 'LATAM_NORTE',
      capacity: 16, entry_fee: 1000, prize_pool: 14000, tier: 'COMPETITIVO',
      status: 'OPEN', players: [], free: false, created_at: now,
      prizes: [
        { place: 1, label: '🥇 1°', percentage: 70, coins: 9800 },
        { place: 2, label: '🥈 2°', percentage: 30, coins: 4200 },
      ],
    },
  ];

  const batch = adminDb.batch();
  for (const data of seeds) {
    batch.set(adminDb.collection('tournaments').doc(), data);
  }
  await batch.commit();

  return NextResponse.json({ ok: true, created: seeds.length });
}
