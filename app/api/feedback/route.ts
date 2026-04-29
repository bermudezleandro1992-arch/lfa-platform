import { adminDb } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

const TIPOS_VALIDOS = ['sugerencia', 'bug', 'valoracion', 'otro'] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nombre, tipo, mensaje, estrellas, uid } = body as {
      nombre?: string;
      tipo?: string;
      mensaje?: string;
      estrellas?: number;
      uid?: string;
    };

    // Validaciones
    if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 1 || nombre.trim().length > 60)
      return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });

    if (!tipo || !TIPOS_VALIDOS.includes(tipo as typeof TIPOS_VALIDOS[number]))
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });

    if (!mensaje || typeof mensaje !== 'string' || mensaje.trim().length < 10 || mensaje.trim().length > 600)
      return NextResponse.json({ error: 'El mensaje debe tener entre 10 y 600 caracteres' }, { status: 400 });

    if (tipo === 'valoracion' && (typeof estrellas !== 'number' || estrellas < 1 || estrellas > 5))
      return NextResponse.json({ error: 'Puntuación inválida' }, { status: 400 });

    // Anti-spam: máx 3 feedbacks por usuario por día
    if (uid) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const spamCheck = await adminDb.collection('feedback')
        .where('uid', '==', uid)
        .where('creado_en', '>=', hoy)
        .count()
        .get();
      if (spamCheck.data().count >= 3)
        return NextResponse.json({ error: 'Límite diario de feedback alcanzado (máx 3)' }, { status: 429 });
    }

    await adminDb.collection('feedback').add({
      nombre:     nombre.trim(),
      tipo,
      mensaje:    mensaje.trim(),
      estrellas:  tipo === 'valoracion' ? estrellas : null,
      uid:        uid ?? null,
      estado:     'pendiente',
      creado_en:  FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[feedback]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
