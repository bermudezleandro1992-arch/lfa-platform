import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const VALID_GAMES  = ['EFOOTBALL'] as const;
const VALID_LIGAS  = ['ARG','PER','MEX','COL','VEN','LFA'] as const;
const VALID_PLAT   = ['PC', 'PS5', 'Xbox'] as const;

// Assign team to a group within a liga (single-field query + JS filter)
async function assignGrupo(liga: string): Promise<string> {
  const grupos = ['A','B','C','D'];
  const snap = await adminDb.collection('liga_pro_equipos').where('liga','==',liga).get();
  const counts: Record<string,number> = { A:0, B:0, C:0, D:0 };
  snap.docs.forEach(d => { const g = d.data().grupo as string; if (g in counts) counts[g]++; });
  for (const g of grupos) {
    if (counts[g] < 4) return g;
  }
  return 'A'; // overflow
}

// Generate group matches when group is full (single-field query + JS filter)
async function tryGenerateGroupMatches(liga: string, grupo: string) {
  const ligaSnap = await adminDb.collection('liga_pro_equipos').where('liga','==',liga).get();
  const grupoEquipos = ligaSnap.docs.filter(d => d.data().grupo === grupo);
  if (grupoEquipos.length < 4) return;

  // Check if matches already generated (single-field query + JS check)
  const existingSnap = await adminDb.collection('liga_pro_partidos').where('liga','==',liga).get();
  const alreadyExists = existingSnap.docs.some(d => d.data().grupo === grupo && d.data().ronda === 'GRUPO');
  if (alreadyExists) return;

  const equipos = grupoEquipos.map(d => ({ id: d.id, nombre: d.data().nombre as string, logo_url: (d.data().logo_url ?? '') as string }));
  const batch = adminDb.batch();

  for (let i = 0; i < equipos.length; i++) {
    for (let j = i + 1; j < equipos.length; j++) {
      const local = equipos[i];
      const visit = equipos[j];
      // IDA
      batch.set(adminDb.collection('liga_pro_partidos').doc(), {
        equipo_local_id: local.id, equipo_visit_id: visit.id,
        local_nombre: local.nombre, visit_nombre: visit.nombre,
        local_logo: local.logo_url, visit_logo: visit.logo_url,
        goles_local: null, goles_visit: null,
        status: 'PENDIENTE', juego: 'EFOOTBALL', liga, ronda: 'GRUPO', grupo,
        creado_at: FieldValue.serverTimestamp(),
      });
      // VUELTA
      batch.set(adminDb.collection('liga_pro_partidos').doc(), {
        equipo_local_id: visit.id, equipo_visit_id: local.id,
        local_nombre: visit.nombre, visit_nombre: local.nombre,
        local_logo: visit.logo_url, visit_logo: local.logo_url,
        goles_local: null, goles_visit: null,
        status: 'PENDIENTE', juego: 'EFOOTBALL', liga, ronda: 'GRUPO', grupo,
        creado_at: FieldValue.serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer '))
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }

  // Already inscribed?
  const existSnap = await adminDb.collection('liga_pro_equipos').where('uid','==',uid).limit(1).get();
  if (!existSnap.empty)
    return NextResponse.json({ error: 'Ya estás inscripto en la Liga LFA.' }, { status: 400 });

  let body: {
    juego: string; liga: string; nombre: string; logo_url?: string;
    pais: string; plataforma: string; game_id: string; whatsapp: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const { juego, liga, nombre, logo_url, pais, plataforma, game_id, whatsapp } = body;

  if (!(VALID_GAMES as readonly string[]).includes(juego))
    return NextResponse.json({ error: 'Juego inválido.' }, { status: 400 });
  if (!(VALID_LIGAS as readonly string[]).includes(liga))
    return NextResponse.json({ error: 'Liga inválida.' }, { status: 400 });
  if (!(VALID_PLAT as readonly string[]).includes(plataforma))
    return NextResponse.json({ error: 'Plataforma inválida.' }, { status: 400 });
  if (!nombre?.trim() || nombre.trim().length > 40)
    return NextResponse.json({ error: 'Nombre de equipo inválido (máx 40 caracteres).' }, { status: 400 });
  if (!game_id?.trim())
    return NextResponse.json({ error: 'Konami ID requerido.' }, { status: 400 });
  if (!whatsapp?.trim())
    return NextResponse.json({ error: 'WhatsApp requerido.' }, { status: 400 });

  // Verify user exists
  const userSnap = await adminDb.collection('usuarios').doc(uid).get();
  if (!userSnap.exists)
    return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  const userData = userSnap.data()!;

  // Validate Konami ID matches profile (if already set)
  if (userData.konami_id?.trim() && userData.konami_id.trim() !== game_id.trim())
    return NextResponse.json({ error: 'El Konami ID no coincide con tu perfil. Actualizá tu perfil primero.' }, { status: 400 });

  const grupo = await assignGrupo(liga);

  // Sanitize logo_url (only allow https:// URLs from storage)
  let safeLogoUrl = '';
  if (logo_url?.trim()) {
    const u = logo_url.trim();
    if (u.startsWith('https://storage.googleapis.com/') || u.startsWith('https://firebasestorage.googleapis.com/'))
      safeLogoUrl = u.slice(0, 500);
  }

  await adminDb.collection('liga_pro_equipos').add({
    uid,
    capitan: userData.nombre ?? uid.slice(0, 10),
    juego: 'EFOOTBALL',
    liga,
    nombre: nombre.trim(),
    logo_url: safeLogoUrl,
    pais: pais ?? 'Argentina',
    plataforma,
    game_id: game_id.trim(),
    whatsapp: whatsapp.trim(),
    pts: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0,
    grupo,
    creado_at: FieldValue.serverTimestamp(),
  });

  // Try to generate group matches
  await tryGenerateGroupMatches(liga, grupo);

  return NextResponse.json({ success: true, liga, grupo });
}
