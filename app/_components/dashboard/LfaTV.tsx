'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/* ─── Tipos ─────────────────────────────────────────── */
interface Streamer {
  uid: string; nombre?: string; avatar_url?: string;
  twitch_canal?: string; kick_canal?: string; youtube_canal?: string;
}

/* ─── Canales oficiales LFA ─────────────────────────── */
const LFA_OFICIAL_CANAL = 'somoslfa';
const LFA_OFICIAL_PLAT  = 'kick';

/* ─── Helper: extraer plataforma activa ─────────────── */
function getPlatform(s: Streamer): 'twitch' | 'kick' | 'youtube' | null {
  if (s.twitch_canal)  return 'twitch';
  if (s.kick_canal)    return 'kick';
  if (s.youtube_canal) return 'youtube';
  return null;
}

function embedUrl(plat: 'twitch' | 'kick' | 'youtube', canal: string, parent: string) {
  if (plat === 'twitch')  return `https://player.twitch.tv/?channel=${canal}&parent=${parent}&muted=true&autoplay=false`;
  if (plat === 'kick')    return `https://player.kick.com/${canal}`;
  if (plat === 'youtube') return `https://www.youtube.com/embed/live_stream?channel=${canal}&autoplay=0`;
  return '';
}



/* ═══════════════════════════════════════════════════ */
export default function LfaTV({ uid }: { uid: string }) {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [gameTab,   setGameTab]   = useState<'todos'|'FC26'|'EFOOTBALL'>('todos');
  const [parent,    setParent]    = useState('localhost');

  useEffect(() => {
    if (typeof window !== 'undefined') setParent(window.location.hostname);
  }, []);

  useEffect(() => {
    const fetchStreamers = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'usuarios'),
          where('twitch_canal', '!=', ''),
          limit(40)
        ));
        const list: Streamer[] = [];
        snap.forEach(d => {
          const data = d.data() as Streamer;
          if (data.twitch_canal || data.kick_canal || data.youtube_canal) {
            list.push({ ...data, uid: d.id });
          }
        });
        // También traer los que solo tienen kick o youtube
        const snap2 = await getDocs(query(collection(db, 'usuarios'), where('kick_canal', '!=', ''), limit(20)));
        snap2.forEach(d => {
          if (!list.find(s => s.uid === d.id)) list.push({ ...d.data() as Streamer, uid: d.id });
        });
        setStreamers(list.filter(s => s.uid !== 'somoslfa_oficial').slice(0, 20));
      } catch { /* ok */ }
    };
    fetchStreamers();
  }, []);

  const featuredEmbed = embedUrl(LFA_OFICIAL_PLAT, LFA_OFICIAL_CANAL, parent);

  return (
    <>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .tvcard:hover{border-color:rgba(0,255,136,0.3)!important;transform:translateY(-2px)}
        .tvcard{transition:all .2s ease}
      `}</style>

      <div style={{ background: '#0b0e14', minHeight: 'calc(100vh - 52px)', color: 'white', fontFamily: "'Roboto',sans-serif" }}>

        {/* ── BANNER ───────────────────────────────────── */}
        <div style={{ background: 'linear-gradient(135deg,#0d1117,#160505)', borderBottom: '1px solid #30363d', padding: 'clamp(20px,3vw,32px) 5%', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%,rgba(255,71,87,0.08),transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff4757', display: 'inline-block', animation: 'pulse 1.5s infinite', boxShadow: '0 0 8px #ff4757' }} />
                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', color: '#ff4757', fontWeight: 900, letterSpacing: 2 }}>EN VIVO</span>
                </div>
                <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.4rem,4vw,2.2rem)', fontWeight: 900, margin: 0 }}>
                  📺 <span style={{ color: '#ff4757' }}>LFA</span> TV
                </h1>
            <p style={{ color: '#8b949e', fontSize: '0.78rem', margin: '4px 0 0' }}>Partidos en vivo de la comunidad LFA · somoslfa.com</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(16px,3vw,28px) clamp(12px,4vw,5%)' }}>

          {/* ── CANAL OFICIAL LFA ────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.82rem', fontWeight: 900 }}>
                🏆 CANAL OFICIAL LFA
              </div>
            </div>

            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#0d1117', borderRadius: 14, overflow: 'hidden', border: '2px solid #ffd70030', boxShadow: '0 0 30px rgba(255,215,0,0.07)' }}>
              <iframe
                src={featuredEmbed}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                allowFullScreen
                allow="autoplay; fullscreen"
                title="LFA TV - Canal Oficial"
              />
            </div>

            {/* Watermark LFA TV */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, padding: '6px 4px', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', color: '#8b949e', letterSpacing: 0.5 }}>
                somoslfa.com · <span style={{ color: '#ffd700' }}>Torneos FC26 &amp; eFootball Crossplay</span>
              </div>
              <a href="https://kick.com/somoslfa" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: '#8b949e', textDecoration: 'none', border: '1px solid #30363d', padding: '3px 10px', borderRadius: 6 }}>
                Ver en vivo ↗
              </a>
            </div>
          </div>

          {/* ── STREAMERS COMUNIDAD ──────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.82rem', fontWeight: 900 }}>
                🎮 CANALES DE LA COMUNIDAD
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([['todos', '🌐 Todos'], ['FC26', '⚽ FC 26'], ['EFOOTBALL', '🏅 eFootball']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setGameTab(v)} style={{ background: gameTab === v ? 'rgba(0,255,136,0.1)' : 'transparent', border: `1px solid ${gameTab === v ? '#00ff88' : '#30363d'}`, color: gameTab === v ? '#00ff88' : '#8b949e', padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 900, transition: '0.15s' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {streamers.length === 0 ? (
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: '40px', textAlign: 'center', color: '#8b949e' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📡</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Sin streamers registrados todavía</div>
                <div style={{ fontSize: '0.78rem' }}>
                  Los jugadores pueden agregar sus canales en <a href="/perfil" style={{ color: '#00ff88' }}>Mi Perfil → Datos Públicos</a>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 14 }}>
                {streamers.map(s => {
                  const plat = getPlatform(s);
                  if (!plat) return null;
                  const canal = s[`${plat}_canal` as keyof Streamer] as string;
                  return (
                    <div key={s.uid} className="tvcard" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, overflow: 'hidden' }}>
                      {/* Preview embed */}
                      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#0d1117' }}>
                        <iframe
                          src={plat === 'twitch' ? embedUrl('twitch', canal, parent) : plat === 'kick' ? embedUrl('kick', canal, parent) : `https://www.youtube.com/embed?listType=user_uploads&list=${canal}`}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                          allowFullScreen
                          title={s.nombre || canal}
                        />
                      </div>
                      {/* Info */}
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: '#1c2028', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {s.avatar_url ? <img src={s.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.2rem' }}>👤</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nombre || canal}</div>
                          <div style={{ fontSize: '0.62rem', color: '#00ff88', fontWeight: 700 }}>🎮 EN VIVO</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CTA para streamers */}
            <div style={{ marginTop: 20, padding: '14px 18px', background: 'rgba(145,70,255,0.06)', border: '1px solid #9146FF30', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#9146FF', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, marginBottom: 3 }}>¿SOS STREAMER?</div>
                <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>Agregá tu canal de Twitch, Kick o YouTube en tu perfil y aparecé acá automáticamente.</div>
              </div>
              <a href="/perfil" style={{ background: '#9146FF', color: 'white', textDecoration: 'none', padding: '8px 16px', borderRadius: 8, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                AGREGAR CANAL
              </a>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
