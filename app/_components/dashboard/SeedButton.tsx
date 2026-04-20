"use client";

import { useState }        from "react";
import { collection,
         addDoc,
         serverTimestamp } from "firebase/firestore";
import { db, auth }        from "@/lib/firebase";

// UID del admin hardcodeado en las Firestore Rules
const ADMIN_UID = "2bOrFxTAcPgFPoHKJHQfYxoQJpw1";

const SEEDS = [
  { game: "FC26", mode: "GENERAL_95", region: "LATAM_SUR",   capacity: 8,  entry_fee: 0,     prize_pool: 0,     tier: "FREE",        free: true,  prizes: [{ place: 1, label: "🥇 1°", percentage: 100, coins: 0 }] },
  { game: "FC26", mode: "GENERAL_95", region: "LATAM_NORTE", capacity: 8,  entry_fee: 0,     prize_pool: 0,     tier: "FREE",        free: true,  prizes: [{ place: 1, label: "🥇 1°", percentage: 100, coins: 0 }] },
  { game: "FC26", mode: "GENERAL_95", region: "LATAM_SUR",   capacity: 8,  entry_fee: 500,   prize_pool: 3500,  tier: "RECREATIVO",  free: false, prizes: [{ place: 1, label: "🥇 1°", percentage: 70, coins: 2450 }, { place: 2, label: "🥈 2°", percentage: 30, coins: 1050 }] },
  { game: "FC26", mode: "ULTIMATE",   region: "LATAM_SUR",   capacity: 16, entry_fee: 800,   prize_pool: 11200, tier: "RECREATIVO",  free: false, prizes: [{ place: 1, label: "🥇 1°", percentage: 70, coins: 7840 }, { place: 2, label: "🥈 2°", percentage: 30, coins: 3360 }] },
  { game: "FC26", mode: "GENERAL_95", region: "LATAM_SUR",   capacity: 8,  entry_fee: 1000,  prize_pool: 7000,  tier: "COMPETITIVO", free: false, prizes: [{ place: 1, label: "🥇 1°", percentage: 70, coins: 4900 }, { place: 2, label: "🥈 2°", percentage: 30, coins: 2100 }] },
  { game: "FC26", mode: "GENERAL_95", region: "AMERICA",     capacity: 32, entry_fee: 3000,  prize_pool: 84000, tier: "COMPETITIVO", free: false, prizes: [{ place: 1, label: "🥇 1°", percentage: 60, coins: 50400 }, { place: 2, label: "🥈 2°", percentage: 30, coins: 25200 }, { place: 3, label: "🥉 3°", percentage: 10, coins: 8400 }] },
  { game: "FC26", mode: "GENERAL_95", region: "GLOBAL",      capacity: 8,  entry_fee: 10000, prize_pool: 70000, tier: "ELITE",       free: false, prizes: [{ place: 1, label: "🥇 1°", percentage: 70, coins: 49000 }, { place: 2, label: "🥈 2°", percentage: 30, coins: 21000 }] },
  { game: "EFOOTBALL", mode: "DREAM_TEAM", region: "LATAM_SUR",   capacity: 8, entry_fee: 0,    prize_pool: 0,    tier: "FREE",        free: true,  prizes: [{ place: 1, label: "🥇 1°", percentage: 100, coins: 0 }] },
  { game: "EFOOTBALL", mode: "GENUINOS",   region: "LATAM_NORTE", capacity: 8, entry_fee: 1000, prize_pool: 7000, tier: "COMPETITIVO", free: false, prizes: [{ place: 1, label: "🥇 1°", percentage: 70, coins: 4900 }, { place: 2, label: "🥈 2°", percentage: 30, coins: 2100 }] },
];

export default function SeedButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [count, setCount]   = useState(0);

  const seed = async () => {
    const user = auth.currentUser;
    if (!user || user.uid !== ADMIN_UID) {
      alert("Solo el admin puede ejecutar el seed.");
      return;
    }
    setStatus("loading");
    try {
      let n = 0;
      for (const data of SEEDS) {
        await addDoc(collection(db, "tournaments"), {
          ...data, status: "OPEN", players: [], created_at: serverTimestamp(),
        });
        n++;
      }
      setCount(n);
      setStatus("done");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {status === "done" && (
        <div className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ background: "rgba(0,255,136,0.15)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.3)" }}>
          ✓ {count} torneos creados
        </div>
      )}
      {status === "error" && (
        <div className="text-xs px-3 py-1.5 rounded-full" style={{ background: "rgba(255,71,87,0.15)", color: "#ff4757", border: "1px solid rgba(255,71,87,0.3)" }}>
          ✗ Error — revisá Firestore Rules
        </div>
      )}
      {process.env.NODE_ENV === "development" && status !== "done" && (
        <button onClick={seed} disabled={status === "loading"}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
          style={{ background: "#ffd700", color: "#0b0e14" }}>
          {status === "loading" ? "Creando..." : "🧪 Seed Torneos"}
        </button>
      )}
    </div>
  );
}
