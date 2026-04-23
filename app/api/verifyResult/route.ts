/**
 * /api/verifyResult
 *
 * BOT IA que analiza un screenshot de resultado de partido y determina:
 *  1. De qué juego se trata (FC26 / eFootball)
 *  2. Si el marcador es coherente con el reportado
 *  3. Si los IDs de jugador visibles coinciden con los del match
 *  4. Si la imagen parece un resultado real (no un menú, foto vieja, etc.)
 *
 * Umbral de confianza: >= 0.80 → OK, 0.40-0.79 → MANUAL, < 0.40 → SUSPICIOUS
 * Todo se loguea en `vision_logs` para revisión del beta test.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';

/* ─── Tipos ─────────────────────────────────────────────── */
type Verdict = 'OK' | 'SUSPICIOUS' | 'MANUAL';

interface VisionResponse {
  responses: Array<{
    fullTextAnnotation?: { text: string };
    labelAnnotations?:   Array<{ description: string; score: number }>;
    safeSearchAnnotation?: { adult: string; violence: string };
  }>;
}

/* ─── Keywords específicas de cada juego ────────────────────
 *  FC26: pantalla de resultado post-partido
 *  eFootball: pantalla de resultado post-partido
 *  Si ninguna keyword aparece → imagen sospechosa (menú, screenshot viejo, etc.)
 */
const FC26_KEYWORDS = [
  'full time', 'half time', 'ea sports', 'fc 26', 'fc26',
  'match summary', 'resumen del partido', 'player of the match',
  'goals', 'possession', 'shots', 'passes', 'tackles',
  'ultimate team', 'fut', 'career mode', 'kick off',
];

const EFOOTBALL_KEYWORDS = [
  'efootball', 'e-football', 'konami', 'pes',
  'match result', 'resultado del partido', 'match end',
  'full time', 'penalty shootout', 'tiro penal',
  'stamina', 'condition', 'form', 'myclub',
];

/* ─── Detectar juego + nivel de coincidencia ────────────── */
function detectGame(text: string): {
  game: 'FC26' | 'EFOOTBALL' | 'UNKNOWN';
  gameKeywordsFound: string[];
  gameConfidence: number;
} {
  const t = text.toLowerCase();
  const fc26Hits     = FC26_KEYWORDS.filter(k => t.includes(k));
  const efbHits      = EFOOTBALL_KEYWORDS.filter(k => t.includes(k));

  if (fc26Hits.length >= efbHits.length && fc26Hits.length > 0) {
    return { game: 'FC26', gameKeywordsFound: fc26Hits, gameConfidence: Math.min(1, fc26Hits.length / 3) };
  }
  if (efbHits.length > 0) {
    return { game: 'EFOOTBALL', gameKeywordsFound: efbHits, gameConfidence: Math.min(1, efbHits.length / 3) };
  }
  return { game: 'UNKNOWN', gameKeywordsFound: [], gameConfidence: 0 };
}

/* ─── Detectar si es pantalla de resultado real ─────────── */
function isResultScreen(text: string, game: 'FC26' | 'EFOOTBALL' | 'UNKNOWN'): boolean {
  const t = text.toLowerCase();
  // Debe tener marcador visible
  const hasScore = /\b\d\s*[-:]\s*\d\b/.test(t);
  if (!hasScore) return false;
  // Palabras que indican que es un menú, lobby o configuración (no un resultado)
  const menuWords = ['settings', 'configuración', 'select', 'lobby', 'tournament bracket',
                     'main menu', 'menú principal', 'create match', 'invitar', 'invite'];
  const looksLikeMenu = menuWords.some(w => t.includes(w));
  if (looksLikeMenu) return false;
  // Para FC26: debe tener al menos "full time" o "match summary"
  if (game === 'FC26') return t.includes('full time') || t.includes('match summary') || t.includes('resumen');
  // Para eFootball: debe tener "match result" o "full time"
  if (game === 'EFOOTBALL') return t.includes('match result') || t.includes('resultado') || t.includes('full time');
  return hasScore;
}

