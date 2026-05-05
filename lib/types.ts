// Tipos compartidos para detección de región — seguros en cliente y servidor
export interface RegionDetectionResult {
  region: 'LATAM_SUR' | 'LATAM_NORTE' | 'AMERICA' | 'GLOBAL' | 'EUROPA';
  country: string;
  countryName: string;
  city: string;
  isVpn: boolean;
  ip?: string;
  isBanned?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIGAS 1VS1 — SomosLFA PRO
// ─────────────────────────────────────────────────────────────────────────────

export type LeagueGame     = 'efootball' | 'fc26' | 'mobile';
export type LeaguePlatform = 'Crossplay' | 'PS5' | 'Xbox' | 'PC' | 'Mobile';
export type LeagueMode     =
  | 'dream_team' | 'ultimate_team'
  | 'general_95' | 'seleccion' | 'equipos';
export type LeagueRegion   = 'LATAM_SUR' | 'LATAM_NORTE' | 'GLOBAL';
export type LeagueStatus   = 'inscripcion' | 'activa' | 'playoffs' | 'finalizada';

export type MatchStatus =
  | 'pending'     // esperando que se "desafíen"
  | 'challenged'  // uno tocó Desafiar, esperando confirmación de sala
  | 'validating'  // foto subida, countdown 10 min
  | 'closed'      // cerrado con resultado
  | 'dispute'     // en disputa, staff requerido
  | 'bye';        // jornada libre (impar)

export interface ProLeague {
  id: string;
  name: string;
  game: LeagueGame;
  mode: LeagueMode | string;
  platform: LeaguePlatform | string;
  region: LeagueRegion;
  status: LeagueStatus;
  max_players: number;
  current_players: number;
  current_round: number;
  total_rounds: number;
  rules: string;
  prize_info: string;
  entry_fee: number;
  banner_url?: string;
  created_at: unknown;
  start_date?: unknown;
  division?: string;               // 'A' | 'B' | 'C' | 'D' | 'GLOBAL'
  country_restriction?: string;    // country name or 'GLOBAL'
  promotion_relegation?: boolean;  // top 4 up, bottom 4 down
}

export interface LeagueParticipant {
  uid: string;
  display_name: string;
  team_name: string;
  logo_url: string;       // URL o emoji/código de escudo
  platform_id: string;   // PSN / Gamertag / Konami ID / EA ID
  whatsapp: string;
  country: string;
  pts: number;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  joined_at: unknown;
}

export interface LeagueMatch {
  id: string;
  league_id: string;
  round: number;
  type?: 'roundrobin' | 'playoff';
  playoff_round?: string;
  player1_seed?: number;
  player2_seed?: number;
  player1_uid: string;
  player2_uid: string;
  player1_name: string;
  player2_name: string;
  player1_team: string;
  player2_team: string;
  player1_logo: string;
  player2_logo: string;
  player1_whatsapp: string;
  player2_whatsapp: string;
  player1_platform_id: string;
  player2_platform_id: string;
  status: MatchStatus;
  score: Record<string, number> | null;
  winner_uid: string | null;
  photo_url: string | null;
  ocr_score: { home: number; away: number } | null;
  ocr_confidence: number | null;
  reported_by: string | null;
  validation_deadline: number | null;
  room_code: string | null;
  dispute_reason: string | null;
  created_at: unknown;
  updated_at: unknown;
}
