'use client';
/**
 * app/moderador/page.tsx
 * Panel de Moderadores LFA — Acceso: rol='mod', rol='soporte' o CEO.
 *
 * Tabs:
 *  🏛️  INICIO        — Stats, disputas recientes, accesos rápidos
 *  ⚖️  DISPUTAS       — Disputas clásicas (matches) + PRO (league_matches)
 *  🏆  TORNEOS        — Torneos clásicos: forzar resultado, cerrar sala, ver jugadores
 *  📋  LIGAS PRO      — Ligas PRO: partidos en disputa / pending / cerrar
 *  👥  JUGADORES      — Ver jugadores, advertir, ver historial. SIN COINS.
 *  🌎  CREAR TORNEO   — Crear torneo con restricción de país
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter }   from 'next/navigation';
import { onAuthStateChanged, getIdToken } from 'firebase/auth';
import {
  collection, doc, onSnapshot, query,
  where, limit, orderBy, getDoc,
  getDocs, updateDoc, deleteDoc, serverTimestamp, addDoc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import LfaModal, { LfaModalHandle } from '@/app/_components/LfaModal';

/* ─── Constants ──────────────────────────────────────────── */
const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

const PAISES = [
  { code: 'Argentina',           flag: '🇦🇷' },
  { code: 'México',              flag: '🇲🇽' },
  { code: 'Colombia',            flag: '🇨🇴' },
  { code: 'Chile',               flag: '🇨🇱' },
  { code: 'Perú',                flag: '🇵🇪' },
  { code: 'Venezuela',           flag: '🇻🇪' },
  { code: 'Ecuador',             flag: '🇪🇨' },
  { code: 'Bolivia',             flag: '🇧🇴' },
  { code: 'Paraguay',            flag: '🇵🇾' },
  { code: 'Uruguay',             flag: '🇺🇾' },
  { code: 'Brasil',              flag: '🇧🇷' },
  { code: 'España',              flag: '🇪🇸' },
  { code: 'Costa Rica',          flag: '🇨🇷' },
  { code: 'Guatemala',           flag: '🇬🇹' },
  { code: 'Honduras',            flag: '🇭🇳' },
  { code: 'Nicaragua',           flag: '🇳🇮' },
  { code: 'Panamá',              flag: '🇵🇦' },
  { code: 'El Salvador',         flag: '🇸🇻' },
  { code: 'República Dominicana',flag: '🇩🇴' },
  { code: 'Cuba',                flag: '🇨🇺' },
  { code: 'Puerto Rico',         flag: '🇵🇷' },
  { code: 'Estados Unidos',      flag: '🇺🇸' },
  { code: 'Canadá',              flag: '🇨🇦' },
];

const GL: Record<string, string> = { FC26: 'FC 26', EFOOTBALL: 'eFootball' };
const ML: Record<string, string> = {
  GENERAL_95: '95 General', ULTIMATE: 'Ultimate', DREAM_TEAM: 'Dream Team', GENUINOS: 'Genuinos',
};

/* ─── Types ──────────────────────────────────────────────── */
interface Jugador {
  id: string; nombre?: string; email?: string; baneado?: boolean;
  fair_play?: number; number?: number; rol?: string; titulos?: number;
  pais_codigo?: string; region?: string; partidos_jugados?: number;
}
interface Room {
  id: string; game?: string; mode?: string; tier?: string; region?: string;
  status?: string; players?: string[]; capacity?: number; entry_fee?: number;
  country?: string; created_at?: { toDate?: () => Date };
}
interface ClassicDisputa {
  id: string; matchId: string; disputedBy: string; reason: string;
  screenshot_url?: string; status: string; created_at?: { toDate?: () => Date };
}
interface ProMatch {
  id: string; league_id: string; round: number;
  player1_uid: string; player2_uid: string;
  player1_name: string; player2_name: string;
  player1_team: string; player2_team: string;
  status: string; score?: Record<string, number> | null;
  winner_uid?: string | null;
  photo_url?: string | null; dispute_reason?: string | null;
  updated_at?: string; created_at?: unknown;
}
interface Liga {
  id: string; name: string; game: string; status: string;
  current_round: number; total_rounds: number; current_players: number;
  division?: string; region?: string; platform?: string;
}
type TabId = 'inicio' | 'disputas' | 'torneos' | 'ligas' | 'jugadores' | 'crear';

/* ─── Styles ─────────────────────────────────────────────── */
const S = {
  card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 'clamp(14px,2.5vw,20px)' } as React.CSSProperties,
  inp:  { width: '100%', padding: '9px 12px', background: '#0b0e14', border: '1px solid #30363d', color: 'white', borderRadius: 8, marginBottom: 10, fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const },
  th:   { padding: '9px 10px', textAlign: 'left' as const, fontFamily: "'Orbitron',sans-serif", color: '#8b949e', fontSize: '0.65rem', borderBottom: '1px solid #30363d', background: 'rgba(0,0,0,0.25)', whiteSpace: 'nowrap' as const },
  td:   { padding: '9px 10px', borderBottom: '1px solid #1c2028', fontSize: '0.8rem', verticalAlign: 'middle' as const },
  btn:  (bg: string, c = 'black') => ({ background: bg, color: c, border: 'none', padding: '9px 14px', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 5 } as React.CSSProperties),
  sm:   (bg: string, c = 'white') => ({ background: bg, color: c, border: 'none', padding: '5px 9px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' as const } as React.CSSProperties),
};

