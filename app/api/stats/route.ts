import { adminDb } from '@/lib/firebase-admin';
import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

// Sin cache — datos en vivo (Next.js revalida en cada request en edge)
export const revalidate = 30;

export async function GET() {
  try {
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const hoyTs = Timestamp.fromDate(hoyInicio);

    const [
      usuariosSnap,
      tournamentsSnap,
      matchesHoySnap,
      matchesVivoSnap,
      matchesFC26Snap,
      matchesEFBSnap,
      torneosActivosSnap,
    ] = await Promise.all([
      adminDb.collection('usuarios').count().get(),
      adminDb.collection('tournaments').count().get(),
      adminDb.collection('matches').where('created_at', '>=', hoyTs).count().get(),
      adminDb.collection('matches').where('status', 'in', ['WAITING', 'PENDING_RESULT']).count().get(),
      adminDb.collection('matches').where('status', 'in', ['WAITING', 'PENDING_RESULT']).where('game', '==', 'FC26').count().get(),
      adminDb.collection('matches').where('status', 'in', ['WAITING', 'PENDING_RESULT']).where('game', '==', 'EFOOTBALL').count().get(),
      adminDb.collection('tournaments').where('status', 'in', ['OPEN', 'ACTIVE']).count().get(),
    ]);

    const vivosTotal = matchesVivoSnap.data().count ?? 0;

    return NextResponse.json({
      jugadores:       usuariosSnap.data().count ?? 0,
      torneos:         tournamentsSnap.data().count ?? 0,
      partidas_hoy:    matchesHoySnap.data().count ?? 0,
      en_vivo:         vivosTotal,
      jugando_ahora:   vivosTotal * 2,
      fc26_vivo:       matchesFC26Snap.data().count ?? 0,
      efb_vivo:        matchesEFBSnap.data().count ?? 0,
      torneos_activos: torneosActivosSnap.data().count ?? 0,
    });
  } catch {
    return NextResponse.json({
      jugadores: 0, torneos: 0, partidas_hoy: 0,
      en_vivo: 0, jugando_ahora: 0, fc26_vivo: 0, efb_vivo: 0, torneos_activos: 0,
    });
  }
}
