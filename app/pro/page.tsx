'use client';

import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';
import SiteFooter from '@/app/_components/SiteFooter';
import Link from 'next/link';

/* ── Constants ──────────────────────────────────────────────────────────── */
const LIGAS = [
  { id: 'ARG', label: '🇦🇷 Argentina',   color: '#74b9ff', region: 'LATAM SUR'   },
  { id: 'PER', label: '🇵🇪 Perú',         color: '#ffd700', region: 'LATAM SUR'   },
  { id: 'MEX', label: '🇲🇽 México',       color: '#00b894', region: 'LATAM NORTE' },
  { id: 'COL', label: '🇨🇴 Colombia',     color: '#fdcb6e', region: 'LATAM SUR'   },
  { id: 'VEN', label: '🇻🇪 Venezuela',    color: '#e17055', region: 'LATAM SUR'   },
  { id: 'LFA', label: '🌎 Liga LFA',      color: '#00ff88', region: 'GLOBAL'      },
] as const;

type LigaId = typeof LIGAS[number]['id'];

const GRUPOS  = ['A', 'B', 'C', 'D'] as const;
const PAISES  = ['Argentina','Uruguay','Brasil','Chile','Colombia','Peru','Venezuela','Ecuador','Bolivia','Paraguay','Mexico','España','Estados Unidos','Otro'];
const COUNTRY_CODE: Record<string, string> = {
  Argentina:'ar', Uruguay:'uy', Brasil:'br', Chile:'cl', Colombia:'co', Peru:'pe',
  Venezuela:'ve', Ecuador:'ec', Bolivia:'bo', Paraguay:'py', Mexico:'mx',
  España:'es', 'Estados Unidos':'us', Otro:'un',
};
function flagUrl(pais: string) {
  return `https://flagcdn.com/20x15/${COUNTRY_CODE[pais] ?? 'un'}.png`;
}

