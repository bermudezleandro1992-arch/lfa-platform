import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
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

    const tRef  = adminDb.collection('tournaments').doc(tournamentId);
    const uRef  = adminDb.collection('usuarios').doc(uid);

    await adminDb.runTransaction(async (tx) => {
      const [tSnap, uSnap] = await Promise.all([tx.get(tRef), tx.get(uRef)]);

      if (!tSnap.exists) throw new Error('Torneo no encontrado.');
      if (!uSnap.exists) throw new Error('Usuario no encontrado.');

      const t = tSnap.data()!;
      const u = uSnap.data()!;

      if (!t.players.includes(uid)) throw new Error('No estás inscrito en este torneo.');
      if (t.status !== 'OPEN') throw new Error('Solo podés salir de torneos abiertos en espera.');

      const newPlayers = (t.players as string[]).filter((p) => p !== uid);
      tx.update(tRef, {
        players:    newPlayers,
        updated_at: FieldValue.serverTimestamp(),
      });

      // Reembolso de coins si no era FREE
      if (t.entry_fee > 0) {
        const coins = u.number ?? u.coins ?? 0;
        tx.update(uRef, { number: coins + t.entry_fee });
        tx.set(adminDb.collection('transactions').doc(), {
          userId:       uid,
          type:         'REFUND',
          amount:       t.entry_fee,
          tournamentId,
          timestamp:    FieldValue.serverTimestamp(),
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Saliste del torneo y se reembolsaron tus Coins.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