/* ─── Extraer marcador del texto OCR ────────────────────── */
function extractScore(text: string): string | null {
  const match = text.match(/\b([0-9]{1,2})\s*[-:]\s*([0-9]{1,2})\b/);
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

    // Seguridad: solo se aceptan URLs de Firebase Storage del proyecto
    const ALLOWED_STORAGE_HOST = 'https://firebasestorage.googleapis.com/';
    if (typeof screenshotUrl !== 'string' || !screenshotUrl.startsWith(ALLOWED_STORAGE_HOST)) {
      return NextResponse.json({ error: 'URL de screenshot no válida.' }, { status: 400 });
    }

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
      const noTextResult = {
        verdict:    'SUSPICIOUS' as Verdict,
        confidence: 0.05,
        details:    'No se detectó texto en la imagen. Puede ser una foto editada, en blanco o ilegible.',
        game:       null,
        scoreFound: null,
      };
      await logVisionResult(matchId, screenshotUrl, uid, rawText, noTextResult, match);
      return NextResponse.json(noTextResult);
    }

    /* ── Análisis completo ───────────────────────────────── */
    const { game, gameKeywordsFound, gameConfidence } = detectGame(rawText);
    const scoreFound    = extractScore(rawText);
    const reportedScore = (match.score ?? '').replace(/\s/g, '');
    const { found1, found2 } = checkPlayerIds(rawText, match.p1_ea_id, match.p2_ea_id);
    const resultScreen  = isResultScreen(rawText, game);

    const safeSearch = response?.safeSearchAnnotation;
    const isEdited   = safeSearch?.adult === 'LIKELY' || safeSearch?.adult === 'VERY_LIKELY';

    /* ── Calcular confianza ──────────────────────────────────
     * Base: 0.30 (arranca neutral-bajo)
     * +0.20 si se detectó el juego correctamente
     * +0.10 por cada keyword de juego adicional (máx +0.20)
     * +0.15 si parece pantalla de resultado (no menú)
     * +0.10 si ID jugador 1 encontrado
     * +0.10 si ID jugador 2 encontrado
     * +0.15 si el marcador detectado coincide con el reportado
     * -0.50 si imagen parece editada (SafeSearch)
     * -0.30 si no es pantalla de resultado (menú, lobby, etc.)
     * -0.20 si juego UNKNOWN (ninguna keyword reconocida)
     */
    let confidence = 0.30;
    if (game !== 'UNKNOWN') confidence += 0.20 + Math.min(0.20, gameKeywordsFound.length * 0.05);
    else                    confidence -= 0.20;
    if (resultScreen)       confidence += 0.15;
    else                    confidence -= 0.30;
    if (found1)             confidence += 0.10;
    if (found2)             confidence += 0.10;
    if (scoreFound && reportedScore && scoreFound === reportedScore) confidence += 0.15;
    if (isEdited)           confidence -= 0.50;

    confidence = Math.max(0, Math.min(1, confidence));

    /* ── Veredicto con umbral 80% ───────────────────────────
     * >= 0.80 → OK     (pago automático)
     * 0.40-0.79 → MANUAL (staff revisa)
     * < 0.40 → SUSPICIOUS (alerta + Fair Play)
     */
    let verdict: Verdict;
    if (isEdited || confidence < 0.40) {
      verdict = 'SUSPICIOUS';
    } else if (confidence >= 0.80) {
      verdict = 'OK';
    } else {
      verdict = 'MANUAL';
    }

    const details = [
      game !== 'UNKNOWN'
        ? `Juego: ${game} (keywords: ${gameKeywordsFound.slice(0,4).join(', ')})`
        : '⚠️ Juego no identificado — ninguna keyword reconocida en la imagen.',
      resultScreen ? '✅ Pantalla de resultado detectada.' : '⚠️ No parece ser una pantalla de resultado.',
      scoreFound ? `Marcador detectado: ${scoreFound}` : '⚠️ Marcador no legible.',
      scoreFound && reportedScore
        ? (scoreFound === reportedScore ? '✅ Coincide con el reportado.' : `❌ NO coincide — reportado: ${reportedScore}`)
        : '',
      found1 ? `✅ ID jugador 1 (${match.p1_ea_id}) encontrado.` : match.p1_ea_id ? `⚠️ ID jugador 1 NO encontrado.` : '',
      found2 ? `✅ ID jugador 2 (${match.p2_ea_id}) encontrado.` : match.p2_ea_id ? `⚠️ ID jugador 2 NO encontrado.` : '',
      isEdited ? '🚨 Imagen posiblemente editada (SafeSearch activado).' : '',
    ].filter(Boolean).join(' | ');

    const result = { verdict, confidence: Math.round(confidence * 100) / 100, details, game, scoreFound };

    /* ── Guardar en match ───────────────────────────────── */
    await adminDb.collection('matches').doc(matchId).update({
      bot_verification: {
        verdict,
        confidence: result.confidence,
        game,
        scoreFound,
        found1, found2,
        resultScreen,
        gameKeywordsFound,
        checkedAt: new Date().toISOString(),
      },
    });

    /* ── Log para beta test ─────────────────────────────── */
    await logVisionResult(matchId, screenshotUrl, uid, rawText, result, match);

    /* ── Publicar en cantina como BOT ─────────────────────── */
    const confPct = Math.round(confidence * 100);
    const botMsg = verdict === 'OK'
      ? `✅ [BOT LFA] Resultado verificado. Marcador: **${scoreFound ?? 'N/D'}** | ${game} | Confianza: ${confPct}%`
      : verdict === 'SUSPICIOUS'
        ? `🚨 [BOT LFA] Resultado SOSPECHOSO (${confPct}%). ${isEdited ? 'Imagen posiblemente editada.' : !resultScreen ? 'No parece pantalla de resultado.' : 'Verificación fallida.'} Un moderador revisará el caso.`
        : `🔍 [BOT LFA] Resultado con confianza media (${confPct}%). Requiere revisión manual del Staff. Detalles: ${details.slice(0,120)}`;

    await adminDb.collection('cantina_messages').add({
      uid:           'BOT_LFA',
      nombre:        '🤖 BOT LFA',
      avatar_url:    null,
      rol:           'bot',
      texto:         botMsg,
      is_bot_verify: true,
      verdict,
      match_id:      matchId,
      timestamp:     FieldValue.serverTimestamp(),
      deleted:       false,
    });

    return NextResponse.json(result);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/* ─── Helper: guardar log para revisión del beta test ───── */
async function logVisionResult(
  matchId: string,
  screenshotUrl: string,
  uid: string,
  rawText: string,
  result: { verdict: string; confidence: number; details: string; game: string | null; scoreFound: string | null },
  match: FirebaseFirestore.DocumentData,
) {
  try {
    await adminDb.collection('vision_logs').add({
      matchId,
      screenshotUrl,
      uid,
      game:         result.game,
      verdict:      result.verdict,
      confidence:   result.confidence,
      scoreFound:   result.scoreFound,
      scoreReported: match.score ?? null,
      details:      result.details,
      rawTextLength: rawText.length,
      rawTextSample: rawText.slice(0, 500), // primeros 500 chars para revisión
      timestamp:    FieldValue.serverTimestamp(),
    });
  } catch {
    // No bloquear el flujo si el log falla
  }
}
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
