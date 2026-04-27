// ============================================================
// REGIONES
// ============================================================

export const REGIONS = [
  {
    value: "LATAM_SUR",
    label: "🌎 Región Sur",
    description: "Argentina, Uruguay, Chile, Perú, Brasil, Bolivia, Paraguay",
    countries: ["AR", "UY", "CL", "PE", "BR", "BO", "PY"],
  },
  {
    value: "LATAM_NORTE",
    label: "🌎 Región Norte",
    description: "México, Colombia, Venezuela, Ecuador, Rep. Dominicana, Costa Rica, Panamá y más",
    countries: ["MX", "CO", "VE", "EC", "DO", "CR", "PA", "GT", "HN", "SV", "NI", "US", "CA"],
  },
  {
    value: "AMERICA",
    label: "🌍 Región América",
    description: "Toda América: Norte, Sur, Centro y Caribe",
    countries: [
      "AR","UY","CL","PE","BR","BO","PY","MX","CO","VE","EC","DO","CR","PA","GT","HN","SV","NI","US","CA","CU","PR","HT","JM","TT","BB","LC","VC","GD","AG","DM","KN","BZ","BS","SR","GY","FK"
    ],
  },
  {
    value: "EUROPA",
    label: "🇪🇺 Región Europa",
    description: "España, Francia, Italia, Alemania, Portugal, UK, y más",
    countries: [
      "ES","PT","FR","IT","DE","GB","IE","NL","BE","CH","AT","SE","NO","DK","FI","PL","CZ","SK","HU","RO","BG","GR","HR","SI","RS","UA","BY","LT","LV","EE","LU","MC","LI","SM","VA","AL","MD","IS","MT"
    ],
  },
  {
    value: "GLOBAL",
    label: "🌐 Región Global",
    description: "Todos los países y regiones",
    countries: [], // todos
  },
] as const;
// Lista de países de América y Europa (ISO 3166-1 alpha-2, nombre español)
export const COUNTRIES_AMERICA_EUROPE = [
  // América
  { code: "AR", name: "Argentina" },
  { code: "BO", name: "Bolivia" },
  { code: "BR", name: "Brasil" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "CR", name: "Costa Rica" },
  { code: "CU", name: "Cuba" },
  { code: "DO", name: "República Dominicana" },
  { code: "EC", name: "Ecuador" },
  { code: "SV", name: "El Salvador" },
  { code: "GT", name: "Guatemala" },
  { code: "HN", name: "Honduras" },
  { code: "JM", name: "Jamaica" },
  { code: "MX", name: "México" },
  { code: "NI", name: "Nicaragua" },
  { code: "PA", name: "Panamá" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Perú" },
  { code: "PR", name: "Puerto Rico" },
  { code: "UY", name: "Uruguay" },
  { code: "US", name: "Estados Unidos" },
  { code: "VE", name: "Venezuela" },
  { code: "CA", name: "Canadá" },
  { code: "BS", name: "Bahamas" },
  { code: "BZ", name: "Belice" },
  { code: "SR", name: "Surinam" },
  { code: "GY", name: "Guyana" },
  { code: "TT", name: "Trinidad y Tobago" },
  { code: "BB", name: "Barbados" },
  { code: "LC", name: "Santa Lucía" },
  { code: "VC", name: "San Vicente y las Granadinas" },
  { code: "GD", name: "Granada" },
  { code: "AG", name: "Antigua y Barbuda" },
  { code: "DM", name: "Dominica" },
  { code: "KN", name: "San Cristóbal y Nieves" },
  { code: "FK", name: "Islas Malvinas" },
  // Europa
  { code: "ES", name: "España" },
  { code: "PT", name: "Portugal" },
  { code: "FR", name: "Francia" },
  { code: "IT", name: "Italia" },
  { code: "DE", name: "Alemania" },
  { code: "GB", name: "Reino Unido" },
  { code: "IE", name: "Irlanda" },
  { code: "NL", name: "Países Bajos" },
  { code: "BE", name: "Bélgica" },
  { code: "CH", name: "Suiza" },
  { code: "AT", name: "Austria" },
  { code: "SE", name: "Suecia" },
  { code: "NO", name: "Noruega" },
  { code: "DK", name: "Dinamarca" },
  { code: "FI", name: "Finlandia" },
  { code: "PL", name: "Polonia" },
  { code: "CZ", name: "Chequia" },
  { code: "SK", name: "Eslovaquia" },
  { code: "HU", name: "Hungría" },
  { code: "RO", name: "Rumania" },
  { code: "BG", name: "Bulgaria" },
  { code: "GR", name: "Grecia" },
  { code: "HR", name: "Croacia" },
  { code: "SI", name: "Eslovenia" },
  { code: "RS", name: "Serbia" },
  { code: "UA", name: "Ucrania" },
  { code: "BY", name: "Bielorrusia" },
  { code: "LT", name: "Lituania" },
  { code: "LV", name: "Letonia" },
  { code: "EE", name: "Estonia" },
  { code: "LU", name: "Luxemburgo" },
  { code: "MC", name: "Mónaco" },
  { code: "LI", name: "Liechtenstein" },
  { code: "SM", name: "San Marino" },
  { code: "VA", name: "Ciudad del Vaticano" },
  { code: "AL", name: "Albania" },
  { code: "MD", name: "Moldavia" },
  { code: "IS", name: "Islandia" },
  { code: "MT", name: "Malta" },
];

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
  FREE:        { label: "GRATIS",      color: "cyan",   minCoins: 0,     maxCoins: 0,     coinLabel: "Gratis",              usdLabel: "Premio por Staff" },
  RECREATIVO:  { label: "RECREATIVO",  color: "green",  minCoins: 500,   maxCoins: 999,   coinLabel: "500 – 999 LFC",       usdLabel: "~$0.50–$0.99" },
  COMPETITIVO: { label: "COMPETITIVO", color: "yellow", minCoins: 1000,  maxCoins: 9999,  coinLabel: "1.000 – 9.999 LFC",   usdLabel: "$1 – $9.99" },
  ELITE:       { label: "ELITE",       color: "red",    minCoins: 10000, maxCoins: 20000, coinLabel: "10.000 – 20.000 LFC", usdLabel: "$10 – $20" },
} as const;

