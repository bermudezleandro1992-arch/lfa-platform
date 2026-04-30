"use client";

import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot }                  from "firebase/firestore";
import { db, auth }                         from "@/lib/firebase";

const FREE_ALERT_MINUTES = 8;   // mostrar alerta a los 8 min (quedan ~2 min)
const FREE_TOTAL_MINUTES = 10;  // la sala se cierra a los 10 min

interface Props { tournamentId: string; onLeft: () => void; }

export default function WaitingRoomModal({ tournamentId, onLeft }: Props) {
  const [show,        setShow]        = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isUrgent,    setIsUrgent]    = useState(false);
  const [isFree,      setIsFree]      = useState(false);
  const [entryFee,    setEntryFee]    = useState(0);
  // freeCloseAt: timestamp en ms cuando se cierra la sala gratis
  const [freeCloseAt, setFreeCloseAt] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "tournaments", tournamentId), (snap) => {
      if (!snap.exists()) return;
      const t = snap.data();
      const fee    = t.entry_fee ?? 0;
      const free   = fee === 0;
      setIsFree(free);
      setEntryFee(fee);

      if (free) {
        // Sala GRATIS: mostramos alerta cuando quedan ~2 min para el cierre automático
        const createdMs = t.created_at?.toMillis?.() ?? 0;
        if (createdMs > 0 && t.status === "OPEN") {
          const closeAt  = createdMs + FREE_TOTAL_MINUTES * 60 * 1000;
          const alertAt  = createdMs + FREE_ALERT_MINUTES * 60 * 1000;
          const now      = Date.now();
          if (now >= alertAt && now < closeAt) {
            setFreeCloseAt(closeAt);
            const secs = Math.max(0, Math.floor((closeAt - now) / 1000));
            setSecondsLeft(secs);
            setShow(true);
            return;
          }
        }
        setShow(false);
      } else {
        // Sala PAGA: lógica existente (bot activa waiting_alert_sent)
        if (t.waiting_alert_sent && t.status === "OPEN" && t.waiting_expires_at) {
          setShow(true);
          const secs = Math.max(0, Math.floor((t.waiting_expires_at.toMillis() - Date.now()) / 1000));
          setSecondsLeft(secs);
        } else {
          setShow(false);
        }
      }
    });
    return () => unsub();
  }, [tournamentId]);

  // Countdown ticker
  useEffect(() => {
    if (!show || secondsLeft <= 0) return;
    const iv = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 30) setIsUrgent(true);
        if (next <= 0 && isFree) setShow(false); // auto-hide when free sala closes
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [show, secondsLeft, isFree]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const handleLeave = useCallback(async () => {
    setIsLoading(true);
    try { await callApi("/api/leaveAndRefund"); setShow(false); onLeft(); }
    finally { setIsLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, onLeft]);

  if (!show) return null;

  /* ── Estilos dinámicos ── */
  const accentColor  = isFree ? (isUrgent ? "#ff4757" : "#f3ba2f") : (isUrgent ? "#ff4757" : "#ffd700");
  const accentBg     = isFree ? (isUrgent ? "rgba(255,71,87,0.08)" : "rgba(243,186,47,0.08)") : (isUrgent ? "rgba(255,71,87,0.08)" : "rgba(255,215,0,0.07)");
  const accentBorder = isFree ? (isUrgent ? "rgba(255,71,87,0.35)" : "rgba(243,186,47,0.3)") : (isUrgent ? "rgba(255,71,87,0.35)" : "rgba(255,215,0,0.3)");

  /* ── Panel SALA GRATIS ── */
  if (isFree) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(7,9,13,0.85)", backdropFilter: "blur(8px)" }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: `radial-gradient(ellipse 60% 40% at 50% 50%, ${accentColor}10, transparent 70%)` }} />

        <div className="relative rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
          style={{ background: "#111318", border: `1px solid ${accentBorder}`, boxShadow: `0 0 40px ${accentColor}18` }}>
          <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />

          <div className="p-6">
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3"
                style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
                <span className="text-3xl">{isUrgent ? "⚠️" : "⏳"}</span>
              </div>
              <h2 className="text-lg font-black text-white tracking-tight">
                {isUrgent ? "¡Sala a punto de cerrarse!" : "Sala esperando jugadores"}
              </h2>
              <p className="text-xs mt-1" style={{ color: "#8b949e" }}>
                Si no se llena, se cancela automáticamente y se crea una nueva igual.
              </p>
            </div>

            {/* Countdown */}
            <div className="rounded-xl py-4 mb-4 text-center" style={{ background: "#0b0e14", border: `1px solid ${accentBorder}` }}>
              <p className="text-[10px] uppercase tracking-[3px] mb-1" style={{ color: "#6e7681" }}>Se cancela en</p>
              <p className="text-5xl font-mono font-black" style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}50` }}>
                {fmt(secondsLeft)}
              </p>
            </div>

            {/* Info box */}
            <div className="rounded-xl p-4 mb-5" style={{ background: "rgba(243,186,47,0.06)", border: "1px solid rgba(243,186,47,0.2)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#cdd9e5" }}>
                🔄 <strong style={{ color: "#f3ba2f" }}>Sala GRATIS</strong> — No perdés nada. El sistema crea una sala nueva automáticamente en cuanto se cierra esta.
              </p>
            </div>

            <button onClick={handleLeave} disabled={isLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40 border"
              style={{ background: "#161b22", borderColor: "#30363d", color: "#8b949e" }}>
              🚪 Salir de la sala
            </button>

            <p className="text-[10px] text-center mt-3" style={{ color: "#30363d" }}>
              También podés quedarte y esperar que lleguen más jugadores
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Panel SALA PAGA ── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(7,9,13,0.85)", backdropFilter: "blur(8px)" }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `radial-gradient(ellipse 60% 40% at 50% 50%, ${accentColor}12, transparent 70%)` }} />

      <div className="relative rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        style={{ background: "#111318", border: `1px solid ${accentBorder}`, boxShadow: `0 0 40px ${accentColor}20` }}>
        <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />

        <div className="p-6">
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3"
              style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
              <span className="text-3xl">{isUrgent ? "⚠️" : "⏳"}</span>
            </div>
            <h2 className="text-lg font-black text-white tracking-tight">
              {isUrgent ? "¡Última oportunidad!" : "Esperando jugadores"}
            </h2>
            <p className="text-xs mt-1" style={{ color: "#8b949e" }}>
              {isUrgent ? "¿Extendés o recuperás tus Coins?" : "La sala aún no se llenó — ¿qué querés hacer?"}
            </p>
          </div>

          {/* Countdown */}
          <div className="rounded-xl py-5 mb-4 text-center" style={{ background: "#0b0e14", border: `1px solid ${accentBorder}` }}>
            <p className="text-[10px] uppercase tracking-[3px] mb-2" style={{ color: "#6e7681" }}>Tiempo restante</p>
            <p className="text-5xl font-mono font-black" style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}50` }}>
              {fmt(secondsLeft)}
            </p>
          </div>

          {/* Coins a devolver */}
          <div className="rounded-xl p-4 mb-5" style={{ background: "rgba(255,215,0,0.05)", border: "1px solid rgba(255,215,0,0.2)" }}>
            <p className="text-xs leading-relaxed" style={{ color: "#cdd9e5" }}>
              💰 Si salís ahora recuperás{" "}
              <strong style={{ color: "#ffd700" }}>🪙 {entryFee.toLocaleString("es-AR")} LFA Coins</strong>{" "}
              en tu billetera. No hay penalización.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <button onClick={handleExtend} disabled={isLoading}
              className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-40"
              style={{ background: "#ffd700", color: "#0b0e14" }}>
              ⏰ Aguantar 5 minutos más
            </button>
            <button onClick={handleLeave} disabled={isLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40 border"
              style={{ background: "#161b22", borderColor: "#30363d", color: "#8b949e" }}>
              💰 Salir y recuperar 🪙 {entryFee.toLocaleString("es-AR")} Coins
            </button>
          </div>

          <p className="text-[10px] text-center mt-4" style={{ color: "#30363d" }}>
            Sin acción → la sala se cancela y todos son reembolsados automáticamente
          </p>
        </div>
      </div>
    </div>
  );
}
