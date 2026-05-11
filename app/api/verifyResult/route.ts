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
  'ea id', 'fc 27', 'fc27', 'total shots', 'ball possession',
  'man of the match', 'friendly match', 'online friendly',
];

const EFOOTBALL_KEYWORDS = [
  // Textos de UI eFootball generales
  'efootball', 'e-football', 'konami', 'pes',
  'myclub', 'dream team', 'master league',
  'konami id', 'konami id:', 'online match', 'match finished',
  'match result', 'resultado del partido', 'match end',
  'full time', 'penalty shootout', 'tiro penal',
  'stamina', 'condition',
  'partida encerrada', 'partida online',
  // Pantalla "partidos" / historial de partidos (eFootball ES/PT)
  'partidos',          // título de la sección historial
  'jog@',             // término portugués eFootball
  'joga bonito',
  'crossplay',        // modo crossplay PS/Xbox/PC
  'rank match',       // modo clasificatorio eFootball
  'event match',
  'divisions',
  'rating match',
  'skill check',
  // Plataformas que aparecen en partidos crossplay
  'ps5', 'ps4', 'playstation',
  'xbox', 'xbox series',
  'steam', 'windows',   // PC crossplay
  // Términos del marcador/pantalla de resultado
  'resultados', 'resultado',
  'penalty', 'penalties',
  // UI eFootball genérica
  'live update', 'featured players',
  'gp ', 'player growth',
];

/* ─── Detectar juego + nivel de coincidencia ────────────── */
function detectGame(
  text: string,
  labels: string[] = [],
): {
  game: 'FC26' | 'EFOOTBALL' | 'UNKNOWN';
  gameKeywordsFound: string[];
  gameConfidence: number;
  crossplay: boolean;
} {
  const t = text.toLowerCase();
  const fc26Hits = FC26_KEYWORDS.filter(k => t.includes(k));
  const efbHits  = EFOOTBALL_KEYWORDS.filter(k => t.includes(k));

  // Detectar crossplay: ambos íconos de plataforma distintos en la misma imagen
  // Google Vision labels puede devolver: "Game controller", "Computer monitor", "Gadget"
  // También detectamos por texto: PS5 + Steam/Windows presentes juntos
  const labelsLower = labels.map(l => l.toLowerCase());
  const hasControllerLabel = labelsLower.some(l => l.includes('controller') || l.includes('gamepad') || l.includes('joystick'));
  const hasMonitorLabel    = labelsLower.some(l => l.includes('monitor') || l.includes('computer') || l.includes('display') || l.includes('screen'));
  const hasPcText     = t.includes('steam') || t.includes('windows') || t.includes('pc');
  const hasConsoleText = t.includes('ps5') || t.includes('ps4') || t.includes('xbox') || t.includes('playstation');
  const crossplay = (hasControllerLabel && hasMonitorLabel) || (hasPcText && hasConsoleText) || t.includes('crossplay');

  // Si hay crossplay de plataformas, es casi seguro eFootball (único juego con crossplay en LFA)
  if (crossplay && efbHits.length === 0 && fc26Hits.length === 0) {
    return { game: 'EFOOTBALL', gameKeywordsFound: ['[crossplay detectado]'], gameConfidence: 0.6, crossplay };
  }

  if (fc26Hits.length >= efbHits.length && fc26Hits.length > 0) {
    return { game: 'FC26', gameKeywordsFound: fc26Hits, gameConfidence: Math.min(1, fc26Hits.length / 3), crossplay };
  }
  if (efbHits.length > 0) {
    return { game: 'EFOOTBALL', gameKeywordsFound: efbHits, gameConfidence: Math.min(1, efbHits.length / 3), crossplay };
  }
  return { game: 'UNKNOWN', gameKeywordsFound: [], gameConfidence: 0, crossplay };
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
  // Para eFootball: acepta pantalla de resultado O pantalla de historial "partidos"
  if (game === 'EFOOTBALL') {
    const isResultView  = t.includes('match result') || t.includes('resultado') || t.includes('full time');
    const isPartidosView = t.includes('partidos') || t.includes('rank match') || t.includes('jog@');
    return isResultView || isPartidosView;
  }
  return hasScore;
}

/* ─── Extraer marcador del texto OCR ────────────────────── */
function extractScore(text: string): string | null {
  // Intenta capturar marcadores como "2 - 1", "2-1", "02:01", "2 : 1"
  // Prioriza formatos comunes de pantalla de resultado de videojuego
  const patterns = [
    /\b([0-9]{1,2})\s*-\s*([0-9]{1,2})\b/,  // 2-1  o  2 - 1
    /\b([0-9]{1,2})\s+([0-9]{1,2})\b/,       // "2 1" (sin separador)
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      // Descarta contadores absurdos (>20 goles) y tiempos tipo 90-45
      if (a <= 20 && b <= 20 && !(a >= 40 || b >= 40)) {
        return `${a}-${b}`;
      }
    }
  }
  return null;
}

