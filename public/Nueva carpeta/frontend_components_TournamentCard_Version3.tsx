"use client";

import { useState }        from "react";
import { useRouter }       from "next/navigation";
import { auth }            from "@/lib/firebase";
import { getRoomTier }     from "@/lib/constants";
import ConsoleBadges       from "./ConsoleBadges";
import type { Tournament } from "@/hooks/useTournaments";

interface Props { tournament: Tournament; }

const REGION_LABELS: Record<string, string> = {
  LATAM_SUR:   "🌎 LATAM Sur",
  LATAM_NORTE: "🌎 LATAM Norte",
  AMERICA:     "🌍 América",
  GLOBAL:      "🌐 Global",
};
const MODE_LABELS: Record<string, string> = {
  GENERAL_95:  "⚽ 95 General",
  ULTIMATE:    "🃏 Ultimate Team",
  DREAM_TEAM:  "⭐ Dream Team",
  GENUINOS:    "🏅 Genuinos",
};
const GAME_LABELS: Record<string, string> = {
  FC26:      "EA FC 26",
  EFOOTBALL: "eFootball",
};

export default function TournamentCard({ tournament: t }: Props) {
  const [joining,  setJoining]  = useState(false);
  const [message,  setMessage]  = useState("");
  const router = useRouter();

  const tier      = getRoomTier(t.entry_fee);
  const spotsLeft = t.capacity - t.players.length;
  const isFull    = spotsLeft === 0;
  const isActive  = t.status === "ACTIVE";
  const isFree    = t.entry_fee === 0;

  const tierStyle = {
    green:  { border: "border-green-500/40",  badge: "bg-green-500/10 text-green-400 border-green-500/30"   },
    yellow: { border: "border-yellow-500/40", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
    red:    { border: "border-red-500/40",    badge: "bg-red-500/10 text-red-400 border-red-500/30"          },
  }[tier.color];

  const handleJoin = async () => {
    if (!auth.currentUser) return router.push("/auth");
    setJoining(true); setMessage("");
    try {
      const token = await auth.currentUser.getIdToken();
      const res   = await fetch("/api/joinTournament", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tournamentId: t.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("✅ ¡Te uniste al torneo!");
    } catch (e: any) {
      setMessage(`❌ ${e.message}`);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className={`bg-gray-900 rounded-2xl border ${tierStyle.border} p-5 flex flex-col gap-3 hover:scale-[1.01] transition-all duration-200 shadow-lg`}>

      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <span className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${tierStyle.badge}`}>
            {tier.color === "green" ? "🟢" : tier.color === "yellow" ? "🟡" : "🔴"} {tier.label}
          </span>
          <span className="text-xs text-gray-500 mt-0.5">{GAME_LABELS[t.game] ?? t.game}</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-bold ${
          t.status === "OPEN"    ? "bg-green-500/20 text-green-400" :
          t.status === "DISPUTE" ? "bg-red-500/20 text-red-400"     :
                                   "bg-blue-500/20 text-blue-400"
        }`}>{t.status}</span>
      </div>

      {/* CROSSPLAY */}
      <ConsoleBadges size="sm" showLabel={false} />

      {/* INFO */}
      <div className="space-y-1 text-sm text-gray-400">
        <p>🌎 <span className="text-white">{REGION_LABELS[t.region] ?? t.region}</span></p>
        <p>🎮 <span className="text-white">{MODE_LABELS[t.mode]   ?? t.mode}</span></p>
        <p>👥 <span className="text-white">{t.capacity} jugadores</span></p>
        <p>🎟️ Entrada:{" "}
          {isFree
            ? <span className="text-green-400 font-bold">¡GRATIS!</span>
            : <span className="text-yellow-400 font-bold">
                {t.entry_fee.toLocaleString()} Coins
                <span className="text-gray-500 text-xs ml-1">(${(t.entry_fee/1000).toFixed(2)} USD)</span>
              </span>
          }
        </p>
        <p>🏆 1° Premio:{" "}
          <span className="text-green-400 font-bold">
            {(t.prizes?.[0]?.coins ?? t.prize_pool).toLocaleString()} Coins
          </span>
        </p>
      </div>

      {/* PREMIOS DESGLOSADOS */}
      {t.prizes?.length > 1 && (
        <div className="bg-gray-800/60 rounded-xl p-2 text-xs space-y-0.5">
          {t.prizes.map((p) => (
            <div key={p.place} className="flex justify-between text-gray-400">
              <span>{p.label}</span>
              <span className="text-white font-semibold">{p.coins.toLocaleString()} Coins</span>
            </div>
          ))}
        </div>
      )}

      {/* BARRA PROGRESO */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{t.players.length} inscritos</span>
          <span>{spotsLeft} disponibles</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all ${isFull ? "bg-red-500" : "bg-yellow-400"}`}
            style={{ width: `${(t.players.length / t.capacity) * 100}%` }} />
        </div>
      </div>

      {/* ACCIÓN */}
      {message && <p className="text-xs text-center">{message}</p>}
      <button onClick={handleJoin} disabled={joining || isFull || isActive}
        className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
          isFull || isActive ? "bg-gray-800 text-gray-600 cursor-not-allowed" :
          isFree             ? "bg-green-500 text-white hover:bg-green-400 shadow-green-500/20 shadow-lg" :
                               "bg-yellow-400 text-gray-900 hover:bg-yellow-300 shadow-yellow-400/20 shadow-lg"
        }`}>
        {joining ? "⏳ Procesando..." : isFull ? "🔒 Sala Llena" : isActive ? "⚔️ En Curso" : isFree ? "🎮 Unirse Gratis" : "⚡ Unirse"}
      </button>
    </div>
  );
}