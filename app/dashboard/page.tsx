'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged }  from 'firebase/auth';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db }            from '@/lib/firebase';
import BuscarSala              from '@/app/_components/dashboard/BuscarSala';
import MiSalaActiva            from '@/app/_components/dashboard/MiSalaActiva';
import Link                    from 'next/link';
import dynamic                 from 'next/dynamic';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';

const RankingInline       = dynamic(() => import('@/app/_components/dashboard/RankingInline'),       { ssr: false });
const LfaTV               = dynamic(() => import('@/app/_components/dashboard/LfaTV'),               { ssr: false });
const OrganizadorPanel    = dynamic(() => import('@/app/_components/dashboard/OrganizadorPanel'),    { ssr: false });
const ResultadosEnVivo    = dynamic(() => import('@/app/_components/dashboard/ResultadosEnVivo'),    { ssr: false });


export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { lang, setLang, t } = useLang();
  const [ready,    setReady]    = useState(false);
  const [uid,      setUid]      = useState('');
  const [userRol,  setUserRol]  = useState('');
  const [tab,      setTab]      = useState<'arena'|'ranking'|'tv'|'resultados'|'organizador'>(() => 'arena');

  // Leer ?tab= de la URL al montar
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'ranking' || t === 'tv' || t === 'resultados' || t === 'organizador') setTab(t as 'ranking'|'tv'|'resultados'|'organizador');
  }, [searchParams]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }
      setUid(user.uid);
      setReady(true);
      // Fetch user role for conditional tabs
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists()) setUserRol(snap.data().rol ?? '');
      } catch { /* silencioso */ }
      // Auto-detectar país si el usuario aún no lo tiene
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists() && !snap.data().country) {
          const res = await fetch('/api/detect-region');
          if (res.ok) {
            const { country, countryName, region } = await res.json();
            if (country && country !== 'XX') {
              const upd: Record<string, string> = { country, countryName };
              if (!snap.data().region && region) upd.region = region;
              await updateDoc(doc(db, 'usuarios', user.uid), upd);
            }
          }
        }
      } catch { /* silencioso */ }
    });
    return unsub;
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#0b0e14" }}>
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: "#1c2028" }} />
          <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "#00ff88" }} />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Barra nav — 3 secciones: izquierda fija | tabs scrollables | derecha fija */}
      <div className="backdrop-blur-xl border-b sticky top-0 z-30"
        style={{ background: "rgba(11,14,20,0.97)", borderColor: "#1c2028", display: 'flex', alignItems: 'stretch' }}>

        {/* Izquierda fija */}
        <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
          <Link href="/hub"
            className="text-xs font-semibold transition flex items-center gap-1 px-3 py-3"
            style={{ color: "#8b949e", textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← HUB
          </Link>
          <span style={{ color: "#30363d", display: 'flex', alignItems: 'center', padding: '0 2px' }}>|</span>
        </div>

        {/* Tabs scrollables horizontalmente (sin scrollbar visible) */}
        <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          className="dash-tabs-scroll">
          <button onClick={() => setTab('arena')} style={{ background:'transparent', border:'none', borderBottom: tab==='arena' ? '2px solid #00ff88' : '2px solid transparent', color: tab==='arena' ? '#00ff88' : '#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', fontWeight:900, padding:'0 14px', cursor:'pointer', letterSpacing:1, transition:'0.15s', whiteSpace:'nowrap', flexShrink:0 }}>
            ⚔️ {t.dash_tab_arena}
          </button>
          <button onClick={() => setTab('ranking')} style={{ background:'transparent', border:'none', borderBottom: tab==='ranking' ? '2px solid #58a6ff' : '2px solid transparent', color: tab==='ranking' ? '#58a6ff' : '#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', fontWeight:900, padding:'0 14px', cursor:'pointer', letterSpacing:1, transition:'0.15s', whiteSpace:'nowrap', flexShrink:0 }}>
            📊 {t.dash_tab_ranking}
          </button>
          <button onClick={() => setTab('tv')} style={{ background:'transparent', border:'none', borderBottom: tab==='tv' ? '2px solid #a371f7' : '2px solid transparent', color: tab==='tv' ? '#a371f7' : '#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', fontWeight:900, padding:'0 14px', cursor:'pointer', letterSpacing:1, transition:'0.15s', whiteSpace:'nowrap', flexShrink:0 }}>
            📺 {t.dash_tab_tv}
          </button>
          <button onClick={() => setTab('resultados')} style={{ background:'transparent', border:'none', borderBottom: tab==='resultados' ? '2px solid #00ff88' : '2px solid transparent', color: tab==='resultados' ? '#00ff88' : '#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', fontWeight:900, padding:'0 14px', cursor:'pointer', letterSpacing:1, transition:'0.15s', whiteSpace:'nowrap', flexShrink:0 }}>
            ⚡ EN VIVO
          </button>
          {userRol === 'organizador' && (
            <button onClick={() => setTab('organizador')} style={{ background:'transparent', border:'none', borderBottom: tab==='organizador' ? '2px solid #a371f7' : '2px solid transparent', color: tab==='organizador' ? '#a371f7' : '#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', fontWeight:900, padding:'0 14px', cursor:'pointer', letterSpacing:1, transition:'0.15s', whiteSpace:'nowrap', flexShrink:0 }}>
              🎙️ ORG
            </button>
          )}
        </div>

        {/* Derecha fija: Perfil + Idioma */}
        <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0, borderLeft: '1px solid #1c2028' }}>
          <Link href="/perfil" style={{ color:'#8b949e', textDecoration:'none', fontFamily:"'Orbitron',sans-serif", fontSize:'0.65rem', display:'flex', alignItems:'center', padding:'0 10px', transition:'0.15s', whiteSpace:'nowrap' }}>
            👤 <span className="dash-perfil-label">{t.dash_perfil}</span>
          </Link>
          <div style={{ borderLeft: '1px solid #1c2028', display: 'flex', alignItems: 'center', paddingLeft: 4, paddingRight: 4 }}>
            <LangDropdown lang={lang} setLang={setLang} inline />
          </div>
        </div>
      </div>

      <style>{`
        .dash-tabs-scroll::-webkit-scrollbar { display: none; }
        @media (max-width: 480px) {
          .dash-perfil-label { display: none; }
        }
      `}</style>

      {tab === 'arena'        && (
        <>
          {uid && <MiSalaActiva uid={uid} />}
          <BuscarSala />
          <MiniRankingArena />
          <DashboardFooter />
        </>
      )}
      {tab === 'ranking'      && <RankingInline />}
      {tab === 'tv'           && <LfaTV uid={uid} />}
      {tab === 'resultados'   && <ResultadosEnVivo />}
      {tab === 'organizador'  && <OrganizadorPanel />}


    </>
  );
}

