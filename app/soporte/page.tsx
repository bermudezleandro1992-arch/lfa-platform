'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, onSnapshot, query, orderBy,
  doc, getDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const ROLES_STAFF = ['soporte', 'mod', 'moderador'];

const STATUS_CLR: Record<string, string> = {
  open: '#00c3ff', in_progress: '#ffd700', resolved: '#00ff88', closed: '#8b949e',
};
const STATUS_LBL: Record<string, string> = {
  open: 'Abierto', in_progress: 'En proceso', resolved: 'Resuelto', closed: 'Cerrado',
};
const CAT_ICON: Record<string, string> = {
  disputa: '⚖️', pago: '💰', cuenta: '👤', tecnico: '🔧', otro: '📋',
};

type FilterId = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';

export default function SoportePage() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [allowed, setAllowed]   = useState(false);
  const [tickets, setTickets]   = useState<any[]>([]);
  const [filter, setFilter]     = useState<FilterId>('open');
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* ── Auth guard ─────────────────────────────────────────── */
  useEffect(() => {
    return onAuthStateChanged(auth, async user => {
      if (!user) { router.replace('/auth'); return; }
      if (user.uid === CEO_UID) { setAllowed(true); setLoading(false); return; }
      const snap = await getDoc(doc(db, 'usuarios', user.uid));
      const rol = snap.data()?.rol ?? '';
      if (ROLES_STAFF.includes(rol)) { setAllowed(true); setLoading(false); return; }
      router.replace('/hub');
    });
  }, [router]);

  /* ── Tickets listener ───────────────────────────────────── */
  useEffect(() => {
    if (!allowed) return;
    const unsub = onSnapshot(
      query(collection(db, 'tickets'), orderBy('createdAt', 'desc')),
      snap => setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    );
    return unsub;
  }, [allowed]);

  /* ── Messages listener ──────────────────────────────────── */
  useEffect(() => {
    if (!selected) return;
    const unsub = onSnapshot(
      query(collection(db, 'tickets', selected.id, 'messages'), orderBy('createdAt', 'asc')),
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      },
    );
    return unsub;
  }, [selected?.id]);

  /* ── Cambiar estado ─────────────────────────────────────── */
  async function cambiarEstado(ticketId: string, newStatus: string) {
    await updateDoc(doc(db, 'tickets', ticketId), {
      status: newStatus, updatedAt: serverTimestamp(),
    });
    if (selected?.id === ticketId) setSelected((p: any) => p ? { ...p, status: newStatus } : null);
  }

  /* ── Enviar respuesta ───────────────────────────────────── */
  async function enviar() {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      const { addDoc } = await import('firebase/firestore');
      await addDoc(collection(db, 'tickets', selected.id, 'messages'), {
        text: reply.trim(), sender: 'staff',
        senderName: 'Staff LFA', createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'tickets', selected.id), {
        updatedAt: serverTimestamp(),
        status: selected.status === 'open' ? 'in_progress' : selected.status,
        unread_user: true, unread_staff: false,
      });
      setReply('');
    } finally { setSending(false); }
  }

  /* ── Filtrar y buscar ───────────────────────────────────── */
  const displayed = tickets.filter(t => {
    const matchFilter = filter === 'all' || t.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || t.subject?.toLowerCase().includes(q)
      || t.username?.toLowerCase().includes(q)
      || t.category?.toLowerCase().includes(q)
      || t.matchId?.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };

  /* ── Loading / Guard ────────────────────────────────────── */
  if (loading) return (
    <div style={{ background: '#0b0e14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
      <div style={{ width: 44, height: 44, border: '3px solid #00ff88', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.8rem' }}>VERIFICANDO ACCESO…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (!allowed) return null;

  /* ── UI ─────────────────────────────────────────────────── */
  return (
    <div style={{ background: '#0b0e14', minHeight: '100vh', fontFamily: "'Roboto',sans-serif", color: '#e6edf3' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Roboto:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0b0e14; } ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
        .stk-btn:hover { opacity: 0.85; }
        textarea { resize: none; }
      `}</style>

      {/* Header */}
      <header style={{ background: '#0d1117', borderBottom: '1px solid #30363d', padding: '0 20px', height: 54, display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 100 }}>
        <span style={{ fontSize: '1.3rem' }}>🎫</span>
        <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.9rem', fontWeight: 900, color: '#00ff88', letterSpacing: 1 }}>
          CENTRO DE SOPORTE <span style={{ color: '#8b949e', fontSize: '0.7rem', fontWeight: 400 }}>— Staff</span>
        </span>
        <div style={{ flex: 1 }} />
        <a href="/ceo" style={{ color: '#ffd700', textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', padding: '6px 14px', border: '1px solid #ffd70040', borderRadius: 6 }}>⬡ CEO</a>
        <a href="/hub" style={{ color: '#8b949e', textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', padding: '6px 14px', border: '1px solid #30363d', borderRadius: 6 }}>↩ HUB</a>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '380px 1fr' : '1fr', gap: 0, height: 'calc(100vh - 54px)' }}>

        {/* ── PANEL IZQUIERDO: lista de tickets ── */}
        <div style={{ borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: '#30363d' }}>
            {([['open', 'ABIERTOS', counts.open, '#00c3ff'], ['in_progress', 'PROCESO', counts.in_progress, '#ffd700'], ['resolved', 'RESUELTOS', counts.resolved, '#00ff88'], ['closed', 'CERRADOS', counts.closed, '#8b949e']] as const).map(([id, lbl, cnt, clr]) => (
              <button key={id} onClick={() => setFilter(id)}
                style={{ background: filter === id ? `${clr}18` : '#0d1117', border: 'none', padding: '10px 4px', cursor: 'pointer', textAlign: 'center', borderBottom: filter === id ? `2px solid ${clr}` : '2px solid transparent' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: clr, fontFamily: "'Orbitron',sans-serif" }}>{cnt}</div>
                <div style={{ fontSize: '0.58rem', color: '#8b949e', marginTop: 1 }}>{lbl}</div>
              </button>
            ))}
          </div>

          {/* Búsqueda + filtro all */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #30363d', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar por usuario, asunto, sala…"
              style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '7px 10px', color: '#e6edf3', fontSize: '0.78rem', outline: 'none' }} />
            <button onClick={() => setFilter('all')}
              style={{ background: filter === 'all' ? '#ffffff15' : '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '7px 10px', color: '#8b949e', fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Todos ({counts.all})
            </button>
          </div>

          {/* Lista */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {displayed.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#8b949e', fontSize: '0.8rem' }}>Sin tickets en esta categoría ✓</div>
            ) : displayed.map(t => (
              <div key={t.id} onClick={() => setSelected(t)}
                style={{ padding: '12px 14px', borderBottom: '1px solid #161b22', cursor: 'pointer', background: selected?.id === t.id ? '#161b22' : 'transparent', borderLeft: selected?.id === t.id ? '3px solid #00ff88' : '3px solid transparent', transition: '0.1s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span>{CAT_ICON[t.category] ?? '📋'}</span>
                      <span style={{ fontSize: '0.83rem', fontWeight: 700, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#8b949e' }}>
                      <span style={{ color: '#00c3ff' }}>{t.username}</span>
                      {t.matchId && <span style={{ color: '#ffd700', marginLeft: 6 }}>#{t.matchId.slice(-8)}</span>}
                      {t.createdAt && <span style={{ marginLeft: 6 }}>{t.createdAt.toDate().toLocaleDateString('es-AR')}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {t.unread_staff && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff4757' }} />}
                    <span style={{ background: `${STATUS_CLR[t.status] ?? '#8b949e'}22`, color: STATUS_CLR[t.status] ?? '#8b949e', borderRadius: 20, padding: '2px 8px', fontSize: '0.62rem', fontWeight: 700 }}>
                      {STATUS_LBL[t.status] ?? t.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── PANEL DERECHO: detalle del ticket ── */}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Ticket header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #30363d', background: '#0d1117', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: '1.2rem' }}>{CAT_ICON[selected.category] ?? '📋'}</span>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: '#e6edf3' }}>{selected.subject}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#8b949e', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>Usuario: <span style={{ color: '#00c3ff' }}>{selected.username}</span></span>
                  <span>Categoría: <span style={{ color: '#e6edf3' }}>{selected.category}</span></span>
                  {selected.matchId && <span>Sala: <span style={{ color: '#ffd700' }}>#{selected.matchId.slice(-8)}</span></span>}
                  {selected.createdAt && <span>{selected.createdAt.toDate().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                </div>
                {selected.description && (
                  <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#8b949e', background: '#161b22', borderRadius: 6, padding: '8px 12px', borderLeft: '3px solid #30363d' }}>
                    {selected.description}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flex: 'column', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: '1px solid #30363d', borderRadius: 6, padding: '6px 10px', color: '#8b949e', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
              </div>
            </div>

            {/* Cambiar estado */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #30363d', background: '#0b0e14', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: '#8b949e', fontFamily: "'Orbitron',sans-serif" }}>ESTADO:</span>
              {(['open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
                <button key={s} className="stk-btn" onClick={() => cambiarEstado(selected.id, s)}
                  style={{ background: selected.status === s ? `${STATUS_CLR[s]}22` : '#161b22', border: `1px solid ${selected.status === s ? STATUS_CLR[s] : '#30363d'}`, color: selected.status === s ? STATUS_CLR[s] : '#8b949e', borderRadius: 20, padding: '4px 12px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
                  {STATUS_LBL[s]}
                </button>
              ))}
              <a href={`/tickets/${selected.id}`} target="_blank" rel="noreferrer"
                style={{ marginLeft: 'auto', color: '#8b949e', textDecoration: 'none', fontSize: '0.72rem', border: '1px solid #30363d', borderRadius: 6, padding: '4px 10px' }}>
                🔗 Ver completo
              </a>
            </div>

            {/* Mensajes */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#8b949e', fontSize: '0.8rem', marginTop: 40 }}>Sin mensajes aún. Sé el primero en responder.</div>
              )}
              {messages.map(m => {
                const isStaff = m.sender === 'staff' || m.sender === 'system';
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isStaff ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '75%', background: isStaff ? '#1a3a2a' : '#161b22', border: `1px solid ${isStaff ? '#00ff8830' : '#30363d'}`, borderRadius: 10, padding: '8px 12px' }}>
                      <div style={{ fontSize: '0.68rem', color: isStaff ? '#00ff88' : '#00c3ff', fontWeight: 700, marginBottom: 4 }}>
                        {m.senderName ?? (isStaff ? 'Staff LFA' : 'Usuario')}
                      </div>
                      {m.imageUrl && <img src={m.imageUrl} alt="img" style={{ maxWidth: 200, borderRadius: 6, marginBottom: 6 }} />}
                      <div style={{ fontSize: '0.82rem', lineHeight: 1.5, color: '#e6edf3', whiteSpace: 'pre-wrap' }}>{m.text}</div>
                      {m.createdAt && (
                        <div style={{ fontSize: '0.62rem', color: '#8b949e', marginTop: 4, textAlign: 'right' }}>
                          {m.createdAt.toDate().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input de respuesta */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #30363d', background: '#0d1117', display: 'flex', gap: 10 }}>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                placeholder="Responder al usuario… (Enter para enviar)"
                rows={2}
                style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '8px 12px', color: '#e6edf3', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit' }}
              />
              <button onClick={enviar} disabled={sending || !reply.trim()}
                style={{ background: reply.trim() ? '#00ff88' : '#30363d', color: '#0b0e14', border: 'none', borderRadius: 8, padding: '0 18px', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: '0.72rem', cursor: reply.trim() ? 'pointer' : 'not-allowed', transition: '0.2s', minWidth: 80 }}>
                {sending ? '…' : 'ENVIAR'}
              </button>
            </div>
          </div>
        )}

        {/* Placeholder cuando no hay ticket seleccionado */}
        {!selected && (
          <div style={{ display: 'none' }} />
        )}
      </div>
    </div>
  );
}
