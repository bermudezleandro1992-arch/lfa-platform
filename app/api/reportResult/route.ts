import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue, Timestamp }     from 'firebase-admin/firestore';
import { DISPUTE_MINUTES }           from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid     = decoded.uid;

    const { matchId, screenshotUrl, score: reportedScore, confirm } = await req.json();
    if (!matchId) {
      return NextResponse.json({ error: 'matchId requerido.' }, { status: 400 });
    }

    const matchRef  = adminDb.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;
    if (match.p1 !== uid && match.p2 !== uid) {
      return NextResponse.json({ error: 'No participás en este match.' }, { status: 403 });
    }

    // ── CONFIRMAR resultado del rival (acepto que perdí / empató) ────────────
    if (confirm) {
      if (match.status !== 'PENDING_RESULT') {
        return NextResponse.json({ error: 'No hay resultado pendiente para confirmar.' }, { status: 400 });
      }
      if (match.reported_by === uid) {
        return NextResponse.json({ error: 'No podés confirmar tu propio reporte.' }, { status: 400 });
      }
      const winner = match.reported_by;
      await matchRef.update({
        status:     'FINISHED',
        winner,
        confirmed_by: uid,
        updated_at: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, message: 'Resultado confirmado.' });
    }

    // ── REPORTAR resultado ────────────────────────────────────────────────────
    if (match.status !== 'WAITING') {
      return NextResponse.json({ error: 'Este match ya tiene un resultado reportado.' }, { status: 400 });
    }

    // Guardar screenshot y marcar como PENDING_RESULT
    const deadlineMs      = Date.now() + DISPUTE_MINUTES * 60 * 1000;
    const disputeDeadline = Timestamp.fromMillis(deadlineMs);
    const finalScore      = reportedScore ?? 'Pendiente validación';

    await matchRef.update({
      status:           'PENDING_RESULT',
      reported_by:      uid,
      screenshot_url:   screenshotUrl ?? null,
      score:            finalScore,
      dispute_deadline: disputeDeadline,
      updated_at:       FieldValue.serverTimestamp(),
    });

    // ── Disparar verificación del BOT IA en background (no blocking) ─
    if (screenshotUrl) {
      const origin = req.headers.get('origin') || req.nextUrl?.origin || '';
      const token  = authHeader.slice(7);
      // fire-and-forget — no await
      fetch(`${origin}/api/verifyResult`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ matchId, screenshotUrl }),
      }).catch(() => { /* best-effort */ });
    }

    // ── Auto-confirmar si el rival es un BOT ─────────────────────────
    // El BOT verifica el screenshot primero; sin foto = PENDING (staff revisa)
    const rivalUid = match.p1 === uid ? match.p2 : match.p1;
    if (rivalUid?.startsWith('bot_')) {
      // Si no hay screenshot, dejar en PENDING para revisión manual
      if (!screenshotUrl) {
        return NextResponse.json({
          success:         true,
          autoConfirmed:   false,
          score:           finalScore,
          disputeDeadline: deadlineMs,
          message:         'Resultado guardado. El Staff revisará el marcador ya que no adjuntaste screenshot.',
        });
      }

      // Verificar con Vision API si está configurada
      const apiKey = process.env.GOOGLE_VISION_API_KEY;
      if (apiKey) {
        try {
          const visionRes = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                requests: [{ image: { source: { imageUri: screenshotUrl } }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }],
              }),
            }
          );
          if (visionRes.ok) {
            const vData = await visionRes.json();
            const rawText = (vData.responses?.[0]?.fullTextAnnotation?.text ?? '').toLowerCase();

            // Anti-trampa: detectar derrota
            const lossPhrases = ['derrota', 'defeat', 'you lose', 'lose', 'perdiste'];
            if (lossPhrases.some(p => rawText.includes(p))) {
              // La foto muestra derrota — marcar como DISPUTE
              await matchRef.update({ status: 'DISPUTE', updated_at: FieldValue.serverTimestamp() });
              await adminDb.collection('disputas').add({
                matchId, uid, reason: '[bot_fraud] Screenshot de DERROTA reportado como victoria.',
                screenshot_url: screenshotUrl, created_at: FieldValue.serverTimestamp(), status: 'PENDING',
              });
              return NextResponse.json({ success: false, error: '⚠️ El BOT detectó que la foto muestra una DERROTA. Solo el ganador puede reportar.' }, { status: 400 });
            }

            // Anti-trampa: palabras de edición
            const editPhrases = ['photoshop', 'edited', 'modded', 'cheat'];
            if (editPhrases.some(p => rawText.includes(p))) {
              await matchRef.update({ status: 'DISPUTE', updated_at: FieldValue.serverTimestamp() });
              return NextResponse.json({ success: false, error: '🚨 El BOT detectó posible edición en el screenshot. Caso enviado al Staff.' }, { status: 400 });
            }

            // Si no hay texto en absoluto, foto sospechosa
            if (!rawText.trim()) {
              await matchRef.update({ status: 'DISPUTE', updated_at: FieldValue.serverTimestamp() });
              return NextResponse.json({ success: false, error: '⚠️ No se pudo leer texto en el screenshot. Subí una foto más clara.' }, { status: 400 });
            }

            // Guardar resultado del análisis
            await matchRef.update({ bot_verification: { verdict: 'OK', checkedAt: new Date().toISOString(), textLength: rawText.length } });
          }
        } catch (vErr) {
          console.warn('Vision check failed (non-blocking):', vErr);
          // Si Vision falla, dejamos pasar con flag para auditoría posterior
          await matchRef.update({ bot_verification: { verdict: 'VISION_ERROR', checkedAt: new Date().toISOString() } });
        }
      }

      // BOT confirma el resultado
      await matchRef.update({
        status:         'FINISHED',
        winner:         uid,
        confirmed_by:   rivalUid,
        auto_confirmed: true,
        updated_at:     FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        success:       true,
        autoConfirmed: true,
        score:         finalScore,
        message:       'Resultado confirmado automáticamente por el BOT.',
      });
    }

    return NextResponse.json({
      success:         true,
      score:           finalScore,
      disputeDeadline: deadlineMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
