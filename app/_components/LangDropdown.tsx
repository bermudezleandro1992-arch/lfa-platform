'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos e i18n
// ─────────────────────────────────────────────────────────────────────────────
export type LangCode = 'es' | 'pt' | 'en';

export interface Translations {
  slogan1:    string;
  slogan2:    string;
  email:      string;
  pass:       string;
  obligatorio: string;
  id_jugador:  string;
  olvide_pass: string;
  btn_entrar:  string;
  o_accede:    string;
  btn_google:  string;
  btn_instalar: string;
  leido_todo:   string;
  foot_titulo:  string;
  foot_desc:    string;
  foot_reg:     string;
  foot_term:    string;
  foot_priv:    string;
  foot_reem:    string;
  redes:        string;
  derechos:     string;
  legal_titulo: string;
  legal_desc:   string;
  legal_btn:    string;
  // Hub
  hub_selecciona:  string;
  hub_salir:       string;
  hub_billetera:   string;
  hub_tienda:      string;
  hub_proximamente: string;
  hub_cantina:     string;
  hub_cargando:    string;
  // Hub modos
  hub_modo_arena_title:   string;
  hub_modo_arena_desc:    string;
  hub_modo_liga_title:    string;
  hub_modo_liga_desc:     string;
  hub_modo_coop_title:    string;
  hub_modo_coop_desc:     string;
  hub_modo_clubes_title:  string;
  hub_modo_clubes_desc:   string;
  hub_pronto:             string;
  // Dashboard
  dash_perfil:      string;
  dash_tab_arena:   string;
  dash_tab_ranking: string;
  dash_tab_tv:      string;
  dash_tab_ping:    string;
  // BuscarSala
  bs_live:          string;
  bs_esports:       string;
  bs_label_game:    string;
  bs_label_mode:    string;
  bs_label_region:  string;
  bs_label_country: string;
  bs_label_tier:    string;
  bs_any_mode:      string;
  bs_any_region:    string;
  bs_any_country:   string;
  bs_any_tier:      string;
  bs_any_tier_sub:  string;
  bs_btn_search:    string;
  bs_btn_searching: string;
  bs_no_rooms:      string;
  bs_no_rooms_hint: string;
  // Landing page
  home_modos_title: string;
  home_modos_sub:   string;
  home_como_title:  string;
  home_como_sub:    string;
  home_paso1_title: string;
  home_paso1_desc:  string;
  home_paso2_title: string;
  home_paso2_desc:  string;
  home_paso3_title: string;
  home_paso3_desc:  string;
  home_listo_title: string;
  home_listo_sub:   string;
  home_crear_cuenta: string;
  home_ya_tengo:    string;
  home_slogan1:     string;
  home_slogan2:     string;
  home_arena_desc:  string;
  home_liga_desc:   string;
  home_coop_desc:   string;
  home_clubes_desc: string;
}

const LANGUAGES: Record<LangCode, { flag: string; label: string; name: string }> = {
  es: { flag: 'https://flagcdn.com/w20/ar.png', label: 'ES', name: 'Español'   },
  pt: { flag: 'https://flagcdn.com/w20/br.png', label: 'PT', name: 'Português' },
  en: { flag: 'https://flagcdn.com/w20/us.png', label: 'EN', name: 'English'   },
};

