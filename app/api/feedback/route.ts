import { adminDb } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

const TIPOS_VALIDOS = ['sugerencia', 'bug', 'valoracion', 'otro'] as const;

/** Elimina tags HTML y caracteres peligrosos */
function sanitize(str: string): string {
  return str
    .replace(/<[^>]*>/g, '')          // strip HTML tags
    .replace(/[<>&"'`]/g, c =>        // encode special chars
      ({ '<': '', '>': '', '&': '&', '"': '', "'": '', '`': '' }[c] ?? c))
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    // Leer IP para rate-limit de anónimos
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            ?? req.headers.get('x-real-ip')
            ?? 'unknown';

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object')
      return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });

    const { nombre, tipo, mensaje, estrellas, uid } = body as Record<string, unknown>;

    // ── Validaciones ──────────────────────────────────────
    if (typeof nombre !== 'string' || nombre.trim().length < 1 || nombre.trim().length > 60)
      return NextResponse.json({ error: 'Nombre inválido (1–60 caracteres)' }, { status: 400 });

    if (!tipo || !TIPOS_VALIDOS.includes(tipo as typeof TIPOS_VALIDOS[number]))
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });

    if (typeof mensaje !== 'string' || mensaje.trim().length < 10 || mensaje.trim().length > 600)
      return NextResponse.json({ error: 'El mensaje debe tener entre 10 y 600 caracteres' }, { status: 400 });

    if (tipo === 'valoracion' && (typeof estrellas !== 'number' || estrellas < 1 || estrellas > 5))
      return NextResponse.json({ error: 'Puntuación inválida (1–5)' }, { status: 400 });

    // ── Rate limit (sin query compuesta — usa doc por uid/ip+fecha) ──
    const todayKey = new Date().toISOString().slice(0, 10); // "2026-04-29"
    const rateLimitId = `${typeof uid === 'string' && uid ? uid : `ip_${ip}`}_${todayKey}`;
    const rateLimitRef = adminDb.collection('feedback_rate_limits').doc(rateLimitId);

    const rateLimitSnap = await rateLimitRef.get();
    const currentCount = rateLimitSnap.exists ? (rateLimitSnap.data()?.count ?? 0) : 0;
    if (currentCount >= 3)
      return NextResponse.json({ error: 'Límite diario alcanzado (máx 3 feedbacks por día)' }, { status: 429 });

    // ── Sanitizar y guardar ──────────────────────────────
    const nombreLimpio  = sanitize(String(nombre));
    const mensajeLimpio = sanitize(String(mensaje));

    const batch = adminDb.batch();
    const feedbackRef = adminDb.collection('feedback').doc();
    batch.set(feedbackRef, {
      nombre:    nombreLimpio,
      tipo,
      mensaje:   mensajeLimpio,
      estrellas: tipo === 'valoracion' ? Number(estrellas) : null,
      uid:       typeof uid === 'string' && uid ? uid : null,
      ip,
      estado:    'pendiente',
      creado_en: FieldValue.serverTimestamp(),
    });
    batch.set(rateLimitRef, { count: FieldValue.increment(1), uid: uid ?? null, fecha: todayKey }, { merge: true });
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[feedback]', e);
    return NextResponse.json({ error: 'Error al procesar. Intentá de nuevo.' }, { status: 500 });
  }
}
