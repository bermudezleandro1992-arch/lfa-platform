/**
 * /api/mod/forceProResult
 * Moderadores, soporte y CEO pueden forzar el resultado de un partido de Liga PRO.
 * Permite establecer marcador exacto y cerrar el partido.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const CEO_UID    = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const STAFF_ROLES = ['mod', 'soporte'];

async function verifyStaff(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const uid = decoded.uid;
    if (uid === CEO_UID) return uid;
    const snap = await adminDb.collection('usuarios').doc(uid).get();
    const rol  = snap.data()?.rol as string | undefined;
    return rol && STAFF_ROLES.includes(rol) ? uid : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const staffUid = await verifyStaff(req);
  if (!staffUid)
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

  let body: { match_id?: unknown; score1?: unknown; score2?: unknown; winner_side?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Body inválido.' }, { status: 400 }); }

  const match_id    = typeof body.match_id    === 'string' ? body.match_id.trim() : '';
  const winner_side = typeof body.winner_side === 'string' ? body.winner_side.trim() : ''; // 'p1'|'p2'|'draw'
  const score1      = typeof body.score1 === 'number' ? body.score1 : 0;
  const score2      = typeof body.score2 === 'number' ? body.score2 : 0;

  if (!match_id || !['p1', 'p2', 'draw'].includes(winner_side))
    return NextResponse.json({ error: 'match_id y winner_side (p1|p2|draw) requeridos.' }, { status: 400 });

  const matchRef  = adminDb.collection('league_matches').doc(match_id);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });

  const match = matchSnap.data()!;
  if (match.status === 'closed')
    return NextResponse.json({ error: 'El partido ya está cerrado.' }, { status: 400 });

  const winner_uid = winner_side === 'p1' ? match.player1_uid
    : winner_side === 'p2' ? match.player2_uid : 'draw';

  const leagueRef = adminDb.collection('leagues').doc(match.league_id as string);
  const batch     = adminDb.batch();

  batch.update(matchRef, {
    status:       'closed',
    winner_uid,
    score: { [match.player1_uid]: score1, [match.player2_uid]: score2 },
    mod_override: true,
    resolved_by:  staffUid,
    updated_at:   new Date().toISOString(),
  });

  const p1Ref = leagueRef.collection('participants').doc(match.player1_uid as string);
  const p2Ref = leagueRef.collection('participants').doc(match.player2_uid as string);

  const p1Wins = winner_uid === match.player1_uid;
  const p2Wins = winner_uid === match.player2_uid;
  const isDraw = winner_uid === 'draw';

  batch.update(p1Ref, {
    pj:  FieldValue.increment(1),
    gf:  FieldValue.increment(score1),
    gc:  FieldValue.increment(score2),
    pg:  FieldValue.increment(p1Wins ? 1 : 0),
    pe:  FieldValue.increment(isDraw  ? 1 : 0),
    pp:  FieldValue.increment(p2Wins  ? 1 : 0),
    pts: FieldValue.increment(p1Wins ? 3 : isDraw ? 1 : 0),
  });

  batch.update(p2Ref, {
    pj:  FieldValue.increment(1),
    gf:  FieldValue.increment(score2),
    gc:  FieldValue.increment(score1),
    pg:  FieldValue.increment(p2Wins ? 1 : 0),
    pe:  FieldValue.increment(isDraw  ? 1 : 0),
    pp:  FieldValue.increment(p1Wins  ? 1 : 0),
    pts: FieldValue.increment(p2Wins ? 3 : isDraw ? 1 : 0),
  });

  await batch.commit();

  return NextResponse.json({ success: true, winner_uid, score1, score2 });
}
