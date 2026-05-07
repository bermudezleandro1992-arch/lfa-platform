/**
 * /api/mod/resolveClassicDispute
 * Moderadores (rol='mod'), soporte y CEO pueden resolver disputas de torneos clásicos.
 * Misma lógica que /api/ceo/resolveDispute pero accesible a moderadores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const STAFF_ROLES = ['mod', 'soporte'];

type ResolveVerdict = 'reporter_wins' | 'disputer_wins' | 'no_evidence' | 'rematch';

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

  let body: { disputaId?: unknown; matchId?: unknown; verdict?: unknown; notas?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Body inválido.' }, { status: 400 }); }

  const disputaId = typeof body.disputaId === 'string' ? body.disputaId.trim() : '';
  const matchId   = typeof body.matchId   === 'string' ? body.matchId.trim()   : '';
  const verdict   = typeof body.verdict   === 'string' ? body.verdict.trim()   : '';
  const notas     = typeof body.notas     === 'string' ? body.notas.trim()     : '';

  const validVerdicts: ResolveVerdict[] = ['reporter_wins', 'disputer_wins', 'no_evidence', 'rematch'];
  if (!disputaId || !matchId || !validVerdicts.includes(verdict as ResolveVerdict))
    return NextResponse.json({ error: 'disputaId, matchId y verdict válido son requeridos.' }, { status: 400 });

  const [matchSnap, disputaSnap] = await Promise.all([
    adminDb.collection('matches').doc(matchId).get(),
    adminDb.collection('disputas').doc(disputaId).get(),
  ]);

  if (!matchSnap.exists)   return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });
  if (!disputaSnap.exists) return NextResponse.json({ error: 'Disputa no encontrada.' }, { status: 404 });

  const match   = matchSnap.data()!;
  const disputa = disputaSnap.data()!;
  const reporterId = match.reported_by as string;
  const disputerId = disputa.disputedBy  as string;

  /* Fair Play consequences */
  type FP = { uid: string; delta: number; reason: string };
  const fps: FP[] = verdict === 'reporter_wins'
    ? [{ uid: disputerId, delta: -20, reason: 'Disputa rechazada sin evidencia válida' }]
    : verdict === 'disputer_wins'
    ? [{ uid: reporterId, delta: -30, reason: 'Reportó resultado falso (trampa detectada)' }]
    : verdict === 'no_evidence'
    ? [{ uid: reporterId, delta: -10, reason: 'Resultado sin evidencia clara' }, { uid: disputerId, delta: -10, reason: 'Disputa sin evidencia clara' }]
    : [];

  const matchWinner = verdict === 'reporter_wins' ? reporterId
    : verdict === 'disputer_wins' ? disputerId : null;
  const matchStatus = verdict === 'rematch' ? 'WAITING' : matchWinner ? 'FINISHED' : 'STAFF_PENDING';

  const batch = adminDb.batch();

  for (const fp of fps) {
    batch.update(adminDb.collection('usuarios').doc(fp.uid), {
      fair_play: FieldValue.increment(fp.delta),
    });
    batch.set(adminDb.collection('fair_play_log').doc(), {
      uid: fp.uid, delta: fp.delta, reason: fp.reason,
      matchId, resolvedBy: staffUid, timestamp: FieldValue.serverTimestamp(),
    });
  }

  batch.update(adminDb.collection('matches').doc(matchId), {
    status:       matchStatus,
    winner:       matchWinner,
    ceo_override: true,
    resolved_by:  staffUid,
    updated_at:   FieldValue.serverTimestamp(),
    ...(notas ? { staff_notes: notas } : {}),
  });

  batch.update(adminDb.collection('disputas').doc(disputaId), {
    status:      'RESOLVED',
    verdict,
    resolved_by: staffUid,
    resolved_at: FieldValue.serverTimestamp(),
    ...(notas ? { notas } : {}),
  });

  await batch.commit();
  return NextResponse.json({ success: true, verdict });
}
