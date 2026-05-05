import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const BATCH_LIMIT = 490; // Firestore batch max is 500

async function deleteCollection(collectionRef: FirebaseFirestore.CollectionReference) {
  const snap = await collectionRef.get();
  if (snap.empty) return;

  // Process in chunks of BATCH_LIMIT
  const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    chunks.push(snap.docs.slice(i, i + BATCH_LIMIT));
  }
  for (const chunk of chunks) {
    const batch = adminDb.batch();
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

/**
 * POST { league_id }
 * CEO-only: deletes a league + all its participants + all its league_matches
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid || uid !== CEO_UID) {
      return NextResponse.json({ error: 'Solo el CEO puede limpiar ligas.' }, { status: 403 });
    }

    const { league_id } = await req.json();
    if (!league_id) return NextResponse.json({ error: 'Falta league_id.' }, { status: 400 });

    const leagueRef = adminDb.collection('leagues').doc(String(league_id));
    const leagueSnap = await leagueRef.get();
    if (!leagueSnap.exists) {
      return NextResponse.json({ error: 'Liga no encontrada.' }, { status: 404 });
    }

    // 1. Delete all participants subcollection
    await deleteCollection(leagueRef.collection('participants'));

    // 2. Delete all league_matches for this league
    const matchSnap = await adminDb.collection('league_matches')
      .where('league_id', '==', String(league_id))
      .get();

    if (!matchSnap.empty) {
      const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
      for (let i = 0; i < matchSnap.docs.length; i += BATCH_LIMIT) {
        chunks.push(matchSnap.docs.slice(i, i + BATCH_LIMIT));
      }
      for (const chunk of chunks) {
        const batch = adminDb.batch();
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // 3. Delete pro_notifications for matches of this league
    const notifSnap = await adminDb.collection('pro_notifications')
      .where('league_id', '==', String(league_id))
      .get();
    if (!notifSnap.empty) {
      const batch = adminDb.batch();
      notifSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // 4. Delete the league doc itself
    await leagueRef.delete();

    return NextResponse.json({
      success: true,
      deleted: {
        matches: matchSnap.size,
        notifications: notifSnap.size,
      },
    });
  } catch (err) {
    console.error('[pro/clearLeague]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
