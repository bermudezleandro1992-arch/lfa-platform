'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

interface GlobalStats {
  display_name: string;
  logo_url: string;
  team_name: string;
  pts: number;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  leagues_played: number;
}

interface LeagueStat {
  leagueId: string;
  leagueName: string;
  game: string;
  platform: string;
  pts: number;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  status: string;
}

const GAME_LABEL: Record<string, string> = { efootball: 'eFootball', fc26: 'FC 26', mobile: 'Mobile' };

export default function ProPerfilPage() {
  const router = useRouter();
  const [uid,        setUid]        = useState('');
  const [ready,      setReady]      = useState(false);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [perLeague,  setPerLeague]  = useState<LeagueStat[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) { router.replace('/'); return; }
      setUid(u.uid);
      setReady(true);
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!uid) return;

    async function loadStats() {
      setLoading(true);
      try {
        // 1. Global stats from pro_global_ranking
        const globalSnap = await getDoc(doc(db, 'pro_global_ranking', uid));

        // 2. All leagues — check participation
        const leaguesSnap = await getDocs(collection(db, 'leagues'));
        const statsPerLeague: LeagueStat[] = [];
        let aggPts = 0, aggPj = 0, aggPg = 0, aggPe = 0, aggPp = 0, aggGf = 0, aggGc = 0;
        let displayName = '', logoUrl = '⚽', teamName = '';

        for (const lgDoc of leaguesSnap.docs) {
          const partSnap = await getDoc(doc(db, 'leagues', lgDoc.id, 'participants', uid));
          if (!partSnap.exists()) continue;
          const p = partSnap.data();
          const l = lgDoc.data();
          statsPerLeague.push({
            leagueId:   lgDoc.id,
            leagueName: l.name || '—',
            game:       l.game || '',
            platform:   l.platform || '',
            pts: p.pts || 0,
            pj:  p.pj  || 0,
            pg:  p.pg  || 0,
            pe:  p.pe  || 0,
            pp:  p.pp  || 0,
            gf:  p.gf  || 0,
            gc:  p.gc  || 0,
            status: l.status || '',
          });
          aggPts += (p.pts || 0);
          aggPj  += (p.pj  || 0);
          aggPg  += (p.pg  || 0);
          aggPe  += (p.pe  || 0);
          aggPp  += (p.pp  || 0);
          aggGf  += (p.gf  || 0);
          aggGc  += (p.gc  || 0);
          if (!displayName) { displayName = p.display_name || ''; logoUrl = p.logo_url || '⚽'; teamName = p.team_name || ''; }
        }

        // Prefer global_ranking data if exists, else computed
        if (globalSnap.exists()) {
          const g = globalSnap.data();
          setGlobalStats({
            display_name:  g.display_name  || displayName,
            logo_url:      g.logo_url      || logoUrl,
            team_name:     g.team_name     || teamName,
            pts:           g.total_pts     ?? aggPts,
            pj:            g.total_pj      ?? aggPj,
            pg:            g.total_pg      ?? aggPg,
            pe:            g.total_pe      ?? aggPe,
            pp:            g.total_pp      ?? aggPp,
            gf:            g.total_gf      ?? aggGf,
            gc:            g.total_gc      ?? aggGc,
            leagues_played: g.leagues_played ?? statsPerLeague.length,
          });
        } else if (statsPerLeague.length > 0) {
          setGlobalStats({ display_name: displayName, logo_url: logoUrl, team_name: teamName,
            pts: aggPts, pj: aggPj, pg: aggPg, pe: aggPe, pp: aggPp, gf: aggGf, gc: aggGc,
            leagues_played: statsPerLeague.length,
          });
        } else {
          setGlobalStats(null);
        }

        // Sort leagues: activa first, then pts desc
        statsPerLeague.sort((a, b) => {
          if (a.status === 'activa' && b.status !== 'activa') return -1;
          if (b.status === 'activa' && a.status !== 'activa') return 1;
          return b.pts - a.pts;
        });
        setPerLeague(statsPerLeague);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [uid]);

  if (!ready) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#0b0e14' }}>
      <span style={{ fontFamily:"'Orbitron',sans-serif",color:'#00ff88' }}>Cargando...</span>
    </div>
  );

  const dg = (globalStats?.gf ?? 0) - (globalStats?.gc ?? 0);

  return (
    <div style={{ minHeight:'100vh', background:'#0b0e14', color:'#c9d1d9' }}>
      {/* ── Header */}
      <div style={{ background:'#0d1117', borderBottom:'1px solid #30363d' }}>
        <div style={{ maxWidth:860, margin:'0 auto', padding:'18px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <Link href="/pro" style={{ color:'#8b949e', textDecoration:'none', fontSize:'0.78rem' }}>← Liga PRO</Link>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'0.7rem', letterSpacing:2 }}>
              SOMOS<span style={{ color:'#ffd700' }}>LFA</span> <span style={{ color:'#00ff88' }}>PRO</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:860, margin:'0 auto', padding:'28px 20px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:80, color:'#8b949e' }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'0.9rem' }}>Cargando perfil...</div>
          </div>
        ) : !globalStats ? (
          <div style={{ textAlign:'center', padding:80 }}>
            <div style={{ fontSize:'4rem', marginBottom:16 }}>🎮</div>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, color:'#8b949e', fontSize:'1rem' }}>
              Aún no participaste en ninguna liga
            </div>
            <div style={{ marginTop:12, fontSize:'0.82rem', color:'#555' }}>
              Inscribite en una liga desde el inicio para aparecer en el ranking
            </div>
            <Link href="/pro" style={{
              display:'inline-block', marginTop:20, padding:'10px 28px', borderRadius:10,
              background:'#00ff88', color:'#000', fontFamily:"'Orbitron',sans-serif",
              fontWeight:700, fontSize:'0.75rem', textDecoration:'none',
            }}>
              VER LIGAS
            </Link>
          </div>
        ) : (
          <>
            {/* ── Perfil card */}
            <div style={{
              background:'#161b22', borderRadius:18, border:'1px solid #30363d',
              padding:'28px 28px 22px', marginBottom:24,
              boxShadow:'0 0 40px rgba(0,255,136,0.04)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap', marginBottom:24 }}>
                <div style={{
                  width:80, height:80, borderRadius:20, background:'#00ff8820',
                  border:'2px solid #00ff8844', display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:'2.8rem', flexShrink:0,
                }}>
                  {globalStats.logo_url}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'1.3rem', color:'#e6edf3' }}>
                    {globalStats.team_name || globalStats.display_name}
                  </div>
                  <div style={{ color:'#8b949e', fontSize:'0.8rem', marginTop:4 }}>
                    {globalStats.display_name} · {globalStats.leagues_played} liga{globalStats.leagues_played !== 1 ? 's' : ''} jugada{globalStats.leagues_played !== 1 ? 's' : ''}
                  </div>
                </div>
                <Link href="/pro/ranking" style={{
                  padding:'8px 18px', borderRadius:8, textDecoration:'none',
                  background:'#21262d', border:'1px solid #30363d', color:'#8b949e', fontSize:'0.75rem',
                }}>
                  🏆 Ver Ranking
                </Link>
              </div>

              {/* Stats grid */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(80px, 1fr))', gap:12 }}>
                {[
                  { label:'PTS',  val: globalStats.pts,  color:'#ffd700' },
                  { label:'PJ',   val: globalStats.pj,   color:'#c9d1d9' },
                  { label:'G',    val: globalStats.pg,   color:'#00ff88' },
                  { label:'E',    val: globalStats.pe,   color:'#8b949e' },
                  { label:'P',    val: globalStats.pp,   color:'#ff4757' },
                  { label:'GF',   val: globalStats.gf,   color:'#00c3ff' },
                  { label:'GC',   val: globalStats.gc,   color:'#ff6b00' },
                  { label:'DG',   val: dg > 0 ? `+${dg}` : dg, color: dg >= 0 ? '#00ff88' : '#ff4757' },
                ].map(s => (
                  <div key={s.label} style={{
                    background:'#0d1117', borderRadius:10, padding:'12px 8px', textAlign:'center',
                    border:'1px solid #21262d',
                  }}>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'1.4rem', color:s.color }}>
                      {s.val}
                    </div>
                    <div style={{ color:'#555', fontSize:'0.6rem', letterSpacing:1, marginTop:3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Ligas */}
            {perLeague.length > 0 && (
              <div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.7rem', color:'#555', letterSpacing:2, marginBottom:14 }}>
                  HISTORIAL DE LIGAS
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {perLeague.map(l => {
                    const gc = l.game === 'efootball' ? '#00c3ff' : l.game === 'fc26' ? '#ff6b00' : '#00ff88';
                    const dg2 = l.gf - l.gc;
                    return (
                      <div key={l.leagueId} style={{
                        background:'#161b22', borderRadius:12,
                        border:`1px solid ${l.status === 'activa' ? '#00ff8833' : '#21262d'}`,
                        padding:'14px 18px',
                      }}>
                        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                          <span style={{
                            background:`${gc}22`, border:`1px solid ${gc}44`, borderRadius:5,
                            padding:'2px 8px', fontSize:'0.6rem', fontFamily:"'Orbitron',sans-serif",
                            fontWeight:700, color:gc, letterSpacing:1, flexShrink:0,
                          }}>
                            {GAME_LABEL[l.game] ?? l.game}
                          </span>
                          <div style={{ flex:1 }}>
                            <Link href={`/pro/liga/${l.leagueId}`} style={{
                              color:'#e6edf3', fontWeight:700, fontSize:'0.85rem',
                              textDecoration:'none',
                            }}>
                              {l.leagueName}
                            </Link>
                            <div style={{ color:'#8b949e', fontSize:'0.68rem', marginTop:2 }}>{l.platform}</div>
                          </div>
                          <div style={{ display:'flex', gap:14, fontSize:'0.78rem', flexWrap:'wrap' }}>
                            <span style={{ color:'#ffd700', fontWeight:700 }}>{l.pts} pts</span>
                            <span style={{ color:'#c9d1d9' }}>{l.pg}V {l.pe}E {l.pp}D</span>
                            <span style={{ color: dg2 >= 0 ? '#00ff88' : '#ff4757' }}>
                              DG {dg2 > 0 ? `+${dg2}` : dg2}
                            </span>
                          </div>
                          {l.status === 'activa' && (
                            <span style={{
                              fontSize:'0.6rem', color:'#00ff88', background:'#00ff8818',
                              border:'1px solid #00ff8833', borderRadius:4, padding:'2px 6px',
                              fontFamily:"'Orbitron',sans-serif", fontWeight:700,
                            }}>EN JUEGO</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
