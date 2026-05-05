'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

// ── Logo options (same as EnrollModal) ────────────────────────────────────────────
const LOGOS_ESCUDOS = ['⚽','🦁','🦅','🐉','🌟','⭐','🔥','💎','🛡️','⚡','🌊','🏔️','🐺','🦊','🐯','🌙','☀️','🌈','🎯','💥','🏆','👑','🔱','⚜️','🎠','🌍','🛸','🐬','🦄','🐴'];
const LOGOS_FLAGS   = ['🇪🇸','🇧🇷','🇨🇱','🇨🇴','🇲🇽','🇵🇪','🇺🇾','🇵🇾','🇪🇨','🇧🇴','🇻🇪','🇪🇸','🇵🇹','🇺🇸','🇫🇷','🇮🇹','🇩🇪','🇯🇵','🇰🇷','🇸🇦','🇦🇺','🇳🇱','🇧🇪','🇵🇱','🇬🇧'];
const LOGOS_CLUBS   = ['🔵','🔴','🟡','🟢','⚪','🟠','🟣','⚫','🔷','🔶','🔺','🔻','💠','♦️','🖘','🎱','🌐','🏵️','🏅','🥇'];
type LogoTab = 'escudos' | 'banderas' | 'colores' | 'url';

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

interface UserInfo {
  nombre: string;
  email: string;
  whatsapp: string;
  pais: string;
  provincia: string;
  consola: string;
  konami_id: string;
  ea_id: string;
  is_bot?: boolean;
}

const GAME_LABEL: Record<string, string> = { efootball: 'eFootball', fc26: 'FC 26', mobile: 'Mobile' };

