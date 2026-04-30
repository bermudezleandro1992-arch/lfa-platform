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

  const VALID_LIGAS = ['ARG','PER','MEX','COL','VEN','LFA'] as const;

  let body: { texto: string; liga: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const texto = body.texto?.trim() ?? '';
  const liga  = body.liga ?? '';
  if (!texto || texto.length < 1 || texto.length > 280)
    return NextResponse.json({ error: 'Mensaje inválido (1-280 caracteres).' }, { status: 400 });
  if (!(VALID_LIGAS as readonly string[]).includes(liga))
    return NextResponse.json({ error: 'Liga inválida.' }, { status: 400 });

  // Get user data
  const userSnap = await adminDb.collection('usuarios').doc(uid).get();
  if (!userSnap.exists) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  const user = userSnap.data()!;

  // Get team logo if inscribed
  const equipoSnap = await adminDb.collection('liga_pro_equipos').where('uid','==',uid).limit(1).get();
  const logo_url = equipoSnap.empty ? (user.avatar_url ?? null) : (equipoSnap.docs[0].data().logo_url ?? null);
  const nombre = equipoSnap.empty ? (user.nombre ?? 'Jugador') : (equipoSnap.docs[0].data().nombre as string);

  await adminDb.collection('liga_pro_mensajes').add({
    uid, nombre, logo_url, texto, liga,
    ts: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
