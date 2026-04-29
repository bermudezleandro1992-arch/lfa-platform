"use client";

import { useState, useMemo }                     from "react";
import { useTournaments }                        from "@/hooks/useTournaments";
import TournamentCard                            from "./TournamentCard";
import { GAMES, REGIONS, ROOM_TIERS,
         type Game, type Region, type GameMode } from "@/lib/constants";
import Image                                     from "next/image";

type TierKey = keyof typeof ROOM_TIERS;

export default function TournamentList() {
  const [game,   setGame]   = useState<Game>("FC26");
  const [region, setRegion] = useState<Region | "">("");
  const [mode,   setMode]   = useState<GameMode | "">("");
  const [tier,   setTier]   = useState<TierKey | "">("");

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
    <div className="min-h-screen text-white" style={{ background: "#0b0e14", fontFamily: "'Roboto', sans-serif" }}>

      {/* HERO */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #07090d 0%, #0d1a10 50%, #0b0e14 100%)" }} />
        <div className="absolute inset-0" style={{
          backgroundImage: [
            "radial-gradient(ellipse 90% 60% at 50% -5%, rgba(0,255,136,0.10) 0%, transparent 65%)",
            "radial-gradient(ellipse 50% 40% at 85% 30%, rgba(255,215,0,0.04) 0%, transparent 55%)",
            "radial-gradient(ellipse 30% 30% at 10% 70%, rgba(0,212,255,0.03) 0%, transparent 50%)",
          ].join(","),
        }} />
        <div className="absolute inset-0" style={{
          backgroundImage: "linear-gradient(rgba(0,255,136,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.6) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          opacity: 0.025,
        }} />
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #00ff88, transparent)" }} />

        <div className="relative px-4 pt-12 pb-10 sm:pt-16 sm:pb-12 text-center">

          {/* Badge LIVE */}
          <div className="inline-flex items-center gap-2.5 mb-6 px-4 py-1.5 rounded-full border"
            style={{ background: "rgba(0,255,136,0.07)", borderColor: "rgba(0,255,136,0.25)" }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff88] opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff88]" />
            </span>
            <span className="text-[#00ff88] text-[11px] font-bold tracking-[3px] uppercase">Torneos en vivo</span>
          </div>

          {/* Titulo */}
          <div className="mb-3">
            <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-none" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              <span className="text-white" style={{ textShadow: "0 0 40px rgba(255,255,255,0.08)" }}>SOMOS</span>
              <span style={{ color: "#00ff88", textShadow: "0 0 20px rgba(0,255,136,0.5), 0 0 60px rgba(0,255,136,0.2)" }}>LFA</span>
            </h1>
            <div className="mx-auto mt-3 h-px w-40" style={{ background: "linear-gradient(90deg, transparent, #00ff88, transparent)" }} />
          </div>

          <p className="text-sm sm:text-base mb-7 tracking-widest uppercase" style={{ color: "#8b949e" }}>
            eSports Competitivo · Tiempo Real · LATAM
          </p>

          {/* Consolas */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {([
              { label: "PS5",  hex: "#003bff", path: "M8.985 2.596v17.548l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.181.76.814.76 1.505v5.609c2.205 1.017 3.855-.136 3.855-3.24 0-3.19-1.108-4.695-4.342-5.775-1.168-.39-3.143-.913-4.982-1.2zm8.82 14.644c-1.863.67-3.773.182-4.296-.182v-2.373c.898.538 2.55 1.047 3.734.608 1.184-.442 1.229-1.627.044-2.235-.943-.477-1.942-.67-2.685-.9v-2.073c.743.15 1.942.332 2.685.628 2.384.955 3.024 3.148 1.517 4.527zm-12.2 3.01l3.955 1.354V19.25l-3.955-1.354v2.354z" },
              { label: "XBOX", hex: "#107c10", path: "M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 1.86 7.484 8.796 6.44 11.34C23.086 15.96 24 14.083 24 12c0-3.328-1.7-6.26-4.281-7.984-1.186-.767-4.875 2.099-4.457 2.611zm-6.522 0c.418-.512-3.271-3.378-4.457-2.61C1.699 5.738 0 8.67 0 11.998c0 2.083.914 3.96 2.298 5.967-1.044-2.544 3.94-9.48 6.442-11.338zM12 1.077c-1.275 0-2.497.22-3.633.613C7.748 1.99 7.418 3.072 7.418 3.072S9.01 1.898 12 1.898c2.99 0 4.582 1.174 4.582 1.174s-.33-1.082-.949-1.382A10.935 10.935 0 0 0 12 1.077z" },
              { label: "PC",   hex: "#6e7681", path: "M0 0l10.956 15.418L0 24h2.48l9.397-8.143L19.58 24H24L12.573 7.985 22.516 0h-2.48l-8.397 7.267L4.42 0zm4.34 1.745h2.02l13.31 20.51h-2.02z" },
            ] as { label: string; hex: string; path: string }[]).map(({ label, hex, path }) => (
              <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={{ background: hex + "12", borderColor: hex + "35", color: hex }}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d={path} /></svg>
                {label}
              </div>
            ))}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border"
              style={{ background: "rgba(0,255,136,0.08)", borderColor: "rgba(0,255,136,0.35)", color: "#00ff88" }}>
              ✓ CROSSPLAY
            </div>
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="sticky top-0 z-20 backdrop-blur-xl border-b" style={{ background: "rgba(11,14,20,0.97)", borderColor: "#30363d" }}>
        <div className="max-w-6xl mx-auto px-3 py-3 flex flex-wrap gap-2 justify-center items-center">

          {/* JUEGO */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "#30363d" }}>
            {GAMES.map((g) => {
              const active = game === g.value;
              return (
                <button key={g.value} onClick={() => { setGame(g.value as Game); setMode(""); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-all"
                  style={{ background: active ? "#ffd700" : "#161b22", color: active ? "#0b0e14" : "#8b949e" }}>
                  <Image src={g.logo} alt={g.label} width={15} height={15} className="rounded"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  {g.value}
                </button>
              );
            })}
          </div>

          {/* MODO */}
          <select value={mode} onChange={(e) => setMode(e.target.value as GameMode | "")}
            className="rounded-xl px-3 py-2 text-xs font-medium outline-none cursor-pointer border"
            style={{ background: "#161b22", borderColor: "#30363d", color: "#c9d1d9" }}>
            <option value="">🎮 Modo</option>
            {GAMES.find((g) => g.value === game)?.modes.map((m) => (
              <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
            ))}
          </select>

          {/* REGION */}
          <select value={region} onChange={(e) => setRegion(e.target.value as Region | "")}
            className="rounded-xl px-3 py-2 text-xs font-medium outline-none cursor-pointer border"
            style={{ background: "#161b22", borderColor: "#30363d", color: "#c9d1d9" }}>
            <option value="">🌐 Región</option>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {/* NIVEL */}
          <select value={tier} onChange={(e) => setTier(e.target.value as TierKey | "")}
            className="rounded-xl px-3 py-2 text-xs font-medium outline-none cursor-pointer border"
            style={{ background: "#161b22", borderColor: "#30363d", color: "#c9d1d9" }}>
            <option value="">💰 Nivel</option>
            <option value="FREE">🎁 GRATIS — Premio por Staff</option>
            <option value="RECREATIVO">🟢 RECREATIVO — 500-1.000 LFC (~$0.50-$1)</option>
            <option value="COMPETITIVO">🟡 COMPETITIVO — 2.000-8.000 LFC ($2-$8)</option>
            <option value="ELITE">🔴 ELITE — 10.000-20.000 LFC ($10-$20)</option>
          </select>

          {!loading && !error && (
            <span className="text-[11px] hidden sm:block font-mono" style={{ color: "#8b949e" }}>
              {filtered.length} sala{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {region && (
          <div className="flex justify-center pb-2">
            <span className="text-[10px] px-3 py-0.5 rounded-full border font-medium"
              style={{ color: "rgba(255,215,0,0.7)", background: "rgba(255,215,0,0.04)", borderColor: "rgba(255,215,0,0.18)" }}>
              {REGIONS.find((r) => r.value === region)?.description}
            </span>
          </div>
        )}
      </div>

      {/* CONTENIDO */}
      <div className="max-w-6xl mx-auto px-3 sm:px-5 py-8 sm:py-12">

        {loading && (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: "#161b22" }} />
              <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "#00ff88" }} />
              <div className="absolute inset-2 rounded-full border border-transparent animate-spin"
                style={{ borderTopColor: "#ffd700", animationDirection: "reverse", animationDuration: "1.5s" }} />
            </div>
            <p className="text-xs tracking-[4px] animate-pulse uppercase font-bold" style={{ color: "#8b949e" }}>Cargando torneos...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center border text-2xl"
              style={{ background: "rgba(255,71,87,0.08)", borderColor: "rgba(255,71,87,0.25)" }}>⚠️</div>
            <p className="font-bold" style={{ color: "#ff4757" }}>No se pudieron cargar los torneos</p>
            <p className="text-xs" style={{ color: "#8b949e" }}>Verificá tu conexión o intentá nuevamente</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center py-28 gap-5">
            <div className="w-24 h-24 rounded-2xl flex items-center justify-center border text-5xl"
              style={{ background: "#161b22", borderColor: "#30363d" }}>🏆</div>
            <div className="text-center">
              <p className="font-bold text-white mb-1.5">Sin torneos disponibles</p>
              <p className="text-xs" style={{ color: "#8b949e" }}>Cambiá los filtros o volvé en unos minutos.</p>
            </div>
          </div>
        )}

        {!loading && !error && (["FREE", "RECREATIVO", "COMPETITIVO", "ELITE"] as TierKey[]).map((t) => {
          const list = filtered.filter((to) => to.tier === t);
          if (!list.length) return null;
          const cfg = ROOM_TIERS[t];
          type PaletteKey = "cyan" | "green" | "yellow" | "red";
          const palettes: Record<PaletteKey, { dot: string; line: string; badge: string; bBorder: string; bText: string }> = {
            cyan:   { dot: "#00d4ff", line: "#00d4ff30", badge: "rgba(0,212,255,0.08)",  bBorder: "rgba(0,212,255,0.25)",  bText: "#00d4ff" },
            green:  { dot: "#00ff88", line: "#00ff8830", badge: "rgba(0,255,136,0.08)",  bBorder: "rgba(0,255,136,0.25)",  bText: "#00ff88" },
            yellow: { dot: "#ffd700", line: "#ffd70030", badge: "rgba(255,215,0,0.07)",  bBorder: "rgba(255,215,0,0.25)",  bText: "#ffd700" },
            red:    { dot: "#ff4757", line: "#ff475730", badge: "rgba(255,71,87,0.07)",  bBorder: "rgba(255,71,87,0.25)",  bText: "#ff4757" },
          };
          const palette = palettes[cfg.color as PaletteKey];

          return (
            <div key={t} className="mb-12 sm:mb-16">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-black uppercase tracking-widest"
                  style={{ background: palette.badge, borderColor: palette.bBorder, color: palette.bText }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: palette.dot, boxShadow: "0 0 6px " + palette.dot }} />
                  {cfg.label}
                  {t === "FREE" && <span className="ml-1 opacity-70">— Staff premia</span>}
                </div>
                {"coinLabel" in cfg && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                    style={{ color: "#8b949e", background: "#161b22", borderColor: "#30363d" }}>
                    🪙 {cfg.coinLabel} · {cfg.usdLabel}
                  </span>
                )}
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, " + palette.line + ", transparent)" }} />
                <span className="text-[10px] font-mono" style={{ color: "#30363d" }}>{list.length} sala{list.length !== 1 ? "s" : ""}</span>
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

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@900&display=swap');
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0b0e14; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #00ff88; }
        select option { background: #161b22; }
      `}</style>
    </div>
  );
}
