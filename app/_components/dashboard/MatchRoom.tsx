"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { doc, onSnapshot, collection, query, where, orderBy, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, storage }                from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/* ─── Types ─────────────────────────────────────────────── */
interface BotVerification {
  verdict:    "OK" | "SUSPICIOUS" | "MANUAL";
  confidence: number;
  game:       string;
  scoreFound: string | null;
}

interface Match {
  id:               string;
  p1:               string;
  p2:               string;
  p1_username?:     string;
  p2_username?:     string;
  p1_ea_id?:        string;
  p2_ea_id?:        string;
  score:            string;
  winner:           string | null;
  status:           "WAITING" | "PENDING_RESULT" | "DISPUTE" | "FINISHED";
  reported_by?:     string;
  screenshot_url?:  string;
  dispute_deadline?: { toMillis: () => number };
  round:            string;
  tournamentId:     string;
  game?:            string;
  bot_verification?: BotVerification;
}

interface ChatMsg {
  id:         string;
  uid:        string;
  nombre:     string;
  texto:      string;
  timestamp?: { toMillis: () => number };
  rol?:       string;
}

interface BracketMatch {
  id:           string;
  p1:           string;
  p2:           string;
  winner:       string | null;
  status:       string;
  score:        string;
  round:        string;
  p1_username?: string;
  p2_username?: string;
}

interface Props { matchId: string; }

const DISCORD_URL = "https://discord.gg/somoslfa";

