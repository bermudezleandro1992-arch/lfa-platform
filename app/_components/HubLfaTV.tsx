'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/* ─── Tipos ─────────────────────────────────────────── */
interface StreamerDB {
  uid: string;
  nombre?: string;
  avatar_url?: string;
  twitch_canal?: string;
  kick_canal?: string;
  youtube_canal?: string;
}

/* ─── Canal oficial LFA (siempre presente) ─────────── */
const OFICIAL = { canal: 'somoslfa', plat: 'kick' as const };

function getEmbedUrl(plat: string, canal: string, parent: string) {
  if (plat === 'kick')    return `https://player.kick.com/${canal}?muted=true&autoplay=false`;
  if (plat === 'twitch')  return `https://player.twitch.tv/?channel=${canal}&parent=${parent}&muted=true&autoplay=false`;
  if (plat === 'youtube') return `https://www.youtube.com/embed/live_stream?channel=${canal}&autoplay=0&mute=1`;
  return '';
}

function getChannel(s: StreamerDB): { plat: string; canal: string } | null {
  if (s.kick_canal)    return { plat: 'kick',    canal: s.kick_canal };
  if (s.twitch_canal)  return { plat: 'twitch',  canal: s.twitch_canal };
  if (s.youtube_canal) return { plat: 'youtube', canal: s.youtube_canal };
  return null;
}

