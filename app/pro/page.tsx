'use client';

import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, getDoc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';
import SiteFooter from '@/app/_components/SiteFooter';
import Link from 'next/link';

/* ── Types ─────────────────────────────────────────────────────────────── */
interface Equipo {
  id:              string;
  nombre:          string;
  logo_url:        string;
  pais:            string;
  juego:           'FC26' | 'EFOOTBALL';
  plataforma:      string;
  uid:             string;
  capitan:         string;
  game_id:         string;
  whatsapp:        string;
  pts:             number;
  pg:              number;
  pe:              number;
  pp:              number;
  gf:              number;
  gc:              number;
  grupo:           string;
  creado_at?:      { toMillis: () => number } | null;
}

interface Partido {
  id:              string;
  equipo_local_id: string;
  equipo_visit_id: string;
  local_nombre:    string;
  visit_nombre:    string;
  local_logo:      string;
  visit_logo:      string;
  goles_local:     number | null;
  goles_visit:     number | null;
  status:          'PENDIENTE' | 'REPORTE_LOCAL' | 'REPORTE_VISIT' | 'VALIDADO' | 'DISPUTA';
  screenshot_url?: string;
  juego:           string;
  ronda:           'GRUPO' | 'PLAYOFF_IDA' | 'PLAYOFF_VUELTA';
  grupo:           string;
  creado_at?:      { toMillis: () => number } | null;
}

interface ChatMsg {
  id:        string;
  uid:       string;
  nombre:    string;
  logo_url?: string;
  texto:     string;
  ts?:       { toMillis: () => number } | null;
}

const PAISES = [
  'Argentina','Uruguay','Brasil','Chile','Colombia','Peru','Venezuela',
  'Ecuador','Bolivia','Paraguay','Mexico','España','Estados Unidos','Otro',
];
const GRUPOS = ['A','B','C','D'];

/* ── Flag helper ───────────────────────────────────────────────────────── */
const COUNTRY_CODE: Record<string,string> = {
  Argentina:'ar', Uruguay:'uy', Brasil:'br', Chile:'cl',
  Colombia:'co', Peru:'pe', Venezuela:'ve', Ecuador:'ec',
  Bolivia:'bo', Paraguay:'py', Mexico:'mx', España:'es',
  'Estados Unidos':'us', Otro:'un',
};
function flagUrl(pais: string) {
  const code = COUNTRY_CODE[pais] ?? 'un';
  return `https://flagcdn.com/20x15/${code}.png`;
}

