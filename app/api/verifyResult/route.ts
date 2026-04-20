/**
 * /api/verifyResult
 *
 * BOT IA que analiza un screenshot de resultado de partido y determina:
 *  1. De qué juego se trata (FC26 / eFootball)
 *  2. Si el marcador es coherente con el reportado
 *  3. Si los IDs de jugador visibles coinciden con los del match
 *
 * Actualmente usa Google Cloud Vision API (OCR + label detection).
 * Si GOOGLE_VISION_API_KEY no está configurada, devuelve veredicto MANUAL.
 *
 * Flujo esperado:
 *   POST { matchId, screenshotUrl }
 *   → { verdict: 'OK' | 'SUSPICIOUS' | 'MANUAL', confidence, details }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';

/* ─── Tipos ─────────────────────────────────────────────── */
type Verdict = 'OK' | 'SUSPICIOUS' | 'MANUAL';

interface VisionResponse {
  responses: Array<{
    fullTextAnnotation?: { text: string };
    labelAnnotations?:   Array<{ description: string; score: number }>;
    safeSearchAnnotation?: { adult: string; violence: string };
  }>;
}

/* ─── Detectar juego por keywords en OCR text ──────────── */
function detectGame(text: string): 'FC26' | 'EFOOTBALL' | 'UNKNOWN' {
  const t = text.toLowerCase();
  if (t.includes('fc ') || t.includes('ea sports') || t.includes('full time') && t.includes('fc'))
    return 'FC26';
  if (t.includes('efootball') || t.includes('e-football') || t.includes('konami'))
    return 'EFOOTBALL';
  return 'UNKNOWN';
}

/* ─── Extraer marcador del texto OCR ────────────────────── */
function extractScore(text: string): string | null {
  // Busca patrones como "3 - 0", "2-1", "1 : 0" etc.
  const match = text.match(/\b(\d)\s*[-:]\s*(\d)\b/);
  if (match) return `${match[1]}-${match[2]}`;
  return null;
}

/* ─── Verificar si los IDs de jugador aparecen en el texto */
function checkPlayerIds(text: string, id1?: string, id2?: string): { found1: boolean; found2: boolean } {
  const t = text.toLowerCase();
  return {
    found1: id1 ? t.includes(id1.toLowerCase()) : false,
    found2: id2 ? t.includes(id2.toLowerCase()) : false,
  };
}

/* ═════════════════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  try {
    /* Auth */
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer '))
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid     = decoded.uid;

    const { matchId, screenshotUrl } = await req.json();
    if (!matchId || !screenshotUrl)
      return NextResponse.json({ error: 'matchId y screenshotUrl son requeridos.' }, { status: 400 });

    /* Obtener match */
    const matchSnap = await adminDb.collection('matches').doc(matchId).get();
    if (!matchSnap.exists)
      return NextResponse.json({ error: 'Match no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;
    if (match.p1 !== uid && match.p2 !== uid)
      return NextResponse.json({ error: 'No participás en este match.' }, { status: 403 });

    /* Sin API Key → veredicto MANUAL */
    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        verdict:    'MANUAL',
        confidence: 0,
        details:    'Google Vision API no configurada. El screenshot queda para revisión manual del Staff.',
        game:       null,
        scoreFound: null,
      });
    }

    /* Llamar Google Vision (OCR + labels) */
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          requests: [{
            image:    { source: { imageUri: screenshotUrl } },
            features: [
              { type: 'TEXT_DETECTION',    maxResults: 1 },
              { type: 'LABEL_DETECTION',   maxResults: 10 },
              { type: 'SAFE_SEARCH_DETECTION' },
            ],
          }],
        }),
      }
    );

    if (!visionRes.ok) {
      const errText = await visionRes.text();
      console.error('Vision API error:', errText);
      return NextResponse.json({
        verdict:    'MANUAL',
        confidence: 0,
        details:    'Error al contactar Google Vision. Revisión manual pendiente.',
        game:       null,
        scoreFound: null,
      });
    }

    const visionData: VisionResponse = await visionRes.json();
    const response = visionData.responses?.[0];

    /* Si no hay texto → imagen rara */
    const rawText = response?.fullTextAnnotation?.text ?? '';
    if (!rawText.trim()) {
      return NextResponse.json({
        verdict:    'SUSPICIOUS',
        confidence: 0.1,
        details:    'No se detectó texto en la imagen. Puede ser una foto editada o ilegible.',
        game:       null,
        scoreFound: null,
      });
    }

    /* Análisis */
    const game        = detectGame(rawText);
    const scoreFound  = extractScore(rawText);
    const reportedScore = match.score ?? '';
    const { found1, found2 } = checkPlayerIds(rawText, match.p1_ea_id, match.p2_ea_id);

    const safeSearch = response?.safeSearchAnnotation;
    const isEdited   = safeSearch?.adult === 'LIKELY' || safeSearch?.adult === 'VERY_LIKELY';

    /* Calcular confianza */
    let confidence = 0.5;
    if (game !== 'UNKNOWN') confidence += 0.15;
    if (found1) confidence += 0.15;
    if (found2) confidence += 0.15;
    if (scoreFound && reportedScore && scoreFound === reportedScore) confidence += 0.2;
    if (isEdited) confidence -= 0.4;

    confidence = Math.max(0, Math.min(1, confidence));

    /* Veredicto */
    let verdict: Verdict;
    if (isEdited || confidence < 0.35) {
      verdict = 'SUSPICIOUS';
    } else if (confidence >= 0.65) {
      verdict = 'OK';
    } else {
      verdict = 'MANUAL';
    }

    /* Guardar resultado del BOT en el match */
    await adminDb.collection('matches').doc(matchId).update({
      bot_verification: {
        verdict,
        confidence: Math.round(confidence * 100) / 100,
        game,
        scoreFound,
        found1,
        found2,
        checkedAt: new Date().toISOString(),
      },
    });

    const details = [
      game !== 'UNKNOWN' ? `Juego detectado: ${game}` : 'Juego no identificado en la imagen.',
      scoreFound        ? `Marcador detectado: ${scoreFound}` : 'Marcador no legible en la imagen.',
      found1 ? `ID jugador 1 (${match.p1_ea_id}) encontrado.` : match.p1_ea_id ? `ID jugador 1 NO encontrado.` : '',
      found2 ? `ID jugador 2 (${match.p2_ea_id}) encontrado.` : match.p2_ea_id ? `ID jugador 2 NO encontrado.` : '',
      isEdited ? '⚠️ La imagen podría estar editada (detección de SafeSearch).' : '',
    ].filter(Boolean).join(' ');

    return NextResponse.json({ verdict, confidence, details, game, scoreFound });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
