"use client";

import { useEffect, useState } from "react";
import { useRouter }           from "next/navigation";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
import { db }                  from "@/lib/firebase";

interface TorneoActivo {
  id: string;
  game?: string;
  mode?: string;
  status: string;
  players: string[];
  capacity: number;
  entry_fee: number;
  region?: string;
  matchId?: string;
}

interface MatchActivo {
  id: string;
  status: string;
  p1_username?: string;
  p2_username?: string;
  score?: string;
  round?: string;
}

const GAME_LABEL: Record<string, string> = { FC26: "⚽ FC 26", EFOOTBALL: "🏅 eFootball" };
const MODE_LABEL: Record<string, string> = {
  GENERAL_95: "95 General", ULTIMATE: "Ultimate Team",
  DREAM_TEAM: "Dream Team", GENUINOS:  "Genuinos",
};
const STATUS_INFO: Record<string, { color: string; text: string }> = {
  OPEN:            { color: "#00ff88", text: "⏳ Esperando jugadores" },
  ACTIVE:          { color: "#ffd700", text: "🎮 En curso" },
  WAITING:         { color: "#00ff88", text: "⏳ Esperando rival" },
  PENDING_RESULT:  { color: "#ffd700", text: "🕐 Resultado pendiente" },
  DISPUTE:         { color: "#ff4757", text: "⚠️ En disputa" },
  FINISHED:        { color: "#8b949e", text: "✅ Finalizado" },
};

export default function MiSalaActiva({ uid }: { uid: string }) {
  const router = useRouter();
  const [torneo,  setTorneo]  = useState<TorneoActivo | null>(null);
  const [match,   setMatch]   = useState<MatchActivo  | null>(null);
  const [loading, setLoading] = useState(true);

  /* Buscar torneo activo del usuario */
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "tournaments"),
      where("players", "array-contains", uid),
      where("status", "in", ["OPEN", "ACTIVE"]),
      limit(1),
    );
    const unsub = onSnapshot(q, snap => {
      setTorneo(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as TorneoActivo);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  /* Buscar match activo del usuario */
  useEffect(() => {
    if (!uid) return;
    // Buscar donde es p1
    const q1 = query(
      collection(db, "matches"),
      where("p1", "==", uid),
      where("status", "in", ["WAITING", "PENDING_RESULT", "DISPUTE"]),
      limit(1),
    );
    const unsub1 = onSnapshot(q1, snap => {
      if (!snap.empty) {
        setMatch({ id: snap.docs[0].id, ...snap.docs[0].data() } as MatchActivo);
      }
    });
    // Buscar donde es p2
    const q2 = query(
      collection(db, "matches"),
      where("p2", "==", uid),
      where("status", "in", ["WAITING", "PENDING_RESULT", "DISPUTE"]),
      limit(1),
    );
    const unsub2 = onSnapshot(q2, snap => {
      if (!snap.empty) {
        setMatch({ id: snap.docs[0].id, ...snap.docs[0].data() } as MatchActivo);
      }
    });
    return () => { unsub1(); unsub2(); };
  }, [uid]);

  if (loading || (!torneo && !match)) return null;

  /* Si hay match activo → mostrar sala del match */
  if (match) {
    const st = STATUS_INFO[match.status] ?? { color: "#8b949e", text: match.status };
    return (
      <div
        onClick={() => router.push(`/match/${match.id}`)}
        style={{
          margin: "0 0 0 0",
          background: "linear-gradient(135deg, rgba(255,215,0,0.08), rgba(0,0,0,0))",
          border: "1px solid rgba(255,215,0,0.35)",
          borderRadius: 0,
          padding: "12px 20px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          transition: "0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "linear-gradient(135deg,rgba(255,215,0,0.14),rgba(0,0,0,0))")}
        onMouseLeave={e => (e.currentTarget.style.background = "linear-gradient(135deg,rgba(255,215,0,0.08),rgba(0,0,0,0))")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Pulso */}
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: st.color, display: "inline-block", boxShadow: `0 0 8px ${st.color}`, animation: "pulse 1.4s ease infinite", flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "0.78rem", color: "#ffd700" }}>
              ⚔️ TU MATCH ACTIVO
            </div>
            <div style={{ fontSize: "0.72rem", color: "#c9d1d9", marginTop: 2 }}>
              {match.p1_username && match.p2_username
                ? `${match.p1_username} vs ${match.p2_username}`
                : `Ronda ${match.round ?? "—"}`
              }
              {match.score && match.score !== "Pendiente validación" && (
                <span style={{ marginLeft: 8, color: "#ffd700", fontWeight: 700 }}>{match.score}</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: "0.68rem", color: st.color, fontWeight: 700 }}>{st.text}</span>
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.68rem", fontWeight: 900, background: "#ffd700", color: "#000", padding: "5px 14px", borderRadius: 20 }}>
            IR A LA SALA →
          </span>
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </div>
    );
  }

  /* Si hay torneo abierto (esperando que llene) */
  const st = STATUS_INFO[torneo!.status] ?? { color: "#8b949e", text: torneo!.status };
  const spotsLeft = torneo!.capacity - torneo!.players.length;
  return (
    <div
      onClick={() => router.push(`/match/${torneo!.id}`)}
      style={{
        background: "linear-gradient(135deg, rgba(0,255,136,0.06), rgba(0,0,0,0))",
        border: "1px solid rgba(0,255,136,0.3)",
        borderRadius: 0,
        padding: "12px 20px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        transition: "0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "linear-gradient(135deg,rgba(0,255,136,0.12),rgba(0,0,0,0))")}
      onMouseLeave={e => (e.currentTarget.style.background = "linear-gradient(135deg,rgba(0,255,136,0.06),rgba(0,0,0,0))")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: st.color, display: "inline-block", boxShadow: `0 0 8px ${st.color}`, animation: "pulse 1.4s ease infinite", flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "0.78rem", color: "#00ff88" }}>
            🎮 ESTÁS EN UNA SALA
          </div>
          <div style={{ fontSize: "0.72rem", color: "#c9d1d9", marginTop: 2 }}>
            {GAME_LABEL[torneo!.game ?? ""] ?? torneo!.game}
            {torneo!.mode ? ` · ${MODE_LABEL[torneo!.mode] ?? torneo!.mode}` : ""}
            <span style={{ marginLeft: 8, color: "#8b949e" }}>
              {torneo!.players.length}/{torneo!.capacity} jugadores · {spotsLeft} lugar{spotsLeft !== 1 ? "es" : ""} libre{spotsLeft !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: "0.68rem", color: st.color, fontWeight: 700 }}>{st.text}</span>
        <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.68rem", fontWeight: 900, background: "#00ff88", color: "#000", padding: "5px 14px", borderRadius: 20 }}>
          VER SALA →
        </span>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
