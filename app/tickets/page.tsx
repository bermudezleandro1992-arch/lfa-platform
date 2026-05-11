'use client';

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';
import { onAuthStateChanged }  from 'firebase/auth';
import {
  collection, addDoc, query, where,
  onSnapshot, serverTimestamp, doc, getDoc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link         from 'next/link';

const CATS = [
  { value: 'disputa',  label: 'Disputa de partido',   icon: '⚔️', color: '#ff6b6b' },
  { value: 'pago',     label: 'Problema de pago',      icon: '💳', color: '#ffd700' },
  { value: 'cuenta',   label: 'Cuenta / acceso',       icon: '👤', color: '#00c3ff' },
  { value: 'tecnico',  label: 'Problema técnico',      icon: '🔧', color: '#a78bfa' },
  { value: 'otro',     label: 'Consulta general',      icon: '💬', color: '#00ff88' },
];

const STATUS_CLR: Record<string,string> = { open:'#00c3ff', in_progress:'#ffd700', resolved:'#00ff88', closed:'#8b949e' };
const STATUS_LBL: Record<string,string> = { open:'Abierto', in_progress:'En proceso', resolved:'Resuelto', closed:'Cerrado' };

const FAQS = [
  { q:'¿Cómo reporto el resultado de un partido?',   a:'Desde tu sala activa, al finalizar el partido, hacé clic en "Reportar resultado" e ingresá el marcador.' },
  { q:'¿Cuánto tarda un retiro?',                     a:'Los retiros se procesan en 24–72hs hábiles. Recibirás notificación cuando se acredite.' },
  { q:'¿Qué pasa si el rival no se conecta?',         a:'Esperá 10 minutos desde la hora acordada. Si no aparece, usá el botón de Disputa en la sala.' },
  { q:'¿Cómo disputo un resultado incorrecto?',       a:'En tu sala activa hacé clic en "Disputar" y adjuntá una captura del resultado real.' },
  { q:'¿Puedo cancelar un torneo al que me uní?',     a:'Podés salir de torneos OPEN antes de que inicien. Torneos activos no permiten abandono.' },
  { q:'¿Cómo cargo saldo?',                           a:'Andá a Billetera → Recargar y seguí los pasos. Aceptamos Binance Pay y transferencias.' },
];

const inp: React.CSSProperties = { width:'100%', background:'#0d1117', border:'1px solid #30363d', color:'#e6edf3', borderRadius:10, padding:'11px 14px', fontSize:'0.88rem', outline:'none', boxSizing:'border-box' as const, fontFamily:'inherit', transition:'border-color 0.15s' };

export default function TicketsPage() {
  const router = useRouter();
  const [uid, setUid]         = useState('');
  const [ready, setReady]     = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [faqOpen, setFaqOpen]       = useState<number|null>(null);
  const [section, setSection]       = useState('tickets');
  const [cat, setCat]       = useState('disputa');
  const [subject, setSubject] = useState('');
  const [desc, setDesc]     = useState('');
  const [matchId, setMatchId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    return onAuthStateChanged(auth, async user => {
      if (!user) { router.replace('/auth'); return; }
      setUid(user.uid);
      setReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'tickets'), where('uid', '==', uid));
    return onSnapshot(q, snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      arr.sort((a: any, b: any) => (b.createdAt?.toDate?.().getTime() ?? 0) - (a.createdAt?.toDate?.().getTime() ?? 0));
      setTickets(arr);
    });
  }, [uid]);

  async function crearTicket() {
    setError('');
    if (!subject.trim()) { setError('El asunto es obligatorio.'); return; }
    if (!desc.trim())    { setError('La descripción es obligatoria.'); return; }
    setCreating(true);
    try {
      const snap = await getDoc(doc(db, 'usuarios', uid));
      const d = snap.data();
      const username = d?.nombre ?? d?.username ?? 'Jugador';
      await addDoc(collection(db, 'tickets'), {
        uid, username, category: cat,
        subject: subject.trim(), description: desc.trim(),
        matchId: matchId.trim() || null,
        status: 'open', priority: 'normal',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        unread_staff: true, unread_user: false,
      });
      setShowCreate(false);
      setSubject(''); setDesc(''); setMatchId(''); setCat('disputa');
      setSection('tickets');
    } catch (e) {
      console.error(e);
      setError('Error al crear el ticket. Revisá tu conexión e intentá de nuevo.');
    }
    setCreating(false);
  }

  if (!ready) return (
    <div style={{ minHeight:'100vh', background:'#0b0e14', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid #161b22', borderTop:'3px solid #00ff88', animation:'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const activeCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;

  return (
    <div style={{ minHeight:'100vh', background:'#0b0e14', color:'#e6edf3' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;} body{margin:0;}
        ::-webkit-scrollbar{width:5px;} ::-webkit-scrollbar-track{background:#0b0e14;} ::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px;}
        .inp-f:focus{border-color:#00ff88!important;}
        .trow{transition:0.15s;border-left:3px solid transparent;}
        .trow:hover{border-left-color:#00ff8880!important;transform:translateX(3px);}
        .faq-r{transition:0.1s;cursor:pointer;}
        .faq-r:hover{background:#161b22!important;}
        .tab-b{transition:0.15s;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
      `}</style>

      {/* Navbar */}
      <header style={{ background:'#0d1117', borderBottom:'1px solid #21262d', padding:'0 20px', height:52, display:'flex', alignItems:'center', gap:12, position:'sticky', top:0, zIndex:50 }}>
        <Link href="/dashboard" style={{ display:'flex', alignItems:'center', gap:6, color:'#8b949e', textDecoration:'none', fontSize:'0.72rem', fontWeight:700, letterSpacing:0.5, fontFamily:"'Orbitron',sans-serif" }}>
          ← DASHBOARD
        </Link>
        <div style={{ width:1, height:18, background:'#30363d' }} />
        <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'0.78rem', fontWeight:900, color:'#00ff88', letterSpacing:1 }}>🎫 SOPORTE</span>
        {activeCount > 0 && <span style={{ background:'#00ff8820', color:'#00ff88', borderRadius:20, padding:'2px 10px', fontSize:'0.65rem', fontWeight:700 }}>{activeCount} activo{activeCount>1?'s':''}</span>}
        <div style={{ flex:1 }} />
        <button onClick={() => setShowCreate(true)} style={{ background:'linear-gradient(135deg,#00ff88,#00c870)', border:'none', color:'#0b0e14', borderRadius:8, padding:'7px 16px', fontSize:'0.72rem', fontWeight:900, cursor:'pointer', fontFamily:"'Orbitron',sans-serif", letterSpacing:0.5 }}>
          + NUEVO TICKET
        </button>
      </header>

      {/* Hero */}
      <div style={{ background:'linear-gradient(180deg,#0d1117 0%,#0b0e14 100%)', borderBottom:'1px solid #21262d', padding:'32px 20px 26px', textAlign:'center' }}>
        <div style={{ fontSize:'2.6rem', marginBottom:10 }}>🎫</div>
        <h1 style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'clamp(1.1rem,3vw,1.4rem)', fontWeight:900, color:'#00ff88', margin:'0 0 8px', letterSpacing:1 }}>Centro de Soporte</h1>
        <p style={{ color:'#8b949e', fontSize:'0.83rem', margin:'0 auto', maxWidth:420, lineHeight:1.6 }}>
          Encontrá respuestas en el FAQ o abrí un ticket para hablar directamente con el staff de LFA.
        </p>
        <div style={{ display:'flex', justifyContent:'center', gap:28, marginTop:20 }}>
          {[
            { l:'Mis tickets',  v: tickets.length,                                            c:'#e6edf3' },
            { l:'En proceso',   v: tickets.filter(t=>t.status==='in_progress').length,         c:'#ffd700' },
            { l:'Resueltos',    v: tickets.filter(t=>t.status==='resolved').length,            c:'#00ff88' },
          ].map(s=>(
            <div key={s.l} style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'1.4rem', fontWeight:900, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:'0.62rem', color:'#8b949e', fontWeight:700, marginTop:1, letterSpacing:0.5 }}>{s.l.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:'#0d1117', borderBottom:'1px solid #21262d', display:'flex', padding:'0 20px' }}>
        {[['tickets','🎫 MIS TICKETS'],['faq','❓ FAQ']].map(([s,lbl])=>(
          <button key={s} className="tab-b" onClick={()=>setSection(s)} style={{ background:'none', border:'none', borderBottom:section===s?'2px solid #00ff88':'2px solid transparent', color:section===s?'#00ff88':'#8b949e', padding:'12px 18px', fontSize:'0.75rem', fontWeight:700, cursor:'pointer', fontFamily:"'Orbitron',sans-serif", letterSpacing:0.5 }}>
            {lbl}{s==='tickets'&&tickets.length>0?` (${tickets.length})`:''}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:800, margin:'0 auto', padding:'24px 16px', animation:'fadeIn 0.25s ease' }}>

        {/* Mis Tickets */}
        {section==='tickets' && (
          <div style={{ animation:'fadeIn 0.2s ease' }}>
            {tickets.length===0 ? (
              <div style={{ background:'#161b22', border:'1px dashed #30363d', borderRadius:16, padding:'52px 24px', textAlign:'center' }}>
                <div style={{ fontSize:'3rem', marginBottom:14 }}>📭</div>
                <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#e6edf3', fontSize:'0.9rem', margin:'0 0 8px' }}>Sin tickets todavía</h3>
                <p style={{ color:'#8b949e', fontSize:'0.82rem', margin:'0 0 22px', lineHeight:1.7 }}>¿Tenés un problema? Creá tu primer ticket<br/>y el staff te responde pronto.</p>
                <button onClick={()=>setShowCreate(true)} style={{ background:'linear-gradient(135deg,#00ff88,#00c870)', border:'none', color:'#0b0e14', borderRadius:10, padding:'11px 24px', fontSize:'0.8rem', fontWeight:900, cursor:'pointer', fontFamily:"'Orbitron',sans-serif" }}>+ CREAR TICKET</button>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {tickets.map(t=>{
                  const ci = CATS.find(c=>c.value===t.category);
                  const sc = STATUS_CLR[t.status]??'#8b949e';
                  return (
                    <Link key={t.id} href={`/tickets/${t.id}`} style={{ textDecoration:'none' }}>
                      <div className="trow" style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, cursor:'pointer', borderLeft:`3px solid ${sc}` }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                            {t.unread_user && <div style={{ width:7, height:7, borderRadius:'50%', background:'#00ff88', flexShrink:0 }} title="Nueva respuesta del staff"/>}
                            <span style={{ fontWeight:700, fontSize:'0.9rem', color:'#e6edf3', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.subject}</span>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            <span style={{ background:`${ci?.color??'#8b949e'}18`, color:ci?.color??'#8b949e', borderRadius:6, padding:'2px 8px', fontSize:'0.68rem', fontWeight:700 }}>{ci?.icon} {ci?.label??t.category}</span>
                            {t.createdAt && <span style={{ fontSize:'0.68rem', color:'#8b949e' }}>{t.createdAt.toDate().toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'})}</span>}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                          <span style={{ background:`${sc}18`, color:sc, borderRadius:20, padding:'4px 12px', fontSize:'0.7rem', fontWeight:700, whiteSpace:'nowrap' }}>{STATUS_LBL[t.status]??t.status}</span>
                          <span style={{ color:'#8b949e' }}>→</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* FAQ */}
        {section==='faq' && (
          <div style={{ animation:'fadeIn 0.2s ease' }}>
            <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:14, overflow:'hidden', marginBottom:20 }}>
              <div style={{ padding:'15px 20px', borderBottom:'1px solid #21262d', background:'#0d1117', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'0.8rem', fontWeight:900, color:'#ffd700' }}>❓ PREGUNTAS FRECUENTES</span>
              </div>
              {FAQS.map((f,i)=>(
                <div key={i} className="faq-r" style={{ borderBottom:i<FAQS.length-1?'1px solid #21262d':'none' }} onClick={()=>setFaqOpen(faqOpen===i?null:i)}>
                  <div style={{ padding:'15px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                    <span style={{ fontWeight:600, fontSize:'0.87rem', color:'#e6edf3', lineHeight:1.4 }}>{f.q}</span>
                    <span style={{ color:faqOpen===i?'#00ff88':'#8b949e', fontSize:'0.75rem', flexShrink:0, transition:'0.2s', display:'inline-block', transform:faqOpen===i?'rotate(180deg)':'none' }}>▼</span>
                  </div>
                  {faqOpen===i && (
                    <div style={{ padding:'0 20px 16px', animation:'fadeIn 0.15s ease' }}>
                      <p style={{ color:'#8b949e', fontSize:'0.82rem', margin:0, lineHeight:1.7, borderLeft:'3px solid #00ff88', paddingLeft:14 }}>{f.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ background:'linear-gradient(135deg,#0d1117,#161b22)', border:'1px solid #00ff8830', borderRadius:14, padding:'22px 24px', textAlign:'center' }}>
              <div style={{ fontSize:'1.4rem', marginBottom:8 }}>💬</div>
              <h3 style={{ fontFamily:"'Orbitron',sans-serif", color:'#00ff88', fontSize:'0.85rem', margin:'0 0 6px' }}>¿No encontraste respuesta?</h3>
              <p style={{ color:'#8b949e', fontSize:'0.8rem', margin:'0 0 16px' }}>El staff de LFA te responde en menos de 24hs.</p>
              <button onClick={()=>{ setSection('tickets'); setShowCreate(true); }} style={{ background:'linear-gradient(135deg,#00ff88,#00c870)', border:'none', color:'#0b0e14', borderRadius:10, padding:'10px 24px', fontSize:'0.8rem', fontWeight:900, cursor:'pointer', fontFamily:"'Orbitron',sans-serif" }}>ABRIR UN TICKET →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showCreate && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.87)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(6px)' }}
          onClick={e=>{ if(e.target===e.currentTarget) setShowCreate(false); }}>
          <div style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:18, width:'100%', maxWidth:500, maxHeight:'92vh', overflowY:'auto', animation:'slideUp 0.25s ease' }}>
            <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #21262d', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0d1117', borderRadius:'18px 18px 0 0' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:'1.2rem' }}>🎫</span>
                <div>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'0.88rem', fontWeight:900, color:'#00ff88' }}>Nuevo Ticket</div>
                  <div style={{ fontSize:'0.67rem', color:'#8b949e', marginTop:1 }}>El staff te responderá pronto</div>
                </div>
              </div>
              <button onClick={()=>setShowCreate(false)} style={{ background:'#21262d', border:'none', color:'#8b949e', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:'0.9rem', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ padding:'22px 24px 26px' }}>
              <div style={{ marginBottom:18 }}>
                <label style={{ display:'block', fontSize:'0.68rem', color:'#8b949e', fontWeight:700, letterSpacing:1, marginBottom:10 }}>CATEGORÍA</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {CATS.map(c=>(
                    <button key={c.value} onClick={()=>setCat(c.value)} style={{ background:cat===c.value?`${c.color}18`:'#0d1117', border:`1px solid ${cat===c.value?c.color:'#30363d'}`, color:cat===c.value?c.color:'#8b949e', borderRadius:10, padding:'10px 12px', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', textAlign:'left', transition:'0.15s' }}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:'0.68rem', color:'#8b949e', fontWeight:700, letterSpacing:1, marginBottom:7 }}>ASUNTO</label>
                <input className="inp-f" value={subject} onChange={e=>setSubject(e.target.value)} maxLength={100} placeholder="Resumen breve del problema" style={inp} />
                <div style={{ fontSize:'0.62rem', color:'#8b949e', textAlign:'right', marginTop:3 }}>{subject.length}/100</div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:'0.68rem', color:'#8b949e', fontWeight:700, letterSpacing:1, marginBottom:7 }}>DESCRIPCIÓN</label>
                <textarea className="inp-f" value={desc} onChange={e=>setDesc(e.target.value)} maxLength={600} rows={4} placeholder="Describí el problema en detalle. Mientras más info, más rápido te ayudamos." style={{ ...inp, resize:'vertical', minHeight:96 }} />
                <div style={{ fontSize:'0.62rem', color:'#8b949e', textAlign:'right', marginTop:3 }}>{desc.length}/600</div>
              </div>
              <div style={{ marginBottom:22 }}>
                <label style={{ display:'block', fontSize:'0.68rem', color:'#8b949e', fontWeight:700, letterSpacing:1, marginBottom:7 }}>ID DE SALA <span style={{ fontWeight:400 }}>(opcional)</span></label>
                <input className="inp-f" value={matchId} onChange={e=>setMatchId(e.target.value)} placeholder="Ej: abc123 — solo si aplica a un partido específico" style={inp} />
              </div>
              {error && (
                <div style={{ background:'#ff475720', border:'1px solid #ff4757', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:'0.8rem', color:'#ff8080' }}>⚠️ {error}</div>
              )}
              <button onClick={crearTicket} disabled={creating} style={{ width:'100%', background:creating?'#21262d':'linear-gradient(135deg,#00ff88,#00c870)', border:'none', color:creating?'#8b949e':'#0b0e14', borderRadius:12, padding:13, fontSize:'0.85rem', fontWeight:900, cursor:creating?'not-allowed':'pointer', fontFamily:"'Orbitron',sans-serif", letterSpacing:0.5, transition:'0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {creating ? <><span style={{ display:'inline-block', width:16, height:16, border:'2px solid #30363d', borderTop:'2px solid #8b949e', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/> ENVIANDO…</> : '⚡ ENVIAR TICKET'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
