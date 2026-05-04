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
    const simPerTier: Record<string, number> = spawnerData.simultaneous_per_tier ?? {};
    const getMaxSim = (t: string, slotDefault: number): number =>
      simPerTier[t] ?? simPerTier[t?.toUpperCase()] ?? slotDefault ?? 1;

    /* 3 — Read all active room_slots */
    const slotsSnap = await adminDb.collection('room_slots')
      .where('activo', '==', true)
      .get();

    if (slotsSnap.empty) {
      return NextResponse.json({ ok: true, created: 0, checked: 0, message: 'No hay plantillas activas en room_slots.' });
    }

    /* 3 — Read all currently OPEN tournaments (single-field query, no composite index needed) */
    const openSnap = await adminDb.collection('tournaments')
      .where('status', '==', 'OPEN')
      .get();

    // Map: "game|mode|capacity|entry_fee|region" → count (only spawned rooms)
    const existingCount: Record<string, number> = {};
    openSnap.forEach(d => {
      const data = d.data();
      if (!data.spawned) return; // JS filter instead of composite index
      const key = `${data.game}|${data.mode}|${data.capacity}|${data.entry_fee}|${data.region}`;
      existingCount[key] = (existingCount[key] || 0) + 1;
    });

    /* 4 — Create missing tournaments per slot */
    let created = 0;
    const BATCH_LIMIT = 490;
    let batch = adminDb.batch();
    let batchCount = 0;

    for (const slotDoc of slotsSnap.docs) {
      const tpl = slotDoc.data();
      const tier: string = tpl.tier ?? 'GRATIS';
      const entryFee: number = tpl.entry_fee ?? 0;
      const capacity: number = tpl.capacity ?? 4;
      const region: string = tpl.region ?? 'GLOBAL';
      const game: string = tpl.game ?? 'FC26';
      const mode: string = tpl.mode ?? 'GENERAL_95';
      const maxSim: number = getMaxSim(tier, tpl.max_simultaneous ?? 1);

      const key = `${game}|${mode}|${capacity}|${entryFee}|${region}`;
      const existing = existingCount[key] || 0;
      const needed = Math.max(0, maxSim - existing);

      for (let i = 0; i < needed; i++) {
        const ref = adminDb.collection('tournaments').doc();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min para llenarse
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
          slot_id: slotDoc.id,
          expires_at: expiresAt,
          created_at: FieldValue.serverTimestamp(),
        });
        created++;
        batchCount++;

        // Flush batch before hitting Firestore limit
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