export default function ProPerfilPage() {
  const router = useRouter();
  const [uid,         setUid]         = useState('');
  const [ready,       setReady]       = useState(false);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [perLeague,   setPerLeague]   = useState<LeagueStat[]>([]);
  const [userInfo,    setUserInfo]    = useState<UserInfo | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [editing,     setEditing]     = useState(false);

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
        // 0. User profile info
        const userSnap = await getDoc(doc(db, 'usuarios', uid));
        if (userSnap.exists()) {
          const u = userSnap.data();
          setUserInfo({
            nombre:    u.nombre    || auth.currentUser?.displayName || '',
            email:     u.email     || auth.currentUser?.email       || '',
            whatsapp:  u.whatsapp  || '',
            pais:      u.pais      || u.country || '',
            provincia: u.provincia || '',
            consola:   u.consola   || '',
            konami_id: u.konami_id || '',
            ea_id:     u.ea_id     || '',
          });
        } else {
          setUserInfo({
            nombre:    auth.currentUser?.displayName || '',
            email:     auth.currentUser?.email       || '',
            whatsapp:  '', pais: '', provincia: '', consola: '', konami_id: '', ea_id: '',
          });
        }

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

  function handleSaved(updated: Partial<GlobalStats & UserInfo>) {
    setGlobalStats(prev => prev ? { ...prev, ...updated } : prev);
    setUserInfo(prev => prev ? { ...prev, ...updated } : prev);
    setEditing(false);
  }

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
                {/* Logo */}
                {globalStats.logo_url?.startsWith('http') ? (
                  <img src={globalStats.logo_url} alt="logo" style={{
                    width:80, height:80, borderRadius:20, objectFit:'cover',
                    border:'2px solid #00ff8844', flexShrink:0,
                  }} />
                ) : (
                  <div style={{
                    width:80, height:80, borderRadius:20, background:'#00ff8820',
                    border:'2px solid #00ff8844', display:'flex', alignItems:'center',
                    justifyContent:'center', fontSize:'2.8rem', flexShrink:0,
                  }}>
                    {globalStats.logo_url || '\u26bd'}
                  </div>
                )}
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'1.3rem', color:'#e6edf3' }}>
                    {globalStats.team_name || globalStats.display_name}
                  </div>
                  <div style={{ color:'#8b949e', fontSize:'0.8rem', marginTop:4 }}>
                    {globalStats.display_name} \u00b7 {globalStats.leagues_played} liga{globalStats.leagues_played !== 1 ? 's' : ''} jugada{globalStats.leagues_played !== 1 ? 's' : ''}
                  </div>
                  {userInfo?.pais && (
                    <div style={{ color:'#555', fontSize:'0.72rem', marginTop:3 }}>
                      \ud83c\udf0d {userInfo.pais}{userInfo.provincia ? ` \u00b7 ${userInfo.provincia}` : ''}
                      {userInfo.consola ? ` \u00b7 ${userInfo.consola}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button onClick={() => setEditing(e => !e)} style={{
                    padding:'8px 16px', borderRadius:8, border:'1px solid #00ff8844',
                    background: editing ? '#00ff8820' : 'transparent',
                    color:'#00ff88', cursor:'pointer', fontSize:'0.75rem',
                    fontFamily:"'Orbitron',sans-serif", fontWeight:700,
                  }}>
                    {editing ? '\u2715 CANCELAR' : '\u270f\ufe0f EDITAR'}
                  </button>
                  <Link href="/pro/ranking" style={{
                    padding:'8px 18px', borderRadius:8, textDecoration:'none',
                    background:'#21262d', border:'1px solid #30363d', color:'#8b949e', fontSize:'0.75rem',
                  }}>
                    \ud83c\udfc6 Ranking
                  </Link>
                </div>
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

              {/* Inline edit panel */}
              {editing && globalStats && (
                <EditPanel uid={uid} globalStats={globalStats} userInfo={userInfo} onSaved={handleSaved} />
              )}
            </div>

            {/* ── Datos de contacto (read-only) */}
            {!editing && userInfo && (userInfo.email || userInfo.whatsapp || userInfo.konami_id || userInfo.ea_id) && (
              <div style={{
                background:'#161b22', borderRadius:14, border:'1px solid #21262d',
                padding:'18px 22px', marginBottom:24,
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.65rem', color:'#555', letterSpacing:2 }}>
                    DATOS DE PERFIL
                  </div>
                  <button onClick={() => setEditing(true)} style={{ background:'none', border:'none', color:'#8b949e', cursor:'pointer', fontSize:'0.72rem' }}>
                    ✏️ editar
                  </button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12 }}>
                  {userInfo.email && (
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:'1.1rem' }}>📧</span>
                      <div>
                        <div style={{ color:'#555', fontSize:'0.62rem', letterSpacing:1 }}>EMAIL</div>
                        <div style={{ color:'#555', fontSize:'0.8rem', fontStyle:'italic' }}>privado 🔒</div>
                      </div>
                    </div>
                  )}
                  {userInfo.whatsapp && (
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:'1.1rem' }}>💬</span>
                      <div>
                        <div style={{ color:'#555', fontSize:'0.62rem', letterSpacing:1 }}>WHATSAPP (privado)</div>
                        <a href={`https://wa.me/${userInfo.whatsapp.replace(/\D/g,'')}`}
                          target="_blank" rel="noreferrer"
                          style={{ color:'#00ff88', fontSize:'0.8rem', textDecoration:'none' }}>
                          {userInfo.whatsapp}
                        </a>
                      </div>
                    </div>
                  )}
                  {userInfo.konami_id && (
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:'1.1rem' }}>🎮</span>
                      <div>
                        <div style={{ color:'#555', fontSize:'0.62rem', letterSpacing:1 }}>KONAMI ID</div>
                        <div style={{ color:'#00c3ff', fontSize:'0.8rem', fontFamily:'monospace' }}>{userInfo.konami_id}</div>
                      </div>
                    </div>
                  )}
                  {userInfo.ea_id && (
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:'1.1rem' }}>🎮</span>
                      <div>
                        <div style={{ color:'#555', fontSize:'0.62rem', letterSpacing:1 }}>EA ID</div>
                        <div style={{ color:'#ff6b00', fontSize:'0.8rem', fontFamily:'monospace' }}>{userInfo.ea_id}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Fair Play banner */}
            <div style={{
              background:'linear-gradient(135deg,#0d1117,#161b22)', borderRadius:14,
              border:'1px solid #ffd70033', padding:'16px 22px', marginBottom:24,
              display:'flex', alignItems:'center', gap:14,
            }}>
              <span style={{ fontSize:'1.8rem', flexShrink:0 }}>⚖️</span>
              <div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.7rem', color:'#ffd700', letterSpacing:1 }}>
                  FAIR PLAY — CÓDIGO LFA
                </div>
                <div style={{ color:'#8b949e', fontSize:'0.75rem', marginTop:4, lineHeight:1.6 }}>
                  SomosLFA PRO es para <strong style={{ color:'#e6edf3' }}>disfrutar del juego</strong> — con amigos, conocidos y gente nueva que comparte la pasión. Reportar resultados correctamente es parte del respeto. Los incumplimientos reiterados pueden generar <strong style={{ color:'#ff6b00' }}>descuento de puntos o eliminación de la liga</strong>. ¡A jugar! 🎮
                </div>
              </div>
            </div>

            {/* ── Historial de ligas */}
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
                            <Link href={`/pro/liga/${l.leagueId}`} style={{ color:'#e6edf3', fontWeight:700, fontSize:'0.85rem', textDecoration:'none' }}>
                              {l.leagueName}
                            </Link>
                            <div style={{ color:'#8b949e', fontSize:'0.68rem', marginTop:2 }}>{l.platform}</div>
                          </div>
                          <div style={{ display:'flex', gap:14, fontSize:'0.78rem', flexWrap:'wrap' }}>
                            <span style={{ color:'#ffd700', fontWeight:700 }}>{l.pts} pts</span>
                            <span style={{ color:'#c9d1d9' }}>{l.pg}V {l.pe}E {l.pp}D</span>
                            <span style={{ color: dg2 >= 0 ? '#00ff88' : '#ff4757' }}>DG {dg2 > 0 ? `+${dg2}` : dg2}</span>
                          </div>
                          {l.status === 'activa' && (
                            <span style={{ fontSize:'0.6rem', color:'#00ff88', background:'#00ff8818', border:'1px solid #00ff8833', borderRadius:4, padding:'2px 6px', fontFamily:"'Orbitron',sans-serif", fontWeight:700 }}>EN JUEGO</span>
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

      {/* ── Floating support button */}
      <SupportButton />
    </div>
  );
}

