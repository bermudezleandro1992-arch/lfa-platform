import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const { match_id } = await req.json();
    if (!match_id) return NextResponse.json({ error: 'Falta match_id.' }, { status: 400 });

    const matchRef  = adminDb.collection('league_matches').doc(String(match_id));
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;
    if (match.status !== 'pending') {
      return NextResponse.json({ error: 'El partido ya fue desafiado.' }, { status: 400 });
    }
    if (match.player1_uid !== uid && match.player2_uid !== uid) {
      return NextResponse.json({ error: 'No sos parte de este partido.' }, { status: 403 });
    }

    await matchRef.update({
      status: 'challenged',
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[pro/challenge]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
