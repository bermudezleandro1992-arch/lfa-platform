import { adminDb } from '@/lib/firebase-admin';
import { NextResponse } from 'next/server';

// Cache 5 minutos en el edge
export const revalidate = 300;

export async function GET() {
  try {
    const [usuariosSnap, tournamentsSnap] = await Promise.all([
      adminDb.collection('usuarios').count().get(),
      adminDb.collection('tournaments').count().get(),
    ]);
    return NextResponse.json({
      jugadores: usuariosSnap.data().count ?? 0,
      torneos:   tournamentsSnap.data().count ?? 0,
    });
  } catch {
    return NextResponse.json({ jugadores: 0, torneos: 0 });
  }
}
