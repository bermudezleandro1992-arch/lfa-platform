'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

interface PlayerRank {
  uid: string;
  display_name: string;
  team_name: string;
  logo_url: string;
  pts: number;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  leagues: number;
}

type GameFilter = 'all' | 'efootball' | 'fc26' | 'mobile';

export default function ProRankingPage() {
  const router = useRouter();
  const [uid,       setUid]       = useState('');
  const [ready,     setReady]     = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [ranking,   setRanking]   = useState<PlayerRank[]>([]);
  const [filtered,  setFiltered]  = useState<PlayerRank[]>([]);
  const [filter,    setFilter]    = useState<GameFilter>('all');
  const [leagueMap, setLeagueMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) { router.replace('/'); return; }
      setUid(u.uid);
      setReady(true);
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!ready) return;

    async function buildRanking() {
      setLoading(true);
      try {
        // Fetch all leagues
        const leaguesSnap = await getDocs(collection(db, 'leagues'));
        const lMap: Record<string, string> = {};
        leaguesSnap.docs.forEach(d => { lMap[d.id] = d.data().game || 'efootball'; });
        setLeagueMap(lMap);

        // Aggregate from pro_global_ranking first (fast path)
        const globalSnap = await getDocs(collection(db, 'pro_global_ranking'));

        const byUid: Record<string, PlayerRank> = {};

        if (globalSnap.size > 0) {
          globalSnap.docs.forEach(d => {
            const g = d.data();
            byUid[d.id] = {
              uid: d.id,
              display_name: g.display_name || 'Jugador',
              team_name:    g.team_name    || '',
              logo_url:     g.logo_url     || '⚽',
              pts:          g.total_pts    ?? 0,
              pj:           g.total_pj     ?? 0,
              pg:           g.total_pg     ?? 0,
              pe:           g.total_pe     ?? 0,
              pp:           g.total_pp     ?? 0,
              gf:           g.total_gf     ?? 0,
              gc:           g.total_gc     ?? 0,
              leagues:      g.leagues_played ?? 0,
            };
          });
        } else {
          // Fallback: aggregate from all leagues/*/participants
          for (const lgDoc of leaguesSnap.docs) {
            const partSnap = await getDocs(collection(db, 'leagues', lgDoc.id, 'participants'));
            partSnap.docs.forEach(pDoc => {
              const p = pDoc.data();
              const puid = pDoc.id;
              if (!byUid[puid]) {
                byUid[puid] = {
                  uid: puid,
                  display_name: p.display_name || 'Jugador',
                  team_name:    p.team_name    || '',
                  logo_url:     p.logo_url     || '⚽',
                  pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, leagues: 0,
                };
              }
              byUid[puid].pts += (p.pts || 0);
              byUid[puid].pj  += (p.pj  || 0);
              byUid[puid].pg  += (p.pg  || 0);
              byUid[puid].pe  += (p.pe  || 0);
              byUid[puid].pp  += (p.pp  || 0);
              byUid[puid].gf  += (p.gf  || 0);
              byUid[puid].gc  += (p.gc  || 0);
              byUid[puid].leagues += 1;
            });
          }
        }

        const sorted = Object.values(byUid)
          .filter(p => p.pj > 0)
          .sort((a, b) => {
            if (b.pts !== a.pts) return b.pts - a.pts;
            const dga = a.gf - a.gc;
            const dgb = b.gf - b.gc;
            if (dgb !== dga) return dgb - dga;
            return b.gf - a.gf;
          });

        setRanking(sorted);
        setFiltered(sorted);
      } finally {
        setLoading(false);
      }
    }

    buildRanking();
  }, [ready]);

  // Per-game filter: we need per-league data for this, so use the fallback approach per filter
  useEffect(() => {
    if (filter === 'all') {
      setFiltered(ranking);
      return;
    }
    // We'd need per-game breakdown — for now show all and note the filter
    // (Full per-game ranking requires storing game per participant or querying per league)
    setFiltered(ranking);
  }, [filter, ranking]);

  if (!ready) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#0b0e14' }}>
      <span style={{ fontFamily:"'Orbitron',sans-serif",color:'#00ff88' }}>Cargando...</span>
    </div>
  );

  const myPos = filtered.findIndex(p => p.uid === uid);

  return (
    <div style={{ minHeight:'100vh', background:'#0b0e14', color:'#c9d1d9' }}>
      {/* Header */}
      <div style={{ background:'#0d1117', borderBottom:'1px solid #30363d' }}>
        <div style={{ maxWidth:860, margin:'0 auto', padding:'18px 20px 0' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
            <Link href="/pro" style={{ color:'#8b949e', textDecoration:'none', fontSize:'0.78rem' }}>← Liga PRO</Link>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'0.7rem', letterSpacing:2 }}>
              SOMOS<span style={{ color:'#ffd700' }}>LFA</span> <span style={{ color:'#00ff88' }}>PRO</span>
            </div>
          </div>

          <div style={{ textAlign:'center', paddingBottom:20 }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'clamp(1.5rem,5vw,2.5rem)', color:'#ffd700', letterSpacing:2 }}>
              🏆 RANKING GLOBAL
            </div>
            <div style={{ color:'#8b949e', fontSize:'0.82rem', marginTop:6 }}>
              Acumulado de todas las ligas — se actualiza en tiempo real
            </div>
            {myPos >= 0 && (
              <div style={{ marginTop:10, display:'inline-block', background:'#00ff8818', border:'1px solid #00ff8833', borderRadius:8, padding:'5px 14px' }}>
                <span style={{ color:'#00ff88', fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.75rem' }}>
                  Tu posición: #{myPos + 1}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:860, margin:'0 auto', padding:'24px 20px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#8b949e' }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif" }}>Calculando ranking...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'#8b949e' }}>
            <div style={{ fontSize:'3rem', marginBottom:12 }}>📊</div>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700 }}>Ranking vacío</div>
            <div style={{ fontSize:'0.82rem', marginTop:8 }}>Los jugadores aparecerán después de jugar partidos</div>
          </div>
        ) : (
          <>
            {/* Top 3 podium */}
            {filtered.length >= 3 && (
              <div style={{ display:'flex', justifyContent:'center', gap:12, marginBottom:32, flexWrap:'wrap' }}>
                {[1, 0, 2].map(idx => {
                  const p = filtered[idx];
                  if (!p) return null;
                  const medals = ['🥇','🥈','🥉'];
                  const sizes  = [1, 0.85, 0.85];
                  const heights = ['120px','100px','100px'];
                  const order  = idx === 0 ? 1 : idx === 1 ? 0 : 2;
                  return (
                    <div key={p.uid} style={{
                      background:'#161b22', borderRadius:14,
                      border:`2px solid ${idx === 0 ? '#ffd70044' : '#21262d'}`,
                      padding:'18px 20px', textAlign:'center', minWidth:140,
                      boxShadow: idx === 0 ? '0 0 30px rgba(255,215,0,0.1)' : 'none',
                      order, height: heights[idx === 0 ? 0 : idx === 1 ? 1 : 2],
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                    }}>
                      <div style={{ fontSize:`${2.5 * sizes[idx === 0 ? 0 : idx === 1 ? 1 : 2]}rem` }}>
                        {p.logo_url || '⚽'}
                      </div>
                      <div style={{ fontSize:'1.4rem', margin:'4px 0' }}>{medals[idx === 0 ? 0 : idx === 1 ? 1 : 2]}</div>
                      <div style={{ fontWeight:700, color:'#e6edf3', fontSize:'0.78rem', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {p.team_name || p.display_name}
                      </div>
                      <div style={{ color:'#ffd700', fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'1rem', marginTop:4 }}>
                        {p.pts} pts
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full table */}
            <div style={{ background:'#161b22', borderRadius:14, border:'1px solid #30363d', overflow:'hidden' }}>
              {/* Table header */}
              <div style={{
                display:'grid', gridTemplateColumns:'40px 1fr 60px 80px 80px 60px',
                padding:'10px 16px', borderBottom:'1px solid #30363d',
                background:'#0d1117',
              }}>
                {['#','JUGADOR','PJ','G/E/P','DG','PTS'].map(h => (
                  <div key={h} style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.58rem', color:'#555', letterSpacing:1 }}>{h}</div>
                ))}
              </div>

              {filtered.map((p, i) => {
                const isMe = p.uid === uid;
                const dg = p.gf - p.gc;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                return (
                  <div key={p.uid} style={{
                    display:'grid', gridTemplateColumns:'40px 1fr 60px 80px 80px 60px',
                    padding:'12px 16px', borderBottom:'1px solid #0d1117',
                    background: isMe ? '#00ff8808' : 'transparent',
                    borderLeft: isMe ? '2px solid #00ff88' : '2px solid transparent',
                  }}>
                    <div style={{ color: i < 3 ? '#ffd700' : '#555', fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.78rem', display:'flex', alignItems:'center' }}>
                      {medal ?? (i + 1)}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:'1.4rem' }}>{p.logo_url || '⚽'}</span>
                      <div>
                        <div style={{ fontWeight:700, color: isMe ? '#00ff88' : '#e6edf3', fontSize:'0.82rem' }}>
                          {p.team_name || p.display_name}
                          {isMe && <span style={{ color:'#00ff88', fontSize:'0.6rem', marginLeft:6 }}>◀ TÚ</span>}
                        </div>
                        <div style={{ color:'#555', fontSize:'0.65rem' }}>{p.leagues} liga{p.leagues !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div style={{ color:'#8b949e', fontSize:'0.78rem', display:'flex', alignItems:'center' }}>{p.pj}</div>
                    <div style={{ color:'#8b949e', fontSize:'0.78rem', display:'flex', alignItems:'center' }}>
                      <span style={{ color:'#00ff88' }}>{p.pg}</span>
                      <span style={{ color:'#555', margin:'0 3px' }}>/</span>
                      {p.pe}
                      <span style={{ color:'#555', margin:'0 3px' }}>/</span>
                      <span style={{ color:'#ff4757' }}>{p.pp}</span>
                    </div>
                    <div style={{ color: dg >= 0 ? '#00ff88' : '#ff4757', fontSize:'0.78rem', display:'flex', alignItems:'center' }}>
                      {dg > 0 ? `+${dg}` : dg}
                    </div>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, color:'#ffd700', fontSize:'0.9rem', display:'flex', alignItems:'center' }}>
                      {p.pts}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ textAlign:'center', marginTop:14, color:'#555', fontSize:'0.72rem' }}>
              {filtered.length} jugadores · Actualizado en tiempo real
            </div>
          </>
        )}
      </div>
    </div>
  );
}
