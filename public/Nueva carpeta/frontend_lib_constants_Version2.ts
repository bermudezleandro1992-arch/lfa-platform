// ============================================================
// REGIONES
// ============================================================
export const REGIONS = [
  {
    value: "LATAM_SUR",
    label: "🌎 LATAM Sur",
    description: "Perú, Argentina, Chile, Brasil, Uruguay, Bolivia, Paraguay, Ecuador",
    countries: ["PE", "AR", "CL", "BR", "UY", "BO", "PY", "EC"],
  },
  {
    value: "LATAM_NORTE",
    label: "🌎 LATAM Norte",
    description: "México, Colombia, Venezuela, Rep. Dominicana, Costa Rica, Panamá",
    countries: ["MX", "CO", "VE", "DO", "CR", "PA", "GT", "HN", "SV", "NI"],
  },
  {
    value: "AMERICA",
    label: "🌍 América (SUR + NORTE)",
    description: "Toda Latinoamérica unificada",
    countries: [],
  },
  {
    value: "GLOBAL",
    label: "🌐 Global",
    description: "Mundial — España, USA, Europa y más",
    countries: [],
  },
] as const;

export type Region = (typeof REGIONS)[number]["value"];

// ============================================================
// JUEGOS Y MODOS
// ============================================================
export const GAMES = [
  {
    value: "FC26",
    label: "EA Sports FC 26",
    logo: "/logos/fc26.png",
    modes: [
      { value: "GENERAL_95", label: "95 General",    icon: "⚽" },
      { value: "ULTIMATE",   label: "Ultimate Team", icon: "🃏" },
    ],
  },
  {
    value: "EFOOTBALL",
    label: "eFootball",
    logo: "/logos/efootball.png",
    modes: [
      { value: "DREAM_TEAM", label: "Dream Team", icon: "⭐" },
      { value: "GENUINOS",   label: "Genuinos",   icon: "🏅" },
    ],
  },
] as const;

export type Game     = (typeof GAMES)[number]["value"];
export type GameMode = "GENERAL_95" | "ULTIMATE" | "DREAM_TEAM" | "GENUINOS";

// ============================================================
// PLATAFORMAS — CROSSPLAY SIEMPRE ACTIVO
// ============================================================
export const PLATFORMS = [
  { value: "PS5",  label: "PlayStation 5", icon: "/logos/ps5.svg"  },
  { value: "XBOX", label: "Xbox Series",   icon: "/logos/xbox.svg" },
  { value: "PC",   label: "PC / Steam",    icon: "/logos/pc.svg"   },
] as const;

// ============================================================
// TIERS DE SALA
// ============================================================
export const ROOM_TIERS = {
  RECREATIVO:  { label: "RECREATIVO",  color: "green",  minCoins: 0,    maxCoins: 499        },
  COMPETITIVO: { label: "COMPETITIVO", color: "yellow", minCoins: 500,  maxCoins: 2999       },
  ELITE:       { label: "ELITE",       color: "red",    minCoins: 3000, maxCoins: Infinity   },
} as const;

export function getRoomTier(entryFee: number) {
  if (entryFee === 0)    return ROOM_TIERS.RECREATIVO;
  if (entryFee < 3000)   return ROOM_TIERS.COMPETITIVO;
  return ROOM_TIERS.ELITE;
}

// ============================================================
// PLANTILLAS DE TORNEOS
// ============================================================
export interface PrizeSlot {
  place:      number;
  label:      string;
  percentage: number;
  coins:      number;
}

export interface TournamentTemplate {
  id:           string;
  name:         string;
  capacity:     2 | 8 | 16 | 32 | 64;
  entry_fee:    number;
  prize_pool:   number;
  platform_fee: number;
  prizes:       PrizeSlot[];
  tier:         keyof typeof ROOM_TIERS;
  free:         boolean;
}

const DISTRIBUTIONS: Record<number, { label: string; pct: number }[]> = {
  2:  [{ label: "🥇 1°", pct: 100 }],
  8:  [{ label: "🥇 1°", pct: 70  }, { label: "🥈 2°", pct: 30 }],
  16: [{ label: "🥇 1°", pct: 70  }, { label: "🥈 2°", pct: 30 }],
  32: [{ label: "🥇 1°", pct: 60  }, { label: "🥈 2°", pct: 30 }, { label: "🥉 3°", pct: 10 }],
  64: [{ label: "🥇 1°", pct: 50  }, { label: "🥈 2°", pct: 30 }, { label: "🥉 3°", pct: 15 }, { label: "4°", pct: 5 }],
};

function buildTemplate(
  id: string, name: string,
  capacity: 2 | 8 | 16 | 32 | 64,
  entry_fee: number,
  free = false
): TournamentTemplate {
  const total        = entry_fee * capacity;
  const platform_fee = Math.floor(total * 0.1);
  const prize_pool   = total - platform_fee;
  const dist         = DISTRIBUTIONS[capacity] ?? DISTRIBUTIONS[2];
  const prizes: PrizeSlot[] = dist.map((d, i) => ({
    place:      i + 1,
    label:      d.label,
    percentage: d.pct,
    coins:      Math.floor((prize_pool * d.pct) / 100),
  }));
  const tier: keyof typeof ROOM_TIERS =
    entry_fee === 0 ? "RECREATIVO" : entry_fee < 3000 ? "COMPETITIVO" : "ELITE";
  return { id, name, capacity, entry_fee, prize_pool, platform_fee, prizes, tier, free };
}

export const TOURNAMENT_TEMPLATES: TournamentTemplate[] = [
  // FREE
  buildTemplate("FREE_8",    "Sala Free 8",    8,  0,      true),
  buildTemplate("FREE_16",   "Sala Free 16",   16, 0,      true),
  buildTemplate("FREE_32",   "Sala Free 32",   32, 0,      true),
  // DUELOS 1vs1
  buildTemplate("DUEL_LOW",  "Duelo Express",  2,  1_000),
  buildTemplate("DUEL_PRO",  "Duelo Pro",      2,  5_000),
  // 8 JUGADORES
  buildTemplate("R8_LOW",    "Relámpago Low",  8,  500),
  buildTemplate("R8_VIP",    "Relámpago VIP",  8,  5_000),
  // 16 JUGADORES
  buildTemplate("S16_STD",   "Standard 16",    16, 1_000),
  buildTemplate("S16_PRO",   "Standard Pro",   16, 3_000),
  // 32 JUGADORES
  buildTemplate("SP32_STD",  "Semi-Pro 32",    32, 1_000),
  buildTemplate("SP32_VIP",  "Semi-Pro VIP",   32, 5_000),
  // 64 JUGADORES
  buildTemplate("GL64_LOW",  "Gran LFA 64",    64, 500),
  buildTemplate("GL64_PRO",  "Gran LFA Pro",   64, 2_000),
];

// Premios fijos para salas FREE (fondo de marketing)
export const FREE_PRIZE_OVERRIDES: Record<string, number[]> = {
  FREE_8:  [300, 100],
  FREE_16: [450, 150],
  FREE_32: [600, 300, 100],
};

export const COINS_PER_USDT      = 1_000;
export const MIN_WITHDRAWAL      = 2_000;
export const DISPUTE_MINUTES     = 10;
export const WAIT_ALERT_MINUTES  = 10;
export const WAIT_EXTEND_MINUTES = 5;