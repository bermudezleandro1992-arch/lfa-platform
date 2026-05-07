/**
 * app/api/checkin/route.ts
 * Registro de Check-in del jugador antes del partido.
 *
 * Solo el jugador p1 o p2 del match puede hacer check-in.
 * Almacena p1_ready / p2_ready en el documento del match.
 * El MatchRoom mostrará el botón de "REPORTAR RESULTADO"
 * solo cuando ambos hayan hecho check-in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue }                from 'firebase-admin/firestore';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  /* 1 ── Verificar JWT ──────────────────────── */
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  /* 2 ── Validar body ───────────────────────── */
  let body: { matchId?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : '';
  if (!matchId) {
    return NextResponse.json({ error: 'matchId requerido.' }, { status: 400 });
  }

  /* 3 ── Verificar que el usuario es p1 o p2 ── */
  const matchRef  = adminDb.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });
  }
  const matchData = matchSnap.data()!;

  if (matchData.status === 'FINISHED') {
    return NextResponse.json({ error: 'El partido ya finalizó.' }, { status: 400 });
  }

  let field: 'p1_ready' | 'p2_ready';
  if      (matchData.p1 === uid) field = 'p1_ready';
  else if (matchData.p2 === uid) field = 'p2_ready';
  else return NextResponse.json({ error: 'No sos participante de este partido.' }, { status: 403 });

  /* 4 ── Registrar check-in ─────────────────── */
  await matchRef.update({
    [field]:          true,
    [`${field}_at`]:  FieldValue.serverTimestamp(),
  });

  const updated   = await matchRef.get();
  const bothReady = updated.data()?.p1_ready === true && updated.data()?.p2_ready === true;

  return NextResponse.json({
    ok:        true,
    field,
    bothReady,
    message:   bothReady
      ? '✅ Ambos jugadores confirmaron presencia. ¡El partido puede comenzar!'
      : '✓ Check-in registrado. Esperando confirmación del rival.',
  });
}
