'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged }  from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db }            from '@/lib/firebase';
import BuscarSala              from '@/app/_components/dashboard/BuscarSala';
import Link                    from 'next/link';
import dynamic                 from 'next/dynamic';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';

const RankingInline  = dynamic(() => import('@/app/_components/dashboard/RankingInline'),  { ssr: false });
const LfaTV          = dynamic(() => import('@/app/_components/dashboard/LfaTV'),          { ssr: false });
const PingLatencia   = dynamic(() => import('@/app/_components/dashboard/PingLatencia'),   { ssr: false });

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
  const { lang, setLang } = useLang();
  const [ready, setReady] = useState(false);
  const [uid,   setUid]   = useState('');
  const [tab,   setTab]   = useState<'arena'|'ranking'|'tv'|'ping'>(() => 'arena');
  const [vpnWarning, setVpnWarning] = useState<string | null>(null);
  // Advertencia VPN/Región
  useEffect(() => {
    fetch('/api/detect-region').then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      if (data.isVpn) {
        setVpnWarning('⚠️ Estás usando VPN. Solo puedes participar en torneos GLOBAL. El ping puede no ser real.');
      } else if (data.region && data.region !== data.userRegion) {
        setVpnWarning('⚠️ Tu región detectada no coincide con la de tu perfil. Solo puedes participar en torneos GLOBAL.');
      } else {
        setVpnWarning(null);
      }
    });
  }, []);

  // Leer ?tab= de la URL al montar
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'ranking' || t === 'tv' || t === 'ping') setTab(t as 'ranking'|'tv'|'ping');
  }, [searchParams]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }
      setUid(user.uid);
      setReady(true);
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
      {/* Advertencia VPN/Región */}
      {vpnWarning && (
        <div style={{
          background: 'rgba(255,71,87,0.08)',
          border: '1px solid #ff4757',
          color: '#ff4757',
          borderRadius: 10,
          padding: '12px 18px',
          margin: '18px 18px 0 18px',
          fontFamily: "'Orbitron',sans-serif",
          fontWeight: 700,
          fontSize: '0.95rem',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: 'center',
        }}>
          <span style={{fontSize:'1.3rem'}}>⚠️</span>
          <span>{vpnWarning}</span>
        </div>
      )}

      {/* Barra nav */}
      <div className="backdrop-blur-xl border-b px-4 py-0 flex items-stretch sticky top-0 z-30"
        style={{ background: "rgba(11,14,20,0.97)", borderColor: "#1c2028" }}>
        <Link href="/hub"
          className="text-xs font-semibold transition flex items-center gap-1 px-3 py-3"
          style={{ color: "#8b949e", textDecoration: 'none' }}>
          ← HUB
        </Link>
        <span style={{ color: "#30363d", display: 'flex', alignItems: 'center' }}>|</span>
        <button onClick={() => setTab('arena')} style={{ background:'transparent', border:'none', borderBottom: tab==='arena' ? '2px solid #00ff88' : '2px solid transparent', color: tab==='arena' ? '#00ff88' : '#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', fontWeight:900, padding:'0 16px', cursor:'pointer', letterSpacing:1, transition:'0.15s' }}>
          ⚔️ ARENA 1VS1
        </button>
        <button onClick={() => setTab('ranking')} style={{ background:'transparent', border:'none', borderBottom: tab==='ranking' ? '2px solid #58a6ff' : '2px solid transparent', color: tab==='ranking' ? '#58a6ff' : '#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', fontWeight:900, padding:'0 16px', cursor:'pointer', letterSpacing:1, transition:'0.15s' }}>
          📊 RANKING
        </button>
        <button onClick={() => setTab('tv')} style={{ background:'transparent', border:'none', borderBottom: tab==='tv' ? '2px solid #a371f7' : '2px solid transparent', color: tab==='tv' ? '#a371f7' : '#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', fontWeight:900, padding:'0 16px', cursor:'pointer', letterSpacing:1, transition:'0.15s' }}>
          📺 LFA TV
        </button>
        <button onClick={() => setTab('ping')} style={{ background:'transparent', border:'none', borderBottom: tab==='ping' ? '2px solid #58a6ff' : '2px solid transparent', color: tab==='ping' ? '#58a6ff' : '#8b949e', fontFamily:"'Orbitron',sans-serif", fontSize:'0.68rem', fontWeight:900, padding:'0 16px', cursor:'pointer', letterSpacing:1, transition:'0.15s' }}>
          📡 PING
        </button>

        <div style={{ flex: 1 }} />
        <Link href="/perfil" style={{ color:'#8b949e', textDecoration:'none', fontFamily:"'Orbitron',sans-serif", fontSize:'0.65rem', display:'flex', alignItems:'center', padding:'0 12px', borderLeft:'1px solid #1c2028', transition:'0.15s' }}>
          👤 PERFIL
        </Link>
        {/* Idioma */}
        <div style={{ position: 'relative', minHeight: 46, minWidth: 90, borderLeft: '1px solid #1c2028' }}>
          <LangDropdown lang={lang} setLang={setLang} />
        </div>
      </div>

      {tab === 'arena'   && (
        <>
          <BuscarSala />
          <DashboardFooter />
        </>
      )}
      {tab === 'ranking' && <RankingInline />}
      {tab === 'tv'      && <LfaTV uid={uid} />}
      {tab === 'ping'    && <PingLatencia />}

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


