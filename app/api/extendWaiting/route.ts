import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue, Timestamp }     from 'firebase-admin/firestore';
import { WAIT_EXTEND_MINUTES }       from '@/lib/constants';

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
    const tSnap = await tRef.get();
    if (!tSnap.exists) return NextResponse.json({ error: 'Torneo no encontrado.' }, { status: 404 });

    const t = tSnap.data()!;
    if (!t.players.includes(uid)) {
      return NextResponse.json({ error: 'No estás inscrito en este torneo.' }, { status: 403 });
    }

    const currentExpiry  = t.waiting_expires_at?.toMillis() ?? Date.now();
    const newExpiry      = Math.max(currentExpiry, Date.now()) + WAIT_EXTEND_MINUTES * 60 * 1000;

    await tRef.update({
      waiting_expires_at: Timestamp.fromMillis(newExpiry),
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, newExpiry });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
