'use client';

/**
 * app/ceo/page.tsx
 * LFA PENTÁGONO — Panel CEO completo con navegación por tabs.
 * Tabs: Overview · Usuarios · Torneos · Finanzas · Spawner · Sistema
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, getIdToken } from 'firebase/auth';
import {
  collection, doc, onSnapshot, updateDoc, deleteDoc,
  addDoc, serverTimestamp, writeBatch, increment,
  query, where, limit, orderBy, getDoc, setDoc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import LfaModal, { LfaModalHandle } from '@/app/_components/LfaModal';

/* ─── Tipos ──────────────────────────────────────────────── */
interface Jugador {
  id: string; nombre?: string; email?: string; number?: number;
  baneado?: boolean; ip?: string; ip_conexion?: string; canvas_hash?: string;
  sistema?: string; plataforma_id?: string; region?: string; pais_codigo?: string;
  fair_play?: number; titulos?: number; partidos_jugados?: number;
  rol?: string; es_afiliado?: boolean; ban_hasta?: { toDate?: () => Date } | null;
  lfa_tv?: boolean;
}
interface Room {
  id: string; game?: string; mode?: string; tier?: string; region?: string;
  status?: string; players?: string[]; capacity?: number; entry_fee?: number;
  prize_pool?: number; spawned?: boolean; created_at?: { toDate?: () => Date };
}
interface Retiro {
  id: string; nombre_real?: string; nombreJugador?: string;
  whatsapp?: string; montoCoins?: number; cbuAlias?: string;
  fecha?: { toDate?: () => Date }; uid?: string;
}
interface PagoManual {
  id: string; jugador_nombre?: string; uid?: string; coins?: number; coins_total?: number;
  usd?: number; metodo?: string; comprobante_url?: string; pack_label?: string;
  tx_hash?: string; referencia_id?: string; sender_id?: string;
}
interface Evidencia {
  id: string; imagen_url?: string; sala_id?: string;
  uid_ganador?: string; timestamp?: { toDate?: () => Date };
}
interface SpawnerConfig {
  activo?: boolean; last_run?: { toDate?: () => Date }; last_created?: number;
  slots_activos?: string[];
}

/* ─── Constantes ─────────────────────────────────────────── */
const CEO_UID  = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const FN_BASE  = 'https://us-central1-lfaofficial.cloudfunctions.net';
const TIER_CLR: Record<string, string> = {
  FREE: '#00d4ff', RECREATIVO: '#00ff88', COMPETITIVO: '#ffd700', ELITE: '#ff4757',
};
const GL: Record<string, string> = { FC26: 'FC 26', EFOOTBALL: 'eFootball' };
const ML: Record<string, string> = {
  GENERAL_95: '95 General', ULTIMATE: 'Ultimate Team',
  DREAM_TEAM: 'Dream Team', GENUINOS: 'Genuinos',
};
const RL: Record<string, string> = {
  LATAM_SUR: 'LATAM Sur', LATAM_NORTE: 'LATAM Norte',
  AMERICA: 'América', GLOBAL: 'Global',
};

/* ─── Spawner slot config ─────────────────────────────────── */
const SPAWN_SLOT_PAIRS: [number, number][] = [
  [2,500],[2,2000],[4,0],[4,500],[6,0],[6,500],[6,2000],
  [8,0],[8,500],[8,2000],[12,500],[12,2000],[16,0],[16,10000],
];
const SPAWN_GAMES_CFG = [
  { game:'FC26',      modes:['GENERAL_95','ULTIMATE']  },
  { game:'EFOOTBALL', modes:['DREAM_TEAM','GENUINOS']  },
];
const DEFAULT_SLOTS: string[] = [
  'FC26|GENERAL_95|4|0','FC26|GENERAL_95|4|500',
  'FC26|GENERAL_95|8|0','FC26|GENERAL_95|8|500','FC26|GENERAL_95|8|2000',
  'FC26|ULTIMATE|4|0','FC26|ULTIMATE|4|500',
  'FC26|ULTIMATE|8|0','FC26|ULTIMATE|8|500',
  'EFOOTBALL|DREAM_TEAM|4|0','EFOOTBALL|DREAM_TEAM|4|500',
  'EFOOTBALL|DREAM_TEAM|8|0','EFOOTBALL|DREAM_TEAM|8|500',
  'EFOOTBALL|GENUINOS|4|0','EFOOTBALL|GENUINOS|4|500',
  'EFOOTBALL|GENUINOS|8|0','EFOOTBALL|GENUINOS|8|500',
];

function slotKey(game: string, mode: string, capacity: number, fee: number) {
  return `${game}|${mode}|${capacity}|${fee}`;
}

