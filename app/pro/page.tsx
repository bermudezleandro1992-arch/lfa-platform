'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, onSnapshot,
  doc, getDoc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { ProLeague } from '@/lib/types';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const EnrollModal = dynamic(() => import('@/app/_components/pro/EnrollModal'), { ssr: false });

// -- Helpers ----------------------------------------------------------------
const GAME_LABEL: Record<string, string> = { efootball: 'eFootball', fc26: 'FC 26', mobile: 'Mobile' };
const GAME_COLOR: Record<string, string> = { efootball: '#00c3ff', fc26: '#ff6b00', mobile: '#00ff88' };
const MODE_LABEL: Record<string, string> = {
  dream_team: 'Dream Team', ultimate_team: 'Ultimate Team',
  general_95: 'General 95', seleccion: 'Selección', equipos: 'Equipos',
  general_libre: 'General Libre', '95gen': '95 Gen',
};
const STATUS_LABEL: Record<string, string> = {
  inscripcion: 'INSCRIPCIONES ABIERTAS', activa: 'EN JUEGO',
  playoffs: 'PLAYOFFS', finalizada: 'FINALIZADA',
};
const STATUS_COLOR: Record<string, string> = {
  inscripcion: '#00ff88', activa: '#ffd700', playoffs: '#ff6b00', finalizada: '#555',
};