/* ── Types ──────────────────────────────────────────────────────────────── */
interface Equipo {
  id: string; nombre: string; logo_url: string; pais: string;
  juego: string; liga: string; plataforma: string;
  uid: string; capitan: string; game_id: string; whatsapp: string;
  pts: number; pg: number; pe: number; pp: number; gf: number; gc: number;
  grupo: string;
}
interface Partido {
  id: string;
  equipo_local_id: string; equipo_visit_id: string;
  local_nombre: string; visit_nombre: string;
  local_logo: string; visit_logo: string;
  goles_local: number | null; goles_visit: number | null;
  status: 'PENDIENTE' | 'REPORTE_LOCAL' | 'REPORTE_VISIT' | 'VALIDADO' | 'DISPUTA';
  screenshot_url?: string; juego: string; liga: string;
  ronda: 'GRUPO' | 'PLAYOFF_IDA' | 'PLAYOFF_VUELTA'; grupo: string;
}
interface ChatMsg {
  id: string; uid: string; nombre: string;
  logo_url?: string; texto: string; liga?: string;
  ts?: { toMillis: () => number } | null;
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function ProPage() {
  const { lang, setLang, t } = useLang();

  const [uid,       setUid]       = useState<string | null>(null);
  const [userData,  setUserData]  = useState<{ nombre?: string; konami_id?: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [selectedLiga, setSelectedLiga] = useState<LigaId>('ARG');
  const [tab,          setTab]          = useState<'info' | 'fixture' | 'chat'>('fixture');

  const [equipos,  setEquipos]  = useState<Equipo[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [miEquipo, setMiEquipo] = useState<Equipo | null>(null);

  // inscripción
  const [showInscripcion, setShowInscripcion] = useState(false);
  const [form, setForm] = useState({
    nombre: '', pais: 'Argentina', liga: 'ARG' as LigaId, plataforma: 'PS5', game_id: '', whatsapp: '',
  });
  const [logoFile,       setLogoFile]       = useState<File | null>(null);
  const [logoPreview,    setLogoPreview]    = useState('');
  const [inscribiendo,   setInscribiendo]   = useState(false);
  const [inscripcionMsg, setInscripcionMsg] = useState('');

  // reporte
  const [showReporte,      setShowReporte]      = useState(false);
  const [reportePartidoId, setReportePartidoId] = useState('');
  const [gLocal,           setGLocal]           = useState('');
  const [gVisit,           setGVisit]           = useState('');
  const [screenshot,       setScreenshot]       = useState<File | null>(null);
  const [reportando,       setReportando]       = useState(false);
  const [reporteMsg,       setReporteMsg]       = useState('');
  const [validando,        setValidando]        = useState<string | null>(null);

  // chat
  const [chatInput,   setChatInput]   = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  /* ── Auth ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists()) setUserData(snap.data() as { nombre?: string; konami_id?: string });
      } else { setUid(null); setUserData(null); }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  /* ── Equipos (fetch all, filter in JS — no composite index) ──── */
  useEffect(() => {
    return onSnapshot(collection(db, 'liga_pro_equipos'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Equipo));
      setEquipos(data);
    });
  }, []);

  useEffect(() => {
    if (!uid) { setMiEquipo(null); return; }
    setMiEquipo(equipos.find(e => e.uid === uid) ?? null);
  }, [equipos, uid]);

  /* ── Partidos ────────────────────────────────────────────────── */
  useEffect(() => {
    return onSnapshot(collection(db, 'liga_pro_partidos'), snap => {
      setPartidos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Partido)));
    });
  }, []);

  /* ── Chat per liga (single-field query + JS sort) ────────────── */
  useEffect(() => {
    if (tab !== 'chat') return;
    const q = query(collection(db, 'liga_pro_mensajes'), where('liga', '==', selectedLiga));
    return onSnapshot(q, snap => {
      const msgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ChatMsg))
        .sort((a, b) => (a.ts?.toMillis() ?? 0) - (b.ts?.toMillis() ?? 0));
      setChatMsgs(msgs);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
  }, [tab, selectedLiga]);

  /* ── Auto-fill Konami ID from profile ────────────────────────── */
  useEffect(() => {
    const id = userData?.konami_id ?? '';
    if (id) setForm(f => ({ ...f, game_id: id }));
  }, [userData]);

  /* ── Logo picker ─────────────────────────────────────────────── */
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Solo se permiten imágenes (JPG, PNG, WebP).'); return; }
    if (file.size > 2 * 1024 * 1024) { alert('La imagen debe pesar menos de 2MB.'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  /* ── Inscripcion ─────────────────────────────────────────────── */
  async function inscribir() {
    if (!uid) return;
    if (!form.nombre.trim() || !form.game_id.trim() || !form.whatsapp.trim()) {
      setInscripcionMsg('⚠️ Completá nombre, Konami ID y WhatsApp.');
      return;
    }
    setInscribiendo(true); setInscripcionMsg('');
    try {
      const token = await auth.currentUser!.getIdToken();
      let logo_url = '';
      if (logoFile) {
        const fd = new FormData();
        fd.append('file', logoFile); fd.append('partidoId', 'logo');
        const upRes = await fetch('/api/pro/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        if (upRes.ok) logo_url = (await upRes.json()).url ?? '';
      }
      const res = await fetch('/api/pro/inscribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, juego: 'EFOOTBALL', logo_url }),
      });
      const data = await res.json();
      if (!res.ok) { setInscripcionMsg(`❌ ${data.error}`); return; }
      setInscripcionMsg('✅ ¡Inscripción exitosa! Ya sos parte de la Liga LFA 💚');
      setSelectedLiga(form.liga);
      setTimeout(() => { setShowInscripcion(false); setTab('fixture'); }, 1800);
    } catch { setInscripcionMsg('❌ Error de red. Intentá de nuevo.'); }
    finally { setInscribiendo(false); }
  }

  /* ── Reportar ────────────────────────────────────────────────── */
  async function reportar() {
    if (!uid || !reportePartidoId) return;
    if (gLocal === '' || gVisit === '') { setReporteMsg('⚠️ Ingresá el marcador.'); return; }
    setReportando(true); setReporteMsg('');
    try {
      const token = await auth.currentUser!.getIdToken();
      let screenshotUrl = '';
      if (screenshot) {
        const fd = new FormData();
        fd.append('file', screenshot); fd.append('partidoId', reportePartidoId);
        const upRes = await fetch('/api/pro/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        if (upRes.ok) screenshotUrl = (await upRes.json()).url ?? '';
      }
      const res = await fetch('/api/pro/reportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partidoId: reportePartidoId, goles_local: Number(gLocal), goles_visit: Number(gVisit), screenshot_url: screenshotUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setReporteMsg(`❌ ${data.error}`); return; }
      setReporteMsg('✅ Resultado reportado. Tu rival debe validar.');
      setTimeout(() => { setShowReporte(false); setGLocal(''); setGVisit(''); setScreenshot(null); setReportePartidoId(''); setReporteMsg(''); }, 1800);
    } catch { setReporteMsg('❌ Error de red.'); }
    finally { setReportando(false); }
  }

  /* ── Validar ─────────────────────────────────────────────────── */
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
    } catch { alert('Error de red.'); }
    finally { setValidando(null); }
  }

  /* ── Chat ────────────────────────────────────────────────────── */
  async function sendChat() {
    if (!uid || !chatInput.trim() || sendingChat) return;
    setSendingChat(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      await fetch('/api/pro/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ texto: chatInput.trim(), liga: selectedLiga }),
      });
      setChatInput('');
    } catch { /* silent */ } finally { setSendingChat(false); }
  }

  /* ── Derived data ────────────────────────────────────────────── */
  const ligaInfo    = LIGAS.find(l => l.id === selectedLiga)!;
  const ligaEquipos = equipos
    .filter(e => e.liga === selectedLiga)
    .sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
  const ligaPartidos  = partidos.filter(p => p.liga === selectedLiga);
  const grupoEquipos  = (g: string) => ligaEquipos.filter(e => e.grupo === g);
  const misPartidos   = miEquipo ? partidos.filter(p => p.equipo_local_id === miEquipo.id || p.equipo_visit_id === miEquipo.id) : [];
  const misParaValidar  = misPartidos.filter(p => miEquipo && ((p.status === 'REPORTE_LOCAL' && p.equipo_visit_id === miEquipo.id) || (p.status === 'REPORTE_VISIT' && p.equipo_local_id === miEquipo.id)));
  const misParaReportar = misPartidos.filter(p => p.status === 'PENDIENTE');

  /* ════════════════════════════════════════════════════════════ */
  return (
    <>
      <div style={{ margin: 0, fontFamily: 'Roboto, sans-serif', background: '#0b0e14', color: 'white', minHeight: '100vh' }}>

        {/* ── STICKY NAV ──────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 0, zIndex: 200, background: 'rgba(11,14,20,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1c2028', padding: '0 14px', display: 'flex', alignItems: 'center', height: 50, gap: 10 }}>
          <Link href="/hub" style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#8b949e', textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap' }}>
            ← HUB
          </Link>
          <div style={{ flex: 1, textAlign: 'center', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, color: '#00ff88', letterSpacing: 2, whiteSpace: 'nowrap' }}>
            ⚽ LIGA LFA 1vs1
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/perfil" style={{ color: '#8b949e', textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap' }}>
              👤 PERFIL
            </Link>
            <LangDropdown lang={lang} setLang={setLang} inline />
          </div>
        </div>

        {/* ── HERO ────────────────────────────────────────────── */}
        <section style={{ padding: 'clamp(40px,7vw,70px) 20px clamp(28px,4vw,44px)', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,255,136,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 30, padding: '4px 16px', fontSize: '0.62rem', color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, letterSpacing: 2, marginBottom: 14 }}>
            🆓 COMPLETAMENTE GRATUITA · SOMOS LFA
          </div>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.8rem,6vw,3.2rem)', fontWeight: 900, color: 'white', lineHeight: 1.1, letterSpacing: 'clamp(2px,1vw,4px)', marginBottom: 10 }}>
            LIGA <span style={{ color: '#00ff88' }}>LFA</span> 1vs1
          </div>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(0.62rem,2vw,0.82rem)', color: '#ffd700', letterSpacing: 3, marginBottom: 16 }}>
            ⭐ eFOOTBALL · CROSSPLAY · DREAM TEAM · PLANTILLA LIBRE · GRATIS
          </div>
          <p style={{ color: '#8b949e', fontSize: '0.84rem', maxWidth: 520, lineHeight: 1.75, marginBottom: 26 }}>
            Competí en la Liga oficial de SomosLFA. <strong style={{ color: '#cdd9e5' }}>Fase de grupos</strong> todos contra todos con ida y vuelta,
            <strong style={{ color: '#cdd9e5' }}> playoffs</strong> a doble partido con penales si hay empate.
            Modo <strong style={{ color: '#ffd700' }}>DREAM TEAM</strong>. ¡Disfrutá y divertite!
          </p>

          {authReady && (
            miEquipo ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 12, padding: '10px 24px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', color: '#00ff88', fontWeight: 900 }}>
                  ✅ INSCRIPTO — {miEquipo.nombre}
                </div>
                <button onClick={() => { setSelectedLiga(miEquipo.liga as LigaId); setTab('fixture'); }} style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', borderRadius: 10, padding: '7px 18px', cursor: 'pointer', fontSize: '0.68rem', fontFamily: "'Orbitron',sans-serif" }}>
                  VER MIS PARTIDOS →
                </button>
              </div>
            ) : uid ? (
              <button onClick={() => setShowInscripcion(true)} style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.85rem', background: 'linear-gradient(135deg,#00ff88,#00a859)', color: '#0b0e14', border: 'none', borderRadius: 12, padding: '14px 36px', cursor: 'pointer', letterSpacing: 1, boxShadow: '0 0 24px rgba(0,255,136,0.35)' }}>
                🏆 INSCRIBIRME A LA LIGA
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Link href="/auth" style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.85rem', background: 'linear-gradient(135deg,#00ff88,#00a859)', color: '#0b0e14', textDecoration: 'none', borderRadius: 12, padding: '14px 36px', boxShadow: '0 0 24px rgba(0,255,136,0.35)' }}>
                  🏆 CREAR CUENTA Y UNIRME
                </Link>
                <div style={{ color: '#4a5568', fontSize: '0.7rem' }}>¿Ya tenés cuenta? <Link href="/auth" style={{ color: '#00ff88' }}>Iniciá sesión</Link></div>
              </div>
            )
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 22 }}>
            {['🖥️ PC', '🎮 PS5', '🎮 Xbox', '🆓 Gratis'].map(p => (
              <span key={p} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 20, padding: '4px 14px', fontSize: '0.63rem', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>{p}</span>
            ))}
          </div>
        </section>

        {/* ── FORMAT CARDS ────────────────────────────────────── */}
        <section style={{ background: '#0d1117', borderTop: '1px solid #1c2028', borderBottom: '1px solid #1c2028', padding: 'clamp(18px,3vw,30px) 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 10 }}>
            {[
              { icon: '🏅', title: 'GRUPOS',        desc: 'Todos contra todos. Ida y vuelta.' },
              { icon: '🔥', title: 'PLAYOFFS',       desc: 'Ida y vuelta + penales.' },
              { icon: '⭐', title: 'DREAM TEAM',     desc: 'Modo oficial eFOOTBALL.' },
              { icon: '📋', title: 'PLANTILLA LIBRE',desc: 'Cualquier equipo.' },
              { icon: '📸', title: 'RESULTADOS',     desc: 'Foto + validación del rival.' },
              { icon: '💬', title: 'COORDINACIÓN',   desc: 'Chat LFA o WhatsApp.' },
            ].map(c => (
              <div key={c.title} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.3rem', marginBottom: 6 }}>{c.icon}</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.58rem', fontWeight: 900, color: '#00ff88', letterSpacing: 1, marginBottom: 4 }}>{c.title}</div>
                <div style={{ color: '#8b949e', fontSize: '0.67rem', lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── LIGAS + TABS ─────────────────────────────────────── */}
        <section style={{ maxWidth: 960, margin: '0 auto', padding: '20px 14px 60px' }}>

          {/* Liga pills */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.56rem', color: '#4a5568', letterSpacing: 2, fontWeight: 700, textAlign: 'center', marginBottom: 10 }}>
              SELECCIONÁ UNA LIGA
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {LIGAS.map(l => (
                <button key={l.id} onClick={() => setSelectedLiga(l.id)} style={{
                  fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.63rem', letterSpacing: 1,
                  padding: '7px 14px', borderRadius: 30, cursor: 'pointer',
                  border: `1px solid ${selectedLiga === l.id ? l.color : '#30363d'}`,
                  background: selectedLiga === l.id ? `${l.color}18` : 'transparent',
                  color: selectedLiga === l.id ? l.color : '#4a5568',
                  transition: 'all 0.2s',
                }}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #1c2028', marginBottom: 20, overflowX: 'auto' }}>
            {(['info', 'fixture', 'chat'] as const).map(tb => {
              const labels = { info: '📖 INFO', fixture: '📅 FIXTURE & RANKING', chat: '💬 CHAT' };
              return (
                <button key={tb} onClick={() => setTab(tb)} style={{
                  fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.63rem', letterSpacing: 1,
                  padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
                  color: tab === tb ? '#00ff88' : '#4a5568',
                  borderBottom: `2px solid ${tab === tb ? '#00ff88' : 'transparent'}`,
                  transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}>{labels[tb]}</button>
              );
            })}
          </div>

          {/* ═══ TAB: INFO ═══ */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ProInfoBox title="🏆 CÓMO FUNCIONA" color="#00ff88">
                <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 2.1, color: '#cdd9e5', fontSize: '0.81rem' }}>
                  <li>Elegís tu liga (por país o Liga LFA global) y te inscribís gratis.</li>
                  <li>Se forman grupos de hasta 4 equipos. Jugás contra todos: ida y vuelta.</li>
                  <li>Los 2 mejores de cada grupo avanzan a los Playoffs.</li>
                  <li>Playoffs: eliminación directa, ida y vuelta. Empate global → <strong>penales</strong>.</li>
                  <li>Coordinás el partido por el chat LFA o por WhatsApp directo con el rival.</li>
                  <li>El que tiene la captura la sube. El rival hace click en VALIDAR. El ranking se actualiza solo.</li>
                </ol>
              </ProInfoBox>
              <ProInfoBox title="⭐ REGLAMENTO eFOOTBALL" color="#ffd700">
                <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 2.1, color: '#cdd9e5', fontSize: '0.81rem' }}>
                  <li>Juego: <strong style={{ color: '#ffd700' }}>eFOOTBALL</strong> · Modo: <strong style={{ color: '#ffd700' }}>DREAM TEAM</strong></li>
                  <li>Crossplay activado — PC, PlayStation, Xbox juegan entre sí sin problemas.</li>
                  <li>Plantilla <strong>libre</strong> — cualquier equipo, sin restricción de rating.</li>
                  <li>Playoffs: la sala la crea cualquier jugador y el rival se une con contraseña acordada.</li>
                  <li>En disputa: escribir al chat de la liga para que LFA intervenga.</li>
                  <li>Fair play obligatorio. El irrespeto lleva a descalificación.</li>
                </ul>
              </ProInfoBox>
              <ProInfoBox title="📸 CÓMO REPORTAR UN RESULTADO" color="#009ee3">
                <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 2.1, color: '#cdd9e5', fontSize: '0.81rem' }}>
                  <li>Cualquiera de los dos puede reportar (ganador o perdedor).</li>
                  <li>Subís la captura del marcador como prueba.</li>
                  <li>Tu rival hace click en <strong style={{ color: '#00ff88' }}>✅ VALIDAR</strong> para confirmar.</li>
                  <li>Al validarse el ranking se actualiza automáticamente y en tiempo real.</li>
                  <li>Si el rival no valida en 24hs, LFA acepta el resultado automáticamente.</li>
                </ul>
              </ProInfoBox>
              <ProInfoBox title="🆓 LIGAS GRATUITAS — SOMOS LFA 💚" color="#a371f7">
                <p style={{ margin: 0, color: '#cdd9e5', fontSize: '0.82rem', lineHeight: 1.85 }}>
                  Las Ligas LFA son <strong style={{ color: '#a371f7' }}>100% gratuitas</strong>. No necesitás coins ni pagar nada.
                  Solo pasión por el fútbol virtual y ganas de competir en comunidad.
                  El objetivo es que disfrutes, crezcas y te midas con jugadores de toda Latinoamérica y el mundo.
                  <br /><br />
                  <strong style={{ color: '#00ff88' }}>¿Tenés dudas? Escribinos en el chat de tu liga. Somos LFA 💚</strong>
                </p>
              </ProInfoBox>
            </div>
          )}

          {/* ═══ TAB: FIXTURE & RANKING ═══ */}
          {tab === 'fixture' && (
            <div>
              {/* RANKING — siempre visible arriba */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, color: ligaInfo.color, letterSpacing: 2 }}>
                    🏆 {ligaInfo.label.toUpperCase()} — TABLA
                  </div>
                  <span style={{ fontSize: '0.52rem', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, padding: '2px 8px', color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>EN VIVO</span>
                </div>

                {GRUPOS.map(g => {
                  const lista = grupoEquipos(g);
                  if (lista.length === 0) return null;
                  return (
                    <div key={g} style={{ marginBottom: 18 }}>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: '#4a5568', letterSpacing: 2, marginBottom: 8, borderLeft: `3px solid ${ligaInfo.color}`, paddingLeft: 8 }}>
                        GRUPO {g}
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', minWidth: 460 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #21262d' }}>
                              {['#', 'EQUIPO', 'PAÍS', 'PTS', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DIF'].map(h => (
                                <th key={h} style={{ padding: '6px 5px', textAlign: h === 'EQUIPO' ? 'left' : 'center', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", fontSize: '0.54rem', letterSpacing: 1, fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {lista.map((eq, i) => {
                              const pj  = eq.pg + eq.pe + eq.pp;
                              const dif = eq.gf - eq.gc;
                              const isPase = i < 2;
                              return (
                                <tr key={eq.id} style={{ borderBottom: '1px solid #161b22', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                                  <td style={{ padding: '9px 5px', textAlign: 'center', color: isPase ? '#00ff88' : '#4a5568', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.74rem' }}>{i + 1}</td>
                                  <td style={{ padding: '9px 5px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #30363d', flexShrink: 0 }}>
                                        {eq.logo_url
                                          ? <img src={eq.logo_url} alt={eq.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                          : <span style={{ fontSize: '0.8rem' }}>⚽</span>
                                        }
                                      </div>
                                      <div>
                                        <div style={{ color: '#e6edf3', fontWeight: 700, whiteSpace: 'nowrap' }}>{eq.nombre}</div>
                                        <div style={{ color: '#4a5568', fontSize: '0.58rem' }}>{eq.capitan} · {eq.plataforma}</div>
                                      </div>
                                      {isPase && <span style={{ fontSize: '0.5rem', background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff8840', color: '#00ff88', borderRadius: 5, padding: '1px 5px', fontFamily: "'Orbitron',sans-serif", whiteSpace: 'nowrap' }}>PLAYOFF</span>}
                                      {miEquipo?.id === eq.id && <span style={{ fontSize: '0.5rem', background: 'rgba(255,215,0,0.1)', border: '1px solid #ffd70040', color: '#ffd700', borderRadius: 5, padding: '1px 5px', fontFamily: "'Orbitron',sans-serif" }}>TÚ</span>}
                                    </div>
                                  </td>
                                  <td style={{ padding: '9px 5px', textAlign: 'center' }}>
                                    <img src={flagUrl(eq.pais)} alt={eq.pais} style={{ width: 20, height: 15, display: 'inline-block' }} />
                                  </td>
                                  <td style={{ padding: '9px 5px', textAlign: 'center', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#ffd700', fontSize: '0.88rem' }}>{eq.pts}</td>
                                  <td style={{ padding: '9px 5px', textAlign: 'center', color: '#8b949e' }}>{pj}</td>
                                  <td style={{ padding: '9px 5px', textAlign: 'center', color: '#00ff88' }}>{eq.pg}</td>
                                  <td style={{ padding: '9px 5px', textAlign: 'center', color: '#8b949e' }}>{eq.pe}</td>
                                  <td style={{ padding: '9px 5px', textAlign: 'center', color: '#ff4757' }}>{eq.pp}</td>
                                  <td style={{ padding: '9px 5px', textAlign: 'center', color: '#e6edf3' }}>{eq.gf}</td>
                                  <td style={{ padding: '9px 5px', textAlign: 'center', color: '#e6edf3' }}>{eq.gc}</td>
                                  <td style={{ padding: '9px 5px', textAlign: 'center', color: dif > 0 ? '#00ff88' : dif < 0 ? '#ff4757' : '#8b949e', fontWeight: 700 }}>{dif > 0 ? `+${dif}` : dif}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {ligaEquipos.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '36px 20px', color: '#4a5568', background: '#0d1117', borderRadius: 12, border: '1px solid #21262d' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏆</div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', letterSpacing: 2 }}>INSCRIPCIONES ABIERTAS</div>
                    <div style={{ fontSize: '0.76rem', marginTop: 6 }}>Sé el primero en unirte a {ligaInfo.label}.</div>
                    {uid && !miEquipo && (
                      <button onClick={() => { setForm(f => ({ ...f, liga: selectedLiga })); setShowInscripcion(true); }} style={{ marginTop: 14, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.68rem', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>
                        🏆 INSCRIBIRME AQUÍ
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* DIVIDER */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ flex: 1, height: 1, background: '#1c2028' }} />
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.58rem', color: '#4a5568', letterSpacing: 2 }}>PARTIDOS</div>
                <div style={{ flex: 1, height: 1, background: '#1c2028' }} />
              </div>

              {/* Alertas para mi equipo */}
              {miEquipo && miEquipo.liga === selectedLiga && (
                <>
                  {misParaValidar.length > 0 && (
                    <div style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span>⚠️</span>
                      <div>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.63rem', color: '#ffd700', fontWeight: 900 }}>TENÉS RESULTADOS PARA VALIDAR</div>
                        <div style={{ fontSize: '0.7rem', color: '#8b949e', marginTop: 2 }}>Tu rival reportó el marcador. Hacé click en ✅ VALIDAR para confirmar.</div>
                      </div>
                    </div>
                  )}
                  <div style={{ marginBottom: 14 }}>
                    <button onClick={() => setShowReporte(true)} style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.67rem', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', letterSpacing: 1 }}>
                      📸 REPORTAR RESULTADO
                    </button>
                  </div>
                </>
              )}

              {/* Partidos por ronda */}
              {(['GRUPO', 'PLAYOFF_IDA', 'PLAYOFF_VUELTA'] as const).map(ronda => {
                const ps = ligaPartidos.filter(p => p.ronda === ronda);
                if (ps.length === 0) return null;
                const rLabel = ronda === 'GRUPO' ? '📅 FASE DE GRUPOS' : ronda === 'PLAYOFF_IDA' ? '🔥 PLAYOFFS — IDA' : '🔥 PLAYOFFS — VUELTA';
                return (
                  <div key={ronda} style={{ marginBottom: 22 }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', fontWeight: 900, color: '#ffd700', letterSpacing: 2, marginBottom: 10, borderLeft: '3px solid #ffd700', paddingLeft: 8 }}>{rLabel}</div>
                    {ps.map(p => {
                      const miLocal = miEquipo?.id === p.equipo_local_id;
                      const miVisit = miEquipo?.id === p.equipo_visit_id;
                      const esMio   = miLocal || miVisit;
                      const paraVal = miEquipo && ((p.status === 'REPORTE_LOCAL' && miVisit) || (p.status === 'REPORTE_VISIT' && miLocal));
                      const rivalId = esMio ? (miLocal ? p.equipo_visit_id : p.equipo_local_id) : null;
                      const rival   = rivalId ? equipos.find(e => e.id === rivalId) : null;
                      return (
                        <div key={p.id} style={{
                          background: esMio ? 'rgba(0,255,136,0.025)' : '#0d1117',
                          border: `1px solid ${esMio ? 'rgba(0,255,136,0.15)' : '#21262d'}`,
                          borderRadius: 10, padding: '11px 13px', marginBottom: 7,
                          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                        }}>
                          <ProTeamBadge nombre={p.local_nombre} logo={p.local_logo} />
                          <div style={{ flex: 1, textAlign: 'center', minWidth: 64 }}>
                            {p.status === 'VALIDADO' ? (
                              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1rem', fontWeight: 900, color: '#e6edf3' }}>
                                {p.goles_local} <span style={{ color: '#4a5568' }}>-</span> {p.goles_visit}
                              </div>
                            ) : (
                              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.55rem', color: proStatusColor(p.status), letterSpacing: 1 }}>{proStatusLabel(p.status)}</div>
                            )}
                            {p.screenshot_url && <a href={p.screenshot_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.57rem', color: '#4a5568', display: 'block', marginTop: 2 }}>📸 foto</a>}
                          </div>
                          <ProTeamBadge nombre={p.visit_nombre} logo={p.visit_logo} reverse />
                          {paraVal && (
                            <button onClick={() => validar(p.id)} disabled={validando === p.id} style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 900, background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', color: '#00ff88', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {validando === p.id ? '...' : '✅ VALIDAR'}
                            </button>
                          )}
                          {esMio && rival?.whatsapp && (() => {
                            const msg = encodeURIComponent(`Hola! Soy de ${miEquipo?.nombre} · Liga LFA — ${ligaInfo.label}. ¿Coordinamos el partido?`);
                            return (
                              <a href={`https://wa.me/${rival.whatsapp.replace(/\D/g, '')}?text=${msg}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.6rem', background: 'rgba(37,211,102,0.07)', border: '1px solid rgba(37,211,102,0.22)', color: '#25d366', borderRadius: 7, padding: '6px 10px', textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, whiteSpace: 'nowrap' }}>
                                📱 WA
                              </a>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {ligaPartidos.length === 0 && ligaEquipos.length > 0 && (
                <div style={{ textAlign: 'center', padding: '36px 20px', color: '#4a5568', background: '#0d1117', borderRadius: 12, border: '1px solid #21262d' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 10 }}>📅</div>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', letterSpacing: 2 }}>SIN PARTIDOS AÚN</div>
                  <div style={{ fontSize: '0.76rem', marginTop: 6 }}>Los partidos se generan cuando el grupo llega a 4 equipos.</div>
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB: CHAT ═══ */}
          {tab === 'chat' && (
            <div>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', color: '#4a5568', letterSpacing: 2, marginBottom: 14, textAlign: 'center' }}>
                💬 CHAT — {ligaInfo.label.toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', height: 420 }}>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {chatMsgs.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.76rem', marginTop: 40 }}>
                      💬 Coordiná partidos, hablá con tu rival o saludá a la comunidad de {ligaInfo.label}
                    </div>
                  )}
                  {chatMsgs.map(m => (
                    <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0, overflow: 'hidden', border: '1px solid #30363d' }}>
                        {m.logo_url ? <img src={m.logo_url} alt={m.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '⚽'}
                      </div>
                      <div style={{ background: '#161b22', borderRadius: '0 10px 10px 10px', padding: '7px 11px', maxWidth: '82%' }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.54rem', color: '#00ff88', fontWeight: 900, marginBottom: 2 }}>{m.nombre}</div>
                        <div style={{ color: '#cdd9e5', fontSize: '0.82rem', lineHeight: 1.5 }}>{m.texto}</div>
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
                      style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '10px 14px', color: 'white', fontSize: '0.82rem', outline: 'none' }}
                    />
                    <button onClick={sendChat} disabled={sendingChat || !chatInput.trim()} style={{ background: '#00a859', border: 'none', color: 'white', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.7rem' }}>
                      {sendingChat ? '...' : '➤'}
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.78rem', padding: 12 }}>
                    <Link href="/auth" style={{ color: '#00ff88' }}>Iniciá sesión</Link> para chatear en la liga
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <SiteFooter t={t} />
      </div>

      {/* ── MODAL INSCRIPCIÓN ─────────────────────────────────────── */}
      {showInscripcion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.90)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowInscripcion(false)}>
          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 16, padding: '24px 22px 20px', maxWidth: 440, width: '100%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.88rem', fontWeight: 900, color: '#00ff88', marginBottom: 18, letterSpacing: 1 }}>🏆 INSCRIPCIÓN — LIGA LFA</div>

            {/* Liga */}
            <ProLabel>¿A QUÉ LIGA QUERÉS UNIRTE? *</ProLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {LIGAS.map(l => (
                <button key={l.id} onClick={() => setForm(f => ({ ...f, liga: l.id }))} style={{
                  padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: '0.6rem', letterSpacing: 1,
                  background: form.liga === l.id ? `${l.color}18` : '#161b22',
                  border: `1px solid ${form.liga === l.id ? l.color : '#30363d'}`,
                  color: form.liga === l.id ? l.color : '#4a5568',
                }}>{l.label}</button>
              ))}
            </div>

            {/* Logo upload */}
            <ProLabel>LOGO DEL EQUIPO (opcional · máx 2MB)</ProLabel>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
              <label htmlFor="logo-upload" style={{ cursor: 'pointer', display: 'block' }}>
                <div style={{ width: 82, height: 82, borderRadius: '50%', background: '#161b22', border: `2px dashed ${logoPreview ? '#00ff88' : '#30363d'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                  {logoPreview
                    ? <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ textAlign: 'center', color: '#4a5568' }}>
                        <div style={{ fontSize: '1.5rem' }}>⚽</div>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.48rem', letterSpacing: 1, marginTop: 3 }}>SUBIR</div>
                      </div>
                  }
                </div>
              </label>
              <input id="logo-upload" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleLogoChange} />
              <div style={{ fontSize: '0.58rem', color: '#4a5568', marginTop: 6, fontFamily: "'Orbitron',sans-serif", letterSpacing: 1 }}>Tocá para elegir · JPG PNG WebP</div>
            </div>

            <ProLabel>NOMBRE DEL EQUIPO *</ProLabel>
            <ProInput value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Ej: Los Campeones FC" />

            <ProLabel>KONAMI ID (eFOOTBALL) *</ProLabel>
            <ProInput value={form.game_id} onChange={v => setForm(f => ({ ...f, game_id: v }))} placeholder="Tu Konami ID del juego" />

            <ProLabel>PAÍS *</ProLabel>
            <select value={form.pais} onChange={e => setForm(f => ({ ...f, pais: e.target.value }))} style={{ width: '100%', padding: '10px 12px', background: '#161b22', border: '1px solid #30363d', borderRadius: 8, color: 'white', fontSize: '0.82rem', marginBottom: 14, outline: 'none' }}>
              {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <ProLabel>PLATAFORMA *</ProLabel>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {['PC', 'PS5', 'Xbox'].map(pl => (
                <button key={pl} onClick={() => setForm(f => ({ ...f, plataforma: pl }))} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.65rem',
                  background: form.plataforma === pl ? 'rgba(0,255,136,0.1)' : '#161b22',
                  border: `1px solid ${form.plataforma === pl ? '#00ff88' : '#30363d'}`,
                  color: form.plataforma === pl ? '#00ff88' : '#8b949e',
                }}>{pl === 'PC' ? '🖥️ PC' : pl === 'PS5' ? '🎮 PS5' : '🎮 Xbox'}</button>
              ))}
            </div>

            <ProLabel>WHATSAPP * (con código de país, ej: +5491123456789)</ProLabel>
            <ProInput value={form.whatsapp} onChange={v => setForm(f => ({ ...f, whatsapp: v }))} placeholder="+54911..." />

            {inscripcionMsg && (
              <div style={{ fontSize: '0.76rem', color: inscripcionMsg.startsWith('✅') ? '#00ff88' : '#ff4757', marginBottom: 12, textAlign: 'center', lineHeight: 1.5 }}>
                {inscripcionMsg}
              </div>
            )}

            <button onClick={inscribir} disabled={inscribiendo} style={{ width: '100%', padding: '13px 0', background: 'linear-gradient(135deg,#00ff88,#00a859)', color: '#0b0e14', border: 'none', borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.82rem', cursor: 'pointer', letterSpacing: 1, opacity: inscribiendo ? 0.7 : 1 }}>
              {inscribiendo ? '⏳ PROCESANDO...' : '🏆 CONFIRMAR INSCRIPCIÓN'}
            </button>
            <button onClick={() => setShowInscripcion(false)} style={{ width: '100%', padding: '9px 0', background: 'transparent', color: '#4a5568', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontFamily: "'Orbitron',sans-serif", marginTop: 6 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL REPORTAR ───────────────────────────────────────── */}
      {showReporte && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.90)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowReporte(false)}>
          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 16, padding: '24px', maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.85rem', fontWeight: 900, color: '#ffd700', marginBottom: 18 }}>📸 REPORTAR RESULTADO</div>

            <ProLabel>PARTIDO *</ProLabel>
            <select value={reportePartidoId} onChange={e => setReportePartidoId(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#161b22', border: '1px solid #30363d', borderRadius: 8, color: 'white', fontSize: '0.78rem', marginBottom: 14, outline: 'none' }}>
              <option value="">— Seleccioná un partido —</option>
              {misParaReportar.map(p => (
                <option key={p.id} value={p.id}>{p.local_nombre} vs {p.visit_nombre}</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', marginBottom: 14 }}>
              <div><ProLabel>GOLES LOCAL</ProLabel><ProInput value={gLocal} onChange={setGLocal} placeholder="0" type="number" /></div>
              <div style={{ textAlign: 'center', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '1.2rem', paddingTop: 18 }}>-</div>
              <div><ProLabel>GOLES VISIT.</ProLabel><ProInput value={gVisit} onChange={setGVisit} placeholder="0" type="number" /></div>
            </div>

            <ProLabel>CAPTURA DEL MARCADOR (recomendado)</ProLabel>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setScreenshot(e.target.files?.[0] ?? null)} style={{ width: '100%', padding: '6px 0', color: '#8b949e', fontSize: '0.74rem', marginBottom: 14 }} />

            {reporteMsg && <div style={{ fontSize: '0.76rem', color: reporteMsg.startsWith('✅') ? '#00ff88' : '#ff4757', marginBottom: 12, textAlign: 'center' }}>{reporteMsg}</div>}

            <button onClick={reportar} disabled={reportando} style={{ width: '100%', padding: '13px 0', background: 'linear-gradient(135deg,#ffd700,#f0a500)', color: '#0b0e14', border: 'none', borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.82rem', cursor: 'pointer', letterSpacing: 1, opacity: reportando ? 0.7 : 1 }}>
              {reportando ? '⏳ ENVIANDO...' : '📸 ENVIAR RESULTADO'}
            </button>
            <button onClick={() => setShowReporte(false)} style={{ width: '100%', padding: '9px 0', background: 'transparent', color: '#4a5568', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontFamily: "'Orbitron',sans-serif", marginTop: 6 }}>Cancelar</button>
          </div>
        </div>
      )}

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
        select option { background: #161b22; }
      `}</style>
    </>
  );
}

/* ── Helper components ─────────────────────────────────────────────── */
function ProInfoBox({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0d1117', border: `1px solid ${color}20`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: '18px 18px 14px' }}>
      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, color, letterSpacing: 1, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function ProLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.58rem', color: '#4a5568', letterSpacing: 2, fontWeight: 900, marginBottom: 5 }}>{children}</div>;
}
function ProInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', padding: '10px 12px', background: '#161b22', border: '1px solid #30363d', borderRadius: 8, color: 'white', fontSize: '0.82rem', marginBottom: 14, outline: 'none' }} />;
}
function ProTeamBadge({ nombre, logo, reverse }: { nombre: string; logo?: string; reverse?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: reverse ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, minWidth: 68 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #30363d', flexShrink: 0 }}>
        {logo ? <img src={logo} alt={nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '⚽'}
      </div>
      <span style={{ fontSize: '0.72rem', color: '#e6edf3', fontWeight: 700, textAlign: reverse ? 'right' : 'left' }}>{nombre}</span>
    </div>
  );
}
function proStatusLabel(s: string) {
  if (s === 'PENDIENTE') return 'POR JUGAR';
  if (s === 'REPORTE_LOCAL' || s === 'REPORTE_VISIT') return 'PENDIENTE VALIDACIÓN';
  if (s === 'VALIDADO') return 'FINALIZADO ✓';
  if (s === 'DISPUTA') return 'EN DISPUTA';
  return s;
}
function proStatusColor(s: string) {
  if (s === 'PENDIENTE') return '#4a5568';
  if (s === 'REPORTE_LOCAL' || s === 'REPORTE_VISIT') return '#ffd700';
  if (s === 'VALIDADO') return '#00ff88';
  if (s === 'DISPUTA') return '#ff4757';
  return '#8b949e';
}
