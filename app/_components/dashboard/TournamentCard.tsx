"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter }                        from "next/navigation";
import { doc, getDoc }                      from "firebase/firestore";
import { auth, db }                         from "@/lib/firebase";
import { onAuthStateChanged }               from "firebase/auth";
import type { Tournament }                  from "@/hooks/useTournaments";
import WaitingRoomModal                     from "./WaitingRoomModal";

interface Props { tournament: Tournament; }

interface Reserva {
  id: string;
  tournamentId: string;
  tournamentNombre: string;
  entryFee: number;
  faltanCoins: number;
  expiresAt: string; // ISO
}

const REGION_LABELS: Record<string, string> = {
  LATAM_SUR:   "LATAM Sur",
  LATAM_NORTE: "LATAM Norte",
  AMERICA:     "América",
  GLOBAL:      "Global",
};
const MODE_LABELS: Record<string, string> = {
  GENERAL_95: "95 General",
  ULTIMATE:   "Ultimate Team",
  DREAM_TEAM: "Dream Team",
  GENUINOS:   "Genuinos",
};

const TIER_STYLES: Record<string, { dot: string; border: string; badgeBg: string; badgeText: string; btnBg: string; btnText: string }> = {
  FREE:        { dot: "#00d4ff", border: "rgba(0,212,255,0.25)",  badgeBg: "rgba(0,212,255,0.08)",  badgeText: "#00d4ff", btnBg: "#00d4ff", btnText: "#0b0e14" },
  RECREATIVO:  { dot: "#00ff88", border: "rgba(0,255,136,0.25)",  badgeBg: "rgba(0,255,136,0.08)",  badgeText: "#00ff88", btnBg: "#00ff88", btnText: "#0b0e14" },
  COMPETITIVO: { dot: "#ffd700", border: "rgba(255,215,0,0.25)",  badgeBg: "rgba(255,215,0,0.08)",  badgeText: "#ffd700", btnBg: "#ffd700", btnText: "#0b0e14" },
  ELITE:       { dot: "#ff4757", border: "rgba(255,71,87,0.25)",  badgeBg: "rgba(255,71,87,0.08)",  badgeText: "#ff4757", btnBg: "#ff4757", btnText: "#ffffff" },
};

function getTierKey(entryFee: number): string {
  if (entryFee === 0)     return "FREE";
  if (entryFee < 1000)   return "RECREATIVO";
  if (entryFee < 10000)  return "COMPETITIVO";
  return "ELITE";
}

