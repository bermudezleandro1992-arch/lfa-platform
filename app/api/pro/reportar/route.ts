import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer '))
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  let body: { partidoId: string; goles_local: number; goles_visit: number; screenshot_url?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const { partidoId, goles_local, goles_visit, screenshot_url } = body;
  if (!partidoId) return NextResponse.json({ error: 'partidoId requerido.' }, { status: 400 });
  if (typeof goles_local !== 'number' || typeof goles_visit !== 'number' || goles_local < 0 || goles_visit < 0)
    return NextResponse.json({ error: 'Marcador inválido.' }, { status: 400 });

  // Validate screenshot URL if provided
  if (screenshot_url && typeof screenshot_url === 'string' && screenshot_url.trim()) {
    const u = screenshot_url.trim();
    if (!u.startsWith('https://firebasestorage.googleapis.com/') && !u.startsWith('https://storage.googleapis.com/'))
      return NextResponse.json({ error: 'URL de screenshot no válida.' }, { status: 400 });
  }

  // Get partido
  const partidoRef = adminDb.collection('liga_pro_partidos').doc(partidoId);
  const partidoSnap = await partidoRef.get();
  if (!partidoSnap.exists) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });
  const partido = partidoSnap.data()!;

  if (partido.status !== 'PENDIENTE')
    return NextResponse.json({ error: 'Este partido ya tiene un resultado reportado.' }, { status: 400 });

  // Get reporter's team
  const miEquipoSnap = await adminDb.collection('liga_pro_equipos').where('uid','==',uid).limit(1).get();
  if (miEquipoSnap.empty)
    return NextResponse.json({ error: 'No estás inscripto en la Liga LFA.' }, { status: 403 });
  const miEquipo = miEquipoSnap.docs[0];

  if (miEquipo.id !== partido.equipo_local_id && miEquipo.id !== partido.equipo_visit_id)
    return NextResponse.json({ error: 'No participás en este partido.' }, { status: 403 });

  const esLocal = miEquipo.id === partido.equipo_local_id;
  const newStatus = esLocal ? 'REPORTE_LOCAL' : 'REPORTE_VISIT';

  await partidoRef.update({
    goles_local,
    goles_visit,
    status: newStatus,
    screenshot_url: screenshot_url ?? null,
    reportado_por: uid,
    reportado_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