export const TRANSLATIONS: Record<LangCode, Translations> = {
  es: {
    slogan1: 'LIGA DE FÚTBOL AUTOMATIZADA', slogan2: 'DOMINÁ LA CANCHA',
    email: 'Correo Electrónico', pass: 'Contraseña (Registro: 8+ caract, mayúscula, símbolo)',
    obligatorio: '⚠️ Obligatorio: EA ID (para FC26) o Konami ID (para eFootball)', id_jugador: 'EA ID (FC26) / Konami ID (eFootball)',
    olvide_pass: '¿Olvidaste tu contraseña?', btn_entrar: 'ENTRAR / REGISTRARSE',
    o_accede: 'O ACCEDÉ CON', btn_google: 'Continuar con Google',
    btn_instalar: '📲 INSTALAR APP LFA',
    leido_todo: 'Acepto el Reglamento, Términos, Privacidad y Reembolsos.',
    foot_titulo: 'LFA - Liga de Fútbol Automatizada',
    foot_desc: 'Torneos & Ligas eFootball · FC 26',
    foot_reg: 'Reglamento Oficial', foot_term: 'Términos y Condiciones',
    foot_priv: 'Políticas de Privacidad', foot_reem: 'Política de Reembolsos',
    redes: 'NUESTRAS REDES:', derechos: '© 2026 LFA. Todos los derechos reservados. Jugá con responsabilidad.',
    legal_titulo: '¡Último paso, Leyenda!',
    legal_desc: 'Para competir por dinero real y mantener el juego limpio en LFA, es obligatorio aceptar nuestras reglas.',
    legal_btn: 'CONFIRMAR Y ENTRAR A LA CANCHA',
    hub_selecciona: 'SELECCIONÁ TU COMPETICIÓN',
    hub_salir: 'SALIR',
    hub_billetera: 'BILLETERA',
    hub_tienda: 'TIENDA',
    hub_proximamente: 'PRÓXIMAMENTE',
    hub_cantina: 'CANTINA LFA — CHAT GENERAL',
    hub_cargando: 'CARGANDO HUB...',
    dash_perfil: 'PERFIL',
    hub_modo_arena_title:  'ARENA 1VS1',
    hub_modo_arena_desc:   'Torneos relámpago individuales.',
    hub_modo_liga_title:   'LIGA 1VS1',
    hub_modo_liga_desc:    'Ligas largas oficiales de temporada.',
    hub_modo_coop_title:   'CO-OP 2VS2',
    hub_modo_coop_desc:    'Torneos en parejas.',
    hub_modo_clubes_title: 'LIGA CLUBES',
    hub_modo_clubes_desc:  'Compite con tu club oficial.',
    hub_pronto:            'PRONTO',
    dash_tab_arena:        'ARENA 1VS1',
    dash_tab_ranking:      'RANKING',
    dash_tab_tv:           'LFA TV',
    dash_tab_ping:         'PING',
    bs_live:          'Arena 1VS1 · En vivo',
    bs_esports:       'eSports Competitivo · Tiempo Real · LATAM',
    bs_label_game:    '1. Juego',
    bs_label_mode:    '2. Modo de juego',
    bs_label_region:  '3. Tu región',
    bs_label_country: '4. País',
    bs_label_tier:    '4. Nivel de apuesta',
    bs_any_mode:      '🎮 Cualquier modo',
    bs_any_region:    '🌐 Cualquier región',
    bs_any_country:   '— Cualquier país —',
    bs_any_tier:      'Cualquiera',
    bs_any_tier_sub:  'Todos los niveles',
    bs_btn_search:    '⚡ BUSCAR SALA DISPONIBLE',
    bs_btn_searching: 'Buscando sala...',
    bs_no_rooms:      'No hay salas disponibles',
    bs_no_rooms_hint: 'Cambiá los filtros o volvé en unos minutos. El staff crea nuevas salas regularmente.',
    home_modos_title: 'MODOS DE COMPETICIÓN',
    home_modos_sub:   'Elegí tu formato favorito',
    home_como_title:  '¿CÓMO FUNCIONA?',
    home_como_sub:    'Simple, rápido, transparente',
    home_paso1_title: 'REGISTRATE',
    home_paso1_desc:  'Creá tu cuenta gratis con email o Google en menos de 1 minuto.',
    home_paso2_title: 'ELEGÍ UN TORNEO',
    home_paso2_desc:  'Salas de 2, 4, 6, 8, 12 y 16 jugadores todo el día — 32 y 64 los fines de semana. Gratis o con LFA Coin, la moneda de SOMOS LFA.',
    home_paso3_title: 'JUGÁ Y COBRÁ',
    home_paso3_desc:  'Subí tu resultado, el bot verifica que sea correcto, actualiza el bracket automáticamente y entrega el premio al ganador.',
    home_listo_title: '¿LISTO PARA COMPETIR?',
    home_listo_sub:   'Creá tu cuenta gratis o iniciá sesión',
    home_crear_cuenta: '🎮 CREAR CUENTA GRATIS',
    home_ya_tengo:    'YA TENGO CUENTA →',
    home_slogan1:     'Torneos de FC 26 y eFootball con premios reales.',
    home_slogan2:     'Competí 1vs1, armá equipo y dominá los torneos.',
    home_arena_desc:  'Salas de 2 a 16 jugadores. Bracket automático, resultados verificados por el bot. Torneos free y pagos.',
    home_liga_desc:   'Temporadas largas con tabla de posiciones y ranking oficial. Torneos free y pagos.',
    home_coop_desc:   'Armá equipo con un amigo y competí en pareja.',
    home_clubes_desc: 'Representá tu club oficial. Primera división de la liga.',
  },
  pt: {
    slogan1: 'LIGA DE FUTEBOL AUTOMATIZADA', slogan2: 'DOMINE O CAMPO',
    email: 'E-mail', pass: 'Senha (mín. 8 e 1 Maiúscula)',
    obligatorio: '⚠️ Obrigatório: EA ID (para FC26) ou Konami ID (para eFootball)', id_jugador: 'EA ID (FC26) / Konami ID (eFootball)',
    olvide_pass: 'Esqueceu sua senha?', btn_entrar: 'ENTRAR / REGISTRAR',
    o_accede: 'OU ACESSE COM', btn_google: 'Continuar com o Google',
    btn_instalar: '📲 INSTALAR APP LFA',
    leido_todo: 'Aceito o Regulamento, Termos, Privacidade e Reembolsos.',
    foot_titulo: 'LFA - Liga de Futebol Automatizada',
    foot_desc: 'Torneios & Ligas eFootball · FC 26',
    foot_reg: 'Regulamento Oficial', foot_term: 'Termos e Condições',
    foot_priv: 'Política de Privacidade', foot_reem: 'Política de Reembolsos',
    redes: 'NOSSAS REDES:', derechos: '© 2026 LFA. Todos os direitos reservados. Jogue com responsabilidade.',
    legal_titulo: 'Último passo, Lenda!',
    legal_desc: 'Para competir por dinheiro real e manter o jogo limpo, é obrigatório aceitar nossas regras.',
    legal_btn: 'CONFIRMAR E ENTRAR NO CAMPO',
    hub_selecciona: 'SELECIONE SUA COMPETIÇÃO',
    hub_salir: 'SAIR',
    hub_billetera: 'CARTEIRA',
    hub_tienda: 'LOJA',
    hub_proximamente: 'EM BREVE',
    hub_cantina: 'CANTINA LFA — CHAT GERAL',
    hub_cargando: 'CARREGANDO HUB...',
    dash_perfil: 'PERFIL',
    hub_modo_arena_title:  'ARENA 1VS1',
    hub_modo_arena_desc:   'Torneios relâmpago individuais.',
    hub_modo_liga_title:   'LIGA 1VS1',
    hub_modo_liga_desc:    'Ligas longas oficiais de temporada.',
    hub_modo_coop_title:   'CO-OP 2VS2',
    hub_modo_coop_desc:    'Torneios em duplas.',
    hub_modo_clubes_title: 'LIGA CLUBES',
    hub_modo_clubes_desc:  'Compita com seu clube oficial.',
    hub_pronto:            'EM BREVE',
    dash_tab_arena:        'ARENA 1VS1',
    dash_tab_ranking:      'RANKING',
    dash_tab_tv:           'LFA TV',
    dash_tab_ping:         'PING',
    bs_live:          'Arena 1VS1 · Ao vivo',
    bs_esports:       'eSports Competitivo · Tempo Real · LATAM',
    bs_label_game:    '1. Jogo',
    bs_label_mode:    '2. Modo de jogo',
    bs_label_region:  '3. Sua região',
    bs_label_country: '4. País',
    bs_label_tier:    '4. Nível de aposta',
    bs_any_mode:      '🎮 Qualquer modo',
    bs_any_region:    '🌐 Qualquer região',
    bs_any_country:   '— Qualquer país —',
    bs_any_tier:      'Qualquer',
    bs_any_tier_sub:  'Todos os níveis',
    bs_btn_search:    '⚡ BUSCAR SALA DISPONÍVEL',
    bs_btn_searching: 'Procurando sala...',
    bs_no_rooms:      'Nenhuma sala disponível',
    bs_no_rooms_hint: 'Mude os filtros ou volte em alguns minutos. O staff cria novas salas regularmente.',
    home_modos_title: 'MODOS DE COMPETIÇÃO',
    home_modos_sub:   'Escolha seu formato favorito',
    home_como_title:  'COMO FUNCIONA?',
    home_como_sub:    'Simples, rápido, transparente',
    home_paso1_title: 'CADASTRE-SE',
    home_paso1_desc:  'Crie sua conta grátis com email ou Google em menos de 1 minuto.',
    home_paso2_title: 'ESCOLHA UM TORNEIO',
    home_paso2_desc:  'Salas de 2, 4, 6, 8, 12 e 16 jogadores todo o dia — 32 e 64 nos fins de semana. Grátis ou com LFA Coin, a moeda da SOMOS LFA.',
    home_paso3_title: 'JOGUE E RECEBA',
    home_paso3_desc:  'Envie seu resultado, o bot verifica, atualiza o bracket automaticamente e entrega o prêmio ao vencedor.',
    home_listo_title: 'PRONTO PARA COMPETIR?',
    home_listo_sub:   'Crie sua conta grátis ou faça login',
    home_crear_cuenta: '🎮 CRIAR CONTA GRÁTIS',
    home_ya_tengo:    'JÁ TENHO CONTA →',
    home_slogan1:     'Torneios de FC 26 e eFootball com prêmios reais.',
    home_slogan2:     'Compita 1vs1, forme equipe e domine os torneios.',
    home_arena_desc:  'Salas de 2 a 16 jogadores. Bracket automático, resultados verificados pelo bot. Torneios gratuitos e pagos.',
    home_liga_desc:   'Temporadas longas com tabela de classificação e ranking oficial. Torneios gratuitos e pagos.',
    home_coop_desc:   'Monte equipe com um amigo e compita em dupla.',
    home_clubes_desc: 'Represente seu clube oficial. Primeira divisão da liga.',
  },
  en: {
    slogan1: 'AUTOMATED FOOTBALL LEAGUE', slogan2: 'DOMINATE THE PITCH',
    email: 'Email Address', pass: 'Password (min 8 & 1 Uppercase)',
    obligatorio: '⚠️ Required: EA ID (for FC26) or Konami ID (for eFootball)', id_jugador: 'EA ID (FC26) / Konami ID (eFootball)',
    olvide_pass: 'Forgot your password?', btn_entrar: 'LOGIN / REGISTER',
    o_accede: 'OR ACCESS WITH', btn_google: 'Continue with Google',
    btn_instalar: '📲 INSTALL LFA APP',
    leido_todo: 'I accept the Rules, Terms, Privacy and Refunds.',
    foot_titulo: 'LFA - Automated Football League',
    foot_desc: 'Tournaments & Leagues eFootball · FC 26',
    foot_reg: 'Official Rules', foot_term: 'Terms and Conditions',
    foot_priv: 'Privacy Policy', foot_reem: 'Refund Policy',
    redes: 'OUR SOCIALS:', derechos: '© 2026 LFA. All rights reserved. Play responsibly.',
    legal_titulo: 'Last step, Legend!',
    legal_desc: 'To compete for real money and maintain fair play, you must accept our rules.',
    legal_btn: 'CONFIRM AND ENTER THE PITCH',
    hub_selecciona: 'SELECT YOUR COMPETITION',
    hub_salir: 'LOGOUT',
    hub_billetera: 'WALLET',
    hub_tienda: 'STORE',
    hub_proximamente: 'COMING SOON',
    hub_cantina: 'LFA CANTINA — GENERAL CHAT',
    hub_cargando: 'LOADING HUB...',
    dash_perfil: 'PROFILE',
    hub_modo_arena_title:  'ARENA 1VS1',
    hub_modo_arena_desc:   'Individual flash tournaments.',
    hub_modo_liga_title:   'LEAGUE 1VS1',
    hub_modo_liga_desc:    'Official full-season leagues.',
    hub_modo_coop_title:   'CO-OP 2VS2',
    hub_modo_coop_desc:    'Pair tournaments.',
    hub_modo_clubes_title: 'CLUB LEAGUE',
    hub_modo_clubes_desc:  'Compete with your official club.',
    hub_pronto:            'COMING SOON',
    dash_tab_arena:        'ARENA 1VS1',
    dash_tab_ranking:      'RANKING',
    dash_tab_tv:           'LFA TV',
    dash_tab_ping:         'PING',
    bs_live:          'Arena 1VS1 · Live',
    bs_esports:       'Competitive eSports · Real Time · LATAM',
    bs_label_game:    '1. Game',
    bs_label_mode:    '2. Game mode',
    bs_label_region:  '3. Your region',
    bs_label_country: '4. Country',
    bs_label_tier:    '4. Bet level',
    bs_any_mode:      '🎮 Any mode',
    bs_any_region:    '🌐 Any region',
    bs_any_country:   '— Any country —',
    bs_any_tier:      'Any',
    bs_any_tier_sub:  'All levels',
    bs_btn_search:    '⚡ FIND AVAILABLE ROOM',
    bs_btn_searching: 'Searching...',
    bs_no_rooms:      'No rooms available',
    bs_no_rooms_hint: 'Change filters or come back in a few minutes. Staff creates new rooms regularly.',
    home_modos_title: 'COMPETITION MODES',
    home_modos_sub:   'Choose your favorite format',
    home_como_title:  'HOW DOES IT WORK?',
    home_como_sub:    'Simple, fast, transparent',
    home_paso1_title: 'SIGN UP',
    home_paso1_desc:  'Create your free account with email or Google in less than 1 minute.',
    home_paso2_title: 'CHOOSE A TOURNAMENT',
    home_paso2_desc:  'Rooms of 2, 4, 6, 8, 12 and 16 players all day — 32 and 64 on weekends. Free or with LFA Coin, the SOMOS LFA currency.',
    home_paso3_title: 'PLAY AND EARN',
    home_paso3_desc:  'Submit your result, the bot verifies it, updates the bracket automatically and delivers the prize to the winner.',
    home_listo_title: 'READY TO COMPETE?',
    home_listo_sub:   'Create your free account or log in',
    home_crear_cuenta: '🎮 CREATE FREE ACCOUNT',
    home_ya_tengo:    'I HAVE AN ACCOUNT →',
    home_slogan1:     'FC 26 and eFootball tournaments with real prizes.',
    home_slogan2:     'Compete 1vs1, build a team and dominate the tournaments.',
    home_arena_desc:  'Rooms of 2 to 16 players. Automatic bracket, results verified by the bot. Free and paid tournaments.',
    home_liga_desc:   'Long seasons with standings and official ranking. Free and paid tournaments.',
    home_coop_desc:   'Team up with a friend and compete as a duo.',
    home_clubes_desc: 'Represent your official club. First division of the league.',
  },};
