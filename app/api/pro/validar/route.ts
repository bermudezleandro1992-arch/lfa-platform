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

  let body: { partidoId: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const { partidoId } = body;
  if (!partidoId) return NextResponse.json({ error: 'partidoId requerido.' }, { status: 400 });

  const partidoRef = adminDb.collection('liga_pro_partidos').doc(partidoId);
  const partidoSnap = await partidoRef.get();
  if (!partidoSnap.exists) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });
  const partido = partidoSnap.data()!;

  if (partido.status !== 'REPORTE_LOCAL' && partido.status !== 'REPORTE_VISIT')
    return NextResponse.json({ error: 'No hay resultado pendiente de validación.' }, { status: 400 });

  // Get validator's team
  const miEquipoSnap = await adminDb.collection('liga_pro_equipos').where('uid','==',uid).limit(1).get();
  if (miEquipoSnap.empty)
    return NextResponse.json({ error: 'No estás inscripto en la Liga LFA.' }, { status: 403 });
  const miEquipo = miEquipoSnap.docs[0];

  // The one who validates must be the OTHER team (not the one who reported)
  if (partido.reportado_por === uid)
    return NextResponse.json({ error: 'No podés validar tu propio resultado. Esperá que el rival valide.' }, { status: 403 });

  if (miEquipo.id !== partido.equipo_local_id && miEquipo.id !== partido.equipo_visit_id)
    return NextResponse.json({ error: 'No participás en este partido.' }, { status: 403 });

  const gLocal = partido.goles_local as number;
  const gVisit = partido.goles_visit as number;

  // Determine winner and points
  let localPts = 0, visitPts = 0;
  let localPg = 0, localPe = 0, localPp = 0;
  let visitPg = 0, visitPe = 0, visitPp = 0;

  if (gLocal > gVisit) { localPts = 3; localPg = 1; visitPp = 1; }
  else if (gLocal < gVisit) { visitPts = 3; visitPg = 1; localPp = 1; }
  else { localPts = 1; visitPts = 1; localPe = 1; visitPe = 1; }

  const localRef = adminDb.collection('liga_pro_equipos').doc(partido.equipo_local_id as string);
  const visitRef = adminDb.collection('liga_pro_equipos').doc(partido.equipo_visit_id as string);

  await adminDb.runTransaction(async (tx) => {
    tx.update(partidoRef, {
      status: 'VALIDADO',
      validado_at: FieldValue.serverTimestamp(),
      validado_por: uid,
    });
    tx.update(localRef, {
      pts: FieldValue.increment(localPts),
      pg:  FieldValue.increment(localPg),
      pe:  FieldValue.increment(localPe),
      pp:  FieldValue.increment(localPp),
      gf:  FieldValue.increment(gLocal),
      gc:  FieldValue.increment(gVisit),
    });
    tx.update(visitRef, {
      pts: FieldValue.increment(visitPts),
      pg:  FieldValue.increment(visitPg),
      pe:  FieldValue.increment(visitPe),
      pp:  FieldValue.increment(visitPp),
      gf:  FieldValue.increment(gVisit),
      gc:  FieldValue.increment(gLocal),
    });
  });

  return NextResponse.json({ success: true });
}
