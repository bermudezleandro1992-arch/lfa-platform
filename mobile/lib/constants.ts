// ── Paleta ──────────────────────────────────────────────
export const CLR = {
  bg:      '#0b0e14',
  card:    '#161b22',
  border:  '#30363d',
  neon:    '#00ff88',
  gold:    '#ffd700',
  blue:    '#00c3ff',
  purple:  '#9c5fff',
  lav:     '#a371f7',
  red:     '#ff4757',
  pink:    '#ff00cc',
  text:    '#e6edf3',
  muted:   '#8b949e',
  dim:     '#484f58',
};

// ── Tiers ────────────────────────────────────────────────
export const TIER_CLR: Record<string, string> = {
  FREE:        '#00d4ff',
  RECREATIVO:  '#00ff88',
  COMPETITIVO: '#ffd700',
  ELITE:       '#ff4757',
};

// ── Game labels ──────────────────────────────────────────
export const GL: Record<string, string> = {
  FC26:            'FC 26',
  EFOOTBALL:       'eFootball',
  EFOOTBALL_MOBILE:'eFootball Mobile',
  FC_MOBILE:       'FC Mobile',
};

export const ML: Record<string, string> = {
  GENERAL_95:  '95 General',
  ULTIMATE:    'Ultimate Team',
  DREAM_TEAM:  'Dream Team',
  GENUINOS:    'Genuinos',
};

export const RL: Record<string, string> = {
  LATAM_SUR:   'LATAM Sur',
  LATAM_NORTE: 'LATAM Norte',
  AMERICA:     'América',
  GLOBAL:      'Global',
  EUROPA:      'Europa',
};

// ── Status colors ─────────────────────────────────────────
export const STATUS_CLR: Record<string, string> = {
  OPEN:           CLR.neon,
  ACTIVE:         CLR.gold,
  FINISHED:       CLR.dim,
  WAITING:        CLR.neon,
  PENDING_RESULT: CLR.gold,
  DISPUTE:        CLR.red,
  CLOSED:         CLR.dim,
};

// ── Ticket categories ──────────────────────────────────────
export const TICKET_CATS = [
  { value: 'DISPUTA',   label: '⚖️ Disputa de resultado', color: CLR.red    },
  { value: 'PAGO',      label: '💳 Problema de pago',     color: CLR.gold   },
  { value: 'TECNICO',   label: '🔧 Problema técnico',     color: CLR.blue   },
  { value: 'CUENTA',    label: '👤 Problema de cuenta',   color: CLR.purple },
  { value: 'OTRO',      label: '📋 Otro motivo',          color: CLR.muted  },
] as const;

export const TICKET_STATUS_CLR: Record<string, string> = {
  OPEN:        CLR.neon,
  IN_PROGRESS: CLR.gold,
  RESOLVED:    CLR.blue,
  CLOSED:      CLR.dim,
};

export const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://lfa-platform.web.app';
