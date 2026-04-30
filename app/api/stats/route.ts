import { adminDb } from '@/lib/firebase-admin';
import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

// Forzar datos frescos en cada request — stats 100% en vivo
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const hoyTs = Timestamp.fromDate(hoyInicio);

    // Usamos .get() con .select() en vez de compound count() queries
    // para evitar requerir índices compuestos en Firestore
    const [
      usuariosSnap,
      totalTorneosSnap,
      torneosActivosSnap,
      matchesHoySnap,
      matchesVivoSnap,
      fc26JugSnap,
      efbJugSnap,
    ] = await Promise.all([
      adminDb.collection('usuarios').count().get(),
      adminDb.collection('tournaments').count().get(),
      adminDb.collection('tournaments').where('status', 'in', ['OPEN', 'ACTIVE']).select('game').get(),
      adminDb.collection('matches').where('created_at', '>=', hoyTs).select('game').get(),
      adminDb.collection('matches').where('status', 'in', ['WAITING', 'PENDING_RESULT']).select('game').get(),
      adminDb.collection('usuarios').where('juego_fc26', '==', true).count().get(),
      adminDb.collection('usuarios').where('juego_efb', '==', true).count().get(),
    ]);

    // Contar por juego en JavaScript (evita índices compuestos)
    const fc26Torneos = torneosActivosSnap.docs.filter(d => d.data().game === 'FC26').length;
    const efbTorneos  = torneosActivosSnap.docs.filter(d => d.data().game === 'EFOOTBALL').length;
    const fc26Vivo    = matchesVivoSnap.docs.filter(d => d.data().game === 'FC26').length;
    const efbVivo     = matchesVivoSnap.docs.filter(d => d.data().game === 'EFOOTBALL').length;
    const fc26Hoy     = matchesHoySnap.docs.filter(d => d.data().game === 'FC26').length;
    const efbHoy      = matchesHoySnap.docs.filter(d => d.data().game === 'EFOOTBALL').length;
    const vivosTotal  = matchesVivoSnap.size;
    const partidasHoy = matchesHoySnap.size;

    return NextResponse.json({
      jugadores:       usuariosSnap.data().count ?? 0,
      torneos:         totalTorneosSnap.data().count ?? 0,
      partidas_hoy:    partidasHoy,
      en_vivo:         vivosTotal,
      jugando_ahora:   vivosTotal * 2,
      fc26_vivo:       fc26Vivo,
      efb_vivo:        efbVivo,
      torneos_activos: torneosActivosSnap.size,
      fc26_torneos:    fc26Torneos,
      efb_torneos:     efbTorneos,
      fc26_jugadores:  fc26JugSnap.data().count ?? 0,
      efb_jugadores:   efbJugSnap.data().count ?? 0,
      fc26_hoy:        fc26Hoy,
      efb_hoy:         efbHoy,
    });
  } catch {
    return NextResponse.json({
      jugadores: 0, torneos: 0, partidas_hoy: 0,
      en_vivo: 0, jugando_ahora: 0, fc26_vivo: 0, efb_vivo: 0,
      torneos_activos: 0, fc26_torneos: 0, efb_torneos: 0,
      fc26_jugadores: 0, efb_jugadores: 0, fc26_hoy: 0, efb_hoy: 0,
    });
  }
}
