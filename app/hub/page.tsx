'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import dynamic from 'next/dynamic';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';

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

type FbTipo = 'sugerencia' | 'bug' | 'valoracion' | 'otro';

const FB_TIPOS: { key: FbTipo; icon: string; label: string }[] = [
  { key: 'sugerencia', icon: '💡', label: 'Sugerencia' },
  { key: 'bug',        icon: '🐛', label: 'Bug / Error' },
  { key: 'valoracion', icon: '⭐', label: 'Valoración' },
  { key: 'otro',       icon: '💬', label: 'Otro' },
];

export default function HubPage() {
  const router                         = useRouter();
  const { lang, setLang, t }           = useLang();
  const [userData, setUserData]        = useState<UserData | null>(null);
  const [esAdmin,       setEsAdmin]       = useState(false);
  const [esOrganizador, setEsOrganizador] = useState(false);
  const [uid,      setUid]             = useState('');
  const [loading,  setLoading]         = useState(true);

  /* ─── Feedback state ─────────────────────────────────── */
  const [fbOpen,     setFbOpen]     = useState(false);
  const [fbTipo,     setFbTipo]     = useState<FbTipo>('sugerencia');
  const [fbNombre,   setFbNombre]   = useState('');
  const [fbMensaje,  setFbMensaje]  = useState('');
  const [fbEstrellas,setFbEstrellas]= useState(5);
  const [fbHover,    setFbHover]    = useState(0);
  const [fbEnviando, setFbEnviando] = useState(false);
  const [fbExito,    setFbExito]    = useState(false);
  const [fbError,    setFbError]    = useState('');

  /* ─── Modos de juego (dinámicos con i18n) ─────────── */
  const MODOS = [
    { id: 'arena',   route: '/dashboard', title: t.hub_modo_arena_title,   desc: t.hub_modo_arena_desc,   icon: '⚔️', color: '#00ff88', proximamente: false },
    { id: 'ligas',   route: '/pro',       title: t.hub_modo_liga_title,    desc: t.hub_modo_liga_desc,    icon: '📅', color: '#009ee3', proximamente: false },
    { id: 'coop',    route: '',           title: t.hub_modo_coop_title,    desc: t.hub_modo_coop_desc,    icon: '🤝', color: '#ff6b00', proximamente: true  },
    { id: 'clubes',  route: '',           title: t.hub_modo_clubes_title,  desc: t.hub_modo_clubes_desc,  icon: '🛡️', color: '#ffd700', proximamente: true  },
  ];

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
          setEsOrganizador(d.rol === 'organizador' || user.uid === DUEÑO_UID);
          setFbNombre(d.nombre || '');
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

  /* ── Enviar feedback ───────────────────────────────────── */
  async function enviarFeedback() {
    setFbError('');
    if (fbMensaje.trim().length < 10) { setFbError('El mensaje debe tener al menos 10 caracteres.'); return; }
    setFbEnviando(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: fbNombre || 'Anónimo', tipo: fbTipo, mensaje: fbMensaje, estrellas: fbEstrellas, uid }),
      });
      const data = await res.json();
      if (!res.ok) { setFbError(data.error || 'Error al enviar.'); }
      else { setFbExito(true); setFbMensaje(''); setTimeout(() => { setFbExito(false); setFbOpen(false); }, 3500); }
    } catch { setFbError('Sin conexión. Intentá de nuevo.'); }
    setFbEnviando(false);
  }

  if (loading) {
    return (
      <div style={{ background: '#0b0e14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '1.2rem' }}>{t.hub_cargando}</span>
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
            {esOrganizador && (
              <a href="/organizador" style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', color: '#a371f7', border: '1px solid #a371f750', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', transition: '0.2s', background: 'rgba(163,113,247,0.06)' }}>
                🎙️ MI PANEL
              </a>
            )}
            {/* Billetera */}
            <a href="/billetera" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,215,0,0.06)', padding: '7px 13px', borderRadius: 30, border: '1px solid #ffd70040', textDecoration: 'none', transition: '0.2s', cursor: 'pointer' }}>
              <span style={{ fontSize: '1rem' }}>💰</span>
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.72rem', color: '#ffd700' }}>{t.hub_billetera}</span>
            </a>
            {/* Tienda de Puntos */}
            <a href="/tienda" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(243,186,47,0.06)', padding: '7px 13px', borderRadius: 30, border: '1px solid rgba(243,186,47,0.3)', textDecoration: 'none', transition: '0.2s', cursor: 'pointer' }}>
              <span style={{ fontSize: '1rem' }}>🛒</span>
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.72rem', color: '#f3ba2f' }}>{t.hub_tienda}</span>
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
            <button
              onClick={handleLogout}
              title="Cerrar Sesión"
              style={{
                background: '#ff4757',
                border: '2px solid #ff2d3a',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 900,
                letterSpacing: 0.5,
                transition: '0.2s',
                padding: '7px 13px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap' as const,
                boxShadow: '0 0 10px rgba(255,71,87,0.4)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#c0392b')}
              onMouseLeave={e => (e.currentTarget.style.background = '#ff4757')}
            >
              ⏻ {t.hub_salir}
            </button>
            {/* Idioma */}
            <div style={{ position: 'relative', minHeight: 46, minWidth: 90, flexShrink: 0 }}>
              <LangDropdown lang={lang} setLang={setLang} />
            </div>
          </div>
        </header>

        {/* ── CONTENIDO ────────────────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) 16px 60px' }}>

          {/* ── FEEDBACK WIDGET (compacto al final) ─────── */}
          <div style={{ display: 'none' }}>
            {/* Trigger bar */}
            <button
              onClick={() => { setFbOpen(o => !o); setFbExito(false); setFbError(''); }}
              style={{
                width: '100%',
                background: fbOpen ? 'rgba(0,158,227,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${fbOpen ? '#009ee350' : '#30363d'}`,
                borderRadius: fbOpen ? '14px 14px 0 0' : 14,
                padding: '13px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.25s',
                color: 'white',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.15rem' }}>📣</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.78rem', fontWeight: 900, color: '#009ee3', letterSpacing: 1 }}>
                    TU VOZ IMPORTA — DAR FEEDBACK
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#8b949e', marginTop: 2 }}>
                    Sugerencias, bugs, ideas o valoraciones · ¡Tu ayuda mejora la plataforma!
                  </div>
                </div>
              </div>
              <span style={{ color: '#009ee3', fontSize: '0.85rem', fontWeight: 900, transition: 'transform 0.25s', display: 'inline-block', transform: fbOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </button>

            {/* Panel expandible */}
            {fbOpen && (
              <div style={{
                background: '#0d1117',
                border: '1px solid #009ee340',
                borderTop: 'none',
                borderRadius: '0 0 14px 14px',
                padding: '24px 20px 20px',
              }}>
                {fbExito ? (
                  /* ── Estado de éxito ── */
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '1rem', fontWeight: 900, marginBottom: 8 }}>
                      ¡GRACIAS POR TU FEEDBACK!
                    </div>
                    <div style={{ color: '#8b949e', fontSize: '0.82rem', lineHeight: 1.5 }}>
                      Lo revisaremos y usaremos para seguir mejorando LFA.<br />
                      Tu opinión hace la diferencia. 🙌
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Tipo selector */}
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: '0.7rem', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1, marginBottom: 10 }}>CATEGORÍA</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {FB_TIPOS.map(({ key, icon, label }) => (
                          <button
                            key={key}
                            onClick={() => setFbTipo(key)}
                            style={{
                              padding: '7px 14px',
                              borderRadius: 30,
                              border: `1px solid ${fbTipo === key ? '#009ee3' : '#30363d'}`,
                              background: fbTipo === key ? 'rgba(0,158,227,0.15)' : 'rgba(255,255,255,0.03)',
                              color: fbTipo === key ? '#009ee3' : '#8b949e',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: fbTipo === key ? 700 : 400,
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            {icon} {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Estrellas (solo si valoracion) */}
                    {fbTipo === 'valoracion' && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: '0.7rem', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1, marginBottom: 10 }}>
                          PUNTUACIÓN GENERAL
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onMouseEnter={() => setFbHover(n)}
                              onMouseLeave={() => setFbHover(0)}
                              onClick={() => setFbEstrellas(n)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '2rem',
                                transition: 'transform 0.15s',
                                transform: n <= (fbHover || fbEstrellas) ? 'scale(1.2)' : 'scale(1)',
                                filter: n <= (fbHover || fbEstrellas) ? 'none' : 'grayscale(1) opacity(0.3)',
                              }}
                            >⭐</button>
                          ))}
                          <span style={{ color: '#8b949e', fontSize: '0.78rem', alignSelf: 'center', marginLeft: 6 }}>
                            {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'][fbHover || fbEstrellas]}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Nombre */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: '0.7rem', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1, marginBottom: 8 }}>
                        TU NOMBRE / NICK EN JUEGO
                      </div>
                      <input
                        value={fbNombre}
                        onChange={e => setFbNombre(e.target.value)}
                        maxLength={60}
                        placeholder="Tu nombre o nick de jugador"
                        style={{
                          width: '100%',
                          background: '#161b22',
                          border: '1px solid #30363d',
                          borderRadius: 8,
                          padding: '10px 14px',
                          color: 'white',
                          fontSize: '0.85rem',
                          outline: 'none',
                          boxSizing: 'border-box',
                          fontFamily: "'Roboto',sans-serif",
                        }}
                      />
                    </div>

                    {/* Mensaje */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.7rem', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1 }}>
                          {fbTipo === 'bug' ? 'DESCRIPCIÓN DEL BUG' : fbTipo === 'sugerencia' ? 'TU SUGERENCIA' : fbTipo === 'valoracion' ? 'COMENTARIO' : 'TU MENSAJE'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: fbMensaje.length > 550 ? '#ff4757' : '#4a5568' }}>{fbMensaje.length}/600</span>
                      </div>
                      <textarea
                        value={fbMensaje}
                        onChange={e => setFbMensaje(e.target.value)}
                        maxLength={600}
                        rows={4}
                        placeholder={
                          fbTipo === 'bug'
                            ? 'Describí qué pasó, en qué página o sección ocurrió y qué estabas haciendo...'
                            : fbTipo === 'sugerencia'
                            ? 'Contanos tu idea. ¿Qué funcionalidad agregarías? ¿Qué mejorarías?'
                            : fbTipo === 'valoracion'
                            ? '¿Qué te parece la plataforma hasta ahora? ¿Qué destacarías?'
                            : 'Escribí lo que quieras decirnos...'
                        }
                        style={{
                          width: '100%',
                          background: '#161b22',
                          border: `1px solid ${fbError ? '#ff475760' : '#30363d'}`,
                          borderRadius: 8,
                          padding: '10px 14px',
                          color: 'white',
                          fontSize: '0.85rem',
                          outline: 'none',
                          resize: 'vertical',
                          fontFamily: "'Roboto',sans-serif",
                          lineHeight: 1.5,
                          boxSizing: 'border-box',
                        }}
                      />
                      {fbError && <div style={{ color: '#ff4757', fontSize: '0.75rem', marginTop: 6 }}>⚠️ {fbError}</div>}
                    </div>

                    {/* Nota aclaratoria */}
                    <div style={{ background: 'rgba(0,158,227,0.06)', border: '1px solid #009ee320', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.75rem', color: '#8b949e', lineHeight: 1.6 }}>
                      💙 <strong style={{ color: '#009ee3' }}>Toda ayuda es bienvenida</strong> — sugerencias, mejoras, bugs o ideas que tengas.<br />
                      El equipo de LFA revisa cada feedback y trabaja para implementar las mejoras que propone la comunidad.
                    </div>

                    {/* Botón enviar */}
                    <button
                      onClick={enviarFeedback}
                      disabled={fbEnviando || fbMensaje.trim().length < 10}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: fbEnviando ? '#1c2028' : 'linear-gradient(135deg, #009ee3, #0077b6)',
                        border: 'none',
                        borderRadius: 8,
                        color: 'white',
                        fontFamily: "'Orbitron',sans-serif",
                        fontWeight: 900,
                        fontSize: '0.82rem',
                        letterSpacing: 1,
                        cursor: fbEnviando || fbMensaje.trim().length < 10 ? 'not-allowed' : 'pointer',
                        opacity: fbMensaje.trim().length < 10 ? 0.5 : 1,
                        transition: 'all 0.2s',
                        boxShadow: fbEnviando ? 'none' : '0 0 20px rgba(0,158,227,0.3)',
                      }}
                    >
                      {fbEnviando ? '⏳ ENVIANDO...' : '📨 ENVIAR FEEDBACK'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── LFA TV embebida ──────────────────────────── */}
          <HubLfaTV />

          {/* ── CANTINA embebida ─────────────────────────── */}
          <div style={{ marginBottom: 32, background: '#0d1117', border: '1px solid #ffd70030', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'clamp(340px,50vh,520px)' }}>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid #ffd70020', background: 'rgba(255,215,0,0.04)', flexShrink: 0 }}>
              <span style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.78rem', fontWeight: 900, letterSpacing: 2 }}>🍺 {t.hub_cantina}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {uid ? (
                <CantinaChat
                  uid={uid}
                  nombre={userData?.nombre}
                  avatarUrl={userData?.avatar_url}
                  rol={esAdmin ? (uid === DUEÑO_UID ? 'ceo' : 'soporte') : undefined}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4a5568', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem' }}>
                  CARGANDO CANTINA...
                </div>
              )}
            </div>
          </div>

          {/* MODOS */}
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", color: 'white', margin: '0 0 20px', fontSize: 'clamp(1rem, 3vw, 1.3rem)' }}>
            🎮 {t.hub_selecciona}
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
                    {t.hub_pronto}
                  </span>
                )}
                <span style={{ fontSize: '2.8rem', marginBottom: 12, filter: modo.proximamente ? 'grayscale(1) opacity(0.4)' : `drop-shadow(0 0 8px ${modo.color}80)` }}>{modo.icon}</span>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1rem', fontWeight: 900, color: modo.proximamente ? '#555' : 'white', marginBottom: 8 }}>{modo.title}</div>
                <div style={{ fontSize: '0.82rem', color: '#8b949e', lineHeight: 1.4 }}>{modo.desc}</div>
              </button>
            ))}
          </div>

          {/* ── FEEDBACK ─────────────────────────────────── */}
          <div style={{ marginTop: 40, borderTop: '1px solid #1c2028', paddingTop: 28 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: '1.1rem' }}>💬</span>
              <div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, color: '#009ee3', letterSpacing: 1 }}>TU OPINIÓN MEJORA LFA</div>
                <div style={{ fontSize: '0.68rem', color: '#4a5568', marginTop: 1 }}>Sugerencias, bugs, ideas o valoraciones · Tu ayuda es bienvenida</div>
              </div>
            </div>

            {fbExito ? (
              <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid #00ff8830', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎉</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.85rem', fontWeight: 900, marginBottom: 4 }}>¡GRACIAS POR TU FEEDBACK!</div>
                <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>Lo revisaremos y lo usaremos para mejorar la plataforma. 🙌</div>
              </div>
            ) : (
              <div style={{ background: '#0d1117', border: '1px solid #1c2028', borderRadius: 14, padding: 'clamp(14px,3vw,20px)' }}>

                {/* Pills de tipo */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {FB_TIPOS.map(({ key, icon, label }) => (
                    <button
                      key={key}
                      onClick={() => setFbTipo(key)}
                      style={{
                        padding: '5px 12px', borderRadius: 30, fontSize: '0.72rem', cursor: 'pointer',
                        border: `1px solid ${fbTipo === key ? '#009ee3' : '#30363d'}`,
                        background: fbTipo === key ? 'rgba(0,158,227,0.15)' : 'transparent',
                        color: fbTipo === key ? '#009ee3' : '#8b949e',
                        fontWeight: fbTipo === key ? 700 : 400,
                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >{icon} {label}</button>
                  ))}
                </div>

                {/* Estrellas solo si valoracion */}
                {fbTipo === 'valoracion' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n}
                        onMouseEnter={() => setFbHover(n)} onMouseLeave={() => setFbHover(0)}
                        onClick={() => setFbEstrellas(n)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', padding: 0,
                          transition: 'transform 0.15s', transform: n <= (fbHover || fbEstrellas) ? 'scale(1.25)' : 'scale(1)',
                          filter: n <= (fbHover || fbEstrellas) ? 'none' : 'grayscale(1) opacity(0.3)' }}
                      >⭐</button>
                    ))}
                    <span style={{ color: '#8b949e', fontSize: '0.72rem', marginLeft: 6 }}>
                      {['','Muy malo','Malo','Regular','Bueno','Excelente'][fbHover || fbEstrellas]}
                    </span>
                  </div>
                )}

                {/* Grid: nombre | mensaje + botón */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,180px) 1fr', gap: 10, alignItems: 'flex-start' }}>
                  <input
                    value={fbNombre} onChange={e => setFbNombre(e.target.value)}
                    maxLength={60} placeholder="Nick / nombre"
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
                      padding: '9px 12px', color: 'white', fontSize: '0.8rem', outline: 'none',
                      width: '100%', boxSizing: 'border-box' as const, fontFamily: "'Roboto',sans-serif",
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ position: 'relative' }}>
                      <textarea
                        value={fbMensaje} onChange={e => setFbMensaje(e.target.value)}
                        maxLength={600} rows={3}
                        placeholder={
                          fbTipo === 'bug' ? 'Describí qué pasó y en qué sección...'
                          : fbTipo === 'sugerencia' ? '¿Qué mejoraría la plataforma?'
                          : fbTipo === 'valoracion' ? '¿Qué te parece LFA hasta ahora?'
                          : 'Tu mensaje para el equipo LFA...'
                        }
                        style={{
                          width: '100%', background: '#161b22',
                          border: `1px solid ${fbError ? '#ff475760' : '#30363d'}`,
                          borderRadius: 8, padding: '9px 12px 20px', color: 'white',
                          fontSize: '0.8rem', outline: 'none', resize: 'none',
                          fontFamily: "'Roboto',sans-serif", lineHeight: 1.5, boxSizing: 'border-box' as const,
                        }}
                      />
                      <span style={{ position: 'absolute', bottom: 6, right: 10, fontSize: '0.62rem', color: fbMensaje.length > 550 ? '#ff4757' : '#4a5568', pointerEvents: 'none' }}>
                        {fbMensaje.length}/600
                      </span>
                    </div>
                    {fbError && <div style={{ color: '#ff4757', fontSize: '0.72rem' }}>⚠️ {fbError}</div>}
                    <button
                      onClick={enviarFeedback}
                      disabled={fbEnviando || fbMensaje.trim().length < 10}
                      style={{
                        padding: '9px 18px', borderRadius: 8, border: 'none', cursor: fbEnviando || fbMensaje.trim().length < 10 ? 'not-allowed' : 'pointer',
                        background: fbEnviando ? '#1c2028' : 'linear-gradient(135deg,#009ee3,#0077b6)',
                        color: 'white', fontFamily: "'Orbitron',sans-serif", fontWeight: 900,
                        fontSize: '0.72rem', letterSpacing: 1,
                        opacity: fbMensaje.trim().length < 10 ? 0.5 : 1,
                        boxShadow: fbEnviando || fbMensaje.trim().length < 10 ? 'none' : '0 0 14px rgba(0,158,227,0.3)',
                        transition: 'all 0.2s', alignSelf: 'flex-end',
                      }}
                    >
                      {fbEnviando ? '⏳ ENVIANDO...' : '📨 ENVIAR →'}
                    </button>
                  </div>
                </div>

              </div>
            )}
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
