"use client";

import { useState, useMemo }                    from "react";
import { useTournaments }                       from "@/hooks/useTournaments";
import TournamentCard                           from "./TournamentCard";
import ConsoleBadges                            from "./ConsoleBadges";
import { GAMES, REGIONS, ROOM_TIERS,
         type Game, type Region, type GameMode } from "@/lib/constants";
import Image                                    from "next/image";

export default function TournamentList() {
  const [game,   setGame]   = useState<Game>("FC26");
  const [region, setRegion] = useState<Region | "">("");
  const [mode,   setMode]   = useState<GameMode | "">("");
  const [tier,   setTier]   = useState<keyof typeof ROOM_TIERS | "">("");

  const selectedGame = GAMES.find((g) => g.value === game)!;
  const { tournaments, loading, error } = useTournaments({
    game,
    region: region || undefined,
    mode:   mode   || undefined,
  });

  const filtered = useMemo(() => {
    if (!tier) return tournaments;
    const { minCoins, maxCoins } = ROOM_TIERS[tier];
    return tournaments.filter((t) => t.entry_fee >= minCoins && t.entry_fee <= maxCoins);
  }, [tournaments, tier]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* HERO */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800 px-6 py-10 text-center">
        <h1 className="text-5xl font-black text-yellow-400 tracking-tight mb-1">🏆 SomosLFA</h1>
        <p className="text-gray-400 text-sm mb-4">Torneos de eSports — Tiempo Real</p>
        <ConsoleBadges />
      </div>

      {/* FILTROS STICKY */}
      <div className="sticky top-0 z-20 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap gap-3 justify-center">

          {/* SELECTOR DE JUEGO */}
          <div className="flex gap-2">
            {GAMES.map((g) => (
              <button key={g.value}
                onClick={() => { setGame(g.value as Game); setMode(""); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                  game === g.value
                    ? "bg-yellow-400 border-yellow-400 text-gray-900"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:border-yellow-500"
                }`}>
                <Image src={g.logo} alt={g.label} width={20} height={20} className="rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                {g.label}
              </button>
            ))}
          </div>

          {/* MODO */}
          <select value={mode} onChange={(e) => setMode(e.target.value as GameMode | "")}
            className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:border-yellow-400 outline-none">
            <option value="">🎮 Todos los Modos</option>
            {selectedGame.modes.map((m) => (
              <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
            ))}
          </select>

          {/* REGIÓN */}
          <select value={region} onChange={(e) => setRegion(e.target.value as Region | "")}
            className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:border-yellow-400 outline-none">
            <option value="">🌐 Todas las Regiones</option>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value} title={r.description}>{r.label}</option>
            ))}
          </select>

          {/* TIER */}
          <select value={tier} onChange={(e) => setTier(e.target.value as keyof typeof ROOM_TIERS | "")}
            className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:border-yellow-400 outline-none">
            <option value="">💰 Todos los Niveles</option>
            <option value="RECREATIVO">🟢 Recreativo (Free / $0.50)</option>
            <option value="COMPETITIVO">🟡 Competitivo ($1 — $3)</option>
            <option value="ELITE">🔴 Elite ($5)</option>
          </select>
        </div>

        {region && (
          <div className="flex justify-center mt-2">
            <span className="text-xs bg-yellow-400/10 border border-yellow-400/30 text-yellow-300 px-3 py-1 rounded-full">
              {REGIONS.find((r) => r.value === region)?.description}
            </span>
          </div>
        )}
      </div>

      {/* CONTENIDO */}
      <div className="max-w-6xl mx-auto px-4 py-8">

        {loading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-red-400">
            <p className="text-4xl mb-2">⚠️</p><p>{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-5xl mb-4">🎮</p>
            <p className="text-lg">No hay torneos disponibles.</p>
            <p className="text-sm mt-2">Cambiá los filtros o volvé más tarde.</p>
          </div>
        )}

        {/* SECCIONES POR TIER */}
        {(["RECREATIVO", "COMPETITIVO", "ELITE"] as const).map((t) => {
          const list = filtered.filter((to) => to.tier === t);
          if (!list.length) return null;
          const cfg = ROOM_TIERS[t];
          return (
            <div key={t} className="mb-12">
              <div className="flex items-center gap-3 mb-5">
                <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                  cfg.color === "green"  ? "bg-green-500/10 text-green-400 border-green-500/30"   :
                  cfg.color === "yellow" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" :
                                           "bg-red-500/10 text-red-400 border-red-500/30"
                }`}>
                  {cfg.color === "green" ? "🟢" : cfg.color === "yellow" ? "🟡" : "🔴"} MODO {cfg.label}
                </span>
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-600">{list.length} sala(s)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((tournament) => (
                  <TournamentCard key={tournament.id} tournament={tournament} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}