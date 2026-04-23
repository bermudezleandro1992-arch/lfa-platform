/**
 * /api/audit/retiroDetail
 *
 * Devuelve el perfil de auditoría completo de un usuario para el panel CEO.
 * Incluye:
 *  - Datos del usuario (ip, fingerprint, win rate, fair play)
 *  - Alerta de colusión: usuarios con la misma IP o mismo fingerprint
 *  - Flag de win rate sospechoso (>= 80% con >= 10 partidos)
 *  - Historial de partidos recientes
 *
 * Solo accesible por el CEO.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

export async function GET(req: NextRequest) {
  /* Auth — solo CEO */
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer '))
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (decoded.uid !== CEO_UID)
      return NextResponse.json({ error: 'Solo el CEO.' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid requerido.' }, { status: 400 });

  /* Datos del usuario */
  const userSnap = await adminDb.collection('usuarios').doc(uid).get();
  if (!userSnap.exists)
    return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  const u = userSnap.data()!;
  const ip            = (u.ip || u.ip_conexion || '') as string;
  const fingerprintId = (u.fingerprint_id || '') as string;
  const victorias     = (u.victorias || u.titulos || 0) as number;
  const derrotas      = (u.derrotas || 0) as number;
  const partidos      = (u.partidos_jugados || victorias + derrotas) as number;
  const winRate       = partidos > 0 ? Math.round((victorias / partidos) * 100) : 0;
  const fairPlay      = (u.fair_play ?? 100) as number;

  /* Detección de colusión por IP */
  const colisionIp: { uid: string; nombre: string; ip: string }[] = [];
  if (ip && ip.length > 6) {
    const ipSnap = await adminDb.collection('usuarios')
      .where('ip', '==', ip)
      .limit(10)
      .get();
    ipSnap.forEach(d => {
      if (d.id !== uid) {
        colisionIp.push({ uid: d.id, nombre: d.data().nombre || d.id, ip });
      }
    });
    // También buscar por ip_conexion si ip está vacía
    if (colisionIp.length === 0) {
      const ipConSnap = await adminDb.collection('usuarios')
        .where('ip_conexion', '==', ip)
        .limit(10)
        .get();
      ipConSnap.forEach(d => {
        if (d.id !== uid) {
          colisionIp.push({ uid: d.id, nombre: d.data().nombre || d.id, ip });
        }
      });
    }
  }

  /* Detección de colusión por fingerprint */
  const colisionFp: { uid: string; nombre: string; fp: string }[] = [];
  if (fingerprintId && fingerprintId.length > 4) {
    const fpSnap = await adminDb.collection('usuarios')
      .where('fingerprint_id', '==', fingerprintId)
      .limit(10)
      .get();
    fpSnap.forEach(d => {
      if (d.id !== uid) {
        colisionFp.push({ uid: d.id, nombre: d.data().nombre || d.id, fp: fingerprintId });
      }
    });
  }

  /* Últimos 10 matches del jugador */
  let ultimosMatchs: { id: string; vs: string; winner: string | null; status: string }[] = [];
  try {
    const matchSnap = await adminDb.collection('matches')
      .where('p1', '==', uid)
      .orderBy('created_at', 'desc')
      .limit(5)
      .get();
    const matchSnap2 = await adminDb.collection('matches')
      .where('p2', '==', uid)
      .orderBy('created_at', 'desc')
      .limit(5)
      .get();

    const allDocs = [...matchSnap.docs, ...matchSnap2.docs];
    ultimosMatchs = allDocs.map(d => {
      const m = d.data();
      const vs = m.p1 === uid ? m.p2 : m.p1;
      return { id: d.id, vs, winner: m.winner || null, status: m.status };
    });
  } catch { /* índice puede no existir */ }

  /* Alertas consolidadas */
  const alertas: string[] = [];
  if (colisionIp.length > 0)
    alertas.push(`⚠️ MISMA IP con ${colisionIp.map(c => c.nombre).join(', ')}`);
  if (colisionFp.length > 0)
    alertas.push(`🖥️ MISMO DEVICE con ${colisionFp.map(c => c.nombre).join(', ')}`);
  if (winRate >= 80 && partidos >= 10)
    alertas.push(`📈 WIN RATE ${winRate}% en ${partidos} partidos — SOSPECHOSO`);
  if (fairPlay < 30)
    alertas.push(`💔 FAIR PLAY muy bajo: ${fairPlay}%`);

  return NextResponse.json({
    uid,
    nombre:       u.nombre || '',
    email:        u.email || '',
    ip,
    fingerprintId,
    winRate,
    partidos,
    victorias,
    derrotas,
    fairPlay,
    saldo:        u.number || 0,
    colisionIp,
    colisionFp,
    ultimosMatchs,
    alertas,
    riesgo: alertas.length === 0 ? 'OK' : alertas.length === 1 ? 'MEDIO' : 'ALTO',
  });
}