function DashboardFooter() {
  const links = [
    { href: '/reglamento',  label: '📋 Reglamento' },
    { href: '/privacidad',  label: '🔒 Privacidad'  },
    { href: '/terminos',    label: '📄 Términos'    },
    { href: '/reembolsos',  label: '💸 Reembolsos'  },
  ];
  const social = [
    { href: 'https://www.instagram.com/somoslfa', label: 'Instagram', icon: '📸' },
    { href: 'https://twitter.com/somoslfa',       label: 'Twitter/X', icon: '🐦' },
    { href: 'https://www.tiktok.com/@somoslfa',   label: 'TikTok',    icon: '🎵' },
    { href: 'https://kick.com/somoslfa',          label: 'Kick',      icon: '🟢' },
    { href: 'https://www.twitch.tv/somoslfa',     label: 'Twitch',    icon: '💜' },
    { href: 'https://www.youtube.com/@somoslfa',  label: 'YouTube',   icon: '▶️'  },
  ];
  return (
    <footer style={{ background: '#0d1117', borderTop: '1px solid #1c2028', padding: 'clamp(24px,4vw,40px) clamp(16px,5vw,5%)', marginTop: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Legales */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
          {links.map(l => (
            <a key={l.href} href={l.href} style={{ color: '#8b949e', textDecoration: 'none', fontSize: '0.78rem', padding: '6px 14px', border: '1px solid #30363d', borderRadius: 20, transition: '0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color='#00ff88'; (e.currentTarget as HTMLAnchorElement).style.borderColor='#00ff8840'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color='#8b949e'; (e.currentTarget as HTMLAnchorElement).style.borderColor='#30363d'; }}>
              {l.label}
            </a>
          ))}
        </div>
        {/* Redes */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
          {social.map(s => (
            <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" style={{ color: '#8b949e', textDecoration: 'none', fontSize: '0.75rem', padding: '6px 14px', border: '1px solid #30363d', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 5, transition: '0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color='#ffd700'; (e.currentTarget as HTMLAnchorElement).style.borderColor='#ffd70040'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color='#8b949e'; (e.currentTarget as HTMLAnchorElement).style.borderColor='#30363d'; }}>
              {s.icon} {s.label}
            </a>
          ))}
        </div>
        <div style={{ textAlign: 'center', color: '#444', fontSize: '0.7rem' }}>
          © 2026 SomosLFA · eSports Competitivo · LATAM &nbsp;·&nbsp; <span style={{ color: '#00ff8830' }}>somoslfa.com</span>
        </div>
      </div>
    </footer>
  );
}

/* ─── Mini Ranking (arena tab) ───────────────────────────── */
interface MiniPlayer {
  id: string; nombre?: string; avatar_url?: string;
  titulos?: number; pais_codigo?: string;
}
function getTierMini(t: number) {
  if (t >= 50) return { label: 'LEYENDA', color: '#ff4757', icon: '👑' };
  if (t >= 20) return { label: 'ELITE',   color: '#ffd700', icon: '🔥' };
  if (t >= 10) return { label: 'ORO',     color: '#f0c040', icon: '⭐' };
  if (t >= 5)  return { label: 'PLATA',   color: '#a8b2c0', icon: '🥈' };
  if (t >= 1)  return { label: 'BRONCE',  color: '#cd7f32', icon: '🥉' };
  return         { label: 'NOVATO',  color: '#8b949e', icon: '🆕' };
}
function MiniRankingArena() {
  const [top5, setTop5] = useState<MiniPlayer[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'usuarios'), limit(200)));
        const list: MiniPlayer[] = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as MiniPlayer))
          .filter(u => !((u as any).baneado))
          .sort((a, b) => (b.titulos ?? 0) - (a.titulos ?? 0))
          .slice(0, 5);
        setTop5(list);
      } catch { /* silencioso */ }
    })();
  }, []);

  if (!top5.length) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-2">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg,#ffd70040,transparent)' }} />
        <span className="text-[10px] font-black tracking-[3px] uppercase"
              style={{ color: '#ffd700', fontFamily: "'Orbitron',sans-serif" }}>
          🏆 TOP 5 GLOBAL
        </span>
        <div className="h-px flex-1" style={{ background: 'linear-gradient(270deg,#ffd70040,transparent)' }} />
      </div>

      <div className="flex flex-col gap-2">
        {top5.map((p, i) => {
          const tier = getTierMini(p.titulos ?? 0);
          const medal = ['🥇','🥈','🥉','4️⃣','5️⃣'][i];
          return (
            <a key={p.id} href={`/jugador/${p.id}`}
               className="flex items-center gap-3 rounded-xl px-4 py-3 no-underline transition-all"
               style={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', textDecoration: 'none' }}
               onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#ffd70060'; }}
               onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#30363d'; }}>
              {/* Position */}
              <span className="text-lg w-7 text-center flex-shrink-0">{medal}</span>
              {/* Avatar */}
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border-2"
                       style={{ borderColor: tier.color }} />
                : <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base"
                       style={{ background: '#21262d', border: `2px solid ${tier.color}` }}>🎮</div>
              }
              {/* Name + flag */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 truncate">
                  {p.pais_codigo && (
                    <img src={`https://flagcdn.com/20x15/${p.pais_codigo.toLowerCase()}.png`}
                         alt={p.pais_codigo} width={16} height={12} className="rounded-sm flex-shrink-0"
                         onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                  )}
                  <span className="font-bold text-sm truncate">{p.nombre ?? 'Jugador'}</span>
                </div>
                <div className="text-[10px] font-semibold mt-0.5" style={{ color: tier.color }}>
                  {tier.icon} {tier.label}
                </div>
              </div>
              {/* Titles */}
              <div className="flex-shrink-0 text-right">
                <div className="font-black text-lg" style={{ color: '#ffd700', fontFamily: "'Orbitron',sans-serif" }}>
                  {p.titulos ?? 0}
                </div>
                <div className="text-[9px] uppercase tracking-wider" style={{ color: '#8b949e' }}>títulos</div>
              </div>
            </a>
          );
        })}
      </div>

      {/* Link to full ranking */}
      <div className="text-center mt-3">
        <a href="/ranking" className="text-[11px] no-underline"
           style={{ color: '#8b949e', textDecoration: 'none' }}>
          Ver ranking completo →
        </a>
      </div>
    </div>
  );
}