"use client";

import { useEffect, useRef, useState } from "react";
import {
  doc, onSnapshot, collection, query, orderBy, where,
  addDoc, serverTimestamp, limit,
} from "firebase/firestore";
import { db, auth, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/* ─── Tipos ─────────────────────────────────────────────── */
interface Match {
  id: string;
  p1: string; p2: string;
  p1_username?: string; p2_username?: string;
  p1_ea_id?: string;   p2_ea_id?: string;
  p1_avatar?: string;  p2_avatar?: string;
  score: string;
  winner: string | null;
  status: "WAITING" | "PENDING_RESULT" | "DISPUTE" | "FINISHED";
  reported_by?: string;
  screenshot_url?: string;
  dispute_deadline?: { toMillis: () => number };
  round: string;
  tournamentId: string;
  game?: string;
  entry_fee?: number;
  prize_pool?: number;
  auto_confirmed?: boolean;
}

interface ChatMsg {
  id: string;
  uid: string;
  nombre: string;
  text: string;
  ts?: { toMillis: () => number };
}

interface Props { matchId: string; }

/* ─── Helpers ─────────────────────────────────────────────── */
const S = {
  card:    { background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: '18px 20px', marginBottom: 14 },
  badge:   { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, fontSize: '0.7rem', fontFamily: "'Orbitron',sans-serif", fontWeight: 900 },
  btn:     (bg: string, c = '#000') => ({ background: bg, color: c, border: 'none', padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.75rem', transition: '0.15s', display: 'inline-flex', alignItems: 'center', gap: 6 } as React.CSSProperties),
  scoreBtn:(active: boolean) => ({ background: active ? '#ffd700' : '#1c2028', color: active ? '#000' : '#8b949e', border: `1px solid ${active ? '#ffd700' : '#30363d'}`, width: 44, height: 44, borderRadius: 8, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.85rem', transition: '0.12s', flexShrink: 0 } as React.CSSProperties),
};

const GAME_LABEL: Record<string, string> = { FC26: '\u26BD FC 26', EFOOTBALL: '\uD83C\uDFC5 eFootball' };

const DISPUTE_TYPES = [
  { value: 'score_wrong',    label: '\u274C Marcador incorrecto' },
  { value: 'no_play',        label: '\uD83D\uDEAB No se jug\u00F3 el partido' },
  { value: 'disconnect',     label: '\uD83D\uDCE1 Desconexi\u00F3n / Bug del juego' },
  { value: 'screenshot_fake',label: '\uD83D\uDDBC\uFE0F Screenshot falso o editado' },
  { value: 'behaviour',      label: '\uD83D\uDE20 Conducta antideportiva' },
  { value: 'other',          label: '\uD83D\uDCDD Otro motivo' },
];

/* ══════════════════════════════════════════════════════════ */
export default function MatchRoom({ matchId }: Props) {
  const [match,         setMatch]         = useState<Match | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [uploading,     setUploading]     = useState(false);
  const [disputing,     setDisputing]     = useState(false);
  const [timeLeft,      setTimeLeft]      = useState(0);
  const [msg,           setMsg]           = useState('');
  const [tab,           setTab]           = useState<'match'|'chat_match'|'chat_torneo'|'bracket'>('match');

  // Bracket
  const [bracketMatches, setBracketMatches] = useState<Array<{
    id: string; p1: string; p2: string;
    p1_username?: string; p2_username?: string;
    round: string; status: string; score?: string; winner?: string | null;
  }>>([]);

  // Score selector
  const [myScore,    setMyScore]    = useState<number | null>(null);
  const [rivalScore, setRivalScore] = useState<number | null>(null);
  const [reporting,  setReporting]  = useState(false);

  // Disputa
  const [disputeType,   setDisputeType]   = useState('score_wrong');
  const [disputeDetail, setDisputeDetail] = useState('');
  const [screenshot,    setScreenshot]    = useState<File | null>(null);

  // Chat match
  const [chatMatch,   setChatMatch]   = useState<ChatMsg[]>([]);
  const [chatTorneo,  setChatTorneo]  = useState<ChatMsg[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const uid   = auth.currentUser?.uid ?? '';
  const nombre = auth.currentUser?.displayName || 'Jugador';

  /* Snapshot del match */
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "matches", matchId), (snap) => {
      if (snap.exists()) setMatch({ id: snap.id, ...snap.data() } as Match);
      setLoading(false);
    });
    return unsub;
  }, [matchId]);

  /* Countdown disputa */
  useEffect(() => {
    if (!match?.dispute_deadline) return;
    const iv = setInterval(() => {
      setTimeLeft(Math.max(0, Math.floor((match.dispute_deadline!.toMillis() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(iv);
  }, [match?.dispute_deadline]);

  /* Chat del match (solo p1 y p2) */
  useEffect(() => {
    if (!matchId) return;
    const q = query(collection(db, "matches", matchId, "chat"), orderBy("ts", "asc"), limit(80));
    return onSnapshot(q, snap => {
      setChatMatch(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)));
    });
  }, [matchId]);

  /* Chat del torneo */
  useEffect(() => {
    if (!match?.tournamentId) return;
    const q = query(collection(db, "tournaments", match.tournamentId, "chat"), orderBy("ts", "asc"), limit(100));
    return onSnapshot(q, snap => {
      setChatTorneo(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)));
    });
  }, [match?.tournamentId]);

  /* Bracket: todos los matches del torneo */
  useEffect(() => {
    if (!match?.tournamentId) return;
    const q = query(collection(db, "matches"), where("tournamentId", "==", match.tournamentId));
    return onSnapshot(q, snap => {
      setBracketMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
  }, [match?.tournamentId]);

  /* Scroll automatico al ultimo mensaje */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMatch, chatTorneo, tab]);

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const callApi = async (endpoint: string, body: object) => {
    const token = await auth.currentUser!.getIdToken();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  };

  /* Reportar resultado con score manual */
  const handleReportScore = async () => {
    if (myScore === null || rivalScore === null) { setMsg('\u274C Seleccion\u00E1 el marcador completo.'); return; }
    if (!match) return;
    setReporting(true); setMsg('');
    try {
      let screenshotUrl: string | undefined;
      if (screenshot) {
        const r = ref(storage, `results/${match.tournamentId}/${matchId}/${Date.now()}`);
        await uploadBytes(r, screenshot);
        screenshotUrl = await getDownloadURL(r);
      }

      const isP1 = match.p1 === uid;
      const score = isP1 ? `${myScore}-${rivalScore}` : `${rivalScore}-${myScore}`;

      const result = await callApi("/api/reportResult", { matchId, screenshotUrl: screenshotUrl ?? null, score });
      if (result.autoConfirmed) {
        setMsg('🤖 El BOT confirmó el resultado automáticamente. 🏆 ¡Match finalizado!');
      } else {
        setMsg('✅ Resultado reportado. Tu rival tiene tiempo para disputar o confirmar.');
      }
    } catch (err: unknown) {
      setMsg(`\u274C ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setReporting(false);
    }
  };

  /* Disputa */
  const handleDispute = async () => {
    if (!disputeDetail.trim()) { setMsg('\u274C Describ\u00ED el problema.'); return; }
    setDisputing(true); setMsg('');
    try {
      let screenshotUrl: string | undefined;
      if (screenshot) {
        const r = ref(storage, `disputes/${matchId}/${Date.now()}`);
        await uploadBytes(r, screenshot);
        screenshotUrl = await getDownloadURL(r);
      }
      await callApi("/api/disputeMatch", {
        matchId,
        reason: `[${disputeType}] ${disputeDetail.trim()}`,
        evidence_url: screenshotUrl ?? null,
      });
      setMsg('\u26A0\uFE0F Disputa enviada. El Staff revisar\u00E1 el caso en las pr\u00F3ximas horas.');
    } catch (err: unknown) {
      setMsg(`\u274C ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setDisputing(false);
    }
  };

  /* Enviar mensaje de chat */
  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || sendingChat || !match) return;
    setSendingChat(true);
    try {
      const collPath = tab === 'chat_match'
        ? collection(db, "matches", matchId, "chat")
        : collection(db, "tournaments", match.tournamentId, "chat");
      await addDoc(collPath, { uid, nombre, text, ts: serverTimestamp() });
      setChatInput('');
    } catch { /* ok */ }
    setSendingChat(false);
  };

  /* ── Renders ─────────────────────────────────────────────── */
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, border: '3px solid #ffd700', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!match) return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4757', fontFamily: "'Orbitron',sans-serif" }}>
      Match no encontrado
    </div>
  );

  const isP1       = match.p1 === uid;
  const isP2       = match.p2 === uid;
  const isPlayer   = isP1 || isP2;
  const myName     = isP1 ? (match.p1_username ?? 'Jugador 1') : (match.p2_username ?? 'Jugador 2');
  const rivalName  = isP1 ? (match.p2_username ?? 'Jugador 2') : (match.p1_username ?? 'Jugador 1');
  const rivalEaId  = isP1 ? match.p2_ea_id : match.p1_ea_id;
  const myEaId     = isP1 ? match.p1_ea_id : match.p2_ea_id;
  const canReport  = isPlayer && match.status === "WAITING";
  const canDispute = isPlayer && match.status === "PENDING_RESULT" && match.reported_by !== uid;

  /* Bracket: agrupar por ronda */
  const roundOrder = (r: string) => r === 'final' ? 999 : (parseInt(r.replace('round_', '')) || 0);
  const bracketByRound = bracketMatches.reduce<Record<string, typeof bracketMatches>>((acc, m) => {
    (acc[m.round] ??= []).push(m);
    return acc;
  }, {});

  const statusBadge = {
    WAITING:        { bg: 'rgba(0,255,136,0.12)',  color: '#00ff88',  text: '\u23F3 ESPERANDO RESULTADO' },
    PENDING_RESULT: { bg: 'rgba(255,215,0,0.12)',  color: '#ffd700',  text: '\uD83D\uDD53 PENDIENTE CONFIRMACI\u00D3N' },
    DISPUTE:        { bg: 'rgba(255,71,87,0.12)',  color: '#ff4757',  text: '\u26A0\uFE0F EN DISPUTA \u2013 STAFF NOTIFICADO' },
    FINISHED:       { bg: 'rgba(139,148,158,0.12)',color: '#8b949e',  text: '\u2705 FINALIZADO' },
  }[match.status];

  const activeChat = tab === 'chat_match' ? chatMatch : chatTorneo;

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .score-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:5px; }
        @media(max-width:480px){ .score-grid{grid-template-columns:repeat(5,1fr);gap:4px} }
        .chat-bubble { max-width:85%; padding:7px 11px; border-radius:12px; font-size:0.78rem; line-height:1.4; word-break:break-word; }
        .chat-me   { background:rgba(0,255,136,0.13); border:1px solid rgba(0,255,136,0.2); margin-left:auto; }
        .chat-them { background:#1c2028; border:1px solid #30363d; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#0b0e14', color: 'white', fontFamily: "'Roboto',sans-serif", paddingBottom: 40 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(12px,3vw,24px) clamp(12px,4vw,5%)' }}>

          {/* ── HEADER ──────────────────────────────────── */}
          <div style={{ ...S.card, background: 'linear-gradient(135deg,#0d1117,#160a06)', border: '1px solid rgba(255,215,0,0.2)', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1rem,3vw,1.35rem)', fontWeight: 900, color: '#ffd700' }}>
                  {'\u2694\uFE0F'} SALA DE MATCH
                </div>
                <div style={{ color: '#8b949e', fontSize: '0.72rem', marginTop: 3 }}>
                  {match.game ? GAME_LABEL[match.game] ?? match.game : '\uD83C\uDFAE Partido'} &middot; Ronda: <span style={{ color: 'white' }}>{match.round}</span>
                </div>
              </div>
              <div>
                <span style={{ ...S.badge, background: statusBadge.bg, color: statusBadge.color }}>
                  {statusBadge.text}
                </span>
              </div>
            </div>

            {/* Premio si hay prize pool */}
            {!!match.prize_pool && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
                <span>{'\uD83C\uDFC6'}</span>
                <span style={{ color: '#ffd700', fontWeight: 700 }}>Premio: {match.prize_pool.toLocaleString()} LFC</span>
                {match.entry_fee ? <span style={{ color: '#8b949e' }}>&middot; Entrada: {match.entry_fee.toLocaleString()} LFC c/u</span> : null}
              </div>
            )}
          </div>

          {/* ── VS CARD ─────────────────────────────────── */}
          <div style={{ ...S.card, padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>

              {/* Jugador 1 */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', border: `3px solid ${match.p1 === uid ? '#00ff88' : '#ffd700'}`, overflow: 'hidden', background: '#1c2028', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {match.p1_avatar
                    ? <img src={match.p1_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '1.6rem' }}>{'\uD83C\uDFAE'}</span>}
                </div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: 'clamp(0.65rem,2vw,0.82rem)', color: match.p1 === uid ? '#00ff88' : 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {match.p1_username ?? 'Jugador 1'}
                  {match.p1 === uid && <span style={{ display: 'block', fontSize: '0.58rem', color: '#00ff88' }}>{'\u2190'} VOS</span>}
                </div>
                {match.p1_ea_id && (
                  <button onClick={() => navigator.clipboard.writeText(match.p1_ea_id!)} style={{ marginTop: 5, background: 'transparent', border: '1px solid #30363d', color: '#ffd700', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'monospace' }}>
                    {match.p1_ea_id} {'\uD83D\uDCCB'}
                  </button>
                )}
              </div>

              {/* Score */}
              <div style={{ textAlign: 'center' }}>
                {match.score && match.status !== 'WAITING' ? (
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.5rem,5vw,2.2rem)', fontWeight: 900, color: '#ffd700', lineHeight: 1 }}>
                    {match.score}
                  </div>
                ) : (
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.2rem,4vw,1.8rem)', fontWeight: 900, color: '#30363d' }}>VS</div>
                )}
              </div>

              {/* Jugador 2 */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', border: `3px solid ${match.p2 === uid ? '#00ff88' : '#5865f2'}`, overflow: 'hidden', background: '#1c2028', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {match.p2_avatar
                    ? <img src={match.p2_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '1.6rem' }}>{'\uD83C\uDFAE'}</span>}
                </div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: 'clamp(0.65rem,2vw,0.82rem)', color: match.p2 === uid ? '#00ff88' : 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {match.p2_username ?? 'Jugador 2'}
                  {match.p2 === uid && <span style={{ display: 'block', fontSize: '0.58rem', color: '#00ff88' }}>{'\u2190'} VOS</span>}
                </div>
                {match.p2_ea_id && (
                  <button onClick={() => navigator.clipboard.writeText(match.p2_ea_id!)} style={{ marginTop: 5, background: 'transparent', border: '1px solid #30363d', color: '#5865f2', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'monospace' }}>
                    {match.p2_ea_id} {'\uD83D\uDCCB'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── TABS ──────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              { key: 'match',       label: '\u2694\uFE0F MATCH' },
              { key: 'chat_match',  label: '\uD83D\uDCAC CHAT DEL MATCH' },
              { key: 'chat_torneo', label: '\uD83C\uDF10 CHAT TORNEO' },
              { key: 'bracket',     label: '\uD83C\uDFC6 BRACKET' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as typeof tab)} style={{
                background: tab === t.key ? '#ffd700' : '#161b22',
                color:      tab === t.key ? '#000'    : '#8b949e',
                border: `1px solid ${tab === t.key ? '#ffd700' : '#30363d'}`,
                padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.65rem', transition: '0.15s',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ══════════ TAB: MATCH ══════════════════════ */}
          {tab === 'match' && (<>

            {/* INSTRUCCIONES conectarse */}
            {match.status === "WAITING" && isPlayer && rivalEaId && (
              <div style={{ ...S.card, border: '1px solid rgba(88,101,242,0.35)', background: 'rgba(88,101,242,0.05)' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#5865f2', fontSize: '0.8rem', fontWeight: 900, marginBottom: 10 }}>
                  {'\uD83D\uDCCB'} CONECTATE CON TU RIVAL
                </div>
                <div style={{ fontSize: '0.82rem', color: '#c9d1d9', lineHeight: 1.7 }}>
                  <span style={{ color: '#8b949e' }}>Tu EA/eFootball ID:</span>{' '}
                  <button onClick={() => navigator.clipboard.writeText(myEaId ?? '')} style={{ background: 'transparent', border: '1px solid #30363d', color: '#00ff88', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                    {myEaId || '--'} {'\uD83D\uDCCB'}
                  </button>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#c9d1d9', lineHeight: 1.7, marginTop: 6 }}>
                  <span style={{ color: '#8b949e' }}>EA/eFootball ID de tu rival:</span>{' '}
                  <button onClick={() => navigator.clipboard.writeText(rivalEaId)} style={{ background: 'transparent', border: '1px solid #30363d', color: '#ffd700', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                    {rivalEaId} {'\uD83D\uDCCB'}
                  </button>
                </div>
                <ol style={{ color: '#8b949e', fontSize: '0.78rem', lineHeight: 1.8, marginTop: 10, paddingLeft: 18 }}>
                  <li>{'Abrí el juego'} &rarr; <strong style={{ color: 'white' }}>Amigos / Buscar jugador</strong></li>
                  <li>{'Buscá a '}<strong style={{ color: '#ffd700' }}>{rivalName}</strong>{' por su ID y mandá invitación'}</li>
                  <li>{'Jugá el partido completo'} &mdash; sin abandonar</li>
                  <li>Al terminar, <strong style={{ color: '#00ff88' }}>{'reportá el marcador'}</strong> abajo</li>
                </ol>
              </div>
            )}

            {/* REPORTE DE RESULTADO */}
            {canReport && (
              <div style={{ ...S.card, border: '1px solid rgba(0,255,136,0.25)', background: 'rgba(0,255,136,0.03)' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.8rem', fontWeight: 900, marginBottom: 14 }}>
                  {'\uD83D\uDCCA'} REPORTAR RESULTADO
                </div>

                {/* Mi marcador */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: 8 }}>
                    Mis goles <span style={{ color: '#00ff88' }}>({myName})</span>:
                  </div>
                  <div className="score-grid">
                    {Array.from({ length: 8 }, (_, i) => (
                      <button key={i} onClick={() => setMyScore(i)} style={S.scoreBtn(myScore === i)}>{i}</button>
                    ))}
                  </div>
                </div>

                {/* Goles rival */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: 8 }}>
                    Goles de <span style={{ color: '#5865f2' }}>{rivalName}</span>:
                  </div>
                  <div className="score-grid">
                    {Array.from({ length: 8 }, (_, i) => (
                      <button key={i} onClick={() => setRivalScore(i)} style={S.scoreBtn(rivalScore === i)}>{i}</button>
                    ))}
                  </div>
                </div>

                {/* Preview marcador */}
                {myScore !== null && rivalScore !== null && (
                  <div style={{ textAlign: 'center', marginBottom: 14, padding: '10px', background: '#0b0e14', borderRadius: 10, border: '1px solid rgba(255,215,0,0.2)' }}>
                    <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.4rem', fontWeight: 900, color: '#ffd700' }}>
                      {myScore} &ndash; {rivalScore}
                    </span>
                    <div style={{ fontSize: '0.65rem', color: '#8b949e', marginTop: 3 }}>
                      {myName} vs {rivalName}
                    </div>
                  </div>
                )}

                {/* Screenshot opcional */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: 6 }}>
                    {'\uD83D\uDCF8'} Screenshot (recomendado para auditor\u00EDa del BOT):
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: '#1c2028', border: '1px dashed #30363d', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: screenshot ? '#00ff88' : '#8b949e' }}>
                    {screenshot ? `\u2705 ${screenshot.name}` : '\uD83D\uDCF7 Adjuntar foto del resultado'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setScreenshot(e.target.files?.[0] ?? null)} />
                  </label>
                </div>

                <button
                  onClick={handleReportScore}
                  disabled={reporting || myScore === null || rivalScore === null}
                  style={{ ...S.btn(reporting || myScore === null || rivalScore === null ? '#1c2028' : '#00ff88', reporting ? '#666' : '#000'), width: '100%', justifyContent: 'center', opacity: myScore === null || rivalScore === null ? 0.5 : 1 }}
                >
                  {reporting ? '\u23F3 Enviando...' : '\u2705 CONFIRMAR RESULTADO'}
                </button>
              </div>
            )}

            {/* CONFIRMACION PENDIENTE (el que reporto) */}
            {isPlayer && match.status === "PENDING_RESULT" && match.reported_by === uid && (
              <div style={{ ...S.card, border: '1px solid rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>{'\u23F3'}</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontWeight: 900, marginBottom: 6 }}>ESPERANDO CONFIRMACI\u00D3N</div>
                <div style={{ color: '#8b949e', fontSize: '0.78rem' }}>
                  Reportaste <strong style={{ color: 'white' }}>{match.score}</strong>.<br />
                  Tu rival tiene hasta que venza el tiempo para aceptar o disputar.
                </div>
                {timeLeft > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: '0.65rem', color: '#8b949e', marginBottom: 4 }}>Tiempo restante para disputa</div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '2rem', fontWeight: 900, color: timeLeft <= 60 ? '#ff4757' : '#ffd700', animation: timeLeft <= 60 ? 'pulse 1s infinite' : 'none' }}>
                      {fmtTime(timeLeft)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DISPUTA (el que NO reporto) */}
            {canDispute && (
              <div style={{ ...S.card, border: '1px solid rgba(255,71,87,0.35)', background: 'rgba(255,71,87,0.04)' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ff4757', fontSize: '0.8rem', fontWeight: 900, marginBottom: 10 }}>
                  {'\u26A0\uFE0F'} {'TU RIVAL REPORTÓ VICTORIA'}
                </div>

                {/* Countdown */}
                {timeLeft > 0 && (
                  <div style={{ textAlign: 'center', marginBottom: 14, padding: '12px', background: '#0b0e14', borderRadius: 10 }}>
                    <div style={{ fontSize: '0.65rem', color: '#8b949e', marginBottom: 4 }}>{'Tenés este tiempo para disputar'}</div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '2rem', fontWeight: 900, color: timeLeft <= 60 ? '#ff4757' : '#ffd700', animation: timeLeft <= 60 ? 'pulse 1s infinite' : 'none' }}>
                      {fmtTime(timeLeft)}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 10, padding: '8px 12px', background: '#0b0e14', borderRadius: 8, fontSize: '0.78rem' }}>
                  Score reportado por rival: <strong style={{ color: '#ff4757' }}>{match.score}</strong>
                  {match.screenshot_url && (
                    <a href={match.screenshot_url} target="_blank" rel="noreferrer" style={{ marginLeft: 12, color: '#5865f2', fontSize: '0.72rem' }}>
                      {'\uD83D\uDDBC\uFE0F'} Ver screenshot
                    </a>
                  )}
                </div>

                {/* Confirmar resultado */}
                <button
                  onClick={async () => {
                    setDisputing(true);
                    try {
                      await callApi("/api/reportResult", { matchId, confirm: true });
                      setMsg('\u2705 Resultado confirmado.');
                    } catch (e: unknown) { setMsg(`\u274C ${e instanceof Error ? e.message : 'Error'}`); }
                    setDisputing(false);
                  }}
                  style={{ ...S.btn('#1c2028', '#8b949e'), width: '100%', justifyContent: 'center', marginBottom: 10, border: '1px solid #30363d' }}
                >
                  {'\u2705'} CONFIRMAR &mdash; Acepto el resultado
                </button>

                <div style={{ fontSize: '0.72rem', color: '#8b949e', textAlign: 'center', marginBottom: 10 }}>&mdash; o &mdash;</div>

                {/* Tipo de disputa */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: 6 }}>Motivo de la disputa:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {DISPUTE_TYPES.map(dt => (
                      <button key={dt.value} onClick={() => setDisputeType(dt.value)} style={{
                        background: disputeType === dt.value ? 'rgba(255,71,87,0.18)' : '#1c2028',
                        border: `1px solid ${disputeType === dt.value ? '#ff4757' : '#30363d'}`,
                        color: disputeType === dt.value ? '#ff4757' : '#8b949e',
                        padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.68rem', transition: '0.12s',
                      }}>
                        {dt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={disputeDetail}
                  onChange={e => setDisputeDetail(e.target.value)}
                  placeholder={'Describí lo que pasó con detalle...'}
                  style={{ width: '100%', background: '#0b0e14', border: '1px solid #30363d', color: 'white', borderRadius: 8, padding: '10px 12px', fontSize: '0.8rem', resize: 'vertical', minHeight: 80, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
                />

                {/* Screenshot de evidencia */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: '#1c2028', border: '1px dashed #30363d', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: screenshot ? '#00ff88' : '#8b949e', marginBottom: 12 }}>
                  {screenshot ? `\u2705 ${screenshot.name}` : '\uD83D\uDD0E Adjuntar evidencia (opcional)'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setScreenshot(e.target.files?.[0] ?? null)} />
                </label>

                <button onClick={handleDispute} disabled={disputing} style={{ ...S.btn('#ff4757', 'white'), width: '100%', justifyContent: 'center' }}>
                  {disputing ? '\u23F3 Enviando disputa...' : '\uD83D\uDEA8 ENVIAR DISPUTA AL STAFF'}
                </button>
              </div>
            )}

            {/* RESULTADO FINAL */}
            {match.status === "FINISHED" && (
              <div style={{ ...S.card, textAlign: 'center', border: '1px solid rgba(255,215,0,0.25)', background: 'linear-gradient(135deg,rgba(255,215,0,0.04),transparent)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>{'\uD83C\uDFC6'}</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#ffd700', fontSize: '1.1rem', marginBottom: 8 }}>MATCH FINALIZADO</div>
                {match.auto_confirmed && (
                  <div style={{ fontSize: '0.72rem', color: '#8b949e', marginBottom: 8 }}>{'\uD83E\uDD16'} Confirmado automáticamente por el BOT</div>
                )}
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '2rem', fontWeight: 900, color: 'white', marginBottom: 8 }}>{match.score}</div>
                {match.winner && (
                  <div style={{ color: '#00ff88', fontWeight: 700, fontSize: '0.85rem' }}>
                    Ganador: {match.winner === match.p1 ? match.p1_username : match.p2_username}
                  </div>
                )}
              </div>
            )}

            {/* DISPUTA EN REVISION */}
            {match.status === "DISPUTE" && (
              <div style={{ ...S.card, textAlign: 'center', border: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.04)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 6 }}>{'\u26A0\uFE0F'}</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#ff4757', marginBottom: 8 }}>DISPUTA EN REVISI\u00D3N</div>
                <div style={{ color: '#8b949e', fontSize: '0.78rem' }}>El Staff de LFA est\u00E1 revisando el caso. Te notificaremos por Discord en las pr\u00F3ximas horas.</div>
              </div>
            )}

            {/* MENSAJE FEEDBACK */}
            {msg && (
              <div style={{ padding: '12px 16px', borderRadius: 10, fontSize: '0.82rem', textAlign: 'center', marginTop: 8,
                background: msg.startsWith('\u2705') ? 'rgba(0,255,136,0.08)' : msg.startsWith('\u26A0\uFE0F') || msg.startsWith('\uD83E\uDD16') ? 'rgba(255,215,0,0.08)' : 'rgba(255,71,87,0.08)',
                border: `1px solid ${msg.startsWith('\u2705') ? 'rgba(0,255,136,0.25)' : msg.startsWith('\u26A0\uFE0F') || msg.startsWith('\uD83E\uDD16') ? 'rgba(255,215,0,0.25)' : 'rgba(255,71,87,0.25)'}`,
                color: msg.startsWith('\u2705') ? '#00ff88' : msg.startsWith('\u26A0\uFE0F') || msg.startsWith('\uD83E\uDD16') ? '#ffd700' : '#ff4757',
              }}>
                {msg}
              </div>
            )}
          </>)}

          {/* ══════════ TAB: CHAT ═════════════════════════ */}
          {(tab === 'chat_match' || tab === 'chat_torneo') && (
            <div style={{ ...S.card, display: 'flex', flexDirection: 'column', height: 420, padding: 0, overflow: 'hidden' }}>
              {/* Header chat */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #30363d', background: '#0d1117' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, color: tab === 'chat_match' ? '#00ff88' : '#5865f2' }}>
                  {tab === 'chat_match' ? `\uD83D\uDCAC CHAT PRIVADO \u2013 ${myName} vs ${rivalName}` : '\uD83C\uDF10 CHAT DEL TORNEO'}
                </div>
                {tab === 'chat_match' && <div style={{ fontSize: '0.62rem', color: '#8b949e', marginTop: 2 }}>Solo visible para vos y tu rival</div>}
              </div>

              {/* Mensajes */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeChat.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#8b949e', fontSize: '0.78rem', marginTop: 40 }}>
                    {tab === 'chat_match' ? '\uD83D\uDCAC Inici\u00E1 la conversaci\u00F3n con tu rival' : '\uD83C\uDF10 S\u00E9 el primero en escribir en el torneo'}
                  </div>
                )}
                {activeChat.map(m => {
                  const isMe = m.uid === uid;
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      {!isMe && <div style={{ fontSize: '0.62rem', color: '#8b949e', marginBottom: 2, paddingLeft: 4 }}>{m.nombre}</div>}
                      <div className={`chat-bubble ${isMe ? 'chat-me' : 'chat-them'}`} style={{ color: 'white' }}>
                        {m.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid #30363d', display: 'flex', gap: 8 }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder={'Escribí un mensaje...'}
                  maxLength={200}
                  style={{ flex: 1, background: '#0b0e14', border: '1px solid #30363d', color: 'white', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', outline: 'none' }}
                />
                <button onClick={sendChat} disabled={sendingChat || !chatInput.trim()} style={{ ...S.btn('#ffd700'), padding: '8px 14px', flexShrink: 0, opacity: chatInput.trim() ? 1 : 0.4 }}>
                  {'\u27A4'}
                </button>
              </div>
            </div>
          )}

          {/* ═════════ TAB: BRACKET COPA ══════════════ */}
          {tab === 'bracket' && (() => {
            const sortedRounds = Object.entries(bracketByRound)
              .sort(([a], [b]) => roundOrder(a) - roundOrder(b));
            const totalRounds  = sortedRounds.length;

            const phaseName = (round: string, total: number) => {
              if (round === 'final') return { label: 'GRAN FINAL', color: '#ffd700', icon: '🏆' };
              const idx = sortedRounds.findIndex(([r]) => r === round);
              const remaining = total - 1 - idx; // rounds left after this
              if (remaining === 0) return { label: 'GRAN FINAL', color: '#ffd700', icon: '🏆' };
              if (remaining === 1) return { label: 'SEMIFINAL', color: '#ff4757', icon: '🔥' };
              if (remaining === 2) return { label: 'CUARTOS DE FINAL', color: '#ff8c00', icon: '⚡' };
              if (remaining === 3) return { label: 'OCTAVOS DE FINAL', color: '#5865f2', icon: '🎯' };
              return { label: `RONDA ${round.replace('round_', '')}`, color: '#8b949e', icon: '🎮' };
            };

            const playerLabel = (m: typeof bracketMatches[0], side: 'p1' | 'p2') => {
              const uid2  = m[side];
              const uname = side === 'p1' ? m.p1_username : m.p2_username;
              if (!uid2 || uid2 === 'TBD') return 'TBD';
              if (uid2.startsWith('bot_')) return uid2.replace('bot_', 'BOT ').toUpperCase();
              return uname || uid2;
            };

            return (
              <div style={{ ...S.card, overflowX: 'auto', padding: '20px 12px' }}>
                <style>{`
                  .bk-phase-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-family:'Orbitron',sans-serif; font-weight:900; font-size:0.55rem; letter-spacing:2px; margin-bottom:12px; }
                  .bk-match-card { border-radius:10px; overflow:hidden; width:100%; }
                  .bk-slot { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; gap:6px; min-height:34px; border-bottom:1px solid rgba(255,255,255,0.05); }
                  .bk-slot:last-child { border-bottom:none; }
                  .bk-name { font-family:'Orbitron',sans-serif; font-size:0.6rem; font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px; flex:1; }
                  .bk-score { font-family:'Orbitron',sans-serif; font-size:0.7rem; font-weight:900; min-width:28px; text-align:center; }
                  .bk-connector { width:20px; border-top:1px solid #30363d; flex-shrink:0; }
                  .bk-trophy { font-size:4rem; text-align:center; filter:drop-shadow(0 0 20px rgba(255,215,0,0.7)); animation:pulse 2s infinite; }
                `}</style>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.9rem', fontWeight: 900, letterSpacing: 3 }}>
                    🏆 BRACKET — COPA LFA
                  </div>
                  <div style={{ color: '#8b949e', fontSize: '0.62rem', marginTop: 4 }}>
                    {bracketMatches.length} partidos · {totalRounds} rondas
                  </div>
                </div>

                {bracketMatches.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#8b949e', fontSize: '0.78rem', padding: '30px 0' }}>
                    ⏳ El bracket se generará cuando comience el torneo.
                  </div>
                )}

                {/* Rondas */}
                {sortedRounds.map(([round, rMatches], roundIdx) => {
                  const phase = phaseName(round, totalRounds);
                  const isFinal = round === 'final' || roundIdx === totalRounds - 1;
                  const finishedMatch = isFinal ? rMatches.find(m => m.status === 'FINISHED') : null;
                  const champion = finishedMatch?.winner;
                  const champName = champion
                    ? (finishedMatch?.p1 === champion
                        ? (finishedMatch?.p1_username || playerLabel(finishedMatch!, 'p1'))
                        : (finishedMatch?.p2_username || playerLabel(finishedMatch!, 'p2')))
                    : null;

                  return (
                    <div key={round} style={{ marginBottom: isFinal ? 0 : 24 }}>
                      {/* Phase badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, ' + phase.color + '44)' }} />
                        <span className="bk-phase-badge" style={{ background: phase.color + '22', color: phase.color, border: '1px solid ' + phase.color + '44' }}>
                          {phase.icon} {phase.label}
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, ' + phase.color + '44)' }} />
                      </div>

                      {/* Match cards grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: isFinal ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                        {rMatches.map((m) => {
                          const isCurr  = m.id === matchId;
                          const isMyM   = m.p1 === uid || m.p2 === uid;
                          const done    = m.status === 'FINISHED';
                          const pending = m.status === 'PENDING_RESULT';

                          const borderColor = isCurr ? '#ffd700' : isMyM ? '#5865f2' : '#30363d';
                          const bgColor     = isCurr ? 'rgba(255,215,0,0.06)' : isMyM ? 'rgba(88,101,242,0.06)' : '#0d1117';

                          const slotStyle = (side: 'p1' | 'p2') => {
                            const pUid = m[side];
                            const won  = done && m.winner === pUid;
                            const lost = done && m.winner !== null && m.winner !== pUid;
                            return {
                              color:          won ? '#ffd700' : lost ? '#444' : pUid === 'TBD' ? '#555' : 'white',
                              textDecoration: lost ? 'line-through' as const : 'none',
                              background:     won ? 'rgba(255,215,0,0.08)' : 'transparent',
                            };
                          };

                          const p1label = playerLabel(m, 'p1');
                          const p2label = playerLabel(m, 'p2');
                          const scoreStr = done ? m.score : pending ? '⏳' : 'vs';

                          return (
                            <div key={m.id} className="bk-match-card" style={{
                              border: `1px solid ${borderColor}`,
                              background: bgColor,
                              boxShadow: isCurr ? `0 0 12px rgba(255,215,0,0.15)` : 'none',
                            }}>
                              {/* Match ID label */}
                              <div style={{ padding: '4px 10px', background: borderColor + '22', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.48rem', color: borderColor, letterSpacing: 1 }}>
                                  {isCurr ? '★ ESTE PARTIDO' : isMyM ? '◆ TU PARTIDO' : '·'}
                                </span>
                                <span style={{ fontSize: '0.48rem', color: done ? '#00ff88' : '#8b949e', fontFamily: "'Orbitron',sans-serif" }}>
                                  {done ? '✅ FINALIZADO' : pending ? '⏳ PENDIENTE' : '🟢 EN JUEGO'}
                                </span>
                              </div>

                              {/* Slot P1 */}
                              <div className="bk-slot" style={{ ...slotStyle('p1') }}>
                                <span className="bk-name">{p1label}</span>
                                {m.p1 === uid && <span style={{ fontSize: '0.5rem', color: '#00ff88', flexShrink: 0 }}>VOS</span>}
                                <span className="bk-score" style={{ color: done && m.winner === m.p1 ? '#ffd700' : '#8b949e' }}>
                                  {done ? (m.score?.split('-')[0] ?? '') : ''}
                                </span>
                              </div>

                              {/* Slot P2 */}
                              <div className="bk-slot" style={{ ...slotStyle('p2') }}>
                                <span className="bk-name">{p2label}</span>
                                {m.p2 === uid && <span style={{ fontSize: '0.5rem', color: '#00ff88', flexShrink: 0 }}>VOS</span>}
                                <span className="bk-score" style={{ color: done && m.winner === m.p2 ? '#ffd700' : '#8b949e' }}>
                                  {done ? (m.score?.split('-')[1] ?? '') : scoreStr}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Conector visual entre rondas */}
                      {!isFinal && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 2 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                            <div style={{ width: 2, height: 18, background: 'linear-gradient(to bottom, ' + phase.color + '66, transparent)' }} />
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: phase.color + '88', border: '1px solid ' + phase.color }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ── CAMPEÓN / PODIO ──────────────────────── */}
                {(() => {
                  const finalRound = sortedRounds[sortedRounds.length - 1];
                  if (!finalRound) return null;
                  const [, fMatches] = finalRound;
                  const finalMatch = fMatches[0];
                  if (!finalMatch || finalMatch.status !== 'FINISHED') return null;

                  const champUid  = finalMatch.winner;
                  const subUid    = champUid === finalMatch.p1 ? finalMatch.p2 : finalMatch.p1;
                  const champName = champUid === finalMatch.p1
                    ? (finalMatch.p1_username || playerLabel(finalMatch, 'p1'))
                    : (finalMatch.p2_username || playerLabel(finalMatch, 'p2'));
                  const subName   = subUid === finalMatch.p1
                    ? (finalMatch.p1_username || playerLabel(finalMatch, 'p1'))
                    : (finalMatch.p2_username || playerLabel(finalMatch, 'p2'));

                  return (
                    <div style={{ textAlign: 'center', marginTop: 28, padding: '24px 16px', background: 'linear-gradient(135deg, rgba(255,215,0,0.06), transparent)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 16 }}>
                      <div className="bk-trophy">🏆</div>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '1rem', fontWeight: 900, marginTop: 10, marginBottom: 4 }}>
                        CAMPEÓN LFA
                      </div>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", color: 'white', fontSize: '1.2rem', fontWeight: 900, marginBottom: 16 }}>
                        {champName}
                      </div>

                      {/* Podio */}
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.5rem' }}>🥇</div>
                          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: '#ffd700', marginTop: 4 }}>1° LUGAR</div>
                          <div style={{ fontSize: '0.72rem', color: 'white', fontWeight: 700 }}>{champName}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.5rem' }}>🥈</div>
                          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: '#c0c0c0', marginTop: 4 }}>2° LUGAR</div>
                          <div style={{ fontSize: '0.72rem', color: '#c0c0c0' }}>{subName}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>
            );
          })()}

        </div>
      </div>
    </>
  );
}