/* ═══════════════════════════════════════════════════ */
export default function HubLfaTV() {
  const [parent,   setParent]   = useState('localhost');
  const [streams,  setStreams]  = useState<{ uid: string; nombre: string; avatar?: string; plat: string; canal: string }[]>([]);
  const [selected, setSelected] = useState<number>(0); // índice del stream grande
  const [loaded,   setLoaded]   = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setParent(window.location.hostname);
  }, []);

  useEffect(() => {
    const fetch = async () => {
      try {
        const seen = new Set<string>();
        const list: typeof streams = [];

        const addSnap = (snap: import('firebase/firestore').QuerySnapshot) => {
          snap.forEach(d => {
            if (seen.has(d.id)) return;
            seen.add(d.id);
            const data = d.data() as StreamerDB;
            const ch = getChannel(data);
            if (!ch) return;
            list.push({ uid: d.id, nombre: data.nombre || ch.canal, avatar: data.avatar_url, ...ch });
          });
        };

        // Queries separadas para no perder resultados si una falla
        try { addSnap(await getDocs(query(collection(db, 'usuarios'), where('kick_canal',    '>', ''), limit(10)))); } catch { /* ok */ }
        try { addSnap(await getDocs(query(collection(db, 'usuarios'), where('twitch_canal',  '>', ''), limit(10)))); } catch { /* ok */ }
        try { addSnap(await getDocs(query(collection(db, 'usuarios'), where('youtube_canal', '>', ''), limit(10)))); } catch { /* ok */ }

        // Oficial siempre primero
        const withOficial = [
          { uid: '__lfa_oficial__', nombre: 'LFA OFICIAL', plat: OFICIAL.plat, canal: OFICIAL.canal },
          ...list.filter(s => s.canal !== OFICIAL.canal).slice(0, 5),
        ];
        setStreams(withOficial);
      } catch { /* ok */ }
      setLoaded(true);
    };
    fetch();
  }, []);

  const mainStream = streams[selected];
  const thumbs     = streams.slice(0, 6);
  const hasPlayers = streams.length > 1;

  return (
    <>
      <style>{`
        @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.55;transform:scale(1.15)} }
        @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        .lfatv-thumb { transition: all .18s ease; cursor: pointer; }
        .lfatv-thumb:hover { border-color: rgba(255,71,87,0.6) !important; transform: scale(1.03); }
      `}</style>

      <div style={{ marginBottom: 40 }}>

        {/* ── HEADER LFA TV ─────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%',
              background: '#ff4757', display: 'inline-block',
              animation: 'livePulse 1.4s ease infinite',
              boxShadow: '0 0 10px #ff4757',
            }} />
            <h2 style={{ fontFamily: "'Orbitron',sans-serif", color: 'white', margin: 0, fontSize: 'clamp(1rem,3vw,1.25rem)', fontWeight: 900 }}>
              <span style={{ color: '#ff4757' }}>LFA</span> TV
            </h2>
            <span style={{ background: '#ff4757', color: 'white', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.55rem', padding: '2px 8px', borderRadius: 4, letterSpacing: 1.5 }}>EN VIVO</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ color: '#8b949e', fontSize: '0.7rem', fontFamily: "'Orbitron',sans-serif", letterSpacing: 0.5 }}>
            somoslfa.com · FC26 &amp; eFootball Crossplay
          </div>
        </div>

        {/* ── PANTALLA PRINCIPAL ─────────────────────── */}
        <div style={{ position: 'relative', width: '100%', paddingBottom: hasPlayers ? '50%' : '56.25%', background: '#000', borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(255,71,87,0.2)', boxShadow: '0 12px 40px rgba(0,0,0,0.7), 0 0 30px rgba(255,71,87,0.06)', marginBottom: hasPlayers ? 10 : 0 }}>

          {/* Scanline decorativo (efecto TV) */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px)' }} />

          {/* Watermark LFA TV */}
          <div style={{ position: 'absolute', bottom: 12, left: 14, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: 'clamp(0.7rem,2vw,1rem)', color: 'white', textShadow: '0 0 12px rgba(0,0,0,0.9)', letterSpacing: 1 }}>
              <span style={{ color: '#ff4757' }}>LFA</span> TV
            </div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', textShadow: '0 0 8px rgba(0,0,0,0.9)' }}>
              somoslfa.com
            </div>
          </div>

          {/* Canal activo label */}
          {mainStream && (
            <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 5, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,71,87,0.4)', borderRadius: 6, padding: '4px 10px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: mainStream.uid === '__lfa_oficial__' ? '#ff4757' : '#00ff88', fontWeight: 900, backdropFilter: 'blur(4px)' }}>
              {mainStream.uid === '__lfa_oficial__' ? '⭐ CANAL OFICIAL' : `🎮 ${mainStream.nombre}`}
            </div>
          )}

          {/* Iframe principal */}
          {loaded && mainStream ? (
            <iframe
              key={mainStream.canal}
              src={getEmbedUrl(mainStream.plat, mainStream.canal, parent)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              allowFullScreen
              allow="autoplay; fullscreen"
              title="LFA TV"
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.4rem,5vw,2.2rem)', color: '#ff4757', fontWeight: 900 }}>LFA TV</div>
              <div style={{ color: '#8b949e', fontSize: '0.8rem' }}>Cargando transmisión...</div>
            </div>
          )}
        </div>

        {/* ── GRID DE PANTALLAS CHICAS ───────────────── */}
        {hasPlayers && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {thumbs.map((s, i) => {
              const isActive = i === selected;
              return (
                <div
                  key={s.uid}
                  className="lfatv-thumb"
                  onClick={() => setSelected(i)}
                  style={{
                    position: 'relative',
                    paddingBottom: '38%',
                    background: '#0d1117',
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: `2px solid ${isActive ? '#ff4757' : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: isActive ? '0 0 10px rgba(255,71,87,0.3)' : 'none',
                  }}
                >
                  <iframe
                    key={s.canal}
                    src={getEmbedUrl(s.plat, s.canal, parent)}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                    title={s.nombre}
                    loading="lazy"
                  />
                  {/* Overlay con nombre */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', padding: '8px 6px 5px', pointerEvents: 'none' }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.55rem', color: s.uid === '__lfa_oficial__' ? '#ff4757' : '#00ff88', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.uid === '__lfa_oficial__' ? '⭐ LFA OFICIAL' : `🎮 ${s.nombre}`}
                    </div>
                  </div>
                  {/* Click blocker para que el click seleccione el stream */}
                  <div style={{ position: 'absolute', inset: 0, zIndex: 10 }} />
                </div>
              );
            })}
          </div>
        )}

        {/* ── CTA STREAMER ───────────────────────────── */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.12)', borderRadius: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: '0.72rem', color: '#8b949e' }}>
            ¿Estás transmitiendo un partido LFA? <span style={{ color: '#00ff88' }}>Agregá tu canal en tu perfil y aparecés acá.</span>
          </div>
          <a href="/perfil" style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', fontWeight: 900, color: '#ff4757', border: '1px solid rgba(255,71,87,0.35)', padding: '5px 12px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            MI PERFIL →
          </a>
        </div>

      </div>
    </>
  );
}
