"use client";

import { useState, useEffect } from "react";
import { collection, query,
         where, getDocs, onSnapshot,
         limit, doc, getDoc }  from "firebase/firestore";
import { onAuthStateChanged }  from "firebase/auth";
import { db, auth }            from "@/lib/firebase";
import { GAMES, REGIONS }    from "@/lib/constants";
import OrgTournamentCard     from "./OrgTournamentCard";
import type { Game,
              Region,
              GameMode }     from "@/lib/constants";
import type { Tournament }   from "@/hooks/useTournaments";
import TournamentCard        from "./TournamentCard";
import Image                 from "next/image";
import { useLang }           from "@/app/_components/LangDropdown";

// ─── Tiers disponibles para elegir ───────────────────────────
const TIERS = [
  { key: "FREE",        label: "GRATIS",      sub: "Premio por Staff",       dot: "#00d4ff" },
  { key: "RECREATIVO",  label: "RECREATIVO",  sub: "500 – 1.000 LFC",         dot: "#00ff88" },
  { key: "COMPETITIVO", label: "COMPETITIVO", sub: "2.000 – 8.000 LFC",        dot: "#ffd700" },
  { key: "ELITE",       label: "ELITE",       sub: "10.000 – 20.000 LFC",    dot: "#ff4757" },
] as const;

type TierKey = "FREE" | "RECREATIVO" | "COMPETITIVO" | "ELITE";

// ─── Tamaños de sala disponibles ─────────────────────────────
const SIZES = [2, 4, 6, 8, 12, 16, 32] as const;
type SizeKey = typeof SIZES[number];

// ─── Helper: color de llenado ─────────────────────────────────
function fillColor(players: number, capacity: number): { border: string; bg: string; label: string; dot: string } {
  const pct = players / capacity;
  if (pct < 0.5)  return { border: "rgba(0,150,255,0.45)",   bg: "rgba(0,150,255,0.06)",   dot: "#0096ff", label: "LLENÁNDOSE" };
  if (pct < 0.8)  return { border: "rgba(255,200,0,0.50)",   bg: "rgba(255,200,0,0.07)",   dot: "#ffc800", label: "CASI LLENA" };
  return            { border: "rgba(255,60,60,0.55)",    bg: "rgba(255,60,60,0.07)",   dot: "#ff3c3c", label: "¡APURATE!" };
}

const MODE_LABELS: Record<string, string> = {
  GENERAL_95: "95 General", ULTIMATE: "Ultimate Team",
  DREAM_TEAM: "Dream Team", GENUINOS: "Genuinos / Equipos",
};
const GAME_LABELS: Record<string, string> = {
  FC26: "FC 26", EFOOTBALL: "eFootball",
  EFOOTBALL_MOBILE: "📱 eFB Mobile", FC_MOBILE: "📱 FC Mobile",
};
const REGION_LABELS: Record<string, string> = {
  LATAM_SUR: "LATAM Sur", LATAM_NORTE: "LATAM Norte",
  AMERICA: "América", GLOBAL: "Global", EUROPA: "Europa",
};

