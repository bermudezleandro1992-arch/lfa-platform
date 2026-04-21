'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged }  from 'firebase/auth';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

/* ─── Tipos ──────────────────────────────────────────── */
interface Jugador {
  id: string; nombre?: string; avatar_url?: string; region?: string;
  number?: number; fair_play?: number; titulos?: number;
  partidos_jugados?: number; victorias?: number; baneado?: boolean; country?: string;
}

function countryFlag(code = '') {
  if (!code || code.length !== 2) return '';
  const o = 0x1F1E6 - 65;
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0)+o, code.toUpperCase().charCodeAt(1)+o);
}
const RL: Record<string, string> = {
  LATAM_SUR: 'LATAM Sur', LATAM_NORTE: 'LATAM Norte',
  AMERICA: 'América', GLOBAL: 'Global',
};
const FLAG: Record<string, string> = {
  LATAM_SUR: '🌎', LATAM_NORTE: '🌎', AMERICA: '🌍', GLOBAL: '🌐',
};

function getTier(t: number) {
  if (t >= 50) return { label: 'LEYENDA', color: '#ff4757', icon: '👑' };
  if (t >= 20) return { label: 'ELITE',   color: '#ffd700', icon: '🔥' };
  if (t >= 10) return { label: 'ORO',     color: '#f0c040', icon: '⭐' };
  if (t >= 5)  return { label: 'PLATA',   color: '#a8b2c0', icon: '🥈' };
  if (t >= 1)  return { label: 'BRONCE',  color: '#cd7f32', icon: '🥉' };
  return         { label: 'NOVATO',  color: '#8b949e', icon: '🆕' };
}

type SortKey = 'titulos' | 'victorias' | 'number' | 'fair_play';
const SORT_OPTS: { key: SortKey; label: string }[] = [
  { key: 'titulos',   label: '🏆 Títulos'   },
  { key: 'victorias', label: '✅ Victorias' },
  { key: 'number',    label: '🪙 Coins'     },
  { key: 'fair_play', label: '⚖️ Fair Play' },
];
const REGIONS = [
  { value: '',              label: '🌐 Todas'       },
  { value: 'LATAM_SUR',    label: '🌎 LATAM Sur'   },
  { value: 'LATAM_NORTE',  label: '🌎 LATAM Norte' },
  { value: 'AMERICA',      label: '🌍 América'      },
];

function PosIcon({ pos }: { pos: number }) {
  if (pos === 1) return <span style={{ fontSize: '1.3rem', filter: 'drop-shadow(0 0 8px #ffd700)' }}>🥇</span>;
  if (pos === 2) return <span style={{ fontSize: '1.3rem', filter: 'drop-shadow(0 0 5px #a8b2c0)' }}>🥈</span>;
  if (pos === 3) return <span style={{ fontSize: '1.3rem', filter: 'drop-shadow(0 0 5px #cd7f32)' }}>🥉</span>;
  return <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', color: pos <= 10 ? '#8b949e' : '#444', fontWeight: 700, width: 26, textAlign: 'center', display: 'inline-block' }}>#{pos}</span>;
}

