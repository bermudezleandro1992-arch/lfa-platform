'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, query, where, orderBy,
  onSnapshot, serverTimestamp, doc, getDoc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

const CATS = [
  { value: 'disputa',     label: '⚔️ Disputa de partido' },
  { value: 'pago',        label: '💳 Problema de pago' },
  { value: 'cuenta',      label: '👤 Cuenta / acceso' },
  { value: 'tecnico',     label: '🔧 Problema técnico' },
  { value: 'otro',        label: '💬 Consulta general' },
];

const FAQS = [
  { q: '¿Cómo reporto el resultado de un partido?', a: 'Desde tu sala activa, al finalizar el partido, hacé clic en "Reportar resultado" e ingresá el marcador.' },
  { q: '¿Cuánto tarda un retiro?', a: 'Los retiros se procesan en 24–72hs hábiles. Recibirás notificación cuando se acredite.' },
  { q: '¿Qué pasa si el rival no se conecta?', a: 'Esperá 10 minutos desde la hora acordada. Si no aparece, usá el botón de Disputa en la sala.' },
  { q: '¿Cómo disputo un resultado incorrecto?', a: 'En tu sala activa hacé clic en "Disputar" y adjuntá una captura del resultado real.' },
  { q: '¿Puedo cancelar un torneo al que me uní?', a: 'Podés salir de torneos OPEN antes de que inicien. Torneos activos no permiten abandono.' },
  { q: '¿Cómo cargo saldo?', a: 'Andá a Billetera → Recargar y seguí los pasos. Aceptamos Binance Pay y transferencias.' },
];

const STATUS_CLR: Record<string, string> = {
  open:        '#00c3ff',
  in_progress: '#ffd700',
  resolved:    '#00ff88',
  closed:      '#8b949e',
};
const STATUS_LBL: Record<string, string> = {
  open:        'Abierto',
  in_progress: 'En proceso',
  resolved:    'Resuelto',
  closed:      'Cerrado',
};

interface Ticket {
  id: string;
  category: string;
  subject: string;
  status: string;
  createdAt: { toDate: () => Date } | null;
  unread?: boolean;
}

