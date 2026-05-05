import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';

/**
 * Save profile data for the authenticated user.
 * Updates: usuarios/{uid} and pro_global_ranking/{uid} (name/logo only).
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const body = await req.json();

    // Allowed fields (sanitize)
    const allowed = ['team_name', 'logo_url', 'konami_id', 'ea_id', 'whatsapp', 'pais', 'provincia', 'consola', 'display_name'];
    const update: Record<string, string> = {};
    for (const key of allowed) {
      if (typeof body[key] === 'string') {
        update[key] = body[key].trim().slice(0, 120);
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nada para guardar.' }, { status: 400 });
    }

    // Update usuarios doc (user profile)
    const userRef = adminDb.collection('usuarios').doc(uid);
    await userRef.set(update, { merge: true });

    // Update pro_global_ranking with public display info
    const rankingUpdate: Record<string, string> = {};
    if (update.team_name)    rankingUpdate.team_name    = update.team_name;
    if (update.logo_url)     rankingUpdate.logo_url     = update.logo_url;
    if (update.display_name) rankingUpdate.display_name = update.display_name;
    if (update.pais)         rankingUpdate.pais         = update.pais;

    if (Object.keys(rankingUpdate).length > 0) {
      await adminDb.collection('pro_global_ranking').doc(uid).set(rankingUpdate, { merge: true });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[pro/saveProfile]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