export function getRoomTier(entryFee: number) {
  if (entryFee === 0)    return ROOM_TIERS.FREE;
  if (entryFee < 1000)   return ROOM_TIERS.RECREATIVO;
  if (entryFee < 10000)  return ROOM_TIERS.COMPETITIVO;
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
  capacity:     2 | 4 | 6 | 8 | 12 | 16 | 32 | 64;
  entry_fee:    number;
  prize_pool:   number;
  platform_fee: number;
  prizes:       PrizeSlot[];
  tier:         keyof typeof ROOM_TIERS;
  free:         boolean;
  special?:     boolean; // true = solo sábado/domingo
}

const DISTRIBUTIONS: Record<number, { label: string; pct: number }[]> = {
  2:  [{ label: "🥇 1°", pct: 100 }],
  4:  [{ label: "🥇 1°", pct: 70  }, { label: "🥈 2°", pct: 30 }],
  6:  [{ label: "🥇 1°", pct: 70  }, { label: "🥈 2°", pct: 30 }],
  8:  [{ label: "🥇 1°", pct: 70  }, { label: "🥈 2°", pct: 30 }],
  12: [{ label: "🥇 1°", pct: 60  }, { label: "🥈 2°", pct: 30 }, { label: "🥉 3°", pct: 10 }],
  16: [{ label: "🥇 1°", pct: 70  }, { label: "🥈 2°", pct: 30 }],
  32: [{ label: "🥇 1°", pct: 60  }, { label: "🥈 2°", pct: 30 }, { label: "🥉 3°", pct: 10 }],
  64: [{ label: "🥇 1°", pct: 50  }, { label: "🥈 2°", pct: 30 }, { label: "🥉 3°", pct: 15 }, { label: "4°", pct: 5 }],
};

function buildTemplate(
  id: string, name: string,
  capacity: 2 | 4 | 6 | 8 | 12 | 16 | 32 | 64,
  entry_fee: number,
  free = false,
  special = false,
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
    entry_fee === 0 ? "FREE" : entry_fee < 1000 ? "RECREATIVO" : entry_fee < 10000 ? "COMPETITIVO" : "ELITE";
  return { id, name, capacity, entry_fee, prize_pool, platform_fee, prizes, tier, free, special };
}

export const TOURNAMENT_TEMPLATES: TournamentTemplate[] = [
  // ── DUELOS 1v1 ─────────────────────────────────────────────────
  buildTemplate("DUEL_REC",   "Duelo Express",       2,       500),
  buildTemplate("DUEL_COM",   "Duelo Competitivo",   2,     2_000),
  // ── 4 JUGADORES ────────────────────────────────────────────────
  buildTemplate("S4_FREE",    "Copa 4 Free",          4,       0, true),
  buildTemplate("S4_REC",     "Copa 4 Express",       4,     500),
  // ── 6 JUGADORES ────────────────────────────────────────────────
  buildTemplate("S6_FREE",    "Copa 6 Free",          6,       0, true),
  buildTemplate("S6_REC",     "Copa 6 Express",       6,     500),
  buildTemplate("S6_COM",     "Copa 6 Pro",           6,     2_000),
  // ── 8 JUGADORES ────────────────────────────────────────────────
  buildTemplate("S8_FREE",    "Copa 8 Free",          8,       0, true),
  buildTemplate("S8_REC",     "Copa 8 Express",       8,     500),
  buildTemplate("S8_COM",     "Copa 8 Pro",           8,     2_000),
  // ── 12 JUGADORES ───────────────────────────────────────────────
  buildTemplate("S12_REC",    "Copa 12 Express",     12,     500),
  buildTemplate("S12_COM",    "Copa 12 Pro",         12,     2_000),
  // ── 16 JUGADORES ───────────────────────────────────────────────
  buildTemplate("S16_FREE",   "Copa 16 Free",        16,       0, true),
  buildTemplate("S16_ELT",    "Copa 16 Elite",       16,    10_000),
  // ── 32 JUGADORES — ESPECIALES SÁB/DOM ─────────────────────────
  buildTemplate("SP32_COM",   "Gran Copa 32 Pro",    32,     2_000, false, true),
  buildTemplate("SP32_ELT",   "Gran Copa 32 Elite",  32,    10_000, false, true),
];

// Premios fijos para salas FREE (fondo de marketing)
export const FREE_PRIZE_OVERRIDES: Record<string, number[]> = {
  S4_FREE:  [200, 50],
  S6_FREE:  [250, 100],
  S8_FREE:  [300, 100],
  S16_FREE: [450, 150],
};

export const COINS_PER_USDT      = 1_000;
export const MIN_WITHDRAWAL      = 2_000;
export const DISPUTE_MINUTES     = 10;
export const WAIT_ALERT_MINUTES  = 10;
export const WAIT_EXTEND_MINUTES = 5;
