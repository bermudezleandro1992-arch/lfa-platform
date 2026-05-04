'use client';

import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, where, onSnapshot, doc, getDoc,
  addDoc, updateDoc, serverTimestamp, orderBy, limit,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import LangDropdown, { useLang } from '@/app/_components/LangDropdown';
import SiteFooter from '@/app/_components/SiteFooter';
import Link from 'next/link';

/* =============================================
   CONSTANTES
============================================= */
const LIGA_ID    = 'LFA';
const LIGA_LABEL = 'LIGA LFA — eFOOTBALL CROSSPLAY';
const LIGA_COLOR = '#00ff88';
const WA_GROUP   = 'https://chat.whatsapp.com/ICI491mtd1kKfYkOU5iJXN';

const PAISES = [
  'Argentina','Uruguay','Brasil','Chile','Colombia','Peru',
  'Venezuela','Ecuador','Bolivia','Paraguay','Mexico','Otro',
];
const COUNTRY_CODE: Record<string,string> = {
  Argentina:'ar', Uruguay:'uy', Brasil:'br', Chile:'cl', Colombia:'co', Peru:'pe',
  Venezuela:'ve', Ecuador:'ec', Bolivia:'bo', Paraguay:'py', Mexico:'mx', Otro:'un',
};
function flagUrl(pais: string) {
  return `https://flagcdn.com/20x15/${COUNTRY_CODE[pais] ?? 'un'}.png`;
}

/* =============================================
   TIPOS
============================================= */
interface Equipo {
  id: string; nombre: string; logo_url: string; pais: string;
  liga: string; plataforma: string; uid: string; capitan: string;
  game_id: string; whatsapp: string; grupo: string;
  pts: number; pg: number; pe: number; pp: number; gf: number; gc: number;
}
interface Partido {
  id: string;
  equipo_local_id: string; equipo_visit_id: string;
  local_nombre: string;  visit_nombre: string;
  local_logo: string;    visit_logo: string;
  goles_local: number | null; goles_visit: number | null;
  status: 'PENDIENTE'|'REPORTE_LOCAL'|'REPORTE_VISIT'|'VALIDADO'|'DISPUTA';
  screenshot_url?: string;
  liga: string; ronda: 'GRUPO'|'PLAYOFF_IDA'|'PLAYOFF_VUELTA'; grupo: string;
  created_at?: { toMillis?: () => number };
}
interface ChatMsg {
  id: string; uid: string; nombre: string; logo_url?: string;
  texto: string; liga: string;
  ts?: { toMillis?: () => number } | null;
}
interface Desafio {
  id: string;
  de_uid: string; de_nombre: string; de_logo?: string;
  para_uid: string; para_nombre: string;
  liga: string; status: 'PENDIENTE'|'ACEPTADO'|'RECHAZADO';
  creado_at?: { toMillis?: () => number } | null;
}
interface MatchChatMsg {
  id: string; uid: string; nombre: string; logo_url?: string;
  texto: string; desafio_id: string;
  ts?: { toMillis?: () => number } | null;
}

/* =============================================
   ESTILOS BASE
============================================= */
const INP: React.CSSProperties = {
  width:'100%', padding:'10px 12px', background:'#161b22',
  border:'1px solid #30363d', borderRadius:8, color:'white',
  fontSize:'0.82rem', marginBottom:14, outline:'none', boxSizing:'border-box',
};
const BTN_GREEN: React.CSSProperties = {
  fontFamily:"'Orbitron',sans-serif", fontWeight:900, fontSize:'0.72rem',
  letterSpacing:1, cursor:'pointer', border:'none', borderRadius:10,
  padding:'11px 18px',
  background:'linear-gradient(135deg,#00ff88,#00a859)',
  color:'#0b0e14', transition:'opacity 0.2s',
};

