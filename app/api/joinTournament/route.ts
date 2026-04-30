
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth }        from '@/lib/firebase-admin';
import { FieldValue }                from 'firebase-admin/firestore';
import type { DocumentData }         from 'firebase-admin/firestore';
import { writeLedgerEntry }          from '@/lib/ledger';
import { RegionDetectionResult }     from '@/lib/types';
import { checkRateLimit, getClientIp } from '@/lib/rateLimiter';
import { createHash }                from 'crypto';

const REGION_COMPAT: Record<string, string[]> = {
  LATAM_SUR:   ['LATAM_SUR',   'AMERICA', 'GLOBAL'],
  LATAM_NORTE: ['LATAM_NORTE', 'AMERICA', 'GLOBAL'],
  AMERICA:     ['LATAM_SUR',   'LATAM_NORTE', 'AMERICA', 'GLOBAL'],
  GLOBAL:      ['LATAM_SUR',   'LATAM_NORTE', 'AMERICA', 'GLOBAL'],
};

const RESERVA_TTL_MS = 15 * 60 * 1000; // 15 minutos para completar el depósito

export async function POST(req: NextRequest) {
  let idempotencyKey = '';
  try {
    // Verificar token
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid     = decoded.uid;

    // Rate limit: max 15 joins per hour per user + 30 per IP
    const ip = getClientIp(req);
    if (!checkRateLimit(`join:${uid}`, 15, 3_600_000))
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 });
    if (!checkRateLimit(`join_ip:${ip}`, 30, 3_600_000))
      return NextResponse.json({ error: 'Demasiados intentos desde esta red.' }, { status: 429 });

    const { tournamentId, password } = await req.json();
    if (!tournamentId) {
      return NextResponse.json({ error: 'tournamentId requerido.' }, { status: 400 });
    }

    // ── IDEMPOTENCIA: bloquear doble-clic con doc único ──────────────
    // Si ya existe este doc, la inscripción está en progreso o fue completada
    idempotencyKey = `${uid}_${tournamentId}`;
    const idempotencyRef = adminDb.collection('join_locks').doc(idempotencyKey);
    const lockSnap = await idempotencyRef.get();
    if (lockSnap.exists) {
      const lockData = lockSnap.data()!;
      if (lockData.status === 'completed') {
        return NextResponse.json({ error: 'Ya estás inscrito en este torneo.' }, { status: 400 });
      }
      if (lockData.status === 'processing' && Date.now() - lockData.createdAt < 15_000) {
        return NextResponse.json({ error: 'Tu inscripción ya está en proceso. Esperá unos segundos.' }, { status: 429 });
      }
    }
    // Crear el lock de idempotencia (15 segundos de protección)
    await idempotencyRef.set({ uid, tournamentId, status: 'processing', createdAt: Date.now() });

    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const userRef       = adminDb.collection('usuarios').doc(uid);


    // ── Pre-lectura para detectar saldo insuficiente antes de la tx ──
    const [tPreSnap, uPreSnap] = await Promise.all([tournamentRef.get(), userRef.get()]);
    if (!tPreSnap.exists) return NextResponse.json({ error: 'Torneo no encontrado.' }, { status: 400 });
    if (!uPreSnap.exists) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 400 });

    const tPre   = tPreSnap.data()!;
    const uPre   = uPreSnap.data()!;

    // ── Password check for organizer tournaments ──────────────────────
    if (tPre.has_password && tPre.password_hash) {
      if (!password || typeof password !== 'string') {
        return NextResponse.json({ error: 'REQUIERE_CONTRASEÑA', message: 'Este torneo requiere contraseña para unirse.' }, { status: 403 });
      }
      const providedHash = createHash('sha256').update(password.trim()).digest('hex');
      if (providedHash !== tPre.password_hash) {
        return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 403 });
      }
    }

    // ── No permitir dos torneos simultáneos ──────────────────────────
    const existingSnap = await adminDb.collection('tournaments')
      .where('players', 'array-contains', uid)
      .where('status', 'in', ['OPEN', 'ACTIVE'])
      .limit(1).get();
    if (!existingSnap.empty && existingSnap.docs[0].id !== tournamentId) {
      return NextResponse.json({ error: 'Ya estás en un torneo activo. Finalizá ese torneo antes de unirte a otro.' }, { status: 400 });
    }
    const isFree = tPre.entry_fee === 0;
    const coins  = (uPre.number ?? uPre.coins ?? 0) as number;

    // ── Validación de VPN y región real ───────────────────────────────
    // Solo permitir GLOBAL si hay VPN o mismatch de región
    try {
      const regionRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/detect-region`, {
        headers: { 'x-forwarded-for': req.headers.get('x-forwarded-for') || '' },
        cache: 'no-store',
      });
      if (regionRes.ok) {
        const regionData = (await regionRes.json()) as RegionDetectionResult;
        const salaRegion = tPre.region;
        // Si la sala no es GLOBAL:
        if (salaRegion !== 'GLOBAL') {
          if (regionData.isVpn) {
            return NextResponse.json({ error: 'No podés unirte a salas de región usando VPN/proxy. Solo permitido en Región Global.' }, { status: 403 });
          }
          // Si la región real no coincide con la declarada, bloquear
          if (uPre.region && regionData.region && uPre.region !== regionData.region) {
            return NextResponse.json({ error: `Tu región real (${regionData.region}) no coincide con la declarada (${uPre.region}). Solo podés entrar a Región Global usando VPN o desde otra región.` }, { status: 403 });
          }
        }
      }
    } catch (e) {
      // Si falla la detección, dejar pasar (no bloquear por error externo)
    }

    // ── Saldo insuficiente → reservar cupo por 15 min ──────────────
    if (!isFree && coins < tPre.entry_fee) {
      // Validaciones básicas antes de reservar
      if (tPre.status !== 'OPEN')            return NextResponse.json({ error: 'El torneo no está abierto.' }, { status: 400 });
      if ((tPre.players as string[]).includes(uid)) return NextResponse.json({ error: 'Ya estás inscrito.' }, { status: 400 });
      if ((tPre.players as string[]).length >= tPre.capacity) return NextResponse.json({ error: 'Sala llena.' }, { status: 400 });

      const faltanCoins = tPre.entry_fee - coins;
      const expiresAt   = new Date(Date.now() + RESERVA_TTL_MS);
      const reservaId   = `${uid}_${tournamentId}`;

      await adminDb.collection('reservas_torneo').doc(reservaId).set({
        uid,
        tournamentId,
        tournamentNombre: tPre.name ?? `Torneo ${tPre.game ?? ''}`,
        entryFee:    tPre.entry_fee,
        faltanCoins,
        estado:      'pendiente',
        createdAt:   FieldValue.serverTimestamp(),
        expiresAt,
      });

      return NextResponse.json({
        error: 'SALDO_INSUFICIENTE',
        reserva: {
          id:               reservaId,
          tournamentId,
          tournamentNombre: tPre.name ?? `Torneo ${tPre.game ?? ''}`,
          entryFee:         tPre.entry_fee,
          faltanCoins,
          expiresAt:        expiresAt.toISOString(),
        },
      }, { status: 400 });
    }

    // ── Transacción atómica: inscripción ────────────────────────────
    const result = await adminDb.runTransaction(async (tx) => {
      const [tSnap, uSnap] = await Promise.all([tx.get(tournamentRef), tx.get(userRef)]);

      if (!tSnap.exists) throw new Error('Torneo no encontrado.');
      if (!uSnap.exists) throw new Error('Usuario no encontrado.');

      const t = tSnap.data()!;
      const u = uSnap.data()!;

      if (t.status !== 'OPEN')              throw new Error('El torneo no está abierto.');
      if (t.players.includes(uid))          throw new Error('Ya estás inscrito en este torneo.');
      if (t.players.length >= t.capacity)   throw new Error('Sala llena.');

      const userRegion = u.region as string | undefined;
      if (userRegion && !REGION_COMPAT[userRegion]?.includes(t.region)) {
        throw new Error(`Tu región (${userRegion}) no puede entrar a este torneo (${t.region}).`);
      }

      const txCoins = (u.number ?? u.coins ?? 0) as number;

      // Validar ID de juego para TODOS los torneos (free y pago)
      const gameStr     = ((t.game ?? t.juego ?? '') as string).toUpperCase();
      const isEfootball = gameStr.includes('EFOOTBALL') || gameStr.includes('E-FOOTBALL') || gameStr.includes('KONAMI');
      const hasEaId     = !!(u.ea_id?.trim());
      const hasKonamiId = !!(u.konami_id?.trim());
      if (isEfootball) {
        if (!hasKonamiId) throw new Error('Vinculá tu Konami ID (eFootball) en tu perfil para entrar a este torneo.');
      } else {
        // FC26, FC27 u otro juego EA
        if (!hasEaId) throw new Error('Vinculá tu EA ID (FC 26) en tu perfil para entrar a este torneo.');
      }

      if (isFree) {
        const authUser = await adminAuth.getUser(uid);
        if (!authUser.emailVerified) throw new Error('Verificá tu email para acceder a torneos gratuitos.');
        if (txCoins > 5_000)         throw new Error('Con más de 5,000 Coins no podés acceder a salas gratuitas.');
      } else {
        // Idempotencia: verificar que no haya una tx de entrada duplicada reciente
        const dupCheck = await adminDb.collection('transactions')
          .where('userId', '==', uid).where('type', '==', 'TOURNAMENT_ENTRY').where('tournamentId', '==', tournamentId).limit(1).get();
        if (!dupCheck.empty) throw new Error('Ya procesamos tu inscripción a este torneo.');
        if (txCoins < t.entry_fee) throw new Error(`Saldo insuficiente. Necesitás ${t.entry_fee.toLocaleString()} Coins.`);
      }

      const newPlayers = [...t.players, uid];
      let newBal: number;

      if (!isFree) {
        // Débito atómico con registro de ledger
        const r = writeLedgerEntry(tx, userRef, uid, txCoins, {
          type:         'TOURNAMENT_ENTRY',
          amount:       -t.entry_fee,
          reference_id: tournamentId,
          description:  `Inscripción: ${t.name ?? t.game ?? tournamentId}`,
        });
        newBal = r.newBalance;
      } else {
        // FREE_ENTRY: sin movimiento de coins, solo log en ledger
        const ledgerRef = adminDb.collection('transactions').doc();
        const now = FieldValue.serverTimestamp();
        tx.set(ledgerRef, {
          userId: uid, type: 'FREE_ENTRY', amount: 0, status: 'completed',
          balance_after: txCoins, reference_id: tournamentId,
          description:  `Torneo gratuito: ${t.name ?? t.game ?? tournamentId}`,
          timestamp: now, created_at: now, updated_at: now,
        });
        newBal = txCoins;
      }

      tx.update(tournamentRef, { players: newPlayers });

      // Si tenía reserva pendiente, marcarla completada
      const reservaRef = adminDb.collection('reservas_torneo').doc(`${uid}_${tournamentId}`);
      tx.set(reservaRef, { estado: 'completado', completadoAt: FieldValue.serverTimestamp() }, { merge: true });

      return { newBalance: newBal, newPlayers, capacity: t.capacity, game: (t.game ?? '') as string, tData: t };
    });

    // Marcar lock como completado (idempotencia permanente)
    await idempotencyRef.set({ uid, tournamentId, status: 'completed', completedAt: Date.now() });

    // ── Auto-start: si la sala se llenó, generar round_1 y activar ──────────
    if (result.newPlayers.length >= result.capacity) {
      try {
        await autoStartTournament(tournamentId, result.newPlayers, result.game, result.tData);
      } catch (e) {
        // No bloquea la respuesta al usuario — se puede reintentar desde el CEO
        console.error('[AutoStart] Error al iniciar torneo:', e);
      }
    }

    return NextResponse.json({ success: true, newBalance: result.newBalance, message: '¡Inscripción exitosa!' });
    // Lock se mantiene como 'completed' — protección permanente contra reinscripción
  } catch (err: unknown) {
    // Si falla, limpiar el lock para que pueda reintentar
    await adminDb.collection('join_locks').doc(idempotencyKey).delete().catch(() => {});
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// ── Auto-start: genera round_1 y pone el torneo ACTIVE ──────────────────────
async function autoStartTournament(
  tournamentId: string,
  players:      string[],
  game:         string,
  tData:        DocumentData,
) {
  const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);

  // Protección contra doble-arranque (race condition entre jugadores)
  const started = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(tournamentRef);
    if (!snap.exists || snap.data()!.status !== 'OPEN') return false;
    tx.update(tournamentRef, { status: 'STARTING' });   // lock temporal
    return true;
  });
  if (!started) return;

  const isEfb = game.toUpperCase().includes('EFOOTBALL') || game.toUpperCase().includes('E-FOOTBALL');

  // Obtener nombres e IDs de juego de cada jugador
  const playerDocs = await Promise.all(
    players.map(p => adminDb.collection('usuarios').doc(p).get())
  );
  const infoMap: Record<string, { nombre: string; gameId: string }> = {};
  playerDocs.forEach(snap => {
    if (snap.exists) {
      const d = snap.data()!;
      infoMap[snap.id] = {
        nombre: d.nombre || snap.id.slice(0, 10),
        gameId: isEfb ? (d.konami_id || '') : (d.ea_id || ''),
      };
    }
  });

  // Mezclar jugadores (shuffle Fisher-Yates)
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const batch    = adminDb.batch();
  const matchIds: string[] = [];

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const p1 = shuffled[i];
    const p2 = shuffled[i + 1];
    const matchRef = adminDb.collection('matches').doc();
    matchIds.push(matchRef.id);
    batch.set(matchRef, {
      p1,
      p2,
      p1_username: infoMap[p1]?.nombre || p1.slice(0, 10),
      p2_username: infoMap[p2]?.nombre || p2.slice(0, 10),
      p1_ea_id:   infoMap[p1]?.gameId || '',
      p2_ea_id:   infoMap[p2]?.gameId || '',
      score:      '',
      winner:     null,
      status:     'WAITING',
      round:      'round_1',
      tournamentId,
      game:       tData.game  || '',
      entry_fee:  tData.entry_fee  || 0,
      prize_pool: tData.prize_pool || 0,
      created_at: FieldValue.serverTimestamp(),
    });
  }

  batch.update(tournamentRef, {
    status:        'ACTIVE',
    current_round: 'round_1',
    match_ids:     matchIds,
    started_at:    FieldValue.serverTimestamp(),
  });

  await batch.commit();
  console.log(`[AutoStart] Torneo ${tournamentId} ACTIVO — ${players.length} jugadores, ${matchIds.length} matches (round_1)`);
}
