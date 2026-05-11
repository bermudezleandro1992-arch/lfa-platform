export interface Room {
  id:         string;
  game:       string;
  mode:       string;
  tier:       string;
  region:     string;
  status:     string;
  players:    string[];
  capacity:   number;
  entry_fee:  number;
  prize_pool?: number;
  created_at?: unknown;
}

export interface TournamentMatch {
  id:            string;
  tournamentId?: string;
  p1:            string;
  p2:            string;
  p1_username?:  string;
  p2_username?:  string;
  status:        string;
  winner?:       string | null;
  score?:        string;
  round?:        string;
  screenshot_url?: string;
  dispute_reason?: string;
  p1_ready?:     boolean;
  p2_ready?:     boolean;
  p1_ready_at?:  unknown;
  p2_ready_at?:  unknown;
}

export interface ChatMsg {
  id:         string;
  uid:        string;
  nombre:     string;
  texto:      string;
  timestamp?: { toMillis: () => number };
  rol?:       string;
  image_url?: string;
}

export interface UserProfile {
  uid:          string;
  nombre?:      string;
  email?:       string;
  balance?:     number;
  victorias?:   number;
  titulos?:     number;
  rol?:         string;
  avatar_url?:  string;
  ea_id?:       string;
  konami_id?:   string;
  pais?:        string;
  region?:      string;
  created_at?:  unknown;
}

export interface Transaction {
  id:          string;
  uid:         string;
  type:        string;
  amount:      number;
  description: string;
  timestamp?:  unknown;
  status?:     string;
}

export interface Ticket {
  id:           string;
  userId:       string;
  username:     string;
  category:     string;
  subject:      string;
  status:       'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority:     'NORMAL' | 'ALTA' | 'URGENTE';
  assignedTo?:  string;
  assignedName?: string;
  matchId?:     string;
  tournamentId?: string;
  created_at?:  unknown;
  updated_at?:  unknown;
  lastMsg?:     string;
  unreadStaff?: number;
  unreadUser?:  number;
}

export interface TicketMsg {
  id:         string;
  ticketId:   string;
  uid:        string;
  nombre:     string;
  texto:      string;
  image_url?: string;
  isStaff:    boolean;
  timestamp?: unknown;
}

export interface RankingEntry {
  uid:       string;
  nombre:    string;
  victorias: number;
  titulos:   number;
  copas?:    number;
  region?:   string;
  pais?:     string;
  avatar_url?: string;
}