// ── EditPanel component ────────────────────────────────────────────────────────
function EditPanel({
  uid, globalStats, userInfo, onSaved,
}: {
  uid: string;
  globalStats: GlobalStats;
  userInfo: UserInfo | null;
  onSaved: (u: Partial<GlobalStats & UserInfo>) => void;
}) {
  const [logoTab,   setLogoTab]   = useState<LogoTab>('escudos');
  const [logo,      setLogo]      = useState(globalStats.logo_url || '⚽');
  const [customUrl, setCustomUrl] = useState(globalStats.logo_url?.startsWith('http') ? globalStats.logo_url : '');
  const [teamName,  setTeamName]  = useState(globalStats.team_name || '');
  const [konamiId,  setKonamiId]  = useState(userInfo?.konami_id || '');
  const [eaId,      setEaId]      = useState(userInfo?.ea_id || '');
  const [whatsapp,  setWhatsapp]  = useState(userInfo?.whatsapp || '');
  const [pais,      setPais]      = useState(userInfo?.pais || '');
  const [provincia, setProvincia] = useState(userInfo?.provincia || '');
  const [consola,   setConsola]   = useState(userInfo?.consola || '');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const displayLogo = logoTab === 'url' && customUrl.trim() ? customUrl.trim() : logo;
  const curList = logoTab === 'escudos' ? LOGOS_ESCUDOS : logoTab === 'banderas' ? LOGOS_FLAGS : LOGOS_CLUBS;

  async function save() {
    setSaving(true); setError('');
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/saveProfile', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ team_name: teamName, logo_url: displayLogo, konami_id: konamiId, ea_id: eaId, whatsapp, pais, provincia, consola }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Error.'); return; }
      onSaved({ team_name: teamName, logo_url: displayLogo, konami_id: konamiId, ea_id: eaId, whatsapp, pais, provincia, consola });
    } catch { setError('Error de conexión.'); }
    finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', background:'#0b0e14', border:'1px solid #30363d', borderRadius:8, color:'#e6edf3', fontSize:'0.82rem', outline:'none', boxSizing:'border-box' };
  const lbl: React.CSSProperties = { color:'#555', fontSize:'0.62rem', letterSpacing:1, display:'block', marginBottom:5, fontFamily:"'Orbitron',sans-serif", fontWeight:700 };

  return (
    <div style={{ background:'#0d1117', borderRadius:14, border:'1px solid #00ff8833', padding:'20px', marginTop:16 }}>
      <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.7rem', color:'#00ff88', letterSpacing:2, marginBottom:20 }}>
        ✏️ EDITAR PERFIL
      </div>

      {/* Logo picker */}
      <div style={{ marginBottom:18 }}>
        <span style={lbl}>ESCUDO DEL EQUIPO</span>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
          {displayLogo?.startsWith('http') ? (
            <img src={displayLogo} alt="logo" style={{ width:52, height:52, borderRadius:10, objectFit:'cover', border:'2px solid #00ff8844' }} />
          ) : (
            <div style={{ width:52, height:52, borderRadius:10, background:'#161b22', border:'2px solid #00ff8844', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem' }}>
              {logo}
            </div>
          )}
          <span style={{ color:'#8b949e', fontSize:'0.75rem' }}>Logo actual</span>
        </div>
        <div style={{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap' }}>
          {(['escudos','banderas','colores','url'] as LogoTab[]).map(t => (
            <button key={t} onClick={() => setLogoTab(t)} style={{
              padding:'4px 10px', borderRadius:6, cursor:'pointer',
              background: logoTab===t ? '#00ff8822' : '#21262d',
              border:`1px solid ${logoTab===t ? '#00ff8844' : '#30363d'}`,
              color: logoTab===t ? '#00ff88' : '#8b949e',
              fontSize:'0.65rem', fontFamily:"'Orbitron',sans-serif", fontWeight:700,
            } as React.CSSProperties}>
              {t === 'escudos' ? '🛡️ ESC.' : t === 'banderas' ? '🌎 BAND.' : t === 'colores' ? '🎨 COL.' : '🔗 URL'}
            </button>
          ))}
        </div>
        {logoTab !== 'url' ? (
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, maxHeight:100, overflowY:'auto' }}>
            {curList.map(l => (
              <button key={l} onClick={() => setLogo(l)} style={{
                padding:'4px 6px', borderRadius:6, border:`2px solid ${logo===l ? '#00ff88' : 'transparent'}`,
                background: logo===l ? '#00ff8820' : '#21262d', cursor:'pointer', fontSize:'1.3rem',
              }}>{l}</button>
            ))}
          </div>
        ) : (
          <div>
            <input value={customUrl} onChange={e => setCustomUrl(e.target.value)}
              placeholder="https://... URL de tu logo (jpg/png)" style={{ ...inp, marginBottom:6 }} />
            {customUrl.trim() && (
              <img src={customUrl.trim()} alt="preview" style={{ width:60, height:60, borderRadius:8, objectFit:'cover', border:'1px solid #30363d' }}
                onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
            )}
          </div>
        )}
      </div>

      {/* Fields */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
        <div style={{ gridColumn:'1/-1' }}>
          <span style={lbl}>NOMBRE DEL EQUIPO</span>
          <input value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={40} placeholder="Ej: Los Cóndores FC" style={inp} />
        </div>
        <div><span style={lbl}>KONAMI ID</span><input value={konamiId} onChange={e => setKonamiId(e.target.value)} maxLength={30} placeholder="Tu ID de Konami" style={inp} /></div>
        <div><span style={lbl}>EA ID (FC 26)</span><input value={eaId} onChange={e => setEaId(e.target.value)} maxLength={30} placeholder="Tu EA ID" style={inp} /></div>
        <div><span style={lbl}>WHATSAPP 💬</span><input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} maxLength={20} placeholder="+54 9 11 xxxx" style={inp} /></div>
        <div><span style={lbl}>PAÍS 🌍</span><input value={pais} onChange={e => setPais(e.target.value)} maxLength={40} placeholder="Argentina..." style={inp} /></div>
        <div><span style={lbl}>PROVINCIA / CIUDAD</span><input value={provincia} onChange={e => setProvincia(e.target.value)} maxLength={40} placeholder="Buenos Aires..." style={inp} /></div>
        <div><span style={lbl}>CONSOLA / PC</span><input value={consola} onChange={e => setConsola(e.target.value)} maxLength={30} placeholder="PS5, Xbox, PC..." style={inp} /></div>
      </div>

      <div style={{ background:'#161b22', borderRadius:8, padding:'10px 14px', marginBottom:16, border:'1px solid #21262d', fontSize:'0.72rem', color:'#8b949e', lineHeight:1.6 }}>
        🔒 <strong style={{ color:'#c9d1d9' }}>Privacidad:</strong> WhatsApp y Email son <strong style={{ color:'#ffd700' }}>privados</strong> — solo visibles para tu rival al coordinar el partido. Nombre de equipo, escudo, país y consola son <strong style={{ color:'#00ff88' }}>públicos</strong>.
      </div>

      {error && <div style={{ color:'#ff6b6b', fontSize:'0.78rem', marginBottom:10 }}>{error}</div>}

      <button onClick={save} disabled={saving} style={{
        width:'100%', padding:'12px', borderRadius:10, border:'none', cursor:'pointer',
        background: saving ? '#30363d' : 'linear-gradient(135deg,#00ff88,#00cc6a)',
        color:'#000', fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.78rem',
        opacity: saving ? 0.7 : 1,
      }}>
        {saving ? 'Guardando...' : '✅ GUARDAR CAMBIOS'}
      </button>
    </div>
  );
}

// ── Floating support button ───────────────────────────────────────────────────
function SupportButton() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:999 }}>
      {open && (
        <div style={{
          position:'absolute', bottom:64, right:0, width:272,
          background:'#161b22', borderRadius:14, border:'1px solid #30363d',
          boxShadow:'0 8px 32px rgba(0,0,0,0.5)', padding:'18px',
        }}>
          <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.7rem', color:'#00ff88', letterSpacing:1, marginBottom:12 }}>
            AYUDA & SOPORTE
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <Link href="/reglamento" style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#21262d', borderRadius:8, textDecoration:'none', color:'#c9d1d9', fontSize:'0.78rem' }}>
              📋 Reglamento de Ligas
            </Link>
            <Link href="/reglamento" style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#21262d', borderRadius:8, textDecoration:'none', color:'#c9d1d9', fontSize:'0.78rem' }}>
              ⚖️ Fair Play & Sanciones
            </Link>
            <Link href="/reglamento" style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#21262d', borderRadius:8, textDecoration:'none', color:'#c9d1d9', fontSize:'0.78rem' }}>
              📸 ¿Cómo reportar resultado?
            </Link>
            <a href="https://wa.me/message/LFASUPPORT" target="_blank" rel="noreferrer"
              style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#00ff8818', border:'1px solid #00ff8833', borderRadius:8, textDecoration:'none', color:'#00ff88', fontSize:'0.78rem' }}>
              💬 Chat con Staff (WhatsApp)
            </a>
          </div>
          <div style={{ marginTop:12, fontSize:'0.65rem', color:'#555', textAlign:'center' }}>Respondemos en menos de 24hs</div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} style={{
        width:52, height:52, borderRadius:26, border:'2px solid #00ff8844',
        background:'linear-gradient(135deg,#00ff88,#00cc6a)',
        color:'#000', fontSize:'1.3rem', cursor:'pointer',
        boxShadow:'0 4px 20px rgba(0,255,136,0.4)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {open ? '✕' : '?'}
      </button>
    </div>
  );
}
