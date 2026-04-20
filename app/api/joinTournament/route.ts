import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const REGION_COMPAT: Record<string, string[]> = {
  LATAM_SUR:   ['LATAM_SUR',   'AMERICA', 'GLOBAL'],
  LATAM_NORTE: ['LATAM_NORTE', 'AMERICA', 'GLOBAL'],
  AMERICA:     ['LATAM_SUR',   'LATAM_NORTE', 'AMERICA', 'GLOBAL'],
  GLOBAL:      ['LATAM_SUR',   'LATAM_NORTE', 'AMERICA', 'GLOBAL'],
};

export async function POST(req: NextRequest) {
  try {
    // Verificar token
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid     = decoded.uid;

    const { tournamentId } = await req.json();
    if (!tournamentId) {
      return NextResponse.json({ error: 'tournamentId requerido.' }, { status: 400 });
    }

    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    // Usamos 'usuarios' para ser consistentes con la colección existente del proyecto
    const userRef       = adminDb.collection('usuarios').doc(uid);

    const result = await adminDb.runTransaction(async (tx) => {
      const [tSnap, uSnap] = await Promise.all([tx.get(tournamentRef), tx.get(userRef)]);

      if (!tSnap.exists) throw new Error('Torneo no encontrado.');
      if (!uSnap.exists) throw new Error('Usuario no encontrado.');

      const t = tSnap.data()!;
      const u = uSnap.data()!;

      if (t.status !== 'OPEN')              throw new Error('El torneo no está abierto.');
      if (t.players.includes(uid))          throw new Error('Ya estás inscrito en este torneo.');
      if (t.players.length >= t.capacity)   throw new Error('Sala llena.');

      // Bloquear si ya está en otro torneo activo/abierto
      const activeTourSnap = await adminDb.collection('tournaments')
        .where('players', 'array-contains', uid)
        .where('status', 'in', ['OPEN', 'ACTIVE'])
        .get();
      if (!activeTourSnap.empty) {
        throw new Error('Ya estás en una sala activa. Terminá o abandoná esa partida primero.');
      }

      const userRegion = u.region as string | undefined;
      if (userRegion && !REGION_COMPAT[userRegion]?.includes(t.region)) {
        throw new Error(`Tu región (${userRegion}) no puede entrar a este torneo (${t.region}).`);
      }

      const isFree   = t.entry_fee === 0;
      const coins    = u.number ?? u.coins ?? 0;

      if (isFree) {
        const authUser = await adminAuth.getUser(uid);
        if (!authUser.emailVerified) {
          throw new Error('Verificá tu email para acceder a torneos gratuitos.');
        }
        const hasId = u.ea_id?.trim() || u.id_consola?.trim() || u.plataforma_id?.trim();
        if (!hasId) {
          throw new Error('Completá tu ID de jugador en Mi Perfil antes de acceder a torneos gratuitos.');
        }
        if (coins > 5_000) {
          throw new Error('Con más de 5,000 Coins no podés acceder a salas gratuitas.');
        }
      } else {
        if (coins < t.entry_fee) {
          throw new Error(`Saldo insuficiente. Necesitás ${t.entry_fee.toLocaleString()} Coins.`);
        }
      }

      const newPlayers = [...t.players, uid];
      if (!isFree) tx.update(userRef, { number: coins - t.entry_fee });
      tx.update(tournamentRef, { players: newPlayers });
      tx.set(adminDb.collection('transactions').doc(), {
        userId: uid,
        type: isFree ? 'FREE_ENTRY' : 'TOURNAMENT_ENTRY',
        amount: isFree ? 0 : -t.entry_fee,
        tournamentId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return { newBalance: isFree ? coins : coins - t.entry_fee };
    });

    return NextResponse.json({ success: true, newBalance: result.newBalance, message: '¡Inscripción exitosa!' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