export default function ProPage() {
  const router = useRouter();
  const [uid,        setUid]        = useState('');
  const [ready,      setReady]      = useState(false);
  const [leagues,    setLeagues]    = useState<ProLeague[]>([]);
  const [enrolled,   setEnrolled]   = useState<Set<string>>(new Set());
  const [enrolling,  setEnrolling]  = useState<ProLeague | null>(null);
  const [filterGame, setFilterGame] = useState<'all' | 'efootball' | 'fc26' | 'mobile'>('all');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) { router.replace('/'); return; }
      setUid(u.uid);
      setReady(true);
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'leagues'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProLeague));
      // Sort client-side (no orderBy to avoid composite index)
      all.sort((a, b) => {
        const ta = (a.created_at as { seconds?: number })?.seconds ?? 0;
        const tb = (b.created_at as { seconds?: number })?.seconds ?? 0;
        return tb - ta;
      });
      setLeagues(all);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid || leagues.length === 0) return;
    Promise.all(leagues.map(l =>
      getDoc(doc(db, 'leagues', l.id, 'participants', uid))
        .then(s => s.exists() ? l.id : null)
    )).then(res => setEnrolled(new Set(res.filter(Boolean) as string[])));
  }, [uid, leagues]);

  const visible = filterGame === 'all'
    ? leagues.filter(l => l.status !== 'finalizada')
    : leagues.filter(l => l.game === filterGame && l.status !== 'finalizada');

  const finalizadas = leagues.filter(l => l.status === 'finalizada');

  if (!ready) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#0b0e14' }}>
      <span style={{ fontFamily:"'Orbitron',sans-serif",color:'#00ff88',fontSize:'1.1rem' }}>Cargando PRO...</span>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#0b0e14', color:'#c9d1d9' }}>
      {/* -- HEADER ------------------------------------------------------- */}
      <div style={{ background:'linear-gradient(180deg,#0d1117 0%,#0b0e14 100%)', borderBottom:'1px solid #30363d' }}>
        <div style={{ maxWidth:920, margin:'0 auto', padding:'20px 20px 0' }}>
          {/* Nav */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:8 }}>
            <Link href="/hub" style={{ color:'#8b949e', textDecoration:'none', fontSize:'0.78rem' }}>
              ← Hub
            </Link>
            <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <Link href="/pro/perfil" style={{
                color:'#00ff88', textDecoration:'none', fontSize:'0.72rem',
                fontFamily:"'Orbitron',sans-serif", fontWeight:700, letterSpacing:1,
                border:'1px solid #00ff8833', borderRadius:6, padding:'4px 10px',
              }}>
                👤 MI PERFIL
              </Link>
              <Link href="/pro/ranking" style={{
                color:'#ffd700', textDecoration:'none', fontSize:'0.72rem',
                fontFamily:"'Orbitron',sans-serif", fontWeight:700, letterSpacing:1,
                border:'1px solid #ffd70033', borderRadius:6, padding:'4px 10px',
              }}>
                🏆 RANKING
              </Link>
              <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'0.7rem', letterSpacing:2 }}>
                SOMOS<span style={{ color:'#ffd700' }}>LFA</span>{' '}
                <span style={{ color:'#00ff88' }}>PRO</span>
              </div>
            </div>
          </div>

          {/* Hero */}
          <div style={{ textAlign:'center', paddingBottom:28 }}>
            <div style={{
              fontFamily:"'Orbitron',sans-serif", fontWeight:900,
              fontSize:'clamp(2rem,6vw,3.5rem)',
              background:'linear-gradient(135deg,#00ff88 0%,#ffd700 100%)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
              letterSpacing:2,
            }}>
              LIGA 1vs1
            </div>
            <div style={{ color:'#8b949e', marginTop:8, fontSize:'0.88rem', maxWidth:500, margin:'8px auto 0' }}>
              Round Robin + Playoffs · Reportes con IA · Automatización total
            </div>

            {/* Stats */}
            <div style={{ display:'flex', justifyContent:'center', gap:40, marginTop:24, flexWrap:'wrap' }}>
              {[
                { label:'LIGAS ACTIVAS', val: leagues.filter(l=>l.status==='activa').length, color:'#ffd700' },
                { label:'EN INSCRIPCIÓN', val: leagues.filter(l=>l.status==='inscripcion').length, color:'#00ff88' },
                { label:'MIS LIGAS', val: enrolled.size, color:'#00c3ff' },
              ].map(s => (
                <div key={s.label} style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'2rem', color:s.color }}>{s.val}</div>
                  <div style={{ color:'#8b949e', fontSize:'0.6rem', letterSpacing:1.5, marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #30363d' }}>
            {(['all','efootball','fc26','mobile'] as const).map(g => (
              <button key={g} onClick={() => setFilterGame(g)}
                style={{
                  padding:'10px 22px', border:'none', background:'transparent', cursor:'pointer',
                  color: filterGame===g ? '#00ff88' : '#8b949e',
                  borderBottom: filterGame===g ? '2px solid #00ff88' : '2px solid transparent',
                  fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.7rem',
                  letterSpacing:1, transition:'all 0.15s',
                }}
              >
                {g==='all' ? 'TODAS' : GAME_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* -- LEAGUES LIST ------------------------------------------------ */}
      <div style={{ maxWidth:920, margin:'0 auto', padding:'28px 20px' }}>
        {visible.length === 0 && (
          <div style={{ textAlign:'center', padding:'70px 20px', color:'#8b949e' }}>
            <div style={{ fontSize:'3.5rem', marginBottom:16 }}>??</div>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'1rem' }}>Próximamente</div>
            <div style={{ fontSize:'0.82rem', marginTop:8 }}>Nuevas temporadas en preparación</div>
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {visible.map(l => (
            <LeagueCard key={l.id} league={l}
              isEnrolled={enrolled.has(l.id)}
              onEnroll={() => setEnrolling(l)}
            />
          ))}
        </div>

        {finalizadas.length > 0 && (
          <div style={{ marginTop:36 }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.7rem', color:'#555', letterSpacing:2, marginBottom:12 }}>
              LIGAS FINALIZADAS
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {finalizadas.map(l => (
                <LeagueCard key={l.id} league={l} isEnrolled={enrolled.has(l.id)} onEnroll={() => {}} />
              ))}
            </div>
          </div>
        )}
      </div>

      {enrolling && (
        <EnrollModal league={enrolling} uid={uid}
          onClose={() => setEnrolling(null)}
          onSuccess={() => { setEnrolled(prev => new Set(Array.from(prev).concat(enrolling!.id))); setEnrolling(null); }}
        />
      )}

      <HelpWidget />
    </div>
  );
}

// --- Help Widget -------------------------------------------------------------
const WA_GROUP = 'https://chat.whatsapp.com/FIEQYxN6u1pCWYMdrNMuu4';

const FAQ_ITEMS = [
  {
    q: '¿Cómo reporto mi resultado?',
    a: 'Al terminar el partido, entrá a la web, buscá tu partido activo y tocá en "Subir Captura". Subí la foto de la pantalla final donde se vean los goles. ¡La IA la validará en segundos!',
  },
  {
    q: 'Mi rival no responde, ¿qué hago?',
    a: 'Si pasaron más de 10 minutos y tu rival no contesta, tocá el botón "Disputar" en tu partido. El Staff revisará el caso y te dará la victoria por W.O.',
  },
  {
    q: 'La IA leyó mal mi resultado, ¿cómo lo arreglo?',
    a: 'Si el marcador detectado es incorrecto, no confirmes el resultado. Abrí el partido y tocá "Reabrir". Un árbitro humano mirará la foto y corregirá el marcador manualmente.',
  },
  {
    q: '¿Puedo cambiar mi ID de jugador (PSN/EA/Konami)?',
    a: 'Sí, andá a "Mi Perfil" en la web y tocá EDITAR. Recordá que si jugás con un ID distinto al registrado podés ser descalificado del torneo por seguridad.',
  },
  {
    q: '¿Cómo sé cuándo es mi próximo partido?',
    a: 'Entrá a tu liga y verás los partidos pendientes en "Mis Partidos". Mantenete atento porque cuando el sistema asigna la jornada ya podés desafiar a tu rival.',
  },
];

function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:999, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:10 }}>
      {/* WA community floating */}
      <a href={WA_GROUP} target="_blank" rel="noreferrer" title="Unirse al grupo LFA en WhatsApp"
        style={{
          width:50, height:50, borderRadius:25, background:'#25d366',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 4px 20px rgba(37,211,102,0.5)',
          textDecoration:'none', fontSize:'1.5rem',
          border:'2px solid rgba(37,211,102,0.4)',
          transition:'transform 0.2s',
        }}>
        💬
      </a>

      {/* FAQ panel */}
      {open && (
        <div style={{
          width:300, background:'#161b22', borderRadius:16,
          border:'1px solid #30363d', boxShadow:'0 8px 40px rgba(0,0,0,0.7)',
          padding:'18px 16px', maxHeight:'80vh', overflowY:'auto',
        }}>
          <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.68rem', color:'#00ff88', letterSpacing:1, marginBottom:4 }}>
            🆘 AUTO-AYUDA — SOMOS LFA PRO
          </div>
          <div style={{ color:'#555', fontSize:'0.63rem', marginBottom:14 }}>Tocá una pregunta para ver la respuesta</div>

          {FAQ_ITEMS.map((item, i) => (
            <div key={i} style={{ marginBottom:8, background:'#0d1117', borderRadius:10, overflow:'hidden', border:`1px solid ${expanded===i ? '#00ff8844' : '#21262d'}` }}>
              <button onClick={() => setExpanded(expanded===i ? null : i)} style={{
                width:'100%', textAlign:'left', background:'none', border:'none',
                padding:'10px 12px', cursor:'pointer', color:'#c9d1d9',
                fontSize:'0.75rem', fontWeight:600, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
              }}>
                <span style={{ flex:1 }}>{item.q}</span>
                <span style={{ color:'#00ff88', flexShrink:0, fontSize:'0.65rem' }}>{expanded===i ? '▲' : '▼'}</span>
              </button>
              {expanded===i && (
                <div style={{ padding:'0 12px 12px', color:'#8b949e', fontSize:'0.73rem', lineHeight:1.7 }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}

          <div style={{ borderTop:'1px solid #21262d', marginTop:14, paddingTop:14, display:'flex', flexDirection:'column', gap:8 }}>
            <a href={WA_GROUP} target="_blank" rel="noreferrer" style={{
              display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
              background:'#25d36618', border:'1px solid #25d36633', borderRadius:10,
              textDecoration:'none', color:'#25d366', fontSize:'0.75rem', fontWeight:600,
            }}>
              💬 Unirse al Grupo LFA en WhatsApp
            </a>
            <Link href="/reglamento" style={{
              display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
              background:'#21262d', border:'1px solid #30363d', borderRadius:10,
              textDecoration:'none', color:'#8b949e', fontSize:'0.75rem',
            }}>
              📋 Reglamento oficial
            </Link>
          </div>
          <div style={{ marginTop:10, fontSize:'0.62rem', color:'#555', textAlign:'center' }}>
            ⚡ Respondemos en menos de 24hs
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button onClick={() => setOpen(o => !o)} style={{
        width:52, height:52, borderRadius:26, border:'2px solid #00ff8844',
        background: open ? '#ff4757' : 'linear-gradient(135deg,#00ff88,#00cc6a)',
        color: open ? '#fff' : '#000', fontSize:'1.4rem', cursor:'pointer',
        boxShadow:'0 4px 20px rgba(0,255,136,0.4)',
        display:'flex', alignItems:'center', justifyContent:'center',
        transition:'all 0.2s',
      }}>
        {open ? '✕' : '?'}
      </button>
    </div>
  );
}

// --- League Card -------------------------------------------------------------
function LeagueCard({ league, isEnrolled, onEnroll }: {
  league: ProLeague; isEnrolled: boolean; onEnroll: () => void;
}) {
  const gc = GAME_COLOR[league.game] ?? '#00ff88';
  const pct = league.max_players > 0
    ? Math.min(100, Math.round((league.current_players / league.max_players) * 100))
    : 0;

  return (
    <div style={{
      background:'#161b22', borderRadius:16,
      border:`1px solid ${isEnrolled ? '#00ff8844' : '#21262d'}`,
      overflow:'hidden',
      boxShadow: isEnrolled ? '0 0 24px rgba(0,255,136,0.06)' : 'none',
    }}>
      <div style={{ height:3, background:`linear-gradient(90deg,${gc},transparent)` }} />
      <div style={{ padding:'18px 20px' }}>
        {/* Top row */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
          <span style={{
            background:`${gc}22`, border:`1px solid ${gc}44`,
            borderRadius:6, padding:'4px 10px', flexShrink:0,
            fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.65rem',
            color:gc, letterSpacing:1,
          }}>
            {GAME_LABEL[league.game] ?? league.game}
          </span>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.95rem', color:'#e6edf3', marginBottom:3 }}>
              {league.name}
            </div>
            <div style={{ color:'#8b949e', fontSize:'0.76rem' }}>
              {MODE_LABEL[league.mode] ?? league.mode} · {league.platform} · {league.region}
            </div>
          </div>
          <span style={{
            background:`${STATUS_COLOR[league.status]}18`,
            border:`1px solid ${STATUS_COLOR[league.status]}55`,
            borderRadius:6, padding:'4px 10px', flexShrink:0,
            fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.58rem',
            color:STATUS_COLOR[league.status], letterSpacing:1,
          }}>
            {STATUS_LABEL[league.status] ?? league.status}
          </span>
        </div>

        {/* Progress */}
        <div style={{ marginTop:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:'0.72rem' }}>
            <span style={{ color:'#8b949e' }}>{league.current_players} / {league.max_players} jugadores</span>
            {league.entry_fee > 0
              ? <span style={{ color:'#ffd700', fontWeight:700 }}>$ {league.entry_fee.toLocaleString()}</span>
              : <span style={{ color:'#00ff88', fontWeight:700 }}>GRATIS</span>}
          </div>
          <div style={{ height:3, background:'#21262d', borderRadius:3, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${gc},${gc}88)`, transition:'width 0.6s' }} />
          </div>
        </div>

        {/* Prize */}
        {league.prize_info && (
          <div style={{ marginTop:10, fontSize:'0.75rem', color:'#ffd700' }}>🏆 {league.prize_info}</div>
        )}

        {/* Actions */}
        <div style={{ marginTop:16, display:'flex', gap:10, justifyContent:'flex-end', alignItems:'center' }}>
          {league.status === 'activa' || league.status === 'playoffs' || league.status === 'inscripcion' ? (
            <Link href={`/pro/liga/${league.id}`}
              style={{
                padding:'8px 18px', borderRadius:8, textDecoration:'none',
                background:'#21262d', border:'1px solid #30363d',
                color:'#c9d1d9', fontSize:'0.78rem', fontWeight:600,
              }}
            >
              Ver Liga
            </Link>
          ) : null}

          {league.status === 'inscripcion' && !isEnrolled && (
            <button onClick={onEnroll}
              style={{
                padding:'9px 26px', borderRadius:8, border:'none', cursor:'pointer',
                background:'linear-gradient(135deg,#00ff88,#00cc6a)',
                color:'#000', fontFamily:"'Orbitron',sans-serif",
                fontWeight:700, fontSize:'0.72rem', letterSpacing:1,
              }}
            >
              INSCRIBIRME
            </button>
          )}

          {isEnrolled && (
            <span style={{
              padding:'7px 14px', borderRadius:8,
              background:'#00ff8818', border:'1px solid #00ff8833',
              color:'#00ff88', fontSize:'0.72rem', fontWeight:700,
            }}>
              ✅ Inscripto
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
