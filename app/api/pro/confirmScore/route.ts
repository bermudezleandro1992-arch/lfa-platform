import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const { match_id, score } = await req.json();
    if (!match_id || !score || typeof score !== 'object') {
      return NextResponse.json({ error: 'Faltan campos.' }, { status: 400 });
    }

    const matchRef  = adminDb.collection('league_matches').doc(String(match_id));
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;
    if (match.player1_uid !== uid && match.player2_uid !== uid) {
      return NextResponse.json({ error: 'No sos parte de este partido.' }, { status: 403 });
    }
    if (match.status !== 'challenged' && match.status !== 'validating') {
      return NextResponse.json({ error: 'Estado de partido incorrecto.' }, { status: 400 });
    }
    // If already validating, only the original reporter can update the score
    if (match.status === 'validating' && match.reported_by && match.reported_by !== uid) {
      return NextResponse.json({ error: 'Ya fue reportado por tu rival.' }, { status: 400 });
    }

    // Validate score values
    const s1 = parseInt(score[match.player1_uid]);
    const s2 = parseInt(score[match.player2_uid]);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0 || s1 > 30 || s2 > 30) {
      return NextResponse.json({ error: 'Marcador inválido.' }, { status: 400 });
    }

    const validation_deadline = Date.now() + 10 * 60 * 1000;

    await matchRef.update({
      status: 'validating',
      reported_by: uid,
      score: { [match.player1_uid]: s1, [match.player2_uid]: s2 },
      validation_deadline,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[pro/confirmScore]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
