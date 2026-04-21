'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import dynamic from 'next/dynamic';

const HubLfaTV    = dynamic(() => import('@/app/_components/HubLfaTV'), { ssr: false });
const CantinaChat = dynamic(() => import('@/app/_components/dashboard/CantinaChat'), { ssr: false });

/* ─── Tipos ───────────────────────────────────────────── */
interface UserData {
  nombre: string;
  number: number;
  rol?: string;
  avatar_url?: string;
}

/* ─── Constante CEO UID ───────────────────────────────── */
const DUEÑO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

/* ─── Modos de juego ──────────────────────────────────── */
const MODOS = [
  {
    id: 'arena',
    route: '/dashboard',
    title: 'ARENA 1VS1',
    desc: 'Torneos relámpago individuales.',
    icon: '⚔️',
    color: '#00ff88',
    proximamente: false,
  },
  {
    id: 'ligas',
    route: '/pro',
    title: 'LIGA 1VS1',
    desc: 'Ligas largas oficiales de temporada.',
    icon: '📅',
    color: '#009ee3',
    proximamente: false,
  },
  {
    id: 'coop',
    route: '',
    title: 'CO-OP 2VS2',
    desc: 'Torneos en parejas. El Capitán registra al equipo y sube los resultados.',
    icon: '🤝',
    color: '#ff6b00',
    proximamente: true,
  },
  {
    id: 'clubes',
    route: '',
    title: 'LIGA CLUBES',
    desc: 'Compite en la Primera División con tu club oficial.',
    icon: '🛡️',
    color: '#ffd700',
    proximamente: true,
  },
];

