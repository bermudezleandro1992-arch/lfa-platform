'use client';

import { useState, useRef, useEffect } from 'react';

interface IntroOverlayProps {
  onSkip: () => void;
}

export default function IntroOverlay({ onSkip }: IntroOverlayProps) {
  const [showVideo, setShowVideo]     = useState(false);
  const [visible,   setVisible]       = useState(true);
  const videoRef                      = useRef<HTMLVideoElement>(null);

  // Fade-out y desmontaje
  const handleSkip = () => {
    setVisible(false);
    setTimeout(onSkip, 900); // duración del fade
  };

  const handlePlay = () => {
    setShowVideo(true);
    videoRef.current?.play();
  };

  // Cuando el video termina, saltar
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.onended = handleSkip;
    return () => { vid.onended = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col justify-center items-center transition-opacity duration-900"
      style={{
        background: '#050508',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.9s ease',
      }}
    >
      {/* ── Pantalla de bienvenida ─────────────────────────────── */}
      {!showVideo && (
        <div className="text-center px-5 animate-fade-in">
          {/* Corona */}
          <div className="text-lfa-gold text-6xl mb-5">♛</div>

          {/* Logo */}
          <h1
            className="title-orbitron text-white font-black m-0 leading-none"
            style={{
              fontSize: '4rem',
              textShadow: '0 0 20px #00ff88',
            }}
          >
            LFA
          </h1>

          {/* Sub-tagline */}
          <p
            className="title-orbitron text-lfa-neon font-bold mb-10"
            style={{ letterSpacing: '5px', marginTop: '8px' }}
          >
            E-SPORTS DE ÉLITE
          </p>

          {/* Botón reproducir */}
          <button
            onClick={handlePlay}
            className="flex items-center gap-3 mx-auto px-10 py-4 rounded-lg font-bold text-black bg-lfa-neon
                       title-orbitron text-xl cursor-pointer transition-all duration-300
                       shadow-[0_0_30px_rgba(0,255,136,0.6)] hover:shadow-[0_0_45px_rgba(0,255,136,0.8)]
                       hover:scale-105 active:scale-95"
          >
            <PlayIcon />
            VER CÓMO FUNCIONA
          </button>

          {/* Saltar */}
          <span
            onClick={handleSkip}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleSkip()}
            className="block mt-8 text-lfa-text underline text-sm cursor-pointer
                       hover:text-lfa-neon transition-colors duration-200"
          >
            Ya tengo cuenta, ir directo al Login &gt;&gt;
          </span>
        </div>
      )}

      {/* ── Pantalla de video ─────────────────────────────────── */}
      {showVideo && (
        <div className="absolute inset-0 bg-black">
          <video
            ref={videoRef}
            className="w-full h-full"
            style={{ objectFit: 'contain', background: 'black' }}
            playsInline
            loop={false}
          >
            <source src="/assets/intro_lfa.mp4" type="video/mp4" />
          </video>

          {/* Botón saltar superpuesto */}
          <button
            onClick={handleSkip}
            className="absolute bottom-10 right-10 z-10
                       px-5 py-2.5 rounded-md font-bold
                       border border-lfa-neon text-white bg-black/80
                       title-orbitron text-sm tracking-wider
                       hover:bg-lfa-neon hover:text-black transition-all duration-200"
          >
            ⏭ Saltar Intro
          </button>
        </div>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
