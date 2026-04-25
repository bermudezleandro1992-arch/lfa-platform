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
  btn_facebook: string;
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
  // Dashboard
  dash_perfil:     string;
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
    o_accede: 'O ACCEDÉ CON', btn_google: 'Continuar con Google', btn_facebook: 'Facebook',
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
  },
  pt: {
    slogan1: 'LIGA DE FUTEBOL AUTOMATIZADA', slogan2: 'DOMINE O CAMPO',
    email: 'E-mail', pass: 'Senha (mín. 8 e 1 Maiúscula)',
    obligatorio: '⚠️ Obrigatório: EA ID (para FC26) ou Konami ID (para eFootball)', id_jugador: 'EA ID (FC26) / Konami ID (eFootball)',
    olvide_pass: 'Esqueceu sua senha?', btn_entrar: 'ENTRAR / REGISTRAR',
    o_accede: 'OU ACESSE COM', btn_google: 'Continuar com o Google', btn_facebook: 'Facebook',
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
  },
  en: {
    slogan1: 'AUTOMATED FOOTBALL LEAGUE', slogan2: 'DOMINATE THE PITCH',
    email: 'Email Address', pass: 'Password (min 8 & 1 Uppercase)',
    obligatorio: '⚠️ Required: EA ID (for FC26) or Konami ID (for eFootball)', id_jugador: 'EA ID (FC26) / Konami ID (eFootball)',
    olvide_pass: 'Forgot your password?', btn_entrar: 'LOGIN / REGISTER',
    o_accede: 'OR ACCESS WITH', btn_google: 'Continue with Google', btn_facebook: 'Facebook',
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
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook: idioma con persistencia en localStorage
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
}

export default function LangDropdown({ lang, setLang }: LangDropdownProps) {
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
      className="absolute top-[15px] right-[15px] z-50"
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