/* =============================================
   COMPONENTE PRINCIPAL
============================================= */
export default function ProPage() {
  const { lang, setLang, t } = useLang();

  const [uid,       setUid]       = useState<string|null>(null);
  const [userData,  setUserData]  = useState<{nombre?:string;konami_id?:string;avatar_url?:string}|null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [tab, setTab] = useState<'info'|'fixture'|'chat'|'desafios'>('fixture');

  const [equipos,  setEquipos]  = useState<Equipo[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [desafios, setDesafios] = useState<Desafio[]>([]);
  const [miEquipo, setMiEquipo] = useState<Equipo|null>(null);

  const [desafiosPendientes, setDesafiosPendientes] = useState(0);
  const [bellAnim,           setBellAnim]           = useState(false);

  const [matchChatOpen,    setMatchChatOpen]    = useState(false);
  const [matchChatDesafio, setMatchChatDesafio] = useState<Desafio|null>(null);
  const [matchChatMsgs,    setMatchChatMsgs]    = useState<MatchChatMsg[]>([]);
  const [matchChatInput,   setMatchChatInput]   = useState('');
  const [sendingMatch,     setSendingMatch]     = useState(false);
  const matchChatRef = useRef<HTMLDivElement>(null);

  const [showInscripcion,  setShowInscripcion]  = useState(false);
  const [form,             setForm]             = useState({
    nombre:'', pais:'Argentina', plataforma:'PS5', game_id:'', whatsapp:'',
  });
  const [logoFile,       setLogoFile]       = useState<File|null>(null);
  const [logoPreview,    setLogoPreview]    = useState('');
  const [inscribiendo,   setInscribiendo]   = useState(false);
  const [inscripcionMsg, setInscripcionMsg] = useState('');

  const [showReporte, setShowReporte] = useState<string|null>(null);
  const [gLocal,      setGLocal]      = useState('');
  const [gVisit,      setGVisit]      = useState('');
  const [screenshot,  setScreenshot]  = useState<File|null>(null);
  const [reportando,  setReportando]  = useState(false);
  const [reporteMsg,  setReporteMsg]  = useState('');
  const [validando,   setValidando]   = useState<string|null>(null);

  const [chatInput,   setChatInput]   = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [desafiando, setDesafiando] = useState<string|null>(null);

  /* ── Auth ─────────────────────────────────────── */
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const snap = await getDoc(doc(db,'usuarios',user.uid));
        if (snap.exists()) setUserData(snap.data() as {nombre?:string;konami_id?:string;avatar_url?:string});
      } else { setUid(null); setUserData(null); }
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db,'liga_pro_equipos'), where('liga','==',LIGA_ID)),
      snap => setEquipos(snap.docs.map(d => ({id:d.id,...d.data()} as Equipo)))
    );
  }, []);

  useEffect(() => {
    if (!uid) { setMiEquipo(null); return; }
    setMiEquipo(equipos.find(e => e.uid === uid) ?? null);
  }, [equipos, uid]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db,'liga_pro_partidos'), where('liga','==',LIGA_ID)),
      snap => setPartidos(snap.docs.map(d => ({id:d.id,...d.data()} as Partido)))
    );
  }, []);

  useEffect(() => {
    if (tab !== 'chat') return;
    const q = query(
      collection(db,'liga_pro_mensajes'),
      where('liga','==',LIGA_ID),
      orderBy('ts','desc'), limit(80)
    );
    return onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({id:d.id,...d.data()} as ChatMsg)).reverse();
      setChatMsgs(msgs);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({behavior:'smooth'}), 100);
    });
  }, [tab]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db,'liga_desafios'), where('liga','==',LIGA_ID));
    return onSnapshot(q, snap => {
      const todos = snap.docs.map(d => ({id:d.id,...d.data()} as Desafio));
      setDesafios(todos);
      const pend = todos.filter(d => d.para_uid === uid && d.status === 'PENDIENTE').length;
      if (pend > 0) setBellAnim(true);
      setDesafiosPendientes(pend);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (!matchChatDesafio) return;
    const q = query(
      collection(db,'liga_match_chat'),
      where('desafio_id','==',matchChatDesafio.id),
      orderBy('ts','asc'), limit(100)
    );
    return onSnapshot(q, snap => {
      setMatchChatMsgs(snap.docs.map(d => ({id:d.id,...d.data()} as MatchChatMsg)));
      setTimeout(() => matchChatRef.current?.scrollIntoView({behavior:'smooth'}), 80);
    });
  }, [matchChatDesafio]);

  useEffect(() => {
    if (userData?.konami_id) setForm(f => ({...f, game_id: userData!.konami_id!}));
  }, [userData]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2*1024*1024) { alert('Imagen menor a 2MB.'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function inscribir() {
    if (!uid) return;
    if (!form.nombre.trim() || !form.game_id.trim() || !form.whatsapp.trim()) {
      setInscripcionMsg('Completá nombre, Konami ID y WhatsApp.'); return;
    }
    setInscribiendo(true); setInscripcionMsg('');
    try {
      const token = await auth.currentUser!.getIdToken();
      let logo_url = '';
      if (logoFile) {
        const fd = new FormData();
        fd.append('file', logoFile); fd.append('partidoId','logo');
        const up = await fetch('/api/pro/upload',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});
        if (up.ok) logo_url = (await up.json()).url ?? '';
      }
      const res = await fetch('/api/pro/inscribir',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body: JSON.stringify({...form, liga:LIGA_ID, juego:'EFOOTBALL', logo_url}),
      });
      const data = await res.json();
      if (!res.ok) { setInscripcionMsg(data.error); return; }
      setInscripcionMsg('Inscripcion exitosa! Bienvenido a la Liga LFA');
      setTimeout(() => { setShowInscripcion(false); setTab('fixture'); }, 1800);
    } catch { setInscripcionMsg('Error de red.'); }
    finally { setInscribiendo(false); }
  }

  async function reportar() {
    if (!uid || !showReporte) return;
    if (gLocal === '' || gVisit === '') { setReporteMsg('Ingresa el marcador.'); return; }
    setReportando(true); setReporteMsg('');
    try {
      const token = await auth.currentUser!.getIdToken();
      let screenshotUrl = '';
      if (screenshot) {
        const fd = new FormData();
        fd.append('file', screenshot); fd.append('partidoId', showReporte);
        const up = await fetch('/api/pro/upload',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});
        if (up.ok) screenshotUrl = (await up.json()).url ?? '';
      }
      const res = await fetch('/api/pro/reportar',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body: JSON.stringify({partidoId:showReporte,goles_local:Number(gLocal),goles_visit:Number(gVisit),screenshot_url:screenshotUrl}),
      });
      const data = await res.json();
      if (!res.ok) { setReporteMsg(data.error); return; }
      setReporteMsg('Reportado. Tu rival debe validar.');
      setTimeout(() => { setShowReporte(null); setGLocal(''); setGVisit(''); setScreenshot(null); setReporteMsg(''); }, 1800);
    } catch { setReporteMsg('Error de red.'); }
    finally { setReportando(false); }
  }

  async function validar(partidoId: string) {
    setValidando(partidoId);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/pro/validar',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body: JSON.stringify({partidoId}),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error);
    } catch { alert('Error de red.'); }
    finally { setValidando(null); }
  }

  async function sendChat() {
    if (!uid || !chatInput.trim() || sendingChat) return;
    setSendingChat(true);
    try {
      await addDoc(collection(db,'liga_pro_mensajes'),{
        uid, liga:LIGA_ID,
        nombre: miEquipo?.nombre ?? userData?.nombre ?? 'Jugador',
        logo_url: miEquipo?.logo_url ?? userData?.avatar_url ?? '',
        texto: chatInput.trim().slice(0,280),
        ts: serverTimestamp(),
      });
      setChatInput('');
      setTimeout(() => setSendingChat(false), 3000);
    } catch { setSendingChat(false); }
  }

  async function enviarDesafio(rivalEquipo: Equipo) {
    if (!uid || !miEquipo) return;
    setDesafiando(rivalEquipo.uid);
    try {
      await addDoc(collection(db,'liga_desafios'),{
        de_uid:uid, de_nombre:miEquipo.nombre, de_logo:miEquipo.logo_url ?? '',
        para_uid:rivalEquipo.uid, para_nombre:rivalEquipo.nombre,
        liga:LIGA_ID, status:'PENDIENTE', creado_at:serverTimestamp(),
      });
    } catch { alert('Error al enviar desafio.'); }
    finally { setDesafiando(null); }
  }

  async function aceptarDesafio(d: Desafio) {
    await updateDoc(doc(db,'liga_desafios',d.id), {status:'ACEPTADO'});
    setMatchChatDesafio(d); setMatchChatOpen(true);
  }

  async function rechazarDesafio(id: string) {
    await updateDoc(doc(db,'liga_desafios',id), {status:'RECHAZADO'});
  }

  async function sendMatchChat() {
    if (!uid || !matchChatDesafio || !matchChatInput.trim() || sendingMatch) return;
    setSendingMatch(true);
    try {
      await addDoc(collection(db,'liga_match_chat'),{
        uid, desafio_id:matchChatDesafio.id, liga:LIGA_ID,
        nombre: miEquipo?.nombre ?? userData?.nombre ?? 'Jugador',
        logo_url: miEquipo?.logo_url ?? userData?.avatar_url ?? '',
        texto: matchChatInput.trim().slice(0,280),
        ts: serverTimestamp(),
      });
      setMatchChatInput('');
    } catch { /* silent */ }
    finally { setSendingMatch(false); }
  }

  /* ── Derived ─────────────────────────────────── */
  const ranking = [...equipos].sort((a,b) =>
    b.pts-a.pts || (b.gf-b.gc)-(a.gf-a.gc) || b.gf-a.gf
  );
  const historial = partidos
    .filter(p => p.status === 'VALIDADO')
    .sort((a,b) => (b.created_at?.toMillis?.()??0)-(a.created_at?.toMillis?.()??0));
  const misPartidos = miEquipo
    ? partidos.filter(p => p.equipo_local_id===miEquipo.id || p.equipo_visit_id===miEquipo.id)
    : [];
  const misParaValidar = misPartidos.filter(p => miEquipo && (
    (p.status==='REPORTE_LOCAL' && p.equipo_visit_id===miEquipo.id) ||
    (p.status==='REPORTE_VISIT' && p.equipo_local_id===miEquipo.id)
  ));
  const misParaReportar = misPartidos.filter(p => p.status==='PENDIENTE');
  const misDesafiosRecibidos = desafios.filter(d => d.para_uid===uid && d.status==='PENDIENTE');
  const misDesafiosEnviados  = desafios.filter(d => d.de_uid===uid && d.status==='PENDIENTE');
  const misMatchsAbiertos    = desafios.filter(d => (d.de_uid===uid||d.para_uid===uid) && d.status==='ACEPTADO');

  /* ── GRUPOS del ranking ──────────────────────── */
  const grupos = Array.from(new Set(equipos.map(e => e.grupo).filter(Boolean))).sort();

  /* =============================================
     RENDER
  ============================================= */
  return (
    <>
      <div style={{margin:0,fontFamily:'Roboto,sans-serif',background:'#0b0e14',color:'white',minHeight:'100vh'}}>

        {/* NAV */}
        <div style={{position:'sticky',top:0,zIndex:200,background:'rgba(11,14,20,0.97)',backdropFilter:'blur(12px)',borderBottom:'1px solid #1c2028',padding:'0 14px',display:'flex',alignItems:'center',height:50,gap:10}}>
          <Link href="/hub" style={{color:'#8b949e',textDecoration:'none',fontFamily:"'Orbitron',sans-serif",fontSize:'0.62rem',fontWeight:700,letterSpacing:1,whiteSpace:'nowrap'}}>← HUB</Link>
          <div style={{flex:1,textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'0.72rem',fontWeight:900,color:LIGA_COLOR,letterSpacing:2}}>LIGA LFA 1vs1</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {uid && (
              <button onClick={() => {setTab('desafios');setBellAnim(false);}} style={{position:'relative',background:'none',border:'none',cursor:'pointer',padding:4}} title="Desafios">
                <span style={{fontSize:'1.2rem',display:'inline-block',animation:bellAnim?'bell-ring 0.5s ease':'none'}}>🔔</span>
                {desafiosPendientes>0 && (
                  <span style={{position:'absolute',top:0,right:0,background:'#ff4757',color:'white',borderRadius:'50%',width:16,height:16,fontSize:'0.55rem',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Orbitron',sans-serif"}}>
                    {desafiosPendientes}
                  </span>
                )}
              </button>
            )}
            <Link href="/perfil" style={{color:'#8b949e',textDecoration:'none',fontFamily:"'Orbitron',sans-serif",fontSize:'0.62rem',fontWeight:700}}>PERFIL</Link>
            <LangDropdown lang={lang} setLang={setLang} inline />
          </div>
        </div>

        {/* HERO */}
        <section style={{padding:'clamp(36px,6vw,64px) 20px clamp(24px,4vw,40px)',display:'flex',flexDirection:'column',alignItems:'center',position:'relative',overflow:'hidden',textAlign:'center'}}>
          <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 80% 50% at 50% 0%,rgba(0,255,136,0.07) 0%,transparent 70%)',pointerEvents:'none'}} />
          <div style={{background:'rgba(0,255,136,0.06)',border:'1px solid rgba(0,255,136,0.25)',borderRadius:30,padding:'4px 16px',fontSize:'0.6rem',color:LIGA_COLOR,fontFamily:"'Orbitron',sans-serif",fontWeight:900,letterSpacing:2,marginBottom:12}}>
            GRATUITA · SOMOS LFA
          </div>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'clamp(1.8rem,6vw,3rem)',fontWeight:900,color:'white',lineHeight:1.1,letterSpacing:'clamp(2px,1vw,4px)',marginBottom:8}}>
            LIGA <span style={{color:LIGA_COLOR}}>LFA</span> 1vs1
          </div>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'clamp(0.6rem,1.8vw,0.78rem)',color:'#ffd700',letterSpacing:3,marginBottom:10}}>
            eFOOTBALL · CROSSPLAY · DREAM TEAM · LATAM SUR · GRATIS
          </div>
          <div style={{background:'rgba(0,158,227,0.08)',border:'1px solid rgba(0,158,227,0.25)',borderRadius:10,padding:'10px 18px',maxWidth:560,marginBottom:18,fontSize:'0.75rem',color:'#009ee3',lineHeight:1.6}}>
            <strong>Por ahora arrancamos con eFOOTBALL unicamente · Region LATAM SUR</strong> para garantizar la mejor conexion y evitar lag. PC, PS5 y Xbox compiten juntos gracias al <strong>Crossplay activado</strong>.
          </div>
          <p style={{color:'#8b949e',fontSize:'0.82rem',maxWidth:520,lineHeight:1.75,marginBottom:22}}>
            Competí en la Liga oficial de SomosLFA. <strong style={{color:'#cdd9e5'}}>Fase de grupos</strong> todos contra todos con ida y vuelta, <strong style={{color:'#cdd9e5'}}>playoffs</strong> a doble partido con penales si hay empate. Modo <strong style={{color:'#ffd700'}}>DREAM TEAM</strong> — Plantilla libre — Crossplay.
          </p>
          {authReady && (
            miEquipo ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                <div style={{background:'rgba(0,255,136,0.08)',border:'1px solid rgba(0,255,136,0.3)',borderRadius:12,padding:'10px 24px',fontFamily:"'Orbitron',sans-serif",fontSize:'0.72rem',color:LIGA_COLOR,fontWeight:900}}>
                  INSCRIPTO — {miEquipo.nombre}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={() => setTab('fixture')} style={{...BTN_GREEN,padding:'8px 16px',fontSize:'0.65rem'}}>MIS PARTIDOS</button>
                  <button onClick={() => setTab('desafios')} style={{background:'rgba(255,215,0,0.08)',border:'1px solid rgba(255,215,0,0.3)',color:'#ffd700',borderRadius:10,padding:'8px 16px',cursor:'pointer',fontSize:'0.65rem',fontFamily:"'Orbitron',sans-serif",fontWeight:900}}>
                    DESAFIOS {desafiosPendientes>0 && <span style={{background:'#ff4757',borderRadius:'50%',padding:'0 5px',color:'white',fontSize:'0.6rem',marginLeft:4}}>{desafiosPendientes}</span>}
                  </button>
                </div>
              </div>
            ) : uid ? (
              <button onClick={() => setShowInscripcion(true)} style={{...BTN_GREEN,fontSize:'0.85rem',padding:'14px 36px',boxShadow:'0 0 24px rgba(0,255,136,0.35)'}}>
                INSCRIBIRME A LA LIGA
              </button>
            ) : (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                <Link href="/auth" style={{...BTN_GREEN,fontSize:'0.85rem',padding:'14px 36px',textDecoration:'none',boxShadow:'0 0 24px rgba(0,255,136,0.35)'}}>
                  CREAR CUENTA Y UNIRME
                </Link>
                <div style={{color:'#4a5568',fontSize:'0.7rem'}}>Ya tenes cuenta? <Link href="/auth" style={{color:LIGA_COLOR}}>Inicia sesion</Link></div>
              </div>
            )
          )}
          <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',marginTop:20}}>
            {['PC','PS5','Xbox','Gratis','LATAM SUR'].map(p => (
              <span key={p} style={{background:'#161b22',border:'1px solid #30363d',borderRadius:20,padding:'4px 14px',fontSize:'0.63rem',color:'#8b949e',fontFamily:"'Orbitron',sans-serif",fontWeight:700}}>{p}</span>
            ))}
          </div>

          {/* WHATSAPP GROUP */}
          <a href={WA_GROUP} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:12,marginTop:22,background:'rgba(37,211,102,0.08)',border:'1px solid rgba(37,211,102,0.3)',borderRadius:14,padding:'12px 22px',textDecoration:'none',maxWidth:420,width:'100%'}}>
            <div style={{width:42,height:42,borderRadius:'50%',background:'rgba(37,211,102,0.15)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <svg width="24" height="24" viewBox="0 0 32 32" fill="#25d366">
                <path d="M16 2.9C8.8 2.9 2.9 8.8 2.9 16c0 2.3.6 4.5 1.8 6.5L2 30l7.7-2.7c1.9 1 4 1.6 6.3 1.6 7.2 0 13.1-5.9 13.1-13.1C29.1 8.8 23.2 2.9 16 2.9zm0 24c-2.1 0-4.1-.6-5.8-1.6l-.4-.2-4.6 1.6 1.6-4.5-.3-.5C5.5 20 4.9 18 4.9 16c0-6.1 5-11.1 11.1-11.1 6.1 0 11.1 5 11.1 11.1C27.1 22 22.1 27 16 27zm6.1-8.3c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6 0-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.5-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.7-.9-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.9-.8 2.1-1.5.3-.7.3-1.3.2-1.5-.1-.2-.3-.3-.6-.4z"/>
              </svg>
            </div>
            <div>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.68rem',fontWeight:900,color:'#25d366',letterSpacing:1}}>GRUPO WHATSAPP OFICIAL</div>
              <div style={{fontSize:'0.7rem',color:'#8b949e',marginTop:2}}>Unite al grupo para coordinar partidos y novedades de la liga</div>
            </div>
            <div style={{marginLeft:'auto',fontSize:'0.6rem',color:'#25d366',fontFamily:"'Orbitron',sans-serif",fontWeight:700,whiteSpace:'nowrap'}}>UNIRSE →</div>
          </a>
        </section>

        {/* FORMAT CARDS */}
        <section style={{background:'#0d1117',borderTop:'1px solid #1c2028',borderBottom:'1px solid #1c2028',padding:'clamp(14px,2.5vw,26px) 20px'}}>
          <div style={{maxWidth:960,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10}}>
            {[
              {icon:'',title:'GRUPOS',desc:'Todos contra todos. Ida y vuelta.'},
              {icon:'',title:'PLAYOFFS',desc:'Ida y vuelta + penales.'},
              {icon:'',title:'DREAM TEAM',desc:'Modo oficial eFOOTBALL.'},
              {icon:'',title:'PLANTILLA LIBRE',desc:'Cualquier equipo.'},
              {icon:'',title:'CROSSPLAY',desc:'PC, PS5 y Xbox juntos.'},
              {icon:'',title:'LATAM SUR',desc:'Sin lag · Mejor conexion.'},
            ].map(c => (
              <div key={c.title} style={{background:'#161b22',border:'1px solid #21262d',borderRadius:10,padding:'13px 11px',textAlign:'center'}}>
                <div style={{fontSize:'1.25rem',marginBottom:5}}>{c.icon}</div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.56rem',fontWeight:900,color:LIGA_COLOR,letterSpacing:1,marginBottom:3}}>{c.title}</div>
                <div style={{color:'#8b949e',fontSize:'0.64rem',lineHeight:1.5}}>{c.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* TABS */}
        <section style={{maxWidth:1100,margin:'0 auto',padding:'20px 14px 60px'}}>
          <div style={{display:'flex',gap:2,borderBottom:'1px solid #1c2028',marginBottom:24,overflowX:'auto'}}>
            {([
              {id:'info',    label:'INFO'},
              {id:'fixture', label:'FIXTURE & RANKING'},
              {id:'chat',    label:'CHAT'},
              {id:'desafios',label:`DESAFIOS${desafiosPendientes>0?` (${desafiosPendientes})`:''}`},
            ] as const).map(tb => (
              <button key={tb.id} onClick={() => setTab(tb.id)} style={{
                fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.62rem',letterSpacing:1,
                padding:'10px 14px',background:'transparent',border:'none',cursor:'pointer',
                color:tab===tb.id?LIGA_COLOR:'#4a5568',
                borderBottom:`2px solid ${tab===tb.id?LIGA_COLOR:'transparent'}`,
                transition:'all 0.2s',whiteSpace:'nowrap',
              }}>{tb.label}</button>
            ))}
          </div>

          {/* TAB: INFO */}
          {tab==='info' && (
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <InfoBox title="LIGA LFA eFOOTBALL — NUEVA TEMPORADA" color={LIGA_COLOR}>
                <div style={{background:'rgba(0,255,136,0.04)',border:'1px solid rgba(0,255,136,0.12)',borderRadius:8,padding:'12px 14px',marginBottom:12,fontSize:'0.78rem',color:'#cdd9e5',lineHeight:1.7}}>
                  <strong style={{color:LIGA_COLOR}}>Las inscripciones estan abiertas y podes empezar a jugar ya!</strong><br/>
                  Anotate, desafia a tus rivales en el ranking y subi los resultados. El ranking se actualiza en tiempo real.
                </div>
                <ol style={{paddingLeft:20,margin:0,lineHeight:2.1,color:'#cdd9e5',fontSize:'0.8rem'}}>
                  <li>Te inscribis gratis con tu Konami ID y WhatsApp.</li>
                  <li>Se forman grupos de hasta 4 equipos. Jugas contra todos: ida y vuelta.</li>
                  <li>Los 2 mejores de cada grupo avanzan a Playoffs.</li>
                  <li>Playoffs: eliminacion, ida y vuelta. Empate a penales.</li>
                  <li>Desde el ranking podes <strong style={{color:'#ffd700'}}>desafiar</strong> a tu rival y coordinar en el match chat.</li>
                  <li>Subis el resultado con foto, tu rival valida, ranking actualizado.</li>
                </ol>
              </InfoBox>
              <InfoBox title="eFOOTBALL CROSSPLAY — TODO LO QUE NECESITAS SABER" color="#ffd700">
                <ul style={{paddingLeft:20,margin:0,lineHeight:2.1,color:'#cdd9e5',fontSize:'0.8rem'}}>
                  <li>Juego: <strong style={{color:'#ffd700'}}>eFOOTBALL</strong> — Modo: <strong style={{color:'#ffd700'}}>DREAM TEAM</strong></li>
                  <li>Region exclusiva: <strong style={{color:'#009ee3'}}>LATAM SUR</strong> para evitar lag y garantizar buena conexion.</li>
                  <li>Crossplay activado — <strong>PC, PlayStation y Xbox juegan entre si</strong> sin problemas.</li>
                  <li>Plantilla libre — cualquier equipo, sin restriccion de rating.</li>
                  <li>Para jugar: uno crea la sala privada, comparte la contrasena por el match chat y el rival se une.</li>
                  <li>Captura obligatoria del marcador final para validar resultados.</li>
                  <li>Fair play obligatorio. El irrespeto implica descalificacion inmediata.</li>
                </ul>
              </InfoBox>
              <InfoBox title="SISTEMA DE DESAFIOS" color="#a371f7">
                <ul style={{paddingLeft:20,margin:0,lineHeight:2.1,color:'#cdd9e5',fontSize:'0.8rem'}}>
                  <li>Desde el <strong style={{color:'#ffd700'}}>RANKING</strong> podes hacer click en <strong style={{color:'#a371f7'}}>DESAFIAR</strong> en el equipo rival.</li>
                  <li>Tu rival recibe una <strong style={{color:'#ffd700'}}>notificacion</strong> en la campana de la barra superior.</li>
                  <li>Si acepta, se abre el <strong style={{color:LIGA_COLOR}}>Match Chat</strong> para coordinar quien crea la sala y la contrasena.</li>
                  <li>Despues del partido, cualquiera sube el resultado en el boton REPORTAR.</li>
                  <li>El rival hace click en <strong style={{color:LIGA_COLOR}}>VALIDAR</strong> para confirmar.</li>
                  <li>Al validarse, el ranking se actualiza automaticamente.</li>
                </ul>
              </InfoBox>
              <InfoBox title="COMO REPORTAR UN RESULTADO" color="#009ee3">
                <ul style={{paddingLeft:20,margin:0,lineHeight:2.1,color:'#cdd9e5',fontSize:'0.8rem'}}>
                  <li>Cualquiera de los dos puede reportar — no importa si gano o perdio.</li>
                  <li>Subis la captura del marcador como prueba.</li>
                  <li>Tu rival hace click en <strong style={{color:LIGA_COLOR}}>VALIDAR</strong>.</li>
                  <li>Si no valida en 24hs, LFA acepta el resultado automaticamente.</li>
                  <li>Resultado en disputa escribinos en el chat de la liga para intervencion.</li>
                </ul>
              </InfoBox>
              <InfoBox title="LIGAS GRATUITAS — SOMOS LFA" color="#a371f7">
                <p style={{margin:0,color:'#cdd9e5',fontSize:'0.82rem',lineHeight:1.85}}>
                  Las Ligas LFA son <strong style={{color:'#a371f7'}}>100% gratuitas</strong>. Solo pasion por el futbol virtual y ganas de competir.<br/><br/>
                  <strong style={{color:LIGA_COLOR}}>Dudas? Escribinos en el chat. Somos LFA.</strong>
                </p>
              </InfoBox>
            </div>
          )}

          {/* TAB: FIXTURE & RANKING */}
          {tab==='fixture' && (
            <div style={{display:'flex',flexDirection:'column',gap:28}}>
              {miEquipo && (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {misParaValidar.length>0 && (
                    <div style={{background:'rgba(255,215,0,0.05)',border:'1px solid rgba(255,215,0,0.3)',borderRadius:10,padding:'11px 16px',display:'flex',alignItems:'center',gap:10}}>
                      <div>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.62rem',color:'#ffd700',fontWeight:900}}>TENES RESULTADOS PARA VALIDAR</div>
                        <div style={{fontSize:'0.68rem',color:'#8b949e',marginTop:2}}>Tu rival reporto el marcador. Hace click en VALIDAR.</div>
                      </div>
                    </div>
                  )}
                  {desafiosPendientes>0 && (
                    <div onClick={() => setTab('desafios')} style={{background:'rgba(163,113,247,0.05)',border:'1px solid rgba(163,113,247,0.3)',borderRadius:10,padding:'11px 16px',display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                      <div>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.62rem',color:'#a371f7',fontWeight:900}}>{desafiosPendientes} DESAFIO{desafiosPendientes>1?'S':''} PENDIENTE{desafiosPendientes>1?'S':''}</div>
                        <div style={{fontSize:'0.68rem',color:'#8b949e',marginTop:2}}>Ver desafios</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:24,alignItems:'start'}}>

                {/* RANKING */}
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.68rem',fontWeight:900,color:LIGA_COLOR,letterSpacing:2}}>
                      RANKING — {LIGA_LABEL}
                    </div>
                    <span style={{fontSize:'0.5rem',background:'rgba(0,255,136,0.08)',border:'1px solid rgba(0,255,136,0.2)',borderRadius:6,padding:'2px 8px',color:LIGA_COLOR,fontFamily:"'Orbitron',sans-serif",fontWeight:700}}>EN VIVO</span>
                  </div>

                  {equipos.length===0 && (
                    <div style={{textAlign:'center',padding:'36px 20px',color:'#4a5568',background:'#0d1117',borderRadius:12,border:'1px solid #21262d'}}>
                      <div style={{fontSize:'2rem',marginBottom:10}}>🏆</div>
                      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.66rem',letterSpacing:2}}>INSCRIPCIONES ABIERTAS</div>
                      <div style={{fontSize:'0.74rem',marginTop:6}}>Se el primero en unirte.</div>
                      {uid && !miEquipo && (
                        <button onClick={() => setShowInscripcion(true)} style={{marginTop:14,...BTN_GREEN,fontSize:'0.66rem'}}>INSCRIBIRME</button>
                      )}
                    </div>
                  )}

                  {grupos.map(g => {
                    const lista = ranking.filter(e => e.grupo===g);
                    if (lista.length===0) return null;
                    return (
                      <div key={g} style={{marginBottom:20}}>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.58rem',color:'#4a5568',letterSpacing:2,marginBottom:8,borderLeft:`3px solid ${LIGA_COLOR}`,paddingLeft:8}}>GRUPO {g}</div>
                        <div style={{overflowX:'auto'}}>
                          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.72rem',minWidth:380}}>
                            <thead>
                              <tr style={{borderBottom:'1px solid #21262d'}}>
                                {['#','EQUIPO','PTS','PJ','PG','PE','PP','GF','GC','DIF',''].map(h => (
                                  <th key={h} style={{padding:'5px 4px',textAlign:h==='EQUIPO'?'left':'center',color:'#4a5568',fontFamily:"'Orbitron',sans-serif",fontSize:'0.5rem',letterSpacing:1,fontWeight:700,whiteSpace:'nowrap'}}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {lista.map((eq,i) => {
                                const pj=eq.pg+eq.pe+eq.pp;
                                const dif=eq.gf-eq.gc;
                                const isPase=i<2;
                                const esMio=miEquipo?.id===eq.id;
                                return (
                                  <tr key={eq.id} style={{borderBottom:'1px solid #161b22',background:esMio?'rgba(0,255,136,0.03)':i%2===0?'rgba(255,255,255,0.01)':'transparent'}}>
                                    <td style={{padding:'8px 4px',textAlign:'center',color:isPase?LIGA_COLOR:'#4a5568',fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.72rem'}}>{i+1}</td>
                                    <td style={{padding:'8px 4px'}}>
                                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                                        <div style={{width:24,height:24,borderRadius:'50%',background:'#21262d',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',border:'1px solid #30363d',flexShrink:0}}>
                                          {eq.logo_url?<img src={eq.logo_url} alt={eq.nombre} style={{width:'100%',height:'100%',objectFit:'cover'}} />:<span style={{fontSize:'0.7rem'}}>⚽</span>}
                                        </div>
                                        <div style={{minWidth:0}}>
                                          <div style={{color:'#e6edf3',fontWeight:700,fontSize:'0.72rem',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:90}}>{eq.nombre}</div>
                                          <div style={{color:'#4a5568',fontSize:'0.56rem',display:'flex',alignItems:'center',gap:4}}>
                                            <img src={flagUrl(eq.pais)} alt={eq.pais} style={{width:14,height:10}} />{eq.plataforma}
                                          </div>
                                        </div>
                                        {esMio && <span style={{fontSize:'0.46rem',background:'rgba(255,215,0,0.1)',border:'1px solid #ffd70040',color:'#ffd700',borderRadius:4,padding:'1px 5px',fontFamily:"'Orbitron',sans-serif"}}>TU</span>}
                                        {isPase && <span style={{fontSize:'0.46rem',background:'rgba(0,255,136,0.08)',border:'1px solid #00ff8830',color:LIGA_COLOR,borderRadius:4,padding:'1px 5px',fontFamily:"'Orbitron',sans-serif",whiteSpace:'nowrap'}}>PO</span>}
                                      </div>
                                    </td>
                                    <td style={{padding:'8px 4px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontWeight:900,color:'#ffd700',fontSize:'0.82rem'}}>{eq.pts}</td>
                                    <td style={{padding:'8px 4px',textAlign:'center',color:'#8b949e',fontSize:'0.7rem'}}>{pj}</td>
                                    <td style={{padding:'8px 4px',textAlign:'center',color:LIGA_COLOR,fontSize:'0.7rem'}}>{eq.pg}</td>
                                    <td style={{padding:'8px 4px',textAlign:'center',color:'#8b949e',fontSize:'0.7rem'}}>{eq.pe}</td>
                                    <td style={{padding:'8px 4px',textAlign:'center',color:'#ff4757',fontSize:'0.7rem'}}>{eq.pp}</td>
                                    <td style={{padding:'8px 4px',textAlign:'center',color:'#e6edf3',fontSize:'0.7rem'}}>{eq.gf}</td>
                                    <td style={{padding:'8px 4px',textAlign:'center',color:'#e6edf3',fontSize:'0.7rem'}}>{eq.gc}</td>
                                    <td style={{padding:'8px 4px',textAlign:'center',color:dif>0?LIGA_COLOR:dif<0?'#ff4757':'#8b949e',fontWeight:700,fontSize:'0.7rem'}}>{dif>0?`+${dif}`:dif}</td>
                                    <td style={{padding:'8px 4px'}}>
                                      {miEquipo && eq.id!==miEquipo.id && (
                                        <button
                                          onClick={() => enviarDesafio(eq)}
                                          disabled={desafiando===eq.uid || misDesafiosEnviados.some(d => d.para_uid===eq.uid)}
                                          style={{background:'rgba(163,113,247,0.1)',border:'1px solid rgba(163,113,247,0.3)',color:'#a371f7',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:'0.6rem',fontFamily:"'Orbitron',sans-serif",fontWeight:700,whiteSpace:'nowrap',opacity:misDesafiosEnviados.some(d=>d.para_uid===eq.uid)?0.5:1}}
                                        >
                                          {misDesafiosEnviados.some(d=>d.para_uid===eq.uid)?'ENVIADO':'DESAFIAR'}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  {/* FIXTURE */}
                  <div style={{marginTop:24}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.64rem',fontWeight:900,color:'#ffd700',letterSpacing:2,marginBottom:12}}>FIXTURE</div>
                    {miEquipo && (
                      <button onClick={() => {const p=misParaReportar[0];if(p){setShowReporte(p.id);}else{alert('No tenes partidos pendientes.');}}} style={{...BTN_GREEN,marginBottom:12,fontSize:'0.66rem',padding:'8px 14px'}}>
                        REPORTAR RESULTADO
                      </button>
                    )}
                    {(['GRUPO','PLAYOFF_IDA','PLAYOFF_VUELTA'] as const).map(ronda => {
                      const ps=partidos.filter(p => p.liga===LIGA_ID && p.ronda===ronda);
                      if (ps.length===0) return null;
                      const rLabel=ronda==='GRUPO'?'GRUPOS':ronda==='PLAYOFF_IDA'?'PLAYOFFS IDA':'PLAYOFFS VUELTA';
                      return (
                        <div key={ronda} style={{marginBottom:18}}>
                          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.58rem',fontWeight:900,color:'#ffd700',letterSpacing:2,marginBottom:8,borderLeft:'3px solid #ffd700',paddingLeft:8}}>{rLabel}</div>
                          {ps.map(p => {
                            const miLocal=miEquipo?.id===p.equipo_local_id;
                            const miVisit=miEquipo?.id===p.equipo_visit_id;
                            const esMio=miLocal||miVisit;
                            const paraVal=miEquipo&&((p.status==='REPORTE_LOCAL'&&miVisit)||(p.status==='REPORTE_VISIT'&&miLocal));
                            const rivalId=esMio?(miLocal?p.equipo_visit_id:p.equipo_local_id):null;
                            const rival=rivalId?equipos.find(e=>e.id===rivalId):null;
                            return (
                              <div key={p.id} style={{background:esMio?'rgba(0,255,136,0.025)':'#0d1117',border:`1px solid ${esMio?'rgba(0,255,136,0.15)':'#21262d'}`,borderRadius:10,padding:'10px 12px',marginBottom:6,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                                <TeamBadge nombre={p.local_nombre} logo={p.local_logo} />
                                <div style={{flex:1,textAlign:'center',minWidth:60}}>
                                  {p.status==='VALIDADO'
                                    ?<div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'1rem',fontWeight:900}}>{p.goles_local} <span style={{color:'#4a5568'}}>-</span> {p.goles_visit}</div>
                                    :<div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.52rem',color:statusColor(p.status),letterSpacing:1}}>{statusLabel(p.status)}</div>
                                  }
                                  {p.screenshot_url && <a href={p.screenshot_url} target="_blank" rel="noreferrer" style={{fontSize:'0.55rem',color:'#4a5568',display:'block',marginTop:2}}>foto</a>}
                                </div>
                                <TeamBadge nombre={p.visit_nombre} logo={p.visit_logo} reverse />
                                <div style={{display:'flex',gap:4,flexShrink:0}}>
                                  {paraVal && (
                                    <button onClick={() => validar(p.id)} disabled={validando===p.id} style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.58rem',fontWeight:900,background:'rgba(0,255,136,0.1)',border:'1px solid #00ff88',color:LIGA_COLOR,borderRadius:7,padding:'5px 9px',cursor:'pointer',whiteSpace:'nowrap'}}>
                                      {validando===p.id?'...':'VALIDAR'}
                                    </button>
                                  )}
                                  {esMio && p.status==='PENDIENTE' && (
                                    <button onClick={() => setShowReporte(p.id)} style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.58rem',fontWeight:900,background:'rgba(255,215,0,0.07)',border:'1px solid rgba(255,215,0,0.3)',color:'#ffd700',borderRadius:7,padding:'5px 9px',cursor:'pointer',whiteSpace:'nowrap'}}>
                                      REPORTAR
                                    </button>
                                  )}
                                  {esMio && rival?.whatsapp && (() => {
                                    const msg=encodeURIComponent(`Hola! Soy ${miEquipo?.nombre} — Liga LFA eFOOTBALL LATAM SUR. Coordinamos el partido?`);
                                    return <a href={`https://wa.me/${rival.whatsapp.replace(/\D/g,'')}?text=${msg}`} target="_blank" rel="noreferrer" style={{fontSize:'0.58rem',background:'rgba(37,211,102,0.07)',border:'1px solid rgba(37,211,102,0.22)',color:'#25d366',borderRadius:7,padding:'5px 9px',textDecoration:'none',fontFamily:"'Orbitron',sans-serif",fontWeight:700}}>WA</a>;
                                  })()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {partidos.filter(p=>p.liga===LIGA_ID).length===0 && equipos.length>0 && (
                      <div style={{textAlign:'center',padding:'24px 20px',color:'#4a5568',background:'#0d1117',borderRadius:10,border:'1px solid #21262d',fontSize:'0.72rem',fontFamily:"'Orbitron',sans-serif"}}>
                        SIN PARTIDOS AUN — SE GENERAN CUANDO EL GRUPO LLEGA A 4 EQUIPOS
                      </div>
                    )}
                  </div>
                </div>

                {/* HISTORIAL */}
                <div>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.64rem',fontWeight:900,color:'#009ee3',letterSpacing:2,marginBottom:14}}>
                    HISTORIAL DE PARTIDOS
                  </div>
                  {historial.length===0 ? (
                    <div style={{textAlign:'center',padding:'32px 20px',color:'#4a5568',background:'#0d1117',borderRadius:12,border:'1px solid #21262d'}}>
                      <div style={{fontSize:'2rem',marginBottom:8}}>🎬</div>
                      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.64rem',letterSpacing:2}}>SIN RESULTADOS AUN</div>
                      <div style={{fontSize:'0.7rem',marginTop:6}}>Aca apareceran todos los partidos jugados con sus fotos.</div>
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      {historial.slice(0,30).map(p => {
                        const golesL=p.goles_local??0;
                        const golesV=p.goles_visit??0;
                        const localWon=golesL>golesV;
                        const visitWon=golesV>golesL;
                        return (
                          <div key={p.id} style={{background:'#0d1117',border:'1px solid #21262d',borderRadius:12,overflow:'hidden'}}>
                            {p.screenshot_url && (
                              <a href={p.screenshot_url} target="_blank" rel="noreferrer" style={{display:'block'}}>
                                <img src={p.screenshot_url} alt="resultado" style={{width:'100%',height:110,objectFit:'cover',display:'block',filter:'brightness(0.8)'}} />
                              </a>
                            )}
                            <div style={{padding:'10px 12px',display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center',gap:8}}>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                {p.local_logo && <img src={p.local_logo} alt={p.local_nombre} style={{width:22,height:22,borderRadius:'50%',objectFit:'cover',border:'1px solid #30363d'}} />}
                                <span style={{fontSize:'0.72rem',fontWeight:700,color:localWon?LIGA_COLOR:'#8b949e'}}>{p.local_nombre}</span>
                              </div>
                              <div style={{textAlign:'center'}}>
                                <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'1.1rem',color:'white'}}>{golesL} <span style={{color:'#4a5568'}}>-</span> {golesV}</div>
                                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.5rem',color:'#4a5568',letterSpacing:1}}>FINAL</div>
                              </div>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}}>
                                <span style={{fontSize:'0.72rem',fontWeight:700,color:visitWon?LIGA_COLOR:'#8b949e',textAlign:'right'}}>{p.visit_nombre}</span>
                                {p.visit_logo && <img src={p.visit_logo} alt={p.visit_nombre} style={{width:22,height:22,borderRadius:'50%',objectFit:'cover',border:'1px solid #30363d'}} />}
                              </div>
                            </div>
                            <div style={{padding:'0 12px 8px',fontSize:'0.58rem',color:'#4a5568',fontFamily:"'Orbitron',sans-serif",letterSpacing:1}}>
                              GRUPO {p.grupo} · {p.ronda.replace(/_/g,' ')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: CHAT */}
          {tab==='chat' && (
            <div>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.62rem',color:'#4a5568',letterSpacing:2,marginBottom:14,textAlign:'center'}}>
                CHAT GENERAL — LIGA LFA eFOOTBALL
              </div>
              <div style={{background:'rgba(0,158,227,0.04)',border:'1px solid rgba(0,158,227,0.15)',borderRadius:10,padding:'8px 14px',marginBottom:14,fontSize:'0.7rem',color:'#8b949e'}}>
                Anti-spam activo · Max 1 mensaje cada 3 segundos · Respeta a todos los participantes.
              </div>
              <div style={{display:'flex',flexDirection:'column',height:460}}>
                <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
                  {chatMsgs.length===0 && (
                    <div style={{textAlign:'center',color:'#4a5568',fontSize:'0.76rem',marginTop:40}}>
                      Coordina partidos, habla con tu rival o saluda a la comunidad LFA
                    </div>
                  )}
                  {chatMsgs.map(m => (
                    <div key={m.id} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:'#21262d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.75rem',flexShrink:0,overflow:'hidden',border:'1px solid #30363d'}}>
                        {m.logo_url?<img src={m.logo_url} alt={m.nombre} style={{width:'100%',height:'100%',objectFit:'cover'}} />:'⚽'}
                      </div>
                      <div style={{background:'#161b22',borderRadius:'0 10px 10px 10px',padding:'7px 11px',maxWidth:'82%'}}>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.54rem',color:LIGA_COLOR,fontWeight:900,marginBottom:2}}>{m.nombre}</div>
                        <div style={{color:'#cdd9e5',fontSize:'0.82rem',lineHeight:1.5,wordBreak:'break-word'}}>{m.texto}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>
                {uid ? (
                  <div style={{display:'flex',gap:8}}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter' && !sendingChat && sendChat()} placeholder="Escribi... (Enter para enviar)" maxLength={280} style={{flex:1,background:'#161b22',border:'1px solid #30363d',borderRadius:10,padding:'10px 14px',color:'white',fontSize:'0.82rem',outline:'none'}} />
                    <button onClick={sendChat} disabled={sendingChat||!chatInput.trim()} style={{background:sendingChat?'#21262d':'#00a859',border:'none',color:'white',borderRadius:10,padding:'10px 16px',cursor:'pointer',fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.7rem',opacity:sendingChat?0.6:1}}>
                      {sendingChat?'...':'ENVIAR'}
                    </button>
                  </div>
                ) : (
                  <div style={{textAlign:'center',color:'#4a5568',fontSize:'0.78rem',padding:12}}>
                    <Link href="/auth" style={{color:LIGA_COLOR}}>Inicia sesion</Link> para chatear
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: DESAFIOS */}
          {tab==='desafios' && (
            <div>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.72rem',fontWeight:900,color:'#a371f7',letterSpacing:2,marginBottom:18}}>
                CENTRAL DE DESAFIOS
              </div>
              {!uid && (
                <div style={{textAlign:'center',padding:'36px 20px',color:'#4a5568'}}>
                  <Link href="/auth" style={{color:LIGA_COLOR}}>Inicia sesion</Link> para ver y enviar desafios.
                </div>
              )}
              {uid && !miEquipo && (
                <div style={{textAlign:'center',padding:'36px 20px',color:'#4a5568',background:'#0d1117',borderRadius:12,border:'1px solid #21262d'}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.66rem',letterSpacing:2}}>PRIMERO INSCRIBITE</div>
                  <div style={{fontSize:'0.74rem',marginTop:6}}>Para desafiar a otros equipos necesitas estar en la liga.</div>
                  <button onClick={() => setShowInscripcion(true)} style={{marginTop:14,...BTN_GREEN,fontSize:'0.66rem'}}>INSCRIBIRME</button>
                </div>
              )}
              {uid && miEquipo && (
                <div style={{display:'flex',flexDirection:'column',gap:24}}>
                  <div>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.62rem',fontWeight:900,color:'#ffd700',letterSpacing:2,marginBottom:12}}>
                      DESAFIOS RECIBIDOS {misDesafiosRecibidos.length>0 && <span style={{background:'#ff4757',color:'white',borderRadius:'50%',padding:'0 6px',fontSize:'0.58rem',marginLeft:6}}>{misDesafiosRecibidos.length}</span>}
                    </div>
                    {misDesafiosRecibidos.length===0 ? (
                      <div style={{color:'#4a5568',fontSize:'0.74rem',padding:'14px 0'}}>Sin desafios recibidos. Cuando alguien te desafie aparecera aqui.</div>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        {misDesafiosRecibidos.map(d => (
                          <div key={d.id} style={{background:'rgba(255,215,0,0.04)',border:'1px solid rgba(255,215,0,0.25)',borderRadius:12,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                            <div style={{width:40,height:40,borderRadius:'50%',background:'#21262d',overflow:'hidden',border:'2px solid #ffd70040',flexShrink:0}}>
                              {d.de_logo?<img src={d.de_logo} alt={d.de_nombre} style={{width:'100%',height:'100%',objectFit:'cover'}} />:<span style={{fontSize:'1.2rem',display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>⚽</span>}
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.72rem',fontWeight:900,color:'#ffd700'}}>{d.de_nombre}</div>
                              <div style={{fontSize:'0.68rem',color:'#8b949e',marginTop:2}}>te desafio a un partido en la Liga LFA eFOOTBALL</div>
                            </div>
                            <div style={{display:'flex',gap:8,flexShrink:0}}>
                              <button onClick={() => aceptarDesafio(d)} style={{background:'rgba(0,255,136,0.12)',border:'1px solid rgba(0,255,136,0.3)',color:LIGA_COLOR,borderRadius:8,padding:'7px 14px',cursor:'pointer',fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.62rem'}}>
                                ACEPTAR
                              </button>
                              <button onClick={() => rechazarDesafio(d.id)} style={{background:'rgba(255,71,87,0.07)',border:'1px solid rgba(255,71,87,0.2)',color:'#ff4757',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.62rem'}}>
                                RECHAZAR
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {misMatchsAbiertos.length>0 && (
                    <div>
                      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.62rem',fontWeight:900,color:LIGA_COLOR,letterSpacing:2,marginBottom:12}}>
                        MATCH CHATS ACTIVOS
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        {misMatchsAbiertos.map(d => {
                          const soyLocal=d.de_uid===uid;
                          const rival=soyLocal?d.para_nombre:d.de_nombre;
                          return (
                            <div key={d.id} style={{background:'rgba(0,255,136,0.04)',border:'1px solid rgba(0,255,136,0.2)',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                              <div>
                                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.68rem',color:LIGA_COLOR,fontWeight:900}}>vs {rival}</div>
                                <div style={{fontSize:'0.64rem',color:'#8b949e',marginTop:2}}>Desafio aceptado — Coordina el partido!</div>
                              </div>
                              <button onClick={() => {setMatchChatDesafio(d);setMatchChatOpen(true);}} style={{...BTN_GREEN,padding:'8px 16px',fontSize:'0.64rem'}}>
                                ABRIR MATCH CHAT
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {misDesafiosEnviados.length>0 && (
                    <div>
                      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.62rem',fontWeight:900,color:'#8b949e',letterSpacing:2,marginBottom:10}}>DESAFIOS ENVIADOS</div>
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {misDesafiosEnviados.map(d => (
                          <div key={d.id} style={{background:'#0d1117',border:'1px solid #21262d',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                            <div style={{fontSize:'0.72rem',color:'#8b949e'}}><strong style={{color:'white'}}>{d.para_nombre}</strong> — esperando respuesta...</div>
                            <span style={{fontSize:'0.6rem',background:'rgba(255,215,0,0.08)',border:'1px solid rgba(255,215,0,0.2)',color:'#ffd700',borderRadius:6,padding:'2px 8px',fontFamily:"'Orbitron',sans-serif"}}>PENDIENTE</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.62rem',fontWeight:900,color:'#a371f7',letterSpacing:2,marginBottom:12}}>
                      DESAFIAR A UN EQUIPO DEL RANKING
                    </div>
                    {equipos.filter(e => e.id!==miEquipo.id).length===0 ? (
                      <div style={{color:'#4a5568',fontSize:'0.74rem'}}>Sin otros equipos inscriptos todavia.</div>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:7}}>
                        {equipos.filter(e => e.id!==miEquipo.id).map(eq => {
                          const yaDesafiado=misDesafiosEnviados.some(d => d.para_uid===eq.uid);
                          return (
                            <div key={eq.id} style={{background:'#0d1117',border:'1px solid #21262d',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                              <div style={{width:34,height:34,borderRadius:'50%',background:'#21262d',overflow:'hidden',border:'1px solid #30363d',flexShrink:0}}>
                                {eq.logo_url?<img src={eq.logo_url} alt={eq.nombre} style={{width:'100%',height:'100%',objectFit:'cover'}} />:<span style={{fontSize:'1rem',display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>⚽</span>}
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:700,fontSize:'0.78rem',color:'#e6edf3'}}>{eq.nombre}</div>
                                <div style={{fontSize:'0.62rem',color:'#8b949e',display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                                  <img src={flagUrl(eq.pais)} alt={eq.pais} style={{width:14,height:10}} />
                                  {eq.capitan} · {eq.plataforma}
                                  <span style={{marginLeft:4,color:'#ffd700',fontFamily:"'Orbitron',sans-serif",fontSize:'0.58rem'}}>{eq.pts} pts</span>
                                </div>
                              </div>
                              <button
                                onClick={() => enviarDesafio(eq)}
                                disabled={yaDesafiado||desafiando===eq.uid}
                                style={{background:yaDesafiado?'#21262d':'rgba(163,113,247,0.12)',border:`1px solid ${yaDesafiado?'#30363d':'rgba(163,113,247,0.35)'}`,color:yaDesafiado?'#4a5568':'#a371f7',borderRadius:8,padding:'7px 14px',cursor:yaDesafiado?'not-allowed':'pointer',fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.62rem',whiteSpace:'nowrap'}}
                              >
                                {desafiando===eq.uid?'...':yaDesafiado?'ENVIADO':'DESAFIAR'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <SiteFooter t={t} />
      </div>

      {/* MODAL INSCRIPCION */}
      {showInscripcion && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={() => setShowInscripcion(false)}>
          <div style={{background:'#0d1117',border:'1px solid #30363d',borderRadius:16,padding:'24px 22px 20px',maxWidth:440,width:'100%',maxHeight:'92vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
            <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.88rem',fontWeight:900,color:LIGA_COLOR,marginBottom:4,letterSpacing:1}}>INSCRIPCION</div>
            <div style={{fontSize:'0.68rem',color:'#8b949e',marginBottom:18}}>Liga LFA eFOOTBALL · Crossplay · Dream Team · LATAM SUR · Gratis</div>

            <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.58rem',color:'#4a5568',letterSpacing:2,marginBottom:8}}>LOGO DEL EQUIPO (opcional · max 2MB)</div>
            <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
              <label htmlFor="logo-up" style={{cursor:'pointer'}}>
                <div style={{width:76,height:76,borderRadius:'50%',background:'#161b22',border:`2px dashed ${logoPreview?LIGA_COLOR:'#30363d'}`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                  {logoPreview?<img src={logoPreview} alt="logo" style={{width:'100%',height:'100%',objectFit:'cover'}} />:<div style={{textAlign:'center',color:'#4a5568'}}><div style={{fontSize:'1.4rem'}}>⚽</div><div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.44rem'}}>SUBIR</div></div>}
                </div>
              </label>
              <input id="logo-up" type="file" accept="image/jpeg,image/png,image/webp" style={{display:'none'}} onChange={handleLogoChange} />
            </div>

            <PLabel>NOMBRE DEL EQUIPO *</PLabel>
            <input value={form.nombre} onChange={e => setForm(f => ({...f,nombre:e.target.value}))} placeholder="Ej: Los Cracks FC" style={INP} />
            <PLabel>KONAMI ID (eFOOTBALL) *</PLabel>
            <input value={form.game_id} onChange={e => setForm(f => ({...f,game_id:e.target.value}))} placeholder="Tu Konami ID" style={INP} />
            <PLabel>PAIS *</PLabel>
            <select value={form.pais} onChange={e => setForm(f => ({...f,pais:e.target.value}))} style={{...INP,marginBottom:14}}>
              {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <PLabel>PLATAFORMA *</PLabel>
            <div style={{display:'flex',gap:6,marginBottom:14}}>
              {['PC','PS5','Xbox'].map(pl => (
                <button key={pl} onClick={() => setForm(f => ({...f,plataforma:pl}))} style={{flex:1,padding:'9px 0',borderRadius:8,cursor:'pointer',fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.64rem',background:form.plataforma===pl?'rgba(0,255,136,0.1)':'#161b22',border:`1px solid ${form.plataforma===pl?LIGA_COLOR:'#30363d'}`,color:form.plataforma===pl?LIGA_COLOR:'#8b949e'}}>
                  {pl}
                </button>
              ))}
            </div>
            <PLabel>WHATSAPP * (con codigo de pais, ej: +5491123456789)</PLabel>
            <input value={form.whatsapp} onChange={e => setForm(f => ({...f,whatsapp:e.target.value}))} placeholder="+54911..." style={INP} />

            {inscripcionMsg && (
              <div style={{fontSize:'0.75rem',color:inscripcionMsg.startsWith('Inscripcion')?LIGA_COLOR:'#ff4757',marginBottom:12,textAlign:'center',lineHeight:1.5}}>{inscripcionMsg}</div>
            )}
            <button onClick={inscribir} disabled={inscribiendo} style={{width:'100%',padding:'13px 0',...BTN_GREEN,fontSize:'0.82rem',opacity:inscribiendo?0.7:1}}>
              {inscribiendo?'PROCESANDO...':'CONFIRMAR INSCRIPCION'}
            </button>
            <button onClick={() => setShowInscripcion(false)} style={{width:'100%',padding:'9px 0',background:'transparent',color:'#4a5568',border:'none',cursor:'pointer',fontSize:'0.7rem',fontFamily:"'Orbitron',sans-serif",marginTop:6}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* MODAL REPORTAR */}
      {showReporte && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={() => {setShowReporte(null);setReporteMsg('');}}>
          <div style={{background:'#0d1117',border:'1px solid #30363d',borderRadius:16,padding:'24px',maxWidth:400,width:'100%'}} onClick={e => e.stopPropagation()}>
            <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.85rem',fontWeight:900,color:'#ffd700',marginBottom:18}}>REPORTAR RESULTADO</div>
            {(() => {
              const p=partidos.find(x => x.id===showReporte);
              if (!p) return null;
              return (
                <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:8,padding:'10px 12px',marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                  <TeamBadge nombre={p.local_nombre} logo={p.local_logo} />
                  <span style={{color:'#4a5568',fontFamily:"'Orbitron',sans-serif",fontSize:'0.8rem'}}>VS</span>
                  <TeamBadge nombre={p.visit_nombre} logo={p.visit_logo} reverse />
                </div>
              );
            })()}
            <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:8,alignItems:'center',marginBottom:14}}>
              <div><PLabel>GOLES LOCAL</PLabel><input type="number" value={gLocal} onChange={e => setGLocal(e.target.value)} placeholder="0" style={INP} /></div>
              <div style={{textAlign:'center',color:'#4a5568',fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'1.2rem',paddingTop:20}}>-</div>
              <div><PLabel>GOLES VISIT.</PLabel><input type="number" value={gVisit} onChange={e => setGVisit(e.target.value)} placeholder="0" style={INP} /></div>
            </div>
            <PLabel>CAPTURA DEL MARCADOR (recomendado)</PLabel>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setScreenshot(e.target.files?.[0]??null)} style={{width:'100%',padding:'6px 0',color:'#8b949e',fontSize:'0.74rem',marginBottom:14}} />
            {reporteMsg && <div style={{fontSize:'0.76rem',color:reporteMsg.startsWith('Reportado')?LIGA_COLOR:'#ff4757',marginBottom:12,textAlign:'center'}}>{reporteMsg}</div>}
            <button onClick={reportar} disabled={reportando} style={{width:'100%',padding:'13px 0',background:'linear-gradient(135deg,#ffd700,#f0a500)',color:'#0b0e14',border:'none',borderRadius:12,fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.82rem',cursor:'pointer',letterSpacing:1,opacity:reportando?0.7:1}}>
              {reportando?'ENVIANDO...':'ENVIAR RESULTADO'}
            </button>
            <button onClick={() => {setShowReporte(null);setReporteMsg('');}} style={{width:'100%',padding:'9px 0',background:'transparent',color:'#4a5568',border:'none',cursor:'pointer',fontSize:'0.7rem',fontFamily:"'Orbitron',sans-serif",marginTop:6}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* MATCH CHAT MODAL */}
      {matchChatOpen && matchChatDesafio && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={() => setMatchChatOpen(false)}>
          <div style={{background:'#0d1117',border:'1px solid rgba(0,255,136,0.25)',borderRadius:16,padding:'20px',maxWidth:460,width:'100%',height:'85vh',display:'flex',flexDirection:'column'}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexShrink:0}}>
              <div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.72rem',fontWeight:900,color:LIGA_COLOR}}>MATCH CHAT</div>
                <div style={{fontSize:'0.64rem',color:'#8b949e',marginTop:2}}>
                  {matchChatDesafio.de_nombre} <span style={{color:'#4a5568'}}>vs</span> {matchChatDesafio.para_nombre}
                </div>
              </div>
              <button onClick={() => setMatchChatOpen(false)} style={{background:'none',border:'none',color:'#8b949e',cursor:'pointer',fontSize:'1.1rem'}}>X</button>
            </div>
            <div style={{background:'rgba(0,158,227,0.05)',border:'1px solid rgba(0,158,227,0.15)',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:'0.68rem',color:'#8b949e',lineHeight:1.5,flexShrink:0}}>
              Coordina: quien crea la sala, contrasena, horario, etc. Despues el resultado se sube en REPORTAR RESULTADO.
            </div>
            <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:8,marginBottom:10}}>
              {matchChatMsgs.length===0 && (
                <div style={{textAlign:'center',color:'#4a5568',fontSize:'0.72rem',marginTop:30}}>
                  Empieza a coordinar con tu rival!<br/><br/>
                  Ejemplo:<br/>
                  "Yo creo la sala, contrasena: LFA2026"<br/>
                  "Ok, me uno en 5 minutos"
                </div>
              )}
              {matchChatMsgs.map(m => {
                const esMio=m.uid===uid;
                return (
                  <div key={m.id} style={{display:'flex',gap:8,alignItems:'flex-end',flexDirection:esMio?'row-reverse':'row'}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:'#21262d',overflow:'hidden',border:'1px solid #30363d',flexShrink:0}}>
                      {m.logo_url?<img src={m.logo_url} alt={m.nombre} style={{width:'100%',height:'100%',objectFit:'cover'}} />:<span style={{fontSize:'0.8rem',display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>⚽</span>}
                    </div>
                    <div style={{background:esMio?'rgba(0,255,136,0.1)':'#161b22',border:`1px solid ${esMio?'rgba(0,255,136,0.2)':'#30363d'}`,borderRadius:esMio?'10px 0 10px 10px':'0 10px 10px 10px',padding:'7px 11px',maxWidth:'75%'}}>
                      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.5rem',color:esMio?LIGA_COLOR:'#8b949e',fontWeight:900,marginBottom:3}}>{m.nombre}</div>
                      <div style={{color:'#cdd9e5',fontSize:'0.8rem',lineHeight:1.4,wordBreak:'break-word'}}>{m.texto}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={matchChatRef} />
            </div>
            <div style={{display:'flex',gap:8,flexShrink:0}}>
              <input value={matchChatInput} onChange={e => setMatchChatInput(e.target.value)} onKeyDown={e => e.key==='Enter' && !sendingMatch && sendMatchChat()} placeholder="Escribi un mensaje..." maxLength={280} style={{flex:1,background:'#161b22',border:'1px solid #30363d',borderRadius:10,padding:'10px 12px',color:'white',fontSize:'0.8rem',outline:'none'}} />
              <button onClick={sendMatchChat} disabled={sendingMatch||!matchChatInput.trim()} style={{background:LIGA_COLOR,border:'none',color:'#0b0e14',borderRadius:10,padding:'10px 14px',cursor:'pointer',fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.7rem'}}>
                {sendingMatch?'...':'ENVIAR'}
              </button>
            </div>
            <button
              onClick={() => {
                const p=misParaReportar[0];
                if (p) {setShowReporte(p.id);setMatchChatOpen(false);}
                else {alert('No encontre el partido pendiente. Buscalo en el fixture.');}
              }}
              style={{marginTop:10,width:'100%',padding:'10px 0',background:'rgba(255,215,0,0.08)',border:'1px solid rgba(255,215,0,0.25)',color:'#ffd700',borderRadius:10,cursor:'pointer',fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:'0.66rem',letterSpacing:1,flexShrink:0}}
            >
              YA JUGAMOS — REPORTAR RESULTADO
            </button>
          </div>
        </div>
      )}

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
        select option { background: #161b22; }
        @keyframes bell-ring {
          0%   { transform: rotate(0deg); }
          20%  { transform: rotate(15deg); }
          40%  { transform: rotate(-15deg); }
          60%  { transform: rotate(10deg); }
          80%  { transform: rotate(-10deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
    </>
  );
}

/* ── Helpers ─────────────────────────────────────────── */
function InfoBox({title,color,children}:{title:string;color:string;children:React.ReactNode}) {
  return (
    <div style={{background:'#0d1117',border:`1px solid ${color}20`,borderLeft:`3px solid ${color}`,borderRadius:12,padding:'18px 18px 14px'}}>
      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.66rem',fontWeight:900,color,letterSpacing:1,marginBottom:10}}>{title}</div>
      {children}
    </div>
  );
}
function PLabel({children}:{children:React.ReactNode}) {
  return <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'0.56rem',color:'#4a5568',letterSpacing:2,fontWeight:900,marginBottom:5}}>{children}</div>;
}
function TeamBadge({nombre,logo,reverse}:{nombre:string;logo?:string;reverse?:boolean}) {
  return (
    <div style={{display:'flex',flexDirection:reverse?'row-reverse':'row',alignItems:'center',gap:6,minWidth:60}}>
      <div style={{width:24,height:24,borderRadius:'50%',background:'#21262d',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',border:'1px solid #30363d',flexShrink:0}}>
        {logo?<img src={logo} alt={nombre} style={{width:'100%',height:'100%',objectFit:'cover'}} />:'⚽'}
      </div>
      <span style={{fontSize:'0.7rem',color:'#e6edf3',fontWeight:700,textAlign:reverse?'right':'left'}}>{nombre}</span>
    </div>
  );
}
function statusLabel(s:string) {
  if (s==='PENDIENTE') return 'POR JUGAR';
  if (s==='REPORTE_LOCAL'||s==='REPORTE_VISIT') return 'PEND. VALIDACION';
  if (s==='VALIDADO') return 'FINALIZADO';
  if (s==='DISPUTA') return 'EN DISPUTA';
  return s;
}
function statusColor(s:string) {
  if (s==='PENDIENTE') return '#4a5568';
  if (s==='REPORTE_LOCAL'||s==='REPORTE_VISIT') return '#ffd700';
  if (s==='VALIDADO') return '#00ff88';
  if (s==='DISPUTA') return '#ff4757';
  return '#8b949e';
}
