'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

/* ─── Tipos ──────────────────────────────────────────── */
interface PublicData {
  nombre?: string; avatar_url?: string; region?: string;
  country?: string; countryName?: string;
  ciudad?: string; provincia?: string; id_consola?: string;
  fair_play?: number; titulos?: number; partidos_jugados?: number;
  victorias?: number; es_afiliado?: boolean; rol?: string;
}
interface Room {
  id: string; game?: string; mode?: string; tier?: string;
  status?: string; ganador?: string; entry_fee?: number;
  created_at?: { toDate?: () => Date };
}

/* ─── Helpers ────────────────────────────────────────── */
function FlagImg({ code, size = 24 }: { code?: string; size?: number }) {
  if (!code || code.length !== 2) return null;
  const c = code.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/w${size * 2}/${c}.png`}
      srcSet={`https://flagcdn.com/w${size * 2}/${c}.png 2x`}
      width={size}
      height={Math.round(size * 0.67)}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
      style={{ display: 'inline-block', borderRadius: 2, objectFit: 'cover', verticalAlign: 'middle', flexShrink: 0 }}
    />
  );
}
function getTier(t: number) {
  if (t >= 50) return { label:'LEYENDA', color:'#ff4757', icon:'👑', glow:'rgba(255,71,87,0.35)' };
  if (t >= 20) return { label:'ELITE',   color:'#ffd700', icon:'🔥', glow:'rgba(255,215,0,0.35)'  };
  if (t >= 10) return { label:'ORO',     color:'#f0c040', icon:'⭐', glow:'rgba(240,192,64,0.3)'  };
  if (t >= 5)  return { label:'PLATA',   color:'#a8b2c0', icon:'🥈', glow:'rgba(168,178,192,0.25)' };
  if (t >= 1)  return { label:'BRONCE',  color:'#cd7f32', icon:'🥉', glow:'rgba(205,127,50,0.25)' };
  return { label:'NOVATO', color:'#8b949e', icon:'🆕', glow:'rgba(139,148,158,0.15)' };
}
const GL: Record<string,string> = { FC26:'FC 26', EFOOTBALL:'eFootball' };
const ML: Record<string,string> = { GENERAL_95:'95 General', ULTIMATE:'Ultimate Team', DREAM_TEAM:'Dream Team', GENUINOS:'Genuinos' };
const TIER_CLR: Record<string,string> = { FREE:'#00d4ff', RECREATIVO:'#00ff88', COMPETITIVO:'#ffd700', ELITE:'#ff4757' };

