/**
 * app/api/ceo/spawnFromSlots/route.ts
 *
 * Lee los room_slots activos (plantillas del Mega Spawn) y crea los torneos
 * reales en la colección `tournaments` usando Admin SDK.
 * Mantiene hasta `max_simultaneous` salas abiertas por cada plantilla.
 *
 * Solo el CEO puede llamarlo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue }                from 'firebase-admin/firestore';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

function calcPrizePool(capacity: number, entryFee: number): number {
  if (entryFee === 0) return 0;
  return Math.floor(capacity * entryFee * 0.9);
}

function calcPrizes(capacity: number, entryFee: number) {
  const pool = calcPrizePool(capacity, entryFee);
  if (entryFee === 0) return [{ place: 1, label: '🥇 1°', percentage: 100, coins: 0 }];
  if (capacity <= 6)  return [{ place: 1, label: '🥇 1°', percentage: 100, coins: pool }];
  if (capacity <= 16) return [
    { place: 1, label: '🥇 1°', percentage: 70, coins: Math.floor(pool * 0.70) },
    { place: 2, label: '🥈 2°', percentage: 30, coins: Math.floor(pool * 0.30) },
  ];
  if (capacity <= 32) return [
    { place: 1, label: '🥇 1°', percentage: 60, coins: Math.floor(pool * 0.60) },
    { place: 2, label: '🥈 2°', percentage: 25, coins: Math.floor(pool * 0.25) },
    { place: 3, label: '🥉 3°', percentage: 15, coins: Math.floor(pool * 0.15) },
  ];
  return [
    { place: 1, label: '🥇 1°', percentage: 50, coins: Math.floor(pool * 0.50) },
    { place: 2, label: '🥈 2°', percentage: 25, coins: Math.floor(pool * 0.25) },
    { place: 3, label: '🥉 3°', percentage: 15, coins: Math.floor(pool * 0.15) },
    { place: 4, label: '4°',    percentage: 10, coins: Math.floor(pool * 0.10) },
  ];
}

export async function POST(req: NextRequest) {
  /* 1 — Verify CEO auth */
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Sin autorización' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (uid !== CEO_UID) return NextResponse.json({ error: 'Solo el CEO puede usar esto' }, { status: 403 });

  try {
    /* 2 — Read simultaneous config from spawner doc */
    const spawnerDoc = await adminDb.collection('configuracion').doc('spawner').get();
    const spawnerData = spawnerDoc.exists ? spawnerDoc.data()! : {};
    // simultaneous_per_tier = how many TOTAL rooms of each tier should exist at once
    const simPerTier: Record<string, number> = spawnerData.simultaneous_per_tier ?? {};
    const getMaxForTier = (tier: string): number =>
      simPerTier[tier] ?? simPerTier[tier?.toUpperCase()] ?? 2;

    /* 3 — Read all active room_slots, grouped by tier */
    const slotsSnap = await adminDb.collection('room_slots')
      .where('activo', '==', true)
      .get();

    if (slotsSnap.empty) {
      return NextResponse.json({ ok: true, created: 0, checked: 0, message: 'No hay plantillas activas en room_slots.' });
    }

    // Group slots by tier
    const slotsByTier: Record<string, Record<string, unknown>[]> = {};
    slotsSnap.forEach(d => {
      const t: string = (d.data().tier as string) ?? 'FREE';
      if (!slotsByTier[t]) slotsByTier[t] = [];
      slotsByTier[t].push(d.data() as Record<string, unknown>);
    });

    /* 4 — Count existing OPEN spawned rooms by tier */
    const openSnap = await adminDb.collection('tournaments')
      .where('status', '==', 'OPEN')
      .get();

    const tierCounts: Record<string, number> = {};
    openSnap.forEach(d => {
      const data = d.data();
      if (!data.spawned) return; // skip manually created rooms
      const t: string = (data.tier as string) ?? 'FREE';
      tierCounts[t] = (tierCounts[t] || 0) + 1;
    });

    /* 5 — For each tier, create only as many rooms as needed to reach the configured total */
    let created = 0;
    const BATCH_LIMIT = 490;
    let batch = adminDb.batch();
    let batchCount = 0;

    // Simple Fisher-Yates shuffle to pick random slots
    const shuffle = <T,>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    for (const [tier, slots] of Object.entries(slotsByTier)) {
      const maxForTier = getMaxForTier(tier);
      const existingForTier = tierCounts[tier] || 0;
      const neededForTier = Math.max(0, maxForTier - existingForTier);

      if (neededForTier === 0) continue;

      // Pick `neededForTier` random slots from this tier (variety)
      const picked = shuffle(slots).slice(0, neededForTier);

      for (const tpl of picked) {
        const pricePool = tpl.price_pool as number[] | undefined;
        const entryFee: number = Array.isArray(pricePool) && pricePool.length > 0
          ? pricePool[Math.floor(Math.random() * pricePool.length)]
          : ((tpl.entry_fee as number) ?? 0);
        const capacity: number = (tpl.capacity as number) ?? 4;
        const region: string   = (tpl.region as string) ?? 'GLOBAL';
        const game: string     = (tpl.game as string) ?? 'FC26';
        const mode: string     = (tpl.mode as string) ?? 'GENERAL_95';

        const ref = adminDb.collection('tournaments').doc();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min para llenarse
        batch.set(ref, {
          game,
          mode,
          region,
          tier,
          free: entryFee === 0,
          entry_fee: entryFee,
          prize_pool: calcPrizePool(capacity, entryFee),
          prizes: calcPrizes(capacity, entryFee),
          capacity,
          players: [],
          status: 'OPEN',
          spawned: true,
          expires_at: expiresAt,
          created_at: FieldValue.serverTimestamp(),
        });
        created++;
        batchCount++;

        if (batchCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = adminDb.batch();
          batchCount = 0;
        }
      }
    }

    // Final flush
    if (batchCount > 0) await batch.commit();

    // Update spawner config with last run info
    await adminDb.collection('configuracion').doc('spawner').set({
      last_run:     FieldValue.serverTimestamp(),
      last_created: created,
    }, { merge: true });

    return NextResponse.json({
      ok: true,
      created,
      checked: slotsSnap.size,
      message: `${created} sala(s) creadas a partir de ${slotsSnap.size} plantillas activas.`,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