export default function HubPage() {
  const router                         = useRouter();
  const [userData, setUserData]        = useState<UserData | null>(null);
  const [esAdmin,  setEsAdmin]         = useState(false);
  const [uid,      setUid]             = useState('');
  const [loading,  setLoading]         = useState(true);

  /* ── Auth guard ─────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }

      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists()) {
          const d = snap.data() as UserData;
          setUserData(d);
          setEsAdmin(user.uid === DUEÑO_UID || d.rol === 'soporte');
        }
        setUid(user.uid);
      } catch { /* sin red */ }
      setLoading(false);
    });
    return unsub;
  }, [router]);

  /* ── Logout ─────────────────────────────────────────── */
  async function handleLogout() {
    await signOut(auth);
    router.replace('/');
  }

  /* ── Acceso a modos ─────────────────────────────────── */
  function intentarAcceso(modo: typeof MODOS[0]) {
    if (modo.proximamente) return;
    router.push(modo.route);
  }

  if (loading) {
    return (
      <div style={{ background: '#0b0e14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '1.2rem' }}>CARGANDO HUB...</span>
      </div>
    );
  }

  return (
    <>
      <div style={{ margin: 0, fontFamily: "'Roboto',sans-serif", background: '#0b0e14', color: 'white', minHeight: '100vh', overflowX: 'hidden', backgroundImage: 'radial-gradient(circle at 50% 0%, #1a2331 0%, #0b0e14 70%)' }}>

        {/* ── HEADER ───────────────────────────────────── */}
        <header style={{
          background: 'rgba(7,9,13,0.85)',
          padding: '14px 5%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.4rem', fontWeight: 900, color: 'white', letterSpacing: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
            ♛ <span style={{ color: '#00ff88' }}>LFA</span> HUB
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* CEO */}
            {esAdmin && (
              <a href="/ceo" style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', color: '#ff4757', border: '1px solid #ff475750', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', transition: '0.2s', background: 'rgba(255,71,87,0.06)' }}>
                ⚙️ CEO
              </a>
            )}
            {/* Billetera */}
            <a href="/billetera" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,215,0,0.06)', padding: '7px 13px', borderRadius: 30, border: '1px solid #ffd70040', textDecoration: 'none', transition: '0.2s', cursor: 'pointer' }}>
              <span style={{ fontSize: '1rem' }}>💰</span>
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.72rem', color: '#ffd700' }}>BILLETERA</span>
            </a>
            {/* Perfil + coins + logout */}
            <a href="/perfil" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', padding: '7px 14px', borderRadius: 30, border: '1px solid #30363d', textDecoration: 'none', transition: '0.2s', cursor: 'pointer' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid #00ff88', overflow: 'hidden', background: '#1c2028', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {userData && userData.avatar_url
                  ? <img src={userData.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '1rem' }}>👤</span>
                }
              </div>
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 'bold', fontSize: '0.8rem', color: 'white' }}>
                {(userData?.nombre || 'LEYENDA').toUpperCase()}
              </span>
              <span style={{ color: '#ffd700', fontWeight: 'bold', textShadow: '0 0 10px rgba(255,215,0,0.5)', fontSize: '0.82rem' }}>
                🪙 {(userData?.number || 0).toLocaleString()}
              </span>
            </a>
            <button onClick={handleLogout} title="Cerrar Sesión" style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid #ff475740', color: '#ff4757', cursor: 'pointer', fontSize: '1rem', transition: '0.2s', padding: '7px 10px', borderRadius: 8 }}>
              ⏻
            </button>
          </div>
        </header>

        {/* ── CONTENIDO ────────────────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) 16px 60px' }}>

          {/* ── LFA TV embebida ──────────────────────────── */}
          <HubLfaTV />

          {/* ── CANTINA embebida ─────────────────────────── */}
          <div style={{ marginBottom: 32, background: '#0d1117', border: '1px solid #ffd70030', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 480 }}>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid #ffd70020', background: 'rgba(255,215,0,0.04)', flexShrink: 0 }}>
              <span style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.78rem', fontWeight: 900, letterSpacing: 2 }}>🍺 CANTINA LFA — CHAT GENERAL</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {uid ? <CantinaChat uid={uid} /> : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem' }}>
                  CARGANDO CANTINA...
                </div>
              )}
            </div>
          </div>

          {/* MODOS */}
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", color: 'white', margin: '0 0 20px', fontSize: 'clamp(1rem, 3vw, 1.3rem)' }}>
            🎮 SELECCIONÁ TU COMPETICIÓN
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            {MODOS.map((modo) => (
              <button
                key={modo.id}
                onClick={() => intentarAcceso(modo)}
                style={{
                  background: '#161b22',
                  border: `1px solid #30363d`,
                  borderRadius: 14,
                  padding: '24px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.35s',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minHeight: 170,
                  color: 'white',
                }}
                onMouseEnter={(e) => {
                  if (modo.proximamente) return;
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-8px)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = modo.color;
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 15px 30px rgba(0,0,0,0.5), 0 0 20px ${modo.color}30`;
                }}
                onMouseLeave={(e) => {
                  if (modo.proximamente) return;
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#30363d';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                }}
              >
                {/* Badge PRÓXIMAMENTE */}
                {modo.proximamente && (
                  <span style={{ position: 'absolute', top: 14, right: -28, background: '#444', color: '#ccc', fontFamily: "'Orbitron',sans-serif", fontSize: '0.55rem', fontWeight: 'bold', padding: '4px 38px', transform: 'rotate(45deg)', letterSpacing: 1 }}>
                    PRONTO
                  </span>
                )}
                <span style={{ fontSize: '2.8rem', marginBottom: 12, filter: modo.proximamente ? 'grayscale(1) opacity(0.4)' : `drop-shadow(0 0 8px ${modo.color}80)` }}>{modo.icon}</span>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1rem', fontWeight: 900, color: modo.proximamente ? '#555' : 'white', marginBottom: 8 }}>{modo.title}</div>
                <div style={{ fontSize: '0.82rem', color: '#8b949e', lineHeight: 1.4 }}>{modo.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulseRed {
          0% { opacity: 1; }
          50% { opacity: 0.7; }
          100% { opacity: 1; }
        }
      `}</style>
    </>
  );
}
