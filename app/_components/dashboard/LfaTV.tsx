'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/* ─── Tipos ─────────────────────────────────────────── */
interface Streamer {
  uid: string; nombre?: string; avatar_url?: string;
  twitch_canal?: string; kick_canal?: string; youtube_canal?: string;
  lfa_tv?: boolean;
}

/* ─── Canales oficiales LFA ─────────────────────────── */
const LFA_OFICIAL = {
  twitch:  'somoslfa',
  kick:    'somoslfa',
  youtube: 'somoslfa',
};

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

function channelLink(plat: 'twitch'|'kick'|'youtube', canal: string) {
  if (plat === 'twitch')  return `https://twitch.tv/${canal}`;
  if (plat === 'kick')    return `https://kick.com/${canal}`;
  if (plat === 'youtube') return `https://youtube.com/@${canal}`;
  return '#';
}

const PLAT_COLOR: Record<string, string> = { twitch: '#9146FF', kick: '#53FC18', youtube: '#ff0000' };
const PLAT_LABEL: Record<string, string> = { twitch: '💜 TWITCH', kick: '🟢 KICK', youtube: '▶️ YOUTUBE' };

/* ═══════════════════════════════════════════════════ */
export default function LfaTV({ uid }: { uid: string }) {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [gameTab,   setGameTab]   = useState<'todos'|'FC26'|'EFOOTBALL'>('todos');
  const [featured,  setFeatured]  = useState<'twitch'|'kick'|'youtube'>('youtube');
  const [parent,    setParent]    = useState('localhost');

  useEffect(() => {
    if (typeof window !== 'undefined') setParent(window.location.hostname);
  }, []);

  useEffect(() => {
    const fetchStreamers = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'usuarios'),
          where('lfa_tv', '==', true),
          limit(20)
        ));
        const list: Streamer[] = [];
        snap.forEach(d => {
          const data = d.data() as Streamer;
          if (data.twitch_canal || data.kick_canal || data.youtube_canal) {
            list.push({ ...data, uid: d.id });
          }
        });
        setStreamers(list.filter(s => s.uid !== 'somoslfa_oficial'));
      } catch { /* ok */ }
    };
    fetchStreamers();
  }, []);

  const featuredEmbed = embedUrl(featured, LFA_OFICIAL[featured], parent);

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
                <p style={{ color: '#8b949e', fontSize: '0.78rem', margin: '4px 0 0' }}>Seguí las transmisiones en vivo de LFA y la comunidad</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(16px,3vw,28px) clamp(12px,4vw,5%)' }}>

          {/* ── CANAL OFICIAL LFA ────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.82rem', fontWeight: 900 }}>
                🏆 CANAL OFICIAL LFA
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['youtube', 'twitch', 'kick'] as const).map(p => (
                  <button key={p} onClick={() => setFeatured(p)} style={{ background: featured === p ? PLAT_COLOR[p] + '20' : 'transparent', border: `1px solid ${featured === p ? PLAT_COLOR[p] : '#30363d'}`, color: featured === p ? PLAT_COLOR[p] : '#8b949e', padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 900, transition: '0.15s' }}>
                    {PLAT_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#0d1117', borderRadius: 14, overflow: 'hidden', border: '2px solid #ffd70030', boxShadow: '0 0 30px rgba(255,215,0,0.07)' }}>
              <iframe
                src={featuredEmbed}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                allowFullScreen
                allow="autoplay; fullscreen"
                title={`LFA TV - ${featured}`}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {(['youtube', 'twitch', 'kick'] as const).map(p => (
                <a key={p} href={channelLink(p, LFA_OFICIAL[p])} target="_blank" rel="noopener noreferrer" style={{ color: PLAT_COLOR[p], border: `1px solid ${PLAT_COLOR[p]}40`, padding: '5px 14px', borderRadius: 20, textDecoration: 'none', fontSize: '0.72rem', fontWeight: 700, transition: '0.15s' }}>
                  {PLAT_LABEL[p]} ↗
                </a>
              ))}
            </div>
          </div>

          {/* ── STREAMERS COMUNIDAD ──────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.82rem', fontWeight: 900 }}>
                �️ STREAMERS OFICIALES LFA
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
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🎙️</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Próximamente — Streamers Oficiales LFA</div>
                <div style={{ fontSize: '0.78rem' }}>
                  Los partners oficiales aparecerán acá. <a href="https://www.instagram.com/somoslfa" target="_blank" rel="noopener noreferrer" style={{ color: '#53FC18' }}>Contactanos por Instagram</a> para aplicar.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 14 }}>
                {streamers.map(s => {
                  const plat = getPlatform(s);
                  if (!plat) return null;
                  const canal = s[`${plat}_canal` as keyof Streamer] as string;
                  const link  = channelLink(plat, canal);
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
                          <div style={{ fontSize: '0.65rem', color: PLAT_COLOR[plat], fontWeight: 700 }}>{PLAT_LABEL[plat]}</div>
                        </div>
                        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: PLAT_COLOR[plat], textDecoration: 'none', fontSize: '0.7rem', fontWeight: 700, border: `1px solid ${PLAT_COLOR[plat]}40`, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          Ver ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CTA para streamers */}
            <div style={{ marginTop: 20, padding: '14px 18px', background: 'rgba(83,252,24,0.04)', border: '1px solid rgba(83,252,24,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#53FC18', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, marginBottom: 3 }}>¿QUERÉS SER STREAMER OFICIAL LFA?</div>
                <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>Los streamers que aparecen acá son partners oficiales seleccionados por LFA. Contactanos por Instagram para aplicar.</div>
              </div>
              <a href="https://www.instagram.com/somoslfa" target="_blank" rel="noopener noreferrer" style={{ background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', color: 'white', textDecoration: 'none', padding: '8px 16px', borderRadius: 8, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                📸 CONTACTAR
              </a>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
