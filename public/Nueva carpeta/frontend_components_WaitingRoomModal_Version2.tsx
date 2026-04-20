"use client";

import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot }                  from "firebase/firestore";
import { db, auth }                         from "@/lib/firebase";

interface Props { tournamentId: string; onLeft: () => void; }

export default function WaitingRoomModal({ tournamentId, onLeft }: Props) {
  const [show,         setShow]         = useState(false);
  const [secondsLeft,  setSecondsLeft]  = useState(0);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isUrgent,     setIsUrgent]     = useState(false);

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

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-gray-900 border rounded-2xl p-6 max-w-sm w-full shadow-2xl transition-all ${
        isUrgent ? "border-red-500 animate-pulse" : "border-yellow-500/50"
      }`}>
        <div className="text-center mb-4">
          <span className="text-5xl">{isUrgent ? "⚠️" : "⏳"}</span>
          <h2 className="text-xl font-bold text-white mt-2">
            {isUrgent ? "¡Última oportunidad!" : "La sala no se llenó"}
          </h2>
          <p className="text-gray-400 text-sm mt-1">¿Seguís esperando o recuperás tus Coins?</p>
        </div>

        <div className={`text-center rounded-xl py-4 mb-5 ${
          isUrgent ? "bg-red-500/10 border border-red-500/30" : "bg-gray-800"
        }`}>
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Tiempo restante</p>
          <p className={`text-4xl font-mono font-black ${isUrgent ? "text-red-400" : "text-yellow-400"}`}>
            {fmt(secondsLeft)}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button onClick={handleExtend} disabled={isLoading}
            className="w-full py-3 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition disabled:opacity-50">
            ⏰ Esperar 5 minutos más
          </button>
          <button onClick={handleLeave} disabled={isLoading}
            className="w-full py-3 bg-gray-800 text-gray-300 font-semibold rounded-xl hover:bg-gray-700 transition disabled:opacity-50 border border-gray-700">
            💰 Salir y recuperar mis Coins
          </button>
        </div>

        <p className="text-xs text-gray-600 text-center mt-4">
          Sin acción → la sala se cancela automáticamente y se reembolsa a todos.
        </p>
      </div>
    </div>
  );
}