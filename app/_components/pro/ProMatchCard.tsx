'use client';

import { useState, useEffect } from 'react';
import type { LeagueMatch } from '@/lib/types';
import dynamic from 'next/dynamic';

const ChallengeModal = dynamic(() => import('./ChallengeModal'), { ssr:false });
const ReportModal    = dynamic(() => import('./ReportModal'),    { ssr:false });

interface Props {
  match: LeagueMatch;
  uid: string;
  leagueId: string;
  compact?: boolean;
}

const STATUS_CONFIG = {
  pending:    { label:'PENDIENTE',   color:'#555',    bg:'#55555522' },
  challenged: { label:'EN CONTACTO', color:'#00c3ff', bg:'#00c3ff18' },
  validating: { label:'VALIDANDO',   color:'#ffd700', bg:'#ffd70018' },
  closed:     { label:'CERRADO',     color:'#00ff88', bg:'#00ff8818' },
  dispute:    { label:'DISPUTA',     color:'#ff4444', bg:'#ff444422' },
  bye:        { label:'LIBRE',       color:'#555',    bg:'#55555522' },
};

/** Small button that lets a player reopen a closed match for disputing */
function ReopenMatchButton({ matchId, leagueId: _lid, uid: _uid }: { matchId: string; leagueId: string; uid: string }) {
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  async function reopen() {
    if (!confirm('¿Querés reabrir este partido para disputar el resultado?')) return;
    setLoading(true);
    try {
      const token = await (await import('firebase/auth')).getAuth().currentUser!.getIdToken();
      const res = await fetch('/api/pro/reopenMatch', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ match_id: matchId }),
      });
      const d = await res.json();
      if (res.ok) setDone(true);
      else alert(d.error ?? 'Error al reabrir.');
    } catch { alert('Error de conexión.'); }
    finally { setLoading(false); }
  }

  if (done) return <div style={{ flex:1, padding:'8px', textAlign:'center', color:'#ffd700', fontSize:'0.72rem' }}>Reabierto ✓</div>;
  return (
    <button onClick={reopen} disabled={loading} style={{
      padding:'8px 14px', borderRadius:8, cursor:'pointer',
      background:'transparent', border:'1px solid #ffd70044', color:'#ffd700',
      fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.65rem',
      opacity: loading ? 0.6 : 1,
    }}>
      🔓 DISPUTAR
    </button>
  );
}

function useCountdownSecs(deadline: number | null) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!deadline) { setSecs(0); return; }
    const tick = () => setSecs(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return secs;
}