/* ═══════════════════════════════════════════════════════ */
export default function JugadorPage() {
  const params = useParams();
  const router = useRouter();
  const targetUid = params.uid as string;

  const [myUid,   setMyUid]   = useState('');
  const [player,  setPlayer]  = useState<PublicData|null>(null);
  const [rooms,   setRooms]   = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound,setNotFound]= useState(false);

  /* Auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { if (!u) { router.replace('/'); return; } setMyUid(u.uid); });
    return unsub;
  }, [router]);

  /* Cargar jugador */
  useEffect(() => {
    if (!targetUid) return;
    const fetchPlayer = async () => {
      setLoading(true);
      const snap = await getDoc(doc(db, 'usuarios', targetUid));
      if (!snap.exists() || snap.data().baneado) { setNotFound(true); setLoading(false); return; }
      setPlayer(snap.data() as PublicData);

      /* Historial público (últimas 10 salas) */
      try {
        const s = await getDocs(query(collection(db,'tournaments'), where('players','array-contains',targetUid), orderBy('created_at','desc'), limit(10)));
        const list: Room[] = [];
        s.forEach(d => list.push({ id:d.id, ...d.data() } as Room));
        setRooms(list);
      } catch { /* índice pendiente */ }
      setLoading(false);
    };
    fetchPlayer();
  }, [targetUid]);

  if (loading) return (
    <div style={{ background:'#0b0e14', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:44, height:44, border:'3px solid #ffd700', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (notFound) return (
    <div style={{ background:'#0b0e14', minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <span style={{ fontSize:'3rem' }}>🚫</span>
      <div style={{ fontFamily:"'Orbitron',sans-serif", color:'#ff4757' }}>JUGADOR NO ENCONTRADO</div>
      <Link href="/ranking" style={{ color:'#00ff88', fontFamily:"'Orbitron',sans-serif", fontSize:'0.8rem' }}>← VOLVER AL RANKING</Link>
    </div>
  );

  if (!player) return null;

  const tier    = getTier(player.titulos||0);
  const isMe    = myUid === targetUid;
  const victs   = player.victorias || player.titulos || 0;
  const partidos= player.partidos_jugados || 0;
  const wr      = partidos > 0 ? Math.round((victs/partidos)*100) : 0;
  const fp      = player.fair_play ?? 100;

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0b0e14} ::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}
        .phov:hover td{background:rgba(255,255,255,0.03)!important}
      `}</style>

      <div style={{ background:'#0b0e14', minHeight:'100vh', color:'white', fontFamily:"'Roboto',sans-serif" }}>
        {/* NAV */}
        <header style={{ background:'rgba(7,9,13,0.97)', borderBottom:'1px solid #30363d', padding:'12px 5%', display:'flex', alignItems:'center', gap:14, position:'sticky', top:0, zIndex:100, flexWrap:'wrap' }}>
          <Link href="/ranking" style={{ color:'#8b949e', textDecoration:'none', fontFamily:"'Orbitron',sans-serif", fontSize:'0.72rem' }}>← RANKING</Link>
          <span style={{ color:'#30363d' }}>|</span>
          <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'0.78rem', color:'#ffd700', fontWeight:900 }}>PERFIL PÚBLICO</span>
          <div style={{ flex:1 }} />
          {isMe && <Link href="/perfil" style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'0.72rem', color:'#00ff88', textDecoration:'none', border:'1px solid #00ff8850', padding:'5px 12px', borderRadius:6 }}>✏️ EDITAR MI PERFIL</Link>}
        </header>

        <div style={{ maxWidth:760, margin:'0 auto', padding:'clamp(20px,4vw,36px) clamp(12px,4vw,5%)', animation:'fadeIn .4s ease' }}>

          {/* ── HERO ─────────────────────────────────── */}
          <div style={{ background:`linear-gradient(135deg,#161b22,#0d1117)`, border:`2px solid ${tier.color}25`, borderRadius:20, padding:'clamp(20px,4vw,32px)', marginBottom:20, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-50, right:-50, width:180, height:180, background:tier.glow, borderRadius:'50%', filter:'blur(50px)', pointerEvents:'none' }} />

            <div style={{ display:'flex', gap:'clamp(16px,3vw,28px)', alignItems:'center', flexWrap:'wrap', position:'relative' }}>
              {/* Avatar */}
              <div style={{ textAlign:'center', flexShrink:0 }}>
                <div style={{ width:110, height:110, borderRadius:'50%', border:`3px solid ${tier.color}`, boxShadow:`0 0 24px ${tier.glow}`, overflow:'hidden', background:'#1c2028', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {player.avatar_url ? <img src={player.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <span style={{ fontSize:'3rem' }}>👤</span>}
                </div>
                <div style={{ marginTop:8, fontFamily:"'Orbitron',sans-serif", fontSize:'0.62rem', fontWeight:900, color:tier.color, background:`${tier.color}15`, border:`1px solid ${tier.color}40`, borderRadius:20, padding:'3px 10px', display:'inline-block', boxShadow:`0 0 10px ${tier.glow}` }}>
                  {tier.icon} {tier.label}
                </div>
              </div>

              {/* Info */}
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:4 }}>
                  <h1 style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'clamp(1.2rem,3vw,1.8rem)', fontWeight:900, margin:0 }}>
                    {player.nombre || 'ANÓNIMO'}
                  </h1>
                  {player.country && <FlagImg code={player.country} size={26} />}
                  {player.es_afiliado && <span style={{ color:'#ffd700', fontSize:'0.7rem', fontWeight:700, background:'rgba(255,215,0,0.08)', padding:'2px 8px', borderRadius:6 }}>⭐ AFILIADO</span>}
                  {isMe && <span style={{ color:'#00ff88', fontSize:'0.65rem', fontFamily:"'Orbitron',sans-serif" }}>← TÚ</span>}
                </div>

                <div style={{ color:'#8b949e', fontSize:'0.76rem', marginBottom:12, display:'flex', flexWrap:'wrap', gap:12 }}>
                  {player.ciudad && player.provincia && <span>📍 {player.ciudad}, {player.provincia}</span>}
                  {player.countryName && <span>🌍 {player.countryName}</span>}
                  {player.id_consola && <span style={{ color:'#009ee3' }}>🎮 {player.id_consola}</span>}
                </div>

                {/* Stats grid */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(85px,1fr))', gap:8 }}>
                  {[
                    { l:'TÍTULOS',   v:player.titulos||0,               c:tier.color  },
                    { l:'VICTORIAS', v:victs,                            c:'#00ff88'   },
                    { l:'PARTIDOS',  v:partidos,                         c:'#009ee3'   },
                    { l:'WIN RATE',  v:`${wr}%`,                        c:wr>=60?'#00ff88':wr>=40?'#ffd700':'#ff4757' },
                    { l:'FAIR PLAY', v:`${fp}%`,                        c:fp>=80?'#00ff88':fp>=50?'#ffd700':'#ff4757' },
                  ].map(s=>(
                    <div key={s.l} style={{ background:'#0b0e14', borderRadius:10, padding:'9px 10px', border:'1px solid #30363d', textAlign:'center' }}>
                      <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'clamp(0.9rem,2vw,1.15rem)', fontWeight:900, color:s.c }}>{s.v}</div>
                      <div style={{ color:'#8b949e', fontSize:'0.57rem', marginTop:2, fontFamily:"'Orbitron',sans-serif" }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── BARRAS ───────────────────────────────── */}
          <div style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:14, padding:'clamp(14px,3vw,20px)', marginBottom:20 }}>
            <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#00ff88', margin:'0 0 14px', fontSize:'0.8rem' }}>📊 ESTADÍSTICAS</h3>
            {[
              { l:'FAIR PLAY', v:fp, c:fp>=80?'#00ff88':fp>=50?'#ffd700':'#ff4757' },
              { l:'WIN RATE',  v:wr, c:'#009ee3' },
            ].map(b=>(
              <div key={b.l} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:'0.72rem' }}>
                  <span style={{ color:'#8b949e' }}>{b.l}</span>
                  <span style={{ color:b.c, fontWeight:700 }}>{b.v}%</span>
                </div>
                <div style={{ height:7, background:'#0b0e14', borderRadius:10, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${b.v}%`, background:b.c, borderRadius:10, boxShadow:`0 0 8px ${b.c}60`, transition:'width 1s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* ── HISTORIAL ────────────────────────────── */}
          <div style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:14, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #30363d', fontFamily:"'Orbitron',sans-serif", color:'#ffd700', fontSize:'0.8rem' }}>
              🎮 ÚLTIMAS SALAS ({rooms.length})
            </div>
            {rooms.length === 0 ? (
              <div style={{ padding:'30px', textAlign:'center', color:'#8b949e' }}>Sin salas públicas</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem', minWidth:400 }}>
                  <thead><tr>{['JUEGO','MODO','TIER','RESULTADO','ENTRADA'].map(h=>(
                    <th key={h} style={{ padding:'9px 12px', textAlign:'left', color:'#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.6rem', borderBottom:'1px solid #30363d', background:'rgba(0,0,0,0.2)' }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {rooms.map(r => {
                      const gano = r.ganador === targetUid;
                      const fin  = r.status==='FINISHED'||r.status==='COMPLETED';
                      return (
                        <tr key={r.id} className="phov">
                          <td style={{ padding:'10px 12px', borderBottom:'1px solid #1c2028' }}>{GL[r.game||'']||r.game}</td>
                          <td style={{ padding:'10px 12px', borderBottom:'1px solid #1c2028', color:'#8b949e' }}>{ML[r.mode||'']||r.mode}</td>
                          <td style={{ padding:'10px 12px', borderBottom:'1px solid #1c2028', color:TIER_CLR[r.tier||'']||'#fff', fontWeight:700 }}>{r.tier}</td>
                          <td style={{ padding:'10px 12px', borderBottom:'1px solid #1c2028' }}>
                            {!fin ? <span style={{ color:'#00ff88', fontWeight:700 }}>EN CURSO</span>
                              : gano ? <span style={{ color:'#ffd700', fontWeight:700 }}>🏆 CAMPEÓN</span>
                              : <span style={{ color:'#8b949e' }}>— —</span>}
                          </td>
                          <td style={{ padding:'10px 12px', borderBottom:'1px solid #1c2028', color:r.entry_fee?'#ffd700':'#00d4ff' }}>
                            {r.entry_fee?`🪙${r.entry_fee.toLocaleString()}`:'GRATIS'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