/* ═══════════════════════════════════════════════════════════ */
export default function ModeradorPage() {
  const router = useRouter();
  const modal  = useRef<LfaModalHandle>(null);

  const [tab,       setTab]       = useState<TabId>('inicio');
  const [ready,     setReady]     = useState(false);
  const [modName,   setModName]   = useState('');

  /* ── Data ────────────────────────────────────────────────── */
  const [jugadores,  setJugadores]  = useState<Jugador[]>([]);
  const [rooms,      setRooms]      = useState<Room[]>([]);
  const [disputas,   setDisputas]   = useState<ClassicDisputa[]>([]);
  const [proMatches, setProMatches] = useState<ProMatch[]>([]);
  const [ligas,      setLigas]      = useState<Liga[]>([]);

  /* ── UI state ────────────────────────────────────────────── */
  const [busJ,    setBusJ]    = useState('');
  const [busR,    setBusR]    = useState('');
  const [busL,    setBusL]    = useState('');

  /* ── Forzar resultado clásico ────────────────────────────── */
  const [forceModal, setForceModal] = useState<{ matchId: string; p1: string; p2: string; p1Name: string; p2Name: string } | null>(null);
  const [forceWinner, setForceWinner] = useState<'p1' | 'p2'>('p1');

  /* ── Forzar resultado PRO ────────────────────────────────── */
  const [proForceModal, setProForceModal] = useState<ProMatch | null>(null);
  const [proWinnerSide, setProWinnerSide] = useState<'p1'|'p2'|'draw'>('p1');
  const [proScore1,     setProScore1]     = useState('1');
  const [proScore2,     setProScore2]     = useState('0');

  /* ── Warn player ─────────────────────────────────────────── */
  const [warnModal, setWarnModal] = useState<{ uid: string; nombre: string } | null>(null);
  const [warnMotivo, setWarnMotivo] = useState('');
  const [warnDelta,  setWarnDelta]  = useState('-10');

  /* ── Crear torneo ────────────────────────────────────────── */
  const [crGame,    setCrGame]    = useState('FC26');
  const [crMode,    setCrMode]    = useState('GENERAL_95');
  const [crRegion,  setCrRegion]  = useState('LATAM_SUR');
  const [crTier,    setCrTier]    = useState('FREE');
  const [crCap,     setCrCap]     = useState('8');
  const [crFee,     setCrFee]     = useState('500');
  const [crCountry, setCrCountry] = useState('');
  const [crName,    setCrName]    = useState('');
  const [crLoading, setCrLoading] = useState(false);

  /* ── Disputa resolución ──────────────────────────────────── */
  const [resolveDispModal, setResolveDispModal] = useState<ClassicDisputa | null>(null);
  const [resolveNotas, setResolveNotas] = useState('');

  /* ─────────────────────────────────────────────────── */
  const alerta = useCallback((t: string, m: string, tipo?: 'info'|'error'|'exito') =>
    modal.current!.mostrarAlerta(t, m, tipo), []);

  const getToken = async () => {
    const u = auth.currentUser;
    if (!u) return '';
    return getIdToken(u);
  };

  /* ── Auth guard ──────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }
      const snap = await getDoc(doc(db, 'usuarios', user.uid));
      const d    = snap.data() as { rol?: string; nombre?: string } | undefined;
      const isStaff = user.uid === CEO_UID || d?.rol === 'mod' || d?.rol === 'soporte';
      if (!isStaff) { router.replace('/hub'); return; }
      setModName(d?.nombre ?? 'Staff');
      setReady(true);
    });
    return unsub;
  }, [router]);

  /* ── Listeners ───────────────────────────────────────────── */
  useEffect(() => {
    if (!ready) return;
    const subs: (() => void)[] = [];

    subs.push(onSnapshot(collection(db, 'usuarios'), snap => {
      const l: Jugador[] = [];
      snap.forEach(d => l.push({ id: d.id, ...d.data() } as Jugador));
      setJugadores(l);
    }));

    subs.push(onSnapshot(query(collection(db, 'tournaments'), limit(200)), snap => {
      const l: Room[] = [];
      snap.forEach(d => l.push({ id: d.id, ...d.data() } as Room));
      l.sort((a, b) => (b.created_at?.toDate?.()?.getTime() || 0) - (a.created_at?.toDate?.()?.getTime() || 0));
      setRooms(l);
    }));

    subs.push(onSnapshot(query(collection(db, 'disputas'), orderBy('created_at', 'desc'), limit(80)), snap => {
      const l: ClassicDisputa[] = [];
      snap.forEach(d => l.push({ id: d.id, ...d.data() } as ClassicDisputa));
      setDisputas(l);
    }));

    subs.push(onSnapshot(
      query(collection(db, 'league_matches'), where('status', 'in', ['dispute', 'validating', 'pending', 'challenged']), limit(100)),
      snap => {
        const l: ProMatch[] = [];
        snap.forEach(d => l.push({ id: d.id, ...d.data() } as ProMatch));
        l.sort((a, b) => {
          if (a.status === 'dispute' && b.status !== 'dispute') return -1;
          if (b.status === 'dispute' && a.status !== 'dispute') return 1;
          return 0;
        });
        setProMatches(l);
      }
    ));

    subs.push(onSnapshot(query(collection(db, 'leagues'), limit(100)), snap => {
      const l: Liga[] = [];
      snap.forEach(d => l.push({ id: d.id, ...d.data() } as Liga));
      setLigas(l);
    }));

    return () => subs.forEach(u => u());
  }, [ready]);

  /* ══════════════════════════════════════════════════════════ */
  /* ── Actions ─────────────────────────────────────────────── */

  async function resolveClassicDisputa(d: ClassicDisputa, verdict: string) {
    const token = await getToken();
    const res = await fetch('/api/mod/resolveClassicDispute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ disputaId: d.id, matchId: d.matchId, verdict, notas: resolveNotas }),
    });
    const data = await res.json();
    if (!res.ok) { await alerta('ERROR', data.error || 'Error al resolver.', 'error'); return; }
    const msgs: Record<string, string> = {
      reporter_wins: '✅ Validado. El que disputó sin razón pierde FP.',
      disputer_wins: '⚖️ Resultado revertido. El reportador pierde FP.',
      no_evidence:   '🔍 Sin evidencia. Ambos pierden FP leve.',
      rematch:       '🔄 Rematch ordenado.',
    };
    await alerta('DISPUTA RESUELTA', msgs[verdict] || 'Resuelto.', 'exito');
    setResolveDispModal(null);
    setResolveNotas('');
  }

  async function resolveProMatch(m: ProMatch, resolution: string) {
    const token = await getToken();
    const res = await fetch('/api/mod/resolveProDispute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ match_id: m.id, resolution }),
    });
    const data = await res.json();
    if (!res.ok) { await alerta('ERROR', data.error || 'Error.', 'error'); return; }
    await alerta('LISTO', 'Partido PRO resuelto.', 'exito');
  }

  async function forceProResult() {
    if (!proForceModal) return;
    const token = await getToken();
    const res = await fetch('/api/mod/forceProResult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        match_id:    proForceModal.id,
        winner_side: proWinnerSide,
        score1:      parseInt(proScore1) || 0,
        score2:      parseInt(proScore2) || 0,
      }),
    });
    const data = await res.json();
    if (!res.ok) { await alerta('ERROR', data.error || 'Error.', 'error'); return; }
    await alerta('LISTO', 'Resultado PRO establecido.', 'exito');
    setProForceModal(null);
  }

  async function submitForceClassic() {
    if (!forceModal) return;
    const token = await getToken();
    const res = await fetch('/api/mod/forceClassicResult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ matchId: forceModal.matchId, winnerSide: forceWinner }),
    });
    const data = await res.json();
    if (!res.ok) { await alerta('ERROR', data.error || 'Error.', 'error'); return; }
    await alerta('LISTO', data.message || 'Resultado forzado.', 'exito');
    setForceModal(null);
  }

  async function deleteRoom(id: string) {
    const ok = await alerta('ELIMINAR SALA', '¿Eliminar esta sala definitivamente?', 'error');
    if (!ok) return;
    await deleteDoc(doc(db, 'tournaments', id));
    await alerta('LISTO', 'Sala eliminada.', 'exito');
  }

  async function warnPlayer() {
    if (!warnModal || !warnMotivo.trim()) return;
    const token = await getToken();
    const res = await fetch('/api/mod/warnPlayer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ target_uid: warnModal.uid, motivo: warnMotivo, fp_delta: parseInt(warnDelta) || -10 }),
    });
    const data = await res.json();
    if (!res.ok) { await alerta('ERROR', data.error || 'Error.', 'error'); return; }
    await alerta('ADVERTENCIA EMITIDA', `Fair Play → ${data.new_fair_play}%`, 'exito');
    setWarnModal(null);
    setWarnMotivo('');
    setWarnDelta('-10');
  }

  async function crearTorneo() {
    setCrLoading(true);
    const token = await getToken();
    const fee = crTier === 'FREE' ? 0 : parseInt(crFee) || 0;
    const res = await fetch('/api/mod/createTournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        game: crGame, mode: crMode, region: crRegion, tier: crTier,
        capacity: parseInt(crCap), entry_fee: fee,
        country: crCountry || undefined, name: crName || undefined,
      }),
    });
    const data = await res.json();
    setCrLoading(false);
    if (!res.ok) { await alerta('ERROR', data.error || 'Error al crear.', 'error'); return; }
    await alerta('TORNEO CREADO', `ID: ${data.id}\n${crCountry ? `País: ${crCountry}` : 'Sin restricción de país'}`, 'exito');
    setCrCountry(''); setCrName('');
  }

  async function loadMatchesForRoom(roomId: string) {
    const snap = await getDocs(query(collection(db, 'matches'), where('tournamentId', '==', roomId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  }

  async function openForceModal(roomId: string) {
    const matches = await loadMatchesForRoom(roomId);
    const active  = matches.find(m => m.status === 'WAITING' || m.status === 'dispute' || m.status === 'validating');
    if (!active) { await alerta('SIN PARTIDOS ACTIVOS', 'No hay partidos activos en esta sala.', 'info'); return; }
    setForceModal({
      matchId: active.id as string,
      p1: active.p1 as string,
      p2: active.p2 as string,
      p1Name: (active.p1_username ?? active.p1) as string,
      p2Name: (active.p2_username ?? active.p2) as string,
    });
    setForceWinner('p1');
  }

  /* ── Stats ────────────────────────────────────────────────── */
  const dispPend      = disputas.filter(d => d.status === 'PENDING').length;
  const proDispPend   = proMatches.filter(m => m.status === 'dispute').length;
  const roomsActivos  = rooms.filter(r => r.status === 'OPEN' || r.status === 'ACTIVE').length;
  const ligasActivas  = ligas.filter(l => l.status === 'activa' || l.status === 'playoffs').length;

  /* ═══════════════════════════════════════════════════════════ */
  if (!ready) return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#8b949e', fontFamily: "'Orbitron',sans-serif" }}>CARGANDO PANEL...</p>
    </div>
  );

  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'inicio',    label: '🏛️ INICIO'  },
    { id: 'disputas',  label: '⚖️ DISPUTAS', badge: dispPend + proDispPend },
    { id: 'torneos',   label: '🏆 TORNEOS'  },
    { id: 'ligas',     label: '📋 LIGAS PRO'},
    { id: 'jugadores', label: '👥 JUGADORES'},
    { id: 'crear',     label: '🌎 CREAR TORNEO'},
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', color: '#c9d1d9', fontFamily: "'Roboto',sans-serif", paddingBottom: 80 }}>
      <LfaModal ref={modal} />

      {/* ── Modals ───────────────────────────────────────────── */}

      {/* Resolver disputa clásica */}
      {resolveDispModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 480, width: '100%' }}>
            <h3 style={{ color: '#ffd700', fontFamily: "'Orbitron',sans-serif", marginBottom: 14 }}>⚖️ RESOLVER DISPUTA</h3>
            <p style={{ color: '#8b949e', fontSize: '0.82rem', marginBottom: 6 }}>
              Match ID: <strong style={{ color: 'white' }}>{resolveDispModal.matchId.slice(-8)}</strong>
            </p>
            <p style={{ color: '#8b949e', fontSize: '0.82rem', marginBottom: 14 }}>
              Motivo: <em style={{ color: '#c9d1d9' }}>{resolveDispModal.reason}</em>
            </p>
            <textarea
              placeholder="Notas internas (opcional)..."
              value={resolveNotas}
              onChange={e => setResolveNotas(e.target.value)}
              rows={3}
              style={{ ...S.inp, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              <button style={S.btn('#00ff88')} onClick={() => resolveClassicDisputa(resolveDispModal, 'reporter_wins')}>✅ Reportador tenía razón</button>
              <button style={S.btn('#ffd700')} onClick={() => resolveClassicDisputa(resolveDispModal, 'disputer_wins')}>⚖️ Disputador tenía razón</button>
              <button style={S.btn('#8b949e', 'white')} onClick={() => resolveClassicDisputa(resolveDispModal, 'no_evidence')}>❌ Sin evidencia</button>
              <button style={S.btn('#00c3ff')} onClick={() => resolveClassicDisputa(resolveDispModal, 'rematch')}>🔄 Rematch</button>
              <button style={S.btn('#30363d', 'white')} onClick={() => setResolveDispModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Forzar resultado clásico */}
      {forceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 400, width: '100%' }}>
            <h3 style={{ color: '#00c3ff', fontFamily: "'Orbitron',sans-serif", marginBottom: 14 }}>⚡ FORZAR RESULTADO</h3>
            {(['p1', 'p2'] as const).map(side => (
              <label key={side} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
                <input type="radio" name="fw" checked={forceWinner === side} onChange={() => setForceWinner(side)} />
                <span style={{ color: forceWinner === side ? '#00ff88' : 'white', fontWeight: 700 }}>
                  {side === 'p1' ? '👤 ' + forceModal.p1Name : '👤 ' + forceModal.p2Name}
                </span>
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={S.btn('#00ff88')} onClick={submitForceClassic}>⚡ Confirmar</button>
              <button style={S.btn('#30363d', 'white')} onClick={() => setForceModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Forzar resultado PRO */}
      {proForceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 420, width: '100%' }}>
            <h3 style={{ color: '#00c3ff', fontFamily: "'Orbitron',sans-serif", marginBottom: 14 }}>⚡ FORZAR RESULTADO PRO</h3>
            <p style={{ fontSize: '0.82rem', color: '#8b949e', marginBottom: 12 }}>
              {proForceModal.player1_team} <span style={{ color: 'white' }}>vs</span> {proForceModal.player2_team}
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#8b949e', fontSize: '0.72rem', marginBottom: 4 }}>Goles {proForceModal.player1_team}</p>
                <input type="number" min="0" max="30" value={proScore1} onChange={e => setProScore1(e.target.value)} style={{ ...S.inp, textAlign: 'center', fontSize: '1.2rem' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#8b949e', fontSize: '0.72rem', marginBottom: 4 }}>Goles {proForceModal.player2_team}</p>
                <input type="number" min="0" max="30" value={proScore2} onChange={e => setProScore2(e.target.value)} style={{ ...S.inp, textAlign: 'center', fontSize: '1.2rem' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {(['p1', 'p2', 'draw'] as const).map(s => (
                <button key={s} onClick={() => setProWinnerSide(s)}
                  style={{ ...S.sm(proWinnerSide === s ? '#00ff88' : '#1c2028', proWinnerSide === s ? 'black' : 'white'), padding: '7px 12px' }}>
                  {s === 'p1' ? `✅ ${proForceModal.player1_name} gana` : s === 'p2' ? `✅ ${proForceModal.player2_name} gana` : '🤝 Empate'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.btn('#00ff88')} onClick={forceProResult}>⚡ Confirmar</button>
              <button style={S.btn('#30363d', 'white')} onClick={() => setProForceModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Warn modal */}
      {warnModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 400, width: '100%' }}>
            <h3 style={{ color: '#ff6b00', fontFamily: "'Orbitron',sans-serif", marginBottom: 14 }}>⚠️ ADVERTIR JUGADOR</h3>
            <p style={{ color: '#c9d1d9', marginBottom: 12 }}>{warnModal.nombre}</p>
            <input placeholder="Motivo de la advertencia..." value={warnMotivo} onChange={e => setWarnMotivo(e.target.value)} style={S.inp} />
            <select value={warnDelta} onChange={e => setWarnDelta(e.target.value)} style={S.inp}>
              <option value="-5">-5 FP (advertencia leve)</option>
              <option value="-10">-10 FP (advertencia media)</option>
              <option value="-15">-15 FP (advertencia grave)</option>
              <option value="-20">-20 FP (advertencia muy grave)</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.btn('#ff6b00', 'white')} onClick={warnPlayer}>⚠️ Emitir Advertencia</button>
              <button style={S.btn('#30363d', 'white')} onClick={() => { setWarnModal(null); setWarnMotivo(''); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────── */}
      <div style={{ background: '#161b22', borderBottom: '1px solid #30363d', padding: 'clamp(14px,2vw,20px) clamp(16px,3vw,32px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#6e40c9,#4b2bc2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡️</div>
          <div>
            <h1 style={{ fontFamily: "'Orbitron',sans-serif", color: '#c9d1d9', fontSize: 'clamp(0.9rem,2vw,1.2rem)', margin: 0 }}>PANEL MODERADORES</h1>
            <p style={{ color: '#6e40c9', fontSize: '0.75rem', margin: 0 }}>LFA STAFF · {modName}</p>
          </div>
        </div>
        <button style={S.sm('#161b22', '#8b949e')} onClick={() => router.push('/hub')}>← Hub</button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, padding: '12px clamp(16px,3vw,32px)', overflowX: 'auto', borderBottom: '1px solid #30363d', background: '#161b22' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? '#6e40c9' : 'transparent',
            color:      tab === t.id ? 'white' : '#8b949e',
            border: 'none', borderRadius: 8, padding: '8px 14px',
            fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem',
            cursor: 'pointer', whiteSpace: 'nowrap', position: 'relative',
          }}>
            {t.label}
            {(t.badge ?? 0) > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#ff4757', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: '0.62rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Roboto',sans-serif" }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: 'clamp(16px,3vw,32px)' }}>

        {/* ══════════════════ INICIO ════════════════════════ */}
        {tab === 'inicio' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'DISPUTAS CLÁSICAS',  val: dispPend,     color: '#ff4757', icon: '⚖️' },
                { label: 'DISPUTAS PRO',        val: proDispPend,  color: '#ffd700', icon: '🌍' },
                { label: 'TORNEOS ACTIVOS',     val: roomsActivos, color: '#00ff88', icon: '🏆' },
                { label: 'LIGAS PRO ACTIVAS',   val: ligasActivas, color: '#00c3ff', icon: '📋' },
                { label: 'JUGADORES TOTALES',   val: jugadores.filter(j => j.rol !== 'bot').length, color: '#6e40c9', icon: '👥' },
              ].map(st => (
                <div key={st.label} style={S.card}>
                  <p style={{ fontSize: '1.5rem', marginBottom: 4 }}>{st.icon}</p>
                  <p style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.2rem,3vw,1.8rem)', color: st.color, fontWeight: 900 }}>{st.val}</p>
                  <p style={{ color: '#8b949e', fontSize: '0.65rem', letterSpacing: 1 }}>{st.label}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
              {/* Últimas disputas */}
              <div style={S.card}>
                <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ff4757', fontSize: '0.8rem', marginBottom: 12 }}>⚖️ ÚLTIMAS DISPUTAS CLÁSICAS</h3>
                {disputas.slice(0, 5).map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #1c2028' }}>
                    <div>
                      <p style={{ fontSize: '0.78rem', color: d.status === 'PENDING' ? '#ffd700' : '#8b949e' }}>{d.status}</p>
                      <p style={{ fontSize: '0.72rem', color: '#8b949e' }}>{d.reason?.slice(0, 40)}...</p>
                    </div>
                    <button style={S.sm(d.status === 'PENDING' ? '#ff4757' : '#1c2028')} onClick={() => { setResolveDispModal(d); setTab('disputas'); }}>
                      {d.status === 'PENDING' ? 'RESOLVER' : 'VER'}
                    </button>
                  </div>
                ))}
              </div>

              {/* Acciones rápidas */}
              <div style={S.card}>
                <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#6e40c9', fontSize: '0.8rem', marginBottom: 12 }}>⚡ ACCIONES RÁPIDAS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button style={S.btn('#ff4757', 'white')} onClick={() => setTab('disputas')}>⚖️ Ver todas las disputas ({dispPend + proDispPend})</button>
                  <button style={S.btn('#00c3ff')} onClick={() => setTab('ligas')}>📋 Partidos PRO pendientes ({proMatches.length})</button>
                  <button style={S.btn('#00ff88')} onClick={() => setTab('crear')}>🌎 Crear torneo por país</button>
                  <button style={S.btn('#ffd700')} onClick={() => setTab('jugadores')}>👥 Gestionar jugadores</button>
                </div>
              </div>

              {/* Ligas con disputas */}
              <div style={S.card}>
                <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.8rem', marginBottom: 12 }}>🌍 DISPUTAS PRO ACTIVAS</h3>
                {proMatches.filter(m => m.status === 'dispute').slice(0, 5).map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #1c2028' }}>
                    <div>
                      <p style={{ fontSize: '0.78rem' }}>{m.player1_team} <span style={{ color: '#ff4757' }}>vs</span> {m.player2_team}</p>
                      <p style={{ fontSize: '0.7rem', color: '#8b949e' }}>{m.dispute_reason?.slice(0, 35)}</p>
                    </div>
                    <button style={S.sm('#ffd700', 'black')} onClick={() => { setProForceModal(m); setTab('ligas'); }}>FORZAR</button>
                  </div>
                ))}
                {proMatches.filter(m => m.status === 'dispute').length === 0 && (
                  <p style={{ color: '#8b949e', fontSize: '0.78rem' }}>Sin disputas PRO activas.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ DISPUTAS ══════════════════════ */}
        {tab === 'disputas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Clásicas */}
            <div style={S.card}>
              <h2 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ff4757', fontSize: '0.9rem', marginBottom: 14 }}>⚖️ DISPUTAS — TORNEOS CLÁSICOS</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['ESTADO', 'MATCH ID', 'MOTIVO', 'CAPTURA', 'ACCIONES'].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {disputas.map(d => (
                      <tr key={d.id}>
                        <td style={S.td}>
                          <span style={{ background: d.status === 'PENDING' ? '#ff475730' : '#00ff8820', color: d.status === 'PENDING' ? '#ff4757' : '#00ff88', padding: '3px 7px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700 }}>
                            {d.status}
                          </span>
                        </td>
                        <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.75rem' }}>{d.matchId.slice(-10)}</td>
                        <td style={{ ...S.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.reason}</td>
                        <td style={S.td}>
                          {d.screenshot_url ? <a href={d.screenshot_url} target="_blank" rel="noreferrer" style={{ color: '#00c3ff', fontSize: '0.75rem' }}>📷 Ver</a> : '—'}
                        </td>
                        <td style={S.td}>
                          {d.status === 'PENDING' && (
                            <button style={S.sm('#ff4757')} onClick={() => setResolveDispModal(d)}>⚖️ RESOLVER</button>
                          )}
                          {d.status !== 'PENDING' && <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>CERRADA</span>}
                        </td>
                      </tr>
                    ))}
                    {disputas.length === 0 && (
                      <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#8b949e', padding: 24 }}>Sin disputas clásicas.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PRO */}
            <div style={S.card}>
              <h2 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.9rem', marginBottom: 14 }}>🌍 DISPUTAS — LIGAS PRO</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['ESTADO', 'JUGADORES', 'MOTIVO', 'FOTO', 'ACCIONES'].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {proMatches.filter(m => m.status === 'dispute').map(m => (
                      <tr key={m.id}>
                        <td style={S.td}>
                          <span style={{ background: '#ffd70030', color: '#ffd700', padding: '3px 7px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700 }}>DISPUTA</span>
                        </td>
                        <td style={S.td}>{m.player1_team} <span style={{ color: '#ff4757' }}>vs</span> {m.player2_team}</td>
                        <td style={{ ...S.td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.dispute_reason ?? '—'}</td>
                        <td style={S.td}>
                          {m.photo_url ? <a href={m.photo_url} target="_blank" rel="noreferrer" style={{ color: '#00c3ff', fontSize: '0.75rem' }}>📷 Ver</a> : '—'}
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button style={S.sm('#ffd700', 'black')} onClick={() => { setProForceModal(m); setProWinnerSide('p1'); setProScore1('1'); setProScore2('0'); }}>⚡ FORZAR</button>
                            <button style={S.sm('#00ff88')} onClick={() => resolveProMatch(m, 'p1')}>✅ P1</button>
                            <button style={S.sm('#00c3ff')} onClick={() => resolveProMatch(m, 'p2')}>✅ P2</button>
                            <button style={S.sm('#8b949e')} onClick={() => resolveProMatch(m, 'annul')}>❌ ANULAR</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {proMatches.filter(m => m.status === 'dispute').length === 0 && (
                      <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#8b949e', padding: 24 }}>Sin disputas PRO.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ TORNEOS ══════════════════════ */}
        {tab === 'torneos' && (
          <div style={S.card}>
            <h2 style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.9rem', marginBottom: 14 }}>🏆 TORNEOS CLÁSICOS</h2>
            <input
              placeholder="Buscar por juego, modo, tier, país..."
              value={busR}
              onChange={e => setBusR(e.target.value)}
              style={{ ...S.inp, maxWidth: 380 }}
            />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['SALA', 'JUEGO', 'TIER', 'JUGADORES', 'ESTADO', 'PAÍS', 'ACCIONES'].map(h => <th key={h} style={S.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rooms
                    .filter(r => {
                      const q = busR.toLowerCase();
                      return !q || [r.game, r.mode, r.tier, r.region, r.country].some(v => (v || '').toLowerCase().includes(q));
                    })
                    .map(r => (
                      <tr key={r.id}>
                        <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.75rem' }}>#{r.id.slice(-5).toUpperCase()}</td>
                        <td style={S.td}>{GL[r.game ?? ''] ?? r.game} · {ML[r.mode ?? ''] ?? r.mode}</td>
                        <td style={S.td}>
                          <span style={{ background: r.tier === 'FREE' ? '#00d4ff22' : r.tier === 'RECREATIVO' ? '#00ff8820' : r.tier === 'COMPETITIVO' ? '#ffd70020' : '#ff475720', color: r.tier === 'FREE' ? '#00d4ff' : r.tier === 'RECREATIVO' ? '#00ff88' : r.tier === 'COMPETITIVO' ? '#ffd700' : '#ff4757', padding: '2px 6px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700 }}>
                            {r.tier}
                          </span>
                        </td>
                        <td style={S.td}>{r.players?.length ?? 0} / {r.capacity}</td>
                        <td style={S.td}>
                          <span style={{ color: r.status === 'OPEN' ? '#00ff88' : r.status === 'ACTIVE' ? '#ffd700' : '#8b949e', fontSize: '0.75rem' }}>{r.status}</span>
                        </td>
                        <td style={S.td}>{r.country ?? '—'}</td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(r.status === 'ACTIVE') && (
                              <button style={S.sm('#00c3ff')} onClick={() => openForceModal(r.id)}>⚡ Forzar</button>
                            )}
                            <button style={S.sm('#ff4757')} onClick={() => deleteRoom(r.id)}>🗑️ Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════ LIGAS PRO ═══════════════════ */}
        {tab === 'ligas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <input
              placeholder="Buscar liga..."
              value={busL}
              onChange={e => setBusL(e.target.value)}
              style={{ ...S.inp, maxWidth: 380 }}
            />

            {/* Partidos requiriendo atención */}
            <div style={S.card}>
              <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.85rem', marginBottom: 14 }}>⚡ PARTIDOS QUE REQUIEREN ATENCIÓN</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['ESTADO', 'EQUIPOS', 'LIGA', 'JORNADA', 'FOTO', 'ACCIONES'].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {proMatches
                      .filter(m => {
                        const q = busL.toLowerCase();
                        return !q || m.player1_team.toLowerCase().includes(q) || m.player2_team.toLowerCase().includes(q);
                      })
                      .map(m => {
                        const liga = ligas.find(l => l.id === m.league_id);
                        return (
                          <tr key={m.id}>
                            <td style={S.td}>
                              <span style={{
                                background: m.status === 'dispute' ? '#ff475730' : m.status === 'validating' ? '#ffd70030' : '#00c3ff20',
                                color: m.status === 'dispute' ? '#ff4757' : m.status === 'validating' ? '#ffd700' : '#00c3ff',
                                padding: '3px 7px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700,
                              }}>
                                {m.status.toUpperCase()}
                              </span>
                            </td>
                            <td style={S.td}>{m.player1_team} <span style={{ color: '#8b949e' }}>vs</span> {m.player2_team}</td>
                            <td style={{ ...S.td, fontSize: '0.75rem', color: '#8b949e' }}>{liga?.name ?? m.league_id.slice(-8)}</td>
                            <td style={S.td}>{m.round}</td>
                            <td style={S.td}>
                              {m.photo_url ? <a href={m.photo_url} target="_blank" rel="noreferrer" style={{ color: '#00c3ff', fontSize: '0.75rem' }}>📷</a> : '—'}
                            </td>
                            <td style={S.td}>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <button style={S.sm('#6e40c9')} onClick={() => { setProForceModal(m); setProWinnerSide('p1'); setProScore1('1'); setProScore2('0'); }}>⚡ Forzar</button>
                                {m.status === 'dispute' && (
                                  <>
                                    <button style={S.sm('#00ff88')} onClick={() => resolveProMatch(m, 'p1')}>P1 ✅</button>
                                    <button style={S.sm('#00c3ff')} onClick={() => resolveProMatch(m, 'p2')}>P2 ✅</button>
                                    <button style={S.sm('#8b949e')} onClick={() => resolveProMatch(m, 'annul')}>↩ Anular</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {proMatches.length === 0 && (
                      <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#8b949e', padding: 24 }}>Sin partidos pendientes.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ligas overview */}
            <div style={S.card}>
              <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#00c3ff', fontSize: '0.85rem', marginBottom: 14 }}>📋 TODAS LAS LIGAS</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['LIGA', 'JUEGO', 'DIV', 'ESTADO', 'JORNADA', 'JUGADORES'].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ligas
                      .filter(l => !busL || l.name.toLowerCase().includes(busL.toLowerCase()))
                      .map(l => (
                        <tr key={l.id}>
                          <td style={{ ...S.td, fontWeight: 600 }}>{l.name}</td>
                          <td style={S.td}>{GL[l.game ?? ''] ?? l.game}</td>
                          <td style={S.td}>{l.division ?? '—'}</td>
                          <td style={S.td}>
                            <span style={{ color: l.status === 'activa' ? '#00ff88' : l.status === 'playoffs' ? '#ffd700' : '#8b949e', fontSize: '0.75rem' }}>
                              {l.status}
                            </span>
                          </td>
                          <td style={S.td}>{l.current_round} / {l.total_rounds}</td>
                          <td style={S.td}>{l.current_players}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ JUGADORES ═════════════════════ */}
        {tab === 'jugadores' && (
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ fontFamily: "'Orbitron',sans-serif", color: '#6e40c9', fontSize: '0.9rem' }}>👥 JUGADORES</h2>
              <div style={{ background: '#ff475720', border: '1px solid #ff4757', borderRadius: 6, padding: '6px 12px', fontSize: '0.72rem', color: '#ff4757' }}>
                🚫 Vista de solo lectura para LFA Coins — solo el CEO puede modificarlas
              </div>
            </div>
            <input
              placeholder="Buscar por nombre, región, país..."
              value={busJ}
              onChange={e => setBusJ(e.target.value)}
              style={{ ...S.inp, maxWidth: 380 }}
            />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['JUGADOR', 'COINS (solo vista)', 'FAIR PLAY', 'TÍTULOS', 'REGIÓN', 'ROL', 'ACCIONES'].map(h => <th key={h} style={S.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {jugadores
                    .filter(j => j.rol !== 'bot')
                    .filter(j => {
                      const q = busJ.toLowerCase();
                      return !q || (j.nombre?.toLowerCase().includes(q) || j.region?.toLowerCase().includes(q) || j.pais_codigo?.toLowerCase().includes(q));
                    })
                    .slice(0, 100)
                    .map(j => (
                      <tr key={j.id} style={{ opacity: j.baneado ? 0.5 : 1 }}>
                        <td style={S.td}>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '0.82rem' }}>{j.nombre ?? '—'}</p>
                            <p style={{ color: '#8b949e', fontSize: '0.68rem', fontFamily: 'monospace' }}>{j.id.slice(0, 12)}...</p>
                          </div>
                        </td>
                        <td style={{ ...S.td, color: '#8b949e', fontStyle: 'italic' }}>
                          🔒 {(j.number ?? 0).toLocaleString()}
                        </td>
                        <td style={S.td}>
                          <span style={{ color: (j.fair_play ?? 100) >= 70 ? '#00ff88' : (j.fair_play ?? 100) >= 40 ? '#ffd700' : '#ff4757', fontWeight: 700 }}>
                            {j.fair_play ?? 100}%
                          </span>
                        </td>
                        <td style={S.td}>{j.titulos ?? 0} 🏆</td>
                        <td style={S.td}>{j.region ?? '—'}</td>
                        <td style={S.td}>
                          <span style={{ color: j.rol === 'mod' ? '#6e40c9' : j.rol === 'soporte' ? '#00c3ff' : '#8b949e', fontSize: '0.72rem' }}>
                            {j.rol ?? 'jugador'}
                          </span>
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button style={S.sm('#ff6b00')} onClick={() => { setWarnModal({ uid: j.id, nombre: j.nombre ?? j.id }); }}>
                              ⚠️ Advertir
                            </button>
                            <a href={`/jugador/${j.id}`} target="_blank" rel="noreferrer" style={{ ...S.sm('#1c2028'), textDecoration: 'none' }}>
                              👁️ Perfil
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════ CREAR TORNEO ════════════════ */}
        {tab === 'crear' && (
          <div style={{ maxWidth: 600 }}>
            <div style={S.card}>
              <h2 style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.9rem', marginBottom: 20 }}>🌎 CREAR TORNEO POR PAÍS</h2>
              <p style={{ color: '#8b949e', fontSize: '0.8rem', marginBottom: 20 }}>
                Crea torneos con restricción de país. Los moderadores pueden crear torneos FREE y RECREATIVO.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ color: '#8b949e', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>JUEGO</label>
                  <select value={crGame} onChange={e => { setCrGame(e.target.value); setCrMode(e.target.value === 'FC26' ? 'GENERAL_95' : 'DREAM_TEAM'); }} style={S.inp}>
                    <option value="FC26">⚽ EA SPORTS FC 26</option>
                    <option value="EFOOTBALL">⚽ eFootball</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: '#8b949e', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>MODO</label>
                  <select value={crMode} onChange={e => setCrMode(e.target.value)} style={S.inp}>
                    {crGame === 'FC26'
                      ? <><option value="GENERAL_95">Global 95</option><option value="ULTIMATE">Ultimate Team</option></>
                      : <><option value="DREAM_TEAM">Dream Team</option><option value="GENUINOS">Equipos Genuinos</option></>
                    }
                  </select>
                </div>
                <div>
                  <label style={{ color: '#8b949e', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>REGIÓN</label>
                  <select value={crRegion} onChange={e => setCrRegion(e.target.value)} style={S.inp}>
                    <option value="LATAM_SUR">LATAM Sur</option>
                    <option value="LATAM_NORTE">LATAM Norte</option>
                    <option value="GLOBAL">Global</option>
                    <option value="AMERICA">América</option>
                    <option value="EUROPA">Europa</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: '#8b949e', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>TIER</label>
                  <select value={crTier} onChange={e => setCrTier(e.target.value)} style={S.inp}>
                    <option value="FREE">🆓 FREE (gratis)</option>
                    <option value="RECREATIVO">🟢 RECREATIVO (con fee)</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: '#8b949e', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>CAPACIDAD</label>
                  <select value={crCap} onChange={e => setCrCap(e.target.value)} style={S.inp}>
                    {[2, 4, 6, 8, 12, 16, 32].map(n => <option key={n} value={n}>{n} jugadores</option>)}
                  </select>
                </div>
                {crTier !== 'FREE' && (
                  <div>
                    <label style={{ color: '#8b949e', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>ENTRADA (LFA Coins)</label>
                    <select value={crFee} onChange={e => setCrFee(e.target.value)} style={S.inp}>
                      {[500, 750, 1000].map(f => <option key={f} value={f}>{f.toLocaleString()} LFC</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* País selector */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ color: '#8b949e', fontSize: '0.72rem', display: 'block', marginBottom: 6 }}>
                  🌍 PAÍS ESPECÍFICO <span style={{ color: '#00ff88' }}>(deja vacío = sin restricción)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.4rem' }}>
                    {PAISES.find(p => p.code === crCountry)?.flag ?? '🌐'}
                  </span>
                  <select value={crCountry} onChange={e => setCrCountry(e.target.value)} style={{ ...S.inp, marginBottom: 0, flex: 1 }}>
                    <option value="">— Sin restricción (todos los países) —</option>
                    {PAISES.map(p => (
                      <option key={p.code} value={p.code}>{p.flag} {p.code}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nombre opcional */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ color: '#8b949e', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>NOMBRE DEL TORNEO (opcional)</label>
                <input
                  placeholder="Ej: Copa Argentina Agosto 2026..."
                  value={crName}
                  onChange={e => setCrName(e.target.value)}
                  style={S.inp}
                />
              </div>

              {/* Preview */}
              <div style={{ background: '#0b0e14', border: '1px solid #30363d', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <p style={{ color: '#8b949e', fontSize: '0.72rem', marginBottom: 6 }}>PREVIEW:</p>
                <p style={{ color: 'white', fontSize: '0.85rem' }}>
                  {crName || `Torneo ${GL[crGame] ?? crGame}`} &nbsp;·&nbsp; {ML[crMode] ?? crMode} &nbsp;·&nbsp; {parseInt(crCap)} jugadores
                </p>
                <p style={{ color: '#8b949e', fontSize: '0.78rem', marginTop: 4 }}>
                  {crTier === 'FREE' ? '🆓 Gratis' : `🪙 ${parseInt(crFee).toLocaleString()} LFC entrada`}
                  &nbsp;·&nbsp;
                  {crCountry
                    ? `${PAISES.find(p => p.code === crCountry)?.flag ?? ''} Solo ${crCountry}`
                    : '🌐 Todos los países'}
                </p>
              </div>

              <button
                style={{ ...S.btn('#00ff88'), width: '100%', justifyContent: 'center', padding: '12px 20px' }}
                onClick={crearTorneo}
                disabled={crLoading}
              >
                {crLoading ? '⏳ Creando...' : '🌎 CREAR TORNEO'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
