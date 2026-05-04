'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, onSnapshot, orderBy, limit, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import dynamic from 'next/dynamic';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';

const HubLfaTV    = dynamic(() => import('@/app/_components/HubLfaTV'), { ssr: false });
const CantinaChat = dynamic(() => import('@/app/_components/dashboard/CantinaChat'), { ssr: false });

/* â”€â”€â”€ Tipos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface UserData {
  nombre: string;
  number: number;
  rol?: string;
  avatar_url?: string;
}

interface FeedbackItem {
  id: string;
  nombre: string;
  tipo: string;
  mensaje: string;
  estrellas?: number | null;
  estado: string;
  creado_en?: { toDate?: () => Date } | null;
  ceo_respuesta?: string | null;
  ceo_respondido_en?: { toDate?: () => Date } | null;
}

/* â”€â”€â”€ Constante CEO UID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

type FbTipo = 'sugerencia' | 'bug' | 'valoracion' | 'otro';

const FB_TIPOS: { key: FbTipo; icon: string; label: string }[] = [
  { key: 'sugerencia', icon: 'ðŸ’¡', label: 'Sugerencia' },
  { key: 'bug',        icon: 'ðŸ›', label: 'Bug / Error' },
  { key: 'valoracion', icon: 'â­', label: 'ValoraciÃ³n' },
  { key: 'otro',       icon: 'ðŸ’¬', label: 'Otro' },
];

export default function HubPage() {
  const router                         = useRouter();
  const { lang, setLang, t }           = useLang();
  const [userData, setUserData]        = useState<UserData | null>(null);
  const [esAdmin,       setEsAdmin]       = useState(false);
  const [esOrganizador, setEsOrganizador] = useState(false);
  const [uid,      setUid]             = useState('');
  const [loading,  setLoading]         = useState(true);

  /* â”€â”€â”€ Feedback board state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [feedbackList,   setFeedbackList]   = useState<FeedbackItem[]>([]);
  const [ceoReplyTarget, setCeoReplyTarget] = useState<string | null>(null);
  const [ceoReplyText,   setCeoReplyText]   = useState('');
  const [ceoReplying,    setCeoReplying]    = useState(false);

  /* â”€â”€â”€ Feedback state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [fbOpen,     setFbOpen]     = useState(false);
  const [fbTipo,     setFbTipo]     = useState<FbTipo>('sugerencia');
  const [fbNombre,   setFbNombre]   = useState('');
  const [fbMensaje,  setFbMensaje]  = useState('');
  const [fbEstrellas,setFbEstrellas]= useState(5);
  const [fbHover,    setFbHover]    = useState(0);
  const [fbEnviando, setFbEnviando] = useState(false);
  const [fbExito,    setFbExito]    = useState(false);
  const [fbError,    setFbError]    = useState('');

  /* â”€â”€â”€ Modos de juego (dinÃ¡micos con i18n) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const MODOS = [
    { id: 'arena',   route: '/dashboard', title: t.hub_modo_arena_title,   desc: t.hub_modo_arena_desc,   icon: 'âš”ï¸', color: '#00ff88', proximamente: false },
    { id: 'ligas',   route: '/pro',       title: t.hub_modo_liga_title,    desc: t.hub_modo_liga_desc,    icon: 'ðŸ“…', color: '#009ee3', proximamente: false },
    { id: 'coop',    route: '',           title: t.hub_modo_coop_title,    desc: t.hub_modo_coop_desc,    icon: 'ðŸ¤', color: '#ff6b00', proximamente: true  },
    { id: 'clubes',  route: '',           title: t.hub_modo_clubes_title,  desc: t.hub_modo_clubes_desc,  icon: 'ðŸ›¡ï¸', color: '#ffd700', proximamente: true  },
  ];

  /* â”€â”€ Auth guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }

      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists()) {
          const d = snap.data() as UserData;
          setUserData(d);
          setEsAdmin(user.uid === CEO_UID || d.rol === 'soporte');
          setEsOrganizador(d.rol === 'organizador' || user.uid === CEO_UID);
          setFbNombre(d.nombre || '');
        }
        setUid(user.uid);
      } catch { /* sin red */ }
      setLoading(false);
    });
    return unsub;
  }, [router]);


  /* â”€â”€ Logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function handleLogout() {
    await signOut(auth);
    router.replace('/');
  }

  /* â”€â”€ Acceso a modos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function intentarAcceso(modo: typeof MODOS[0]) {
    if (modo.proximamente) return;
    router.push(modo.route);
  }

  /* â”€â”€ Listener feedback board â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  useEffect(() => {
    const q = query(collection(db, 'feedback'), orderBy('creado_en', 'desc'), limit(50));
    return onSnapshot(q, snap => {
      setFeedbackList(snap.docs.map(d => ({ id: d.id, ...d.data() } as FeedbackItem)));
    });
  }, []);

  /* â”€â”€ CEO responder feedback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function ceoResponder(feedbackId: string) {
    if (!ceoReplyText.trim() || uid !== CEO_UID) return;
    setCeoReplying(true);
    try {
      await updateDoc(doc(db, 'feedback', feedbackId), {
        ceo_respuesta:     ceoReplyText.trim(),
        ceo_respondido_en: serverTimestamp(),
        estado:            'respondido',
      });
      setCeoReplyTarget(null);
      setCeoReplyText('');
    } catch { /* ok */ }
    setCeoReplying(false);
  }

  /* â”€â”€ Enviar feedback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function enviarFeedback() {
    setFbError('');
    if (fbMensaje.trim().length < 10) { setFbError('El mensaje debe tener al menos 10 caracteres.'); return; }
    setFbEnviando(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: fbNombre || 'AnÃ³nimo', tipo: fbTipo, mensaje: fbMensaje, estrellas: fbEstrellas, uid }),
      });
      const data = await res.json();
      if (!res.ok) { setFbError(data.error || 'Error al enviar.'); }
      else { setFbExito(true); setFbMensaje(''); setTimeout(() => { setFbExito(false); setFbOpen(false); }, 3500); }
    } catch { setFbError('Sin conexiÃ³n. IntentÃ¡ de nuevo.'); }
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

        {/* â”€â”€ HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
            â™› <span style={{ color: '#00ff88' }}>LFA</span> HUB
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* CEO */}
            {esAdmin && (
              <a href="/ceo" style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', color: '#ff4757', border: '1px solid #ff475750', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', transition: '0.2s', background: 'rgba(255,71,87,0.06)' }}>
                âš™ï¸ CEO
              </a>
            )}
            {esOrganizador && (
              <a href="/organizador" style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', color: '#a371f7', border: '1px solid #a371f750', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', transition: '0.2s', background: 'rgba(163,113,247,0.06)' }}>
                ðŸŽ™ï¸ MI PANEL
              </a>
            )}
            {/* Billetera */}
            <a href="/billetera" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,215,0,0.06)', padding: '7px 13px', borderRadius: 30, border: '1px solid #ffd70040', textDecoration: 'none', transition: '0.2s', cursor: 'pointer' }}>
              <span style={{ fontSize: '1rem' }}>ðŸ’°</span>
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.72rem', color: '#ffd700' }}>{t.hub_billetera}</span>
            </a>
            {/* Tienda de Puntos */}
            <a href="/tienda" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(243,186,47,0.06)', padding: '7px 13px', borderRadius: 30, border: '1px solid rgba(243,186,47,0.3)', textDecoration: 'none', transition: '0.2s', cursor: 'pointer' }}>
              <span style={{ fontSize: '1rem' }}>ðŸ›’</span>
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.72rem', color: '#f3ba2f' }}>{t.hub_tienda}</span>
            </a>
            {/* Perfil + coins + logout */}
            <a href="/perfil" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', padding: '7px 14px', borderRadius: 30, border: '1px solid #30363d', textDecoration: 'none', transition: '0.2s', cursor: 'pointer' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid #00ff88', overflow: 'hidden', background: '#1c2028', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {userData && userData.avatar_url
                  ? <img src={userData.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '1rem' }}>ðŸ‘¤</span>
                }
              </div>
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 'bold', fontSize: '0.8rem', color: 'white' }}>
                {(userData?.nombre || 'LEYENDA').toUpperCase()}
              </span>
              <span style={{ color: '#ffd700', fontWeight: 'bold', textShadow: '0 0 10px rgba(255,215,0,0.5)', fontSize: '0.82rem' }}>
                ðŸª™ {(userData?.number || 0).toLocaleString()}
              </span>
            </a>
            <button
              onClick={handleLogout}
              title="Cerrar SesiÃ³n"
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
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                <line x1="12" y1="2" x2="12" y2="12"/>
              </svg>
              {t.hub_salir}
            </button>
            {/* Idioma */}
            <LangDropdown lang={lang} setLang={setLang} inline />
          </div>
        </header>

        {/* â”€â”€ CONTENIDO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) 16px 60px' }}>

          {/* â”€â”€ LFA TV embebida â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <HubLfaTV />

          {/* â”€â”€ CANTINA embebida â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div style={{ marginBottom: 32, background: '#0d1117', border: '1px solid #ffd70030', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'clamp(340px,50vh,520px)' }}>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid #ffd70020', background: 'rgba(255,215,0,0.04)', flexShrink: 0 }}>
              <span style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.78rem', fontWeight: 900, letterSpacing: 2 }}>ðŸº {t.hub_cantina}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {uid ? (
                <CantinaChat
                  uid={uid}
                  nombre={userData?.nombre}
                  avatarUrl={userData?.avatar_url}
                  rol={esAdmin ? (uid === CEO_UID ? 'ceo' : 'soporte') : undefined}
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
            ðŸŽ® {t.hub_selecciona}
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
                {/* Badge PRÃ“XIMAMENTE */}
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

          {/* â”€â”€ FEEDBACK PÃšBLICO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div style={{ marginTop: 40, borderTop: '1px solid #1c2028', paddingTop: 28 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: '1.1rem' }}>ðŸ’¬</span>
              <div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, color: '#009ee3', letterSpacing: 1 }}>OPINIONES DE LA COMUNIDAD</div>
                <div style={{ fontSize: '0.68rem', color: '#4a5568', marginTop: 1 }}>Sugerencias, bugs e ideas Â· Lo que piensa la comunidad LFA</div>
              </div>
            </div>

            {/* â”€â”€ Formulario envÃ­o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {fbExito ? (
              <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid #00ff8830', borderRadius: 12, padding: '20px', textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>ðŸŽ‰</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.85rem', fontWeight: 900, marginBottom: 4 }}>Â¡GRACIAS POR TU FEEDBACK!</div>
                <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>Lo revisaremos y usaremos para mejorar la plataforma. ðŸ™Œ</div>
              </div>
            ) : (
              <div style={{ background: '#0d1117', border: '1px solid #1c2028', borderRadius: 14, padding: 'clamp(14px,3vw,20px)', marginBottom: 28 }}>
                <div style={{ fontSize: '0.65rem', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1, marginBottom: 12 }}>DEJAR TU OPINIÃ“N</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {FB_TIPOS.map(({ key, icon, label }) => (
                    <button key={key} onClick={() => setFbTipo(key)} style={{ padding: '5px 12px', borderRadius: 30, fontSize: '0.72rem', cursor: 'pointer', border: `1px solid ${fbTipo === key ? '#009ee3' : '#30363d'}`, background: fbTipo === key ? 'rgba(0,158,227,0.15)' : 'transparent', color: fbTipo === key ? '#009ee3' : '#8b949e', fontWeight: fbTipo === key ? 700 : 400, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 4 }}>{icon} {label}</button>
                  ))}
                </div>
                {fbTipo === 'valoracion' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onMouseEnter={() => setFbHover(n)} onMouseLeave={() => setFbHover(0)} onClick={() => setFbEstrellas(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', padding: 0, transition: 'transform 0.15s', transform: n <= (fbHover || fbEstrellas) ? 'scale(1.25)' : 'scale(1)', filter: n <= (fbHover || fbEstrellas) ? 'none' : 'grayscale(1) opacity(0.3)' }}>â­</button>
                    ))}
                    <span style={{ color: '#8b949e', fontSize: '0.72rem', marginLeft: 6 }}>{['','Muy malo','Malo','Regular','Bueno','Excelente'][fbHover || fbEstrellas]}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,180px) 1fr', gap: 10, alignItems: 'flex-start' }}>
                  <input value={fbNombre} onChange={e => setFbNombre(e.target.value)} maxLength={60} placeholder="Nick / nombre" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '9px 12px', color: 'white', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: "'Roboto',sans-serif" }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ position: 'relative' }}>
                      <textarea value={fbMensaje} onChange={e => setFbMensaje(e.target.value)} maxLength={600} rows={3}
                        placeholder={fbTipo === 'bug' ? 'DescribÃ­ quÃ© pasÃ³ y en quÃ© secciÃ³n...' : fbTipo === 'sugerencia' ? 'Â¿QuÃ© mejorarÃ­a la plataforma?' : fbTipo === 'valoracion' ? 'Â¿QuÃ© te parece LFA hasta ahora?' : 'Tu mensaje para el equipo LFA...'}
                        style={{ width: '100%', background: '#161b22', border: `1px solid ${fbError ? '#ff475760' : '#30363d'}`, borderRadius: 8, padding: '9px 12px 20px', color: 'white', fontSize: '0.8rem', outline: 'none', resize: 'none', fontFamily: "'Roboto',sans-serif", lineHeight: 1.5, boxSizing: 'border-box' as const }} />
                      <span style={{ position: 'absolute', bottom: 6, right: 10, fontSize: '0.62rem', color: fbMensaje.length > 550 ? '#ff4757' : '#4a5568', pointerEvents: 'none' }}>{fbMensaje.length}/600</span>
                    </div>
                    {fbError && <div style={{ color: '#ff4757', fontSize: '0.72rem' }}>âš ï¸ {fbError}</div>}
                    <button onClick={enviarFeedback} disabled={fbEnviando || fbMensaje.trim().length < 10} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: fbEnviando || fbMensaje.trim().length < 10 ? 'not-allowed' : 'pointer', background: fbEnviando ? '#1c2028' : 'linear-gradient(135deg,#009ee3,#0077b6)', color: 'white', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.72rem', letterSpacing: 1, opacity: fbMensaje.trim().length < 10 ? 0.5 : 1, boxShadow: fbEnviando || fbMensaje.trim().length < 10 ? 'none' : '0 0 14px rgba(0,158,227,0.3)', transition: 'all 0.2s', alignSelf: 'flex-end' as const }}>
                      {fbEnviando ? 'â³ ENVIANDO...' : 'ðŸ“¨ ENVIAR â†’'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* â”€â”€ Historial pÃºblico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {feedbackList.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px', color: '#4a5568', fontSize: '0.72rem', fontFamily: "'Orbitron',sans-serif" }}>
                  SIN OPINIONES AÃšN Â· SÃ‰ EL PRIMERO
                </div>
              )}
              {feedbackList.map(item => {
                const TIPO_CLR: Record<string,string> = { sugerencia:'#009ee3', bug:'#ff4757', valoracion:'#ffd700', otro:'#8b949e' };
                const TIPO_ICO: Record<string,string> = { sugerencia:'ðŸ’¡', bug:'ðŸ›', valoracion:'â­', otro:'ðŸ’¬' };
                const color = TIPO_CLR[item.tipo] ?? '#8b949e';
                const ico   = TIPO_ICO[item.tipo] ?? 'ðŸ’¬';
                const isRespondido  = !!item.ceo_respuesta;
                const isCeoOpen     = ceoReplyTarget === item.id;
                const fechaStr      = item.creado_en?.toDate?.()
                  ? item.creado_en.toDate!().toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '';
                return (
                  <div key={item.id} style={{ background: '#0d1117', border: `1px solid ${isRespondido ? 'rgba(0,255,136,0.2)' : '#1c2028'}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ background: `${color}18`, color, border: `1px solid ${color}40`, borderRadius: 20, padding: '2px 10px', fontSize: '0.62rem', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>
                        {ico} {item.tipo.toUpperCase()}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>{item.nombre}</span>
                      {item.tipo === 'valoracion' && item.estrellas && (
                        <span style={{ color: '#ffd700', fontSize: '0.75rem' }}>{'â­'.repeat(item.estrellas)}</span>
                      )}
                      <span style={{ marginLeft: 'auto', color: '#4a5568', fontSize: '0.65rem' }}>{fechaStr}</span>
                    </div>
                    <div style={{ color: '#cdd9e5', fontSize: '0.82rem', lineHeight: 1.55 }}>{item.mensaje}</div>

                    {/* Respuesta CEO */}
                    {isRespondido && (
                      <div style={{ marginTop: 10, background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.58rem', color: '#ffd700', fontWeight: 900, marginBottom: 4 }}>â­ CEO LFA</div>
                        <div style={{ color: '#cdd9e5', fontSize: '0.8rem', lineHeight: 1.5 }}>{item.ceo_respuesta}</div>
                      </div>
                    )}

                    {/* CEO: botÃ³n responder */}
                    {esAdmin && !isRespondido && (
                      <div style={{ marginTop: 10 }}>
                        {!isCeoOpen ? (
                          <button onClick={() => { setCeoReplyTarget(item.id); setCeoReplyText(''); }} style={{ background: 'rgba(255,215,0,0.07)', border: '1px solid #ffd70030', color: '#ffd700', borderRadius: 8, padding: '4px 14px', fontSize: '0.63rem', cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>
                            âœï¸ RESPONDER
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <textarea value={ceoReplyText} onChange={e => setCeoReplyText(e.target.value)} maxLength={400} rows={2} placeholder="Tu respuesta como CEO..." style={{ flex: 1, background: '#161b22', border: '1px solid #ffd70030', borderRadius: 8, padding: '8px 10px', color: 'white', fontSize: '0.78rem', resize: 'none', fontFamily: "'Roboto',sans-serif", outline: 'none' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <button onClick={() => ceoResponder(item.id)} disabled={ceoReplying || !ceoReplyText.trim()} style={{ background: 'linear-gradient(135deg,#ffd700,#f0a500)', border: 'none', color: '#0b0e14', borderRadius: 8, padding: '6px 14px', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.63rem', cursor: 'pointer', opacity: !ceoReplyText.trim() ? 0.5 : 1 }}>
                                {ceoReplying ? '...' : 'âœ… OK'}
                              </button>
                              <button onClick={() => setCeoReplyTarget(null)} style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', borderRadius: 8, padding: '4px 10px', fontSize: '0.62rem', cursor: 'pointer' }}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>

        </div>
      </div>

      <style>{`
        @keyframes pulseRed {
          0% { opacity: 1; }
          50% { opacity: 0.7; }
          100% { opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