/* ─── Estilos reutilizables ──────────────────────────────── */
const card: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 'clamp(14px,2.5vw,22px)' };
const inp: React.CSSProperties = { width: '100%', padding: '10px 13px', background: '#0b0e14', border: '1px solid #30363d', color: 'white', borderRadius: 8, marginBottom: 10, fontFamily: "'Roboto',sans-serif", boxSizing: 'border-box', outline: 'none', fontSize: '0.875rem' };
const btn = (bg: string, c = 'black'): React.CSSProperties => ({ background: bg, color: c, border: 'none', padding: '10px 16px', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, borderRadius: 8, cursor: 'pointer', transition: '0.2s', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 });
const sm  = (bg: string, c = 'white'): React.CSSProperties => ({ background: bg, color: c, border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap', transition: '0.2s' });
const th: React.CSSProperties = { padding: '10px 10px', textAlign: 'left', fontFamily: "'Orbitron',sans-serif", color: '#8b949e', fontSize: '0.67rem', borderBottom: '1px solid #30363d', background: 'rgba(0,0,0,0.25)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 10px', borderBottom: '1px solid #1c2028', fontSize: '0.81rem', verticalAlign: 'middle' };

/* ═══════════════════════════════════════════════════════════ */
export default function CeoPage() {
  const router  = useRouter();
  const modal   = useRef<LfaModalHandle>(null);
  const [tab,   setTab]   = useState<'overview'|'usuarios'|'torneos'|'finanzas'|'spawner'|'sistema'|'leads'|'disputas'>('overview');
  const [ready, setReady] = useState(false);

  /* ── Datos Firestore ────────────────────────────────────── */
  const [jugadores,  setJugadores]  = useState<Jugador[]>([]);
  const [rooms,      setRooms]      = useState<Room[]>([]);
  const [retiros,    setRetiros]    = useState<Retiro[]>([]);
  const [pagosAR,    setPagosAR]    = useState<PagoManual[]>([]);
  const [pagosBN,    setPagosBN]    = useState<PagoManual[]>([]);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [spawnerCfg, setSpawnerCfg] = useState<SpawnerConfig>({});
  const [ganancias,  setGanancias]  = useState(0);
  const [visitas,    setVisitas]    = useState(0);
  const [leads,      setLeads]      = useState<{id:string;nombre?:string;email?:string;celular?:string;juego?:string;mensaje?:string;fecha?:{toDate?:()=>Date};uid?:string}[]>([]);
  const [tesoreria,  setTesoreria]  = useState<{usdt_total?:number;usdt_retirado?:number;usdt_pendiente_retiro?:number;depositos_count?:number}>({});

  /* ── Disputas ────────────────────────────────────────────── */
  interface Disputa {
    id: string; matchId: string; disputedBy: string; reason: string;
    screenshot_url?: string; score?: string; status: string;
    created_at?: { toDate?: () => Date };
  }
  const [disputas, setDisputas] = useState<Disputa[]>([]);
  const disputasPend = disputas.filter(d => d.status === 'PENDING').length;

  /* ── UI State ────────────────────────────────────────────── */
  const [busqueda,  setBusqueda]  = useState('');
  const [spawning,  setSpawning]  = useState(false);
  const [spawnLog,  setSpawnLog]  = useState('');
  const [banModal,  setBanModal]  = useState<{uid:string;nombre:string;horas:number;ip?:string}|null>(null);
  const [coinsM,    setCoinsM]    = useState<{uid:string;nombre:string;actual:number;nuevo:string}|null>(null);
  const [expM,      setExpM]      = useState<Jugador|null>(null);

  /* ── Audit panel de retiros ──────────────────────────────── */
  interface AuditData {
    uid: string; nombre: string; email: string; ip: string; fingerprintId: string;
    winRate: number; partidos: number; victorias: number; derrotas: number;
    fairPlay: number; saldo: number;
    colisionIp: { uid: string; nombre: string; ip: string }[];
    colisionFp: { uid: string; nombre: string; fp: string }[];
    ultimosMatchs: { id: string; vs: string; winner: string | null; status: string }[];
    alertas: string[]; riesgo: 'OK' | 'MEDIO' | 'ALTO';
  }
  const [auditModal, setAuditModal]   = useState<AuditData | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  /* ── Usuarios filtros y control ─────────────────────────── */
  const [filtroU,     setFiltroU]     = useState<'todos'|'activos'|'baneados'|'bots'>('todos');
  const [ipBlacklist, setIpBlacklist] = useState<string[]>([]);
  const [banConIp,    setBanConIp]    = useState(false);
  const [cleanupLog,  setCleanupLog]  = useState('');

  /* ── Crear sala form ─────────────────────────────────────── */
  const [crGame,   setCrGame]   = useState('FC26');
  const [crMode,   setCrMode]   = useState('GENERAL_95');
  const [crRegion, setCrRegion] = useState('LATAM_SUR');
  const [crTier,   setCrTier]   = useState('FREE');
  const [crCap,    setCrCap]    = useState('8');

  /* ── Fair play ───────────────────────────────────────────── */
  const [fpUid, setFpUid] = useState('');

  /* ═══ Auth guard ════════════════════════════════════════════ */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }
      const snap = await getDoc(doc(db, 'usuarios', user.uid));
      const d = snap.data() as { rol?: string } | undefined;
      if (user.uid !== CEO_UID && d?.rol !== 'soporte') { router.replace('/hub'); return; }
      setReady(true);
    });
    return unsub;
  }, [router]);

  /* ═══ Listeners ════════════════════════════════════════════ */
  useEffect(() => {
    if (!ready) return;
    const subs: (() => void)[] = [];

    subs.push(onSnapshot(collection(db, 'usuarios'), (snap) => {
      const list: Jugador[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as Jugador));
      setJugadores(list);
    }));

    subs.push(onSnapshot(query(collection(db,'tournaments'), limit(200)), (snap) => {
      const list: Room[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as Room));
      list.sort((a, b) => (b.created_at?.toDate?.()?.getTime()||0) - (a.created_at?.toDate?.()?.getTime()||0));
      setRooms(list);
    }));

    subs.push(onSnapshot(
      query(collection(db,'torneos'), where('estado','in',['finalizado_premios','finalizado'])),
      snap => { let g=0; snap.forEach(d => { const t=d.data(); g+=((t.costo_inscripcion||0)*(t.cupos_totales||0)*0.15); }); setGanancias(g); }
    ));

    subs.push(onSnapshot(query(collection(db,'retiros'), where('estado','==','pendiente')), snap => {
      const l: Retiro[] = []; snap.forEach(d => l.push({ id: d.id, ...d.data() } as Retiro)); setRetiros(l);
    }));

    subs.push(onSnapshot(query(collection(db,'pagos_pendientes'), where('estado','==','pendiente')), snap => {
      const ar: PagoManual[] = [], bn: PagoManual[] = [];
      snap.forEach(d => { const p = { id: d.id, ...d.data() } as PagoManual; ((p.metodo||'').toLowerCase().includes('binance') ? bn : ar).push(p); });
      setPagosAR(ar); setPagosBN(bn);
    }));

    subs.push(onSnapshot(query(collection(db,'evidencias'), orderBy('timestamp','desc'), limit(30)), snap => {
      const l: Evidencia[] = []; snap.forEach(d => l.push({ id: d.id, ...d.data() } as Evidencia)); setEvidencias(l);
    }));

    subs.push(onSnapshot(doc(db,'configuracion','spawner'), d => {
      if (d.exists()) setSpawnerCfg(d.data() as SpawnerConfig);
    }));

    subs.push(onSnapshot(doc(db,'configuracion','tesoreria'), d => {
      if (d.exists()) setTesoreria(d.data() as typeof tesoreria);
    }));

    subs.push(onSnapshot(doc(db,'configuracion','ip_blacklist'), d => {
      if (d.exists()) setIpBlacklist((d.data() as { ips?: string[] }).ips ?? []);
    }));

    subs.push(onSnapshot(doc(db,'estadisticas','globales'), d => {
      if (d.exists()) setVisitas((d.data() as { visitas_totales?: number }).visitas_totales || 0);
    }));

    subs.push(onSnapshot(query(collection(db,'leads_streamers'), orderBy('fecha','desc'), limit(100)), snap => {
      const l: typeof leads = [];
      snap.forEach(d => l.push({ id: d.id, ...d.data() } as typeof leads[number]));
      setLeads(l);
    }));

    subs.push(onSnapshot(query(collection(db,'disputas'), orderBy('created_at','desc'), limit(50)), snap => {
      const l: Disputa[] = []; snap.forEach(d => l.push({ id: d.id, ...d.data() } as Disputa)); setDisputas(l);
    }));

    return () => subs.forEach(u => u());
  }, [ready]);

  /* ═══ Helpers ═══════════════════════════════════════════════ */
  const alerta = useCallback((t: string, m: string, tipo?: 'info'|'error'|'exito') =>
    modal.current!.mostrarAlerta(t, m, tipo), []);

  /* ── Pagos / Retiros ─────────────────────────────────────── */
  async function aprobarPago(id: string, uid: string, coins: number, usd: number, txHash?: string, refId?: string) {
    const ok = await alerta('CONFIRMAR DEPÓSITO',
      `Aprobando 🪙${coins.toLocaleString()} (${usd} USDT) para UID ${uid.slice(0,8)}...\n\nTX: ${txHash || '—'}\nRef: ${refId || '—'}\n\n¿Verificaste el comprobante y la transacción en Binance?`,
      'info');
    if (!ok) return;
    const b = writeBatch(db);
    b.update(doc(db,'usuarios',uid), { number: increment(coins) });
    b.update(doc(db,'pagos_pendientes',id), { estado: 'aprobado', aprobado_at: serverTimestamp() });
    // Sumar al fondo de tesorería
    b.set(doc(db,'configuracion','tesoreria'), { usdt_total: increment(usd), depositos_count: increment(1) }, { merge: true });
    await b.commit();
    // Registrar en historial de transacciones del usuario
    await addDoc(collection(db,'transactions'), {
      userId: uid, type: 'DEPOSIT', amount: coins, status: 'completed',
      balance_after: 0, // el ledger lo calculará en el próximo ciclo
      reference_id: id, description: `Depósito aprobado: $${usd} USDT → 🪙${coins}`,
      timestamp: serverTimestamp(), created_at: serverTimestamp(), updated_at: serverTimestamp(),
    });
    await alerta('APROBADO', `🪙${coins.toLocaleString()} coins acreditadas. Tesorería +$${usd} USDT.`, 'exito');
  }
  async function rechazarPago(id: string) { await updateDoc(doc(db,'pagos_pendientes',id), { estado: 'rechazado', rechazado_at: serverTimestamp() }); }
  async function marcarRetiroPagado(id: string) { await updateDoc(doc(db,'retiros',id), { estado: 'completado' }); await alerta('LISTO','Retiro marcado como pagado.','exito'); }
  async function rechazarRetiro(id: string, uid: string, monto: number) {
    const b = writeBatch(db);
    b.update(doc(db,'usuarios',uid), { number: increment(monto) });
    b.update(doc(db,'retiros',id), { estado: 'rechazado' });
    await b.commit(); await alerta('DEVUELTO','Coins devueltas.','exito');
  }

  async function abrirAudit(uid: string) {
    setAuditLoading(true); setAuditModal(null);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await getIdToken(user);
      const res = await fetch(`/api/audit/retiroDetail?uid=${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { await alerta('ERROR', 'No se pudo cargar la auditoría.', 'error'); return; }
      const data = await res.json();
      setAuditModal(data);
    } catch { await alerta('ERROR', 'Error al cargar auditoría.', 'error'); }
    setAuditLoading(false);
  }

  async function resolveDispute(disputaId: string, matchId: string, verdict: 'reporter_wins'|'disputer_wins'|'no_evidence'|'rematch', notas?: string) {
    try {
      const user = auth.currentUser; if (!user) return;
      const token = await getIdToken(user);
      const res = await fetch('/api/ceo/resolveDispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ disputaId, matchId, verdict, notas }),
      });
      const data = await res.json();
      if (!res.ok) { await alerta('ERROR', data.error || 'Error al resolver disputa.', 'error'); return; }
      const msgs: Record<string, string> = {
        reporter_wins: '✅ Resultado validado. Fair Play descontado al que disputó sin razón.',
        disputer_wins: '⚖️ Resultado revertido. Fair Play descontado al reportador.',
        no_evidence:   '🔍 Disputa sin evidencia. Ambos perdieron Fair Play leve.',
        rematch:       '🔄 Rematch ordenado.',
      };
      await alerta('DISPUTA RESUELTA', msgs[verdict] || 'Resuelto.', 'exito');
    } catch { await alerta('ERROR', 'Error al resolver disputa.', 'error'); }
  }

  /* ── Usuarios ────────────────────────────────────────────── */
  async function ejecutarBan(uid: string, nombre: string, horas: number) {
    const banHasta = horas === 0 ? null : new Date(Date.now() + horas * 3_600_000);
    await updateDoc(doc(db,'usuarios',uid), { baneado: true, ban_hasta: banHasta });
    if (banConIp && banModal?.ip && banModal.ip.length > 4) {
      const newList = Array.from(new Set([...ipBlacklist, banModal.ip]));
      const blRef = doc(db,'configuracion','ip_blacklist');
      await updateDoc(blRef, { ips: newList }).catch(() =>
        setDoc(blRef, { ips: newList })
      );
    }
    await alerta('SANCIONADO', `${nombre} — ${horas === 0 ? 'Ban permanente' : horas+'h'}.`, 'error');
    setBanModal(null);
    setBanConIp(false);
  }
  async function desbanear(uid: string, nombre: string) {
    await updateDoc(doc(db,'usuarios',uid), { baneado: false, ban_hasta: null });
    await alerta('DESBANEADO', `${nombre} desbaneado.`, 'exito');
  }

  async function toggleLfaTV(uid: string, nombre: string, actual: boolean) {
    await updateDoc(doc(db,'usuarios',uid), { lfa_tv: !actual });
    await alerta('LFA TV', actual ? `${nombre} removido de LFA TV.` : `${nombre} habilitado en LFA TV. 📺`, 'exito');
  }

  async function limpiarBots() {
    const bots = jugadores.filter(j => j.rol === 'bot');
    if (bots.length === 0) { await alerta('SIN BOTS', 'No hay usuarios con rol=bot.', 'info'); return; }
    const ok = await alerta('LIMPIAR BOTS', `¿Eliminar ${bots.length} cuentas bot de Firestore?`, 'error');
    if (!ok) return;
    const b = writeBatch(db);
    bots.forEach(j => b.delete(doc(db,'usuarios',j.id)));
    await b.commit();
    setCleanupLog(`✅ ${bots.length} bots eliminados.`);
    await alerta('LIMPIEZA COMPLETA', `${bots.length} cuentas bot eliminadas.`, 'exito');
  }

  async function limpiarPorPrefijo(prefijo: string) {
    if (!prefijo.trim()) return;
    const targets = jugadores.filter(j => (j.nombre||'').toLowerCase().startsWith(prefijo.toLowerCase()));
    if (targets.length === 0) { await alerta('SIN RESULTADOS', `No hay usuarios cuyo nick empiece con “${prefijo}”.`, 'info'); return; }
    const ok = await alerta('CONFIRMAR LIMPIEZA', `¿Eliminar ${targets.length} usuario(s) que empiecen con “${prefijo}”?`, 'error');
    if (!ok) return;
    const b = writeBatch(db);
    targets.forEach(j => b.delete(doc(db,'usuarios',j.id)));
    await b.commit();
    setCleanupLog(`✅ ${targets.length} usuarios eliminados (prefijo: ${prefijo}).`);
    await alerta('LIMPIEZA COMPLETA', `${targets.length} usuarios eliminados.`, 'exito');
  }
  async function guardarCoins(uid: string, nuevo: number) {
    if (isNaN(nuevo) || nuevo < 0) { await alerta('ERROR','Monto inválido.','error'); return; }
    await updateDoc(doc(db,'usuarios',uid), { number: nuevo });
    await alerta('LISTO', `Saldo → 🪙${nuevo.toLocaleString()}`, 'exito');
    setCoinsM(null);
  }
  async function cambiarFairPlay(valor: number) {
    if (!fpUid) { await alerta('FALTAN DATOS','Pegá el UID primero.','error'); return; }
    await updateDoc(doc(db,'usuarios',fpUid), { fair_play: valor });
    await alerta('LISTO', `Fair Play → ${valor}%`, 'exito');
    setFpUid('');
  }

  /* ── Rooms ───────────────────────────────────────────────── */
  async function deleteRoom(id: string) {
    const ok = await alerta('ELIMINAR SALA','¿Eliminar definitivamente?','error');
    if (!ok) return; await deleteDoc(doc(db,'tournaments',id));
  }
  async function limpiarSalasVacias() {
    const vacias = rooms.filter(r => r.status === 'OPEN' && (r.players?.length || 0) === 0);
    if (vacias.length === 0) { await alerta('SIN SALAS', 'No hay salas OPEN sin jugadores.', 'info'); return; }
    const ok = await alerta('LIMPIAR VACÍAS', `¿Eliminar ${vacias.length} sala(s) OPEN sin jugadores?`, 'error');
    if (!ok) return;
    const b = writeBatch(db);
    vacias.forEach(r => b.delete(doc(db,'tournaments',r.id)));
    await b.commit();
    await alerta('LISTO', `${vacias.length} salas vacías eliminadas.`, 'exito');
  }
  async function limpiarTodasAbiertas() {
    const abiertas = rooms.filter(r => r.status === 'OPEN');
    if (abiertas.length === 0) { await alerta('SIN SALAS', 'No hay salas OPEN.', 'info'); return; }
    const ok = await alerta('⚠️ PELIGRO', `¿Eliminar TODAS las ${abiertas.length} salas OPEN? (incluye salas con jugadores)`, 'error');
    if (!ok) return;
    const b = writeBatch(db);
    abiertas.forEach(r => b.delete(doc(db,'tournaments',r.id)));
    await b.commit();
    await alerta('LISTO', `${abiertas.length} salas eliminadas.`, 'exito');
  }
  async function crearSalaManual() {
    const FEES: Record<string, number> = { FREE:0, RECREATIVO:500, COMPETITIVO:1000, ELITE:10000 };
    const cap      = parseInt(crCap);
    const fee      = FEES[crTier] ?? 0;
    const pool     = cap * fee * 0.9;
    const isFree   = fee === 0;
    function mkPrizes() {
      if (isFree) return [{ place:1, label:'🥇 1°', percentage:100, coins:0 }];
      if (cap <= 6)  return [{ place:1, label:'🥇 1°', percentage:100, coins:pool }];
      if (cap <= 16) return [
        { place:1, label:'🥇 1°', percentage:70, coins:Math.floor(pool*0.70) },
        { place:2, label:'🥈 2°', percentage:30, coins:Math.floor(pool*0.30) },
      ];
      if (cap <= 32) return [
        { place:1, label:'🥇 1°', percentage:50, coins:Math.floor(pool*0.50) },
        { place:2, label:'🥈 2°', percentage:25, coins:Math.floor(pool*0.25) },
        { place:3, label:'🥉 3°', percentage:15, coins:Math.floor(pool*0.15) },
        { place:4, label:'4°',    percentage:10, coins:Math.floor(pool*0.10) },
      ];
      return [
        { place:1, label:'🥇 1°', percentage:45, coins:Math.floor(pool*0.45) },
        { place:2, label:'🥈 2°', percentage:25, coins:Math.floor(pool*0.25) },
        { place:3, label:'🥉 3°', percentage:18, coins:Math.floor(pool*0.18) },
        { place:4, label:'4°',    percentage:12, coins:Math.floor(pool*0.12) },
      ];
    }
    await addDoc(collection(db,'tournaments'), {
      game:crGame, mode:crMode, region:crRegion, tier:crTier, free:isFree,
      entry_fee:fee, prize_pool:pool, prizes:mkPrizes(),
      capacity:cap, players:[], status:'OPEN', spawned:false, created_at:serverTimestamp(),
    });
    await alerta('SALA CREADA', `${GL[crGame]} · ${ML[crMode]} · ${crTier} · ${cap}j · ${mkPrizes().length} premios`, 'exito');
  }

  /* ── Spawner manual ──────────────────────────────────────── */
  async function triggerManualSpawn() {
    setSpawning(true); setSpawnLog('Conectando con servidor...');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sin sesión');
      const token = await getIdToken(user);
      const res = await fetch(`${FN_BASE}/manualSpawn`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      });
      const data = await res.json();
      setSpawnLog(data.ok ? `✅ Ciclo completo — ${data.created} sala(s) creadas.` : `⚠️ ${data.error}`);
    } catch (e: unknown) { setSpawnLog(`Error: ${(e as Error).message}`); }
    setSpawning(false);
  }

  async function vaciarVAR() {
    const ok = await alerta('VACIAR VAR','¿Borrar TODAS las evidencias?','error');
    if (!ok) return;
    const b = writeBatch(db); evidencias.forEach(e => b.delete(doc(db,'evidencias',e.id)));
    await b.commit();
  }

  /* ── Stats derivadas ─────────────────────────────────────── */
  const totalCoins = jugadores.reduce((s, j) => s + (j.number||0), 0);
  const openRooms  = rooms.filter(r => r.status === 'OPEN').length;
  const retPend    = retiros.length;
  const pagPend    = pagosAR.length + pagosBN.length;

  const jFiltrados = jugadores.filter(j => {
    if (!busqueda) {
      if (filtroU === 'activos')  return !j.baneado && j.rol !== 'bot';
      if (filtroU === 'baneados') return !!j.baneado;
      if (filtroU === 'bots')     return j.rol === 'bot';
      return true;
    }
    const q = busqueda.toLowerCase();
    const match = (j.nombre||'').toLowerCase().includes(q) || (j.email||'').toLowerCase().includes(q) ||
      (j.ip||'').includes(q) || (j.ip_conexion||'').includes(q) || (j.canvas_hash||'').includes(q);
    if (filtroU === 'activos')  return match && !j.baneado && j.rol !== 'bot';
    if (filtroU === 'baneados') return match && !!j.baneado;
    if (filtroU === 'bots')     return match && j.rol === 'bot';
    return match;
  });

  /* ═══ LOADING ═══════════════════════════════════════════════ */
  if (!ready) return (
    <div style={{ background:'#0b0e14', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div style={{ width:48, height:48, border:'3px solid #ffd700', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily:"'Orbitron',sans-serif", color:'#ffd700', fontSize:'0.82rem' }}>VERIFICANDO IDENTIDAD…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ═══ TABS ══════════════════════════════════════════════════ */
  type TabId = 'overview'|'usuarios'|'torneos'|'finanzas'|'spawner'|'sistema'|'leads'|'disputas';
  const TABS: { id: TabId; label: string; badge: number }[] = [
    { id:'overview',  label:'📊 Overview',  badge: 0 },
    { id:'usuarios',  label:'👥 Usuarios',  badge: jugadores.length },
    { id:'torneos',   label:'🏆 Torneos',   badge: openRooms },
    { id:'finanzas',  label:'💰 Finanzas',  badge: retPend + pagPend },
    { id:'disputas',  label:'⚖️ Disputas',  badge: disputasPend },
    { id:'spawner',   label:'🤖 Spawner',   badge: 0 },
    { id:'sistema',   label:'⚙️ Sistema',   badge: 0 },
    { id:'leads',     label:'🎙️ Streamers', badge: leads.length },
  ];

  /* ═══ RENDER ════════════════════════════════════════════════ */
  return (
    <>
      <LfaModal ref={modal} />
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#0b0e14}
        ::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}
        .crow:hover td{background:rgba(255,255,255,0.025)!important}
        .cact:hover{opacity:0.82;transform:scale(1.04)}
        .ctab:hover{background:rgba(255,215,0,0.07)!important}
      `}</style>

      <div style={{ margin:0, fontFamily:"'Roboto',sans-serif", background:'#0b0e14', color:'white', minHeight:'100vh' }}>

        {/* ── HEADER ──────────────────────────────────────── */}
        <header style={{ background:'rgba(7,9,13,0.97)', display:'flex', alignItems:'stretch', borderBottom:'2px solid #ffd700', position:'sticky', top:0, zIndex:100, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', padding:'0 20px', borderRight:'1px solid #30363d', minHeight:54 }}>
            <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'1rem', fontWeight:900, letterSpacing:2 }}>
              LFA <span style={{ color:'#ffd700' }}>PENTÁGONO</span>
            </span>
          </div>
          <nav style={{ display:'flex', alignItems:'stretch', flex:1, overflowX:'auto' }}>
            {TABS.map(t => (
              <button key={t.id} className="ctab" onClick={() => setTab(t.id)}
                style={{ background: tab===t.id ? 'rgba(255,215,0,0.1)' : 'transparent', color: tab===t.id ? '#ffd700' : '#8b949e', border:'none', borderBottom: tab===t.id ? '2px solid #ffd700' : '2px solid transparent', padding:'0 18px', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', cursor:'pointer', fontWeight:700, whiteSpace:'nowrap', position:'relative', transition:'0.15s', letterSpacing:0.5 }}>
                {t.label}
                {t.badge > 0 && (
                  <span style={{ position:'absolute', top:8, right:6, background: t.id==='finanzas' ? '#ff4757' : '#ffd700', color: t.id==='finanzas' ? 'white' : 'black', fontSize:'0.58rem', fontFamily:"'Roboto',sans-serif", fontWeight:900, borderRadius:10, padding:'1px 5px', minWidth:16, textAlign:'center', lineHeight:'14px' }}>
                    {t.badge > 99 ? '99+' : t.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <a href="/hub" style={{ display:'flex', alignItems:'center', padding:'0 16px', color:'#8b949e', textDecoration:'none', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', borderLeft:'1px solid #30363d' }}>↩ SALIR</a>
        </header>

        {/* ── MAIN ────────────────────────────────────────── */}
        <main style={{ maxWidth:1400, margin:'0 auto', padding:'clamp(14px,3vw,28px) clamp(12px,4vw,5%)' }}>

          {/* ══ OVERVIEW ════════════════════════════════════ */}
          {tab === 'overview' && <>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ffd700', margin:'0 0 18px', fontSize:'0.9rem', borderLeft:'4px solid #ffd700', paddingLeft:12 }}>VISIÓN GENERAL DEL SISTEMA</h2>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))', gap:12, marginBottom:24 }}>
              {[
                { l:'USUARIOS TOTALES',   v: jugadores.length,                c:'#00ff88' },
                { l:'COINS EN WALLETS',   v: `🪙 ${totalCoins.toLocaleString()}`, c:'#009ee3' },
                { l:'GANANCIAS LFA (15%)',v: `🪙 ${ganancias.toFixed(0)}`,    c:'#ffd700' },
                { l:'SALAS ABIERTAS',     v: openRooms,                       c: openRooms > 0 ? '#00ff88' : '#ff4757' },
                { l:'RETIROS PEND.',      v: retPend,                         c: retPend > 0 ? '#ff4757' : '#8b949e' },
                { l:'PAGOS PEND.',        v: pagPend,                         c: pagPend > 0 ? '#f3ba2f' : '#8b949e' },
                { l:'VISITAS WEB',        v: visitas,                         c:'#9146FF' },
                { l:'SPAWNER',            v: spawnerCfg.activo ? '🟢 ON' : '🔴 OFF', c: spawnerCfg.activo ? '#00ff88' : '#ff4757' },
              ].map(k => (
                <div key={k.l} style={{ ...card, borderLeft:`4px solid ${k.c}` }}>
                  <div style={{ color:'#8b949e', fontSize:'0.62rem', fontFamily:"'Orbitron',sans-serif", marginBottom:6 }}>{k.l}</div>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'1.45rem', fontWeight:900, color:k.c }}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* Tesorería USDT */}
            {(() => {
              const total    = tesoreria.usdt_total || 0;
              const retirado = tesoreria.usdt_retirado || 0;
              const pendRet  = tesoreria.usdt_pendiente_retiro || 0;
              const disponible = Math.max(0, total - retirado - pendRet);
              const pct = total > 0 ? Math.round((disponible / total) * 100) : 0;
              const clr = pct > 50 ? '#00ff88' : pct > 20 ? '#f3ba2f' : '#ff4757';
              return (
                <div style={{ ...card, borderColor:'#009ee3', marginBottom:24 }}>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", color:'#009ee3', fontSize:'0.82rem', marginBottom:14 }}>💰 TESORERÍA USDT</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:14 }}>
                    {[
                      { l:'DEPOSITADO TOTAL', v:`$${total.toFixed(2)}`,     c:'#00ff88' },
                      { l:'RETIRADO',         v:`$${retirado.toFixed(2)}`,  c:'#ff4757' },
                      { l:'PEND. RETIRO',     v:`$${pendRet.toFixed(2)}`,   c:'#f3ba2f' },
                      { l:'DISPONIBLE',       v:`$${disponible.toFixed(2)}`,c: clr },
                    ].map(k => (
                      <div key={k.l} style={{ background:'rgba(0,0,0,0.3)', borderRadius:10, padding:'10px 14px', borderLeft:`3px solid ${k.c}` }}>
                        <div style={{ color:'#8b949e', fontSize:'0.6rem', fontFamily:"'Orbitron',sans-serif", marginBottom:4 }}>{k.l}</div>
                        <div style={{ color:k.c, fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'1.1rem' }}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height:8, background:'#30363d', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ width:`${pct}%`, height:'100%', background:clr, borderRadius:99, transition:'width 0.5s' }} />
                  </div>
                  <div style={{ color:'#8b949e', fontSize:'0.68rem', marginTop:6 }}>
                    {pct}% disponible · {tesoreria.depositos_count||0} depósitos aprobados · <span style={{ color: disponible < 50 ? '#ff4757' : '#8b949e' }}>{disponible < 50 ? '⚠️ SALDO BAJO' : '✅ SALDO OK'}</span>
                  </div>
                </div>
              );
            })()}

            {/* Últimas salas */}
            <div style={{ ...card, padding:0, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid #30363d', fontFamily:"'Orbitron',sans-serif", color:'#00ff88', fontSize:'0.82rem' }}>🎮 ÚLTIMAS SALAS ABIERTAS</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.79rem' }}>
                  <thead><tr>{['JUEGO','MODO','TIER','REGIÓN','ESTADO','PLAYERS','ENTRADA','SPAWN'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rooms.filter(r => r.status === 'OPEN').slice(0,12).map(r => (
                      <tr key={r.id} className="crow">
                        <td style={td}>{GL[r.game||'']||r.game}</td>
                        <td style={td}>{ML[r.mode||'']||r.mode}</td>
                        <td style={{ ...td, color:TIER_CLR[r.tier||'']||'#fff', fontWeight:700 }}>{r.tier}</td>
                        <td style={td}>{RL[r.region||'']||r.region}</td>
                        <td style={{ ...td, color:'#00ff88', fontWeight:700 }}>OPEN</td>
                        <td style={td}>{(r.players?.length||0)}/{r.capacity}</td>
                        <td style={{ ...td, color:'#ffd700' }}>{r.entry_fee ? `🪙${r.entry_fee.toLocaleString()}` : 'GRATIS'}</td>
                        <td style={{ ...td, color:'#8b949e' }}>{r.spawned ? '🤖 Auto' : '👤 Manual'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>}

          {/* ══ USUARIOS ════════════════════════════════════ */}
          {tab === 'usuarios' && <>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:10 }}>
              <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#00ff88', margin:0, fontSize:'0.9rem' }}>👥 RADAR ANTI-SMURF &amp; CONTROL</h2>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={limpiarBots}>🤖 Limpiar bots</button>
                <button style={sm('rgba(255,215,0,0.15)','#ffd700')} onClick={async () => {
                  const p = await modal.current!.pedirDato('PREFIJO A ELIMINAR','Nick que empieza con... (ej: PRUEBA, TEST)');
                  if (p) limpiarPorPrefijo(p);
                }}>🧹 Limpiar por nick</button>
              </div>
            </div>

            {/* Filtros */}
            <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
              {([
                { k:'todos',    l:`🌐 Todos (${jugadores.length})` },
                { k:'activos',  l:`✅ Activos (${jugadores.filter(j=>!j.baneado&&j.rol!=='bot').length})` },
                { k:'baneados', l:`🚫 Baneados (${jugadores.filter(j=>j.baneado).length})` },
                { k:'bots',     l:`🤖 Bots (${jugadores.filter(j=>j.rol==='bot').length})` },
              ] as { k:'todos'|'activos'|'baneados'|'bots'; l:string }[]).map(f => (
                <button key={f.k} onClick={() => setFiltroU(f.k)} style={{
                  background: filtroU===f.k ? 'rgba(0,255,136,0.1)' : 'transparent',
                  border: `1px solid ${filtroU===f.k ? '#00ff88' : '#30363d'}`,
                  color: filtroU===f.k ? '#00ff88' : '#8b949e',
                  padding:'5px 12px', borderRadius:20, cursor:'pointer',
                  fontFamily:"'Orbitron',sans-serif", fontSize:'0.67rem', fontWeight:700,
                }}>
                  {f.l}
                </button>
              ))}
              <span style={{ color:'#8b949e', fontSize:'0.72rem', alignSelf:'center', marginLeft:4 }}>{jFiltrados.length} mostrando</span>
            </div>

            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ ...inp, marginBottom:12 }} placeholder="🔍 Buscar por Nick, Email, IP o Canvas Hash..." />

            {cleanupLog && <div style={{ background:'rgba(0,255,136,0.07)', border:'1px solid #00ff88', borderRadius:8, padding:'9px 14px', marginBottom:12, color:'#00ff88', fontSize:'0.78rem' }}>{cleanupLog}</div>}

            <div style={{ ...card, overflowX:'auto', padding:0 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem', minWidth:820 }}>
                <thead><tr>{['JUGADOR','EMAIL / REGIÓN','IP / PAÍS','HARDWARE','SALDO','FP%','ESTADO','ACCIONES'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {jFiltrados.slice(0,120).map(j => {
                    const ipMostrada = j.ip && j.ip.length > 4 ? j.ip : (j.ip_conexion||'—');
                    const ipBloqueada = ipBlacklist.includes(j.ip||'') || ipBlacklist.includes(j.ip_conexion||'');
                    return (
                      <tr key={j.id} className="crow" style={{ opacity: j.baneado ? 0.65 : 1 }}>
                        <td style={td}>
                          <div style={{ fontWeight:700, color:j.baneado ? '#ff4757' : j.rol==='bot' ? '#9146FF' : 'white' }}>{j.nombre||'—'}</div>
                          <div style={{ color:'#8b949e', fontSize:'0.68rem', cursor:'pointer' }} onClick={() => navigator.clipboard?.writeText(j.id)} title="Clic → copiar UID">UID: {j.id.slice(0,10)}…</div>
                          {j.rol && j.rol !== 'jugador' && <span style={{ background:'rgba(145,70,255,0.15)', color:'#9146FF', padding:'1px 6px', borderRadius:4, fontSize:'0.62rem', fontWeight:700 }}>{j.rol.toUpperCase()}</span>}
                        </td>
                        <td style={td}>
                          <div style={{ fontSize:'0.73rem' }}>{j.email||'—'}</div>
                          <div style={{ color:'#8b949e', fontSize:'0.67rem' }}>{j.region||'—'}</div>
                        </td>
                        <td style={td}>
                          <div style={{ fontFamily:'monospace', fontSize:'0.72rem', color: ipBloqueada ? '#ff4757' : '#e6edf3' }}>
                            {ipBloqueada && '🚫 '}{ipMostrada}
                          </div>
                          <div style={{ color:'#8b949e', fontSize:'0.64rem' }}>{j.pais_codigo||j.ip_conexion||'—'}</div>
                        </td>
                        <td style={td}>
                          <div style={{ color:'#ffd700', fontSize:'0.68rem', fontFamily:'monospace' }}>{(j.canvas_hash||'—').slice(0,14)}</div>
                          <div style={{ color:'#8b949e', fontSize:'0.65rem' }}>{j.sistema||'—'}</div>
                        </td>
                        <td style={{ ...td, color:'#00ff88', fontWeight:700 }}>🪙 {(j.number||0).toLocaleString()}</td>
                        <td style={{ ...td, color:(j.fair_play??100)>=80 ? '#00ff88' : (j.fair_play??100)>=50 ? '#ffd700' : '#ff4757', fontWeight:700 }}>
                          {j.fair_play??100}%
                        </td>
                        <td style={td}>
                          <span style={{ color:j.baneado ? '#ff4757' : '#00ff88', fontWeight:700, fontSize:'0.7rem' }}>
                            {j.baneado ? '🚫 BAN' : '✅ OK'}
                          </span>
                          {j.ban_hasta?.toDate && (
                            <div style={{ color:'#8b949e', fontSize:'0.6rem' }}>hasta {j.ban_hasta.toDate!().toLocaleDateString('es')}</div>
                          )}
                        </td>
                        <td style={{ ...td, minWidth:160 }}>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                            {!j.baneado
                              ? <button className="cact" style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={() => setBanModal({ uid:j.id, nombre:j.nombre||j.id, horas:24, ip: j.ip||j.ip_conexion })}>🚫 BAN</button>
                              : <button className="cact" style={sm('rgba(0,255,136,0.15)','#00ff88')} onClick={() => desbanear(j.id, j.nombre||j.id)}>✅ DESBANEAR</button>
                            }
                            <button className="cact" style={sm('rgba(255,215,0,0.15)','#ffd700')} onClick={() => setCoinsM({ uid:j.id, nombre:j.nombre||j.id, actual:j.number||0, nuevo:String(j.number||0) })}>🪙</button>
                            <button className="cact" style={sm('rgba(0,158,227,0.15)','#009ee3')} onClick={() => setExpM(j)}>🕵️</button>
                            <button className="cact" style={sm(j.lfa_tv ? 'rgba(161,113,247,0.2)' : 'rgba(161,113,247,0.07)', j.lfa_tv ? '#a371f7' : '#555')} onClick={() => toggleLfaTV(j.id, j.nombre||j.id, !!j.lfa_tv)} title={j.lfa_tv ? 'Quitar LFA TV' : 'Habilitar LFA TV'}>📺{j.lfa_tv ? ' ✓' : ''}</button>
                            {j.rol === 'bot' && <button className="cact" style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={async () => { const ok = await alerta('ELIMINAR BOT',`¿Eliminar a ${j.nombre}?`,'error'); if(ok) await deleteDoc(doc(db,'usuarios',j.id)); }}>🗑️</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {jFiltrados.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign:'center', color:'#8b949e', padding:30 }}>Sin resultados</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* IP Blacklist */}
            <div style={{ ...card, marginTop:18, borderTop:'3px solid #ff4757' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ff4757', margin:0, fontSize:'0.82rem' }}>🚫 IP BLACKLIST ({ipBlacklist.length} IPs bloqueadas)</h3>
                {ipBlacklist.length > 0 && (
                  <button style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={async () => {
                    const ok = await alerta('VACIAR BLACKLIST','¿Desbloquear TODAS las IPs?','error');
                    if (ok) await setDoc(doc(db,'configuracion','ip_blacklist'),{ ips:[] });
                  }}>Vaciar todo</button>
                )}
              </div>
              {ipBlacklist.length === 0
                ? <div style={{ color:'#8b949e', fontSize:'0.78rem' }}>Sin IPs bloqueadas. Al banear un jugador podés activar &ldquo;Bloquear IP también&rdquo;.</div>
                : <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {ipBlacklist.map(ip => (
                      <div key={ip} style={{ background:'rgba(255,71,87,0.08)', border:'1px solid #ff475740', borderRadius:6, padding:'3px 10px', fontSize:'0.72rem', fontFamily:'monospace', color:'#ff4757', display:'flex', alignItems:'center', gap:6 }}>
                        {ip}
                        <button onClick={() => setDoc(doc(db,'configuracion','ip_blacklist'),{ ips: ipBlacklist.filter(i=>i!==ip) })} style={{ background:'none', border:'none', color:'#ff4757', cursor:'pointer', padding:0, fontWeight:700, fontSize:'0.8rem', lineHeight:1 }}>×</button>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </>}

          {/* ══ TORNEOS ═════════════════════════════════════ */}
          {tab === 'torneos' && <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, marginBottom:18 }}>
              <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ffd700', margin:0, fontSize:'0.9rem' }}>🏆 CONTROL DE SALAS — ARENA 1VS1</h2>
              <div style={{ display:'flex', gap:8 }}>
                <button style={sm('rgba(255,165,0,0.15)','#ffa500')} onClick={limpiarSalasVacias}>🧹 Vacías</button>
                <button style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={limpiarTodasAbiertas}>🗑️ Todas OPEN</button>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))', gap:18, marginBottom:22 }}>
              {/* Crear sala */}
              <div style={{ ...card, borderTop:'3px solid #00ff88' }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#00ff88', margin:'0 0 12px', fontSize:'0.85rem' }}>➕ CREAR SALA MANUAL</h3>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <select style={inp} value={crGame} onChange={e => { setCrGame(e.target.value); setCrMode(e.target.value==='FC26'?'GENERAL_95':'DREAM_TEAM'); }}>
                    <option value="FC26">FC 26</option>
                    <option value="EFOOTBALL">eFootball</option>
                  </select>
                  <select style={inp} value={crMode} onChange={e => setCrMode(e.target.value)}>
                    {crGame==='FC26' ? <>
                      <option value="GENERAL_95">95 General</option>
                      <option value="ULTIMATE">Ultimate Team</option>
                    </> : <>
                      <option value="DREAM_TEAM">Dream Team</option>
                      <option value="GENUINOS">Genuinos</option>
                    </>}
                  </select>
                  <select style={inp} value={crRegion} onChange={e => setCrRegion(e.target.value)}>
                    <option value="LATAM_SUR">LATAM Sur</option>
                    <option value="LATAM_NORTE">LATAM Norte</option>
                    <option value="AMERICA">América</option>
                    <option value="GLOBAL">Global</option>
                  </select>
                  <select style={inp} value={crTier} onChange={e => setCrTier(e.target.value)}>
                    <option value="FREE">GRATIS</option>
                    <option value="RECREATIVO">RECREATIVO (500)</option>
                    <option value="COMPETITIVO">COMPETITIVO (1.000)</option>
                    <option value="ELITE">ELITE (10.000)</option>
                  </select>
                  <select style={{ ...inp, gridColumn:'1/-1' }} value={crCap} onChange={e => setCrCap(e.target.value)}>
                    <option value="4">4 cupos</option>
                    <option value="8">8 cupos</option>
                    <option value="12">12 cupos</option>
                    <option value="16">16 cupos</option>
                    <option value="32">32 cupos</option>
                    <option value="64">64 cupos</option>
                  </select>
                </div>
                <button style={{ ...btn('#00ff88'), width:'100%', marginTop:2 }} onClick={crearSalaManual}>🚀 PUBLICAR SALA</button>
              </div>

              {/* Estado por tier */}
              <div style={{ ...card, borderTop:'3px solid #009ee3' }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#009ee3', margin:'0 0 12px', fontSize:'0.85rem' }}>📊 SALAS POR TIER</h3>
                {(['FREE','RECREATIVO','COMPETITIVO','ELITE'] as const).map(tier => {
                  const ab = rooms.filter(r => r.tier===tier && r.status==='OPEN').length;
                  const to = rooms.filter(r => r.tier===tier).length;
                  return (
                    <div key={tier} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid #1c2028' }}>
                      <span style={{ color:TIER_CLR[tier], fontWeight:700, fontSize:'0.8rem' }}>{tier}</span>
                      <div>
                        <span style={{ color: ab>=2 ? '#00ff88' : ab>0 ? '#ffd700' : '#ff4757', fontWeight:700 }}>{ab}</span>
                        <span style={{ color:'#8b949e', fontSize:'0.73rem' }}> abiertas / {to} total</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabla completa de rooms */}
            <div style={{ ...card, padding:0, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid #30363d', fontFamily:"'Orbitron',sans-serif", color:'#ffd700', fontSize:'0.82rem' }}>TODAS LAS SALAS ({rooms.length})</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem', minWidth:740 }}>
                  <thead><tr>{['JUEGO','MODO','TIER','REGIÓN','ESTADO','PLAYERS','ENTRADA','TIPO','ACCIONES'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rooms.map(r => (
                      <tr key={r.id} className="crow">
                        <td style={td}>{GL[r.game||'']||r.game}</td>
                        <td style={td}>{ML[r.mode||'']||r.mode}</td>
                        <td style={{ ...td, color:TIER_CLR[r.tier||'']||'#fff', fontWeight:700 }}>{r.tier}</td>
                        <td style={td}>{RL[r.region||'']||r.region}</td>
                        <td style={td}><span style={{ color:r.status==='OPEN' ? '#00ff88' : '#ff4757', fontWeight:700 }}>{r.status}</span></td>
                        <td style={td}>{(r.players?.length||0)}/{r.capacity}</td>
                        <td style={{ ...td, color:'#ffd700' }}>{r.entry_fee ? `🪙${r.entry_fee.toLocaleString()}` : '—'}</td>
                        <td style={{ ...td, color:'#8b949e', fontSize:'0.68rem' }}>{r.spawned ? '🤖 Auto' : '👤 Manual'}</td>
                        <td style={td}>
                          <div style={{ display:'flex', gap:4 }}>
                            {r.status==='OPEN' && <button className="cact" style={sm('#30363d','#8b949e')} onClick={() => updateDoc(doc(db,'tournaments',r.id),{status:'CLOSED'})}>🔒</button>}
                            <button className="cact" style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={() => deleteRoom(r.id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {rooms.length === 0 && <tr><td colSpan={9} style={{ textAlign:'center', color:'#8b949e', padding:30 }}>Sin salas todavía</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>}

          {/* ══ FINANZAS ════════════════════════════════════ */}
          {tab === 'finanzas' && <>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ffd700', margin:'0 0 18px', fontSize:'0.9rem' }}>💰 PANEL FINANCIERO</h2>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(310px,1fr))', gap:18, marginBottom:22 }}>
              {[
                { label:'🏦 TRANSFERENCIAS (AR/UY)', data:pagosAR, color:'#009ee3' },
                { label:'₿ BINANCE PAY (USDT)',       data:pagosBN, color:'#f3ba2f' },
              ].map(({ label, data, color }) => (
                <div key={label} style={{ ...card, borderColor:color, overflowX:'auto' }}>
                  <h3 style={{ fontFamily:"'Orbitron',sans-serif", color, margin:'0 0 12px', fontSize:'0.82rem' }}>{label}</h3>
                  {data.length === 0
                    ? <p style={{ color:'#8b949e', textAlign:'center', padding:'16px 0' }}>Sin pendientes ✓</p>
                    : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
                        <thead><tr>{['JUGADOR','PACK / MONTO','TX / REF','COMP.','ACCIÓN'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {data.map(p => (
                            <tr key={p.id} className="crow">
                              <td style={td}><b>{(p.jugador_nombre||'').toUpperCase()}</b><br/><span style={{ color:'#8b949e', fontSize:'0.65rem' }}>{(p.uid||'').slice(0,8)}</span><br/><span style={{ color:'#8b949e', fontSize:'0.65rem' }}>{p.sender_id || '—'}</span></td>
                              <td style={{ ...td, color:'#ffd700' }}>
                                🪙{(p.coins_total||p.coins||0).toLocaleString()}<br/>
                                <span style={{ color:'#ccc', fontSize:'0.68rem' }}>${p.usd} USDT · {p.pack_label || p.metodo}</span>
                              </td>
                              <td style={td}>
                                <div style={{ fontSize:'0.68rem', fontFamily:'monospace', color:'#009ee3', wordBreak:'break-all', maxWidth:140 }}>
                                  {p.tx_hash ? <span title={p.tx_hash}>🔑 {p.tx_hash.slice(0,18)}…</span> : <span style={{ color:'#555' }}>—</span>}
                                </div>
                                {p.referencia_id && <div style={{ fontSize:'0.65rem', fontFamily:'monospace', color:'#8b949e', marginTop:2 }}>ref: {p.referencia_id.slice(0,16)}</div>}
                              </td>
                              <td style={td}>{p.comprobante_url ? <button style={sm('#222')} onClick={() => window.open(p.comprobante_url,'_blank')}>📄 VER</button> : <span style={{ color:'#ff4757', fontSize:'0.66rem' }}>❌ SIN COMP.</span>}</td>
                              <td style={td}>
                                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                                  <button className="cact" style={sm('rgba(0,255,136,0.15)','#00ff88')} onClick={() => aprobarPago(p.id,p.uid!,p.coins_total||p.coins!,p.usd||0,p.tx_hash,p.referencia_id)}>✅ APROBAR</button>
                                  <button className="cact" style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={() => rechazarPago(p.id)}>✕ RECHAZAR</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                  }
                </div>
              ))}
            </div>

            <div style={{ ...card, borderTop:'3px solid #ff4757', overflowX:'auto' }}>
              <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ff4757', margin:'0 0 12px', fontSize:'0.85rem' }}>💸 RETIROS PENDIENTES ({retiros.length})</h3>
              {retiros.length === 0
                ? <p style={{ color:'#8b949e', textAlign:'center', padding:'16px 0' }}>Sin solicitudes ✓</p>
                : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem', minWidth:600 }}>
                    <thead><tr>{['JUGADOR','MONTO','CBU / ALIAS / WALLET','FECHA','RIESGO','ACCIÓN'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {retiros.map(r => {
                        const jDat = jugadores.find(j => j.id === r.uid);
                        const victs = jDat?.titulos || 0;
                        const parts = jDat?.partidos_jugados || 0;
                        const wr    = parts > 0 ? Math.round((victs / parts) * 100) : 0;
                        const fp    = jDat?.fair_play ?? 100;
                        const ipOtros = jugadores.filter(j => j.id !== r.uid && j.ip && j.ip === jDat?.ip);
                        const fpOtros = jugadores.filter(j => j.id !== r.uid && (j as unknown as Record<string,unknown>).fingerprint_id && (j as unknown as Record<string,unknown>).fingerprint_id === (jDat as unknown as Record<string,unknown>)?.fingerprint_id);
                        const riesgoAlt = ipOtros.length > 0 || fpOtros.length > 0 || (wr >= 80 && parts >= 10) || fp < 30;
                        return (
                          <tr key={r.id} className="crow" style={{ background: riesgoAlt ? 'rgba(255,71,87,0.04)' : undefined }}>
                            <td style={td}>
                              <b>{r.nombre_real||r.nombreJugador}</b>
                              <br/><span style={{ color:'#8b949e', fontSize:'0.68rem' }}>📱 {r.whatsapp}</span>
                            </td>
                            <td style={{ ...td, color:'#ff4757', fontWeight:700 }}>🪙 {(r.montoCoins||0).toLocaleString()}</td>
                            <td style={td}><code style={{ background:'#0b0e14', padding:'3px 7px', borderRadius:4, color:'#00e5ff', fontSize:'0.78rem' }}>{r.cbuAlias || '—'}</code></td>
                            <td style={{ ...td, color:'#8b949e', fontSize:'0.72rem' }}>{r.fecha?.toDate?.()?.toLocaleDateString()||'—'}</td>
                            <td style={td}>
                              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                                <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'0.65rem', fontWeight:900, color: riesgoAlt ? '#ff4757' : '#00ff88', padding:'2px 7px', background: riesgoAlt ? 'rgba(255,71,87,0.1)' : 'rgba(0,255,136,0.07)', borderRadius:4 }}>
                                  {riesgoAlt ? '🚨 REVISAR' : '✅ OK'}
                                </span>
                                {ipOtros.length > 0 && <span style={{ fontSize:'0.62rem', color:'#ff4757' }}>⚠️ IP compartida</span>}
                                {fpOtros.length > 0 && <span style={{ fontSize:'0.62rem', color:'#ff4757' }}>🖥️ Mismo device</span>}
                                {wr >= 80 && parts >= 10 && <span style={{ fontSize:'0.62rem', color:'#ffd700' }}>📈 WR {wr}% ({parts}p)</span>}
                                {fp < 30 && <span style={{ fontSize:'0.62rem', color:'#ff4757' }}>💔 FP {fp}%</span>}
                              </div>
                            </td>
                            <td style={td}>
                              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                                <button className="cact" style={sm('rgba(0,158,227,0.15)','#009ee3')} onClick={() => abrirAudit(r.uid||'')} disabled={auditLoading}>🕵️ AUDIT</button>
                                <button className="cact" style={sm('rgba(0,255,136,0.15)','#00ff88')} onClick={() => marcarRetiroPagado(r.id)}>✅ PAGADO</button>
                                <button className="cact" style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={() => rechazarRetiro(r.id,r.uid||'',r.montoCoins||0)}>↩ DEVOLVER</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
              }
            </div>

            {/* ── Modal Audit ─────────────────────────────────── */}
            {auditModal && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={e => { if(e.target===e.currentTarget) setAuditModal(null); }}>
                <div style={{ background:'#0d1117', border:`2px solid ${auditModal.riesgo==='ALTO'?'#ff4757':auditModal.riesgo==='MEDIO'?'#ffd700':'#00ff88'}`, borderRadius:16, padding:24, maxWidth:680, width:'100%', maxHeight:'90vh', overflowY:'auto', position:'relative' }}>
                  <button onClick={() => setAuditModal(null)} style={{ position:'absolute', top:14, right:18, background:'none', border:'none', color:'#8b949e', fontSize:'1.5rem', cursor:'pointer', lineHeight:1 }}>×</button>

                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'0.9rem', color: auditModal.riesgo==='ALTO'?'#ff4757':auditModal.riesgo==='MEDIO'?'#ffd700':'#00ff88', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
                    🕵️ AUDITORÍA — {auditModal.nombre.toUpperCase()}
                    <span style={{ fontSize:'0.7rem', padding:'3px 10px', borderRadius:20, background: auditModal.riesgo==='ALTO'?'rgba(255,71,87,0.15)':auditModal.riesgo==='MEDIO'?'rgba(255,215,0,0.1)':'rgba(0,255,136,0.08)', color: auditModal.riesgo==='ALTO'?'#ff4757':auditModal.riesgo==='MEDIO'?'#ffd700':'#00ff88' }}>
                      {auditModal.riesgo}
                    </span>
                  </div>

                  {/* Alertas */}
                  {auditModal.alertas.length > 0 && (
                    <div style={{ background:'rgba(255,71,87,0.07)', border:'1px solid #ff475730', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
                      <div style={{ fontFamily:"'Orbitron',sans-serif", color:'#ff4757', fontSize:'0.72rem', marginBottom:8 }}>🚨 ALERTAS DETECTADAS</div>
                      {auditModal.alertas.map((a, i) => <div key={i} style={{ color:'#ff4757', fontSize:'0.78rem', marginBottom:4 }}>{a}</div>)}
                    </div>
                  )}

                  {/* Stats */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10, marginBottom:16 }}>
                    {[
                      { l:'WIN RATE',  v:`${auditModal.winRate}%`,   c: auditModal.winRate>=80?'#ff4757':auditModal.winRate>=50?'#ffd700':'#00ff88' },
                      { l:'PARTIDOS',  v: String(auditModal.partidos), c:'#009ee3' },
                      { l:'VICTORIAS', v: String(auditModal.victorias), c:'#00ff88' },
                      { l:'FAIR PLAY', v:`${auditModal.fairPlay}%`,  c: auditModal.fairPlay<30?'#ff4757':auditModal.fairPlay<60?'#ffd700':'#00ff88' },
                      { l:'SALDO',     v:`🪙${auditModal.saldo.toLocaleString()}`, c:'#ffd700' },
                    ].map(s => (
                      <div key={s.l} style={{ background:'#161b22', borderRadius:8, padding:'10px 12px', borderLeft:`3px solid ${s.c}` }}>
                        <div style={{ color:'#8b949e', fontSize:'0.6rem', fontFamily:"'Orbitron',sans-serif" }}>{s.l}</div>
                        <div style={{ color:s.c, fontWeight:900, fontSize:'1.1rem', fontFamily:"'Orbitron',sans-serif" }}>{s.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* IP & Fingerprint */}
                  <div style={{ background:'#161b22', borderRadius:10, padding:'12px 14px', marginBottom:12, fontSize:'0.77rem' }}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
                      <div><span style={{ color:'#8b949e' }}>IP: </span><code style={{ color:'#009ee3' }}>{auditModal.ip||'—'}</code></div>
                      <div><span style={{ color:'#8b949e' }}>Fingerprint: </span><code style={{ color:'#9146FF', fontSize:'0.68rem' }}>{auditModal.fingerprintId?auditModal.fingerprintId.slice(0,16)+'…':'—'}</code></div>
                    </div>
                  </div>

                  {/* Colusiones IP */}
                  {auditModal.colisionIp.length > 0 && (
                    <div style={{ background:'rgba(255,71,87,0.06)', border:'1px solid #ff475720', borderRadius:10, padding:'12px 14px', marginBottom:10 }}>
                      <div style={{ color:'#ff4757', fontFamily:"'Orbitron',sans-serif", fontSize:'0.7rem', marginBottom:6 }}>⚠️ MISMA IP — POSIBLE MULTIUENTA ({auditModal.colisionIp.length})</div>
                      {auditModal.colisionIp.map(c => (
                        <div key={c.uid} style={{ display:'flex', gap:10, fontSize:'0.75rem', padding:'4px 0', borderBottom:'1px solid #1c2028' }}>
                          <span style={{ color:'#e6edf3' }}>{c.nombre}</span>
                          <span style={{ color:'#8b949e', fontFamily:'monospace', fontSize:'0.67rem' }}>{c.uid.slice(0,10)}…</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Colusiones Fingerprint */}
                  {auditModal.colisionFp.length > 0 && (
                    <div style={{ background:'rgba(145,70,255,0.06)', border:'1px solid #9146FF20', borderRadius:10, padding:'12px 14px', marginBottom:10 }}>
                      <div style={{ color:'#9146FF', fontFamily:"'Orbitron',sans-serif", fontSize:'0.7rem', marginBottom:6 }}>🖥️ MISMO DEVICE (FINGERPRINT) ({auditModal.colisionFp.length})</div>
                      {auditModal.colisionFp.map(c => (
                        <div key={c.uid} style={{ display:'flex', gap:10, fontSize:'0.75rem', padding:'4px 0', borderBottom:'1px solid #1c2028' }}>
                          <span style={{ color:'#e6edf3' }}>{c.nombre}</span>
                          <span style={{ color:'#8b949e', fontFamily:'monospace', fontSize:'0.67rem' }}>{c.uid.slice(0,10)}…</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Últimos matches */}
                  {auditModal.ultimosMatchs.length > 0 && (
                    <div style={{ background:'#161b22', borderRadius:10, padding:'12px 14px' }}>
                      <div style={{ color:'#ffd700', fontFamily:"'Orbitron',sans-serif", fontSize:'0.7rem', marginBottom:8 }}>🎮 ÚLTIMOS PARTIDOS</div>
                      {auditModal.ultimosMatchs.map(m => (
                        <div key={m.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.74rem', padding:'4px 0', borderBottom:'1px solid #1c2028' }}>
                          <span style={{ color:'#8b949e', fontFamily:'monospace' }}>vs {m.vs.slice(0,10)}…</span>
                          <span style={{ color: m.winner===auditModal.uid?'#00ff88':m.winner?'#ff4757':'#8b949e', fontWeight:700 }}>
                            {m.winner===auditModal.uid?'✅ Ganó':m.winner?'❌ Perdió':'— Pendiente'} · {m.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>}

          {/* ══ SPAWNER ═════════════════════════════════════ */}
          {tab === 'spawner' && <>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ff00cc', margin:'0 0 18px', fontSize:'0.9rem' }}>🤖 CENTRAL DE SPAWNER — SALAS AUTOMÁTICAS</h2>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:18, marginBottom:22 }}>
              {/* Control */}
              <div style={{ ...card, borderTop:'3px solid #ff00cc', background:'linear-gradient(135deg,#161b22,rgba(255,0,204,0.04))' }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ff00cc', margin:'0 0 14px', fontSize:'0.85rem' }}>⚙️ MOTOR DE SALAS</h3>

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0b0e14', padding:'13px 15px', borderRadius:8, border:'1px solid #30363d', marginBottom:14 }}>
                  <div>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.82rem' }}>AUTO-SPAWN HORARIO</div>
                    <div style={{ color:'#8b949e', fontSize:'0.68rem', marginTop:2 }}>Crea 2 salas por modo cada hora</div>
                  </div>
                  <label style={{ position:'relative', display:'inline-block', width:52, height:26, cursor:'pointer', flexShrink:0 }}>
                    <input type="checkbox" checked={!!spawnerCfg.activo} onChange={e => updateDoc(doc(db,'configuracion','spawner'),{activo:e.target.checked})} style={{ opacity:0, width:0, height:0 }} />
                    <span style={{ position:'absolute', inset:0, background:spawnerCfg.activo ? '#00ff88' : '#30363d', borderRadius:34, transition:'0.3s', boxShadow:spawnerCfg.activo ? '0 0 12px rgba(0,255,136,0.4)' : 'none' }}>
                      <span style={{ position:'absolute', height:18, width:18, bottom:4, left:spawnerCfg.activo ? 30 : 4, background:'white', borderRadius:'50%', transition:'0.3s' }} />
                    </span>
                  </label>
                </div>

                <button style={{ ...btn(spawning ? '#30363d' : '#ff00cc','white'), width:'100%', opacity:spawning ? 0.5 : 1 }} onClick={triggerManualSpawn} disabled={spawning}>
                  {spawning ? '⏳ Ejecutando…' : '⚡ DISPARAR SPAWN AHORA'}
                </button>

                {spawnLog && <div style={{ marginTop:10, padding:'9px 12px', background:'#0b0e14', borderRadius:8, color:spawnLog.startsWith('✅') ? '#00ff88' : '#ff4757', fontSize:'0.76rem', border:'1px solid #30363d' }}>{spawnLog}</div>}
                {spawnerCfg.last_run && (
                  <div style={{ marginTop:10, color:'#8b949e', fontSize:'0.7rem' }}>
                    Último: {spawnerCfg.last_run.toDate?.()?.toLocaleString()||'—'} · <span style={{ color:'#ffd700' }}>{spawnerCfg.last_created||0}</span> salas creadas
                  </div>
                )}
              </div>

              {/* Slots activos */}
              <div style={{ ...card, borderTop:'3px solid #009ee3', gridColumn:'1/-1' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#009ee3', margin:0, fontSize:'0.85rem' }}>
                    📋 SLOTS ACTIVOS — {(spawnerCfg.slots_activos ?? DEFAULT_SLOTS).length} activados × 3 regiones = <span style={{ color:'#ffd700' }}>{(spawnerCfg.slots_activos ?? DEFAULT_SLOTS).length * 3 * 2}</span> salas máx
                  </h3>
                  <div style={{ display:'flex', gap:8 }}>
                    <button style={sm('#0d1117','#8b949e')} onClick={() => updateDoc(doc(db,'configuracion','spawner'),{ slots_activos:[] })}>Desactivar todo</button>
                    <button style={sm('#009ee3','white')} onClick={() => updateDoc(doc(db,'configuracion','spawner'),{ slots_activos: SPAWN_SLOT_PAIRS.flatMap(([c,f]) => SPAWN_GAMES_CFG.flatMap(g => g.modes.map(m => slotKey(g.game,m,c,f)))) })}>Activar todo</button>
                    <button style={sm('#00ff88','black')} onClick={() => updateDoc(doc(db,'configuracion','spawner'),{ slots_activos: DEFAULT_SLOTS })}>⚡ Fase 1</button>
                  </div>
                </div>
                {SPAWN_GAMES_CFG.map(g => (
                  <div key={g.game} style={{ marginBottom:18 }}>
                    {g.modes.map(mode => {
                      const activeSlots = spawnerCfg.slots_activos ?? DEFAULT_SLOTS;
                      const activoCount = SPAWN_SLOT_PAIRS.filter(([c,f]) => activeSlots.includes(slotKey(g.game,mode,c,f))).length;
                      return (
                        <div key={mode} style={{ marginBottom:10 }}>
                          <div style={{ color:'#e6edf3', fontWeight:700, fontSize:'0.78rem', marginBottom:7 }}>
                            {GL[g.game]} — {ML[mode]}
                            <span style={{ color:'#8b949e', fontWeight:400, marginLeft:8, fontSize:'0.68rem' }}>{activoCount}/{SPAWN_SLOT_PAIRS.length} activos</span>
                          </div>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                            {SPAWN_SLOT_PAIRS.map(([cap, fee]) => {
                              const key = slotKey(g.game, mode, cap, fee);
                              const on  = (spawnerCfg.slots_activos ?? DEFAULT_SLOTS).includes(key);
                              const tierColor = fee === 0 ? '#8b949e' : fee < 1000 ? '#3fb950' : fee < 10000 ? '#58a6ff' : '#ffd700';
                              return (
                                <button key={key}
                                  onClick={() => {
                                    const cur = spawnerCfg.slots_activos ?? DEFAULT_SLOTS;
                                    const next = on ? cur.filter(k => k !== key) : [...cur, key];
                                    updateDoc(doc(db,'configuracion','spawner'), { slots_activos: next });
                                  }}
                                  style={{
                                    background: on ? `${tierColor}18` : '#0d1117',
                                    border: `1px solid ${on ? tierColor : '#30363d'}`,
                                    color: on ? tierColor : '#484f58',
                                    padding:'4px 10px', borderRadius:6, cursor:'pointer',
                                    fontSize:'0.67rem', fontWeight:700, transition:'0.15s',
                                    fontFamily:"'Orbitron',sans-serif",
                                  }}
                                >
                                  {cap}j {fee === 0 ? 'FREE' : `${(fee/1000).toFixed(fee%1000===0?0:1)}K`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Salas abiertas en vivo por tier */}
            <div style={card}>
              <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ffd700', margin:'0 0 14px', fontSize:'0.85rem' }}>🎮 SALAS ABIERTAS EN VIVO</h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
                {(['FREE','RECREATIVO','COMPETITIVO','ELITE'] as const).map(tier => {
                  const ab = rooms.filter(r => r.tier===tier && r.status==='OPEN');
                  const ok = ab.length >= 2;
                  return (
                    <div key={tier} style={{ background:'#0b0e14', border:`1px solid ${TIER_CLR[tier]}30`, borderLeft:`3px solid ${TIER_CLR[tier]}`, borderRadius:8, padding:'12px 14px' }}>
                      <div style={{ color:TIER_CLR[tier], fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.76rem', marginBottom:6 }}>{tier}</div>
                      <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'1.9rem', fontWeight:900, color:ok ? '#00ff88' : ab.length>0 ? '#ffd700' : '#ff4757' }}>{ab.length}</div>
                      <div style={{ color:'#8b949e', fontSize:'0.68rem', marginTop:2 }}>salas abiertas {!ok && '⚠️'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>}

          {/* ══ SISTEMA ═════════════════════════════════════ */}
          {tab === 'sistema' && <>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#9146FF', margin:'0 0 18px', fontSize:'0.9rem' }}>⚙️ CONFIGURACIÓN DEL SISTEMA</h2>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(275px,1fr))', gap:18, marginBottom:22 }}>
              <div style={{ ...card, borderColor:'#00ff88' }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#00ff88', margin:'0 0 12px', fontSize:'0.85rem' }}>⚖️ FAIR PLAY (TRUST FACTOR)</h3>
                <p style={{ color:'#8b949e', fontSize:'0.76rem', marginTop:-4, marginBottom:10 }}>Ajustá la reputación de un jugador por UID.</p>
                <input value={fpUid} onChange={e => setFpUid(e.target.value)} style={inp} placeholder="UID del jugador" />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <button style={{ ...btn('#00ff88'), fontSize:'0.72rem' }} onClick={() => cambiarFairPlay(100)}>✅ PERDONAR</button>
                  <button style={{ ...btn('#ff4757','white'), fontSize:'0.72rem' }} onClick={() => cambiarFairPlay(40)}>🚫 SANCIONAR</button>
                </div>
              </div>

              <div style={{ ...card, borderColor:'#9146FF' }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#9146FF', margin:'0 0 12px', fontSize:'0.85rem' }}>🚀 MODO LFA PRO</h3>
                <p style={{ color:'#8b949e', fontSize:'0.76rem', marginTop:-4, marginBottom:14 }}>Habilita / oculta el banner del Hub Competitivo.</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <button style={btn('#9146FF','white')} onClick={() => updateDoc(doc(db,'configuracion','lfa_pro'),{activo:true})}>👁️ MOSTRAR</button>
                  <button style={{ ...btn('transparent','#8b949e'), border:'1px solid #30363d', fontSize:'0.74rem' }} onClick={() => updateDoc(doc(db,'configuracion','lfa_pro'),{activo:false})}>🙈 OCULTAR</button>
                </div>
              </div>
            </div>

            {/* VAR */}
            <div style={{ ...card, borderTop:'3px solid #ffd700' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ffd700', margin:0, fontSize:'0.85rem' }}>📹 EL VAR — EVIDENCIAS IA ({evidencias.length})</h3>
                <button className="cact" style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={vaciarVAR}>🗑️ VACIAR TODO</button>
              </div>
              {evidencias.length === 0
                ? <p style={{ color:'#8b949e', textAlign:'center', padding:'18px 0' }}>Sin evidencias</p>
                : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:10 }}>
                    {evidencias.map(ev => (
                      <div key={ev.id} style={{ background:'#0b0e14', border:'1px solid #30363d', borderTop:'2px solid #00ff88', borderRadius:8, padding:10, textAlign:'center' }}>
                        {ev.imagen_url
                          ? <img src={ev.imagen_url} alt="VAR" style={{ width:'100%', height:110, objectFit:'cover', borderRadius:4, cursor:'pointer' }} onClick={() => window.open(ev.imagen_url,'_blank')} />
                          : <div style={{ height:110, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e', fontSize:'0.73rem' }}>Sin imagen</div>
                        }
                        <div style={{ color:'#8b949e', fontSize:'0.63rem', marginTop:6 }}>
                          {ev.uid_ganador?.slice(0,10)}…<br/>
                          {ev.timestamp?.toDate?.()?.toLocaleTimeString()||'—'}
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </>}

          {tab === 'leads' && <>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#53FC18', margin:'0 0 18px', fontSize:'0.9rem' }}>🎙️ SOLICITUDES DE STREAMERS ({leads.length})</h2>

            {leads.length === 0 ? (
              <div style={{ ...card, textAlign:'center', padding:40, color:'#4a5568' }}>
                <div style={{ fontSize:'2rem', marginBottom:8 }}>📭</div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'0.78rem' }}>No hay solicitudes todavía</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {leads.map(l => {
                  const fecha = l.fecha?.toDate?.()?.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) ?? '—';
                  const juegoClr: Record<string,string> = { FC26:'#ffd700', EFOOTBALL:'#009ee3', AMBOS:'#53FC18' };
                  const juegoLabel: Record<string,string> = { FC26:'FC 26', EFOOTBALL:'eFootball', AMBOS:'Ambos' };
                  return (
                    <div key={l.id} style={{ ...card, borderLeft:`3px solid ${juegoClr[l.juego||'FC26'] ?? '#53FC18'}`, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
                      <div style={{ gridColumn:'1/-1', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:4 }}>
                        <span style={{ fontFamily:"'Orbitron',sans-serif", color:'white', fontSize:'0.82rem', fontWeight:900 }}>{l.nombre || '—'}</span>
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <span style={{ background:`${juegoClr[l.juego||''] ?? '#53FC18'}22`, color: juegoClr[l.juego||''] ?? '#53FC18', border:`1px solid ${juegoClr[l.juego||''] ?? '#53FC18'}44`, borderRadius:8, padding:'2px 10px', fontSize:'0.65rem', fontFamily:"'Orbitron',sans-serif", fontWeight:700 }}>{juegoLabel[l.juego||''] ?? l.juego ?? '—'}</span>
                          <span style={{ color:'#4a5568', fontSize:'0.65rem' }}>{fecha}</span>
                        </div>
                      </div>

                      <div>
                        <div style={{ color:'#8b949e', fontSize:'0.65rem', marginBottom:3 }}>EMAIL</div>
                        <a href={`mailto:${l.email}`} style={{ color:'#53FC18', fontSize:'0.82rem', textDecoration:'none' }}>{l.email || '—'}</a>
                      </div>

                      <div>
                        <div style={{ color:'#8b949e', fontSize:'0.65rem', marginBottom:3 }}>CELULAR / WHATSAPP</div>
                        {l.celular
                          ? <a href={`https://wa.me/${l.celular.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener noreferrer" style={{ color:'#25d366', fontSize:'0.82rem', textDecoration:'none' }}>📲 {l.celular}</a>
                          : <span style={{ color:'#4a5568', fontSize:'0.82rem' }}>—</span>
                        }
                      </div>

                      {l.mensaje && (
                        <div style={{ gridColumn:'1/-1' }}>
                          <div style={{ color:'#8b949e', fontSize:'0.65rem', marginBottom:3 }}>MENSAJE</div>
                          <div style={{ color:'#cdd9e5', fontSize:'0.8rem', background:'#0b0e14', padding:'8px 12px', borderRadius:6, lineHeight:1.5 }}>{l.mensaje}</div>
                        </div>
                      )}

                      <div style={{ gridColumn:'1/-1', display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
                        <a href={`mailto:${l.email}`} style={{ ...sm('rgba(83,252,24,0.12)','#53FC18'), textDecoration:'none', border:'1px solid rgba(83,252,24,0.25)' }}>✉️ EMAIL</a>
                        {l.celular && (
                          <a href={`https://wa.me/${l.celular.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener noreferrer" style={{ ...sm('rgba(37,211,102,0.12)','#25d366'), textDecoration:'none', border:'1px solid rgba(37,211,102,0.25)' }}>💬 WHATSAPP</a>
                        )}
                        <button style={{ ...sm('rgba(255,71,87,0.1)','#ff4757'), border:'1px solid rgba(255,71,87,0.25)', marginLeft:'auto' }} onClick={async () => { if (confirm('¿Eliminar esta solicitud?')) await deleteDoc(doc(db,'leads_streamers',l.id)); }}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>}

          {/* ══ DISPUTAS ══════════════════════════════════════════ */}
          {tab === 'disputas' && <>
            <div style={{ ...card, borderTop:'3px solid #9146FF' }}>
              <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#9146FF', margin:'0 0 14px', fontSize:'0.85rem' }}>⚖️ DISPUTAS DE PARTIDOS ({disputasPend} pendientes)</h3>
              {disputas.length === 0
                ? <p style={{ color:'#8b949e', textAlign:'center', padding:'20px 0' }}>Sin disputas ✓</p>
                : <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {disputas.map(d => {
                      const jDat = jugadores.find(j => j.id === d.disputedBy);
                      const isPending = d.status === 'PENDING';
                      return (
                        <div key={d.id} style={{ background:'#0b0e14', border:`1px solid ${isPending ? '#9146FF' : '#30363d'}`, borderRadius:10, padding:'14px 16px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10, marginBottom:10 }}>
                            <div>
                              <span style={{ fontFamily:"'Orbitron',sans-serif", color: isPending ? '#9146FF' : '#8b949e', fontSize:'0.75rem', fontWeight:900 }}>
                                {isPending ? '🔴 PENDIENTE' : '✅ RESUELTA'}
                              </span>
                              <div style={{ color:'white', fontWeight:700, marginTop:4 }}>{jDat?.nombre ?? d.disputedBy.slice(0,12)}…</div>
                              <div style={{ color:'#8b949e', fontSize:'0.72rem', marginTop:2 }}>Match: <code style={{ color:'#009ee3' }}>{d.matchId.slice(-8)}</code> · {d.created_at?.toDate?.()?.toLocaleDateString() ?? '—'}</div>
                            </div>
                            {d.screenshot_url && (
                              <img src={d.screenshot_url} alt="Prueba" onClick={() => window.open(d.screenshot_url,'_blank')} style={{ height:72, borderRadius:6, cursor:'pointer', border:'1px solid #30363d', objectFit:'cover' }} />
                            )}
                          </div>
                          <div style={{ background:'rgba(145,70,255,0.06)', borderRadius:6, padding:'8px 12px', marginBottom: isPending ? 12 : 0, fontSize:'0.78rem', color:'#e6edf3' }}>
                            💬 <em>&ldquo;{d.reason}&rdquo;</em>
                          </div>
                          {isPending && (
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:8 }}>
                              <button className="cact" style={sm('rgba(0,255,136,0.12)','#00ff88')} onClick={() => resolveDispute(d.id, d.matchId, 'reporter_wins')}>
                                ✅ Reporte era correcto<br/><span style={{ fontSize:'0.62rem', opacity:.8 }}>-20 FP al que disputó</span>
                              </button>
                              <button className="cact" style={sm('rgba(255,71,87,0.12)','#ff4757')} onClick={() => resolveDispute(d.id, d.matchId, 'disputer_wins')}>
                                ⚖️ Reporte era falso<br/><span style={{ fontSize:'0.62rem', opacity:.8 }}>-30 FP al reportador</span>
                              </button>
                              <button className="cact" style={sm('rgba(255,215,0,0.1)','#ffd700')} onClick={() => resolveDispute(d.id, d.matchId, 'no_evidence')}>
                                🔍 Sin evidencia clara<br/><span style={{ fontSize:'0.62rem', opacity:.8 }}>-10 FP a ambos</span>
                              </button>
                              <button className="cact" style={sm('rgba(0,158,227,0.12)','#009ee3')} onClick={() => resolveDispute(d.id, d.matchId, 'rematch')}>
                                🔄 Ordenar Rematch<br/><span style={{ fontSize:'0.62rem', opacity:.8 }}>Sin penalización</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
              }
            </div>
          </>}

        </main>
      </div>

      {/* ═══ MODALES ════════════════════════════════════════════ */}

      {/* Ban */}
      {banModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:6000, padding:20, backdropFilter:'blur(6px)' }}>
          <div style={{ background:'#161b22', border:'2px solid #ff4757', borderRadius:16, padding:28, maxWidth:380, width:'100%', textAlign:'center' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:10 }}>⚖️</div>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ff4757', margin:'0 0 6px', fontSize:'1rem' }}>TRIBUNAL LFA</h2>
            <h3 style={{ margin:'0 0 4px', color:'white' }}>{banModal.nombre}</h3>
            {banModal.ip && <div style={{ color:'#8b949e', fontSize:'0.72rem', marginBottom:14, fontFamily:'monospace' }}>IP: {banModal.ip}</div>}
            <select onChange={e => setBanModal(prev => prev ? { ...prev, horas:Number(e.target.value) } : null)}
              style={{ ...inp, borderColor:'#ff4757', textAlign:'center', marginBottom:10 }}>
              <option value={24}>24 Horas</option>
              <option value={48}>48 Horas</option>
              <option value={72}>72 Horas</option>
              <option value={168}>1 Semana</option>
              <option value={0}>BAN PERMANENTE</option>
            </select>
            <label style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center', marginBottom:16, cursor:'pointer' }}>
              <input type="checkbox" checked={banConIp} onChange={e => setBanConIp(e.target.checked)} style={{ width:16, height:16, cursor:'pointer', accentColor:'#ff4757' }} />
              <span style={{ color: banConIp ? '#ff4757' : '#8b949e', fontSize:'0.8rem', fontWeight:700 }}>🚫 Bloquear IP también (re-registro)</span>
            </label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button style={btn('#ff4757','white')} onClick={() => ejecutarBan(banModal.uid, banModal.nombre, banModal.horas)}>🚫 APLICAR</button>
              <button style={{ ...btn('transparent','#8b949e'), border:'1px solid #30363d' }} onClick={() => { setBanModal(null); setBanConIp(false); }}>CANCELAR</button>
            </div>
          </div>
        </div>
      )}

      {/* Coins */}
      {coinsM && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:6000, padding:20, backdropFilter:'blur(6px)' }}>
          <div style={{ background:'#161b22', border:'2px solid #ffd700', borderRadius:16, padding:28, maxWidth:340, width:'100%', textAlign:'center' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:8 }}>🪙</div>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ffd700', margin:'0 0 4px', fontSize:'1rem' }}>BÓVEDA LFA</h2>
            <h3 style={{ margin:'0 0 6px', color:'white' }}>{coinsM.nombre}</h3>
            <div style={{ color:'#ffd700', fontSize:'1.8rem', fontWeight:900, marginBottom:14 }}>🪙 {coinsM.actual.toLocaleString()}</div>
            <input type="number" value={coinsM.nuevo} min={0}
              onChange={e => setCoinsM(prev => prev ? { ...prev, nuevo:e.target.value } : null)}
              style={{ ...inp, fontSize:'1.3rem', textAlign:'center', color:'#ffd700', borderColor:'#ffd700', marginBottom:14 }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button style={btn('#ffd700')} onClick={() => guardarCoins(coinsM.uid, parseFloat(coinsM.nuevo))}>💾 GUARDAR</button>
              <button style={{ ...btn('transparent','#8b949e'), border:'1px solid #30363d' }} onClick={() => setCoinsM(null)}>CANCELAR</button>
            </div>
          </div>
        </div>
      )}

      {/* Expediente */}
      {expM && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:6000, padding:20, backdropFilter:'blur(6px)' }}>
          <div style={{ background:'#161b22', border:'2px solid #009ee3', borderRadius:16, padding:28, maxWidth:500, width:'100%', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid #30363d', paddingBottom:14, marginBottom:16 }}>
              <span style={{ fontSize:'2.2rem' }}>🕵️</span>
              <div>
                <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#009ee3', margin:0, fontSize:'0.88rem' }}>EXPEDIENTE POLICIAL</h2>
                <div style={{ color:'white', fontWeight:700, fontSize:'1.05rem', marginTop:3 }}>{expM.nombre||'—'}</div>
                <div style={{ color:'#8b949e', fontSize:'0.72rem' }}>{expM.email}</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
              {[
                { l:'UID',         v: expM.id,                                             c: undefined },
                { l:'ROL',         v: expM.rol||'jugador',                                 c: expM.rol === 'admin' ? '#9146FF' : undefined },
                { l:'IP CONEXIÓN', v: expM.ip || expM.ip_conexion||'—',                      c: undefined },
                { l:'CANVAS HASH', v: expM.canvas_hash||'—',                               c: '#ffd700' },
                { l:'SISTEMA',     v: expM.sistema||'—',                                   c: undefined },
                { l:'PLAT. ID',    v: expM.plataforma_id||'—',                             c: undefined },
                { l:'REGIÓN',      v: expM.region||'—',                                    c: undefined },
                { l:'FAIR PLAY',   v: `${expM.fair_play??100}%`,                           c: (expM.fair_play??100)>=70 ? '#00ff88' : '#ff4757' },
                { l:'SALDO',       v: `🪙 ${(expM.number||0).toLocaleString()}`,           c: '#00ff88' },
                { l:'TÍTULOS',     v: String(expM.titulos||0),                             c: undefined },
                { l:'PARTIDOS',    v: String(expM.partidos_jugados||0),                    c: undefined },
                { l:'AFILIADO',    v: expM.es_afiliado ? '✅ SÍ' : '—',                   c: undefined },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ background:'#0b0e14', padding:'9px 11px', borderRadius:8, border:'1px solid #30363d' }}>
                  <div style={{ color:'#8b949e', fontSize:'0.62rem', fontFamily:"'Orbitron',sans-serif", marginBottom:3 }}>{l}</div>
                  <div style={{ color:c||'white', fontSize:'0.79rem', fontWeight:700, wordBreak:'break-all' }}>{v}</div>
                </div>
              ))}
            </div>
            <button style={{ ...btn('#30363d','white'), width:'100%' }} onClick={() => setExpM(null)}>CERRAR</button>
          </div>
        </div>
      )}
    </>
  );
}
