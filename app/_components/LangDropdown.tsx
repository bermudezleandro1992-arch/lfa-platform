'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos e i18n
// ─────────────────────────────────────────────────────────────────────────────
export type LangCode = 'es' | 'pt' | 'en' | 'jp' | 'kr';

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
}

const LANGUAGES: Record<LangCode, { flag: string; label: string; name: string }> = {
  es: { flag: 'https://flagcdn.com/w20/ar.png', label: 'ES', name: 'Español'   },
  pt: { flag: 'https://flagcdn.com/w20/br.png', label: 'PT', name: 'Português' },
  en: { flag: 'https://flagcdn.com/w20/us.png', label: 'EN', name: 'English'   },
  jp: { flag: 'https://flagcdn.com/w20/jp.png', label: 'JP', name: '日本語'    },
  kr: { flag: 'https://flagcdn.com/w20/kr.png', label: 'KR', name: '한국어'    },
};

export const TRANSLATIONS: Record<LangCode, Translations> = {
  es: {
    slogan1: 'LIGA DE FÚTBOL AUTOMATIZADA', slogan2: 'DOMINÁ LA CANCHA',
    email: 'Correo Electrónico', pass: 'Contraseña (Registro: 8+ caract, mayúscula, símbolo)',
    obligatorio: '*Obligatorio si sos usuario nuevo:', id_jugador: 'ID Jugador (Ej: Tu_GamerTag)',
    olvide_pass: '¿Olvidaste tu contraseña?', btn_entrar: 'ENTRAR / REGISTRARSE',
    o_accede: 'O ACCEDÉ CON', btn_google: 'Continuar con Google', btn_facebook: 'Facebook',
    btn_instalar: '📲 INSTALAR APP LFA',
    leido_todo: 'Acepto el Reglamento, Términos, Privacidad y Reembolsos.',
    foot_titulo: 'LFA - Liga de Fútbol Automatizada',
    foot_desc: 'Gestión SM - La plataforma definitiva para torneos de eSports por dinero real.',
    foot_reg: 'Reglamento Oficial', foot_term: 'Términos y Condiciones',
    foot_priv: 'Políticas de Privacidad', foot_reem: 'Política de Reembolsos',
    redes: 'NUESTRAS REDES:', derechos: '© 2026 LFA. Todos los derechos reservados. Jugá con responsabilidad.',
    legal_titulo: '¡Último paso, Leyenda!',
    legal_desc: 'Para competir por dinero real y mantener el juego limpio en LFA, es obligatorio aceptar nuestras reglas.',
    legal_btn: 'CONFIRMAR Y ENTRAR A LA CANCHA',
  },
  pt: {
    slogan1: 'LIGA DE FUTEBOL AUTOMATIZADA', slogan2: 'DOMINE O CAMPO',
    email: 'E-mail', pass: 'Senha (mín. 8 e 1 Maiúscula)',
    obligatorio: '*Obrigatório ID:', id_jugador: 'ID do Jogador (Ex: Sua_GamerTag)',
    olvide_pass: 'Esqueceu sua senha?', btn_entrar: 'ENTRAR / REGISTRAR',
    o_accede: 'OU ACESSE COM', btn_google: 'Continuar com o Google', btn_facebook: 'Facebook',
    btn_instalar: '📲 INSTALAR APP LFA',
    leido_todo: 'Aceito o Regulamento, Termos, Privacidade e Reembolsos.',
    foot_titulo: 'LFA - Liga de Futebol Automatizada',
    foot_desc: 'Gestão SM - A plataforma definitiva para torneios de eSports com dinheiro real.',
    foot_reg: 'Regulamento Oficial', foot_term: 'Termos e Condições',
    foot_priv: 'Política de Privacidade', foot_reem: 'Política de Reembolsos',
    redes: 'NOSSAS REDES:', derechos: '© 2026 LFA. Todos os direitos reservados. Jogue com responsabilidade.',
    legal_titulo: 'Último passo, Lenda!',
    legal_desc: 'Para competir por dinheiro real e manter o jogo limpo, é obrigatório aceitar nossas regras.',
    legal_btn: 'CONFIRMAR E ENTRAR NO CAMPO',
  },
  en: {
    slogan1: 'AUTOMATED FOOTBALL LEAGUE', slogan2: 'DOMINATE THE PITCH',
    email: 'Email Address', pass: 'Password (min 8 & 1 Uppercase)',
    obligatorio: '', id_jugador: 'Player ID (Ex: Your_GamerTag)',
    olvide_pass: 'Forgot your password?', btn_entrar: 'LOGIN / REGISTER',
    o_accede: 'OR ACCESS WITH', btn_google: 'Continue with Google', btn_facebook: 'Facebook',
    btn_instalar: '📲 INSTALL LFA APP',
    leido_todo: 'I accept the Rules, Terms, Privacy and Refunds.',
    foot_titulo: 'LFA - Automated Football League',
    foot_desc: 'SM Management - The ultimate platform for real money eSports tournaments.',
    foot_reg: 'Official Rules', foot_term: 'Terms and Conditions',
    foot_priv: 'Privacy Policy', foot_reem: 'Refund Policy',
    redes: 'OUR SOCIALS:', derechos: '© 2026 LFA. All rights reserved. Play responsibly.',
    legal_titulo: 'Last step, Legend!',
    legal_desc: 'To compete for real money and maintain fair play, you must accept our rules.',
    legal_btn: 'CONFIRM AND ENTER THE PITCH',
  },
  jp: {
    slogan1: '自動化されたサッカーリーグ', slogan2: 'ピッチを支配する',
    email: 'メールアドレス', pass: 'パスワード（8文字以上、大文字1つ）',
    obligatorio: '*新規ユーザーに必須:', id_jugador: 'プレイヤーID（例：Your_GamerTag）',
    olvide_pass: 'パスワードをお忘れですか？', btn_entrar: 'ログイン / 登録',
    o_accede: 'または次でアクセス', btn_google: 'Googleで続行', btn_facebook: 'Facebook',
    btn_instalar: '📲 LFAアプリをインストール',
    leido_todo: 'ルール、利用規約、プライバシー、返金に同意します。',
    foot_titulo: 'LFA - 自動サッカーリーグ',
    foot_desc: 'SM Management - リアルマネーのeスポーツトーナメントのための究極のプラットフォーム。',
    foot_reg: '公式ルール', foot_term: '利用規約', foot_priv: 'プライバシーポリシー', foot_reem: '返金ポリシー',
    redes: '私たちのソーシャル:', derechos: '© 2026 LFA。全著作権所有。責任を持ってプレイしてください。',
    legal_titulo: '最後のステップ、レジェンド！',
    legal_desc: 'リアルマネーで競争し、フェアプレイを維持するには、ルールに同意する必要があります。',
    legal_btn: '確認してピッチに入る',
  },
  kr: {
    slogan1: '자동화된 축구 리그', slogan2: '경기장을 지배하라',
    email: '이메일 주소', pass: '비밀번호(최소 8자 및 대문자 1개)',
    obligatorio: '*신규 사용자의 경우 필수:', id_jugador: '플레이어 ID (예: Your_GamerTag)',
    olvide_pass: '비밀번호를 잊으셨나요?', btn_entrar: '로그인 / 가입',
    o_accede: '또는 다음으로 액세스', btn_google: 'Google로 계속하기', btn_facebook: 'Facebook',
    btn_instalar: '📲 LFA 앱 설치',
    leido_todo: '규정, 약관, 개인정보 및 환불에 동의합니다.',
    foot_titulo: 'LFA - 자동 축구 리그',
    foot_desc: 'SM 관리 - 리얼 머니 e스포츠 토너먼트를 위한 궁극의 플랫폼.',
    foot_reg: '공식 규정', foot_term: '이용 약관', foot_priv: '개인 정보 보호 정책', foot_reem: '환불 정책',
    redes: '우리의 소셜:', derechos: '© 2026 LFA. 모든 권리 보유. 책임감 있게 플레이하세요.',
    legal_titulo: '마지막 단계, 레전드!',
    legal_desc: '실제 돈을 놓고 경쟁하고 공정한 플레이를 유지하려면 규칙에 동의해야 합니다.',
    legal_btn: '확인하고 경기장 입장',
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
