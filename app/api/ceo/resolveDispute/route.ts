/**
 * /api/ceo/resolveDispute
 *
 * El CEO o Staff resuelve una disputa de partido y aplica consecuencias
 * de Fair Play automáticamente según el veredicto.
 *
 * Veredictos posibles:
 *   - 'reporter_wins':   El resultado reportado era correcto. El que disputó pierde FP.
 *   - 'disputer_wins':   El reportador mintió. El reportador pierde FP.
 *   - 'no_evidence':     Nadie tiene pruebas claras. Ambos pierden FP leve.
 *   - 'rematch':         Se ordena un rematch. No hay penalización.
 *
 * Fair Play rules:
 *   - Reclamar sin pruebas o con prueba falsa:  -20 FP
 *   - Reportar resultado falso (trampa):         -30 FP
 *   - Ambos sin evidencia:                       -10 FP cada uno
 *   - FP mínimo: 0, máximo: 100
 *
 * Si FP < 40 → acceso a salas pagas bloqueado automáticamente (se hace en joinTournament)
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

type ResolveVerdict = 'reporter_wins' | 'disputer_wins' | 'no_evidence' | 'rematch';

interface FPConsequence { uid: string; delta: number; reason: string }

function computeConsequences(
  verdict: ResolveVerdict,
  reporterId: string,
  disputerId: string,
): FPConsequence[] {
  switch (verdict) {
    case 'reporter_wins':
      return [{ uid: disputerId, delta: -20, reason: 'Disputa rechazada sin evidencia válida' }];
    case 'disputer_wins':
      return [{ uid: reporterId, delta: -30, reason: 'Reportó resultado falso (trampa detectada)' }];
    case 'no_evidence':
      return [
        { uid: reporterId, delta: -10, reason: 'Resultado sin evidencia clara' },
        { uid: disputerId, delta: -10, reason: 'Disputa sin evidencia clara' },
      ];
    case 'rematch':
      return [];
  }
}

export async function POST(req: NextRequest) {
  /* Auth — CEO o soporte */
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer '))
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const staffUid = decoded.uid;
    if (staffUid !== CEO_UID) {
      const staffSnap = await adminDb.collection('usuarios').doc(staffUid).get();
      if (staffSnap.data()?.rol !== 'soporte')
        return NextResponse.json({ error: 'Solo CEO o soporte.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  const { disputaId, matchId, verdict, notas } = await req.json() as {
    disputaId: string; matchId: string; verdict: ResolveVerdict; notas?: string;
  };

  if (!disputaId || !matchId || !verdict)
    return NextResponse.json({ error: 'disputaId, matchId y verdict son requeridos.' }, { status: 400 });

  const validVerdicts: ResolveVerdict[] = ['reporter_wins', 'disputer_wins', 'no_evidence', 'rematch'];
  if (!validVerdicts.includes(verdict))
    return NextResponse.json({ error: 'Veredicto inválido.' }, { status: 400 });

  /* Obtener match y disputa */
  const [matchSnap, disputaSnap] = await Promise.all([
    adminDb.collection('matches').doc(matchId).get(),
    adminDb.collection('disputas').doc(disputaId).get(),
  ]);

  if (!matchSnap.exists)   return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });
  if (!disputaSnap.exists) return NextResponse.json({ error: 'Disputa no encontrada.' }, { status: 404 });

  const match   = matchSnap.data()!;
  const disputa = disputaSnap.data()!;

  const reporterId = match.reported_by as string;
  const disputerId = disputa.disputedBy as string;

  const consequences = computeConsequences(verdict, reporterId, disputerId);

  /* Determinar ganador del match según veredicto */
  const matchWinner = verdict === 'reporter_wins'
    ? reporterId
    : verdict === 'disputer_wins'
      ? disputerId
      : null; // rematch o no_evidence → pendiente

  const matchStatus = verdict === 'rematch' ? 'WAITING' : matchWinner ? 'FINISHED' : 'STAFF_PENDING';

  /* Aplicar todo en batch */
  const batch = adminDb.batch();

  /* Actualizar Fair Play de los jugadores */
  for (const c of consequences) {
    const uRef = adminDb.collection('usuarios').doc(c.uid);
    batch.update(uRef, { fair_play: FieldValue.increment(c.delta) });

    /* Log de penalización en colección fair_play_log */
    batch.set(adminDb.collection('fair_play_log').doc(), {
      uid:       c.uid,
      delta:     c.delta,
      reason:    c.reason,
      matchId,
      disputaId,
      verdict,
      resolved_by: req.headers.get('authorization')?.slice(7) ? 'staff' : 'system',
      created_at: FieldValue.serverTimestamp(),
    });
  }

  /* Actualizar match */
  batch.update(adminDb.collection('matches').doc(matchId), {
    status:         matchStatus,
    winner:         matchWinner,
    dispute_verdict: verdict,
    updated_at:     FieldValue.serverTimestamp(),
  });

  /* Cerrar disputa */
  batch.update(adminDb.collection('disputas').doc(disputaId), {
    status:      'RESOLVED',
    verdict,
    notas:       notas?.trim() ?? '',
    resolved_at: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  /* Publicar en cantina el resultado de la disputa */
  const verdictMsg = {
    reporter_wins: `✅ Disputa resuelta. El resultado original fue **VALIDADO**. Se aplicaron penalizaciones de Fair Play según corresponde.`,
    disputer_wins: `⚖️ Disputa resuelta. Se detectó un resultado incorrecto. Se revirtió el match y se aplicaron sanciones.`,
    no_evidence:   `🔍 Disputa resuelta sin evidencia clara. Ambos jugadores reciben penalización leve de Fair Play.`,
    rematch:       `🔄 El Staff ordenó un **REMATCH**. El partido debe jugarse nuevamente.`,
  }[verdict];

  await adminDb.collection('cantina_messages').add({
    uid:          'BOT_LFA',
    nombre:       '⚖️ STAFF LFA',
    avatar_url:   null,
    rol:          'bot',
    texto:        verdictMsg + (notas ? ` | Nota: ${notas}` : ''),
    is_bot_staff: true,
    match_id:     matchId,
    disputa_id:   disputaId,
    timestamp:    FieldValue.serverTimestamp(),
    deleted:      false,
  });

  /* Clamp fair_play a [0, 100] — Firestore no soporta clamp nativo, lo hacemos en un segundo paso */
  for (const c of consequences) {
    const snap = await adminDb.collection('usuarios').doc(c.uid).get();
    const fp   = snap.data()?.fair_play ?? 100;
    if (fp < 0)   await adminDb.collection('usuarios').doc(c.uid).update({ fair_play: 0 });
    if (fp > 100) await adminDb.collection('usuarios').doc(c.uid).update({ fair_play: 100 });
  }

  return NextResponse.json({
    success: true,
    verdict,
    consequences,
    matchWinner,
    matchStatus,
  });
}