/* ═══════════════════════════════════════════════════════ */
export default function RankingInline() {
  const [uid,       setUid]     = useState('');
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [sortKey,   setSortKey] = useState<SortKey>('titulos');
  const [region,    setRegion]  = useState('');
  const [loading,   setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => { if (user) setUid(user.uid); });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'usuarios'), limit(500)), (snap) => {
      const list: Jugador[] = [];
      snap.forEach(d => {
        const data = d.data();
        const j = {
          id: d.id,
          ...data,
          // Mapear pais_codigo → country para mostrar bandera
          country: data.country || data.pais_codigo,
        } as Jugador;
        if (!j.baneado) list.push(j);
      });
      setJugadores(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtrados = jugadores
    .filter(j => !region || j.region === region)
    .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));

  const top3  = filtrados.slice(0, 3);
  const resto = filtrados.slice(3, 50);

  return (
    <>
      <style>{`
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .rrow2:hover td{background:rgba(255,215,0,0.04)!important}
        .filt2:hover{border-color:#ffd700!important;color:#ffd700!important}
      `}</style>

      <div style={{ background: '#0b0e14', minHeight: 'calc(100vh - 52px)', color: 'white', fontFamily: "'Roboto',sans-serif" }}>

        {/* ── BANNER ──────────────────────────────────── */}
        <div style={{ background: 'linear-gradient(135deg,#0d1117,#161b22)', borderBottom: '1px solid #30363d', padding: 'clamp(20px,3vw,32px) 5%', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 100%,rgba(255,215,0,0.07) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.4rem,4vw,2.2rem)', fontWeight: 900, background: 'linear-gradient(90deg,#ffd700,#fff,#ffd700)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'shimmer 3s linear infinite' }}>
            HALL OF FAME
          </div>
          <div style={{ color: '#8b949e', fontSize: '0.78rem', marginTop: 4 }}>Los mejores de LATAM · Tiempo real · {filtrados.length} jugadores</div>
        </div>

        <div style={{ maxWidth: 920, margin: '0 auto', padding: 'clamp(16px,3vw,26px) clamp(12px,4vw,5%)' }}>

          {/* ── FILTROS ───────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            {SORT_OPTS.map(o => (
              <button key={o.key} className="filt2" onClick={() => setSortKey(o.key)} style={{
                background: sortKey === o.key ? 'rgba(255,215,0,0.1)' : 'transparent',
                border: `1px solid ${sortKey === o.key ? '#ffd700' : '#30363d'}`,
                color: sortKey === o.key ? '#ffd700' : '#8b949e',
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                fontFamily: "'Orbitron',sans-serif", fontSize: '0.64rem', fontWeight: 700, transition: '0.15s',
              }}>{o.label}</button>
            ))}
            <span style={{ color: '#30363d' }}>|</span>
            {REGIONS.map(r => (
              <button key={r.value} className="filt2" onClick={() => setRegion(r.value)} style={{
                background: region === r.value ? 'rgba(0,158,227,0.1)' : 'transparent',
                border: `1px solid ${region === r.value ? '#009ee3' : '#30363d'}`,
                color: region === r.value ? '#009ee3' : '#8b949e',
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                fontFamily: "'Orbitron',sans-serif", fontSize: '0.64rem', fontWeight: 700, transition: '0.15s',
              }}>{r.label}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
              <div style={{ width: 36, height: 36, border: '3px solid #ffd700', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              Cargando ranking...
            </div>
          ) : <>

          {/* ── PODIO TOP 3 ───────────────────────────── */}
          {filtrados.length >= 1 && (
            <div style={{ marginBottom: 22, animation: 'fadeUp .35s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, maxWidth: 620, margin: '0 auto' }}>
                {([top3[1], top3[0], top3[2]] as (Jugador|undefined)[]).map((j, pi) => {
                  if (!j) return <div key={pi} />;
                  const rp = pi === 0 ? 2 : pi === 1 ? 1 : 3;
                  const tier = getTier(j.titulos || 0);
                  const bc   = rp === 1 ? '#ffd700' : rp === 2 ? '#a8b2c0' : '#cd7f32';
                  const glow = rp === 1 ? 'rgba(255,215,0,0.35)' : rp === 2 ? 'rgba(168,178,192,0.2)' : 'rgba(205,127,50,0.2)';
                  const val  = sortKey === 'titulos' ? `🏆 ${j.titulos||0}` :
                               sortKey === 'victorias' ? `✅ ${j.victorias||0}` :
                               sortKey === 'number' ? `🪙 ${(j.number||0).toLocaleString()}` : `⚖️ ${j.fair_play??100}%`;
                  return (
                    <div key={j.id} style={{
                      background: '#161b22', border: `2px solid ${bc}40`,
                      borderTop: `3px solid ${bc}`, borderRadius: 14,
                      padding: rp === 1 ? '16px 10px 18px' : '12px 10px 16px',
                      textAlign: 'center', boxShadow: `0 0 20px ${glow}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}>
                      <div style={{ fontSize: '1.5rem' }}>{rp === 1 ? '🥇' : rp === 2 ? '🥈' : '🥉'}</div>
                      <div style={{ width: 52, height: 52, borderRadius: '50%', border: `2px solid ${bc}`, overflow: 'hidden', background: '#1c2028', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 12px ${glow}` }}>
                        {j.avatar_url ? <img src={j.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.5rem' }}>👤</span>}
                      </div>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, color: j.id === uid ? '#00ff88' : 'white', lineHeight: 1.2 }}>
                        <Link href={`/jugador/${j.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {j.country && <span style={{ marginRight: 3 }}>{countryFlag(j.country)}</span>}
                          {(j.nombre||'ANÓNIMO').toUpperCase()}
                        </Link>
                        {j.id === uid && <div style={{ color: '#00ff88', fontSize: '0.55rem' }}>← TÚ</div>}
                      </div>
                      <span style={{ fontSize: '0.58rem', fontFamily: "'Orbitron',sans-serif", color: tier.color, background: `${tier.color}15`, border: `1px solid ${tier.color}40`, borderRadius: 10, padding: '2px 8px' }}>{tier.icon} {tier.label}</span>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.1rem', fontWeight: 900, color: bc }}>{val}</div>
                      {j.region && <div style={{ color: '#8b949e', fontSize: '0.58rem' }}>{FLAG[j.region]||'🌎'} {RL[j.region]||j.region}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── TABLA ─────────────────────────────────── */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #30363d', fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.78rem' }}>
              TOP {Math.min(filtrados.length, 50)} — {filtrados.length} REGISTRADOS
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: 480 }}>
                <thead>
                  <tr>{['#','JUGADOR','TIER','REGIÓN','TÍTULOS','VICTORIAS','FP'].map(h => (
                    <th key={h} style={{ padding: '9px 11px', textAlign: 'left', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', borderBottom: '1px solid #30363d', background: 'rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {filtrados.slice(0, 50).map((j, i) => {
                    const tier = getTier(j.titulos || 0);
                    const esYo = j.id === uid;
                    const wr   = (j.partidos_jugados||0) > 0 ? Math.round(((j.victorias||0)/j.partidos_jugados!)*100) : 0;
                    return (
                      <tr key={j.id} className="rrow2" style={{ background: esYo ? 'rgba(0,255,136,0.04)' : 'transparent', transition: '0.15s' }}>
                        <td style={{ padding: '10px 11px', borderBottom: '1px solid #1c2028', width: 38 }}><PosIcon pos={i+1} /></td>
                        <td style={{ padding: '10px 11px', borderBottom: '1px solid #1c2028' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${esYo ? '#00ff88' : tier.color}40`, overflow: 'hidden', background: '#1c2028', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {j.avatar_url ? <img src={j.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1rem' }}>👤</span>}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: esYo ? '#00ff88' : 'white', fontSize: '0.78rem' }}>
                                <Link href={`/jugador/${j.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                  {j.country && <span style={{ marginRight: 3 }}>{countryFlag(j.country)}</span>}
                                  {(j.nombre||'ANÓNIMO').toUpperCase()}
                                </Link>
                                {esYo && <span style={{ marginLeft: 6, color: '#00ff88', fontSize: '0.58rem' }}>← TÚ</span>}
                              </div>
                              <div style={{ color: '#8b949e', fontSize: '0.6rem' }}>WR {wr}%</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 11px', borderBottom: '1px solid #1c2028' }}>
                          <span style={{ color: tier.color, fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 700, background: `${tier.color}15`, padding: '2px 7px', borderRadius: 10 }}>
                            {tier.icon} {tier.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 11px', borderBottom: '1px solid #1c2028', color: '#8b949e', fontSize: '0.68rem' }}>
                          {j.region ? `${FLAG[j.region]||'🌎'} ${RL[j.region]||j.region}` : '—'}
                        </td>
                        <td style={{ padding: '10px 11px', borderBottom: '1px solid #1c2028', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#ffd700' }}>{j.titulos||0}</td>
                        <td style={{ padding: '10px 11px', borderBottom: '1px solid #1c2028', color: '#00ff88', fontWeight: 700 }}>{j.victorias||0}</td>
                        <td style={{ padding: '10px 11px', borderBottom: '1px solid #1c2028' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ flex: 1, height: 4, background: '#0b0e14', borderRadius: 3, overflow: 'hidden', minWidth: 36 }}>
                              <div style={{ height: '100%', width: `${j.fair_play??100}%`, background: (j.fair_play??100)>=80?'#00ff88':(j.fair_play??100)>=50?'#ffd700':'#ff4757', borderRadius: 3 }} />
                            </div>
                            <span style={{ color: '#8b949e', fontSize: '0.66rem' }}>{j.fair_play??100}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtrados.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
                      <div style={{ fontSize: '2rem', marginBottom: 8 }}>🏆</div>
                      Sin jugadores todavía
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          </>}
        </div>
      </div>
    </>
  );
}
