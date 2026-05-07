/**
 * /api/mod/warnPlayer
 * Moderadores, soporte y CEO pueden advertir a un jugador.
 * La advertencia reduce Fair Play en 10 puntos y registra el motivo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const CEO_UID    = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const STAFF_ROLES = ['mod', 'soporte'];
const FP_WARN_DELTA = -10;

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

  let body: { target_uid?: unknown; motivo?: unknown; fp_delta?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Body inválido.' }, { status: 400 }); }

  const target_uid = typeof body.target_uid === 'string' ? body.target_uid.trim() : '';
  const motivo     = typeof body.motivo     === 'string' ? body.motivo.trim()     : '';
  /* fp_delta es negativo, por defecto -10. Mods no pueden quitar más de -20. */
  let fp_delta = typeof body.fp_delta === 'number' ? body.fp_delta : FP_WARN_DELTA;
  if (fp_delta > 0)   fp_delta = FP_WARN_DELTA;  // solo negativo
  if (fp_delta < -20) fp_delta = -20;             // máximo -20 para mods

  if (!target_uid || !motivo)
    return NextResponse.json({ error: 'target_uid y motivo son requeridos.' }, { status: 400 });

  const userRef  = adminDb.collection('usuarios').doc(target_uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists)
    return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  const batch = adminDb.batch();

  batch.update(userRef, {
    fair_play: FieldValue.increment(fp_delta),
  });

  batch.set(adminDb.collection('fair_play_log').doc(), {
    uid:        target_uid,
    delta:      fp_delta,
    reason:     motivo,
    type:       'staff_warning',
    issued_by:  staffUid,
    timestamp:  FieldValue.serverTimestamp(),
  });

  batch.set(adminDb.collection('mod_actions').doc(), {
    action:     'warn_player',
    target_uid,
    fp_delta,
    motivo,
    staff_uid:  staffUid,
    created_at: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  const currentFP = (userSnap.data()?.fair_play ?? 100) as number;
  const newFP     = Math.max(0, currentFP + fp_delta);

  return NextResponse.json({ success: true, new_fair_play: newFP, fp_delta });
}
