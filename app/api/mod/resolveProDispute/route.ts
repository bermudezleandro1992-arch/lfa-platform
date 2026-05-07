/**
 * /api/mod/resolveProDispute
 * Moderadores, soporte y CEO pueden resolver disputas de partidos de Ligas PRO.
 * Misma lógica que /api/pro/resolveDispute pero accesible a moderadores.
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
    const rol = snap.data()?.rol as string | undefined;
    return rol && STAFF_ROLES.includes(rol) ? uid : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const staffUid = await verifyStaff(req);
  if (!staffUid)
    return NextResponse.json({ error: 'No autorizado. Solo moderadores o soporte.' }, { status: 403 });

  let body: { match_id?: unknown; resolution?: unknown; score1?: unknown; score2?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Body inválido.' }, { status: 400 }); }

  const match_id   = typeof body.match_id   === 'string' ? body.match_id.trim() : '';
  const resolution = typeof body.resolution === 'string' ? body.resolution.trim() : '';

  if (!match_id || !['p1', 'p2', 'draw', 'annul'].includes(resolution))
    return NextResponse.json({ error: 'match_id y resolution (p1|p2|draw|annul) requeridos.' }, { status: 400 });

  const matchRef  = adminDb.collection('league_matches').doc(match_id);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });

  const match = matchSnap.data()!;

  if (resolution === 'annul') {
    await matchRef.update({
      status: 'pending',
      dispute_reason: null,
      reported_by: null,
      score: null,
      resolved_by: staffUid,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, resolution: 'annulled' });
  }

  const winner_uid = resolution === 'p1' ? match.player1_uid
    : resolution === 'p2' ? match.player2_uid : 'draw';

  /* Use stored score or derive from resolution */
  const s1 = typeof body.score1 === 'number' ? body.score1
    : (match.score?.[match.player1_uid] ?? (resolution === 'draw' ? 0 : resolution === 'p1' ? 1 : 0));
  const s2 = typeof body.score2 === 'number' ? body.score2
    : (match.score?.[match.player2_uid] ?? (resolution === 'draw' ? 0 : resolution === 'p2' ? 1 : 0));

  const leagueRef = adminDb.collection('leagues').doc(match.league_id);
  const batch     = adminDb.batch();

  batch.update(matchRef, {
    status:       'closed',
    winner_uid,
    score: { [match.player1_uid]: s1, [match.player2_uid]: s2 },
    mod_resolved: true,
    resolved_by:  staffUid,
    updated_at:   new Date().toISOString(),
  });

  const p1Ref = leagueRef.collection('participants').doc(match.player1_uid);
  const p2Ref = leagueRef.collection('participants').doc(match.player2_uid);

  batch.update(p1Ref, {
    pj:  FieldValue.increment(1),
    gf:  FieldValue.increment(s1),
    gc:  FieldValue.increment(s2),
    pg:  FieldValue.increment(winner_uid === match.player1_uid ? 1 : 0),
    pe:  FieldValue.increment(winner_uid === 'draw' ? 1 : 0),
    pp:  FieldValue.increment(winner_uid === match.player2_uid ? 1 : 0),
    pts: FieldValue.increment(winner_uid === match.player1_uid ? 3 : winner_uid === 'draw' ? 1 : 0),
  });

  batch.update(p2Ref, {
    pj:  FieldValue.increment(1),
    gf:  FieldValue.increment(s2),
    gc:  FieldValue.increment(s1),
    pg:  FieldValue.increment(winner_uid === match.player2_uid ? 1 : 0),
    pe:  FieldValue.increment(winner_uid === 'draw' ? 1 : 0),
    pp:  FieldValue.increment(winner_uid === match.player1_uid ? 1 : 0),
    pts: FieldValue.increment(winner_uid === match.player2_uid ? 3 : winner_uid === 'draw' ? 1 : 0),
  });

  await batch.commit();
  return NextResponse.json({ success: true, winner_uid });
}
