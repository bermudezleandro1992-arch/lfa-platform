import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';
import { TOS_CURRENT_VERSION }       from '@/lib/constants';
import { getClientIp }               from '@/lib/rateLimiter';

/**
 * POST /api/tos/accept
 *
 * Registra la aceptación de los Términos y Condiciones en la colección
 * `tos_acceptances` para auditoría legal.
 *
 * Campos guardados:
 *   uid, ip, user_agent, version_tos, timestamp
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid     = decoded.uid;

    const ip         = getClientIp(req);
    const user_agent = req.headers.get('user-agent') ?? 'unknown';

    await adminDb.collection('tos_acceptances').add({
      uid,
      ip,
      user_agent,
      version_tos: TOS_CURRENT_VERSION,
      timestamp:   FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
