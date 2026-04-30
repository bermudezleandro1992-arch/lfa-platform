'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

/* ─── Tipos ──────────────────────────────────────────── */
interface Jugador {
  id: string; nombre?: string; avatar_url?: string; region?: string;
  number?: number; fair_play?: number; titulos?: number;
  partidos_jugados?: number; victorias?: number; derrotas?: number;
  baneado?: boolean; rol?: string; country?: string;
}

/* ─── Helpers ────────────────────────────────────────── */
function FlagImg({ code }: { code?: string }) {
  if (!code || code.length !== 2) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/20x15/${code.toLowerCase()}.png`}
      alt={code}
      width={20}
      height={15}
      style={{ display:'inline-block', verticalAlign:'middle', marginRight:4, borderRadius:2, width:20, height:15, flexShrink:0 }}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}
const RL: Record<string, string> = {
  LATAM_SUR: 'LATAM Sur', LATAM_NORTE: 'LATAM Norte',
  AMERICA: 'América', GLOBAL: 'Global', EUROPA: 'Europa',
};
const FLAG: Record<string, string> = {
  LATAM_SUR: '🌎', LATAM_NORTE: '🌎', AMERICA: '🌍', GLOBAL: '🌐', EUROPA: '🇪🇺',
};

function getTier(t: number) {
  if (t >= 50) return { label: 'LEYENDA', color: '#ff4757', icon: '👑' };
  if (t >= 20) return { label: 'ELITE',   color: '#ffd700', icon: '🔥' };
  if (t >= 10) return { label: 'ORO',     color: '#f0c040', icon: '⭐' };
  if (t >= 5)  return { label: 'PLATA',   color: '#a8b2c0', icon: '🥈' };
  if (t >= 1)  return { label: 'BRONCE',  color: '#cd7f32', icon: '🥉' };
  return          { label: 'NOVATO',  color: '#8b949e', icon: '🆕' };
}

type SortKey = 'titulos' | 'victorias' | 'number' | 'fair_play';

const SORT_OPTS: { key: SortKey; label: string }[] = [
  { key: 'titulos',   label: '🏆 Títulos'    },
  { key: 'victorias', label: '✅ Victorias'  },
  { key: 'number',    label: '🪙 Coins'      },
  { key: 'fair_play', label: '⚖️ Fair Play'  },
];

const REGIONS = [
  { value: '', label: '🌐 Todas' },
  { value: 'LATAM_SUR',   label: '🌎 LATAM Sur'   },
  { value: 'LATAM_NORTE', label: '🌎 LATAM Norte'  },
  { value: 'AMERICA',     label: '🌍 América'       },
  { value: 'GLOBAL',      label: '🌐 Global'        },
  { value: 'EUROPA',      label: '🇪🇺 Europa'        },
];

/* ── Posición decorativa ─────────────────────────────── */
function PosIcon({ pos }: { pos: number }) {
  if (pos === 1) return <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 8px #ffd700)' }}>🥇</span>;
  if (pos === 2) return <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 6px #a8b2c0)' }}>🥈</span>;
  if (pos === 3) return <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 6px #cd7f32)' }}>🥉</span>;
  return <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.8rem', color: pos <= 10 ? '#8b949e' : '#444', fontWeight: 700, width: 28, textAlign: 'center', display: 'inline-block' }}>#{pos}</span>;
}

/* ═══════════════════════════════════════════════════════ */
export default function RankingPage() {
  const router = useRouter();
  const [uid,       setUid]       = useState('');
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [sortKey,   setSortKey]   = useState<SortKey>('titulos');
  const [region,    setRegion]    = useState('');
  const [ready,     setReady]     = useState(false);

  /* ── Auth ─────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace('/'); return; }
      setUid(user.uid);
      setReady(true);
    });
    return unsub;
  }, [router]);

  /* ── Cargar usuarios ──────────────────────────────── */
  useEffect(() => {
    if (!ready) return;
    const unsub = onSnapshot(
      query(collection(db, 'usuarios'), limit(500)),
      (snap) => {
        const list: Jugador[] = [];
        snap.forEach(d => {
          const data = d.data();
          const j = {
            id: d.id,
            ...data,
            country: data.country || data.pais_codigo,
          } as Jugador;
          if (!j.baneado && j.rol !== 'bot') list.push(j);
        });
        setJugadores(list);
      }
    );
    return unsub;
  }, [ready]);

  if (!ready) return (
    <div style={{ background: '#0b0e14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, border: '3px solid #ffd700', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── Filtrar y ordenar ────────────────────────────── */
  const filtrados = jugadores
    .filter(j => !region || j.region === region)
    .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));

  const top3  = filtrados.slice(0, 3);
  const resto = filtrados.slice(3);

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0b0e14} ::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}
        .rrow:hover td{background:rgba(255,215,0,0.04)!important;transition:0.15s}
        .filt:hover{border-color:#ffd700!important;color:#ffd700!important;transition:0.15s}
      `}</style>

      <div style={{ background: '#0b0e14', minHeight: '100vh', color: 'white', fontFamily: "'Roboto',sans-serif" }}>

        {/* ── NAV ──────────────────────────────────── */}
        <header style={{ background: 'rgba(7,9,13,0.97)', borderBottom: '1px solid #30363d', padding: '12px 5%', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap' }}>
          <Link href="/hub" style={{ color: '#8b949e', textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem' }}>← HUB</Link>
          <span style={{ color: '#30363d' }}>|</span>
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.8rem', color: '#ffd700', fontWeight: 900 }}>🏆 RANKING LFA</span>
          <div style={{ flex: 1 }} />
          <Link href="/perfil" style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', color: '#00ff88', textDecoration: 'none', border: '1px solid #00ff88', padding: '5px 12px', borderRadius: 6 }}>👤 MI PERFIL</Link>
        </header>

        {/* ── HERO BANNER ──────────────────────────── */}
        <div style={{ background: 'linear-gradient(135deg,#0d1117,#161b22)', borderBottom: '1px solid #30363d', padding: 'clamp(24px,4vw,40px) 5%', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 100%,rgba(255,215,0,0.08) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.6rem,5vw,2.8rem)', fontWeight: 900, background: 'linear-gradient(90deg,#ffd700,#fff,#ffd700)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'shimmer 3s linear infinite' }}>
            HALL OF FAME
          </div>
          <div style={{ color: '#8b949e', fontSize: '0.82rem', marginTop: 6 }}>Los mejores competidores de LATAM · Actualizado en tiempo real</div>
          <div style={{ color: '#ffd700', fontSize: '0.75rem', marginTop: 4, fontFamily: "'Orbitron',sans-serif" }}>{filtrados.length} JUGADORES RANKEADOS</div>
        </div>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(18px,3vw,30px) clamp(12px,4vw,5%)' }}>

          {/* ── FILTROS ──────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#8b949e', fontSize: '0.72rem', fontFamily: "'Orbitron',sans-serif", marginRight: 4 }}>ORDENAR:</span>
            {SORT_OPTS.map(o => (
              <button key={o.key} className="filt" onClick={() => setSortKey(o.key)} style={{
                background: sortKey === o.key ? 'rgba(255,215,0,0.1)' : 'transparent',
                border: `1px solid ${sortKey === o.key ? '#ffd700' : '#30363d'}`,
                color: sortKey === o.key ? '#ffd700' : '#8b949e',
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                fontFamily: "'Orbitron',sans-serif", fontSize: '0.67rem', fontWeight: 700,
                transition: '0.15s',
              }}>{o.label}</button>
            ))}
            <span style={{ color: '#30363d' }}>|</span>
            <span style={{ color: '#8b949e', fontSize: '0.72rem', fontFamily: "'Orbitron',sans-serif" }}>REGIÓN:</span>
            {REGIONS.map(r => (
              <button key={r.value} className="filt" onClick={() => setRegion(r.value)} style={{
                background: region === r.value ? 'rgba(0,158,227,0.1)' : 'transparent',
                border: `1px solid ${region === r.value ? '#009ee3' : '#30363d'}`,
                color: region === r.value ? '#009ee3' : '#8b949e',
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                fontFamily: "'Orbitron',sans-serif", fontSize: '0.67rem', fontWeight: 700,
                transition: '0.15s',
              }}>{r.label}</button>
            ))}
          </div>

          {/* ── TOP 3 PODIO ──────────────────────────── */}
          {filtrados.length >= 1 && (
            <div style={{ marginBottom: 28, animation: 'fadeUp .4s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, maxWidth: 680, margin: '0 auto' }}>
                {/* Orden podio: 2°, 1°, 3° */}
                {[top3[1], top3[0], top3[2]].map((j, podioIdx) => {
                  if (!j) return <div key={podioIdx} />;
                  const realPos = podioIdx === 0 ? 2 : podioIdx === 1 ? 1 : 3;
                  const tier = getTier(j.titulos || 0);
                  const height = realPos === 1 ? 200 : realPos === 2 ? 180 : 165;
                  const glow  = realPos === 1 ? 'rgba(255,215,0,0.4)' : realPos === 2 ? 'rgba(168,178,192,0.25)' : 'rgba(205,127,50,0.2)';
                  const borderC = realPos === 1 ? '#ffd700' : realPos === 2 ? '#a8b2c0' : '#cd7f32';
                  return (
                    <div key={j.id} style={{
                      background: 'linear-gradient(180deg,#161b22,#0d1117)',
                      border: `2px solid ${borderC}40`,
                      borderTop: `3px solid ${borderC}`,
                      borderRadius: 16, padding: '18px 12px 20px',
                      textAlign: 'center', position: 'relative',
                      minHeight: height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                      boxShadow: `0 0 30px ${glow}, 0 8px 30px rgba(0,0,0,0.5)`,
                      order: realPos === 1 ? -1 : realPos,
                    }}>
                      {/* Número de posición */}
                      <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', fontSize: '1.6rem' }}>
                        {realPos === 1 ? '🥇' : realPos === 2 ? '🥈' : '🥉'}
                      </div>

                      {/* Avatar */}
                      <div style={{ width: 64, height: 64, borderRadius: '50%', border: `2px solid ${borderC}`, overflow: 'hidden', background: '#1c2028', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, boxShadow: `0 0 16px ${glow}` }}>
                        {j.avatar_url ? <img src={j.avatar_url} alt={j.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.8rem' }}>👤</span>}
                      </div>

                      {/* Nombre */}
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.76rem', fontWeight: 900, color: j.id === uid ? '#00ff88' : 'white', marginBottom: 4, lineHeight: 1.2 }}>
                        <Link href={`/jugador/${j.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          <FlagImg code={j.country} />
                          {(j.nombre || 'ANÓNIMO').toUpperCase()}
                        </Link>
                      </div>

                      {/* Tier badge */}
                      <div style={{ fontSize: '0.6rem', fontFamily: "'Orbitron',sans-serif", color: tier.color, background: `${tier.color}15`, border: `1px solid ${tier.color}40`, borderRadius: 10, padding: '2px 8px', marginBottom: 8 }}>
                        {tier.icon} {tier.label}
                      </div>

                      {/* Stat principal */}
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.3rem', fontWeight: 900, color: borderC }}>
                        {sortKey === 'titulos' ? `🏆 ${j.titulos || 0}` :
                         sortKey === 'victorias' ? `✅ ${j.victorias || 0}` :
                         sortKey === 'number' ? `🪙 ${(j.number||0).toLocaleString()}` :
                         `⚖️ ${j.fair_play ?? 100}%`}
                      </div>

                      {/* Región */}
                      {j.region && <div style={{ color: '#8b949e', fontSize: '0.62rem', marginTop: 4 }}>{FLAG[j.region]||'🌎'} {RL[j.region]||j.region}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── TABLA COMPLETA ───────────────────────── */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.82rem' }}>TABLA GENERAL — {filtrados.length} JUGADORES</span>
              <span style={{ color: '#8b949e', fontSize: '0.7rem' }}>Ordenado por {SORT_OPTS.find(s => s.key === sortKey)?.label}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 560 }}>
                <thead>
                  <tr>{['#','JUGADOR','TIER','REGIÓN','TÍTULOS','VICTORIAS','COINS','FP'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', borderBottom: '1px solid #30363d', background: 'rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {filtrados.map((j, i) => {
                    const tier = getTier(j.titulos || 0);
                    const esYo = j.id === uid;
                    const wr   = (j.partidos_jugados || 0) > 0
                      ? Math.round(((j.victorias || 0) / j.partidos_jugados!) * 100)
                      : 0;
                    return (
                      <tr key={j.id} className="rrow" style={{ background: esYo ? 'rgba(0,255,136,0.04)' : 'transparent' }}>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #1c2028', width: 44 }}><PosIcon pos={i+1} /></td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #1c2028' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid ${esYo ? '#00ff88' : tier.color}40`, overflow: 'hidden', background: '#1c2028', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {j.avatar_url ? <img src={j.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.1rem' }}>👤</span>}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: esYo ? '#00ff88' : 'white', fontSize: '0.82rem' }}>
                                <Link href={`/jugador/${j.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                  <FlagImg code={j.country} />
                                  {(j.nombre || 'ANÓNIMO').toUpperCase()}
                                </Link>
                                {esYo && <span style={{ marginLeft: 6, color: '#00ff88', fontSize: '0.6rem' }}>← TÚ</span>}
                              </div>
                              <div style={{ color: '#8b949e', fontSize: '0.62rem' }}>WR: {wr}%</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #1c2028' }}>
                          <span style={{ color: tier.color, fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 700, background: `${tier.color}15`, padding: '3px 8px', borderRadius: 10 }}>
                            {tier.icon} {tier.label}
                          </span>
                        </td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #1c2028', color: '#8b949e', fontSize: '0.72rem' }}>
                          {j.region ? `${FLAG[j.region]||'🌎'} ${RL[j.region]||j.region}` : '—'}
                        </td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #1c2028' }}>
                          <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#ffd700', fontSize: '0.9rem' }}>{j.titulos || 0}</span>
                        </td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #1c2028', color: '#00ff88', fontWeight: 700 }}>{j.victorias || 0}</td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #1c2028', color: '#009ee3', fontSize: '0.78rem' }}>🪙 {(j.number||0).toLocaleString()}</td>
                        <td style={{ padding: '11px 12px', borderBottom: '1px solid #1c2028' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 5, background: '#0b0e14', borderRadius: 3, overflow: 'hidden', minWidth: 40 }}>
                              <div style={{ height: '100%', width: `${j.fair_play ?? 100}%`, background: (j.fair_play ?? 100) >= 80 ? '#00ff88' : (j.fair_play ?? 100) >= 50 ? '#ffd700' : '#ff4757', borderRadius: 3 }} />
                            </div>
                            <span style={{ color: '#8b949e', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{j.fair_play ?? 100}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtrados.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🏆</div>
                      <div>Todavía no hay jugadores para mostrar</div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── PANEL FAIR PLAY ─────────────────────────────── */}
          <div style={{ marginTop: 32, background: '#161b22', border: '1px solid #30363d', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.82rem', fontWeight: 900 }}>⚖️ SISTEMA FAIR PLAY — CÓMO FUNCIONA</span>
            </div>
            <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>

              {/* Cómo sumar */}
              <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.72rem', fontWeight: 900, marginBottom: 10 }}>📈 CÓMO SUBIR PUNTOS</div>
                {[
                  { pts: '+2', txt: 'Confirmar el resultado del rival' },
                  { pts: '+1', txt: 'Reportar tu resultado correctamente' },
                  { pts: '+5', txt: 'Completar 10 torneos sin penalidades' },
                ].map(r => (
                  <div key={r.pts} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', borderRadius: 6, padding: '2px 8px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', fontWeight: 900, flexShrink: 0 }}>{r.pts}</span>
                    <span style={{ color: '#c9d1d9', fontSize: '0.78rem' }}>{r.txt}</span>
                  </div>
                ))}
              </div>

              {/* Cómo bajar */}
              <div style={{ background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.15)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ff4757', fontSize: '0.72rem', fontWeight: 900, marginBottom: 10 }}>📉 CÓMO PERDER PUNTOS</div>
                {[
                  { pts: '-15', txt: 'Reportar resultado falso (VAR te da la razón al rival)' },
                  { pts: '-15', txt: 'No reportar resultado en tiempo y forma' },
                  { pts: '-5',  txt: 'Abandonar una sala ya inscripto sin motivo' },
                ].map(r => (
                  <div key={r.pts + r.txt} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ background: 'rgba(255,71,87,0.15)', color: '#ff4757', borderRadius: 6, padding: '2px 8px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', fontWeight: 900, flexShrink: 0 }}>{r.pts}</span>
                    <span style={{ color: '#c9d1d9', fontSize: '0.78rem' }}>{r.txt}</span>
                  </div>
                ))}
              </div>

              {/* Niveles */}
              <div style={{ background: 'rgba(255,215,0,0.03)', border: '1px solid rgba(255,215,0,0.12)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.72rem', fontWeight: 900, marginBottom: 10 }}>🏷️ NIVELES DE FAIR PLAY</div>
                {[
                  { rango: '80–100%', color: '#00ff88', label: 'EXCELENTE',    desc: 'Acceso completo' },
                  { rango: '50–79%',  color: '#ffd700', label: 'REGULAR',      desc: 'Acceso normal' },
                  { rango: '< 50%',   color: '#ff4757', label: 'RESTRINGIDO',  desc: 'No podés inscribirte' },
                ].map(n => (
                  <div key={n.rango} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: n.color, fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, minWidth: 56 }}>{n.rango}</span>
                    <span style={{ background: `${n.color}15`, color: n.color, border: `1px solid ${n.color}40`, borderRadius: 4, padding: '1px 6px', fontSize: '0.62rem', fontWeight: 700 }}>{n.label}</span>
                    <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>{n.desc}</span>
                  </div>
                ))}
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, color: '#8b949e', fontSize: '0.7rem', lineHeight: 1.5 }}>
                  💡 El FP inicia en 100%. Solo el CEO puede restaurarlo manualmente.
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </>
  );
}


