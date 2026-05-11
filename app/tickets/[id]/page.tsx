'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc, getDoc, onSnapshot, collection, addDoc,
  serverTimestamp, updateDoc, query, orderBy,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import Link from 'next/link';

const STATUS_CLR: Record<string, string> = { open: '#00c3ff', in_progress: '#ffd700', resolved: '#00ff88', closed: '#8b949e' };
const STATUS_LBL: Record<string, string> = { open: 'Abierto', in_progress: 'En proceso', resolved: 'Resuelto', closed: 'Cerrado' };
const CEO_UID = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';

interface Ticket {
  uid: string; username: string; category: string; subject: string;
  description: string; status: string; priority: string;
  matchId?: string; createdAt: { toDate: () => Date } | null;
}
interface Msg { id: string; uid: string; username: string; text?: string; image_url?: string; video_url?: string; senderName?: string; isStaff: boolean; createdAt: { toDate: () => Date } | null; }

export default function TicketDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [myUid, setMyUid]     = useState('');
  const [myRol, setMyRol]     = useState('');
  const [ticket, setTicket]   = useState<Ticket | null>(null);
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [text, setText]       = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const isStaff = myUid === CEO_UID || myRol === 'soporte' || myRol === 'mod';
  const canAccess = ticket && (myUid === ticket.uid || isStaff);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }
      setMyUid(user.uid);
      const snap = await getDoc(doc(db, 'usuarios', user.uid));
      if (snap.exists()) setMyRol(snap.data().rol ?? '');
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'tickets', id), snap => {
      if (snap.exists()) setTicket(snap.data() as Ticket);
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'tickets', id, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Msg)));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return unsub;
  }, [id]);

  async function sendMsg() {
    if (!text.trim() || !myUid) return;
    setSending(true);
    try {
      const snap = await getDoc(doc(db, 'usuarios', myUid));
      const username = snap.data()?.username ?? snap.data()?.nombre ?? 'Jugador';
      await addDoc(collection(db, 'tickets', id, 'messages'), {
        uid: myUid, username, text: text.trim(), isStaff,
        createdAt: serverTimestamp(),
      });
      if (isStaff) {
        await updateDoc(doc(db, 'tickets', id), {
          updatedAt: serverTimestamp(), unread_user: true, unread_staff: false,
          ...(ticket?.status === 'open' ? { status: 'in_progress' } : {}),
        });
      } else {
        await updateDoc(doc(db, 'tickets', id), {
          updatedAt: serverTimestamp(), unread_user: false, unread_staff: true,
        });
      }
      setText('');
    } catch (err) { console.error(err); }
    setSending(false);
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !myUid) return;
    setUploading(true);
    try {
      const snap = await getDoc(doc(db, 'usuarios', myUid));
      const username = snap.data()?.username ?? snap.data()?.nombre ?? 'Jugador';
      const storageRef = ref(storage, `tickets/${id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const isVideo = file.type.startsWith('video/');
      await addDoc(collection(db, 'tickets', id, 'messages'), {
        uid: myUid, username,
        ...(isVideo ? { video_url: url } : { image_url: url }),
        isStaff, createdAt: serverTimestamp(),
      });
      if (isStaff) {
        await updateDoc(doc(db, 'tickets', id), { updatedAt: serverTimestamp(), unread_user: true, unread_staff: false });
      } else {
        await updateDoc(doc(db, 'tickets', id), { updatedAt: serverTimestamp(), unread_user: false, unread_staff: true });
      }
    } catch (err) { console.error(err); }
    setUploading(false);
    e.target.value = '';
  }

  async function changeStatus(status: string) {
    await updateDoc(doc(db, 'tickets', id), { status, updatedAt: serverTimestamp() });
    await addDoc(collection(db, 'tickets', id, 'messages'), {
      uid: 'system', username: 'Sistema', text: `⚡ Estado actualizado a: ${STATUS_LBL[status]}`, isStaff: true,
      createdAt: serverTimestamp(),
    });
  }

  if (!ticket) return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid #1c2028', borderTop: '2px solid #00ff88', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (myUid && !canAccess) return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e6edf3' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔒</div>
        <p>No tenés acceso a este ticket.</p>
        <Link href="/tickets" style={{ color: '#00ff88' }}>← Volver</Link>
      </div>
    </div>
  );

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved';

  return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <div style={{ background: 'rgba(11,14,20,0.97)', borderBottom: '1px solid #1c2028', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, height: 48, position: 'sticky', top: 0, zIndex: 30, flexShrink: 0 }}>
        <Link href={isStaff ? '/ceo?tab=soporte' : '/tickets'} style={{ color: '#8b949e', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700 }}>← TICKETS</Link>
        <span style={{ color: '#30363d' }}>|</span>
        <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 700, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject}</span>
        <span style={{ background: `${STATUS_CLR[ticket.status] ?? '#8b949e'}22`, color: STATUS_CLR[ticket.status] ?? '#8b949e', borderRadius: 20, padding: '3px 10px', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>
          {STATUS_LBL[ticket.status] ?? ticket.status}
        </span>
      </div>

      {/* Info ticket */}
      <div style={{ background: '#161b22', borderBottom: '1px solid #21262d', padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>
              <span style={{ fontWeight: 700, color: '#e6edf3' }}>{ticket.username}</span>
              {' · '}{ticket.category}
              {ticket.matchId && <span style={{ marginLeft: 8, color: '#00c3ff' }}>Sala: #{ticket.matchId.slice(-8)}</span>}
              {ticket.createdAt && <span style={{ marginLeft: 8 }}>{ticket.createdAt.toDate().toLocaleDateString('es-AR')}</span>}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#c9d1d9', marginTop: 6 }}>{ticket.description}</div>
          </div>

          {/* Controles staff */}
          {isStaff && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
              {(['open','in_progress','resolved','closed'] as const).map(s => (
                <button key={s} onClick={() => changeStatus(s)} disabled={ticket.status === s}
                  style={{ background: ticket.status === s ? `${STATUS_CLR[s]}22` : '#0d1117', border: `1px solid ${ticket.status === s ? STATUS_CLR[s] : '#30363d'}`, color: ticket.status === s ? STATUS_CLR[s] : '#8b949e', borderRadius: 6, padding: '4px 10px', fontSize: '0.68rem', fontWeight: 700, cursor: ticket.status === s ? 'default' : 'pointer' }}>
                  {STATUS_LBL[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', maxWidth: 720, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ color: '#8b949e', fontSize: '0.82rem', marginBottom: 16 }}>El ticket está abierto. El staff responderá pronto.</div>
            <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '14px 18px', display: 'inline-block', textAlign: 'left', maxWidth: 340 }}>
              <div style={{ fontSize: '0.72rem', color: '#ffd700', fontWeight: 700, marginBottom: 4 }}>🕐 HORARIO DE ATENCIÓN</div>
              <div style={{ fontSize: '0.78rem', color: '#8b949e', lineHeight: 1.6 }}>12:00 a 00:00hs — Dejanos tu consulta y te responderemos apenas estemos online.</div>
            </div>
          </div>
        )}
        {msgs.map(m => {
          const isMine = m.uid === myUid;
          const isSystem = m.uid === 'system';
          if (isSystem) return (
            <div key={m.id} style={{ textAlign: 'center', margin: '12px 0' }}>
              <span style={{ background: '#21262d', color: '#8b949e', borderRadius: 20, padding: '4px 14px', fontSize: '0.72rem' }}>{m.text}</span>
            </div>
          );
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
              <div style={{ maxWidth: '75%' }}>
                <div style={{ fontSize: '0.68rem', color: '#8b949e', marginBottom: 3, textAlign: isMine ? 'right' : 'left' }}>
                  {m.isStaff
                    ? <span style={{ color: '#ffd700', fontWeight: 700 }}>{m.username ?? m.senderName ?? '★ Moderador SomosLFA'}</span>
                    : m.username}
                </div>
                <div style={{ background: isMine ? '#00ff8822' : '#161b22', border: `1px solid ${isMine ? '#00ff8840' : '#30363d'}`, borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '10px 14px' }}>
                  {m.text && <div style={{ fontSize: '0.88rem', color: '#e6edf3', lineHeight: 1.5 }}>{m.text}</div>}
                  {m.image_url && (
                    <a href={m.image_url} target="_blank" rel="noreferrer">
                      <img src={m.image_url} alt="img" style={{ maxWidth: 220, maxHeight: 200, borderRadius: 8, display: 'block', cursor: 'pointer', marginTop: m.text ? 8 : 0 }} />
                    </a>
                  )}
                  {m.video_url && (
                    <video src={m.video_url} controls style={{ maxWidth: 260, borderRadius: 8, display: 'block', marginTop: m.text ? 8 : 0 }} />
                  )}
                </div>
                {m.createdAt && <div style={{ fontSize: '0.65rem', color: '#6e7681', marginTop: 2, textAlign: isMine ? 'right' : 'left' }}>{m.createdAt.toDate().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid #21262d', background: '#0d1117', padding: '12px 16px', flexShrink: 0 }}>
        {isClosed && !isStaff && (
          <div style={{ background: '#21262d', borderRadius: 8, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#8b949e' }}>
            <span style={{ fontSize: '1rem' }}>🔒</span>
            <span>Este chat fue cerrado. Si necesitás ayuda podés enviar un nuevo mensaje y te responderemos pronto.</span>
          </div>
        )}
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleImage} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Adjuntar imagen o video"
            style={{ background: '#161b22', border: '1px solid #30363d', color: '#8b949e', borderRadius: 8, width: 38, height: 38, flexShrink: 0, cursor: 'pointer', fontSize: '1rem' }}>
            {uploading ? '⏳' : '📎'}
          </button>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMsg())}
            placeholder={isClosed && !isStaff ? 'Enviar mensaje para reabrir…' : 'Escribí tu mensaje...'} maxLength={500}
            style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', outline: 'none' }} />
          <button onClick={sendMsg} disabled={sending || !text.trim()}
            style={{ background: '#00ff88', border: 'none', color: '#0b0e14', borderRadius: 8, width: 38, height: 38, flexShrink: 0, cursor: 'pointer', fontWeight: 900, fontSize: '1rem' }}>
            {sending ? '⏳' : '➤'}
          </button>
        </div>
      </div>
    </div>
  );
}
