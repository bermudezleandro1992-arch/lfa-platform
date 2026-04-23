"use client";

import { useEffect, useState, useCallback }    from "react";
import { doc, onSnapshot }                     from "firebase/firestore";
import { db, auth, storage }                   from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL }    from "firebase/storage";

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
  bot_verification?: BotVerification;
}

interface Props { matchId: string; }

export default function MatchRoom({ matchId }: Props) {
  const [match,         setMatch]         = useState<Match | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [uploading,     setUploading]     = useState(false);
  const [botChecking,   setBotChecking]   = useState(false);
  const [disputing,     setDisputing]     = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [message,       setMessage]       = useState("");
  const [timeLeft,      setTimeLeft]      = useState(0);
  const [copied,        setCopied]        = useState(false);

  const uid = auth.currentUser?.uid;

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

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

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

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('? Solo se aceptan im�genes JPEG, PNG o WebP.'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('? La imagen no puede superar 5 MB.'); return;
    }

    setUploading(true); setMessage("? Comprimiendo imagen...");
    try {
      // Redimensionar (max 900px, JPEG 75%)
      const resizedBlob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          const MAX_DIM = 900;
          const scale   = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
          const canvas  = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('Compress error')), 'image/jpeg', 0.75);
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Read error')); };
        img.src = objectUrl;
      });

      setMessage("?? Subiendo resultado...");
      const storageRef = ref(storage, `results/${match.tournamentId}/${matchId}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, resizedBlob, { contentType: 'image/jpeg' });
      const screenshotUrl = await getDownloadURL(storageRef);

      await callApi("/api/reportResult", { matchId, screenshotUrl });
      setMessage("?? Resultado subido. El BOT LFA est� verificando la imagen...");
      setUploading(false);

      // Llamar a Vision AI
      setBotChecking(true);
      try {
        const verif = await callApi("/api/verifyResult", { matchId, screenshotUrl });
        if (verif.verdict === "OK")
          setMessage(`? BOT verific� el resultado. Marcador: ${verif.scoreFound || "detectado"} (${Math.round((verif.confidence || 0) * 100)}% confianza). Tu rival tiene 5 minutos para disputar.`);
        else if (verif.verdict === "SUSPICIOUS")
          setMessage(`?? El BOT detect� irregularidades (${Math.round((verif.confidence || 0) * 100)}% confianza). El Staff revisar� el caso manualmente.`);
        else
          setMessage(`?? Revisi�n manual requerida. Confianza: ${Math.round((verif.confidence || 0) * 100)}%. El Staff validar� en breve.`);
      } catch {
        setMessage("? Resultado subido. Tu rival tiene 5 minutos para disputar.");
      } finally {
        setBotChecking(false);
      }
    } catch (err: unknown) {
      setMessage(`? ${err instanceof Error ? err.message : "Error al subir resultado"}`);
      setUploading(false);
    }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim()) { setMessage("? Escrib� el motivo de la disputa."); return; }
    setDisputing(true); setMessage("");
    try {
      await callApi("/api/disputeMatch", { matchId, reason: disputeReason });
      setMessage("?? Disputa enviada. El Staff revisar� el caso. El resultado queda suspendido hasta la resoluci�n.");
      setDisputeReason("");
    } catch (err: unknown) {
      setMessage(`? ${err instanceof Error ? err.message : "Error al disputar"}`);
    } finally {
      setDisputing(false);
    }
  };

  const copyEaId = (id: string) => {
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

  const isP1       = match.p1 === uid;
  const isP2       = match.p2 === uid;
  const isPlayer   = isP1 || isP2;
  const rivalEaId  = isP1 ? match.p2_ea_id : match.p1_ea_id;
  const canReport  = isPlayer && match.status === "WAITING";
  const canDispute = isPlayer && match.status === "PENDING_RESULT" && match.reported_by !== uid && timeLeft > 0;
  const bv         = match.bot_verification;
  const bvColor    = bv?.verdict === "OK" ? "#00ff88" : bv?.verdict === "SUSPICIOUS" ? "#ff4757" : "#f3ba2f";

  const roundLabels: Record<string, string> = {
    round_1: "?? Round 1", round_2: "?? Round 2", round_3: "?? Cuartos",
    round_4: "?? Semifinal", final: "?? FINAL",
  };
  const statusLabel: Record<string, string> = {
    WAITING: "? Esperando resultado", PENDING_RESULT: "?? Verificando resultado...",
    DISPUTE: "?? En disputa � Staff notificado", FINISHED: "? Finalizado",
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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* HEADER */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "clamp(1.1rem,4vw,1.5rem)", fontWeight: 900, margin: "0 0 4px" }}>?? SALA DE MATCH</h1>
          <p style={{ color: "#8b949e", fontSize: "0.78rem", margin: "4px 0" }}>{roundLabels[match.round] || match.round}</p>
          <span style={{ display: "inline-block", marginTop: 8, padding: "4px 14px", background: `${statusColor[match.status]}20`, color: statusColor[match.status], border: `1px solid ${statusColor[match.status]}50`, borderRadius: 99, fontSize: "0.72rem", fontWeight: 700, fontFamily: "'Orbitron',sans-serif" }}>
            {statusLabel[match.status] || match.status}
          </span>
        </div>

        {/* VS CARD */}
        <div style={{ ...card, background: "linear-gradient(135deg,#161b22,#0f1520)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
            {/* P1 */}
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "rgba(255,215,0,0.1)", border: "2px solid #ffd700", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", margin: "0 auto 8px" }}>
                {isP1 ? "??" : "??"}
              </div>
              <div style={{ fontWeight: 900, fontSize: "0.88rem", marginBottom: 4, wordBreak: "break-word" as const }}>{match.p1_username ?? "Jugador 1"}</div>
              {match.p1_ea_id && <div style={{ fontFamily: "monospace", color: "#ffd700", fontSize: "0.7rem", wordBreak: "break-all" as const }}>{match.p1_ea_id}</div>}
              {match.winner === match.p1 && <div style={{ color: "#00ff88", fontSize: "0.72rem", marginTop: 4, fontWeight: 700 }}>?? GANADOR</div>}
            </div>
            {/* Score */}
            <div style={{ textAlign: "center", minWidth: 70 }}>
              {match.score && match.status !== "WAITING"
                ? <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "clamp(1.3rem,5vw,2rem)", fontWeight: 900, color: "#ffd700" }}>{match.score}</div>
                : <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "1.4rem", fontWeight: 900, color: "#30363d" }}>VS</div>}
            </div>
            {/* P2 */}
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "rgba(0,158,227,0.1)", border: "2px solid #009ee3", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", margin: "0 auto 8px" }}>
                {isP2 ? "??" : "??"}
              </div>
              <div style={{ fontWeight: 900, fontSize: "0.88rem", marginBottom: 4, wordBreak: "break-word" as const }}>{match.p2_username ?? "Jugador 2"}</div>
              {match.p2_ea_id && <div style={{ fontFamily: "monospace", color: "#009ee3", fontSize: "0.7rem", wordBreak: "break-all" as const }}>{match.p2_ea_id}</div>}
              {match.winner === match.p2 && <div style={{ color: "#00ff88", fontSize: "0.72rem", marginTop: 4, fontWeight: 700 }}>?? GANADOR</div>}
            </div>
          </div>
        </div>

        {/* BOT VERIFICATION STATUS */}
        {bv && (
          <div style={{ ...card, borderColor: `${bvColor}50`, background: `${bvColor}08` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.3rem" }}>{bv.verdict === "OK" ? "?" : bv.verdict === "SUSPICIOUS" ? "??" : "??"}</span>
              <div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.72rem", color: bvColor, fontWeight: 700 }}>
                  BOT IA � {bv.verdict} � {Math.round((bv.confidence || 0) * 100)}% confianza
                </div>
                <div style={{ color: "#8b949e", fontSize: "0.68rem" }}>
                  {bv.game && `Juego: ${bv.game}`}{bv.scoreFound && ` � Marcador detectado: ${bv.scoreFound}`}
                </div>
              </div>
            </div>
            {bv.verdict === "SUSPICIOUS" && (
              <p style={{ color: "#ff4757", fontSize: "0.72rem", marginTop: 8, marginBottom: 0 }}>
                ?? El BOT detect� irregularidades. El Staff revisar� el caso. Se aplicar�n sanciones Fair Play si se confirma fraude.
              </p>
            )}
            {bv.verdict === "MANUAL" && (
              <p style={{ color: "#f3ba2f", fontSize: "0.72rem", marginTop: 8, marginBottom: 0 }}>
                ?? El BOT no pudo verificar con suficiente confianza. Un Staff revisar� la imagen. El resultado se confirma en breve.
              </p>
            )}
          </div>
        )}

        {/* SCREENSHOT P�BLICO */}
        {match.screenshot_url && match.status !== "WAITING" && (
          <div style={card}>
            <div style={{ color: "#8b949e", fontSize: "0.68rem", fontFamily: "'Orbitron',sans-serif", marginBottom: 8 }}>
              ?? SCREENSHOT � VISIBLE PARA TODOS
            </div>
            <img
              src={match.screenshot_url} alt="Screenshot resultado"
              onClick={() => window.open(match.screenshot_url, "_blank")}
              style={{ width: "100%", borderRadius: 12, border: "1px solid #30363d", display: "block", cursor: "pointer" }}
            />
            <div style={{ color: "#8b949e", fontSize: "0.68rem", marginTop: 6, textAlign: "center" }}>
              Subido por {match.reported_by === match.p1 ? (match.p1_username || "Jugador 1") : (match.p2_username || "Jugador 2")} � Toc� para ver en pantalla completa
            </div>
          </div>
        )}

        {/* INSTRUCCIONES EA ID */}
        {match.status === "WAITING" && isPlayer && rivalEaId && (
          <div style={{ ...card, borderColor: "rgba(0,158,227,0.3)", background: "rgba(0,158,227,0.05)" }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#009ee3", fontSize: "0.78rem", fontWeight: 700, marginBottom: 12 }}>?? C�MO CONECTARTE CON TU RIVAL</div>
            {[
              "Abr� el juego (FC26 o eFootball)",
              "And� a Amigos ? Buscar jugador",
              `Busc� el ID de tu rival: ${rivalEaId}`,
              "Invitalo a un partido amistoso",
              "Jug� el partido completo",
              "El GANADOR sube la foto del marcador",
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #1c2028", alignItems: "flex-start" }}>
                <span style={{ color: "#009ee3", fontWeight: 900, fontSize: "0.78rem", width: 20, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ color: "#ccc", fontSize: "0.78rem" }}>{t}</span>
              </div>
            ))}
            <button onClick={() => copyEaId(rivalEaId)} style={{ ...btnStyle("rgba(0,158,227,0.1)", "#009ee3"), marginTop: 14, border: "1px solid rgba(0,158,227,0.3)", fontSize: "0.75rem" }}>
              {copied ? "? �Copiado!" : "?? COPIAR ID DEL RIVAL"}
            </button>
          </div>
        )}

        {/* SUBIR RESULTADO */}
        {canReport && (
          <div style={card}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "0.82rem", fontWeight: 700, marginBottom: 8 }}>?? REPORTAR RESULTADO</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginBottom: 14, lineHeight: 1.5 }}>
              Solo el <strong style={{ color: "white" }}>ganador</strong> sube la foto del marcador final.<br />
              El BOT LFA verifica autom�ticamente con Vision AI.<br />
              <span style={{ color: "#f3ba2f" }}>?? Subir una foto falsa implica sanci�n de Fair Play.</span>
            </p>
            <label style={{ ...btnStyle(uploading || botChecking ? "#30363d" : "#ffd700", uploading || botChecking ? "#555" : "#0b0e14"), display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: uploading || botChecking ? "not-allowed" : "pointer", animation: botChecking ? "pulse 1.5s infinite" : "none" }}>
              {uploading ? "? Subiendo..." : botChecking ? "?? BOT verificando..." : "?? SUBIR FOTO DEL RESULTADO"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUploadResult} disabled={uploading || botChecking} />
            </label>
            <p style={{ color: "#8b949e", fontSize: "0.65rem", marginTop: 8, textAlign: "center" }}>JPG, PNG o WebP � M�x 5MB � Mostr� el marcador final completo</p>
          </div>
        )}

        {/* DISPUTA */}
        {canDispute && (
          <div style={{ ...card, borderColor: "rgba(255,71,87,0.4)", background: "rgba(255,71,87,0.05)" }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ff4757", fontSize: "0.82rem", fontWeight: 700, marginBottom: 8 }}>?? TU RIVAL REPORT� VICTORIA</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginBottom: 14 }}>
              Si el resultado es incorrecto ten�s <strong style={{ color: "#ffd700" }}>5 minutos</strong> para disputarlo.
              Si no lo disput�s, el resultado se confirma autom�ticamente.
            </p>
            {/* Countdown */}
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ color: "#8b949e", fontSize: "0.65rem", marginBottom: 4, fontFamily: "'Orbitron',sans-serif" }}>TIEMPO PARA DISPUTAR</div>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "clamp(1.8rem,6vw,2.4rem)", fontWeight: 900, color: timeLeft <= 60 ? "#ff4757" : "#f3ba2f", animation: timeLeft <= 60 ? "pulse 1s infinite" : "none" }}>
                {`${Math.floor(timeLeft / 60).toString().padStart(2, "0")}:${(timeLeft % 60).toString().padStart(2, "0")}`}
              </div>
            </div>
            <div style={{ background: "#0b0e14", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: "0.8rem" }}>
              <span style={{ color: "#8b949e" }}>Marcador reportado: </span>
              <strong style={{ color: "#ffd700" }}>{match.score || "Pendiente"}</strong>
            </div>
            <textarea
              value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
              placeholder="Explic� detalladamente por qu� el resultado es incorrecto..."
              style={{ width: "100%", background: "#0b0e14", border: "1px solid #30363d", color: "white", borderRadius: 10, padding: "11px 14px", fontSize: "0.8rem", resize: "none", height: 88, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
            />
            <p style={{ color: "#f3ba2f", fontSize: "0.68rem", marginBottom: 10 }}>
              ?? Las disputas sin fundamento descuentan puntos de Fair Play.
            </p>
            <button onClick={handleDispute} disabled={disputing} style={{ ...btnStyle("#ff4757"), opacity: disputing ? 0.6 : 1 }}>
              {disputing ? "? ENVIANDO..." : "?? DISPUTAR RESULTADO"}
            </button>
          </div>
        )}

        {/* TIEMPO VENCIDO (rival, sin disputa) */}
        {match.status === "PENDING_RESULT" && isPlayer && match.reported_by !== uid && timeLeft === 0 && (
          <div style={{ ...card, borderColor: "rgba(0,255,136,0.3)", background: "rgba(0,255,136,0.05)", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>?</div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#00ff88", fontSize: "0.82rem", fontWeight: 700 }}>Tiempo de disputa vencido</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginTop: 8 }}>
              El resultado se confirmar� autom�ticamente en el pr�ximo ciclo del BOT.
            </p>
          </div>
        )}

        {/* DISPUTA ACTIVA */}
        {match.status === "DISPUTE" && (
          <div style={{ ...card, borderColor: "rgba(145,70,255,0.4)", background: "rgba(145,70,255,0.05)", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>??</div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#9146FF", fontSize: "0.82rem", fontWeight: 700 }}>DISPUTA ACTIVA</div>
            <p style={{ color: "#8b949e", fontSize: "0.78rem", marginTop: 8 }}>
              Un administrador est� revisando el caso.<br />
              <span style={{ color: "#f3ba2f" }}>?? Se aplicar�n sanciones Fair Play seg�n el veredicto.</span>
            </p>
          </div>
        )}

        {/* FINALIZADO */}
        {match.status === "FINISHED" && (
          <div style={{ ...card, background: "linear-gradient(135deg,rgba(0,255,136,0.05),rgba(255,215,0,0.03))", borderColor: "rgba(0,255,136,0.3)", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>??</div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: "#ffd700", fontSize: "1rem", fontWeight: 900, marginBottom: 8 }}>PARTIDO FINALIZADO</div>
            <div style={{ color: "#00ff88", fontWeight: 700, fontSize: "0.9rem", marginBottom: 12 }}>
              Ganador: {match.winner === match.p1 ? (match.p1_username || "Jugador 1") : (match.p2_username || "Jugador 2")}
            </div>
            <p style={{ color: "#8b949e", fontSize: "0.75rem" }}>
              El BOT LFA generar� el pr�ximo match autom�ticamente. �Suerte en la siguiente ronda!
            </p>
          </div>
        )}

        {/* MENSAJE FEEDBACK */}
        {message && (
          <div style={{
            padding: "12px 16px", borderRadius: 12, textAlign: "center", fontSize: "0.8rem", lineHeight: 1.5,
            background: message.startsWith("?") || message.startsWith("??") || message.startsWith("??") ? "rgba(0,255,136,0.08)" : message.startsWith("?") ? "rgba(255,71,87,0.08)" : "rgba(243,186,47,0.08)",
            border: `1px solid ${message.startsWith("?") || message.startsWith("??") || message.startsWith("??") ? "rgba(0,255,136,0.3)" : message.startsWith("?") ? "rgba(255,71,87,0.3)" : "rgba(243,186,47,0.3)"}`,
            color: message.startsWith("?") || message.startsWith("??") || message.startsWith("??") ? "#00ff88" : message.startsWith("?") ? "#ff4757" : "#f3ba2f",
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
