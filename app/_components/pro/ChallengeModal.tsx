'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { LeagueMatch } from '@/lib/types';

interface Props {
  match: LeagueMatch;
  uid: string;
  leagueId: string;
  onClose: () => void;
  onChallenged: () => void;
}

export default function ChallengeModal({ match, uid, leagueId, onClose, onChallenged }: Props) {
  const [roomCode,    setRoomCode]    = useState(match.room_code ?? '');
  const [liveCode,    setLiveCode]    = useState(match.room_code ?? '');
  const [saving,      setSaving]      = useState(false);
  const [challenging, setChallenging] = useState(false);

  const isPlayer1 = match.player1_uid === uid;
  const rivalWA   = isPlayer1 ? match.player2_whatsapp : match.player1_whatsapp;
  const rivalTeam = isPlayer1 ? match.player2_team     : match.player1_team;
  const rivalPlatId = isPlayer1 ? match.player2_platform_id : match.player1_platform_id;
  const rivalLogo = isPlayer1 ? match.player2_logo     : match.player1_logo;

  // Listen to room_code in real-time (sync between both players)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'league_matches', match.id), snap => {
      if (snap.exists()) setLiveCode(snap.data().room_code ?? '');
    });
    return unsub;
  }, [match.id]);

  async function saveRoomCode() {
    if (!roomCode.trim()) return;
    setSaving(true);
    await updateDoc(doc(db, 'league_matches', match.id), { room_code: roomCode.trim() });
    setSaving(false);
  }

  async function handleChallenge() {
    setChallenging(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      await fetch('/api/pro/challenge', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ match_id: match.id }),
      });
      onChallenged();
    } finally { setChallenging(false); }
  }

  const waMsg = `Hola ${rivalTeam}! Soy tu rival en SomosLFA PRO. ¿Jugamos el partido de la jornada ${match.round}? 🎮`;
  const waUrl = `https://wa.me/${rivalWA?.replace(/\D/g,'')}?text=${encodeURIComponent(waMsg)}`;

  const isEfootball = leagueId.includes('efootball') || match.player1_name !== undefined;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(8px)',
        display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:1000, padding:20,
      }}
    >
      <div style={{
        background:'#161b22', borderRadius:20, width:'100%', maxWidth:460,
        border:'1px solid #00c3ff33', overflow:'hidden',
        boxShadow:'0 0 60px rgba(0,195,255,0.15)',
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #30363d', background:'#0d1117' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.88rem', color:'#00c3ff' }}>
              ⚡ DESAFÍO EN CURSO
            </div>
            <button onClick={onClose}
              style={{ background:'none', border:'none', color:'#8b949e', fontSize:'1.1rem', cursor:'pointer' }}>✕</button>
          </div>
          <div style={{ color:'#8b949e', fontSize:'0.75rem', marginTop:3 }}>vs {rivalTeam}</div>
        </div>

        <div style={{ padding:'24px' }}>
          {/* Rival info */}
          <div style={{
            display:'flex', alignItems:'center', gap:12, marginBottom:20,
            padding:'12px 16px', background:'#21262d', borderRadius:12,
          }}>
            <span style={{ fontSize:'2.2rem' }}>{rivalLogo || '⚽'}</span>
            <div>
              <div style={{ fontWeight:700, color:'#e6edf3', fontSize:'0.85rem' }}>{rivalTeam}</div>
              <div style={{ color:'#8b949e', fontSize:'0.72rem' }}>ID: {rivalPlatId || '—'}</div>
              {rivalWA && <div style={{ color:'#8b949e', fontSize:'0.72rem' }}>📱 {rivalWA}</div>}
            </div>
          </div>

          {/* Step 1: WhatsApp */}
          <div style={{ marginBottom:20 }}>
            <div style={{
              fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.65rem',
              color:'#8b949e', letterSpacing:1, marginBottom:10,
            }}>
              PASO 1 — CONTACTAR AL RIVAL
            </div>
            {rivalWA ? (
              <a href={waUrl} target="_blank" rel="noreferrer"
                style={{
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  padding:'12px', borderRadius:10, textDecoration:'none',
                  background:'#25d36622', border:'1px solid #25d36644',
                  color:'#25d366', fontWeight:700, fontSize:'0.82rem',
                  transition:'all 0.2s',
                }}
              >
                <span style={{ fontSize:'1.2rem' }}>💬</span> Enviar WhatsApp a {rivalTeam}
              </a>
            ) : (
              <div style={{ padding:'12px', background:'#ff444422', borderRadius:10, color:'#ff6b6b', fontSize:'0.78rem' }}>
                El rival no tiene WhatsApp registrado. Buscalo por su ID en el juego.
              </div>
            )}
          </div>

          {/* Step 2: Room code (eFootball) */}
          <div style={{ marginBottom:20 }}>
            <div style={{
              fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.65rem',
              color:'#8b949e', letterSpacing:1, marginBottom:10,
            }}>
              PASO 2 — CÓDIGO DE SALA
            </div>
            <div style={{ fontSize:'0.75rem', color:'#8b949e', marginBottom:8, lineHeight:1.5 }}>
              Quien crea la sala pega el código aquí. El rival lo verá en tiempo real.
            </div>

            {/* Live code from rival */}
            {liveCode && liveCode !== roomCode && (
              <div style={{
                padding:'10px 14px', background:'#00c3ff18', border:'1px solid #00c3ff44',
                borderRadius:8, marginBottom:8, fontSize:'0.82rem', color:'#00c3ff',
                fontFamily:"'Orbitron',sans-serif", fontWeight:700, letterSpacing:2,
              }}>
                🔴 CÓDIGO DEL RIVAL: {liveCode}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
                placeholder="Pegá el código de sala aquí"
                style={{
                  flex:1, padding:'11px 14px', background:'#0b0e14',
                  border:'1px solid #30363d', borderRadius:8, color:'#e6edf3',
                  fontSize:'0.85rem', outline:'none',
                  fontFamily:"'Orbitron',sans-serif",
                }}
              />
              <button onClick={saveRoomCode} disabled={saving}
                style={{
                  padding:'11px 16px', borderRadius:8, cursor:'pointer',
                  background: saving ? '#30363d' : '#00c3ff22',
                  border:'1px solid #00c3ff44', color:'#00c3ff',
                  fontWeight:700, fontSize:'0.75rem',
                }}
              >
                {saving ? '...' : 'ENVIAR'}
              </button>
            </div>
          </div>

          {/* Step 3: Mark as challenged */}
          <div style={{
            padding:'14px', background:'#21262d', borderRadius:12, marginBottom:20,
            fontSize:'0.75rem', color:'#8b949e', lineHeight:1.6,
          }}>
            <strong style={{ color:'#e6edf3' }}>📋 Reglamento:</strong> {match.player1_team} vs {match.player2_team} — Jornada {match.round}
            <br />Una vez que jueguen, el <strong style={{ color:'#e6edf3' }}>GANADOR</strong> sube la captura del resultado.
          </div>

          <button onClick={handleChallenge} disabled={challenging}
            style={{
              width:'100%', padding:'13px', borderRadius:10, border:'none', cursor:'pointer',
              background: challenging ? '#30363d' : 'linear-gradient(135deg,#00c3ff,#0096ff)',
              color: challenging ? '#8b949e' : '#000',
              fontFamily:"'Orbitron',sans-serif", fontWeight:700, fontSize:'0.8rem', letterSpacing:1,
              opacity: challenging ? 0.7 : 1, transition:'all 0.2s',
            }}
          >
            {challenging ? 'PROCESANDO...' : '✅ MARCAR COMO EN CONTACTO'}
          </button>
        </div>
      </div>
    </div>
  );
}
