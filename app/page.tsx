'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getCountFromServer, collection } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

import IntroOverlay  from '@/app/_components/IntroOverlay';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';
import SiteFooter    from '@/app/_components/SiteFooter';
import LoginBox      from '@/app/auth/_components/LoginBox';

const MODOS = [
  { icon: '⚔️', title: 'ARENA 1VS1',  desc: 'Salas de 2 a 16 jugadores. Bracket automático, resultados verificados por el bot. Torneos free y pagos.',  color: '#00ff88' },
  { icon: '📅', title: 'LIGA 1VS1',   desc: 'Temporadas largas con tabla de posiciones y ranking oficial. Torneos free y pagos.',  color: '#ffd700' },
  { icon: '🤝', title: 'CO-OP 2VS2',  desc: 'Armá equipo con un amigo y competí en pareja.',  color: '#009ee3', pronto: true },
  { icon: '🏛️', title: 'LIGA LFA', sub: 'Clubes FC 26', desc: 'Representá tu club oficial. Primera división de la liga.', color: '#a371f7', pronto: true },
];

const PASOS = [
  { n: '01', title: 'REGISTRATE', desc: 'Creá tu cuenta gratis con email, Google o Facebook en menos de 1 minuto.' },
  { n: '02', title: 'ELEGÍ UN TORNEO', desc: 'Salas de 2, 4, 6, 8 y 16 jugadores todo el día — 32 y 64 los fines de semana. Gratis o con LFA Coin, la moneda de SOMOS LFA.' },
  { n: '03', title: 'JUGÁ Y COBRÁ', desc: 'Subí tu resultado, el bot verifica que sea correcto, actualiza el bracket automáticamente y entrega el premio al ganador.' },
];

export default function HomePage() {
  const router               = useRouter();
  const { lang, setLang, t } = useLang();
  const [showIntro,    setShowIntro]   = useState(true);
  const [authChecked,  setAuthChecked] = useState(false);
  const [stats, setStats] = useState({ jugadores: 0, torneos: 0 });
  const loginRef = useRef<HTMLDivElement>(null);

  // Cargar stats públicos (sin auth)
  useEffect(() => {
    Promise.all([
      getCountFromServer(collection(db, 'usuarios')).catch(() => null),
      getCountFromServer(collection(db, 'tournaments')).catch(() => null),
    ]).then(([u, t]) => {
      setStats({
        jugadores: u?.data().count ?? 0,
        torneos:   t?.data().count ?? 0,
      });
    });
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
        <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px 40px', position: 'relative', overflow: 'hidden' }}>

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
            Torneos de <strong style={{ color: '#00ff88' }}>FC 26</strong> y <strong style={{ color: '#009ee3' }}>eFootball</strong> con premios reales.<br />
            Competí 1vs1, armá equipo y dominá los torneos.<br />
            <span style={{ color: '#ffd700', fontSize: '0.9em' }}>🏆 Top Ranking · Brackets automáticos · Bot verificador</span>
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 48 }}>
            <button onClick={scrollToLogin} style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.85rem', background: 'linear-gradient(135deg,#00ff88,#00a859)', color: '#0b0e14', border: 'none', borderRadius: 12, padding: '14px 32px', cursor: 'pointer', letterSpacing: 1, boxShadow: '0 0 24px rgba(0,255,136,0.35)', transition: '0.2s' }}>
              🎮 CREAR CUENTA GRATIS
            </button>
            <button onClick={scrollToLogin} style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: '0.85rem', background: 'transparent', color: '#8b949e', border: '1px solid #30363d', borderRadius: 12, padding: '14px 28px', cursor: 'pointer', transition: '0.2s' }}>
              YA TENGO CUENTA →
            </button>
          </div>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 'clamp(20px,5vw,48px)', flexWrap: 'wrap', justifyContent: 'center', borderTop: '1px solid #1c2028', paddingTop: 28 }}>
            {[
              { v: stats.torneos > 0 ? stats.torneos.toLocaleString('es-AR') : '—', l: 'TORNEOS' },
              { v: stats.jugadores > 0 ? stats.jugadores.toLocaleString('es-AR') : '—', l: 'JUGADORES' },
              { v: 'FC26 + EFB', l: 'JUEGOS' },
              { v: 'LATAM', l: 'NORTE Y SUR' },
            ].map(s => (
              <div key={s.l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.2rem,3vw,1.6rem)', fontWeight: 900, color: '#00ff88' }}>{s.v}</div>
                <div style={{ fontSize: '0.65rem', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", letterSpacing: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            MODOS DE JUEGO
        ══════════════════════════════════════════════ */}
        <section style={{ padding: 'clamp(40px,8vw,80px) 20px', maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", textAlign: 'center', fontSize: 'clamp(1rem,3vw,1.3rem)', fontWeight: 900, color: 'white', marginBottom: 10, letterSpacing: 2 }}>MODOS DE COMPETICIÓN</h2>
          <p style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginBottom: 36 }}>Elegí tu formato favorito</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
            {MODOS.map(m => (
              <div key={m.title} style={{ background: '#161b22', border: `1px solid ${m.color}22`, borderTop: `3px solid ${m.pronto ? '#30363d' : m.color}`, borderRadius: 14, padding: '24px 18px', textAlign: 'center', opacity: m.pronto ? 0.5 : 1, position: 'relative', transition: '0.2s' }}>
                {m.pronto && <div style={{ position: 'absolute', top: 10, right: 10, background: '#30363d', color: '#8b949e', fontSize: '0.55rem', fontFamily: "'Orbitron',sans-serif", padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>PRONTO</div>}
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
            <h2 style={{ fontFamily: "'Orbitron',sans-serif", textAlign: 'center', fontSize: 'clamp(1rem,3vw,1.3rem)', fontWeight: 900, color: 'white', marginBottom: 10, letterSpacing: 2 }}>¿CÓMO FUNCIONA?</h2>
            <p style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginBottom: 40 }}>Simple, rápido, transparente</p>
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
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1rem,3vw,1.3rem)', fontWeight: 900, color: 'white', marginBottom: 8, letterSpacing: 2, textAlign: 'center' }}>¿LISTO PARA COMPETIR?</h2>
          <p style={{ color: '#4a5568', fontSize: '0.82rem', marginBottom: 32, textAlign: 'center' }}>Creá tu cuenta gratis o iniciá sesión</p>
          <LoginBox t={t} />
        </section>

        <SiteFooter t={t} />
      </div>

      <style>{`
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