// ─────────────────────────────────────────────────────────────────────────────
export function useLang() {
  const [lang, setLangState] = useState<LangCode>('es');

  useEffect(() => {
    const saved = (localStorage.getItem('lfa_idioma') as LangCode) ?? 'es';
    if (LANGUAGES[saved]) setLangState(saved);
  }, []);

  const setLang = useCallback((code: LangCode) => {
    setLangState(code);
    localStorage.setItem('lfa_idioma', code);
  }, []);

  return { lang, setLang, t: TRANSLATIONS[lang] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente LangDropdown
// ─────────────────────────────────────────────────────────────────────────────
interface LangDropdownProps {
  lang:    LangCode;
  setLang: (code: LangCode) => void;
  inline?: boolean;
}

export default function LangDropdown({ lang, setLang, inline }: LangDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  // Cerrar al clickear fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = LANGUAGES[lang];

  return (
    <div
      ref={ref}
      className={inline ? 'relative z-50 flex items-center' : 'absolute top-[15px] right-[15px] z-50'}
      aria-label="Selector de Idioma"
    >
      {/* Botón principal */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-xs font-bold
                   border border-lfa-border bg-white/5 hover:bg-white/10 hover:border-lfa-neon
                   transition-all duration-300"
        style={{ fontFamily: 'var(--font-orbitron)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.flag} alt={current.label} width={16} className="rounded-[2px]" />
        <span>{current.label}</span>
        <svg
          className={`w-2.5 h-2.5 text-lfa-text transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Menú desplegable */}
      {open && (
        <div
          className="absolute top-[110%] right-0 flex flex-col w-max rounded-lg overflow-hidden
                     border border-lfa-border bg-lfa-card shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
        >
          {(Object.entries(LANGUAGES) as [LangCode, typeof LANGUAGES.es][]).map(([code, meta]) => (
            <button
              key={code}
              onClick={() => { setLang(code); setOpen(false); }}
              className={`flex items-center gap-2.5 px-5 py-3 text-sm text-left w-full
                         border-b border-white/5 last:border-b-0 transition-all duration-200
                         ${lang === code
                           ? 'bg-lfa-neon/10 text-white pl-6'
                           : 'text-[#ccc] hover:bg-lfa-neon/10 hover:text-white hover:pl-6'
                         }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={meta.flag} alt={meta.label} width={18} className="rounded-[2px]" />
              {meta.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