/* ─── Verificar si los IDs de jugador aparecen en el texto */
function checkPlayerIds(text: string, id1?: string, id2?: string): { found1: boolean; found2: boolean } {
  const t = text.toLowerCase();
  // Normalizar IDs: quitar espacios extra y comparar substring
  const normalize = (id: string) => id.replace(/\s+/g, '').toLowerCase();
  return {
    found1: id1 ? t.includes(normalize(id1)) : false,
    found2: id2 ? t.includes(normalize(id2)) : false,
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

    /* ── Anti-fraude: hash de imagen ────────────────────────
     * Extraemos la ruta única del storage (después del bucket) y la usamos como huella.
     * Si esa misma imagen ya fue enviada en otro match → SUSPICIOUS.
     */
    const { createHash } = await import('crypto');
    const imageHash = createHash('sha256').update(screenshotUrl).digest('hex');

    const dupCheck = await adminDb.collection('vision_logs')
      .where('imageHash', '==', imageHash)
      .limit(1)
      .get();
    if (!dupCheck.empty && dupCheck.docs[0].data().matchId !== matchId) {
      return NextResponse.json({
        verdict: 'SUSPICIOUS',
        confidence: 0,
        details: '🚨 Esta imagen ya fue usada en otro partido. Subí una captura nueva.',
        game: null,
        scoreFound: null,
      });
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
    const visionLabels = (response?.labelAnnotations ?? []).map((l: any) => l.description ?? '');
    const { game, gameKeywordsFound, gameConfidence, crossplay } = detectGame(rawText, visionLabels);
    const scoreFound    = extractScore(rawText);
    const reportedScore = (match.score ?? '').replace(/\s/g, '');

    // Seleccionar IDs según el juego del torneo
    const tournamentGame = ((match.game ?? '') as string).toUpperCase();
    const useKonamiId   = tournamentGame.includes('EFOOTBALL') || tournamentGame.includes('E-FOOTBALL');
    const id1 = useKonamiId ? (match.p1_konami_id ?? match.p1_ea_id) : match.p1_ea_id;
    const id2 = useKonamiId ? (match.p2_konami_id ?? match.p2_ea_id) : match.p2_ea_id;
    const { found1, found2 } = checkPlayerIds(rawText, id1, id2);

    /* ── Detectar pantalla de DERROTA ───────────────────────
     * Si el screenshot muestra "DEFEAT" / "DERROTA" / etc. es
     * probable que el reportero subió la pantalla del perdedor.
     */
    const DEFEAT_WORDS = ['defeat', 'derrota', 'you lose', 'perdiste', 'abandono', 'desconectado'];
    const isDefeatScreen = DEFEAT_WORDS.some(w => rawText.toLowerCase().includes(w));

    /* ── Consistencia score → ganador ────────────────────────
     * Puerto del algoritmo procesarArbitrajeNube (Cloud Functions).
     * Usa la posición de los IDs de jugador en el texto OCR para
     * determinar qué goles corresponden a cada lado.
     */
    const reporterIsP1  = uid === match.p1;
    const reporterGameId = reporterIsP1 ? id1 : id2;
    const rivalGameId    = reporterIsP1 ? id2 : id1;

    let reporterGoals: number | null = null;
    let rivalGoals:    number | null = null;
    let isReporterLoser = false;
    let isDrawScore     = false;

    if (scoreFound) {
      const parts = scoreFound.split('-');
      let golesA = parseInt(parts[0] ?? '0', 10);
      let golesB = parseInt(parts[1] ?? '0', 10);

      const lowerText  = rawText.toLowerCase();
      const normalizeId = (s: string) => s.toLowerCase().replace(/[_@#\-. ]/g, '').trim();
      const posReporter = reporterGameId ? lowerText.indexOf(normalizeId(reporterGameId)) : -1;
      const posRival    = rivalGameId    ? lowerText.indexOf(normalizeId(rivalGameId))    : -1;

      // Si el rival aparece ANTES en el texto → el primer número es del rival, intercambiar
      if (posRival !== -1 && posReporter !== -1 && posRival < posReporter) {
        [golesA, golesB] = [golesB, golesA];
      }

      reporterGoals   = golesA;
      rivalGoals      = golesB;
      isReporterLoser = golesA < golesB;
      isDrawScore     = golesA === golesB;
    }

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
    // Penalizaciones por resultado incoherente
    if (isDefeatScreen)     confidence -= 0.50; // pantalla de DERROTA → el reportero perdió
    if (isDrawScore)        confidence -= 0.40; // empate no tiene ganador
    if (isReporterLoser)    confidence -= 0.50; // reportero subió marcador donde perdió

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

    const idField = useKonamiId ? 'Konami ID' : 'EA ID';
    const details = [
      game !== 'UNKNOWN'
        ? `Juego: ${game} (keywords: ${gameKeywordsFound.slice(0,4).join(', ')})${crossplay ? ' · 🎮↔️🖥️ Crossplay detectado' : ''}`
        : '⚠️ Juego no identificado — ninguna keyword reconocida en la imagen.',
      resultScreen ? '✅ Pantalla de resultado detectada.' : '⚠️ No parece ser una pantalla de resultado.',
      scoreFound ? `Marcador detectado: ${scoreFound}` : '⚠️ Marcador no legible.',
      scoreFound && reportedScore && reportedScore !== 'Pendientevalidación'
        ? (scoreFound === reportedScore ? '✅ Coincide con el reportado.' : `⚠️ Diferente al reportado: ${reportedScore}`)
        : '',
      found1 ? `✅ ${idField} J1 (${id1}) encontrado.` : id1 ? `⚠️ ${idField} J1 NO encontrado.` : '',
      found2 ? `✅ ${idField} J2 (${id2}) encontrado.` : id2 ? `⚠️ ${idField} J2 NO encontrado.` : '',
      isEdited ? '🚨 Imagen posiblemente editada (SafeSearch activado).' : '',
    ].filter(Boolean).join(' | ');

    const result = { verdict, confidence: Math.round(confidence * 100) / 100, details, game, scoreFound };

    /* ── Guardar en match + auto-resolver si OK ─────────── */
    const uploadTimestamp = new Date().toISOString();
    const matchUpdate: Record<string, unknown> = {
      bot_verification: {
        verdict,
        confidence: result.confidence,
        game,
        scoreFound,
        found1, found2,
        resultScreen,
        gameKeywordsFound,
        idField,
        checkedAt: uploadTimestamp,
      },
    };

    if (verdict === 'OK') {
      // Auto-resolver: poner deadline en el pasado (30s) para que el
      // scheduler de Cloud Functions lo procese enseguida.
      // También actualizamos el score con el detectado por OCR.
      const { Timestamp } = await import('firebase-admin/firestore');
      // Normalizar score con goles del reportero primero
      const normalizedScore = (reporterGoals !== null && rivalGoals !== null)
        ? `${reporterGoals}-${rivalGoals}`
        : (scoreFound ?? match.score ?? '?-?');
      matchUpdate.score             = normalizedScore;
      matchUpdate.dispute_deadline  = Timestamp.fromMillis(Date.now() + 30_000);
      matchUpdate.bot_auto_resolve  = true;
      matchUpdate.bot_winner_uid    = uid;
      matchUpdate.updated_at        = FieldValue.serverTimestamp();
    }

    await adminDb.collection('matches').doc(matchId).update(matchUpdate);

    /* ── Log para beta test ─────────────────────────────── */
    await logVisionResult(matchId, screenshotUrl, uid, rawText, result, match, imageHash);

    /* ── Publicar en match_chat como BOT (NO en cantina global) ── */
    const confPct = Math.round(confidence * 100);
    // Para el mensaje OK, buscar el nombre del reportero
    let reporterName = 'Jugador';
    if (verdict === 'OK') {
      try {
        const userSnap = await adminDb.collection('usuarios').doc(uid).get();
        reporterName   = (userSnap.data()?.nombre as string | undefined) ?? reporterName;
      } catch { /* no critical */ }
    }
    const displayScore = (reporterGoals !== null && rivalGoals !== null)
      ? `${reporterGoals}-${rivalGoals}`
      : (scoreFound ?? 'N/D');
    const botMsg = verdict === 'OK'
      ? `✅ [BOT LFA] **${reporterName}** gana. Marcador: **${displayScore}** | ${game} | Confianza: ${confPct}%`
      : verdict === 'SUSPICIOUS'
        ? `🚨 [BOT LFA] Resultado SOSPECHOSO (${confPct}%). ${
            isDefeatScreen   ? 'Pantalla de derrota detectada.' :
            isReporterLoser  ? 'El marcador indica que el reportero perdió.' :
            isDrawScore      ? 'Empate — no hay ganador válido.' :
            isEdited         ? 'Imagen posiblemente editada.' :
            !resultScreen    ? 'No parece pantalla de resultado.' :
            'Verificación fallida.'} Un moderador revisará el caso.`
        : `🔍 [BOT LFA] Resultado con confianza media (${confPct}%). Requiere revisión manual del Staff.`;

    await adminDb.collection('match_chat').add({
      matchId,
      tournamentId:  match.tournamentId || null,
      uid:           'BOT_LFA',
      nombre:        '🤖 BOT LFA',
      avatar_url:    null,
      rol:           'bot',
      texto:         botMsg,
      is_bot_result: true,
      verdict,
      timestamp:     FieldValue.serverTimestamp(),
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
  imageHash?: string,
) {
  try {
    await adminDb.collection('vision_logs').add({
      matchId,
      screenshotUrl,
      imageHash:    imageHash ?? null,
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
