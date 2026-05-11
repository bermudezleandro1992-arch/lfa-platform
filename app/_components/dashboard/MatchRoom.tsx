"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { doc, onSnapshot, collection, query, where, orderBy, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, storage }                from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import BracketView                          from "./BracketView";

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
  /* Check-in */
  p1_ready?:        boolean;
  p2_ready?:        boolean;
  p1_ready_at?:     { toMillis: () => number };
  p2_ready_at?:     { toMillis: () => number };
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
  const [ceoForcing,     setCeoForcing]     = useState(false);
  const [checkingIn,     setCheckingIn]     = useState(false);
  const [playTimeLeft,   setPlayTimeLeft]   = useState(0);
  const chatBottomRef  = useRef<HTMLDivElement>(null);

  const uid      = auth.currentUser?.uid;
  const userName = auth.currentUser?.displayName || "Jugador";
  const CEO_UID  = "2bOrFxTAcPgFPoHKJHQfYxoQJpw1";
  const isCeo    = uid === CEO_UID;

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

  /* ── Countdown 10 min para jugar tras ambos check-in ── */
  useEffect(() => {
    if (!match?.p1_ready || !match?.p2_ready || match?.status !== "WAITING") return;
    const p1At = match?.p1_ready_at?.toMillis() ?? 0;
    const p2At = match?.p2_ready_at?.toMillis() ?? 0;
    const startMs = Math.max(p1At, p2At);
    if (!startMs) return;
    const endMs = startMs + 10 * 60 * 1000;
    const iv = setInterval(() => {
      setPlayTimeLeft(Math.max(0, Math.floor((endMs - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.p1_ready, match?.p2_ready, match?.status, match?.p1_ready_at, match?.p2_ready_at]);

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

  const handleCheckin = async () => {
    if (!match) return;
    setCheckingIn(true); setMessage("");
    try {
      const data = await callApi("/api/checkin", { matchId });
      setMessage(data.message ?? "✓ Check-in registrado.");
    } catch (err: unknown) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Error al hacer check-in"}`);
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCeoForce = async (side: "p1" | "p2") => {
    if (!match || !isCeo) return;
    const label = side === "p1" ? (match.p1_username || "P1") : (match.p2_username || "P2");
    if (!confirm(`⚡ CEO Override: forzar ganador → ${label}?`)) return;
    setCeoForcing(true); setMessage("");
    try {
      await callApi("/api/ceo/forceWinner", { matchId, winnerSide: side });
      setMessage(`✅ CEO Override: ${label} avanza. Bracket actualizado.`);
      // Notificar en el chat de la sala
      await addDoc(collection(db, "match_chat"), {
        matchId,
        tournamentId: match.tournamentId,
        uid: "BOT_LFA",
        nombre: "🤖 BOT LFA",
        rol: "bot",
        texto: `⚡ DECISIÓN CEO: El partido fue resuelto por Staff. Ganador oficial → ${label}. El bracket fue actualizado. Si tenés alguna consulta, abrí un ticket.`,
        timestamp: serverTimestamp(),
      });
    } catch (err: unknown) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Error al forzar ganador"}`);
    } finally { setCeoForcing(false); }
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
  const isPlayer    = isP1 || isP2 || isCeo;  // CEO counts as player for access
  const isLoser     = !isCeo && isPlayer && match.status === "FINISHED" && match.winner !== null && match.winner !== uid;
  const isWinner    = !isCeo && isPlayer && match.status === "FINISHED" && match.winner === uid;
  const rivalEaId   = isP1 ? match.p2_ea_id : match.p1_ea_id;
  const myEaId      = isP1 ? match.p1_ea_id : match.p2_ea_id;
  const isEfootball = ((match.game ?? "") as string).toUpperCase().includes("EFOOTBALL") ||
                      ((match.game ?? "") as string).toUpperCase().includes("E-FOOTBALL");
  const idLabel     = isEfootball ? "Konami ID" : "EA ID";
  const bothReady  = match.p1_ready === true && match.p2_ready === true;
  const myReady     = (isP1 && match.p1_ready) || (isP2 && match.p2_ready);
  const canReport   = isPlayer && match.status === "WAITING" && (isCeo || bothReady);
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

        {/* ── CEO ADMIN PANEL ── */}
        {isCeo && (
          <div style={{ ...card, borderColor: "rgba(255,165,0,0.5)", background: "rgba(255,165,0,0.06)" }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffa500", fontSize: "0.78rem", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              ⚡ CEO OVERRIDE
              <span style={{ padding: "2px 8px", background: "rgba(255,165,0,0.15)", border: "1px solid rgba(255,165,0,0.4)", borderRadius: 6, fontSize: "0.55rem" }}>MODO DIOS</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <button onClick={() => handleCeoForce("p1")} disabled={ceoForcing || match.status === "FINISHED"}
                style={{ padding: "10px", background: "rgba(255,215,0,0.1)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.4)", borderRadius: 10, fontFamily: "'Orbitron',sans-serif", fontSize: "0.68rem", fontWeight: 700, cursor: "pointer", opacity: (ceoForcing || match.status === "FINISHED") ? 0.5 : 1 }}>
                🏆 GANAR {match.p1_username || "P1"}
              </button>
              <button onClick={() => handleCeoForce("p2")} disabled={ceoForcing || match.status === "FINISHED"}
                style={{ padding: "10px", background: "rgba(0,158,227,0.1)", color: "#009ee3", border: "1px solid rgba(0,158,227,0.4)", borderRadius: 10, fontFamily: "'Orbitron',sans-serif", fontSize: "0.68rem", fontWeight: 700, cursor: "pointer", opacity: (ceoForcing || match.status === "FINISHED") ? 0.5 : 1 }}>
                🏆 GANAR {match.p2_username || "P2"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: "0.68rem", color: "#8b949e" }}>
              <div style={{ background: "#0b0e14", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ color: "#555", fontSize: "0.57rem", marginBottom: 2 }}>MATCH ID</div>
                <div style={{ fontFamily: "monospace", color: "#ffd700", fontSize: "0.65rem", wordBreak: "break-all" }}>{matchId}</div>
              </div>
              <div style={{ background: "#0b0e14", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ color: "#555", fontSize: "0.57rem", marginBottom: 2 }}>TORNEO</div>
                <div style={{ fontFamily: "monospace", color: "#009ee3", fontSize: "0.65rem" }}>{match.tournamentId?.slice(-8) || "—"}</div>
              </div>
              <div style={{ background: "#0b0e14", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ color: "#555", fontSize: "0.57rem", marginBottom: 2 }}>ESTADO</div>
                <div style={{ color: "#00ff88", fontSize: "0.65rem", fontWeight: 700 }}>{match.status}</div>
              </div>
            </div>
            {ceoForcing && <div style={{ textAlign: "center", color: "#ffa500", fontSize: "0.72rem", marginTop: 8, animation: "pulse 1s infinite" }}>⚡ Procesando override...</div>}
          </div>
        )}

        {/* ── BRACKETS PANEL ── */}
        {showBrackets && brackets.length > 0 && (
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,rgba(255,215,0,0.12),rgba(255,215,0,0.04))", borderBottom: "1px solid rgba(255,215,0,0.2)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "0.78rem", fontWeight: 700 }}>🏆 BRACKETS EN VIVO</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff88", animation: "pulse 2s infinite", boxShadow: "0 0 6px #00ff88" }} />
                <span style={{ color: "#00ff88", fontSize: "0.6rem", fontFamily: "'Orbitron',sans-serif" }}>LIVE</span>
              </div>
            </div>
            <div style={{ padding: "12px 14px" }}>
              <BracketView brackets={brackets} currentMatchId={matchId} myUid={uid ?? ""} />
            </div>
          </div>
        )}

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

            {/* ID del rival con cuadro destacado */}
            {rivalEaId && (
              <div style={{ marginTop: 14 }}>
                <div style={{ background: "#0b0e14", border: `2px solid ${isEfootball ? "rgba(0,200,150,0.5)" : "rgba(0,158,227,0.5)"}`, borderRadius: 12, padding: "12px 16px", marginBottom: 10, textAlign: "center" }}>
                  <div style={{ color: "#8b949e", fontSize: "0.6rem", fontFamily: "'Orbitron',sans-serif", marginBottom: 6 }}>{isEfootball ? "⚽ KONAMI ID DEL RIVAL" : "🎮 EA ID DEL RIVAL"}</div>
                  <div style={{ fontFamily: "monospace", color: isEfootball ? "#00c896" : "#009ee3", fontSize: "1.1rem", fontWeight: 700, letterSpacing: 2, wordBreak: "break-all" as const }}>{rivalEaId}</div>
                </div>
                <button onClick={() => copyId(rivalEaId)}
                  style={{ ...btnStyle(isEfootball ? "rgba(0,200,150,0.15)" : "rgba(0,158,227,0.15)", isEfootball ? "#00c896" : "#009ee3"), border: `1px solid ${isEfootball ? "rgba(0,200,150,0.3)" : "rgba(0,158,227,0.3)"}`, fontSize: "0.75rem" }}>
                  {copied ? "✅ ¡Copiado!" : `📋 COPIAR ${idLabel.toUpperCase()} DEL RIVAL`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── CHECK-IN OBLIGATORIO ── */}
        {match.status === "WAITING" && isPlayer && !isCeo && !bothReady && (
          <div style={{ ...card, borderColor: myReady ? "rgba(0,255,136,0.4)" : "rgba(255,215,0,0.4)", background: myReady ? "rgba(0,255,136,0.04)" : "rgba(255,215,0,0.04)" }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: myReady ? "#00ff88" : "#ffd700", fontSize: "0.82rem", fontWeight: 700, marginBottom: 10 }}>
              {myReady ? "\u2705 TU CHECK-IN REGISTRADO" : "⏰ CHECK-IN OBLIGATORIO"}
            </div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", margin: "0 0 14px", lineHeight: 1.5 }}>
              {myReady
                ? "Ya confirmaste tu presencia. Esperando que tu rival haga check-in para empezar el partido."
                : "Confirmá tu presencia para habilitar el reporte de resultados. Sin check-in de ambos jugadores el partido no puede iniciarse."}
            </p>
            {/* Estado de ambos jugadores */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <div style={{ background: "#0b0e14", borderRadius: 10, padding: "10px 12px", border: `1px solid ${match.p1_ready ? "rgba(0,255,136,0.4)" : "rgba(255,215,0,0.2)"}` }}>
                <div style={{ fontSize: "0.6rem", color: "#8b949e", fontFamily: "'Orbitron',sans-serif", marginBottom: 4 }}>JUGADOR 1</div>
                <div style={{ fontWeight: 700, fontSize: "0.78rem", wordBreak: "break-word" as const, marginBottom: 4 }}>{match.p1_username ?? "P1"}</div>
                <div style={{ fontSize: "0.72rem", color: match.p1_ready ? "#00ff88" : "#ff4757", fontWeight: 700 }}>
                  {match.p1_ready ? "✅ LISTO" : "❌ PENDIENTE"}
                </div>
              </div>
              <div style={{ background: "#0b0e14", borderRadius: 10, padding: "10px 12px", border: `1px solid ${match.p2_ready ? "rgba(0,255,136,0.4)" : "rgba(255,215,0,0.2)"}` }}>
                <div style={{ fontSize: "0.6rem", color: "#8b949e", fontFamily: "'Orbitron',sans-serif", marginBottom: 4 }}>JUGADOR 2</div>
                <div style={{ fontWeight: 700, fontSize: "0.78rem", wordBreak: "break-word" as const, marginBottom: 4 }}>{match.p2_username ?? "P2"}</div>
                <div style={{ fontSize: "0.72rem", color: match.p2_ready ? "#00ff88" : "#ff4757", fontWeight: 700 }}>
                  {match.p2_ready ? "✅ LISTO" : "❌ PENDIENTE"}
                </div>
              </div>
            </div>
            {!myReady && (
              <button onClick={handleCheckin} disabled={checkingIn}
                style={{ width: "100%", padding: "14px", background: checkingIn ? "#30363d" : "#ffd700", color: checkingIn ? "#555" : "#0b0e14", border: "none", borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "0.88rem", cursor: checkingIn ? "not-allowed" : "pointer", transition: "0.2s", opacity: checkingIn ? 0.6 : 1 }}>
                {checkingIn ? "⏳ REGISTRANDO..." : "✔ CONFIRMAR PRESENCIA — ESTOY LISTO"}
              </button>
            )}
            {myReady && (
              <div style={{ textAlign: "center", padding: "12px", background: "rgba(0,255,136,0.07)", borderRadius: 10, border: "1px solid rgba(0,255,136,0.25)", color: "#00ff88", fontSize: "0.78rem", fontWeight: 700 }}>
                ⏳ Esperando check-in del rival...
              </div>
            )}
          </div>
        )}

        {/* ── REPORTAR RESULTADO ── */}
        {/* ── TIMER 10 MIN PARA JUGAR ── */}
        {match.status === "WAITING" && bothReady && isPlayer && !isCeo && (
          <div style={{ ...card, borderColor: playTimeLeft > 120 ? "rgba(0,255,136,0.5)" : playTimeLeft > 0 ? "rgba(255,71,87,0.5)" : "rgba(139,148,158,0.3)", background: playTimeLeft > 120 ? "rgba(0,255,136,0.04)" : playTimeLeft > 0 ? "rgba(255,71,87,0.05)" : "#161b22" }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: playTimeLeft > 120 ? "#00ff88" : "#ff4757", fontSize: "0.82rem", fontWeight: 700, marginBottom: 6, textAlign: "center" }}>
              {playTimeLeft > 0 ? "⏱️ TIEMPO PARA JUGAR" : "⌛ TIEMPO VENCIDO"}
            </div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "clamp(2rem,7vw,3rem)", fontWeight: 900, color: playTimeLeft > 120 ? "#00ff88" : "#ff4757", textAlign: "center", marginBottom: 6, animation: playTimeLeft <= 60 && playTimeLeft > 0 ? "pulse 1s infinite" : "none" }}>
              {playTimeLeft > 0
                ? `${Math.floor(playTimeLeft / 60).toString().padStart(2, "0")}:${(playTimeLeft % 60).toString().padStart(2, "0")}`
                : "00:00"}
            </div>
            <p style={{ color: "#8b949e", fontSize: "0.72rem", textAlign: "center", margin: 0 }}>
              {playTimeLeft > 0
                ? "¡Ambos confirmaron! Tenés 10 minutos para conectarte y jugar el partido."
                : "Se acabó el tiempo. Subí la foto del resultado o el BOT puede descalificar a quien no reportó."}
            </p>
          </div>
        )}

        {canReport && (
          <div style={card}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "0.82rem", fontWeight: 700, marginBottom: 8 }}>📸 REPORTAR RESULTADO</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginBottom: 14, lineHeight: 1.5 }}>
              Solo el <strong style={{ color: "white" }}>ganador</strong> sube la foto del marcador final.<br />
              El BOT LFA verifica automáticamente con Vision AI.<br />
              <span style={{ color: "#f3ba2f" }}>⚠️ Subir una foto falsa implica sanción de Fair Play.</span>
            </p>
            {uploading || botChecking ? (
              <div style={{ ...btnStyle("#30363d", "#555"), display: "flex", alignItems: "center", justifyContent: "center", gap: 8, animation: botChecking ? "pulse 1.5s infinite" : "none", borderRadius: 12, padding: 14, fontSize: "0.82rem", fontFamily: "'Orbitron',sans-serif", fontWeight: 900 }}>
                {uploading ? "⬆️ Subiendo..." : "🤖 BOT verificando..."}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ ...btnStyle("#ffd700", "#0b0e14"), display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", borderRadius: 12, padding: 14, fontSize: "0.78rem", fontFamily: "'Orbitron',sans-serif", fontWeight: 900 }}>
                  📷 TOMAR FOTO
                  <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleUploadResult} />
                </label>
                <label style={{ ...btnStyle("rgba(255,215,0,0.12)", "#ffd700"), border: "1px solid rgba(255,215,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", borderRadius: 12, padding: 14, fontSize: "0.78rem", fontFamily: "'Orbitron',sans-serif", fontWeight: 900 }}>
                  🖼️ ELEGIR IMAGEN
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUploadResult} />
                </label>
              </div>
            )}
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
          <div style={{ ...card, borderColor: "rgba(145,70,255,0.6)", background: "linear-gradient(135deg,rgba(145,70,255,0.08),rgba(255,71,87,0.04))", textAlign: "center" }}>
            <div style={{ fontSize: "2.4rem", marginBottom: 6 }}>⚖️</div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#9146FF", fontSize: "0.9rem", fontWeight: 900, marginBottom: 6 }}>🚨 DISPUTA ACTIVA</div>
            <div style={{ display: "inline-block", padding: "4px 14px", background: "rgba(255,71,87,0.12)", border: "1px solid rgba(255,71,87,0.4)", borderRadius: 99, fontSize: "0.62rem", color: "#ff4757", fontFamily: "'Orbitron',sans-serif", fontWeight: 700, marginBottom: 12 }}>SALA CONGELADA — STAFF REVISANDO</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginBottom: 16, lineHeight: 1.6 }}>
              Un administrador está revisando el caso.<br />
              <span style={{ color: "#f3ba2f" }}>⚠️ Se aplicarán sanciones Fair Play según el veredicto.</span><br />
              <span style={{ color: "#8b949e" }}>La sala permanece congelada hasta la resolución del Staff.</span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <a href="/tickets" 
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: "linear-gradient(135deg,#9146FF,#6c3fc5)", color: "white", border: "none", borderRadius: 12, textDecoration: "none", fontFamily: "'Orbitron',sans-serif", fontSize: "0.8rem", fontWeight: 900, boxShadow: "0 0 20px rgba(145,70,255,0.3)", letterSpacing: 1 }}>
                🎫 ABRIR TICKET
              </a>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(88,101,242,0.1)", color: "#5865F2", border: "1px solid rgba(88,101,242,0.3)", borderRadius: 10, textDecoration: "none", fontSize: "0.7rem", fontWeight: 700 }}>
                💬 Discord Staff
              </a>
            </div>
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
