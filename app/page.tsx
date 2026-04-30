'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

import IntroOverlay  from '@/app/_components/IntroOverlay';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';
import SiteFooter    from '@/app/_components/SiteFooter';
import LoginBox      from '@/app/auth/_components/LoginBox';

const MODOS_BASE = [
  { icon: '⚔️', title: 'ARENA 1VS1',  key: 'arena',  color: '#00ff88' },
  { icon: '📅', title: 'LIGA 1VS1',   key: 'liga',   color: '#ffd700' },
  { icon: '🤝', title: 'CO-OP 2VS2',  key: 'coop',   color: '#009ee3', pronto: true },
  { icon: '🏛️', title: 'LIGA LFA', sub: 'Clubes FC 26', key: 'clubes', color: '#a371f7', pronto: true },
];

export default function HomePage() {
  const router               = useRouter();
  const { lang, setLang, t } = useLang();
  const [showIntro,    setShowIntro]   = useState(true);
  const [authChecked,  setAuthChecked] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [stats, setStats] = useState({
    jugadores: 0, torneos: 0,
    partidas_hoy: 0, en_vivo: 0, jugando_ahora: 0,
    fc26_vivo: 0, efb_vivo: 0, torneos_activos: 0,
    fc26_torneos: 0, efb_torneos: 0,
    fc26_jugadores: 0, efb_jugadores: 0,
    fc26_hoy: 0, efb_hoy: 0,
  });
  const [slideIndex, setSlideIndex] = useState(0);
  const loginRef = useRef<HTMLDivElement>(null);

  const MODOS = [
    { ...MODOS_BASE[0], desc: t.home_arena_desc },
    { ...MODOS_BASE[1], desc: t.home_liga_desc },
    { ...MODOS_BASE[2], desc: t.home_coop_desc },
    { ...MODOS_BASE[3], desc: t.home_clubes_desc },
  ];

  const PASOS = [
    { n: '01', title: t.home_paso1_title, desc: t.home_paso1_desc },
    { n: '02', title: t.home_paso2_title, desc: t.home_paso2_desc },
    { n: '03', title: t.home_paso3_title, desc: t.home_paso3_desc },
  ];

  // Cargar stats públicos (server-side vía API route — bypasea App Check)
  useEffect(() => {
    const fetchStats = () => {
      fetch('/api/stats')
        .then(r => r.ok ? r.json() : {})
        .then(data => { setStats(s => ({ ...s, ...data })); setStatsLoaded(true); })
        .catch(() => { setStatsLoaded(true); });
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Rotador de slides del panel (0=efootball, 1=fc26, 2=general)
  useEffect(() => {
    const t = setInterval(() => setSlideIndex(i => (i + 1) % 3), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user && user.emailVerified) {
        try {
          const snap = await getDoc(doc(db, 'usuarios', user.uid));
          if (snap.exists() && (snap.data() as Record<string, unknown>).terminos_aceptados) {
            router.replace('/hub');
            return;
          }
        } catch { /* sin red */ }
      }
      setAuthChecked(true);
    });
    return unsub;
  }, [router]);

  if (!authChecked) return null;

  const scrollToLogin = () => loginRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <>
      {showIntro && <IntroOverlay onSkip={() => setShowIntro(false)} />}

      <div style={{ margin: 0, fontFamily: 'Roboto, sans-serif', background: '#0b0e14', color: 'white', minHeight: '100vh' }}>
        <LangDropdown lang={lang} setLang={setLang} />

        {/* ══════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════ */}
        <section style={{ padding: 'clamp(60px,10vw,100px) 20px clamp(40px,6vw,60px)', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>

          {/* fondo animado */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,255,136,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(2.2rem,8vw,5.5rem)', fontWeight: 900, color: 'white', letterSpacing: 'clamp(2px,1.5vw,6px)', lineHeight: 1, textShadow: '0 0 40px rgba(0,255,136,0.3)', whiteSpace: 'nowrap' }}>
              SOMOS<span style={{ color: '#00ff88' }}>LFA</span>
            </div>
            <div style={{ color: '#ffd700', fontSize: 'clamp(0.7rem,2vw,0.9rem)', fontFamily: "'Orbitron',sans-serif", letterSpacing: 4, marginTop: 8, fontWeight: 700 }}>
              ★ LIGA DE FÚTBOL ARGENTINA ★
            </div>
          </div>

          {/* Slogan */}
          <p style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(0.85rem,2.5vw,1.1rem)', textAlign: 'center', color: '#cdd9e5', maxWidth: 540, lineHeight: 1.7, margin: '0 0 36px' }}>
            {t.home_slogan1}<br />
            {t.home_slogan2}<br />
            <span style={{ color: '#ffd700', fontSize: '0.9em' }}>🏆 Top Ranking · Brackets automáticos · Bot verificador</span>
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 40 }}>
            <button onClick={scrollToLogin} style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.85rem', background: 'linear-gradient(135deg,#00ff88,#00a859)', color: '#0b0e14', border: 'none', borderRadius: 12, padding: '14px 32px', cursor: 'pointer', letterSpacing: 1, boxShadow: '0 0 24px rgba(0,255,136,0.35)', transition: '0.2s' }}>
              {t.home_crear_cuenta}
            </button>
            <button onClick={scrollToLogin} style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: '0.85rem', background: 'transparent', color: '#8b949e', border: '1px solid #30363d', borderRadius: 12, padding: '14px 28px', cursor: 'pointer', transition: '0.2s' }}>
              {t.home_ya_tengo}
            </button>
          </div>

          {/* Stats en vivo + regiones activas */}
          <div style={{ width: '100%', maxWidth: 700 }}>
            {/* Header barra */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00ff88', display: 'inline-block', boxShadow: '0 0 6px #00ff88', animation: 'livePulse 1.5s ease-in-out infinite' }} />
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: '#00ff88', fontWeight: 900, letterSpacing: 2 }}>ESTADÍSTICAS EN VIVO · LFA</span>
            </div>
            {/* Números */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.12)', borderRadius: 14, padding: 'clamp(12px,2vw,20px)', marginBottom: 16 }}>
              {[
                { v: statsLoaded ? stats.torneos : '…', l: 'TORNEOS', c: '#ffd700' },
                { v: statsLoaded ? stats.jugadores : '…', l: 'JUGADORES', c: '#00ff88' },
                { v: statsLoaded ? stats.en_vivo : '…', l: 'EN VIVO', c: stats.en_vivo > 0 ? '#ff4757' : '#00ff88', live: true },
                { v: statsLoaded ? stats.partidas_hoy : '…', l: 'PARTIDAS HOY', c: '#8b949e' },
              ].map(s => (
                <div key={s.l} style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    {s.live && statsLoaded && stats.en_vivo > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff4757', display: 'inline-block', animation: 'livePulse 1s ease-in-out infinite' }} />}
                    <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.1rem,2.5vw,1.6rem)', fontWeight: 900, color: s.c }}>{typeof s.v === 'number' ? s.v.toLocaleString('es-AR') : s.v}</span>
                  </div>
                  <div style={{ fontSize: '0.55rem', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", letterSpacing: 2, marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            {/* Regiones */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.58rem', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1, alignSelf: 'center' }}>REGIONES ACTIVAS:</span>
              {['🌎 LATAM SUR', '🌎 LATAM NORTE', '🌍 AMÉRICA', '🌐 GLOBAL', '🇪🇺 EUROPA'].map(r => (
                <span key={r} style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 20, padding: '3px 10px', fontSize: '0.58rem', color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            GAME CARDS — rotating showcase
        ══════════════════════════════════════════════ */}
        <section style={{ padding: 'clamp(20px,4vw,40px) 20px 0', maxWidth: 960, margin: '0 auto' }}>

          {/* Indicadores de slide */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            {['eFOOTBALL', 'FC 26', 'PLATAFORMA'].map((label, i) => (
              <button
                key={label}
                onClick={() => setSlideIndex(i)}
                style={{
                  padding: '4px 14px', borderRadius: 30, fontSize: '0.62rem', cursor: 'pointer',
                  fontFamily: "'Orbitron',sans-serif", fontWeight: 900, letterSpacing: 1,
                  border: `1px solid ${slideIndex === i ? (i === 0 ? '#ffd700' : i === 1 ? '#009ee3' : '#00ff88') : '#30363d'}`,
                  background: slideIndex === i
                    ? (i === 0 ? 'rgba(255,215,0,0.12)' : i === 1 ? 'rgba(0,158,227,0.12)' : 'rgba(0,255,136,0.10)')
                    : 'transparent',
                  color: slideIndex === i ? (i === 0 ? '#ffd700' : i === 1 ? '#009ee3' : '#00ff88') : '#4a5568',
                  transition: 'all 0.3s',
                }}
              >{label}</button>
            ))}
          </div>

          {/* ── SLIDE 0: eFOOTBALL ── */}
          <div style={{
            display: slideIndex === 0 ? 'grid' : 'none',
            gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
            gap: 16,
            animation: slideIndex === 0 ? 'slideIn 0.4s ease' : 'none',
          }} className="slide-grid">

            {/* Logo / identidad */}
            <div style={{
              background: 'linear-gradient(135deg,#0d1117,#111a12)',
              border: '1px solid #ffd70030', borderRadius: 16,
              padding: 'clamp(20px,4vw,32px)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 60% at 50% 30%, rgba(255,215,0,0.06), transparent)', pointerEvents: 'none' }} />
              {/* Logo eFOOTBALL SVG inline */}
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="32" cy="32" r="30" fill="#1a1a1a" stroke="#ffd700" strokeWidth="2"/>
                <polygon points="32,10 38,26 55,26 42,36 47,52 32,42 17,52 22,36 9,26 26,26" fill="#ffd700"/>
              </svg>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1rem,3vw,1.4rem)', fontWeight: 900, color: '#ffd700', letterSpacing: 2, textAlign: 'center' }}>eFOOTBALL</div>
              <div style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid #ffd70040', borderRadius: 30, padding: '4px 14px', fontSize: '0.65rem', fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontWeight: 700, letterSpacing: 1 }}>
                🌐 CROSSPLAY · PS/XBOX/PC/MOBILE
              </div>
              <div style={{ color: '#8b949e', fontSize: '0.73rem', textAlign: 'center', lineHeight: 1.6, marginTop: 4 }}>
                Gratis en todas las plataformas.<br/>Torneos verificados con bot LFA.
              </div>
            </div>

            {/* Stats de eFOOTBALL */}
            <div style={{
              background: '#0d1117', border: '1px solid #ffd70020', borderRadius: 16,
              padding: 'clamp(16px,3vw,28px)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', color: '#ffd700', fontWeight: 900, letterSpacing: 2, borderBottom: '1px solid #1c2028', paddingBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: stats.efb_vivo > 0 ? '#ffd700' : '#4a5568', display: 'inline-block', animation: stats.efb_vivo > 0 ? 'livePulse 1s ease-in-out infinite' : 'none' }} />
                EN VIVO — eFOOTBALL LFA
              </div>
              {[
                { l: 'PARTIDAS EN VIVO',      v: stats.efb_vivo,                          c: '#ffd700', live: true },
                { l: 'TORNEOS ABIERTOS',       v: stats.efb_torneos,                        c: '#ffd700' },
                { l: 'JUGADORES EN LFA',       v: stats.efb_jugadores || stats.jugadores,   c: '#e6edf3' },
                { l: 'PARTIDAS HOY',           v: stats.efb_hoy || stats.partidas_hoy,      c: '#8b949e' },
              ].map(row => (
                <div key={row.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {row.live && row.v > 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffd700', display: 'inline-block', animation: 'livePulse 1s ease-in-out infinite', flexShrink: 0 }} />}
                    <span style={{ fontSize: '0.65rem', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1 }}>{row.l}</span>
                  </div>
                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: 'clamp(1rem,2.5vw,1.3rem)', color: row.c }}>{statsLoaded ? row.v.toLocaleString('es-AR') : '…'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── SLIDE 1: FC 26 ── */}
          <div style={{
            display: slideIndex === 1 ? 'grid' : 'none',
            gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
            gap: 16,
            animation: slideIndex === 1 ? 'slideIn 0.4s ease' : 'none',
          }} className="slide-grid">

            <div style={{
              background: 'linear-gradient(135deg,#0d1117,#0d1520)',
              border: '1px solid #009ee330', borderRadius: 16,
              padding: 'clamp(20px,4vw,32px)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 60% at 50% 30%, rgba(0,158,227,0.07), transparent)', pointerEvents: 'none' }} />
              {/* Logo FC26 SVG inline */}
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="32" cy="32" r="30" fill="#0d2040" stroke="#009ee3" strokeWidth="2"/>
                <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="22" fill="#009ee3">FC</text>
                <text x="50%" y="74%" dominantBaseline="middle" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="14" fill="#ffffff">26</text>
              </svg>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1rem,3vw,1.4rem)', fontWeight: 900, color: '#009ee3', letterSpacing: 2, textAlign: 'center' }}>EA SPORTS FC 26</div>
              <div style={{ background: 'rgba(0,158,227,0.12)', border: '1px solid #009ee340', borderRadius: 30, padding: '4px 14px', fontSize: '0.65rem', fontFamily: "'Orbitron',sans-serif", color: '#009ee3', fontWeight: 700, letterSpacing: 1 }}>
                🌐 CROSSPLAY · PS/XBOX/PC
              </div>
              <div style={{ color: '#8b949e', fontSize: '0.73rem', textAlign: 'center', lineHeight: 1.6, marginTop: 4 }}>
                El fútbol más realista del mercado.<br/>Competí con premios en LFA.
              </div>
            </div>

            <div style={{
              background: '#0d1117', border: '1px solid #009ee320', borderRadius: 16,
              padding: 'clamp(16px,3vw,28px)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', color: '#009ee3', fontWeight: 900, letterSpacing: 2, borderBottom: '1px solid #1c2028', paddingBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: stats.fc26_vivo > 0 ? '#009ee3' : '#4a5568', display: 'inline-block', animation: stats.fc26_vivo > 0 ? 'livePulse 1s ease-in-out infinite' : 'none' }} />
                EN VIVO — FC 26 LFA
              </div>
              {[
                { l: 'PARTIDAS EN VIVO',      v: stats.fc26_vivo,                          c: '#009ee3', live: true },
                { l: 'TORNEOS ABIERTOS',       v: stats.fc26_torneos,                       c: '#009ee3' },
                { l: 'JUGADORES EN LFA',       v: stats.fc26_jugadores || stats.jugadores,  c: '#e6edf3' },
                { l: 'PARTIDAS HOY',           v: stats.fc26_hoy || stats.partidas_hoy,     c: '#8b949e' },
              ].map(row => (
                <div key={row.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {row.live && row.v > 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#009ee3', display: 'inline-block', animation: 'livePulse 1s ease-in-out infinite', flexShrink: 0 }} />}
                    <span style={{ fontSize: '0.65rem', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1 }}>{row.l}</span>
                  </div>
                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: 'clamp(1rem,2.5vw,1.3rem)', color: row.c }}>{statsLoaded ? row.v.toLocaleString('es-AR') : '…'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── SLIDE 2: PLATAFORMA (stats generales) ── */}
          <div style={{
            display: slideIndex === 2 ? 'block' : 'none',
            animation: slideIndex === 2 ? 'slideIn 0.4s ease' : 'none',
          }}>
            <div style={{
              background: 'linear-gradient(135deg,#0d1117,#0d1117)',
              border: '1px solid #1c2028', borderRadius: 16, overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                padding: '14px 22px', borderBottom: '1px solid #1c2028',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', display: 'inline-block', boxShadow: '0 0 8px #00ff88', animation: 'livePulse 1.5s ease-in-out infinite' }} />
                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, color: '#00ff88', letterSpacing: 2 }}>PLATAFORMA LFA — EN VIVO</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid #ffd70030', borderRadius: 20, padding: '3px 10px', fontSize: '0.58rem', color: '#ffd700', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>⭐ eFOOTBALL</span>
                  <span style={{ background: 'rgba(0,158,227,0.08)', border: '1px solid #009ee330', borderRadius: 20, padding: '3px 10px', fontSize: '0.58rem', color: '#009ee3', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>⚽ FC 26</span>
                </div>
              </div>

              {/* Grid 4 stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
                {[
                  { icon: '🏆', label: 'TORNEOS TOTALES', value: stats.torneos, color: '#ffd700' },
                  { icon: '👥', label: 'JUGADORES', value: stats.jugadores, color: '#00ff88' },
                  { icon: '🔴', label: 'EN VIVO AHORA', value: stats.en_vivo, color: '#ff4757', live: true },
                  { icon: '📋', label: 'PARTIDAS HOY', value: stats.partidas_hoy, color: '#8b949e' },
                ].map((s, i) => (
                  <div key={s.label} style={{
                    padding: 'clamp(14px,2.5vw,22px) clamp(12px,2vw,20px)',
                    borderRight: i < 3 ? '1px solid #1c2028' : 'none',
                    position: 'relative',
                  }}>
                    <div style={{ fontSize: '0.58rem', fontFamily: "'Orbitron',sans-serif", color: '#4a5568', letterSpacing: 2, marginBottom: 8 }}>{s.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: '1.4rem' }}>{s.icon}</span>
                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.4rem,3.5vw,2rem)', fontWeight: 900, color: s.live && s.value > 0 ? '#ff4757' : s.color, lineHeight: 1 }}>
                      {statsLoaded ? s.value.toLocaleString('es-AR') : '…'}
                      </span>
                    </div>
                    {s.live && s.value > 0 && <div style={{ position: 'absolute', top: 12, right: 12, width: 7, height: 7, borderRadius: '50%', background: '#ff4757', animation: 'livePulse 1s ease-in-out infinite' }} />}
                  </div>
                ))}
              </div>

              {/* Desglose por juego */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #1c2028' }}>
                <div style={{ padding: 'clamp(10px,2vw,16px) clamp(14px,2.5vw,22px)', display: 'flex', alignItems: 'center', gap: 12, borderRight: '1px solid #1c2028' }}>
                  <svg width="32" height="32" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" fill="#1a1a1a" stroke="#ffd700" strokeWidth="2"/><polygon points="32,10 38,26 55,26 42,36 47,52 32,42 17,52 22,36 9,26 26,26" fill="#ffd700"/></svg>
                  <div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: '#ffd700', fontWeight: 900, letterSpacing: 1 }}>eFOOTBALL</div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#e6edf3', fontSize: 'clamp(0.9rem,2vw,1.1rem)' }}>
                      {statsLoaded ? stats.efb_vivo : '…'} <span style={{ fontSize: '0.6rem', color: '#4a5568', fontWeight: 400 }}>en vivo</span>
                    </div>
                  </div>
                </div>
                <div style={{ padding: 'clamp(10px,2vw,16px) clamp(14px,2.5vw,22px)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <svg width="32" height="32" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" fill="#0d2040" stroke="#009ee3" strokeWidth="2"/><text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontFamily="Arial Black,sans-serif" fontWeight="900" fontSize="22" fill="#009ee3">FC</text><text x="50%" y="74%" dominantBaseline="middle" textAnchor="middle" fontFamily="Arial Black,sans-serif" fontWeight="900" fontSize="14" fill="#ffffff">26</text></svg>
                  <div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: '#009ee3', fontWeight: 900, letterSpacing: 1 }}>EA SPORTS FC 26</div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#e6edf3', fontSize: 'clamp(0.9rem,2vw,1.1rem)' }}>
                      {statsLoaded ? stats.fc26_vivo : '…'} <span style={{ fontSize: '0.6rem', color: '#4a5568', fontWeight: 400 }}>en vivo</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* ══════════════════════════════════════════════
            MODOS DE JUEGO
        ══════════════════════════════════════════════ */}
        <section style={{ padding: 'clamp(40px,8vw,80px) 20px', maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", textAlign: 'center', fontSize: 'clamp(1rem,3vw,1.3rem)', fontWeight: 900, color: 'white', marginBottom: 10, letterSpacing: 2 }}>{t.home_modos_title}</h2>
          <p style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginBottom: 36 }}>{t.home_modos_sub}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
            {MODOS.map(m => (
              <div key={m.title} style={{ background: '#161b22', border: `1px solid ${m.color}22`, borderTop: `3px solid ${m.pronto ? '#30363d' : m.color}`, borderRadius: 14, padding: '24px 18px', textAlign: 'center', opacity: m.pronto ? 0.5 : 1, position: 'relative', transition: '0.2s' }}>
                {m.pronto && <div style={{ position: 'absolute', top: 10, right: 10, background: '#30363d', color: '#8b949e', fontSize: '0.55rem', fontFamily: "'Orbitron',sans-serif", padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>{t.hub_pronto}</div>}
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>{m.icon}</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.78rem', fontWeight: 900, color: m.pronto ? '#4a5568' : m.color, marginBottom: 2, letterSpacing: 1 }}>{m.title}</div>
                {'sub' in m && m.sub && <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: '#4a5568', marginBottom: 8, letterSpacing: 1 }}>{m.sub}</div>}
                {!('sub' in m && m.sub) && <div style={{ marginBottom: 8 }} />}
                <div style={{ color: '#8b949e', fontSize: '0.75rem', lineHeight: 1.5 }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            CÓMO FUNCIONA
        ══════════════════════════════════════════════ */}
        <section style={{ padding: 'clamp(40px,8vw,80px) 20px', background: '#0d1117', borderTop: '1px solid #1c2028', borderBottom: '1px solid #1c2028' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <h2 style={{ fontFamily: "'Orbitron',sans-serif", textAlign: 'center', fontSize: 'clamp(1rem,3vw,1.3rem)', fontWeight: 900, color: 'white', marginBottom: 10, letterSpacing: 2 }}>{t.home_como_title}</h2>
            <p style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginBottom: 40 }}>{t.home_como_sub}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 20 }}>
              {PASOS.map((p, i) => (
                <div key={p.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,255,136,0.08)', border: '2px solid rgba(0,255,136,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#00ff88', fontSize: '1rem' }}>{p.n}</div>
                  {i < PASOS.length - 1 && <div style={{ display: 'none' }} />}
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.78rem', fontWeight: 900, color: 'white', letterSpacing: 1 }}>{p.title}</div>
                  <div style={{ color: '#8b949e', fontSize: '0.75rem', lineHeight: 1.6 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            LOGIN / REGISTRO
        ══════════════════════════════════════════════ */}
        <section ref={loginRef} style={{ padding: 'clamp(40px,8vw,80px) 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1rem,3vw,1.3rem)', fontWeight: 900, color: 'white', marginBottom: 8, letterSpacing: 2, textAlign: 'center' }}>{t.home_listo_title}</h2>
          <p style={{ color: '#4a5568', fontSize: '0.82rem', marginBottom: 32, textAlign: 'center' }}>{t.home_listo_sub}</p>
          <LoginBox t={t} />
        </section>

        <SiteFooter t={t} />
      </div>

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .slide-grid {
          grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        }
        @media (max-width: 540px) {
          .slide-grid {
            grid-template-columns: 1fr !important;
          }
        }
        .login-box { width: 100%; max-width: 320px; }
        input.caja-texto {
          width: 100%;
          padding: 12px;
          margin-bottom: 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid #30363d;
          color: white;
          border-radius: 8px;
          box-sizing: border-box;
          font-family: 'Roboto', sans-serif;
          outline: none;
          transition: 0.3s;
          font-size: 0.9rem;
        }
        input.caja-texto:focus { border-color: #00ff88; background: rgba(255,255,255,0.05); }
        input.caja-texto:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #0b0e14 inset !important;
          -webkit-text-fill-color: white !important;
        }
        .forgot-pass { font-size: 0.75rem; color: #8b949e; text-decoration: underline; cursor: pointer; display: block; text-align: right; margin-top: -5px; margin-bottom: 15px; transition: 0.3s; }
        .forgot-pass:hover { color: #00ff88; }
        .btn-main { width: 100%; padding: 12px; background: #00a859; color: white; border: none; border-radius: 8px; font-family: 'Orbitron', sans-serif; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 0.95rem; letter-spacing: 1px; }
        .btn-main:hover { background: #00ff88; color: black; box-shadow: 0 0 15px rgba(0,255,136,0.4); }
        .btn-main:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-secondary { background: transparent; border: 1px solid #8b949e; color: white; padding: 12px; border-radius: 8px; font-family: 'Orbitron', sans-serif; font-weight: bold; cursor: pointer; transition: 0.3s; width: 100%; }
        .btn-secondary:hover { background: rgba(255,255,255,0.1); }
        .btn-google { background: #ced4da !important; color: black !important; display: flex !important; justify-content: center !important; align-items: center !important; gap: 10px !important; font-family: 'Roboto', sans-serif !important; font-weight: bold !important; }
        .btn-google:hover { background: #e9ecef !important; box-shadow: none !important; }
        .divider { display: flex; align-items: center; margin: 15px 0; color: #8b949e; font-size: 0.75rem; }
        .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #30363d; margin: 0 10px; }
        .terms { font-size: 0.75rem; color: #8b949e; margin-top: 15px; display: flex; align-items: flex-start; justify-content: flex-start; gap: 8px; text-align: left; line-height: 1.4; }
        .terms input { width: 16px; height: 16px; margin: 2px 0 0 0; cursor: pointer; flex-shrink: 0; }
        .link-reg { color: #00ff88; text-decoration: underline; cursor: pointer; font-weight: bold; transition: 0.3s; }
        .link-reg:hover { color: white; }
      `}</style>
    </>
  );
}

