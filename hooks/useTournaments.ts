import { useState, useEffect }                         from "react";
import { collection, query, where, onSnapshot,
         QueryConstraint }                             from "firebase/firestore";
import { db }                                          from "@/lib/firebase";
import type { Game, GameMode, Region }                 from "@/lib/constants";

export interface PrizeSlot { place: number; label: string; percentage: number; coins: number; }

export interface Tournament {
  id:           string;
  game:         Game;
  region:       Region;
  mode:         GameMode;
  capacity:     number;
  entry_fee:    number;
  prize_pool:   number;
  prizes:       PrizeSlot[];
  tier:         "FREE" | "RECREATIVO" | "COMPETITIVO" | "ELITE";
  status:       "OPEN" | "ACTIVE" | "DISPUTE" | "FINISHED" | "CANCELLED";
  players:      string[];
  template_id:  string;
  free:         boolean;
  waiting_alert_sent?:  boolean;
  waiting_expires_at?:  any;
  created_at:   any;
  // Organized tournament fields
  tipo?:                 "automatico" | "organizado";
  organizador_uid?:      string;
  organizador_nombre?:   string;
  organizador_avatar?:   string;
  organizador_twitch?:   string;
  organizador_kick?:     string;
  organizador_youtube?:  string;
  descripcion?:          string;
  premio_externo?:       boolean;
  premio_descripcion?:   string;
  manual_advance?:       boolean;
}

interface Filters {
  game?:   Game;
  region?: Region;
  mode?:   GameMode;
}

export function useTournaments(filters: Filters) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const constraints: QueryConstraint[] = [
      where("status", "==", "OPEN"),
    ];
    if (filters.game)   constraints.push(where("game",   "==", filters.game));
    if (filters.region) constraints.push(where("region", "==", filters.region));
    if (filters.mode)   constraints.push(where("mode",   "==", filters.mode));

    const q = query(collection(db, "tournaments"), ...constraints);

    const unsub = onSnapshot(q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Tournament[];
        // Ordenar en cliente para evitar índice compuesto en Firestore
        list.sort((a, b) => {
          const ta = a.created_at?.toMillis?.() ?? 0;
          const tb = b.created_at?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setTournaments(list);
        setLoading(false);
      },
      () => { setError("Error al cargar torneos."); setLoading(false); }
    );
    return () => unsub();
  }, [filters.game, filters.region, filters.mode]);

  return { tournaments, loading, error };
}
