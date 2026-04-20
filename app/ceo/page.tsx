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
  query, where, limit, orderBy, getDoc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import LfaModal, { LfaModalHandle } from '@/app/_components/LfaModal';

/* ─── Tipos ──────────────────────────────────────────────── */
interface Jugador {
  id: string; nombre?: string; email?: string; number?: number;
  baneado?: boolean; ip?: string; canvas_hash?: string;
  sistema?: string; plataforma_id?: string; region?: string;
  fair_play?: number; titulos?: number; partidos_jugados?: number;
  rol?: string; es_afiliado?: boolean;
}
interface Room {
  id: string; game?: string; mode?: string; tier?: string; region?: string;
  status?: string; players?: string[]; capacity?: number; entry_fee?: number;
  prize_pool?: number; spawned?: boolean; created_at?: { toDate?: () => Date };
}
interface Retiro {
  id: string; nombre_real?: string; nombreJugador?: string;
  whatsapp?: string; montoCoins?: number; cbuAlias?: string;
  metodo?: string; usd?: number;
  fecha?: { toDate?: () => Date }; uid?: string;
}
interface PagoManual {
  id: string; jugador_nombre?: string; uid?: string; coins?: number;
  usd?: number; metodo?: string; comprobante_url?: string;
  tx_hash?: string; sender_wallet?: string;
}
interface Evidencia {
  id: string; imagen_url?: string; sala_id?: string;
  uid_ganador?: string; timestamp?: { toDate?: () => Date };
}
interface SpawnerConfig {
  activo?: boolean; last_run?: { toDate?: () => Date }; last_created?: number;
}
interface BotMatch {
  id: string; tournamentId: string; round: string; status: string;
  p1: string; p2: string; p1_username?: string; p2_username?: string;
  winner?: string | null; score?: string;
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
  const [tab,   setTab]   = useState<'overview'|'usuarios'|'torneos'|'finanzas'|'spawner'|'bots'|'sistema'>('overview');
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

  /* ── UI State ────────────────────────────────────────────── */
  const [busqueda,  setBusqueda]  = useState('');
  const [spawning,  setSpawning]  = useState(false);
  const [spawnLog,  setSpawnLog]  = useState('');
  const [botLog,    setBotLog]    = useState('');
  const [botLoading,setBotLoading]= useState('');
  const [botMatches,setBotMatches]= useState<BotMatch[]>([]);
  const [testMatchId,setTestMatchId] = useState('');
  const [banModal,  setBanModal]  = useState<{uid:string;nombre:string;horas:number}|null>(null);
  const [coinsM,    setCoinsM]    = useState<{uid:string;nombre:string;actual:number;nuevo:string}|null>(null);
  const [expM,      setExpM]      = useState<Jugador|null>(null);

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

    subs.push(onSnapshot(query(collection(db,'matches'), orderBy('created_at','desc'), limit(100)), snap => {
      const l: BotMatch[] = []; snap.forEach(d => l.push({ id: d.id, ...d.data() } as BotMatch)); setBotMatches(l);
    }));

    subs.push(onSnapshot(doc(db,'configuracion','spawner'), d => {
      if (d.exists()) setSpawnerCfg(d.data() as SpawnerConfig);
    }));

    subs.push(onSnapshot(doc(db,'estadisticas','globales'), d => {
      if (d.exists()) setVisitas((d.data() as { visitas_totales?: number }).visitas_totales || 0);
    }));