export default function ProMatchCard({ match, uid, leagueId, compact }: Props) {
  const [showChallenge, setShowChallenge] = useState(false);
  const [showReport,    setShowReport]    = useState(false);
  const [confirming,    setConfirming]    = useState(false);
  const [disputing,     setDisputing]     = useState(false);

  const isPlayer1 = match.player1_uid === uid;
  const isPlayer2 = match.player2_uid === uid;
  const isMyMatch = isPlayer1 || isPlayer2;

  const myName      = isPlayer1 ? match.player1_name  : match.player2_name;
  const myTeam      = isPlayer1 ? match.player1_team  : match.player2_team;
  const myLogo      = isPlayer1 ? match.player1_logo  : match.player2_logo;
  const rivalName   = isPlayer1 ? match.player2_name  : match.player1_name;
  const rivalTeam   = isPlayer1 ? match.player2_team  : match.player1_team;
  const rivalLogo   = isPlayer1 ? match.player2_logo  : match.player1_logo;
  const rivalWA     = isPlayer1 ? match.player2_whatsapp : match.player1_whatsapp;
  const rivalPlatId = isPlayer1 ? match.player2_platform_id : match.player1_platform_id;

  const myScore    = match.score?.[uid] ?? null;
  const rivalScore = match.score?.[isPlayer1 ? match.player2_uid : match.player1_uid] ?? null;

  const secsLeft = useCountdownSecs(match.validation_deadline);
  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;

  const cfg = STATUS_CONFIG[match.status] ?? STATUS_CONFIG.pending;

  const iReported  = match.reported_by === uid;
  const rivalReported = match.reported_by && match.reported_by !== uid;

  async function callApi(endpoint: string, body: Record<string, unknown>) {
    const token = await (await import('firebase/auth')).getAuth().currentUser!.getIdToken();
    return fetch(`/api/pro/${endpoint}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body: JSON.stringify(body),
    }).then(r => r.json());
  }

  async function confirm() {
    setConfirming(true);
    await callApi('confirmResult', { match_id: match.id });
    setConfirming(false);
  }

  async function dispute(reason: string) {
    setDisputing(true);
    await callApi('dispute', { match_id: match.id, reason });
    setDisputing(false);
  }

  if (match.status === 'bye') return (
    <div style={{
      background:'#161b22', borderRadius:12, border:'1px solid #21262d',
      padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between',
    }}>
      <span style={{ color:'#8b949e', fontSize:'0.78rem' }}>Jornada {match.round} — Jornada libre</span>
      <span style={{ background:'#55555522', border:'1px solid #55555544', borderRadius:5, padding:'2px 8px', fontSize:'0.6rem', color:'#555' }}>LIBRE</span>
    </div>
  );

  return (
    <>
      <div style={{
        background:'#161b22', borderRadius:compact ? 10 : 14, overflow:'hidden',
        border:`1px solid ${isMyMatch ? cfg.color+'33' : '#21262d'}`,
        boxShadow: isMyMatch && match.status === 'validating' ? `0 0 20px ${cfg.color}22` : 'none',
      }}>
        {/* Status bar */}
        <div style={{ height:2, background:`linear-gradient(90deg,${cfg.color},transparent)` }} />

        <div style={{ padding: compact ? '12px 14px' : '16px 18px' }}>
          {/* Round + Status */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ color:'#8b949e', fontSize:'0.65rem', letterSpacing:1 }}>JORNADA {match.round}</span>
            <span style={{
              background:cfg.bg, border:`1px solid ${cfg.color}44`, borderRadius:5,
              padding:'2px 8px', fontFamily:"'Orbitron',sans-serif", fontWeight:700,
              fontSize:'0.58rem', color:cfg.color, letterSpacing:1,
            }}>
              {cfg.label}
            </span>
          </div>

          {/* Players row */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            {/* Player 1 */}
            <div style={{ flex:1, textAlign:'left' }}>
              <div style={{ fontSize: compact ? '1.8rem' : '2.2rem' }}>{match.player1_logo || '⚽'}</div>
              <div style={{ fontWeight:700, fontSize:'0.78rem', color:'#e6edf3', marginTop:3 }}>{match.player1_team}</div>
              <div style={{ color:'#8b949e', fontSize:'0.65rem' }}>{match.player1_name}</div>
              {isPlayer1 && <div style={{ color:'#00ff88', fontSize:'0.58rem', marginTop:2 }}>◀ TÚ</div>}
            </div>

            {/* Score / VS */}
            <div style={{ textAlign:'center', minWidth:60 }}>
              {match.status === 'closed' || match.status === 'validating' ? (
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize: compact ? '1.2rem' : '1.6rem', color:'#e6edf3' }}>
                  {match.score?.[match.player1_uid] ?? '-'} — {match.score?.[match.player2_uid] ?? '-'}
                </div>
              ) : (
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'1rem', color:'#555' }}>VS</div>
              )}
            </div>

            {/* Player 2 */}
            <div style={{ flex:1, textAlign:'right' }}>
              <div style={{ fontSize: compact ? '1.8rem' : '2.2rem' }}>{match.player2_logo || '⚽'}</div>
              <div style={{ fontWeight:700, fontSize:'0.78rem', color:'#e6edf3', marginTop:3 }}>{match.player2_team}</div>
              <div style={{ color:'#8b949e', fontSize:'0.65rem' }}>{match.player2_name}</div>
              {isPlayer2 && <div style={{ color:'#00ff88', fontSize:'0.58rem', marginTop:2 }}>TÚ ▶</div>}
            </div>
          </div>

          {/* Countdown validating */}
          {match.status === 'validating' && secsLeft > 0 && (
            <div style={{
              marginTop:12, padding:'8px 14px', borderRadius:8,
              background:'#ffd70018', border:'1px solid #ffd70033',
              textAlign:'center',
            }}>
              <div style={{ color:'#ffd700', fontSize:'0.7rem', fontFamily:"'Orbitron',sans-serif", fontWeight:700 }}>
                ⏱ {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
              </div>
              <div style={{ color:'#8b949e', fontSize:'0.62rem', marginTop:2 }}>
                {rivalReported ? 'Tu rival reportó resultado. Confirmá o disputá.' : 'Esperando confirmación del rival...'}
              </div>
            </div>
          )}

          {/* Winner badge */}
          {match.status === 'closed' && match.winner_uid && (
            <div style={{
              marginTop:10, textAlign:'center',
              color: match.winner_uid === 'draw' ? '#ffd700' : match.winner_uid === uid ? '#00ff88' : '#ff6b6b',
              fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.72rem',
            }}>
              {match.winner_uid === 'draw' ? '🤝 EMPATE' : match.winner_uid === uid ? '🏆 VICTORIA' : '❌ DERROTA'}
            </div>
          )}

          {/* Screenshot thumbnail */}
          {match.photo_url && (match.status === 'closed' || match.status === 'validating' || match.status === 'dispute') && (
            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
              <a href={match.photo_url} target="_blank" rel="noreferrer"
                style={{ display:'flex', alignItems:'center', gap:6, textDecoration:'none' }}>
                <img src={match.photo_url} alt="Captura" style={{
                  width:48, height:36, objectFit:'cover', borderRadius:6,
                  border:'1px solid #30363d',
                }} />
                <span style={{ color:'#8b949e', fontSize:'0.62rem' }}>📷 Ver captura</span>
              </a>
            </div>
          )}

          {/* Dispute note */}
          {match.status === 'dispute' && (
            <div style={{ marginTop:10, padding:'8px 12px', background:'#ff444418', borderRadius:8, fontSize:'0.72rem', color:'#ff6b6b' }}>
              🚨 Partido en disputa — el staff está revisando
            </div>
          )}

          {/* ── ACTIONS (only for my matches) ── */}
          {isMyMatch && !compact && (
            <div style={{ marginTop:14, display:'flex', gap:8, flexWrap:'wrap' }}>

              {/* PENDING → Desafiar */}
              {match.status === 'pending' && (
                <button onClick={() => setShowChallenge(true)}
                  style={{
                    flex:1, padding:'10px', borderRadius:8, border:'none', cursor:'pointer',
                    background:'linear-gradient(135deg,#00c3ff,#0096ff)',
                    color:'#000', fontFamily:"'Orbitron',sans-serif",
                    fontWeight:700, fontSize:'0.72rem', letterSpacing:1,
                  }}
                >
                  ⚡ DESAFIAR
                </button>
              )}

              {/* CHALLENGED → Subir resultado */}
              {match.status === 'challenged' && (
                <button onClick={() => setShowReport(true)}
                  style={{
                    flex:1, padding:'10px', borderRadius:8, border:'none', cursor:'pointer',
                    background:'linear-gradient(135deg,#ffd700,#ff9900)',
                    color:'#000', fontFamily:"'Orbitron',sans-serif",
                    fontWeight:700, fontSize:'0.72rem', letterSpacing:1,
                  }}
                >
                  📸 SUBIR RESULTADO
                </button>
              )}

              {/* VALIDATING + rival reported → Confirm or Dispute */}
              {match.status === 'validating' && rivalReported && (
                <>
                  <button onClick={confirm} disabled={confirming}
                    style={{
                      flex:1, padding:'10px', borderRadius:8, border:'none', cursor:'pointer',
                      background:'linear-gradient(135deg,#00ff88,#00cc6a)',
                      color:'#000', fontFamily:"'Orbitron',sans-serif",
                      fontWeight:700, fontSize:'0.72rem', letterSpacing:1, opacity: confirming ? 0.6 : 1,
                    }}
                  >
                    ✅ CONFIRMAR
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('¿Por qué disputás? (breve descripción)');
                      if (reason) dispute(reason);
                    }}
                    disabled={disputing}
                    style={{
                      flex:1, padding:'10px', borderRadius:8, cursor:'pointer',
                      background:'transparent', border:'1px solid #ff444455', color:'#ff6b6b',
                      fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.72rem', letterSpacing:1,
                      opacity: disputing ? 0.6 : 1,
                    }}
                  >
                    🚨 DISPUTAR
                  </button>
                </>
              )}

              {/* VALIDATING + I reported → waiting */}
              {match.status === 'validating' && iReported && (
                <div style={{
                  flex:1, padding:'10px', borderRadius:8, textAlign:'center',
                  background:'#ffd70018', border:'1px solid #ffd70033',
                  color:'#ffd700', fontSize:'0.72rem', fontFamily:"'Orbitron',sans-serif", fontWeight:700,
                }}>
                  ⏳ Esperando al rival...
                </div>
              )}

              {/* CLOSED → Reopen (only shown if match can be disputed after closing) */}
              {match.status === 'closed' && isMyMatch && (
                <ReopenMatchButton matchId={match.id} leagueId={leagueId} uid={uid} />
              )}
            </div>
          )}
        </div>
      </div>

      {showChallenge && (
        <ChallengeModal
          match={match} uid={uid} leagueId={leagueId}
          onClose={() => setShowChallenge(false)}
          onChallenged={() => setShowChallenge(false)}
        />
      )}

      {showReport && (
        <ReportModal
          match={match} uid={uid}
          onClose={() => setShowReport(false)}
          onReported={() => setShowReport(false)}
        />
      )}
    </>
  );
}
