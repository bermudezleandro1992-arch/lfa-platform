'use client';

/**
 * app/page.tsx — Migración 1:1 de public/index.html
 *
 * Estructura:
 *   IntroOverlay (pantalla cinematográfica)
 *   LangDropdown (selector de idioma top-right)
 *   <main>  Logo + slogan + LoginBox
 *   <footer> SiteFooter
 *
 * Look & feel: idéntico al HTML original (mismos colores, tipografías,
 * layout flex column, clases CSS heredadas en globals.css).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

import IntroOverlay  from '@/app/_components/IntroOverlay';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';
import SiteFooter    from '@/app/_components/SiteFooter';
import LoginBox      from '@/app/auth/_components/LoginBox';

export default function HomePage() {
  const router                         = useRouter();
  const { lang, setLang, t }           = useLang();
  const [showIntro,    setShowIntro]   = useState(true);
  const [authChecked,  setAuthChecked] = useState(false);

  // Si ya tiene sesión activa y aceptó términos → redirige al hub
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user && user.emailVerified) {
        try {
          const snap = await getDoc(doc(db, 'usuarios', user.uid));
          if (snap.exists() && (snap.data() as Record<string, unknown>).terminos_aceptados) {
            router.replace('/hub');
            return;
          }
        } catch { /* sin red — dejar en login */ }
      }
      setAuthChecked(true);
    });
    return unsub;
  }, [router]);

  // Mientras verifica auth no renderiza nada para evitar flash
  if (!authChecked) return null;

  return (
    <>
      {/* ── Intro cinematográfica ──────────────────────────── */}
      {showIntro && <IntroOverlay onSkip={() => setShowIntro(false)} />}

      {/* ── Página principal (mismo layout del HTML) ───────── */}
      <div
        style={{
          margin: 0,
          fontFamily: 'Roboto, sans-serif',
          background: '#0b0e14',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          justifyContent: 'space-between',
          position: 'relative',
        }}
      >
        {/* Selector de idioma — posición absolute top-right */}
        <LangDropdown lang={lang} setLang={setLang} />

        {/* ── MAIN ─────────────────────────────────────────── */}
        <main className="main-content">

          {/* Logo box */}
          <div className="logo-box" aria-hidden="true">
            <span style={{ color: '#ffd700', fontSize: '1.5rem', marginBottom: '3px' }}>♛</span>
            <span className="lfa-title-style">LFA</span>
            <div className="stars">★ ★ ★</div>
          </div>

          {/* Slogan */}
          <h1 className="slogan">
            <span>{t.slogan1}</span>
            <span>{t.slogan2}</span>
          </h1>

          {/* Login/Registro */}
          <LoginBox t={t} />
        </main>

        {/* ── FOOTER ───────────────────────────────────────── */}
        <SiteFooter t={t} />
      </div>

      {/* Estilos heredados del HTML original — CSS en cascada */}
      <style>{`
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 15px;
          margin-top: 15px;
        }
        .logo-box {
          background: #0b0e14;
          border: 2px solid #00ff88;
          padding: 15px 25px;
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          box-shadow: 0 0 20px rgba(0,255,136,0.15);
          margin-bottom: 15px;
        }
        .lfa-title-style {
          margin: 0;
          font-family: 'Orbitron', sans-serif;
          font-size: 3rem;
          color: #f0f6fc;
          letter-spacing: 2px;
          line-height: 1;
          font-weight: 900;
          display: block;
        }
        .stars {
          color: #00ff88;
          font-size: 1rem;
          margin-top: 3px;
          letter-spacing: 5px;
        }
        .slogan {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.95rem;
          text-align: center;
          letter-spacing: 1px;
          margin-bottom: 20px;
          line-height: 1.5;
          font-weight: normal;
          margin-top: 0;
        }
        .slogan span {
          color: #00ff88;
          font-weight: bold;
          font-size: 1.15rem;
          display: block;
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
        input.caja-texto:focus {
          border-color: #00ff88;
          background: rgba(255,255,255,0.05);
        }
        input.caja-texto:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #0b0e14 inset !important;
          -webkit-text-fill-color: white !important;
        }
        .forgot-pass {
          font-size: 0.75rem;
          color: #8b949e;
          text-decoration: underline;
          cursor: pointer;
          display: block;
          text-align: right;
          margin-top: -5px;
          margin-bottom: 15px;
          transition: 0.3s;
        }
        .forgot-pass:hover { color: #00ff88; }
        .btn-main {
          width: 100%;
          padding: 12px;
          background: #00a859;
          color: white;
          border: none;
          border-radius: 8px;
          font-family: 'Orbitron', sans-serif;
          font-weight: bold;
          cursor: pointer;
          transition: 0.3s;
          font-size: 0.95rem;
          letter-spacing: 1px;
        }
        .btn-main:hover {
          background: #00ff88;
          color: black;
          box-shadow: 0 0 15px rgba(0,255,136,0.4);
        }
        .btn-main:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-secondary {
          background: transparent;
          border: 1px solid #8b949e;
          color: white;
          padding: 12px;
          border-radius: 8px;
          font-family: 'Orbitron', sans-serif;
          font-weight: bold;
          cursor: pointer;
          transition: 0.3s;
          width: 100%;
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.1); }
        .btn-google {
          background: #ced4da !important;
          color: black !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 10px !important;
          font-family: 'Roboto', sans-serif !important;
          font-weight: bold !important;
        }
        .btn-google:hover { background: #e9ecef !important; box-shadow: none !important; }
        .divider {
          display: flex;
          align-items: center;
          margin: 15px 0;
          color: #8b949e;
          font-size: 0.75rem;
        }
        .divider::before, .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #30363d;
          margin: 0 10px;
        }
        .terms {
          font-size: 0.75rem;
          color: #8b949e;
          margin-top: 15px;
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 8px;
          text-align: left;
          line-height: 1.4;
        }
        .terms input { width: 16px; height: 16px; margin: 2px 0 0 0; cursor: pointer; flex-shrink: 0; }
        .link-reg {
          color: #00ff88;
          text-decoration: underline;
          cursor: pointer;
          font-weight: bold;
          transition: 0.3s;
        }
        .link-reg:hover { color: white; }
      `}</style>
    </>
  );
}
