'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, where, onSnapshot, orderBy,
  doc, getDoc, getDocs,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { ProLeague, LeagueParticipant, LeagueMatch } from '@/lib/types';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const ProMatchCard   = dynamic(() => import('@/app/_components/pro/ProMatchCard'),   { ssr:false });
const LeagueStandings= dynamic(() => import('@/app/_components/pro/LeagueStandings'),{ ssr:false });

const GAME_COLOR: Record<string,string> = { efootball:'#00c3ff', fc26:'#ff6b00' };
const STATUS_LABEL: Record<string,string> = {
  inscripcion:'INSCRIPCIONES', activa:'EN JUEGO', playoffs:'PLAYOFFS', finalizada:'FINALIZADA',
};
const STATUS_COLOR: Record<string,string> = {
  inscripcion:'#00ff88', activa:'#ffd700', playoffs:'#ff6b00', finalizada:'#555',
};

export default function LeagueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const [uid,          setUid]         = useState('');
  const [ready,        setReady]       = useState(false);
  const [league,       setLeague]      = useState<ProLeague | null>(null);
  const [participants, setParticipants]= useState<LeagueParticipant[]>([]);
  const [matches,      setMatches]     = useState<LeagueMatch[]>([]);
  const [tab,          setTab]         = useState<'mis-partidos'|'fixture'|'tabla'>('mis-partidos');
  const [myParticipant,setMyParticipant]=useState<LeagueParticipant|null>(null);

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) { router.replace('/'); return; }
      setUid(u.uid);
      setReady(true);
    });
    return unsub;
  }, [router]);

  // League doc
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'leagues', id), snap => {
      if (!snap.exists()) { router.replace('/pro'); return; }
      setLeague({ id: snap.id, ...snap.data() } as ProLeague);
    });
    return unsub;
  }, [id, router]);

  // Participants real-time
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, 'leagues', id, 'participants'),
      snap => setParticipants(snap.docs.map(d => ({ uid: d.id, ...d.data() } as LeagueParticipant)))
    );
    return unsub;
  }, [id]);

  // My participant
  useEffect(() => {
    if (!uid || participants.length === 0) return;
    setMyParticipant(participants.find(p => p.uid === uid) ?? null);
  }, [uid, participants]);

  // Matches real-time
  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, 'league_matches'),
      where('league_id', '==', id),
      orderBy('round', 'asc')
    );
    const unsub = onSnapshot(q, snap =>
      setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeagueMatch)))
    );
    return unsub;
  }, [id]);

  const myMatches   = matches.filter(m => m.player1_uid === uid || m.player2_uid === uid);
  const pendingCount= myMatches.filter(m => m.status === 'pending' || m.status === 'challenged' || m.status === 'validating').length;

  // Group fixture by round
  const rounds = matches.reduce<Record<number, LeagueMatch[]>>((acc, m) => {
    if (!acc[m.round]) acc[m.round] = [];
    acc[m.round].push(m);
    return acc;
  }, {});

  if (!ready || !league) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#0b0e14' }}>
      <span style={{ fontFamily:"'Orbitron',sans-serif",color:'#00ff88' }}>Cargando...</span>
    </div>
  );

  const gc = GAME_COLOR[league.game] ?? '#00ff88';

  return (
    <div style={{ minHeight:'100vh', background:'#0b0e14', color:'#c9d1d9' }}>
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div style={{ background:'#0d1117', borderBottom:'1px solid #30363d' }}>
        <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 20px 0' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <Link href="/pro" style={{ color:'#8b949e', textDecoration:'none', fontSize:'0.78rem' }}>
              ← Ligas PRO
            </Link>
            <span style={{
              background:`${STATUS_COLOR[league.status]}18`, border:`1px solid ${STATUS_COLOR[league.status]}44`,
              borderRadius:6, padding:'3px 10px',
              fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.6rem',
              color:STATUS_COLOR[league.status], letterSpacing:1,
            }}>
              {STATUS_LABEL[league.status]}
            </span>
          </div>

          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <span style={{
                background:`${gc}22`, border:`1px solid ${gc}44`, borderRadius:5, padding:'2px 8px',
                fontFamily:"'Orbitron',sans-serif", fontSize:'0.62rem', fontWeight:700, color:gc,
              }}>
                {league.game === 'efootball' ? 'eFootball' : 'FC 26'}
              </span>
              <span style={{ color:'#8b949e', fontSize:'0.75rem' }}>{league.mode}</span>
            </div>
            <h1 style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'clamp(1.2rem,4vw,1.8rem)', color:'#e6edf3', margin:0 }}>
              {league.name}
            </h1>
            <div style={{ color:'#8b949e', fontSize:'0.78rem', marginTop:4 }}>{league.rules}</div>
          </div>

          {/* My status bar */}
          {myParticipant && (
            <div style={{
              display:'flex', alignItems:'center', gap:12, marginBottom:14,
              background:'#161b22', borderRadius:10, padding:'10px 14px',
              border:'1px solid #00ff8833',
            }}>
              <span style={{ fontSize:'1.6rem' }}>{myParticipant.logo_url || '⚽'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.8rem', color:'#e6edf3' }}>
                  {myParticipant.team_name}
                </div>
                <div style={{ color:'#8b949e', fontSize:'0.7rem' }}>
                  {myParticipant.pts} pts · {myParticipant.pj} PJ · {myParticipant.pg}V {myParticipant.pe}E {myParticipant.pp}D
                </div>
              </div>
              {pendingCount > 0 && (
                <span style={{
                  background:'#ff6b0022', border:'1px solid #ff6b0055', borderRadius:6,
                  padding:'4px 10px', fontFamily:"'Orbitron',sans-serif", fontWeight:700,
                  fontSize:'0.65rem', color:'#ff6b00',
                }}>
                  {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #30363d' }}>
            {([
              { key:'mis-partidos', label:'MIS PARTIDOS', show: !!myParticipant },
              { key:'fixture',      label:'FIXTURE',      show: true },
              { key:'tabla',        label:'TABLA',        show: true },
            ] as const).map(t => t.show && (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  padding:'10px 20px', border:'none', background:'transparent', cursor:'pointer',
                  color: tab===t.key ? '#00ff88' : '#8b949e',
                  borderBottom: tab===t.key ? '2px solid #00ff88' : '2px solid transparent',
                  fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.68rem',
                  letterSpacing:1, transition:'all 0.15s', whiteSpace:'nowrap',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ────────────────────────────────────────────────── */}
      <div style={{ maxWidth:900, margin:'0 auto', padding:'24px 20px' }}>

        {/* MIS PARTIDOS */}
        {tab === 'mis-partidos' && myParticipant && (
          <div>
            {myMatches.length === 0 ? (
              <div style={{ textAlign:'center', padding:60, color:'#8b949e' }}>
                <div style={{ fontSize:'3rem', marginBottom:12 }}>⏳</div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700 }}>Fixture en preparación</div>
                <div style={{ fontSize:'0.82rem', marginTop:8 }}>Esperando a que se completen los inscriptos</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {myMatches.map(m => (
                  <ProMatchCard key={m.id} match={m} uid={uid} leagueId={id} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* FIXTURE */}
        {tab === 'fixture' && (
          <div>
            {Object.keys(rounds).length === 0 ? (
              <div style={{ textAlign:'center', padding:60, color:'#8b949e' }}>
                <div style={{ fontSize:'3rem', marginBottom:12 }}>📅</div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700 }}>Fixture no generado</div>
                <div style={{ fontSize:'0.82rem', marginTop:8 }}>
                  {league.status === 'inscripcion'
                    ? `Quedan ${league.max_players - league.current_players} lugares disponibles`
                    : 'El fixture se generará pronto'}
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
                {Object.entries(rounds).map(([round, rMatches]) => (
                  <div key={round}>
                    <div style={{
                      fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.7rem',
                      color:'#8b949e', letterSpacing:2, marginBottom:12,
                      borderLeft:'2px solid #00ff88', paddingLeft:10,
                    }}>
                      JORNADA {round}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {rMatches.map(m => (
                        <ProMatchCard key={m.id} match={m} uid={uid} leagueId={id} compact />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TABLA */}
        {tab === 'tabla' && (
          <LeagueStandings participants={participants} myUid={uid} />
        )}
      </div>
    </div>
  );
}