    return () => subs.forEach(u => u());
  }, [ready]);

  /* ═══ Helpers ═══════════════════════════════════════════════ */
  const alerta = useCallback((t: string, m: string, tipo?: 'info'|'error'|'exito') =>
    modal.current!.mostrarAlerta(t, m, tipo), []);

  /* ── Pagos / Retiros ─────────────────────────────────────── */
  async function aprobarPago(id: string, uid: string, coins: number) {
    const ok = await alerta('CONFIRMAR', `Aprobar 🪙${coins} para UID ${uid.slice(0,8)}?`, 'info');
    if (!ok) return;
    const b = writeBatch(db);
    b.update(doc(db,'usuarios',uid), { number: increment(coins) });
    b.update(doc(db,'pagos_pendientes',id), { estado: 'aprobado' });
    await b.commit(); await alerta('APROBADO', 'Coins acreditadas.', 'exito');
  }
  async function rechazarPago(id: string) { await updateDoc(doc(db,'pagos_pendientes',id), { estado: 'rechazado' }); }
  async function marcarRetiroPagado(id: string) { await updateDoc(doc(db,'retiros',id), { estado: 'completado' }); await alerta('LISTO','Retiro marcado como pagado.','exito'); }
  async function rechazarRetiro(id: string, uid: string, monto: number) {
    const b = writeBatch(db);
    b.update(doc(db,'usuarios',uid), { number: increment(monto) });
    b.update(doc(db,'retiros',id), { estado: 'rechazado' });
    await b.commit(); await alerta('DEVUELTO','Coins devueltas.','exito');
  }

  /* ── Usuarios ────────────────────────────────────────────── */
  async function ejecutarBan(uid: string, nombre: string, horas: number) {
    const banHasta = horas === 0 ? null : new Date(Date.now() + horas * 3_600_000);
    await updateDoc(doc(db,'usuarios',uid), { baneado: true, ban_hasta: banHasta });
    await alerta('SANCIONADO', `${nombre} — ${horas === 0 ? 'Ban permanente' : horas+'h'}.`, 'error');
    setBanModal(null);
  }
  async function desbanear(uid: string, nombre: string) {
    await updateDoc(doc(db,'usuarios',uid), { baneado: false, ban_hasta: null });
    await alerta('DESBANEADO', `${nombre} desbaneado.`, 'exito');
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
  async function crearSalaManual() {
    const tc: Record<string, { entry_fee:number; prize_pool:number; free:boolean; prizes:object[] }> = {
      FREE:        { entry_fee:0,     prize_pool:0,     free:true,  prizes:[{ place:1, label:'🥇 1°', percentage:100, coins:0 }] },
      RECREATIVO:  { entry_fee:500,   prize_pool:3500,  free:false, prizes:[{ place:1, label:'🥇 1°', percentage:70, coins:2450 },{ place:2, label:'🥈 2°', percentage:30, coins:1050 }] },
      COMPETITIVO: { entry_fee:1000,  prize_pool:7000,  free:false, prizes:[{ place:1, label:'🥇 1°', percentage:70, coins:4900 },{ place:2, label:'🥈 2°', percentage:30, coins:2100 }] },
      ELITE:       { entry_fee:10000, prize_pool:70000, free:false, prizes:[{ place:1, label:'🥇 1°', percentage:70, coins:49000 },{ place:2, label:'🥈 2°', percentage:30, coins:21000 }] },
    };
    const t = tc[crTier];
    await addDoc(collection(db,'tournaments'), {
      game:crGame, mode:crMode, region:crRegion, tier:crTier, free:t.free,
      entry_fee:t.entry_fee, prize_pool:t.prize_pool, prizes:t.prizes,
      capacity:parseInt(crCap), players:[], status:'OPEN', spawned:false, created_at:serverTimestamp(),
    });
    await alerta('SALA CREADA', `${GL[crGame]} · ${ML[crMode]} · ${crTier}`, 'exito');
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

  async function botAction(tournamentId: string, action: 'fillWithBots' | 'advanceRound' | 'resetBots') {
    setBotLoading(tournamentId + action);
    setBotLog('⏳ Ejecutando...');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sin sesión');
      const token = await getIdToken(user);
      const res = await fetch('/api/dev/botActions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, tournamentId }),
      });
      const data = await res.json();
      setBotLog(data.success ? `✅ ${data.message}` : `❌ ${data.error}`);
    } catch (e: unknown) {
      setBotLog(`❌ Error: ${(e as Error).message}`);
    }
    setBotLoading('');
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
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (j.nombre||'').toLowerCase().includes(q) || (j.email||'').toLowerCase().includes(q) ||
           (j.ip||'').includes(q) || (j.canvas_hash||'').includes(q);
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
  type TabId = 'overview'|'usuarios'|'torneos'|'finanzas'|'spawner'|'bots'|'sistema';
  const TABS: { id: TabId; label: string; badge: number }[] = [
    { id:'overview',  label:'📊 Overview',  badge: 0 },
    { id:'usuarios',  label:'👥 Usuarios',  badge: jugadores.length },
    { id:'torneos',   label:'🏆 Torneos',   badge: openRooms },
    { id:'finanzas',  label:'💰 Finanzas',  badge: retPend + pagPend },
    { id:'spawner',   label:'🤖 Spawner',   badge: 0 },
    { id:'bots',      label:'🧪 Bots/QA',   badge: rooms.filter(r => r.status==='ACTIVE').length },
    { id:'sistema',   label:'⚙️ Sistema',   badge: 0 },
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
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:10 }}>
              <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#00ff88', margin:0, fontSize:'0.9rem' }}>👥 RADAR ANTI-SMURF & GESTIÓN</h2>
              <span style={{ color:'#8b949e', fontSize:'0.78rem' }}>{jFiltrados.length}/{jugadores.length} usuarios</span>
            </div>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ ...inp, marginBottom:14 }} placeholder="🔍 Buscar por Nick, Email, IP o Canvas Hash..." />

            <div style={{ ...card, overflowX:'auto', padding:0 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem', minWidth:760 }}>
                <thead><tr>{['JUGADOR','EMAIL / REGIÓN','HARDWARE','SALDO','FP%','ESTADO','ACCIONES'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {jFiltrados.slice(0,100).map(j => (
                    <tr key={j.id} className="crow">
                      <td style={td}>
                        <div style={{ fontWeight:700, color:j.baneado ? '#ff4757' : 'white' }}>{j.nombre||'—'}</div>
                        <div style={{ color:'#8b949e', fontSize:'0.68rem', cursor:'pointer' }} onClick={() => navigator.clipboard?.writeText(j.id)} title="Click → copiar UID">UID: {j.id.slice(0,10)}…</div>
                        {j.rol && j.rol !== 'jugador' && <span style={{ background:'rgba(145,70,255,0.15)', color:'#9146FF', padding:'1px 6px', borderRadius:4, fontSize:'0.62rem', fontWeight:700 }}>{j.rol.toUpperCase()}</span>}
                      </td>
                      <td style={td}>
                        <div style={{ fontSize:'0.73rem' }}>{j.email||'—'}</div>
                        <div style={{ color:'#8b949e', fontSize:'0.67rem' }}>{j.ip||'—'} · {j.region||'—'}</div>
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
                      </td>
                      <td style={{ ...td, minWidth:145 }}>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                          {!j.baneado
                            ? <button className="cact" style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={() => setBanModal({ uid:j.id, nombre:j.nombre||j.id, horas:24 })}>🚫 BAN</button>
                            : <button className="cact" style={sm('rgba(0,255,136,0.15)','#00ff88')} onClick={() => desbanear(j.id, j.nombre||j.id)}>✅ QUITAR</button>
                          }
                          <button className="cact" style={sm('rgba(255,215,0,0.15)','#ffd700')} onClick={() => setCoinsM({ uid:j.id, nombre:j.nombre||j.id, actual:j.number||0, nuevo:String(j.number||0) })}>🪙</button>
                          <button className="cact" style={sm('rgba(0,158,227,0.15)','#009ee3')} onClick={() => setExpM(j)}>🕵️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {jFiltrados.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign:'center', color:'#8b949e', padding:30 }}>Sin resultados para &ldquo;{busqueda}&rdquo;</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>}

          {/* ══ TORNEOS ═════════════════════════════════════ */}
          {tab === 'torneos' && <>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ffd700', margin:'0 0 18px', fontSize:'0.9rem' }}>🏆 CONTROL DE SALAS — ARENA 1VS1</h2>

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
                    <option value="16">16 cupos</option>
                    <option value="32">32 cupos</option>
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
                        <thead><tr>{['JUGADOR','MONTO','COMP.','ACCIÓN'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {data.map(p => (
                            <tr key={p.id} className="crow">
                              <td style={td}><b>{(p.jugador_nombre||'').toUpperCase()}</b><br/><span style={{ color:'#8b949e', fontSize:'0.65rem' }}>{(p.uid||'').slice(0,8)}</span></td>
                              <td style={{ ...td, color:'#ffd700' }}>🪙{p.coins}<br/><span style={{ color:'#ccc', fontSize:'0.68rem' }}>${p.usd} | {p.metodo}</span></td>
                              <td style={td}>{p.tx_hash
                                  ? <button style={sm('#222')} title={p.tx_hash} onClick={() => navigator.clipboard?.writeText(p.tx_hash!)} >📋 TX</button>
                                  : p.comprobante_url ? <button style={sm('#222')} onClick={() => window.open(p.comprobante_url,'_blank')}>📄</button> : <span style={{ color:'#ff4757', fontSize:'0.66rem' }}>—</span>}</td>
                              <td style={td}>
                                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                                  <button className="cact" style={sm('rgba(0,255,136,0.15)','#00ff88')} onClick={() => aprobarPago(p.id,p.uid!,p.coins!)}>✅</button>
                                  <button className="cact" style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={() => rechazarPago(p.id)}>✕</button>
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
                : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem', minWidth:520 }}>
                    <thead><tr>{['JUGADOR','MONTO','CBU / ALIAS','FECHA','ACCIÓN'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {retiros.map(r => (
                        <tr key={r.id} className="crow">
                          <td style={td}><b>{r.nombre_real||r.nombreJugador}</b><br/><span style={{ color:'#8b949e', fontSize:'0.68rem' }}>{r.metodo || 'Binance USDT'}</span></td>
                          <td style={{ ...td, color:'#ff4757', fontWeight:700 }}>🪙 {r.montoCoins}<br/><span style={{ color:'#8b949e', fontSize:'0.68rem' }}>${((r.montoCoins||0)/100).toFixed(2)} USDT</span></td>
                          <td style={td}><button style={sm('#222')} title={r.cbuAlias} onClick={() => navigator.clipboard?.writeText(r.cbuAlias||'')}><span style={{ fontFamily:'monospace', fontSize:'0.72rem', color:'#00e5ff' }}>{(r.cbuAlias||'').slice(0,16)}…</span></button></td>
                          <td style={{ ...td, color:'#8b949e', fontSize:'0.72rem' }}>{r.fecha?.toDate?.()?.toLocaleDateString()||'—'}</td>
                          <td style={td}>
                            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                              <button className="cact" style={sm('rgba(0,255,136,0.15)','#00ff88')} onClick={() => marcarRetiroPagado(r.id)}>✅ PAGADO</button>
                              <button className="cact" style={sm('rgba(255,71,87,0.15)','#ff4757')} onClick={() => rechazarRetiro(r.id,r.uid||'',r.montoCoins||0)}>↩ DEVOLVER</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>
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

              {/* Plantillas */}
              <div style={{ ...card, borderTop:'3px solid #009ee3' }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#009ee3', margin:'0 0 10px', fontSize:'0.85rem' }}>📋 PLANTILLAS (2 salas c/u)</h3>
                {[
                  { g:'FC26',      m:'GENERAL_95', tiers:['FREE','RECREATIVO','COMPETITIVO'], regions:['LATAM_SUR','LATAM_NORTE'] },
                  { g:'FC26',      m:'ULTIMATE',   tiers:['FREE','RECREATIVO','COMPETITIVO'], regions:['LATAM_SUR'] },
                  { g:'EFOOTBALL', m:'DREAM_TEAM', tiers:['FREE','RECREATIVO'],               regions:['LATAM_SUR'] },
                  { g:'EFOOTBALL', m:'GENUINOS',   tiers:['FREE','COMPETITIVO'],              regions:['LATAM_SUR'] },
                ].map(t => (
                  <div key={t.g+t.m} style={{ padding:'8px 0', borderBottom:'1px solid #1c2028' }}>
                    <div style={{ fontWeight:700, fontSize:'0.8rem', marginBottom:4 }}>{GL[t.g]} — {ML[t.m]}</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {t.tiers.map(tier => <span key={tier} style={{ background:'rgba(255,255,255,0.04)', color:TIER_CLR[tier], padding:'2px 7px', borderRadius:4, fontSize:'0.66rem', fontWeight:700 }}>{tier}</span>)}
                      {t.regions.map(r => <span key={r} style={{ background:'rgba(0,158,227,0.08)', color:'#009ee3', padding:'2px 7px', borderRadius:4, fontSize:'0.66rem' }}>{RL[r]}</span>)}
                    </div>
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

          {/* ══ BOTS / QA ═══════════════════════════════════ */}
          {tab === 'bots' && <>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#00e5ff', margin:'0 0 18px', fontSize:'0.9rem', borderLeft:'4px solid #00e5ff', paddingLeft:12 }}>🧪 LABORATORIO DE BOTS — TESTING & QA</h2>

            {/* Log */}
            {botLog && (
              <div style={{ marginBottom:16, padding:'12px 16px', background:botLog.startsWith('✅') ? 'rgba(0,255,136,0.07)' : botLog.startsWith('❌') ? 'rgba(255,71,87,0.07)' : 'rgba(0,229,255,0.07)', border:`1px solid ${botLog.startsWith('✅') ? '#00ff88' : botLog.startsWith('❌') ? '#ff4757' : '#00e5ff'}`, borderRadius:10, color:botLog.startsWith('✅') ? '#00ff88' : botLog.startsWith('❌') ? '#ff4757' : '#00e5ff', fontSize:'0.82rem', fontFamily:"'Roboto',sans-serif" }}>
                {botLog}
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:18, marginBottom:22 }}>

              {/* OPEN rooms — fill with bots */}
              <div style={{ ...card, borderTop:'3px solid #00ff88', maxHeight:480, overflowY:'auto' }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#00ff88', margin:'0 0 14px', fontSize:'0.82rem' }}>🟢 SALAS OPEN — Llenar con Bots</h3>
                {rooms.filter(r => r.status === 'OPEN').length === 0
                  ? <p style={{ color:'#8b949e', textAlign:'center', padding:'16px 0' }}>Sin salas abiertas</p>
                  : rooms.filter(r => r.status === 'OPEN').map(r => {
                      const isBusy = botLoading === r.id + 'fillWithBots';
                      const spots = (r.capacity || 0) - (r.players?.length || 0);
                      return (
                        <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid #1c2028', gap:8, flexWrap:'wrap' }}>
                          <div>
                            <div style={{ fontWeight:700, fontSize:'0.8rem', color:'white' }}>{GL[r.game||'']||r.game} · <span style={{ color:TIER_CLR[r.tier||'']||'#fff' }}>{r.tier}</span></div>
                            <div style={{ color:'#8b949e', fontSize:'0.68rem' }}>{ML[r.mode||'']||r.mode} · {RL[r.region||'']||r.region}</div>
                            <div style={{ color:'#00ff88', fontSize:'0.7rem', marginTop:2 }}>{r.players?.length||0}/{r.capacity} jugadores · <span style={{ color:'#ffd700' }}>{spots} lugar(es) libre(s)</span></div>
                          </div>
                          <button className="cact" style={{ ...sm(isBusy ? '#30363d' : 'rgba(0,255,136,0.15)', isBusy ? '#555' : '#00ff88'), whiteSpace:'nowrap', opacity:isBusy ? 0.5 : 1 }}
                            disabled={isBusy} onClick={() => botAction(r.id, 'fillWithBots')}>
                            {isBusy ? '⏳' : '🤖 LLENAR BOTS'}
                          </button>
                        </div>
                      );
                    })
                }
              </div>

              {/* ACTIVE rooms — advance round or reset */}
              <div style={{ ...card, borderTop:'3px solid #ffd700', maxHeight:480, overflowY:'auto' }}>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ffd700', margin:'0 0 14px', fontSize:'0.82rem' }}>⚡ SALAS ACTIVAS — Control de Rondas</h3>
                {rooms.filter(r => r.status === 'ACTIVE' || r.status === 'FINISHED').length === 0
                  ? <p style={{ color:'#8b949e', textAlign:'center', padding:'16px 0' }}>Sin salas activas</p>
                  : rooms.filter(r => r.status === 'ACTIVE' || r.status === 'FINISHED').map(r => {
                      const rMatches = botMatches.filter(m => m.tournamentId === r.id);
                      const waitingCount  = rMatches.filter(m => m.status === 'WAITING').length;
                      const finishedCount = rMatches.filter(m => m.status === 'FINISHED').length;
                      const currentRound  = (r as Room & { current_round?: string }).current_round;
                      const isBusyAdv   = botLoading === r.id + 'advanceRound';
                      const isBusyReset = botLoading === r.id + 'resetBots';
                      return (
                        <div key={r.id} style={{ padding:'9px 0', borderBottom:'1px solid #1c2028' }}>
                          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:'0.8rem', color:'white' }}>{GL[r.game||'']||r.game} · <span style={{ color:TIER_CLR[r.tier||'']||'#fff' }}>{r.tier}</span></div>
                              <div style={{ color:'#8b949e', fontSize:'0.68rem' }}>{ML[r.mode||'']||r.mode}</div>
                              <div style={{ color:'#ffd700', fontSize:'0.7rem', marginTop:3 }}>Ronda actual: <b>{currentRound || '—'}</b></div>
                              <div style={{ color:'#8b949e', fontSize:'0.68rem', marginTop:1 }}>⏳ {waitingCount} WAITING · ✅ {finishedCount} DONE · total: {rMatches.length}</div>
                              <div style={{ color: r.status==='FINISHED' ? '#00ff88' : '#ff4757', fontSize:'0.68rem', fontWeight:700 }}>{r.status}</div>
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:5, flexShrink:0 }}>
                              {r.status === 'ACTIVE' && (
                                <button className="cact" style={{ ...sm(isBusyAdv ? '#30363d' : 'rgba(255,215,0,0.15)', isBusyAdv ? '#555' : '#ffd700'), opacity:isBusyAdv ? 0.5 : 1 }}
                                  disabled={isBusyAdv} onClick={() => botAction(r.id, 'advanceRound')}>
                                  {isBusyAdv ? '⏳' : '⚡ AVANZAR'}
                                </button>
                              )}
                              <button className="cact" style={{ ...sm(isBusyReset ? '#30363d' : 'rgba(255,71,87,0.12)', isBusyReset ? '#555' : '#ff4757'), opacity:isBusyReset ? 0.5 : 1 }}
                                disabled={isBusyReset} onClick={() => botAction(r.id, 'resetBots')}>
                                {isBusyReset ? '⏳' : '🔄 RESET'}
                              </button>
                              <a href={`/match/${r.id}`} target="_blank" rel="noreferrer"
                                style={{ ...sm('#30363d'), textAlign:'center', textDecoration:'none' }}>👁️ VER</a>
                            </div>
                          </div>
                        </div>
                      );
                    })
                }
              </div>
            </div>

            {/* Matches table */}
            <div style={{ ...card, padding:0, overflow:'hidden', marginBottom:22 }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid #30363d', fontFamily:"'Orbitron',sans-serif", color:'#00e5ff', fontSize:'0.82rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                MATCHES EN VIVO ({botMatches.length})
                <span style={{ color:'#8b949e', fontSize:'0.7rem', fontFamily:"'Roboto',sans-serif" }}>Tiempo real · últimos 100</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.77rem', minWidth:700 }}>
                  <thead><tr>{['SALA','RONDA','P1','P2','SCORE','ESTADO','LINK'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {botMatches.slice(0,40).map(m => (
                      <tr key={m.id} className="crow">
                        <td style={{ ...td, color:'#8b949e', fontSize:'0.65rem', fontFamily:'monospace' }}>{m.tournamentId?.slice(0,10)}…</td>
                        <td style={{ ...td, color:'#00e5ff', fontWeight:700 }}>{m.round}</td>
                        <td style={td}>{m.p1_username || m.p1?.slice(0,10)}</td>
                        <td style={td}>{m.p2_username || m.p2?.slice(0,10)}</td>
                        <td style={{ ...td, color:'#ffd700', fontWeight:700 }}>{m.score || '—'}</td>
                        <td style={{ ...td, color:m.status==='WAITING' ? '#00ff88' : m.status==='FINISHED' ? '#8b949e' : '#ff4757', fontWeight:700 }}>{m.status}</td>
                        <td style={td}>
                          <a href={`/match/${m.id}`} target="_blank" rel="noreferrer" style={{ color:'#009ee3', fontSize:'0.7rem' }}>→ SALA</a>
                        </td>
                      </tr>
                    ))}
                    {botMatches.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', color:'#8b949e', padding:24 }}>Sin matches todavía</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Test de foto — match manual */}
            <div style={{ ...card, borderTop:'3px solid #9146FF' }}>
              <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#9146FF', margin:'0 0 10px', fontSize:'0.82rem' }}>📸 TEST DE FOTO / VAR</h3>
              <p style={{ color:'#8b949e', fontSize:'0.75rem', marginTop:-4, marginBottom:12 }}>Pegá un Match ID para ir directo a la sala y probar el reporte de resultado + foto.</p>
              <div style={{ display:'flex', gap:10 }}>
                <input value={testMatchId} onChange={e => setTestMatchId(e.target.value)}
                  style={{ ...inp, marginBottom:0, flex:1 }} placeholder="Match ID (ej: abc123xyz)" />
                <a href={testMatchId ? `/match/${testMatchId}` : '#'} target="_blank" rel="noreferrer"
                  style={{ ...btn('#9146FF','white'), textDecoration:'none', whiteSpace:'nowrap', flexShrink:0, opacity:testMatchId ? 1 : 0.4, pointerEvents:testMatchId ? 'auto' : 'none' }}>
                  🚀 IR A SALA
                </a>
              </div>
              <p style={{ color:'#8b949e', fontSize:'0.7rem', marginTop:10 }}>Tip: Hacé click en "→ SALA" en la tabla de arriba para ir directamente a cualquier match activo.</p>
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

        </main>
      </div>

      {/* ═══ MODALES ════════════════════════════════════════════ */}

      {/* Ban */}
      {banModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:6000, padding:20, backdropFilter:'blur(6px)' }}>
          <div style={{ background:'#161b22', border:'2px solid #ff4757', borderRadius:16, padding:28, maxWidth:360, width:'100%', textAlign:'center' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:10 }}>⚖️</div>
            <h2 style={{ fontFamily:"'Orbitron',sans-serif", color:'#ff4757', margin:'0 0 6px', fontSize:'1rem' }}>TRIBUNAL LFA</h2>
            <h3 style={{ margin:'0 0 16px', color:'white' }}>{banModal.nombre}</h3>
            <select onChange={e => setBanModal(prev => prev ? { ...prev, horas:Number(e.target.value) } : null)}
              style={{ ...inp, borderColor:'#ff4757', textAlign:'center', marginBottom:16 }}>
              <option value={24}>24 Horas</option>
              <option value={48}>48 Horas</option>
              <option value={72}>72 Horas</option>
              <option value={168}>1 Semana</option>
              <option value={0}>BAN PERMANENTE</option>
            </select>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button style={btn('#ff4757','white')} onClick={() => ejecutarBan(banModal.uid, banModal.nombre, banModal.horas)}>🚫 APLICAR</button>
              <button style={{ ...btn('transparent','#8b949e'), border:'1px solid #30363d' }} onClick={() => setBanModal(null)}>CANCELAR</button>
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
                { l:'IP CONEXIÓN', v: expM.ip||'—',                                        c: undefined },
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
