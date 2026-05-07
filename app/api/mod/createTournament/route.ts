/**
 * /api/mod/createTournament
 * Moderadores, soporte y CEO pueden crear torneos, con o sin restricción de país.
 * Los mods NO pueden establecer entry_fee > 0 a menos que sean soporte/CEO.
 * (Por seguridad: los mods solo crean torneos gratuitos o de bajo costo)
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const CEO_UID    = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const STAFF_ROLES = ['mod', 'soporte'];

const VALID_GAMES   = ['FC26', 'EFOOTBALL'] as const;
const VALID_MODES   = ['GENERAL_95', 'ULTIMATE', 'DREAM_TEAM', 'GENUINOS'] as const;
const VALID_REGIONS = ['LATAM_SUR', 'LATAM_NORTE', 'GLOBAL', 'AMERICA', 'EUROPA'] as const;
const VALID_TIERS   = ['FREE', 'RECREATIVO', 'COMPETITIVO', 'ELITE'] as const;
const VALID_COUNTRIES = [
  'Argentina', 'México', 'Colombia', 'Chile', 'Perú',
  'Venezuela', 'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay',
  'Brasil', 'España', 'Costa Rica', 'Guatemala', 'Honduras',
  'Nicaragua', 'Panamá', 'El Salvador', 'República Dominicana',
  'Cuba', 'Puerto Rico', 'Estados Unidos', 'Canadá',
];

function calcPrizes(capacity: number, entryFee: number) {
  const pool = Math.floor(capacity * entryFee * 0.9);
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
  /* Auth */
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer '))
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  let callerUid: string;
  let callerRol = 'mod';
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    callerUid = decoded.uid;
    if (callerUid !== CEO_UID) {
      const snap = await adminDb.collection('usuarios').doc(callerUid).get();
      callerRol  = (snap.data()?.rol as string) ?? '';
      if (!STAFF_ROLES.includes(callerRol))
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    } else {
      callerRol = 'ceo';
    }
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  /* Body */
  let body: {
    game?: unknown; mode?: unknown; region?: unknown; tier?: unknown;
    capacity?: unknown; entry_fee?: unknown; country?: unknown; name?: unknown;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Body inválido.' }, { status: 400 }); }

  const game     = String(body.game ?? '').toUpperCase();
  const mode     = String(body.mode ?? '').toUpperCase();
  const region   = String(body.region ?? '').toUpperCase();
  const tier     = String(body.tier ?? 'FREE').toUpperCase();
  const capacity = Number(body.capacity ?? 8);
  const country  = typeof body.country === 'string' ? body.country.trim() : '';
  const name     = typeof body.name    === 'string' ? body.name.trim()    : '';
  let   entryFee = Number(body.entry_fee ?? 0);

  if (!VALID_GAMES.includes(game as typeof VALID_GAMES[number]))
    return NextResponse.json({ error: 'Juego inválido.' }, { status: 400 });
  if (!VALID_MODES.includes(mode as typeof VALID_MODES[number]))
    return NextResponse.json({ error: 'Modo inválido.' }, { status: 400 });
  if (!VALID_REGIONS.includes(region as typeof VALID_REGIONS[number]))
    return NextResponse.json({ error: 'Región inválida.' }, { status: 400 });
  if (!VALID_TIERS.includes(tier as typeof VALID_TIERS[number]))
    return NextResponse.json({ error: 'Tier inválido.' }, { status: 400 });
  if (![2, 4, 6, 8, 12, 16, 32, 64].includes(capacity))
    return NextResponse.json({ error: 'Capacidad inválida (2|4|6|8|12|16|32|64).' }, { status: 400 });
  if (country && !VALID_COUNTRIES.includes(country))
    return NextResponse.json({ error: 'País inválido.' }, { status: 400 });

  /* Mods solo pueden crear torneos RECREATIVOS o FREE */
  if (callerRol === 'mod' && !['FREE', 'RECREATIVO'].includes(tier))
    return NextResponse.json({ error: 'Los moderadores solo pueden crear torneos FREE o RECREATIVO.' }, { status: 403 });

  if (tier === 'FREE') entryFee = 0;

  const pool   = Math.floor(capacity * entryFee * 0.9);
  const prizes = calcPrizes(capacity, entryFee);

  const docData: Record<string, unknown> = {
    game, mode, region, tier,
    free:         entryFee === 0,
    entry_fee:    entryFee,
    prize_pool:   pool,
    prizes,
    capacity,
    players:      [],
    status:       'OPEN',
    spawned:      false,
    permanent:    false,
    created_by:   callerUid,
    created_at:   FieldValue.serverTimestamp(),
    ...(country ? { country } : {}),
    ...(name    ? { name }    : {}),
  };

  const ref = await adminDb.collection('tournaments').add(docData);

  return NextResponse.json({ success: true, id: ref.id });
}