export default function MatchRoom({ matchId }: Props) {
  const [match,          setMatch]          = useState<Match | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [uploading,      setUploading]      = useState(false);
  const [botChecking,    setBotChecking]    = useState(false);
  const [disputing,      setDisputing]      = useState(false);
  const [confirming,     setConfirming]     = useState(false);
  const [disputeReason,  setDisputeReason]  = useState("");
  const [message,        setMessage]        = useState("");
  const [timeLeft,       setTimeLeft]       = useState(0);
  const [copied,         setCopied]         = useState(false);
  const [chatMsgs,       setChatMsgs]       = useState<ChatMsg[]>([]);
  const [chatInput,      setChatInput]      = useState("");
  const [sendingChat,    setSendingChat]    = useState(false);
  const [brackets,       setBrackets]       = useState<BracketMatch[]>([]);
  const [showBrackets,   setShowBrackets]   = useState(false);
  const [showConfetti,   setShowConfetti]   = useState(false);
  const [prevWinner,     setPrevWinner]     = useState<string | null>(null);
  const chatBottomRef  = useRef<HTMLDivElement>(null);

  const uid      = auth.currentUser?.uid;
  const userName = auth.currentUser?.displayName || "Jugador";

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "matches", matchId), (snap) => {
      if (snap.exists()) { setMatch({ id: snap.id, ...snap.data() } as Match); }
      setLoading(false);
    });
    return () => unsub();
  }, [matchId]);

  useEffect(() => {
    if (!match?.dispute_deadline) return;
    const iv = setInterval(() => {
      const secs = Math.max(0, Math.floor((match.dispute_deadline!.toMillis() - Date.now()) / 1000));
      setTimeLeft(secs);
    }, 1000);
    return () => clearInterval(iv);
  }, [match?.dispute_deadline]);

  /* ── Chat listener ── */
  useEffect(() => {
    if (!matchId) return;
    const q = query(
      collection(db, "match_chat"),
      where("matchId", "==", matchId),
      orderBy("timestamp", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setChatMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)));
    });
    return () => unsub();
  }, [matchId]);

  /* ── Auto-scroll chat ── */
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  /* ── Real-time brackets listener ── */
  useEffect(() => {
    if (!match?.tournamentId) return;
    const q = query(collection(db, "matches"), where("tournamentId", "==", match.tournamentId));
    const unsub = onSnapshot(q, (snap) => {
      setBrackets(snap.docs.map(d => ({ id: d.id, ...d.data() } as BracketMatch)));
    });
    return () => unsub();
  }, [match?.tournamentId]);

  /* ── Confetti when current match finishes ── */
  useEffect(() => {
    if (match?.status === "FINISHED" && prevWinner === null && match.winner) {
      setPrevWinner(match.winner);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 6000);
    }
  }, [match?.status, match?.winner, prevWinner]);

  const callApi = useCallback(async (endpoint: string, body: object) => {
    const token = await auth.currentUser!.getIdToken();
    const res   = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  }, []);

  const handleUploadResult = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !match) return;
    e.target.value = "";

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("❌ Solo se aceptan imágenes JPEG, PNG o WebP."); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("❌ La imagen no puede superar 5 MB."); return;
    }

    setUploading(true); setMessage("⏳ Comprimiendo imagen...");
    try {
      const resizedBlob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          const MAX_DIM = 900;
          const scale   = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
          const canvas  = document.createElement("canvas");
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(b => b ? resolve(b) : reject(new Error("Compress error")), "image/jpeg", 0.75);
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Read error")); };
        img.src = objectUrl;
      });

      setMessage("⬆️ Subiendo resultado...");
      const storageRef = ref(storage, `results/${match.tournamentId}/${matchId}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, resizedBlob, { contentType: "image/jpeg" });
      const screenshotUrl = await getDownloadURL(storageRef);

      await callApi("/api/reportResult", { matchId, screenshotUrl });
      setMessage("🤖 Resultado subido. El BOT LFA está verificando la imagen...");
      setUploading(false);

      setBotChecking(true);
      try {
        const verif = await callApi("/api/verifyResult", { matchId, screenshotUrl });
        if (verif.verdict === "OK")
          setMessage(`✅ BOT verificó el resultado. Marcador: ${verif.scoreFound || "detectado"} (${Math.round((verif.confidence || 0) * 100)}% confianza). Tu rival tiene 10 minutos para disputar.`);
        else if (verif.verdict === "SUSPICIOUS")
          setMessage(`🚨 El BOT detectó irregularidades (${Math.round((verif.confidence || 0) * 100)}% confianza). El Staff revisará el caso manualmente.`);
        else
          setMessage(`🔍 Revisión manual requerida. Confianza: ${Math.round((verif.confidence || 0) * 100)}%. El Staff validará en breve.`);
      } catch {
        setMessage("✅ Resultado subido. Tu rival tiene 10 minutos para disputar o confirmar.");
      } finally {
        setBotChecking(false);
      }
    } catch (err: unknown) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Error al subir resultado"}`);
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true); setMessage("");
    try {
      await callApi("/api/confirmResult", { matchId });
      setMessage("✅ Resultado confirmado. ¡Gracias por validar el partido!");
    } catch (err: unknown) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Error al confirmar"}`);
    } finally {
      setConfirming(false);
    }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim()) { setMessage("❌ Escribí el motivo de la disputa."); return; }
    setDisputing(true); setMessage("");
    try {
      await callApi("/api/disputeMatch", { matchId, reason: disputeReason });
      setMessage("⚖️ Disputa enviada. El Staff revisará el caso. El resultado queda suspendido.");
      setDisputeReason("");
    } catch (err: unknown) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Error al disputar"}`);
    } finally {
      setDisputing(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !uid || !match) return;
    setSendingChat(true);
    try {
      await addDoc(collection(db, "match_chat"), {
        matchId,
        tournamentId: match.tournamentId,
        uid,
        nombre: userName,
        texto: chatInput.trim().slice(0, 300),
        timestamp: serverTimestamp(),
      });
      setChatInput("");
    } catch { /* silently fail */ }
    finally { setSendingChat(false); }
  };

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0b0e14", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 48, height: 48, border: "3px solid #ffd700", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!match) return <div style={{ minHeight: "100vh", background: "#0b0e14", color: "#ff4757", display: "flex", alignItems: "center", justifyContent: "center" }}>Match no encontrado.</div>;

  const isP1        = match.p1 === uid;
  const isP2        = match.p2 === uid;
  const isPlayer    = isP1 || isP2;
  const isLoser     = isPlayer && match.status === "FINISHED" && match.winner !== null && match.winner !== uid;
  const isWinner    = isPlayer && match.status === "FINISHED" && match.winner === uid;
  const rivalEaId   = isP1 ? match.p2_ea_id : match.p1_ea_id;
  const myEaId      = isP1 ? match.p1_ea_id : match.p2_ea_id;
  const isEfootball = ((match.game ?? "") as string).toUpperCase().includes("EFOOTBALL") ||
                      ((match.game ?? "") as string).toUpperCase().includes("E-FOOTBALL");
  const idLabel     = isEfootball ? "Konami ID" : "EA ID";
  const canReport   = isPlayer && match.status === "WAITING";
  const canConfirm  = isPlayer && match.status === "PENDING_RESULT" && match.reported_by !== uid;
  const canDispute  = canConfirm && timeLeft > 0;
  const bv          = match.bot_verification;
  const bvColor     = bv?.verdict === "OK" ? "#00ff88" : bv?.verdict === "SUSPICIOUS" ? "#ff4757" : "#f3ba2f";

  const roundLabels: Record<string, string> = {
    round_1: "🎮 Round 1", round_2: "🎮 Round 2", round_3: "🎮 Cuartos",
    round_4: "🎮 Semifinal", final: "🏆 FINAL",
  };
  const statusLabel: Record<string, string> = {
    WAITING: "🟢 Esperando resultado", PENDING_RESULT: "⏳ Verificando resultado...",
    DISPUTE: "⚖️ En disputa — Staff notificado", FINISHED: "✅ Finalizado",
  };
  const statusColor: Record<string, string> = {
    WAITING: "#00ff88", PENDING_RESULT: "#f3ba2f", DISPUTE: "#ff4757", FINISHED: "#8b949e",
  };

  const card: React.CSSProperties = {
    background: "#161b22", border: "1px solid #30363d", borderRadius: 18,
    padding: "clamp(14px,3vw,22px)", marginBottom: 16,
  };
  const btnStyle = (bg: string, col = "white"): React.CSSProperties => ({
    width: "100%", padding: "14px", background: bg, color: col, border: "none",
    borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontWeight: 900,
    fontSize: "0.82rem", cursor: "pointer", letterSpacing: 0.5,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0b0e14", color: "white", padding: "clamp(12px,3vw,24px)", fontFamily: "'Roboto',sans-serif" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes confetti-fall{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}
        @keyframes trophy-pop{0%{transform:scale(0) rotate(-10deg)}60%{transform:scale(1.15) rotate(3deg)}100%{transform:scale(1) rotate(0deg)}}
        @keyframes advance-in{0%{opacity:0;transform:translateX(-20px)}100%{opacity:1;transform:translateX(0)}}
        .chat-bubble{background:#1c2028;border-radius:14px;padding:8px 12px;margin-bottom:6px;max-width:85%;}
        .chat-bubble.mine{background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.2);margin-left:auto;}
        .chat-bubble.bot{background:rgba(0,255,136,0.07);border:1px solid rgba(0,255,136,0.2);}
        .brk-cell{flex:1;background:#1c2028;border:1px solid #30363d;border-radius:8px;padding:6px 10px;font-size:0.7rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .3s;}
        .brk-cell.winner{border-color:rgba(0,255,136,0.5);background:rgba(0,255,136,0.07);}
        .brk-cell.loser{border-color:rgba(100,100,100,0.3);opacity:0.55;}
        .brk-cell.active{border-color:rgba(255,215,0,0.5);background:rgba(255,215,0,0.06);}
        .brk-cell.current{border-color:rgba(255,215,0,0.8);background:rgba(255,215,0,0.12);box-shadow:0 0 10px rgba(255,215,0,0.2);}
      `}</style>

      {/* ── CONFETTI OVERLAY ── */}
      {showConfetti && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,pointerEvents:"none",overflow:"hidden" }}>
          {Array.from({length: 60}).map((_, i) => {
            const colors = ["#ffd700","#ff4757","#00ff88","#009ee3","#ff6b35","#a855f7","#fff"];
            const c = colors[i % colors.length];
            const left = `${Math.random()*100}%`;
            const delay = `${Math.random()*2}s`;
            const dur   = `${2.5 + Math.random()*2}s`;
            const size  = `${6 + Math.random()*8}px`;
            const shape = i % 3 === 0 ? "50%" : "2px";
            return (
              <div key={i} style={{
                position:"absolute", top:"-20px", left, width:size, height:size,
                background: c, borderRadius: shape,
                animation: `confetti-fall ${dur} ${delay} ease-in forwards`,
              }} />
            );
          })}
          {/* Big rockets */}
          {["🎉","🚀","🎊","🏆","⭐","🎆"].map((emoji, i) => (
            <div key={`e${i}`} style={{
              position:"absolute", top:"-40px", left:`${10 + i*15}%`,
              fontSize:"2rem",
              animation: `confetti-fall ${3 + i*0.3}s ${i*0.4}s ease-in forwards`,
            }}>{emoji}</div>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* ── HEADER ── */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "clamp(1.1rem,4vw,1.5rem)", fontWeight: 900, margin: "0 0 4px" }}>🎮 SALA DE MATCH</h1>
          <p style={{ color: "#8b949e", fontSize: "0.78rem", margin: "4px 0" }}>{roundLabels[match.round] || match.round}</p>
          <span style={{ display: "inline-block", marginTop: 8, padding: "4px 14px", background: `${statusColor[match.status]}20`, color: statusColor[match.status], border: `1px solid ${statusColor[match.status]}50`, borderRadius: 99, fontSize: "0.72rem", fontWeight: 700, fontFamily: "'Orbitron',sans-serif" }}>
            {statusLabel[match.status] || match.status}
          </span>
        </div>

        {/* ── VS CARD ── */}
        <div style={{ ...card, background: "linear-gradient(135deg,#161b22,#0f1520)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "rgba(255,215,0,0.1)", border: "2px solid #ffd700", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", margin: "0 auto 8px" }}>👤</div>
              <div style={{ fontWeight: 900, fontSize: "0.88rem", marginBottom: 4, wordBreak: "break-word" as const }}>{match.p1_username ?? "Jugador 1"}</div>
              {match.p1_ea_id && <div style={{ fontFamily: "monospace", color: "#ffd700", fontSize: "0.7rem", wordBreak: "break-all" as const }}>{isEfootball ? "⚽" : "🎮"} {match.p1_ea_id}</div>}
              {match.winner === match.p1 && <div style={{ color: "#00ff88", fontSize: "0.72rem", marginTop: 4, fontWeight: 700 }}>🏆 GANADOR</div>}
            </div>
            <div style={{ textAlign: "center", minWidth: 70 }}>
              {match.score && match.status !== "WAITING"
                ? <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "clamp(1.3rem,5vw,2rem)", fontWeight: 900, color: "#ffd700" }}>{match.score}</div>
                : <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "1.4rem", fontWeight: 900, color: "#30363d" }}>VS</div>}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "rgba(0,158,227,0.1)", border: "2px solid #009ee3", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", margin: "0 auto 8px" }}>👤</div>
              <div style={{ fontWeight: 900, fontSize: "0.88rem", marginBottom: 4, wordBreak: "break-word" as const }}>{match.p2_username ?? "Jugador 2"}</div>
              {match.p2_ea_id && <div style={{ fontFamily: "monospace", color: "#009ee3", fontSize: "0.7rem", wordBreak: "break-all" as const }}>{isEfootball ? "⚽" : "🎮"} {match.p2_ea_id}</div>}
              {match.winner === match.p2 && <div style={{ color: "#00ff88", fontSize: "0.72rem", marginTop: 4, fontWeight: 700 }}>🏆 GANADOR</div>}
            </div>
          </div>
          {/* Botones brackets + Discord */}
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button onClick={() => setShowBrackets(v => !v)}
              style={{ flex: 1, padding: "8px", background: showBrackets ? "rgba(255,215,0,0.15)" : "rgba(255,215,0,0.08)", color: "#ffd700", border: `1px solid rgba(255,215,0,${showBrackets ? "0.5" : "0.25"})`, borderRadius: 10, fontFamily: "'Orbitron',sans-serif", fontSize: "0.68rem", fontWeight: 700, cursor: "pointer" }}>
              🏆 {showBrackets ? "OCULTAR" : "VER"} BRACKETS
            </button>
            <a href={DISCORD_URL} target="_blank" rel="noreferrer"
              style={{ flex: 1, padding: "8px", background: "rgba(88,101,242,0.1)", color: "#5865F2", border: "1px solid rgba(88,101,242,0.3)", borderRadius: 10, fontFamily: "'Orbitron',sans-serif", fontSize: "0.68rem", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              💬 DISCORD STAFF
            </a>
          </div>
        </div>

        {/* ── BRACKETS PANEL ── */}
        {showBrackets && brackets.length > 0 && (() => {
          const rounds = Array.from(new Set(brackets.map(m => m.round))).sort((a, b) => {
            if (a === "final") return 1; if (b === "final") return -1;
            const na = parseInt(a.replace(/\D/g, "") || "0", 10);
            const nb = parseInt(b.replace(/\D/g, "") || "0", 10);
            return na - nb;
          });
          const isTournamentDone = brackets.every(m => m.status === "FINISHED");
          const champion = isTournamentDone
            ? (() => {
                const finalMatch = brackets.find(m => m.round === "final" || rounds[rounds.length - 1] === m.round);
                if (!finalMatch?.winner) return null;
                return finalMatch.winner === finalMatch.p1
                  ? (finalMatch.p1_username || finalMatch.p1?.slice(0, 12) || "Campeón")
                  : (finalMatch.p2_username || finalMatch.p2?.slice(0, 12) || "Campeón");
              })()
            : null;

          return (
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ background: "linear-gradient(135deg,rgba(255,215,0,0.12),rgba(255,215,0,0.04))", borderBottom: "1px solid rgba(255,215,0,0.2)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "0.78rem", fontWeight: 700 }}>🏆 BRACKETS EN VIVO</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff88", animation: "pulse 2s infinite", boxShadow: "0 0 6px #00ff88" }} />
                  <span style={{ color: "#00ff88", fontSize: "0.6rem", fontFamily: "'Orbitron',sans-serif" }}>LIVE</span>
                </div>
              </div>

              {/* Champion banner */}
              {champion && (
                <div style={{ background: "linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,165,0,0.08))", borderBottom: "1px solid rgba(255,215,0,0.3)", padding: "16px", textAlign: "center" }}>
                  <div style={{ fontSize: "3rem", animation: "trophy-pop 0.6s ease-out", display: "inline-block" }}>🏆</div>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "0.95rem", fontWeight: 900, marginTop: 4 }}>CAMPEÓN</div>
                  <div style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, marginTop: 4 }}>{champion}</div>
                </div>
              )}

              <div style={{ padding: "12px 14px", overflowX: "auto" }}>
                {/* Bracket rounds as columns */}
                <div style={{ display: "flex", gap: 10, minWidth: `${rounds.length * 170}px` }}>
                  {rounds.map((round, ri) => {
                    const roundMatches = brackets.filter(m => m.round === round);
                    const isFinalRound = ri === rounds.length - 1;
                    return (
                      <div key={round} style={{ flex: 1, minWidth: 150 }}>
                        {/* Round label */}
                        <div style={{ textAlign: "center", marginBottom: 8, padding: "4px 8px", background: isFinalRound ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.03)", borderRadius: 6, border: `1px solid ${isFinalRound ? "rgba(255,215,0,0.3)" : "#30363d"}` }}>
                          <span style={{ color: isFinalRound ? "#ffd700" : "#8b949e", fontSize: "0.6rem", fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>
                            {roundLabels[round] || round.toUpperCase()}
                          </span>
                        </div>

                        {/* Matches in this round */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {roundMatches.map(m => {
                            const isCurrent    = m.id === matchId;
                            const isFinished   = m.status === "FINISHED";
                            const isActive     = m.status === "WAITING" || m.status === "PENDING_RESULT";
                            const p1Won        = isFinished && m.winner === m.p1;
                            const p2Won        = isFinished && m.winner === m.p2;
                            const p1Name       = m.p1_username || m.p1?.slice(0, 12) || "TBD";
                            const p2Name       = m.p2_username || m.p2?.slice(0, 12) || "TBD";
                            const hasAdvanced  = isFinished && isFinalRound; // champion match

                            return (
                              <div key={m.id} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${isCurrent ? "rgba(255,215,0,0.7)" : isActive ? "rgba(0,255,136,0.3)" : isFinished ? "rgba(255,255,255,0.08)" : "#30363d"}`, boxShadow: isCurrent ? "0 0 12px rgba(255,215,0,0.2)" : "none", transition: "all .3s" }}>

                                {/* P1 row */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: p1Won ? "rgba(0,255,136,0.1)" : "rgba(22,27,34,0.8)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                  <span style={{ fontSize: "0.6rem", flexShrink: 0 }}>{p1Won ? "🏆" : !isFinished ? (m.p1 ? "▶" : "·") : "·"}</span>
                                  <span style={{ flex: 1, fontSize: "0.7rem", color: p1Won ? "#00ff88" : !isFinished && m.p1 ? "white" : "#555", fontWeight: p1Won ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {p1Name}
                                  </span>
                                  {isFinished && m.score && (
                                    <span style={{ color: p1Won ? "#00ff88" : "#444", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>
                                      {m.score.split("-")[0] ?? "-"}
                                    </span>
                                  )}
                                </div>

                                {/* P2 row */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: p2Won ? "rgba(0,255,136,0.1)" : "rgba(15,19,26,0.8)" }}>
                                  <span style={{ fontSize: "0.6rem", flexShrink: 0 }}>{p2Won ? "🏆" : !isFinished ? (m.p2 ? "▶" : "·") : "·"}</span>
                                  <span style={{ flex: 1, fontSize: "0.7rem", color: p2Won ? "#00ff88" : !isFinished && m.p2 ? "white" : "#555", fontWeight: p2Won ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {p2Name}
                                  </span>
                                  {isFinished && m.score && (
                                    <span style={{ color: p2Won ? "#00ff88" : "#444", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>
                                      {m.score.split("-")[1] ?? "-"}
                                    </span>
                                  )}
                                </div>

                                {/* Status badge + advance banner */}
                                {isCurrent && (
                                  <div style={{ padding: "3px 8px", background: "rgba(255,215,0,0.1)", textAlign: "center" }}>
                                    <span style={{ color: "#ffd700", fontSize: "0.55rem", fontFamily: "'Orbitron',sans-serif" }}>◉ ESTA SALA</span>
                                  </div>
                                )}
                                {isFinished && !isCurrent && m.winner && (() => {
                                  const winName = m.winner === m.p1 ? p1Name : p2Name;
                                  const nextRoundIdx = ri + 1;
                                  const hasNext = nextRoundIdx < rounds.length;
                                  return (
                                    <div style={{ padding: "3px 8px", background: "rgba(0,255,136,0.05)", textAlign: "center", animation: "advance-in .4s ease-out" }}>
                                      <span style={{ color: "#00ff88", fontSize: "0.55rem" }}>
                                        {hasNext ? `✓ ${winName} avanza` : `🏆 ${winName} campeón`}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}

                          {/* Trophy at bottom of final column */}
                          {isFinalRound && (
                            <div style={{ textAlign: "center", marginTop: 8 }}>
                              <div style={{ fontSize: "2rem", filter: isTournamentDone ? "drop-shadow(0 0 12px #ffd700)" : "grayscale(1) opacity(0.3)" }}>🏆</div>
                              <div style={{ color: isTournamentDone ? "#ffd700" : "#30363d", fontSize: "0.55rem", fontFamily: "'Orbitron',sans-serif", marginTop: 2 }}>
                                {isTournamentDone ? "FINALIZADO" : "FINAL"}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── BOT VERIFICATION ── */}
        {bv && (
          <div style={{ ...card, borderColor: `${bvColor}50`, background: `${bvColor}08` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.3rem" }}>{bv.verdict === "OK" ? "✅" : bv.verdict === "SUSPICIOUS" ? "🚨" : "🔍"}</span>
              <div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.72rem", color: bvColor, fontWeight: 700 }}>
                  BOT IA 🤖 {bv.verdict} — {Math.round((bv.confidence || 0) * 100)}% confianza
                </div>
                <div style={{ color: "#8b949e", fontSize: "0.68rem" }}>
                  {bv.game && `Juego: ${bv.game}`}{bv.scoreFound && ` — Marcador detectado: ${bv.scoreFound}`}
                </div>
              </div>
            </div>
            {bv.verdict === "SUSPICIOUS" && (
              <p style={{ color: "#ff4757", fontSize: "0.72rem", marginTop: 8, marginBottom: 0 }}>
                🚨 El BOT detectó irregularidades. El Staff revisará el caso. Se aplicarán sanciones Fair Play si se confirma fraude.
              </p>
            )}
            {bv.verdict === "MANUAL" && (
              <p style={{ color: "#f3ba2f", fontSize: "0.72rem", marginTop: 8, marginBottom: 0 }}>
                🔍 El BOT no pudo verificar con suficiente confianza. Un Staff revisará la imagen. El resultado se confirma en breve.
              </p>
            )}
          </div>
        )}

        {/* ── SCREENSHOT ── */}
        {match.screenshot_url && match.status !== "WAITING" && (
          <div style={card}>
            <div style={{ color: "#8b949e", fontSize: "0.68rem", fontFamily: "'Orbitron',sans-serif", marginBottom: 8 }}>
              📸 SCREENSHOT — VISIBLE PARA TODOS
            </div>
            <img
              src={match.screenshot_url} alt="Screenshot resultado"
              onClick={() => window.open(match.screenshot_url, "_blank")}
              style={{ width: "100%", borderRadius: 12, border: "1px solid #30363d", display: "block", cursor: "pointer" }}
            />
            <div style={{ color: "#8b949e", fontSize: "0.68rem", marginTop: 6, textAlign: "center" }}>
              Subido por {match.reported_by === match.p1 ? (match.p1_username || "Jugador 1") : (match.p2_username || "Jugador 2")} — Tocá para ver en pantalla completa
            </div>
          </div>
        )}

        {/* ── INSTRUCCIONES CONEXIÓN ── */}
        {match.status === "WAITING" && isPlayer && (
          <div style={{ ...card, borderColor: isEfootball ? "rgba(0,200,150,0.3)" : "rgba(0,158,227,0.3)", background: isEfootball ? "rgba(0,200,150,0.04)" : "rgba(0,158,227,0.05)" }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: isEfootball ? "#00c896" : "#009ee3", fontSize: "0.78rem", fontWeight: 700, marginBottom: 10 }}>
              {isEfootball ? "⚽ CÓMO CONECTARTE — eFOOTBALL" : "🎮 CÓMO CONECTARTE — FC 26"}
            </div>

            {/* Mis IDs + rival */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ background: "#0b0e14", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ color: "#8b949e", fontSize: "0.62rem", marginBottom: 2 }}>TU {idLabel.toUpperCase()}</div>
                <div style={{ fontFamily: "monospace", color: "#ffd700", fontSize: "0.75rem", wordBreak: "break-all" as const }}>{myEaId || "—"}</div>
              </div>
              <div style={{ background: "#0b0e14", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ color: "#8b949e", fontSize: "0.62rem", marginBottom: 2 }}>{idLabel.toUpperCase()} DEL RIVAL</div>
                <div style={{ fontFamily: "monospace", color: isEfootball ? "#00c896" : "#009ee3", fontSize: "0.75rem", wordBreak: "break-all" as const }}>{rivalEaId || "—"}</div>
              </div>
            </div>

            {isEfootball ? (
              <>
                {[
                  "Coordiná con tu rival en el chat quién CREA la sala (el LOCAL).",
                  "El LOCAL va a eFootball → Jugar → Partido Amistoso Online → CREAR SALA.",
                  "El LOCAL comparte el código de sala (ej: 5555-8888) en el chat privado de abajo.",
                  "El VISITANTE va a Buscar sala e ingresa ese código para unirse.",
                  "Recomendado: usar cable Ethernet para menor lag. El LOCAL tiene prioridad de servidor.",
                  "Jueguen el partido completo respetando el Reglamento LFA.",
                  "EL GANADOR sube la foto del marcador final.",
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid #1c2028", alignItems: "flex-start" }}>
                    <span style={{ color: "#00c896", fontWeight: 900, fontSize: "0.78rem", width: 20, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ color: "#ccc", fontSize: "0.78rem", lineHeight: 1.4 }}>{step}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(255,215,0,0.06)", borderRadius: 10, border: "1px solid rgba(255,215,0,0.2)", fontSize: "0.72rem", color: "#f3ba2f" }}>
                  💡 <strong>¿Quién sale de LOCAL?</strong> Idealmente quien tenga mejor conexión al servidor (menor ping). Coordinalo en el chat de abajo.
                </div>
              </>
            ) : (
              [
                "Abrí FC 26 en tu consola o PC.",
                "Andá a Amigos → Buscar jugador por EA ID.",
                `Buscá el EA ID del rival: ${rivalEaId || "—"}`,
                "Invitalo a un partido amistoso.",
                "Jugá el partido completo.",
                "EL GANADOR sube la foto del marcador final.",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid #1c2028", alignItems: "flex-start" }}>
                  <span style={{ color: "#009ee3", fontWeight: 900, fontSize: "0.78rem", width: 20, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ color: "#ccc", fontSize: "0.78rem", lineHeight: 1.4 }}>{step}</span>
                </div>
              ))
            )}

            {rivalEaId && (
              <button onClick={() => copyId(rivalEaId)}
                style={{ ...btnStyle("rgba(0,158,227,0.1)", isEfootball ? "#00c896" : "#009ee3"), marginTop: 14, border: `1px solid ${isEfootball ? "rgba(0,200,150,0.3)" : "rgba(0,158,227,0.3)"}`, fontSize: "0.75rem" }}>
                {copied ? "✅ ¡Copiado!" : `📋 COPIAR ${idLabel.toUpperCase()} DEL RIVAL`}
              </button>
            )}
          </div>
        )}

        {/* ── REPORTAR RESULTADO ── */}
        {canReport && (
          <div style={card}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "0.82rem", fontWeight: 700, marginBottom: 8 }}>📸 REPORTAR RESULTADO</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginBottom: 14, lineHeight: 1.5 }}>
              Solo el <strong style={{ color: "white" }}>ganador</strong> sube la foto del marcador final.<br />
              El BOT LFA verifica automáticamente con Vision AI.<br />
              <span style={{ color: "#f3ba2f" }}>⚠️ Subir una foto falsa implica sanción de Fair Play.</span>
            </p>
            <label style={{ ...btnStyle(uploading || botChecking ? "#30363d" : "#ffd700", uploading || botChecking ? "#555" : "#0b0e14"), display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: uploading || botChecking ? "not-allowed" : "pointer", animation: botChecking ? "pulse 1.5s infinite" : "none" }}>
              {uploading ? "⬆️ Subiendo..." : botChecking ? "🤖 BOT verificando..." : "📸 SUBIR FOTO DEL RESULTADO"}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleUploadResult} disabled={uploading || botChecking} />
            </label>
            <p style={{ color: "#8b949e", fontSize: "0.65rem", marginTop: 8, textAlign: "center" }}>JPG, PNG o WebP · Máx 5MB · Mostrá el marcador final completo</p>
          </div>
        )}

        {/* ── CONFIRMAR / DISPUTAR ── */}
        {canConfirm && (
          <div style={{ ...card, borderColor: "rgba(255,71,87,0.4)", background: "rgba(255,71,87,0.05)" }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ff4757", fontSize: "0.82rem", fontWeight: 700, marginBottom: 8 }}>⚠️ TU RIVAL REPORTÓ VICTORIA</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginBottom: 14, lineHeight: 1.5 }}>
              Revisá la foto del marcador. Podés <strong style={{ color: "#00ff88" }}>confirmar</strong> si es correcto o <strong style={{ color: "#ff4757" }}>disputarlo</strong> si hay error.<br />
              {canDispute
                ? <>El BOT confirma automáticamente en <strong style={{ color: "#ffd700" }}>10 minutos</strong> si no hacés nada.</>
                : <>El tiempo de disputa venció.</>}
            </p>

            {canDispute && (
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div style={{ color: "#8b949e", fontSize: "0.65rem", marginBottom: 4, fontFamily: "'Orbitron',sans-serif" }}>TIEMPO PARA DISPUTAR</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "clamp(1.8rem,6vw,2.4rem)", fontWeight: 900, color: timeLeft <= 120 ? "#ff4757" : "#f3ba2f", animation: timeLeft <= 120 ? "pulse 1s infinite" : "none" }}>
                  {`${Math.floor(timeLeft / 60).toString().padStart(2, "0")}:${(timeLeft % 60).toString().padStart(2, "0")}`}
                </div>
              </div>
            )}

            <div style={{ background: "#0b0e14", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: "0.8rem" }}>
              <span style={{ color: "#8b949e" }}>Marcador reportado: </span>
              <strong style={{ color: "#ffd700" }}>{match.score || "Pendiente validación"}</strong>
            </div>

            <button onClick={handleConfirm} disabled={confirming}
              style={{ ...btnStyle("#00ff88", "#0b0e14"), marginBottom: 12, opacity: confirming ? 0.6 : 1 }}>
              {confirming ? "⏳ CONFIRMANDO..." : "✅ CONFIRMAR RESULTADO (el marcador es correcto)"}
            </button>

            {canDispute && (
              <>
                <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
                  placeholder="Explicá detalladamente por qué el resultado es incorrecto..."
                  style={{ width: "100%", background: "#0b0e14", border: "1px solid #30363d", color: "white", borderRadius: 10, padding: "11px 14px", fontSize: "0.8rem", resize: "none", height: 80, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                <p style={{ color: "#f3ba2f", fontSize: "0.68rem", marginBottom: 10 }}>
                  ⚠️ Las disputas sin fundamento descuentan puntos de Fair Play.
                </p>
                <button onClick={handleDispute} disabled={disputing}
                  style={{ ...btnStyle("#ff4757"), opacity: disputing ? 0.6 : 1 }}>
                  {disputing ? "⏳ ENVIANDO..." : "⚖️ DISPUTAR RESULTADO"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── TIEMPO VENCIDO ── */}
        {match.status === "PENDING_RESULT" && isPlayer && match.reported_by !== uid && !canDispute && (
          <div style={{ ...card, borderColor: "rgba(0,255,136,0.3)", background: "rgba(0,255,136,0.05)", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>⌛</div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#00ff88", fontSize: "0.82rem", fontWeight: 700 }}>Tiempo de disputa vencido</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginTop: 8 }}>
              El resultado se confirmará automáticamente en el próximo ciclo del BOT.
            </p>
          </div>
        )}

        {/* ── DISPUTA ACTIVA ── */}
        {match.status === "DISPUTE" && (
          <div style={{ ...card, borderColor: "rgba(145,70,255,0.4)", background: "rgba(145,70,255,0.05)", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>⚖️</div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#9146FF", fontSize: "0.82rem", fontWeight: 700 }}>DISPUTA ACTIVA</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginTop: 8, marginBottom: 14 }}>
              Un administrador está revisando el caso.<br />
              <span style={{ color: "#f3ba2f" }}>⚠️ Se aplicarán sanciones Fair Play según el veredicto.</span>
            </p>
            <a href={DISCORD_URL} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", background: "rgba(88,101,242,0.15)", color: "#5865F2", border: "1px solid rgba(88,101,242,0.4)", borderRadius: 10, textDecoration: "none", fontFamily: "'Orbitron',sans-serif", fontSize: "0.72rem", fontWeight: 700 }}>
              💬 Abrir ticket en Discord
            </a>
          </div>
        )}

        {/* ── FINALIZADO ── */}
        {match.status === "FINISHED" && (
          <div style={{ ...card, background: "linear-gradient(135deg,rgba(0,255,136,0.05),rgba(255,215,0,0.03))", borderColor: isWinner ? "rgba(0,255,136,0.4)" : isLoser ? "rgba(255,71,87,0.25)" : "rgba(0,255,136,0.3)", textAlign: "center" }}>
            {isWinner ? (
              <>
                <div style={{ fontSize: "3rem", marginBottom: 8, animation: "trophy-pop 0.6s ease-out", display: "inline-block" }}>🏆</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "1rem", fontWeight: 900, marginBottom: 6 }}>¡GANASTE!</div>
                <div style={{ color: "#00ff88", fontWeight: 700, fontSize: "0.85rem", marginBottom: 12 }}>Pasás a la siguiente fase 🎯</div>
                <p style={{ color: "#8b949e", fontSize: "0.72rem" }}>
                  El sistema generará tu próximo match automáticamente. ¡Preparate!
                </p>
              </>
            ) : isLoser ? (
              <>
                <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>😤</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ff4757", fontSize: "0.9rem", fontWeight: 900, marginBottom: 6 }}>ELIMINADO</div>
                <div style={{ color: "#8b949e", fontWeight: 600, fontSize: "0.8rem", marginBottom: 12 }}>
                  Perdiste contra {match.winner === match.p1 ? (match.p1_username || "Jugador 1") : (match.p2_username || "Jugador 2")}
                </div>
                <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid #30363d", marginBottom: 14 }}>
                  <p style={{ color: "#cdd9e5", fontSize: "0.72rem", margin: 0 }}>
                    👁️ Podés quedarte a ver cómo termina el torneo en el chat. Tu presencia es solo de espectador.
                  </p>
                </div>
                <button
                  onClick={() => { if (typeof window !== "undefined") { window.history.back(); } }}
                  style={{ padding: "10px 24px", background: "#161b22", color: "#8b949e", border: "1px solid #30363d", borderRadius: 10, fontFamily: "'Orbitron',sans-serif", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>
                  🚪 Salir de la sala
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>🏆</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "1rem", fontWeight: 900, marginBottom: 8 }}>PARTIDO FINALIZADO</div>
                <div style={{ color: "#00ff88", fontWeight: 700, fontSize: "0.9rem", marginBottom: 12 }}>
                  Ganador: {match.winner === match.p1 ? (match.p1_username || "Jugador 1") : (match.p2_username || "Jugador 2")}
                </div>
                <p style={{ color: "#8b949e", fontSize: "0.75rem" }}>
                  El BOT LFA generará el próximo match automáticamente.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── CHAT PRIVADO DEL MATCH ── */}
        <div style={card}>
          <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#009ee3", fontSize: "0.75rem", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span>💬 {isLoser ? "CHAT — MODO ESPECTADOR" : isEfootball ? "CHAT — COMPARTÍ EL CÓDIGO DE SALA" : "CHAT — COORDINACIÓN CON TU RIVAL"}</span>
            {isLoser && <span style={{ padding: "2px 8px", background: "rgba(139,148,158,0.15)", border: "1px solid #30363d", borderRadius: 6, fontSize: "0.55rem", color: "#8b949e" }}>SOLO LECTURA</span>}
          </div>
          {isEfootball && !isLoser && chatMsgs.filter(m => m.rol !== "bot").length === 0 && (
            <div style={{ color: "#8b949e", fontSize: "0.72rem", marginBottom: 10, padding: "8px 12px", background: "rgba(0,200,150,0.05)", borderRadius: 10, border: "1px solid rgba(0,200,150,0.2)" }}>
              ⚽ Coordiná acá quién crea la sala y compartí el código de sala (ej: <strong style={{ color: "#00c896" }}>5555-8888</strong>).
            </div>
          )}
          {isLoser && (
            <div style={{ padding: "8px 12px", background: "rgba(139,148,158,0.06)", borderRadius: 10, border: "1px solid rgba(139,148,158,0.15)", marginBottom: 10, fontSize: "0.7rem", color: "#8b949e" }}>
              👁️ Estás viendo el torneo como espectador. No podés enviar mensajes.
            </div>
          )}
          <div style={{ height: 220, overflowY: "auto", marginBottom: 10, display: "flex", flexDirection: "column" }}>
            {chatMsgs.length === 0 && (
              <div style={{ color: "#8b949e", fontSize: "0.72rem", textAlign: "center", marginTop: 70 }}>No hay mensajes aún. ¡Saludá a tu rival!</div>
            )}
            {chatMsgs.map(msg => {
              const isMine = msg.uid === uid;
              const isBot  = msg.rol === "bot" || msg.uid === "BOT_LFA";
              return (
                <div key={msg.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 6 }}>
                  <div className={`chat-bubble ${isMine ? "mine" : isBot ? "bot" : ""}`}>
                    {!isMine && <div style={{ color: isBot ? "#00ff88" : "#8b949e", fontSize: "0.62rem", marginBottom: 2, fontWeight: 700 }}>{msg.nombre}</div>}
                    <div style={{ color: "white", fontSize: "0.8rem" }}>{msg.texto}</div>
                  </div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>
          {isPlayer && !isLoser && (
            <div style={{ display: "flex", gap: 8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                placeholder={isEfootball ? "Ej: Yo creo la sala, código: 5555-8888" : "Escribí un mensaje..."}
                maxLength={300}
                style={{ flex: 1, background: "#0b0e14", border: "1px solid #30363d", color: "white", borderRadius: 10, padding: "10px 14px", fontSize: "0.8rem", outline: "none" }} />
              <button onClick={handleSendChat} disabled={sendingChat || !chatInput.trim()}
                style={{ padding: "10px 16px", background: "#009ee3", color: "white", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", opacity: (!chatInput.trim() || sendingChat) ? 0.5 : 1 }}>
                ➤
              </button>
            </div>
          )}
        </div>

        {/* ── MENSAJE FEEDBACK ── */}
        {message && (
          <div style={{
            padding: "12px 16px", borderRadius: 12, textAlign: "center", fontSize: "0.8rem", lineHeight: 1.5, marginBottom: 16,
            background: message.startsWith("✅") || message.startsWith("🏆") ? "rgba(0,255,136,0.08)" : message.startsWith("❌") ? "rgba(255,71,87,0.08)" : "rgba(243,186,47,0.08)",
            border: `1px solid ${message.startsWith("✅") || message.startsWith("🏆") ? "rgba(0,255,136,0.3)" : message.startsWith("❌") ? "rgba(255,71,87,0.3)" : "rgba(243,186,47,0.3)"}`,
            color: message.startsWith("✅") || message.startsWith("🏆") ? "#00ff88" : message.startsWith("❌") ? "#ff4757" : "#f3ba2f",
          }}>
            {message}
          </div>
        )}

      </div>
    </div>
  );
}
