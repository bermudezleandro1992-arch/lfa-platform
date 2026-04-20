export interface Match {
  id:              string;
  p1:              string;
  p2:              string;
  score:           string;
  winner:          string | null;
  status:          "WAITING" | "PENDING_RESULT" | "DISPUTE" | "FINISHED";
  reported_by?:    string;
  screenshot_url?: string;
  dispute_deadline?: FirebaseFirestore.Timestamp;
}
export interface Brackets { [round: string]: Match[]; }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isPow2(n: number) { return n >= 2 && n <= 64 && (n & (n - 1)) === 0; }

export function generateBrackets(players: string[]): Brackets {
  if (!isPow2(players.length))
    throw new Error(`Jugadores inválidos: ${players.length}. Debe ser 2, 4, 8, 16, 32 o 64.`);

  const shuffled    = shuffle(players);
  const totalRounds = Math.log2(shuffled.length);
  const brackets: Brackets = {};

  // Round 1 con jugadores reales
  brackets["round_1"] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    brackets["round_1"].push({
      id: `match_r1_${i / 2 + 1}`, p1: shuffled[i], p2: shuffled[i + 1],
      score: "", winner: null, status: "WAITING",
    });
  }

  // Rondas siguientes como TBD
  for (let r = 2; r <= totalRounds; r++) {
    const name   = r === totalRounds ? "final" : `round_${r}`;
    const count  = shuffled.length / Math.pow(2, r);
    brackets[name] = Array.from({ length: count }, (_, i) => ({
      id: `match_r${r}_${i + 1}`, p1: "TBD", p2: "TBD",
      score: "", winner: null, status: "WAITING",
    }));
  }

  return brackets;
}