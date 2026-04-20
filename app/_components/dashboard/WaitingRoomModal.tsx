"use client";

import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot }                  from "firebase/firestore";
import { db, auth }                         from "@/lib/firebase";

interface Props { tournamentId: string; onLeft: () => void; }

export default function WaitingRoomModal({ tournamentId, onLeft }: Props) {
  const [show,        setShow]        = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isUrgent,    setIsUrgent]    = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "tournaments", tournamentId), (snap) => {
      if (!snap.exists()) return;
      const t = snap.data();
      if (t.waiting_alert_sent && t.status === "OPEN" && t.waiting_expires_at) {
        setShow(true);
        const secs = Math.max(0, Math.floor((t.waiting_expires_at.toMillis() - Date.now()) / 1000));
        setSecondsLeft(secs);
      } else {
        setShow(false);
      }
    });
    return () => unsub();
  }, [tournamentId]);

  useEffect(() => {
    if (!show || secondsLeft <= 0) return;
    const iv = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 30) setIsUrgent(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [show, secondsLeft]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const callApi = async (endpoint: string) => {
    const token = await auth.currentUser!.getIdToken();
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tournamentId }),
    });
  };

  const handleExtend = useCallback(async () => {
    setIsLoading(true);
    try { await callApi("/api/extendWaiting"); setIsUrgent(false); }
    finally { setIsLoading(false); }
  }, [tournamentId]);

  const handleLeave = useCallback(async () => {
    setIsLoading(true);
    try { await callApi("/api/leaveAndRefund"); setShow(false); onLeft(); }
    finally { setIsLoading(false); }
  }, [tournamentId, onLeft]);

  if (!show) return null;

  const accentColor = isUrgent ? "#ff4757" : "#ffd700";
  const accentBg    = isUrgent ? "rgba(255,71,87,0.08)" : "rgba(255,215,0,0.07)";
  const accentBorder= isUrgent ? "rgba(255,71,87,0.35)" : "rgba(255,215,0,0.3)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(7,9,13,0.85)", backdropFilter: "blur(8px)" }}>

      {/* Glow de fondo */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(ellipse 60% 40% at 50% 50%, ${accentColor}12, transparent 70%)`,
      }} />

      <div className="relative rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        style={{
          background:   "#111318",
          border:       `1px solid ${accentBorder}`,
          boxShadow:    `0 0 40px ${accentColor}20`,
        }}>

        {/* Top accent line */}
        <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />

        <div className="p-6">

          {/* Icon + título */}
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3"
              style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
              <span className="text-3xl">{isUrgent ? "⚠️" : "⏳"}</span>
            </div>
            <h2 className="text-lg font-black text-white tracking-tight">
              {isUrgent ? "¡Última oportunidad!" : "Esperando jugadores"}
            </h2>
            <p className="text-xs mt-1" style={{ color: "#8b949e" }}>
              {isUrgent ? "¿Extendés o recuperás tus Coins?" : "La sala aún no se llenó — ¿qué hacés?"}
            </p>
          </div>

          {/* Countdown */}
          <div className="rounded-xl py-5 mb-5 text-center" style={{ background: "#0b0e14", border: `1px solid ${accentBorder}` }}>
            <p className="text-[10px] uppercase tracking-[3px] mb-2" style={{ color: "#6e7681" }}>Tiempo restante</p>
            <p className="text-5xl font-mono font-black" style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}50` }}>
              {fmt(secondsLeft)}
            </p>
          </div>

          {/* Botones */}
          <div className="flex flex-col gap-2.5">
            <button onClick={handleExtend} disabled={isLoading}
              className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-40"
              style={{ background: "#ffd700", color: "#0b0e14" }}>
              ⏰ Esperar 5 minutos más
            </button>
            <button onClick={handleLeave} disabled={isLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40 border"
              style={{ background: "#161b22", borderColor: "#30363d", color: "#8b949e" }}>
              💰 Salir y recuperar mis Coins
            </button>
          </div>

          <p className="text-[10px] text-center mt-4" style={{ color: "#30363d" }}>
            Sin acción → la sala se cancela y todos son reembolsados
          </p>
        </div>
      </div>
    </div>
  );
}
