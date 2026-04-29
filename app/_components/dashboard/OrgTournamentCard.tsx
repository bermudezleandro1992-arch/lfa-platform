"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { Tournament } from "@/hooks/useTournaments";

const TIER_STYLES: Record<string, { dot: string; border: string; badgeText: string; btnBg: string; btnText: string }> = {
  FREE:        { dot: "#00d4ff", border: "rgba(0,212,255,0.3)",  badgeText: "#00d4ff", btnBg: "#00d4ff", btnText: "#0b0e14" },
  RECREATIVO:  { dot: "#00ff88", border: "rgba(0,255,136,0.3)",  badgeText: "#00ff88", btnBg: "#00ff88", btnText: "#0b0e14" },
  COMPETITIVO: { dot: "#ffd700", border: "rgba(255,215,0,0.3)",  badgeText: "#ffd700", btnBg: "#ffd700", btnText: "#0b0e14" },
  ELITE:       { dot: "#ff4757", border: "rgba(255,71,87,0.3)",  badgeText: "#ff4757", btnBg: "#ff4757", btnText: "#ffffff" },
};

interface Props { tournament: Tournament; }

export default function OrgTournamentCard({ tournament: t }: Props) {
  const router = useRouter();
  const [uid,     setUid]     = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [msg,     setMsg]     = useState("");

  const ts     = TIER_STYLES[t.tier] ?? TIER_STYLES.RECREATIVO;
  const filled = t.players.length;
  const pct    = Math.round((filled / t.capacity) * 100);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  const join = useCallback(async () => {
    if (!uid) return;
    setJoining(true);
    setMsg("");
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch("/api/joinTournament", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ tournamentId: t.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al unirse");
      router.push(`/match/${t.id}`);
    } catch (e) {
      setMsg((e as Error).message);
      setJoining(false);
    }
  }, [uid, t.id, router]);

  const streaming = [
    t.organizador_twitch  && { label: "Twitch",  color: "#9146FF", icon: "💜", url: `https://twitch.tv/${t.organizador_twitch}` },
    t.organizador_kick    && { label: "Kick",    color: "#53FC18", icon: "🟢", url: `https://kick.com/${t.organizador_kick}` },
    t.organizador_youtube && { label: "YouTube", color: "#FF0000", icon: "▶️", url: `https://youtube.com/@${t.organizador_youtube}` },
  ].filter(Boolean) as { label: string; color: string; icon: string; url: string }[];

  const isJoined = uid ? t.players.includes(uid) : false;
  const isFull   = filled >= t.capacity;

  return (
    <div style={{
      background:   "#111318",
      border:       `1px solid ${ts.border}`,
      borderRadius: 16,
      overflow:     "hidden",
      boxShadow:    "0 2px 20px rgba(0,0,0,0.4)",
    }}>
      {/* Organizer header */}
      <div style={{
        background:   "rgba(163,113,247,0.06)",
        padding:      "11px 16px",
        borderBottom: `1px solid ${ts.border}`,
      }}>
        {/* Tournament name (if set) */}
        {t.nombre_torneo && (
          <div style={{
            fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "0.85rem",
            color: "#ffffff", marginBottom: 8, lineHeight: 1.2,
          }}>
            {t.nombre_torneo}
          </div>
        )}
        {/* Organizer row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {t.organizador_avatar ? (
            <img src={t.organizador_avatar} alt=""
              style={{ width: 30, height: 30, borderRadius: "50%", border: `2px solid #a371f7`, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 30, height: 30, borderRadius: "50%", background: "rgba(163,113,247,0.15)",
              border: `2px solid #a371f7`, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "0.9rem", flexShrink: 0,
            }}>🎙️</div>
          )}

          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: "0.65rem", color: "#6e7681" }}>Organizado por</div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "0.7rem", color: "#a371f7" }}>
              {t.organizador_nombre || "ORGANIZADOR"}
            </div>
          </div>

          {streaming.map(s => (
            <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
              style={{
                fontSize: "0.65rem", color: s.color, border: `1px solid ${s.color}40`,
                padding: "3px 8px", borderRadius: 6, textDecoration: "none", whiteSpace: "nowrap",
              }}>
              {s.icon} {s.label}
            </a>
          ))}
        </div>
      </div>

      {/* Tournament info */}
      <div style={{ padding: "14px 16px" }}>
        {/* Badges */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{
            fontSize: "0.6rem", fontWeight: 900, color: ts.badgeText,
            background: ts.dot + "15", border: `1px solid ${ts.dot}40`,
            padding: "2px 8px", borderRadius: 20, fontFamily: "'Orbitron',sans-serif",
          }}>
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: ts.dot, marginRight: 4, verticalAlign: "middle",
            }} />
            {t.tier}
          </span>
          <span style={{ fontSize: "0.6rem", color: "#8b949e", background: "#1c2028", padding: "2px 8px", borderRadius: 20 }}>
            {t.game}
          </span>
          <span style={{ fontSize: "0.6rem", color: "#8b949e", background: "#1c2028", padding: "2px 8px", borderRadius: 20 }}>
            {t.mode?.replace(/_/g, " ")}
          </span>
          <span style={{
            fontSize: "0.6rem", color: "#a371f7",
            background: "rgba(163,113,247,0.1)", border: "1px solid rgba(163,113,247,0.3)",
            padding: "2px 8px", borderRadius: 20,
          }}>
            🎙️ Organizado
          </span>
        </div>

        {t.descripcion && (
          <p style={{ fontSize: "0.72rem", color: "#8b949e", marginBottom: 10, lineHeight: 1.5 }}>
            {t.descripcion}
          </p>
        )}

        {/* Players bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: 4 }}>
            <span style={{ color: "#8b949e" }}>Jugadores</span>
            <span style={{ color: isFull ? "#ff4757" : "#c9d1d9", fontWeight: 700 }}>
              {filled}/{t.capacity}
            </span>
          </div>
          <div style={{ height: 4, background: "#1c2028", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: `linear-gradient(90deg,${ts.dot},${ts.dot}bb)`,
              borderRadius: 4, transition: "width 0.5s",
            }} />
          </div>
        </div>

        {/* Prize info */}
        <div style={{ marginBottom: 12 }}>
          {t.tipo_premio === "usd" ? (
            <div style={{
              fontSize: "0.72rem", color: "#00ff88",
              background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.2)",
              borderRadius: 8, padding: "8px 12px",
            }}>
              💵 Premio: ${t.premio_monto?.toLocaleString()} USD{t.premio_descripcion ? ` · ${t.premio_descripcion}` : ""}
            </div>
          ) : t.tipo_premio === "puntos" ? (
            <div style={{
              fontSize: "0.72rem", color: "#00d4ff",
              background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)",
              borderRadius: 8, padding: "8px 12px",
            }}>
              ⭐ Ganás puntos LFA para la tienda{t.premio_descripcion ? ` · ${t.premio_descripcion}` : ""}
            </div>
          ) : t.tipo_premio === "otro" ? (
            <div style={{
              fontSize: "0.72rem", color: "#ffd700",
              background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.2)",
              borderRadius: 8, padding: "8px 12px",
            }}>
              🏆 {t.premio_monto ? `${t.premio_monto.toLocaleString()} ${t.premio_moneda || ""}` : ""}{t.premio_descripcion ? ` · ${t.premio_descripcion}` : " · Premio del organizador"}
            </div>
          ) : t.premio_externo ? (
            <div style={{
              fontSize: "0.72rem", color: "#ffd700",
              background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.2)",
              borderRadius: 8, padding: "8px 12px",
            }}>
              🏆 {t.premio_descripcion || "Premio entregado por el organizador"}
            </div>
          ) : t.entry_fee === 0 ? (
            <div style={{
              fontSize: "0.72rem", color: "#00d4ff",
              background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)",
              borderRadius: 8, padding: "8px 12px",
            }}>
              🎁 Gratis · Sumás puntos LFA para la tienda
            </div>
          ) : (
            <div style={{
              fontSize: "0.72rem", color: ts.badgeText,
              background: ts.dot + "08", border: `1px solid ${ts.dot}30`,
              borderRadius: 8, padding: "8px 12px",
            }}>
              🪙 Inscripción: {t.entry_fee.toLocaleString()} · Pozo: {t.prize_pool.toLocaleString()} LFC
            </div>
          )}
        </div>

        {msg && (
          <p style={{ fontSize: "0.72rem", color: "#ff4757", marginBottom: 8 }}>❌ {msg}</p>
        )}

        <button
          onClick={join}
          disabled={joining || isJoined || isFull}
          style={{
            width:       "100%",
            padding:     "10px 16px",
            borderRadius: 10,
            border:      "none",
            background:  isJoined ? "#1c2028"
              : isFull   ? "#1c2028"
              : `linear-gradient(135deg,${ts.btnBg},${ts.dot}bb)`,
            color:       isJoined ? "#8b949e" : isFull ? "#6e7681" : ts.btnText,
            fontFamily:  "'Orbitron',sans-serif",
            fontWeight:  900,
            fontSize:    "0.72rem",
            cursor:      (isJoined || isFull) ? "default" : "pointer",
            opacity:     joining ? 0.7 : 1,
            transition:  "0.2s",
            letterSpacing: 1,
          }}>
          {joining    ? "⏳ ENTRANDO..."
            : isJoined ? "✅ YA INSCRIPTO"
            : isFull   ? "🔒 LLENO"
            :             "⚡ INSCRIBIRME"}
        </button>
      </div>
    </div>
  );
}