export default function BuscarSala() {
  const { t } = useLang();
  const [game,     setGame]    = useState<Game>("FC26");
  const [mode,     setMode]    = useState<GameMode | "">("");
  const [region,   setRegion]  = useState<Region | "">("");
  const [tier,     setTier]    = useState<TierKey | "">("");
  const [size,     setSize]    = useState<SizeKey | 0>(0);           // 0 = cualquier tamaño
  const [orgTournaments, setOrgTournaments] = useState<Tournament[]>([]);
  const [liveRooms, setLiveRooms] = useState<Tournament[]>([]);      // salas en tiempo real
  const [gratisRooms, setGratisRooms] = useState<Tournament[]>([]);  // salas GRATIS (query dedicada)

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Tournament[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [showCountryRooms, setShowCountryRooms] = useState(false);
  const [userCountry, setUserCountry] = useState<string>("");
  const [countryRooms, setCountryRooms] = useState<Tournament[]>([]);

  const selectedGame = GAMES.find((g) => g.value === game)!;

  // ── Detect user country for country-specific rooms ────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) {
          const pais = snap.data().pais_codigo || snap.data().country || "";
          setUserCountry(pais);
        }
      } catch { /* silencioso */ }
    });
    return unsub;
  }, []);

  // ── Country-specific rooms ────────────────────────────────
  useEffect(() => {
    if (!userCountry) return;
    // Map ISO code → Spanish name stored in tournament.country
    const ISO_TO_NAME: Record<string, string> = {
      AR: "Argentina", MX: "México", CO: "Colombia", CL: "Chile",
      PE: "Perú", VE: "Venezuela", EC: "Ecuador", BO: "Bolivia",
      PY: "Paraguay", UY: "Uruguay", BR: "Brasil", ES: "España",
    };
    const countryName = ISO_TO_NAME[userCountry.toUpperCase()] ?? userCountry;
    const qCountry = query(
      collection(db, "tournaments"),
      where("country", "==", countryName),
      where("status",  "==", "OPEN"),
      limit(20)
    );
    const unsub = onSnapshot(qCountry, snap => {
      const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
      rooms.sort((a, b) => (b.players.length / b.capacity) - (a.players.length / a.capacity));
      setCountryRooms(rooms);
    });
    return unsub;
  }, [userCountry]);

  // ── Live organized tournaments ────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "tournaments"),
      where("tipo",   "==", "organizado"),
      where("status", "==", "OPEN"),
      limit(10)
    );
    const unsub = onSnapshot(q, snap => {
      setOrgTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament)));
    });
    return unsub;
  }, []);

  // ── Panel en vivo: salas OPEN + ACTIVE/IN_PROGRESS ────────
  useEffect(() => {
    // Single-field queries — sin composite index
    const qOpen = query(collection(db, "tournaments"), where("status", "==", "OPEN"), limit(50));
    const qActive = query(collection(db, "tournaments"), where("status", "==", "ACTIVE"), limit(20));
    let open:   Tournament[] = [];
    let active: Tournament[] = [];
    const merge = () => {
      const all = [...active, ...open].filter(r => r.tipo !== "organizado");
      all.sort((a, b) => {
        if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
        if (b.status === "ACTIVE" && a.status !== "ACTIVE") return 1;
        return (b.players.length / b.capacity) - (a.players.length / a.capacity);
      });
      setLiveRooms(all);
    };
    const u1 = onSnapshot(qOpen,   snap => { open   = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament)); merge(); });
    const u2 = onSnapshot(qActive, snap => { active = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament)); merge(); });
    return () => { u1(); u2(); };
  }, []);

  // ── Query dedicada para salas GRATIS ──────────────────
  // Usamos `free==true` (booléoo) — más confiable que entry_fee==0 (número)
  // Ambos: spawnFromSlots y Cloud Function ya setean `free: true`
  useEffect(() => {
    const qGratis = query(collection(db, "tournaments"), where("free", "==", true), limit(80));
    const unsub = onSnapshot(
      qGratis,
      snap => {
        const gratis = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Tournament))
          .filter(r => r.status === "OPEN" && r.tipo !== "organizado");
        gratis.sort((a, b) => (b.players.length / b.capacity) - (a.players.length / a.capacity));
        setGratisRooms(gratis);
      },
      err => console.error("[qGratis] Firestore error:", err)
    );
    return unsub;
  }, []);

  const buscar = async () => {
    setLoading(true);
    setSearched(true);
    setResults(null);
    try {
      const constraints = [
        where("status", "==", "OPEN"),
        where("game",   "==", game),
      ];
      if (mode)     constraints.push(where("mode",     "==", mode));
      if (region)   constraints.push(where("region",   "==", region));
      if (tier)     constraints.push(where("tier",     "==", tier));
      if (size > 0) constraints.push(where("capacity", "==", size));

      const snap = await getDocs(
        query(collection(db, "tournaments"), ...constraints, limit(10))
      );

      if (snap.empty) { setResults([]); return; }

      let list: Tournament[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tournament));

      // Exclude organized tournaments (shown in their own section)
      list = list.filter(r => r.tipo !== "organizado");

      // Ordenar: menos llenos primero para mejor experiencia de unirse
      list.sort((a, b) => (a.players.length / a.capacity) - (b.players.length / b.capacity));
      setResults(list);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white" style={{ background: "#0b0e14" }}>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #070a0d 0%, #0c1a0f 55%, #0b0e14 100%)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: [
            "radial-gradient(ellipse 90% 60% at 50% -5%, rgba(0,255,136,0.09) 0%, transparent 65%)",
            "radial-gradient(ellipse 40% 40% at 90% 20%, rgba(255,215,0,0.04) 0%, transparent 55%)",
          ].join(","),
        }} />
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: "linear-gradient(rgba(0,255,136,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #00ff88, transparent)" }} />

        <div className="relative text-center px-4 pt-12 pb-8 sm:pt-16 sm:pb-10">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 mb-5 px-4 py-1.5 rounded-full border"
            style={{ background: "rgba(0,255,136,0.07)", borderColor: "rgba(0,255,136,0.25)" }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff88] opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff88]" />
            </span>
            <span className="text-[11px] font-bold tracking-[3px] uppercase" style={{ color: "#00ff88" }}>{t.bs_live}</span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-none mb-2"
            style={{ fontFamily: "'Orbitron', sans-serif" }}>
            <span className="text-white" style={{ textShadow: "0 0 40px rgba(255,255,255,0.08)" }}>SOMOS</span>
            <span style={{ color: "#00ff88", textShadow: "0 0 20px rgba(0,255,136,0.5), 0 0 60px rgba(0,255,136,0.2)" }}>LFA</span>
          </h1>
          <div className="mx-auto h-px w-40 mb-4" style={{ background: "linear-gradient(90deg, transparent, #00ff88, transparent)" }} />
          <p className="text-xs sm:text-sm tracking-widest uppercase mb-6" style={{ color: "#8b949e" }}>
            {t.bs_esports}
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
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border"
              style={{ background: "rgba(156,95,255,0.08)", borderColor: "rgba(156,95,255,0.35)", color: "#9c5fff" }}>
              📱 MOBILE
            </div>
          </div>
        </div>
      </div>

      {/* ── PANEL EN VIVO ─────────────────────────────────────── */}
      {(liveRooms.length > 0 || gratisRooms.length > 0) && (() => {
        const playing = liveRooms.filter(r => r.status === "ACTIVE");
        const waiting = liveRooms.filter(r => r.status !== "ACTIVE" && r.players.length > 0);
        const tierDot: Record<string, string> = { FREE: "#00d4ff", RECREATIVO: "#00ff88", COMPETITIVO: "#ffd700", ELITE: "#ff4757" };

        return (
          <div className="max-w-2xl mx-auto px-4 pt-5 pb-1">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, #0096ff30, transparent)" }} />
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0096ff] opacity-70" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0096ff]" />
                </span>
                <span className="text-[10px] font-black tracking-[3px] uppercase" style={{ color: "#0096ff", fontFamily: "'Orbitron',sans-serif" }}>
                  ⚔️ EN JUEGO {playing.length > 0 ? `— ${playing.length} SALA${playing.length !== 1 ? "S" : ""}` : ""}
                </span>
              </div>
              <div className="h-px flex-1" style={{ background: "linear-gradient(270deg, #0096ff30, transparent)" }} />
            </div>

            {/* ── Salas EN JUEGO (siempre visibles, estilo azul) ── */}
            {playing.length > 0 ? (
              <div className="flex flex-col gap-1.5 mb-3">
                {playing.map(room => (
                  <div key={room.id} className="rounded-xl flex items-center gap-3 px-3 py-2 transition-all"
                    style={{ background: "rgba(0,150,255,0.07)", border: "1px solid rgba(0,150,255,0.45)", boxShadow: "0 0 10px rgba(0,150,255,0.08)" }}>
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0096ff] opacity-70" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0096ff]" />
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase" style={{ color: "#0096ff", fontFamily: "'Orbitron',sans-serif" }}>⚔️ EN JUEGO</span>
                      <span style={{ color: "#3c4450" }}>·</span>
                      <span className="text-[10px] font-semibold" style={{ color: tierDot[room.tier] ?? "#8b949e" }}>{room.tier}</span>
                      <span style={{ color: "#3c4450" }}>·</span>
                      <span className="text-[10px]" style={{ color: "#8b949e" }}>
                        {GAME_LABELS[room.game] ?? room.game}
                        {MODE_LABELS[room.mode] ? ` · ${MODE_LABELS[room.mode]}` : ""}
                      </span>
                      <span style={{ color: "#3c4450" }}>·</span>
                      <span className="text-[10px]" style={{ color: "#c9d1d9" }}>{REGION_LABELS[room.region] ?? room.region}</span>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: "rgba(0,150,255,0.15)", color: "#0096ff", border: "1px solid rgba(0,150,255,0.3)", fontFamily: "'Orbitron',sans-serif" }}>
                      {room.players.length}p
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl px-4 py-3 mb-3 text-center text-[11px]"
                style={{ background: "rgba(0,150,255,0.04)", border: "1px dashed rgba(0,150,255,0.2)", color: "#6e7681" }}>
                Sin partidos en curso ahora mismo
              </div>
            )}

            {/* ── Jugadores esperando ── */}
            {waiting.length > 0 && (
              <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center gap-3"
                style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.2)" }}>
                <span className="text-base flex-shrink-0">🕐</span>
                <div className="flex-1">
                  <span className="text-[10px] font-black uppercase" style={{ color: "#00ff88", fontFamily: "'Orbitron',sans-serif" }}>
                    Jugadores esperando en sala
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {waiting.map(room => {
                      const clr = fillColor(room.players.length, room.capacity);
                      return (
                        <span key={room.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: clr.bg, border: `1px solid ${clr.border}`, color: clr.dot }}>
                          {room.players.length}/{room.capacity} · {GAME_LABELS[room.game] ?? room.game} · {REGION_LABELS[room.region]?.replace("LATAM ","") ?? room.region}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Salas GRATIS disponibles (expandible) ── */}
            {gratisRooms.length > 0 && (
              <>
                <button
                  onClick={() => setShowAllRooms(v => !v)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl mb-2 transition-all text-[11px] font-bold"
                  style={{
                    background: "rgba(0,212,255,0.05)",
                    border: "1px solid rgba(0,212,255,0.25)",
                    color: "#00d4ff",
                  }}>
                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.62rem", letterSpacing: 1 }}>
                    {showAllRooms ? "▲ OCULTAR" : "▼ SALAS GRATIS DISPONIBLES"}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-black"
                    style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.35)", color: "#00d4ff" }}>
                    {gratisRooms.length}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                    style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.25)" }}>
                    🆓 GRATIS
                  </span>
                </button>

                {showAllRooms && (
                  <div className="flex flex-col gap-1.5 mb-4 max-h-72 overflow-y-auto pr-1"
                    style={{ scrollbarWidth: "thin", scrollbarColor: "#30363d transparent" }}>
                    {gratisRooms.map(room => {
                      const pct = Math.round((room.players.length / room.capacity) * 100);
                      const clr = room.players.length > 0
                        ? fillColor(room.players.length, room.capacity)
                        : { border: "rgba(0,212,255,0.35)", bg: "rgba(0,212,255,0.05)", dot: "#00d4ff", label: "GRATIS" };
                      return (
                        <div key={room.id} className="rounded-xl flex items-center gap-3 px-3 py-2 transition-all"
                          style={{ background: clr.bg, border: `1px solid ${clr.border}` }}>
                          <span className="relative flex h-2 w-2 flex-shrink-0">
                            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: clr.dot }} />
                          </span>
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase" style={{ color: "#00d4ff", fontFamily: "'Orbitron',sans-serif" }}>🆓 GRATIS</span>
                            <span style={{ color: "#3c4450" }}>·</span>
                            <span className="text-[10px]" style={{ color: "#8b949e" }}>
                              {GAME_LABELS[room.game] ?? room.game}
                              {MODE_LABELS[room.mode] ? ` · ${MODE_LABELS[room.mode]}` : ""}
                            </span>
                            <span style={{ color: "#3c4450" }}>·</span>
                            <span className="text-[10px]" style={{ color: "#c9d1d9" }}>{REGION_LABELS[room.region] ?? room.region}</span>
                            <span style={{ color: "#3c4450" }}>·</span>
                            <span className="text-[10px]" style={{ color: "#8b949e" }}>{room.capacity}j</span>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0" style={{ minWidth: 60 }}>
                            <span className="text-[11px] font-black" style={{ color: pct > 0 ? clr.dot : "#00d4ff" }}>
                              {room.players.length}/{room.capacity}
                            </span>
                            <div className="h-1 w-14 rounded-full overflow-hidden" style={{ background: "#1c2028" }}>
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(pct, 2)}%`, background: pct > 0 ? clr.dot : "#00d4ff" }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}



      {/* ── TORNEOS ORGANIZADOS / STREAMERS ───────────────────── */}
      {orgTournaments.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, #a371f730, transparent)" }} />
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#a371f7] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#a371f7]" />
              </span>
              <span className="text-[10px] font-black tracking-[3px] uppercase" style={{ color: "#a371f7", fontFamily: "'Orbitron',sans-serif" }}>
                TORNEOS ORGANIZADOS
              </span>
            </div>
            <div className="h-px flex-1" style={{ background: "linear-gradient(270deg, #a371f730, transparent)" }} />
          </div>
          <div className="flex flex-col gap-4 mb-6">
            {orgTournaments.map(org => (
              <OrgTournamentCard key={org.id} tournament={org} />
            ))}
          </div>
        </div>
      )}

      {/* ── SELECTOR DE PREFERENCIAS ──────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pb-6">

        <div className="rounded-2xl overflow-hidden" style={{ background: "#111318", border: "1px solid #1c2028" }}>

          {/* ── JUEGO ── */}
          <div className="p-5 border-b" style={{ borderColor: "#1c2028" }}>
            <p className="text-[10px] font-black uppercase tracking-[3px] mb-3" style={{ color: "#6e7681" }}>{t.bs_label_game}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GAMES.map((g) => {
                const active = game === g.value;
                return (
                  <button key={g.value}
                    onClick={() => { setGame(g.value as Game); setMode(""); }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold justify-center transition-all"
                    style={{
                      background:   active ? "#00ff88" : "#0b0e14",
                      borderColor:  active ? "#00ff88" : "#30363d",
                      color:        active ? "#0b0e14" : "#8b949e",
                      boxShadow:    active ? "0 0 16px rgba(0,255,136,0.2)" : "none",
                    }}>
                    <Image src={g.logo} alt={g.label} width={16} height={16} className="rounded flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span className="truncate">{GAME_LABELS[g.value] ?? g.value}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── MODO ── */}
          <div className="p-5 border-b" style={{ borderColor: "#1c2028" }}>
            <p className="text-[10px] font-black uppercase tracking-[3px] mb-3" style={{ color: "#6e7681" }}>{t.bs_label_mode}</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: "", label: t.bs_any_mode }, ...selectedGame.modes.map((m) => ({ value: m.value, label: `${m.icon} ${m.label}` }))].map((m) => {
                const active = mode === m.value;
                return (
                  <button key={m.value} onClick={() => setMode(m.value as GameMode | "")}
                    className="py-2.5 px-3 rounded-xl border text-xs font-bold text-left transition-all"
                    style={{
                      background:  active ? "rgba(255,215,0,0.1)" : "#0b0e14",
                      borderColor: active ? "rgba(255,215,0,0.4)" : "#30363d",
                      color:       active ? "#ffd700"             : "#8b949e",
                    }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── REGIÓN ── */}
          <div className="p-5 border-b" style={{ borderColor: "#1c2028" }}>
            <p className="text-[10px] font-black uppercase tracking-[3px] mb-3" style={{ color: "#6e7681" }}>{t.bs_label_region}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[{ value: "", label: t.bs_any_region, description: "" }, ...REGIONS].map((r) => {
                const active = region === r.value;
                return (
                  <button key={r.value} onClick={() => setRegion(r.value as Region | "")}
                    className="py-2.5 px-3 rounded-xl border text-left transition-all"
                    style={{
                      background:  active ? "rgba(0,255,136,0.08)" : "#0b0e14",
                      borderColor: active ? "rgba(0,255,136,0.35)" : "#30363d",
                    }}>
                    <span className="text-xs font-bold block" style={{ color: active ? "#00ff88" : "#c9d1d9" }}>{r.label}</span>
                    {"description" in r && r.description && (
                      <span className="text-[10px] mt-0.5 block" style={{ color: "#6e7681" }}>{r.description}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── NIVEL / TIER ── */}
          <div className="p-5 border-b" style={{ borderColor: "#1c2028" }}>
            <p className="text-[10px] font-black uppercase tracking-[3px] mb-3" style={{ color: "#6e7681" }}>{t.bs_label_tier}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[{ key: "", label: t.bs_any_tier, sub: t.bs_any_tier_sub, dot: "#6e7681" }, ...TIERS].map((t) => {
                const active = tier === t.key;
                return (
                  <button key={t.key} onClick={() => setTier(t.key as TierKey | "")}
                    className="py-3 px-2 rounded-xl border text-center transition-all"
                    style={{
                      background:  active ? t.dot + "15" : "#0b0e14",
                      borderColor: active ? t.dot + "50" : "#30363d",
                    }}>
                    <span className="w-2 h-2 rounded-full mx-auto mb-1 block" style={{ background: active ? t.dot : "#30363d", boxShadow: active ? `0 0 8px ${t.dot}` : "none" }} />
                    <span className="text-[11px] font-black block" style={{ color: active ? t.dot : "#c9d1d9" }}>{t.label}</span>
                    <span className="text-[9px] font-bold block mt-0.5" style={{ color: t.key === "" ? "#6e7681" : (active ? t.dot : t.dot + "bb") }}>{t.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── BOTÓN BUSCAR ── */}
          <div className="p-5 border-b" style={{ borderColor: "#1c2028" }}>
            <p className="text-[10px] font-black uppercase tracking-[3px] mb-3" style={{ color: "#6e7681" }}>5. JUGADORES POR SALA</p>
            <div className="flex flex-wrap gap-2">
              {([0, ...SIZES] as (0 | SizeKey)[]).map((s) => {
                const active = size === s;
                return (
                  <button key={s} onClick={() => setSize(s)}
                    className="px-3 py-2 rounded-xl border text-xs font-black transition-all"
                    style={{
                      background:  active ? "rgba(0,212,255,0.12)" : "#0b0e14",
                      borderColor: active ? "rgba(0,212,255,0.45)" : "#30363d",
                      color:       active ? "#00d4ff"               : "#8b949e",
                      boxShadow:   active ? "0 0 10px rgba(0,212,255,0.15)" : "none",
                    }}>
                    {s === 0 ? "Cualquiera" : `${s}j`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── BOTÓN BUSCAR ── */}
          <div className="p-5">
            <button
              onClick={buscar}
              disabled={loading}
              className="w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-60"
              style={{
                background:  "linear-gradient(135deg, #00ff88, #00d4aa)",
                color:       "#0b0e14",
                boxShadow:   "0 4px 24px rgba(0,255,136,0.25)",
                letterSpacing: "2px",
              }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-transparent animate-spin inline-block" style={{ borderTopColor: "#0b0e14" }} />
                  {t.bs_btn_searching}
                </span>
              ) : t.bs_btn_search}
            </button>
          </div>
        </div>

        {/* ── RESULTADOS ──────────────────────────────────────── */}
        {searched && !loading && results !== null && (
          <div className="mt-6">
            {results.length === 0 ? (
              <div className="flex flex-col items-center py-12 rounded-2xl border gap-4 text-center"
                style={{ background: "#111318", borderColor: "#1c2028" }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border"
                  style={{ background: "#0b0e14", borderColor: "#30363d" }}>🎮</div>
                <div>
                  <p className="font-bold text-white mb-1">{t.bs_no_rooms}</p>
                  <p className="text-xs" style={{ color: "#8b949e" }}>
                    {t.bs_no_rooms_hint}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, #00ff8830, transparent)" }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#00ff88" }}>
                    {results.length} sala{results.length !== 1 ? "s" : ""} disponible{results.length !== 1 ? "s" : ""}
                  </span>
                  <div className="h-px flex-1" style={{ background: "linear-gradient(270deg, #00ff8830, transparent)" }} />
                </div>
                <div className="flex flex-col gap-4">
                  {results.map((t) => (
                    <TournamentCard key={t.id} tournament={t} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── TORNEOS DE TU PAÍS (acordeón al fondo) ─────────────── */}
      {countryRooms.length > 0 && (() => {
        const ISO_FLAG: Record<string, string> = {
          AR:"🇦🇷", MX:"🇲🇽", CO:"🇨🇴", CL:"🇨🇱", PE:"🇵🇪", VE:"🇻🇪",
          EC:"🇪🇨", BO:"🇧🇴", PY:"🇵🇾", UY:"🇺🇾", BR:"🇧🇷", ES:"🇪🇸",
        };
        const flag = ISO_FLAG[userCountry.toUpperCase()] ?? "🌎";
        return (
          <div className="max-w-2xl mx-auto px-4 pt-4 pb-6">
            <button
              onClick={() => setShowCountryRooms(v => !v)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl mb-2 transition-all text-[11px] font-bold"
              style={{
                background: "rgba(255,215,0,0.05)",
                border: "1px solid rgba(255,215,0,0.25)",
                color: "#ffd700",
              }}>
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "0.62rem", letterSpacing: 1 }}>
                {showCountryRooms ? "▲ OCULTAR" : `▼ TORNEOS DE TU PAÍS`}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-black"
                style={{ background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.35)", color: "#ffd700" }}>
                {countryRooms.length}
              </span>
              <span className="text-base">{flag}</span>
            </button>
            {showCountryRooms && (
              <div className="flex flex-col gap-3">
                {countryRooms.map(room => (
                  <TournamentCard key={room.id} tournament={room} />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@900&display=swap');
      `}</style>
    </div>
  );
}