function useCountdown(expiresAt: string | null) {
  const [secsLeft, setSecsLeft] = useState<number>(0);
  useEffect(() => {
    if (!expiresAt) return;
    const calc = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    setSecsLeft(calc());
    const id = setInterval(() => setSecsLeft(calc()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  return { secsLeft, label: `${mins}:${String(secs).padStart(2, "0")}` };
}

export default function TournamentCard({ tournament: t }: Props) {
  const [step,    setStep]    = useState<"idle" | "confirm" | "joining" | "waiting">("idle");
  const [error,   setError]   = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [uid,     setUid]     = useState<string | null>(null);
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const router = useRouter();

  const tierKey    = getTierKey(t.entry_fee);
  const style      = TIER_STYLES[tierKey] ?? TIER_STYLES.RECREATIVO;
  const spotsLeft  = t.capacity - t.players.length;
  const pct        = Math.round((t.players.length / t.capacity) * 100);
  const isFull     = spotsLeft === 0;
  const isActive   = t.status === "ACTIVE";
  const isFree     = t.entry_fee === 0;
  const hasEnough  = isFree || (balance !== null && balance >= t.entry_fee);
  const balanceAfter = balance !== null ? balance - t.entry_fee : null;

  const { secsLeft, label: cdLabel } = useCountdown(reserva?.expiresAt ?? null);
  const reservaActiva = reserva && secsLeft > 0;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setUid(null); setBalance(null); return; }
      setUid(user.uid);
      try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setBalance(data.number ?? data.coins ?? 0);
        }
      } catch { /* silencioso */ }
    });
    return () => unsub();
  }, []);

  const handleJoin = useCallback(async () => {
    if (!uid) return router.push("/");
    setStep("joining"); setError("");
    try {
      const token = await auth.currentUser!.getIdToken();
      const res   = await fetch("/api/joinTournament", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ tournamentId: t.id }),
      });
      const data = await res.json() as { error?: string; newBalance?: number; reserva?: Reserva };
      if (!res.ok) {
        if (data.error === "SALDO_INSUFICIENTE" && data.reserva) {
          setReserva(data.reserva);
          setStep("idle");
          return;
        }
        throw new Error(data.error ?? "Error desconocido");
      }
      if (data.newBalance !== undefined) setBalance(data.newBalance);
      setReserva(null);
      setStep("waiting");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setStep("confirm");
    }
  }, [uid, t.id, router]);

  return (
    <>
      {step === "waiting" && (
        <WaitingRoomModal tournamentId={t.id} onLeft={() => setStep("idle")} />
      )}

      <div className="rounded-2xl flex flex-col overflow-hidden transition-all duration-200 hover:translate-y-[-2px]"
        style={{ background: "#111318", border: `1px solid ${reservaActiva ? "rgba(255,165,0,0.4)" : style.border}` }}>

        <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${style.dot}, transparent)` }} />

        <div className="p-4 flex flex-col gap-3 flex-1">

          {/* HEADER */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border inline-block w-fit"
                style={{ background: style.badgeBg, borderColor: style.border, color: style.badgeText }}>
                <span className="mr-1" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: style.dot, verticalAlign: "middle" }} />
                {tierKey}
              </span>
              <span className="text-[11px] font-semibold" style={{ color: "#8b949e" }}>
                {t.game === "FC26" ? "EA Sports FC 26" : "eFootball"} · {MODE_LABELS[t.mode] ?? t.mode}
              </span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{
                background: t.status === "OPEN" ? "rgba(0,255,136,0.1)" : "rgba(0,212,255,0.1)",
                color:      t.status === "OPEN" ? "#00ff88"             : "#00d4ff",
                border:     `1px solid ${t.status === "OPEN" ? "rgba(0,255,136,0.3)" : "rgba(0,212,255,0.3)"}`,
              }}>
              {t.status === "OPEN" ? "● ABIERTO" : "⚔ ACTIVO"}
            </span>
          </div>

          {/* INFO GRID */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5" style={{ color: "#8b949e" }}>
              <span>🌎</span><span className="text-white font-medium">{REGION_LABELS[t.region] ?? t.region}</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ color: "#8b949e" }}>
              <span>👥</span><span className="text-white font-medium">{t.capacity} jugadores</span>
            </div>
            <div className="flex items-center gap-1.5 col-span-2" style={{ color: "#8b949e" }}>
              <span>🎟️</span>
              {isFree ? (
                <span className="font-bold" style={{ color: "#00d4ff" }}>GRATIS · Premio por Staff</span>
              ) : (
                <span>
                  <span className="font-bold text-white">{t.entry_fee.toLocaleString()}</span>
                  <span style={{ color: "#ffd700" }}> LFC </span>
                  <span style={{ color: "#6e7681" }}>(${(t.entry_fee / 1000).toFixed(2)} USD)</span>
                </span>
              )}
            </div>
          </div>

          {/* PREMIOS */}
          <div className="rounded-xl p-2.5" style={{ background: "#0b0e14", border: "1px solid #1c2028" }}>
            <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "#6e7681" }}>Premios 🏆</p>
            {t.prizes?.length > 0 ? (
              <div className="space-y-1">
                {t.prizes.slice(0, 3).map((p) => (
                  <div key={p.place} className="flex justify-between text-xs">
                    <span style={{ color: "#8b949e" }}>{p.label}</span>
                    <span className="font-bold text-white">{p.coins.toLocaleString()} <span style={{ color: "#ffd700" }}>LFC</span></span>
                  </div>
                ))}
              </div>
            ) : isFree ? (
              <p className="text-xs" style={{ color: "#8b949e" }}>Definido por el Staff 🎖️</p>
            ) : (
              <p className="text-xs font-bold text-white">{t.prize_pool.toLocaleString()} <span style={{ color: "#ffd700" }}>LFC</span> en premios</p>
            )}
          </div>

          {/* PROGRESO */}
          <div>
            <div className="flex justify-between text-[10px] mb-1" style={{ color: "#6e7681" }}>
              <span>{t.players.length} / {t.capacity} inscritos</span>
              <span style={{ color: isFull ? "#ff4757" : "#8b949e" }}>{spotsLeft} libre{spotsLeft !== 1 ? "s" : ""}</span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "#1c2028" }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: isFull ? "#ff4757" : style.dot }} />
            </div>
          </div>

          {/* ── CUPO RESERVADO ─────────────────────────── */}
          {reservaActiva && step === "idle" && (
            <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "rgba(255,140,0,0.08)", border: "1px solid rgba(255,140,0,0.35)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#ffa500" }}>⏱ CUPO RESERVADO</span>
                <span className="text-sm font-black tabular-nums" style={{ color: secsLeft < 60 ? "#ff4757" : "#ffa500" }}>{cdLabel}</span>
              </div>
              <p className="text-[10px]" style={{ color: "#8b949e" }}>
                Te faltan <strong style={{ color: "white" }}>{reserva!.faltanCoins.toLocaleString()} LFC</strong> para inscribirte. Depositá antes de que expire el tiempo.
              </p>
              <button
                onClick={() => router.push(
                  `/billetera?reserva=${encodeURIComponent(reserva!.id)}&torneo=${encodeURIComponent(reserva!.tournamentNombre)}&falta=${reserva!.faltanCoins}&expira=${encodeURIComponent(reserva!.expiresAt)}`
                )}
                className="w-full py-2 rounded-xl text-xs font-black uppercase tracking-widest"
                style={{ background: "#ffa500", color: "#0b0e14" }}>
                💰 DEPOSITAR AHORA
              </button>
            </div>
          )}

          {/* ── MODAL DE CONFIRMACION ──────────────────── */}
          {step === "confirm" && (
            <div className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: "#0b0e14", border: `1px solid ${style.border}` }}>
              <p className="text-xs font-black uppercase tracking-widest text-center text-white">Confirmar inscripción</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: "#8b949e" }}>Entrada</span>
                  <span className="font-bold" style={{ color: style.badgeText }}>{isFree ? "GRATIS" : `${t.entry_fee.toLocaleString()} LFC`}</span>
                </div>
                {!isFree && balance !== null && (
                  <>
                    <div className="flex justify-between">
                      <span style={{ color: "#8b949e" }}>Tu saldo</span>
                      <span className="font-bold text-white">{balance.toLocaleString()} LFC</span>
                    </div>
                    <div className="h-px" style={{ background: "#1c2028" }} />
                    <div className="flex justify-between">
                      <span style={{ color: "#8b949e" }}>Saldo restante</span>
                      <span className="font-bold" style={{ color: hasEnough ? "#00ff88" : "#ff4757" }}>
                        {balanceAfter !== null ? balanceAfter.toLocaleString() : "–"} LFC
                      </span>
                    </div>
                  </>
                )}
              </div>
              {error && <p className="text-[10px] text-center" style={{ color: "#ff4757" }}>{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setStep("idle"); setError(""); }}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border"
                  style={{ background: "#161b22", borderColor: "#30363d", color: "#8b949e" }}>Cancelar</button>
                <button onClick={handleJoin} disabled={!hasEnough && !isFree}
                  className="flex-1 py-2 rounded-xl text-xs font-black"
                  style={{
                    background: hasEnough || isFree ? style.btnBg : "#1c2028",
                    color:      hasEnough || isFree ? style.btnText : "#6e7681",
                    cursor:     hasEnough || isFree ? "pointer" : "not-allowed",
                  }}>✓ Confirmar</button>
              </div>
            </div>
          )}

          {/* ── JOINING ────────────────────────────────── */}
          {step === "joining" && (
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="w-4 h-4 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: style.dot }} />
              <span className="text-xs font-bold" style={{ color: style.badgeText }}>Procesando...</span>
            </div>
          )}

          {/* ── BOTON PRINCIPAL ────────────────────────── */}
          {step === "idle" && !reservaActiva && (
            <button
              onClick={() => { if (!uid) return router.push("/"); if (isFull || isActive) return; setStep("confirm"); }}
              disabled={isFull || isActive}
              className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95"
              style={isFull || isActive
                ? { background: "#161b22", color: "#6e7681", cursor: "not-allowed", border: "1px solid #30363d" }
                : { background: style.btnBg, color: style.btnText, boxShadow: `0 4px 20px ${style.dot}20` }}>
              {isFull   ? "🔒 SALA LLENA"   :
               isActive ? "⚔️ EN CURSO"      :
               isFree   ? "🎮 UNIRSE GRATIS" :
                          `⚡ UNIRSE — ${t.entry_fee.toLocaleString()} LFC`}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
