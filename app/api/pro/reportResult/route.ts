import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyToken } from '@/lib/firebase-admin';

/** Extract score pair from OCR text — looks for "X - Y" or "X:Y" patterns */
function extractScore(text: string): { home: number; away: number } | null {
  const re = /(\d{1,2})\s*[-–:]\s*(\d{1,2})/g;
  const candidates: Array<{ home: number; away: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const h = parseInt(m[1], 10);
    const a = parseInt(m[2], 10);
    if (h <= 30 && a <= 30) candidates.push({ home: h, away: a });
  }
  return candidates.length ? candidates[candidates.length - 1] : null;
}

/** Call Google Vision REST API for OCR */
async function visionOCR(imageUrl: string): Promise<string> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) return '';
  const body = {
    requests: [{
      image: { source: { imageUri: imageUrl } },
      features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
    }],
  };
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return '';
  const data = await res.json() as { responses?: Array<{ fullTextAnnotation?: { text?: string } }> };
  return data.responses?.[0]?.fullTextAnnotation?.text ?? '';
}

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const { match_id, photo_url, storage_path } = await req.json();
    if (!match_id || !photo_url) {
      return NextResponse.json({ error: 'Faltan campos.' }, { status: 400 });
    }

    const matchRef  = adminDb.collection('league_matches').doc(String(match_id));
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return NextResponse.json({ error: 'Partido no encontrado.' }, { status: 404 });

    const match = matchSnap.data()!;
    if (match.player1_uid !== uid && match.player2_uid !== uid) {
      return NextResponse.json({ error: 'No sos parte de este partido.' }, { status: 403 });
    }
    if (match.status !== 'challenged') {
      return NextResponse.json({ error: 'El partido no está en estado de reporte.' }, { status: 400 });
    }

    // OCR via Google Vision REST API
    let ocrScore: { home: number; away: number } | null = null;
    let ocrText  = '';
    let ocrConfidence = 0;
    try {
      ocrText   = await visionOCR(photo_url);
      ocrScore  = extractScore(ocrText);
      ocrConfidence = ocrScore ? 0.8 : 0.2;
    } catch (visionErr) {
      console.warn('[pro/reportResult] Vision API error:', visionErr);
    }

    // Validation deadline: 10 minutes from now
    const validation_deadline = Date.now() + 10 * 60 * 1000;

    await matchRef.update({
      status: 'validating',
      reported_by: uid,
      photo_url,
      storage_path: storage_path ?? null,
      ocr_score: ocrScore,
      ocr_text: ocrText.slice(0, 500),
      ocr_confidence: ocrConfidence,
      validation_deadline,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, ocr_score: ocrScore, ocr_confidence: ocrConfidence });
  } catch (err) {
    console.error('[pro/reportResult]', err);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
