import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { getApps, getApp, initializeApp, cert } from 'firebase-admin/app';

function getAdminApp() {
  return getApps().length > 0 ? getApp() : initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

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

  const formData = await req.formData();
  const file      = formData.get('file') as File | null;
  const partidoId = (formData.get('partidoId') as string | null) ?? 'unknown';

  if (!file) return NextResponse.json({ error: 'Archivo requerido.' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: 'Imagen demasiado grande (máx 5MB).' }, { status: 400 });
  if (!file.type.startsWith('image/'))
    return NextResponse.json({ error: 'Solo se permiten imágenes.' }, { status: 400 });

  const ext    = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi,'') ?? 'jpg';
  const path   = `liga_pro/${uid}/${partidoId}_${Date.now()}.${ext}`;
  const bucket = getStorage(getAdminApp()).bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? undefined);
  const fileRef = bucket.file(path);
  const buffer  = Buffer.from(await file.arrayBuffer());

  await fileRef.save(buffer, { contentType: file.type, resumable: false });
  await fileRef.makePublic();

  const url = `https://storage.googleapis.com/${bucket.name}/${path}`;
  return NextResponse.json({ url });
}