/* ═══════════════════════════════════════════════════════════════════════ */
export default function ProPage() {
  const { lang, setLang, t } = useLang();

  // auth
  const [uid,      setUid]      = useState<string | null>(null);
  const [userData, setUserData] = useState<{ nombre?: string; ea_id?: string; konami_id?: string; } | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // tabs
  const [tab, setTab] = useState<'info' | 'ranking' | 'fixture' | 'chat'>('info');
  const [juegoFilter, setJuegoFilter] = useState<'FC26' | 'EFOOTBALL'>('FC26');

  // data
  const [equipos, setEquipos]   = useState<Equipo[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [miEquipo, setMiEquipo] = useState<Equipo | null>(null);

  // inscripcion
  const [showInscripcion, setShowInscripcion] = useState(false);
  const [form, setForm] = useState({
    nombre: '', logo_url: '', pais: 'Argentina',
    juego: 'FC26' as 'FC26' | 'EFOOTBALL',
    plataforma: 'PS5',
    game_id: '', whatsapp: '',
  });
  const [inscribiendo, setInscribiendo] = useState(false);
  const [inscripcionMsg, setInscripcionMsg] = useState('');

  // reporte
  const [showReporte, setShowReporte] = useState(false);
  const [reportePartidoId, setReportePartidoId] = useState('');
  const [gLocal, setGLocal] = useState('');
  const [gVisit, setGVisit] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [reportando, setReportando] = useState(false);
  const [reporteMsg, setReporteMsg] = useState('');

  // validar
  const [validando, setValidando] = useState<string | null>(null);

  // chat
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  /* ── Auth ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists()) setUserData(snap.data() as typeof userData);
      } else {
        setUid(null);
        setUserData(null);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  /* ── Equipos ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, 'liga_pro_equipos'), orderBy('pts', 'desc'));
    return onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Equipo));
      setEquipos(data);
      if (uid) setMiEquipo(data.find(e => e.uid === uid) ?? null);
    });
  }, [uid]);

  /* ── Partidos ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, 'liga_pro_partidos'), orderBy('creado_at', 'desc'));
    return onSnapshot(q, snap => {
      setPartidos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Partido)));
    });
  }, []);

  /* ── Chat ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (tab !== 'chat') return;
    const q = query(collection(db, 'liga_pro_mensajes'), orderBy('ts', 'asc'));
    return onSnapshot(q, snap => {
      setChatMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)));
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
  }, [tab]);

  /* ── Inscripcion ──────────────────────────────────────────────────── */
  async function inscribir() {
    if (!uid) return;
    if (!form.nombre.trim() || !form.game_id.trim() || !form.whatsapp.trim()) {
      setInscripcionMsg('⚠️ Completá todos los campos obligatorios.');
      return;
    }
    setInscribiendo(true);
    setInscripcionMsg('');
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/inscribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setInscripcionMsg(`❌ ${data.error}`); return; }
      setInscripcionMsg('✅ ¡Inscripción exitosa! Ya sos parte de la Liga LFA.');
      setShowInscripcion(false);
    } catch {
      setInscripcionMsg('❌ Error de red. Intentá de nuevo.');
    } finally {
      setInscribiendo(false);
    }
  }

  /* ── Reportar resultado ───────────────────────────────────────────── */
  async function reportar() {
    if (!uid || !reportePartidoId) return;
    if (gLocal === '' || gVisit === '') { setReporteMsg('⚠️ Ingresá el marcador.'); return; }
    setReportando(true);
    setReporteMsg('');
    try {
      let screenshotUrl = '';
      if (screenshot) {
        const token = await auth.currentUser!.getIdToken();
        const fd = new FormData();
        fd.append('file', screenshot);
        fd.append('partidoId', reportePartidoId);
        const upRes = await fetch('/api/pro/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const upData = await upRes.json();
        if (upRes.ok) screenshotUrl = upData.url;
      }
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/reportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partidoId: reportePartidoId, goles_local: Number(gLocal), goles_visit: Number(gVisit), screenshot_url: screenshotUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setReporteMsg(`❌ ${data.error}`); return; }
      setReporteMsg('✅ Resultado reportado. El rival debe validar.');
      setShowReporte(false);
      setGLocal(''); setGVisit(''); setScreenshot(null); setReportePartidoId('');
    } catch {
      setReporteMsg('❌ Error de red.');
    } finally {
      setReportando(false);
    }
  }

  /* ── Validar resultado ────────────────────────────────────────────── */
  async function validar(partidoId: string) {
    setValidando(partidoId);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partidoId }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error);
    } catch {
      alert('Error de red.');
    } finally {
      setValidando(null);
    }
  }

  /* ── Chat send ────────────────────────────────────────────────────── */
  async function sendChat() {
    if (!uid || !chatInput.trim() || sendingChat) return;
    setSendingChat(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      await fetch('/api/pro/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ texto: chatInput.trim() }),
      });
      setChatInput('');
    } catch { /* silent */ } finally {
      setSendingChat(false);
    }
  }

  /* ── Derived data ─────────────────────────────────────────────────── */
  const equiposFiltrados = equipos.filter(e => e.juego === juegoFilter);
  const partidosFiltrados = partidos.filter(p => p.juego === juegoFilter);
  const grupoEquipos = (g: string) => equiposFiltrados.filter(e => e.grupo === g);

  /* ── Auto-fill game_id from profile ──────────────────────────────── */
  useEffect(() => {
    if (!userData) return;
    const id = form.juego === 'FC26' ? (userData.ea_id ?? '') : (userData.konami_id ?? '');
    setForm(f => ({ ...f, game_id: id }));
  }, [form.juego, userData]);

  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <div style={{ margin: 0, fontFamily: 'Roboto, sans-serif', background: '#0b0e14', color: 'white', minHeight: '100vh' }}>
        <LangDropdown lang={lang} setLang={setLang} />

        {/* ── HERO ───────────────────────────────────────────────────── */}
        <section style={{ padding: 'clamp(70px,10vw,110px) 20px clamp(40px,6vw,60px)', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,255,136,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 30, padding: '4px 16px', fontSize: '0.65rem', color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, letterSpacing: 2, marginBottom: 20 }}>
            🆓 COMPLETAMENTE GRATUITA · SOMOS LFA
          </div>

          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.8rem,6vw,3.5rem)', fontWeight: 900, color: 'white', lineHeight: 1.1, letterSpacing: 'clamp(2px,1vw,4px)', marginBottom: 12 }}>
            LIGA <span style={{ color: '#00ff88' }}>LFA</span> 1vs1
          </div>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(0.7rem,2vw,0.95rem)', color: '#ffd700', letterSpacing: 3, marginBottom: 20 }}>
            ⭐ eFOOTBALL · EA SPORTS FC 26 · FASE DE GRUPOS + PLAYOFFS
          </div>
          <p style={{ color: '#8b949e', fontSize: '0.88rem', maxWidth: 580, lineHeight: 1.7, marginBottom: 32 }}>
            Competí en la Liga oficial de SomosLFA. <strong style={{ color: '#cdd9e5' }}>Fase de grupos</strong> con partidos de ida y vuelta,
            <strong style={{ color: '#cdd9e5' }}> playoff a doble partido</strong> más penales si se da. Modo <strong style={{ color: '#ffd700' }}>ULTIMATE / DREAM TEAM</strong>,
            plantilla libre. PC, PlayStation y Xbox. ¡Entrá y disfrutá!
          </p>

          {/* CTA */}
          {authReady && (
            miEquipo ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 12, padding: '10px 24px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', color: '#00ff88', fontWeight: 900 }}>
                  ✅ YA ESTÁS INSCRIPTO — {miEquipo.nombre}
                </div>
                <button onClick={() => setTab('fixture')} style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', borderRadius: 10, padding: '8px 20px', cursor: 'pointer', fontSize: '0.75rem', fontFamily: "'Orbitron',sans-serif" }}>
                  VER MIS PARTIDOS →
                </button>
              </div>
            ) : uid ? (
              <button onClick={() => setShowInscripcion(true)} style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.88rem', background: 'linear-gradient(135deg,#00ff88,#00a859)', color: '#0b0e14', border: 'none', borderRadius: 12, padding: '14px 36px', cursor: 'pointer', letterSpacing: 1, boxShadow: '0 0 24px rgba(0,255,136,0.35)' }}>
                🏆 INSCRIBIRME A LA LIGA
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Link href="/auth" style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.88rem', background: 'linear-gradient(135deg,#00ff88,#00a859)', color: '#0b0e14', textDecoration: 'none', borderRadius: 12, padding: '14px 36px', boxShadow: '0 0 24px rgba(0,255,136,0.35)' }}>
                  🏆 CREAR CUENTA Y UNIRSE
                </Link>
                <div style={{ color: '#4a5568', fontSize: '0.72rem' }}>¿Ya tenés cuenta? <Link href="/auth" style={{ color: '#00ff88' }}>Iniciá sesión</Link></div>
              </div>
            )
          )}

          {/* Plataformas */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 28 }}>
            {['🖥️ PC', '🎮 PlayStation', '🎮 Xbox'].map(p => (
              <span key={p} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 20, padding: '4px 14px', fontSize: '0.65rem', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>{p}</span>
            ))}
          </div>
        </section>

        {/* ── FORMATO RÁPIDO ─────────────────────────────────────────── */}
        <section style={{ background: '#0d1117', borderTop: '1px solid #1c2028', borderBottom: '1px solid #1c2028', padding: 'clamp(24px,4vw,40px) 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16 }}>
            {[
              { icon: '🏅', title: 'FASE DE GRUPOS', desc: 'Todos contra todos. Ida y vuelta.' },
              { icon: '🔥', title: 'PLAYOFFS', desc: 'Eliminación directa. Ida y vuelta + penales.' },
              { icon: '⚽', title: 'MODO', desc: 'ULTIMATE (FC26) · DREAM TEAM (eFOOTBALL)' },
              { icon: '📋', title: 'PLANTILLA', desc: 'Libre — usá cualquier equipo.' },
              { icon: '📸', title: 'RESULTADOS', desc: 'Subí la foto del marcador. El rival valida.' },
              { icon: '💬', title: 'COORDINACIÓN', desc: 'Chat LFA o WhatsApp directo con el rival.' },
            ].map(c => (
              <div key={c.title} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: '18px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.6rem', marginBottom: 8 }}>{c.icon}</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 900, color: '#00ff88', letterSpacing: 1, marginBottom: 6 }}>{c.title}</div>
                <div style={{ color: '#8b949e', fontSize: '0.72rem', lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── TABS ───────────────────────────────────────────────────── */}
        <section style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 60px' }}>

          {/* Juego selector */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
            {(['FC26', 'EFOOTBALL'] as const).map(j => (
              <button key={j} onClick={() => setJuegoFilter(j)} style={{
                fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.68rem', letterSpacing: 1,
                padding: '7px 20px', borderRadius: 30, cursor: 'pointer', border: `1px solid ${juegoFilter === j ? (j === 'FC26' ? '#009ee3' : '#ffd700') : '#30363d'}`,
                background: juegoFilter === j ? (j === 'FC26' ? 'rgba(0,158,227,0.1)' : 'rgba(255,215,0,0.1)') : 'transparent',
                color: juegoFilter === j ? (j === 'FC26' ? '#009ee3' : '#ffd700') : '#4a5568', transition: 'all 0.2s',
              }}>{j === 'FC26' ? '⚽ EA FC 26' : '⭐ eFOOTBALL'}</button>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #1c2028', marginBottom: 24, overflowX: 'auto' }}>
            {(['info','ranking','fixture','chat'] as const).map(tb => (
              <button key={tb} onClick={() => setTab(tb)} style={{
                fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.65rem', letterSpacing: 1,
                padding: '10px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: tab === tb ? '#00ff88' : '#4a5568',
                borderBottom: `2px solid ${tab === tb ? '#00ff88' : 'transparent'}`,
                transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}>
                {tb === 'info' ? '📖 INFO' : tb === 'ranking' ? '🏆 RANKING' : tb === 'fixture' ? '📅 FIXTURE' : '💬 CHAT'}
              </button>
            ))}
          </div>

          {/* ── TAB: INFO ─────────────────────────────────────────────── */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <InfoBox title="🏆 CÓMO FUNCIONA LA LIGA" color="#00ff88">
                <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 2, color: '#cdd9e5', fontSize: '0.83rem' }}>
                  <li>Te inscribís gratis — completás tu equipo (nombre, logo, país, ID de juego).</li>
                  <li>Se forman grupos de 4 equipos. Jugás contra todos, ida y vuelta.</li>
                  <li>Los 2 mejores de cada grupo pasan a Playoffs.</li>
                  <li>Playoffs: Eliminación directa, ida y vuelta. Si hay empate global → <strong>penales</strong>.</li>
                  <li>Los jugadores coordinan horario por chat LFA o WhatsApp.</li>
                  <li>El que tenga la captura la sube. El rival valida. El ranking se actualiza solo.</li>
                </ol>
              </InfoBox>

              <InfoBox title="📋 REGLAMENTO BÁSICO" color="#ffd700">
                <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 2, color: '#cdd9e5', fontSize: '0.83rem' }}>
                  <li>Modo: <strong style={{ color: '#ffd700' }}>ULTIMATE (FC26)</strong> / <strong style={{ color: '#ffd700' }}>DREAM TEAM (eFOOTBALL)</strong></li>
                  <li>Plantilla <strong>libre</strong> — cualquier equipo.</li>
                  <li>Partidos de liga: ida y vuelta (dos partidas por choque).</li>
                  <li>Playoffs: La sala la crea quien quiera; el rival se une con la contraseña acordada.</li>
                  <li>Si hay disputa: contactar a LFA por el chat de la liga.</li>
                  <li>Fair play obligatorio. El irrespeto lleva a descalificación.</li>
                </ul>
              </InfoBox>

              <InfoBox title="📸 REPORTAR RESULTADOS" color="#009ee3">
                <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 2, color: '#cdd9e5', fontSize: '0.83rem' }}>
                  <li>Cualquiera de los dos jugadores puede reportar el marcador.</li>
                  <li>Subís la captura del marcador final y confirmás el resultado.</li>
                  <li>El rival tiene que hacer click en <strong style={{ color: '#00ff88' }}>VALIDAR</strong> para confirmar.</li>
                  <li>Una vez validado, el ranking se actualiza automáticamente.</li>
                  <li>Si el rival no valida en 24h, el resultado se acepta automáticamente.</li>
                </ul>
              </InfoBox>

              <InfoBox title="🆓 LIGAS GRATUITAS — DISFRUTÁ SOMOS LFA" color="#a371f7">
                <p style={{ margin: 0, color: '#cdd9e5', fontSize: '0.84rem', lineHeight: 1.8 }}>
                  Las Ligas LFA son <strong style={{ color: '#a371f7' }}>100% gratuitas</strong>. No necesitás coins. No necesitás pagar nada.
                  Solo pasión por el fútbol virtual y ganas de competir. ¡Somos una comunidad!
                  El objetivo es que disfrutes, mejores y te midás contra jugadores de toda Latinoamérica y el mundo.
                  <br /><br />
                  <strong style={{ color: '#00ff88' }}>¿Tenés dudas? Escribinos en el chat de la liga. Somos LFA 💚</strong>
                </p>
              </InfoBox>
            </div>
          )}

          {/* ── TAB: RANKING ──────────────────────────────────────────── */}
          {tab === 'ranking' && (
            <div>
              {GRUPOS.map(g => {
                const lista = grupoEquipos(g);
                if (lista.length === 0) return null;
                return (
                  <div key={g} style={{ marginBottom: 28 }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, color: '#00ff88', letterSpacing: 2, marginBottom: 12, borderLeft: '3px solid #00ff88', paddingLeft: 10 }}>
                      GRUPO {g}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #21262d' }}>
                            {['#','EQUIPO','PAÍS','PTS','PJ','PG','PE','PP','GF','GC','DIF'].map(h => (
                              <th key={h} style={{ padding: '8px 6px', textAlign: h === 'EQUIPO' ? 'left' : 'center', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", fontSize: '0.58rem', letterSpacing: 1, fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map((eq, i) => {
                            const pj = eq.pg + eq.pe + eq.pp;
                            const dif = eq.gf - eq.gc;
                            const isPase = i < 2;
                            return (
                              <tr key={eq.id} style={{ borderBottom: '1px solid #161b22', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                                <td style={{ padding: '10px 6px', textAlign: 'center', color: isPase ? '#00ff88' : '#4a5568', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.78rem' }}>{i + 1}</td>
                                <td style={{ padding: '10px 6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {eq.logo_url
                                      ? <img src={eq.logo_url} alt={eq.nombre} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', border: '1px solid #30363d' }} />
                                      : <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>⚽</div>
                                    }
                                    <span style={{ color: '#e6edf3', fontWeight: 700, whiteSpace: 'nowrap' }}>{eq.nombre}</span>
                                    {isPase && <span style={{ fontSize: '0.55rem', background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff8840', color: '#00ff88', borderRadius: 6, padding: '1px 5px', fontFamily: "'Orbitron',sans-serif" }}>PLAYOFFS</span>}
                                  </div>
                                </td>
                                <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                                  <img src={flagUrl(eq.pais)} alt={eq.pais} style={{ width: 20, height: 15, display: 'inline-block' }} />
                                </td>
                                <td style={{ padding: '10px 6px', textAlign: 'center', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#ffd700', fontSize: '0.88rem' }}>{eq.pts}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'center', color: '#8b949e' }}>{pj}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'center', color: '#00ff88' }}>{eq.pg}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'center', color: '#8b949e' }}>{eq.pe}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'center', color: '#ff4757' }}>{eq.pp}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'center', color: '#e6edf3' }}>{eq.gf}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'center', color: '#e6edf3' }}>{eq.gc}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'center', color: dif > 0 ? '#00ff88' : dif < 0 ? '#ff4757' : '#8b949e', fontWeight: 700 }}>{dif > 0 ? `+${dif}` : dif}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {equiposFiltrados.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4a5568' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>🏆</div>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', letterSpacing: 2 }}>ESPERANDO INSCRIPCIONES</div>
                  <div style={{ fontSize: '0.8rem', marginTop: 8 }}>Sé el primero en unirte a la Liga {juegoFilter === 'FC26' ? 'FC 26' : 'eFOOTBALL'}.</div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: FIXTURE ──────────────────────────────────────────── */}
          {tab === 'fixture' && (
            <div>
              {/* Si tengo equipo y hay partidos míos pendientes → mostrar acción */}
              {miEquipo && (() => {
                const misPendientes = partidosFiltrados.filter(p =>
                  (p.equipo_local_id === miEquipo.id || p.equipo_visit_id === miEquipo.id) &&
                  (p.status === 'PENDIENTE' || p.status === 'REPORTE_LOCAL' || p.status === 'REPORTE_VISIT')
                );
                const misParaValidar = misPendientes.filter(p => {
                  if (p.status === 'REPORTE_LOCAL' && p.equipo_visit_id === miEquipo.id) return true;
                  if (p.status === 'REPORTE_VISIT' && p.equipo_local_id === miEquipo.id) return true;
                  return false;
                });
                return (
                  <>
                    {misParaValidar.length > 0 && (
                      <div style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 12, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                        <div>
                          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', color: '#ffd700', fontWeight: 900 }}>TENÉS RESULTADOS PARA VALIDAR</div>
                          <div style={{ fontSize: '0.75rem', color: '#8b949e', marginTop: 2 }}>Tu rival reportó el marcador. Hacé click en VALIDAR para confirmar.</div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Botón reportar */}
              {miEquipo && (
                <div style={{ marginBottom: 16 }}>
                  <button onClick={() => setShowReporte(true)} style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.7rem', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', letterSpacing: 1 }}>
                    📸 REPORTAR RESULTADO
                  </button>
                </div>
              )}

              {/* Lista partidos */}
              {(['GRUPO','PLAYOFF_IDA','PLAYOFF_VUELTA'] as const).map(ronda => {
                const ps = partidosFiltrados.filter(p => p.ronda === ronda);
                if (ps.length === 0) return null;
                const rondaLabel = ronda === 'GRUPO' ? '📅 FASE DE GRUPOS' : ronda === 'PLAYOFF_IDA' ? '🔥 PLAYOFFS — IDA' : '🔥 PLAYOFFS — VUELTA';
                return (
                  <div key={ronda} style={{ marginBottom: 28 }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', fontWeight: 900, color: '#ffd700', letterSpacing: 2, marginBottom: 12, borderLeft: '3px solid #ffd700', paddingLeft: 10 }}>{rondaLabel}</div>
                    {ps.map(p => {
                      const miLocal  = miEquipo?.id === p.equipo_local_id;
                      const miVisit  = miEquipo?.id === p.equipo_visit_id;
                      const esMio    = miLocal || miVisit;
                      const paraValidar = miEquipo && (
                        (p.status === 'REPORTE_LOCAL' && miVisit) ||
                        (p.status === 'REPORTE_VISIT' && miLocal)
                      );
                      return (
                        <div key={p.id} style={{
                          background: esMio ? 'rgba(0,255,136,0.04)' : '#0d1117',
                          border: `1px solid ${esMio ? 'rgba(0,255,136,0.2)' : '#21262d'}`,
                          borderRadius: 12, padding: '14px 16px', marginBottom: 10,
                          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                        }}>
                          {/* Local */}
                          <TeamBadge nombre={p.local_nombre} logo={p.local_logo} />
                          {/* Score */}
                          <div style={{ flex: 1, textAlign: 'center', minWidth: 80 }}>
                            {p.status === 'VALIDADO' ? (
                              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.2rem', fontWeight: 900, color: '#e6edf3' }}>
                                {p.goles_local} <span style={{ color: '#4a5568' }}>-</span> {p.goles_visit}
                              </div>
                            ) : (
                              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', color: statusColor(p.status), letterSpacing: 1 }}>{statusLabel(p.status)}</div>
                            )}
                            {p.screenshot_url && (
                              <a href={p.screenshot_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.6rem', color: '#4a5568', display: 'block', marginTop: 4 }}>📸 Ver foto</a>
                            )}
                          </div>
                          {/* Visit */}
                          <TeamBadge nombre={p.visit_nombre} logo={p.visit_logo} reverse />

                          {/* Acciones */}
                          {paraValidar && (
                            <button onClick={() => validar(p.id)} disabled={validando === p.id} style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 900, background: 'rgba(0,255,136,0.12)', border: '1px solid #00ff88', color: '#00ff88', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
                              {validando === p.id ? '...' : '✅ VALIDAR'}
                            </button>
                          )}
                          {/* WhatsApp del rival */}
                          {esMio && (() => {
                            const rivalId = miLocal ? p.equipo_visit_id : p.equipo_local_id;
                            const rival = equipos.find(e => e.id === rivalId);
                            if (!rival?.whatsapp) return null;
                            const msg = encodeURIComponent(`Hola! Soy del equipo ${miEquipo?.nombre} en la Liga LFA 1vs1. ¿Coordinamos el partido?`);
                            return (
                              <a href={`https://wa.me/${rival.whatsapp.replace(/\D/g,'')}?text=${msg}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.65rem', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', borderRadius: 8, padding: '6px 12px', textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, whiteSpace: 'nowrap' }}>
                                📱 WhatsApp
                              </a>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {partidosFiltrados.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4a5568' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>📅</div>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', letterSpacing: 2 }}>SIN PARTIDOS AÚN</div>
                  <div style={{ fontSize: '0.8rem', marginTop: 8 }}>Los partidos se generan cuando hay suficientes inscriptos.</div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: CHAT ─────────────────────────────────────────────── */}
          {tab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: 480 }}>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4, marginBottom: 12 }}>
                {chatMsgs.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.8rem', marginTop: 40 }}>
                    💬 Coordiná con tu rival o hablá con la comunidad LFA
                  </div>
                )}
                {chatMsgs.map(m => (
                  <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', flexShrink: 0, overflow: 'hidden', border: '1px solid #30363d' }}>
                      {m.logo_url ? <img src={m.logo_url} alt={m.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '⚽'}
                    </div>
                    <div style={{ background: '#161b22', borderRadius: '0 10px 10px 10px', padding: '8px 12px', maxWidth: '80%' }}>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.58rem', color: '#00ff88', fontWeight: 900, marginBottom: 3 }}>{m.nombre}</div>
                      <div style={{ color: '#cdd9e5', fontSize: '0.83rem', lineHeight: 1.5 }}>{m.texto}</div>
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
              {uid ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChat()}
                    placeholder="Escribí un mensaje... (Enter para enviar)"
                    maxLength={280}
                    style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '10px 14px', color: 'white', fontSize: '0.83rem', outline: 'none' }}
                  />
                  <button onClick={sendChat} disabled={sendingChat || !chatInput.trim()} style={{ background: '#00a859', border: 'none', color: 'white', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.7rem' }}>
                    {sendingChat ? '...' : '➤'}
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.8rem', padding: 12 }}>
                  <Link href="/auth" style={{ color: '#00ff88' }}>Iniciá sesión</Link> para chatear
                </div>
              )}
            </div>
          )}
        </section>

        <SiteFooter t={t} />
      </div>

      {/* ── MODAL INSCRIPCION ────────────────────────────────────────── */}
      {showInscripcion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowInscripcion(false)}>
          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 16, padding: 28, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.9rem', fontWeight: 900, color: '#00ff88', marginBottom: 20, letterSpacing: 1 }}>🏆 INSCRIPCIÓN A LA LIGA LFA</div>

            {/* Juego */}
            <Label>JUEGO *</Label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['FC26','EFOOTBALL'] as const).map(j => (
                <button key={j} onClick={() => setForm(f => ({ ...f, juego: j }))} style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.68rem', letterSpacing: 1,
                  background: form.juego === j ? (j === 'FC26' ? 'rgba(0,158,227,0.15)' : 'rgba(255,215,0,0.15)') : '#161b22',
                  border: `1px solid ${form.juego === j ? (j === 'FC26' ? '#009ee3' : '#ffd700') : '#30363d'}`,
                  color: form.juego === j ? (j === 'FC26' ? '#009ee3' : '#ffd700') : '#8b949e',
                }}>{j === 'FC26' ? '⚽ EA FC 26' : '⭐ eFOOTBALL'}</button>
              ))}
            </div>

            <Label>NOMBRE DEL EQUIPO *</Label>
            <Input value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Ej: Los Campeones FC" />

            <Label>{form.juego === 'FC26' ? 'EA ID (FC 26) *' : 'KONAMI ID (eFOOTBALL) *'}</Label>
            <Input value={form.game_id} onChange={v => setForm(f => ({ ...f, game_id: v }))} placeholder={form.juego === 'FC26' ? 'Tu EA ID del juego' : 'Tu Konami ID'} />

            <Label>URL DEL LOGO DEL EQUIPO</Label>
            <Input value={form.logo_url} onChange={v => setForm(f => ({ ...f, logo_url: v }))} placeholder="https://... (imagen cuadrada)" />
            {form.logo_url && (
              <img src={form.logo_url} alt="preview" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '1px solid #30363d', marginBottom: 12 }} onError={e => (e.currentTarget.style.display = 'none')} />
            )}

            <Label>PAÍS *</Label>
            <select value={form.pais} onChange={e => setForm(f => ({ ...f, pais: e.target.value }))} style={{ width: '100%', padding: '10px 12px', background: '#161b22', border: '1px solid #30363d', borderRadius: 8, color: 'white', fontSize: '0.83rem', marginBottom: 14, outline: 'none' }}>
              {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <Label>PLATAFORMA *</Label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {['PC','PS5','Xbox'].map(pl => (
                <button key={pl} onClick={() => setForm(f => ({ ...f, plataforma: pl }))} style={{
                  flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.65rem',
                  background: form.plataforma === pl ? 'rgba(0,255,136,0.1)' : '#161b22',
                  border: `1px solid ${form.plataforma === pl ? '#00ff88' : '#30363d'}`,
                  color: form.plataforma === pl ? '#00ff88' : '#8b949e',
                }}>{pl === 'PC' ? '🖥️ PC' : pl === 'PS5' ? '🎮 PS5' : '🎮 Xbox'}</button>
              ))}
            </div>

            <Label>WHATSAPP * (con código de país, ej: +5491123456789)</Label>
            <Input value={form.whatsapp} onChange={v => setForm(f => ({ ...f, whatsapp: v }))} placeholder="+54911..." />

            {inscripcionMsg && <div style={{ fontSize: '0.78rem', color: inscripcionMsg.startsWith('✅') ? '#00ff88' : '#ff4757', marginBottom: 12, textAlign: 'center' }}>{inscripcionMsg}</div>}

            <button onClick={inscribir} disabled={inscribiendo} style={{ width: '100%', padding: '13px 0', background: 'linear-gradient(135deg,#00ff88,#00a859)', color: '#0b0e14', border: 'none', borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.83rem', cursor: 'pointer', letterSpacing: 1, opacity: inscribiendo ? 0.7 : 1 }}>
              {inscribiendo ? 'INSCRIBIENDO...' : '🏆 CONFIRMAR INSCRIPCIÓN'}
            </button>
            <button onClick={() => setShowInscripcion(false)} style={{ width: '100%', padding: '10px 0', background: 'transparent', color: '#4a5568', border: 'none', borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', cursor: 'pointer', marginTop: 8 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL REPORTAR ──────────────────────────────────────────── */}
      {showReporte && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowReporte(false)}>
          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.85rem', fontWeight: 900, color: '#ffd700', marginBottom: 20 }}>📸 REPORTAR RESULTADO</div>

            <Label>PARTIDO *</Label>
            <select
              value={reportePartidoId}
              onChange={e => setReportePartidoId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#161b22', border: '1px solid #30363d', borderRadius: 8, color: 'white', fontSize: '0.78rem', marginBottom: 14, outline: 'none' }}
            >
              <option value="">— Seleccioná un partido —</option>
              {miEquipo && partidosFiltrados
                .filter(p => (p.equipo_local_id === miEquipo.id || p.equipo_visit_id === miEquipo.id) && p.status === 'PENDIENTE')
                .map(p => (
                  <option key={p.id} value={p.id}>{p.local_nombre} vs {p.visit_nombre}</option>
                ))
              }
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', marginBottom: 14 }}>
              <div>
                <Label>GOLES LOCAL</Label>
                <Input value={gLocal} onChange={setGLocal} placeholder="0" type="number" />
              </div>
              <div style={{ textAlign: 'center', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '1.2rem', paddingTop: 20 }}>-</div>
              <div>
                <Label>GOLES VISITANTE</Label>
                <Input value={gVisit} onChange={setGVisit} placeholder="0" type="number" />
              </div>
            </div>

            <Label>CAPTURA DE PANTALLA (recomendado)</Label>
            <input
              type="file" accept="image/*"
              onChange={e => setScreenshot(e.target.files?.[0] ?? null)}
              style={{ width: '100%', padding: '8px 0', color: '#8b949e', fontSize: '0.78rem', marginBottom: 14 }}
            />

            {reporteMsg && <div style={{ fontSize: '0.78rem', color: reporteMsg.startsWith('✅') ? '#00ff88' : '#ff4757', marginBottom: 12, textAlign: 'center' }}>{reporteMsg}</div>}

            <button onClick={reportar} disabled={reportando} style={{ width: '100%', padding: '13px 0', background: 'linear-gradient(135deg,#ffd700,#f0a500)', color: '#0b0e14', border: 'none', borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.83rem', cursor: 'pointer', letterSpacing: 1, opacity: reportando ? 0.7 : 1 }}>
              {reportando ? 'REPORTANDO...' : '📸 ENVIAR RESULTADO'}
            </button>
            <button onClick={() => setShowReporte(false)} style={{ width: '100%', padding: '10px 0', background: 'transparent', color: '#4a5568', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontFamily: "'Orbitron',sans-serif", marginTop: 8 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Roboto:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #30363d; }
        select option { background: #161b22; }
      `}</style>
    </>
  );
}

/* ── Helper components ──────────────────────────────────────────────── */
function InfoBox({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0d1117', border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: '20px 20px 16px' }}>
      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, color, letterSpacing: 1, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: '#4a5568', letterSpacing: 2, fontWeight: 900, marginBottom: 6 }}>{children}</div>;
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '10px 12px', background: '#161b22', border: '1px solid #30363d', borderRadius: 8, color: 'white', fontSize: '0.83rem', marginBottom: 14, outline: 'none' }}
    />
  );
}

function TeamBadge({ nombre, logo, reverse }: { nombre: string; logo?: string; reverse?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: reverse ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, minWidth: 80 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #30363d', flexShrink: 0 }}>
        {logo ? <img src={logo} alt={nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '⚽'}
      </div>
      <span style={{ fontSize: '0.75rem', color: '#e6edf3', fontWeight: 700, textAlign: reverse ? 'right' : 'left' }}>{nombre}</span>
    </div>
  );
}

function statusLabel(s: string) {
  if (s === 'PENDIENTE') return 'POR JUGAR';
  if (s === 'REPORTE_LOCAL') return 'ESPERANDO VALIDACIÓN';
  if (s === 'REPORTE_VISIT') return 'ESPERANDO VALIDACIÓN';
  if (s === 'VALIDADO') return 'FINALIZADO';
  if (s === 'DISPUTA') return 'EN DISPUTA';
  return s;
}

function statusColor(s: string) {
  if (s === 'PENDIENTE') return '#4a5568';
  if (s === 'REPORTE_LOCAL' || s === 'REPORTE_VISIT') return '#ffd700';
  if (s === 'VALIDADO') return '#00ff88';
  if (s === 'DISPUTA') return '#ff4757';
  return '#8b949e';
}