export default function TicketsPage() {
  const router = useRouter();
  const [uid, setUid]       = useState('');
  const [ready, setReady]   = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showFaq, setShowFaq]       = useState(false);
  const [faqOpen, setFaqOpen]       = useState<number | null>(null);

  // Form
  const [cat, setCat]       = useState('disputa');
  const [subject, setSubject] = useState('');
  const [desc, setDesc]     = useState('');
  const [matchId, setMatchId] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }
      setUid(user.uid);
      setReady(true);
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'tickets'),
      where('uid', '==', uid),
    );
    const unsub = onSnapshot(q, snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() } as Ticket));
      arr.sort((a, b) => {
        const ta = a.createdAt?.toDate().getTime() ?? 0;
        const tb = b.createdAt?.toDate().getTime() ?? 0;
        return tb - ta;
      });
      setTickets(arr);
    });
    return unsub;
  }, [uid]);

  async function crearTicket() {
    if (!subject.trim() || !desc.trim()) return;
    setCreating(true);
    try {
      const userSnap = await getDoc(doc(db, 'usuarios', uid));
      const username = userSnap.data()?.username ?? userSnap.data()?.nombre ?? 'Jugador';
      await addDoc(collection(db, 'tickets'), {
        uid,
        username,
        category: cat,
        subject: subject.trim(),
        description: desc.trim(),
        matchId: matchId.trim() || null,
        status: 'open',
        priority: 'normal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unread_staff: true,
        unread_user: false,
      });
      setShowCreate(false);
      setSubject(''); setDesc(''); setMatchId(''); setCat('disputa');
    } catch (e) { console.error(e); }
    setCreating(false);
  }

  if (!ready) return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid #1c2028', borderTop: '2px solid #00ff88', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }}>
      {/* Nav */}
      <div style={{ background: 'rgba(11,14,20,0.97)', borderBottom: '1px solid #1c2028', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, height: 48, position: 'sticky', top: 0, zIndex: 30 }}>
        <Link href="/dashboard" style={{ color: '#8b949e', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700 }}>← DASHBOARD</Link>
        <span style={{ color: '#30363d' }}>|</span>
        <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900, color: '#00ff88' }}>🎫 SOPORTE</span>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.2rem', fontWeight: 900, color: '#00ff88', margin: 0 }}>Centro de Soporte</h1>
            <p style={{ color: '#8b949e', fontSize: '0.8rem', margin: '4px 0 0' }}>Consultá FAQ o creá un ticket para hablar con el staff</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowFaq(!showFaq)}
              style={{ background: '#161b22', border: '1px solid #30363d', color: '#8b949e', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 700 }}>
              ❓ FAQ
            </button>
            <button onClick={() => setShowCreate(true)}
              style={{ background: '#00ff88', border: 'none', color: '#0b0e14', borderRadius: 8, padding: '8px 16px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 900, fontFamily: "'Orbitron',sans-serif" }}>
              + NUEVO TICKET
            </button>
          </div>
        </div>

        {/* FAQ */}
        {showFaq && (
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.85rem', fontWeight: 900, color: '#ffd700', margin: '0 0 16px' }}>❓ Preguntas frecuentes</h2>
            {FAQS.map((f, i) => (
              <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? '1px solid #21262d' : 'none', paddingBottom: 12, marginBottom: 12 }}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  style={{ background: 'none', border: 'none', color: '#e6edf3', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left', width: '100%', padding: 0, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{f.q}</span>
                  <span style={{ color: '#8b949e', flexShrink: 0 }}>{faqOpen === i ? '▲' : '▼'}</span>
                </button>
                {faqOpen === i && (
                  <p style={{ color: '#8b949e', fontSize: '0.82rem', margin: '8px 0 0', lineHeight: 1.6 }}>{f.a}</p>
                )}
              </div>
            ))}
            <p style={{ color: '#8b949e', fontSize: '0.75rem', margin: '12px 0 0', textAlign: 'center' }}>
              ¿No encontraste respuesta? <button onClick={() => { setShowFaq(false); setShowCreate(true); }} style={{ background: 'none', border: 'none', color: '#00ff88', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>Creá un ticket →</button>
            </p>
          </div>
        )}

        {/* Lista tickets */}
        {tickets.length === 0 ? (
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎫</div>
            <p style={{ color: '#8b949e', fontSize: '0.88rem', margin: 0 }}>No tenés tickets abiertos.<br />Si necesitás ayuda, creá uno.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tickets.map(t => (
              <Link key={t.id} href={`/tickets/${t.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer', transition: '0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#00ff8840'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#30363d'}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</div>
                    <div style={{ fontSize: '0.72rem', color: '#8b949e', marginTop: 3 }}>
                      {CATS.find(c => c.value === t.category)?.label ?? t.category}
                      {t.createdAt && <span style={{ marginLeft: 8 }}>{t.createdAt.toDate().toLocaleDateString('es-AR')}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {t.unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88' }} />}
                    <span style={{ background: `${STATUS_CLR[t.status] ?? '#8b949e'}22`, color: STATUS_CLR[t.status] ?? '#8b949e', borderRadius: 20, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700 }}>
                      {STATUS_LBL[t.status] ?? t.status}
                    </span>
                    <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear ticket */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.9rem', fontWeight: 900, color: '#00ff88', margin: 0 }}>🎫 Nuevo Ticket</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', fontWeight: 700, marginBottom: 6 }}>CATEGORÍA</label>
            <select value={cat} onChange={e => setCat(e.target.value)}
              style={{ width: '100%', background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem', marginBottom: 14 }}>
              {CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', fontWeight: 700, marginBottom: 6 }}>ASUNTO</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={100} placeholder="Ej: Resultado mal cargado en partido #ABC"
              style={{ width: '100%', background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem', marginBottom: 14, boxSizing: 'border-box' }} />

            <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', fontWeight: 700, marginBottom: 6 }}>DESCRIPCIÓN</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} maxLength={500} rows={4} placeholder="Describí el problema con el mayor detalle posible..."
              style={{ width: '100%', background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem', marginBottom: 14, boxSizing: 'border-box', resize: 'vertical' }} />

            <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', fontWeight: 700, marginBottom: 6 }}>ID DE SALA (opcional)</label>
            <input value={matchId} onChange={e => setMatchId(e.target.value)} placeholder="Ej: abc123"
              style={{ width: '100%', background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem', marginBottom: 20, boxSizing: 'border-box' }} />

            <button onClick={crearTicket} disabled={creating || !subject.trim() || !desc.trim()}
              style={{ width: '100%', background: creating ? '#1c2028' : '#00ff88', border: 'none', color: '#0b0e14', borderRadius: 8, padding: '12px', fontSize: '0.85rem', fontWeight: 900, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: "'Orbitron',sans-serif" }}>
              {creating ? 'ENVIANDO...' : '⚡ ENVIAR TICKET'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
