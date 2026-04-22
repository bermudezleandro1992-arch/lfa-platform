'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection, addDoc, onSnapshot, query, orderBy,
  limit, updateDoc, doc, serverTimestamp, getDoc,
  deleteDoc, getDocs, writeBatch, setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/* ─── Tipos ─────────────────────────────────────────────── */
interface ChatMsg {
  id:         string;
  uid:        string;
  nombre:     string;
  avatar_url?: string;
  rol?:       string;
  texto:      string;
  timestamp?: { toDate?: () => Date };
  deleted?:   boolean;
}

interface Presence {
  uid:        string;
  nombre:     string;
  avatar_url?: string;
  rol:        string;
  estado:     'online' | 'ausente';
  // ping_ms es Date.now() — confiable en el snapshot local inmediato
  ping_ms?:   number;
  // fallback para documentos viejos con serverTimestamp
  ultimo_ping?: { toDate?: () => Date };
}

const CEO_UID          = '2bOrFxTAcPgFPoHKJHQfYxoQJpw1';
const HEARTBEAT_MS     = 25_000;   // latido cada 25s
const PRESENCE_TIMEOUT = 90_000;   // ausente si no latió en 90s

/* ─── Props ──────────────────────────────────────────── */
interface CantinaChatProps {
  uid:        string;
  nombre?:    string;
  avatarUrl?: string;
  rol?:       string;
}

/* ─── Filtro anti-spam / insultos ───────────────────────── */
const PALABRAS_BLOQUEADAS = [
  // Insultos españoles/argentinos
  'pelotudo','boludo','forro','concha','puta','puto','hijo de puta','hdp',
  'hdputa','la concha','culero','pendejo','marica','maricón','maricon',
  'idiota','imbécil','imbecil','estupido','estúpido','cretino','imbé',
  'cabron','cabrón','mierda','cagada','gilipollas','coño','verga','pija',
  'chupala','chupame','suckme','negro de mierda','negro mierda',
  // Racismo / discriminación
  'negro de','negrito de','muerto de hambre','villa','villero',
  // Spam patterns
  'http://','https://','www.','discord.gg','t.me/',
];

function contienePalabrasBloqueadas(texto: string): string | null {
  const lower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const p of PALABRAS_BLOQUEADAS) {
    const pn = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(pn)) return p;
  }
  return null;
}

const ROL_CLR: Record<string, string> = {
  ceo:     '#ffd700',
  soporte: '#ff4757',
  mod:     '#a371f7',
  jugador: '#00ff88',
  bot:     '#8b949e',
};
const ROL_LABEL: Record<string, string> = {
  ceo:     '⭐ CEO',
  soporte: '🛡️ MOD',
  mod:     '🛡️ MOD',
  jugador: '',
  bot:     '🤖',
};

function timeStr(ts?: { toDate?: () => Date }) {
  const d = ts?.toDate?.();
  if (!d) return '';
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

/* ═══════════════════════════════════════════════════════════ */
export default function CantinaChat({ uid, nombre: nombreProp, avatarUrl: avatarProp, rol: rolProp }: CantinaChatProps) {
  const [messages,   setMessages]   = useState<ChatMsg[]>([]);
  const [texto,      setTexto]      = useState('');
  const [sending,    setSending]    = useState(false);
  const [errMsg,     setErrMsg]     = useState('');
  const [userInfo,   setUserInfo]   = useState<{ nombre: string; avatar_url?: string; rol: string } | null>(() => {
    if (nombreProp) {
      return { nombre: nombreProp, avatar_url: avatarProp, rol: uid === CEO_UID ? 'ceo' : (rolProp || 'jugador') };
    }
    return null;
  });
  const [presences,  setPresences]  = useState<Presence[]>([]);
  const [miEstado,   setMiEstado]   = useState<'online' | 'ausente'>('online');
  const bottomRef  = useRef<HTMLDivElement>(null);
  const lastSent   = useRef<number>(0);
  const lastTexto  = useRef<string>('');
  const inputRef   = useRef<HTMLInputElement>(null);
  const heartTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isMod = uid === CEO_UID || userInfo?.rol === 'soporte' || userInfo?.rol === 'mod';

  /* ── Cargar datos del usuario (solo si no se recibieron por props) ── */
  useEffect(() => {
    if (!uid || userInfo) return; // ya tenemos info, no hace falta fetchear
    getDoc(doc(db, 'usuarios', uid))
      .then(snap => {
        const d = snap.exists() ? snap.data() : {};
        const rol = uid === CEO_UID ? 'ceo' : ((d as Record<string,unknown>).rol as string || 'jugador');
        setUserInfo({
          nombre:     ((d as Record<string,unknown>).nombre as string) || 'JUGADOR',
          avatar_url: (d as Record<string,unknown>).avatar_url as string | undefined,
          rol,
        });
      })
      .catch(() => {
        // Si falla la lectura igualmente escribimos presencia con nombre básico
        setUserInfo({ nombre: 'JUGADOR', rol: uid === CEO_UID ? 'ceo' : 'jugador' });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);  // userInfo intencionalmente excluido para no re-fetchear

  /* ── Presencia: escribir / heartbeat / cleanup ─────────── */
  const writePresence = useCallback(async (estado: 'online' | 'ausente', info?: { nombre: string; avatar_url?: string; rol: string }) => {
    const u = info ?? userInfo;
    if (!u) return;
    try {
      await setDoc(doc(db, 'cantina_presencia', uid), {
        uid,
        nombre:     u.nombre,
        avatar_url: u.avatar_url ?? null,
        rol:        u.rol,
        estado,
        ping_ms:     Date.now(),
      });
    } catch { /* ok */ }
  }, [uid, userInfo]);

  const deletePresence = useCallback(() => {
    // Solo se usa en beforeunload (cierre de pestaña)
    deleteDoc(doc(db, 'cantina_presencia', uid)).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!userInfo) return;
    // Registrar presencia inicial
    writePresence('online', userInfo);

    // Heartbeat cada 25s
    heartTimer.current = setInterval(() => {
      writePresence(miEstado);
    }, HEARTBEAT_MS);

    // Al cerrar la pestaña del navegador: borrar presencia
    const onUnload = () => deletePresence();
    window.addEventListener('beforeunload', onUnload);

    // Al ocultar la pestaña → ausente; al volver → online
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        writePresence('ausente');
      } else {
        writePresence('online');
        setMiEstado('online');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (heartTimer.current) clearInterval(heartTimer.current);
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      // Marcar como ausente en lugar de borrar — evita race condition con el remontado
      writePresence('ausente', userInfo);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInfo]);

  // Al cambiar miEstado manualmente, actualizar en Firestore
  useEffect(() => {
    if (!userInfo) return;
    writePresence(miEstado);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miEstado]);

  /* ── Listener presencias ─────────────────────────────── */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cantina_presencia'), snap => {
      const now = Date.now();
      const list: Presence[] = [];
      snap.forEach(d => {
        const data = d.data() as Presence;
        // Incluir siempre; solo filtrar docs muy viejos (sin actividad en 3 min)
        const lastPing = data.ping_ms ?? data.ultimo_ping?.toDate?.()?.getTime?.() ?? now;
        if (now - lastPing < 180_000) {
          list.push({ ...data, uid: d.id });
        }
      });
      // Yo primero, luego online, luego ausentes
      list.sort((a, b) => {
        if (a.uid === uid) return -1;
        if (b.uid === uid) return 1;
        if (a.estado === 'online' && b.estado !== 'online') return -1;
        if (b.estado === 'online' && a.estado !== 'online') return 1;
        return 0;
      });
      setPresences(list);
    });
    return unsub;
  }, [uid]);

  /* ── Listener mensajes ────────────────────────────────── */
  useEffect(() => {
    const q = query(
      collection(db, 'cantina_messages'),
      orderBy('timestamp', 'desc'),
      limit(120)
    );
    const unsub = onSnapshot(q, snap => {
      const msgs: ChatMsg[] = [];
      snap.forEach(d => msgs.push({ id: d.id, ...d.data() } as ChatMsg));
      setMessages(msgs.reverse());
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    });
    return unsub;
  }, []);

  /* ── Enviar mensaje ───────────────────────────────────── */
  async function enviar() {
    const t = texto.trim();
    if (!t || sending || !userInfo) return;
    if (t.length > 280) return;

    // Anti-spam: rate limit 5s
    const now = Date.now();
    if (now - lastSent.current < 5000) {
      setErrMsg('⏳ Esperá un momento antes de enviar otro mensaje.');
      setTimeout(() => setErrMsg(''), 3000);
      return;
    }

    // Anti-spam: mismo mensaje repetido
    if (t === lastTexto.current) {
      setErrMsg('🚫 No podés enviar el mismo mensaje dos veces seguidas.');
      setTimeout(() => setErrMsg(''), 3000);
      return;
    }

    // Filtro insultos/links
    const palabraMala = contienePalabrasBloqueadas(t);
    if (palabraMala) {
      setErrMsg('🚫 Mensaje bloqueado. Mantené el Fair Play en la Cantina.');
      setTimeout(() => setErrMsg(''), 4000);
      return;
    }

    lastSent.current = now;
    lastTexto.current = t;

    setSending(true);
    setTexto('');
    inputRef.current?.focus();

    try {
      await addDoc(collection(db, 'cantina_messages'), {
        uid,
        nombre:     userInfo.nombre,
        avatar_url: userInfo.avatar_url ?? null,
        rol:        userInfo.rol,
        texto:      t,
        timestamp:  serverTimestamp(),
        deleted:    false,
      });
    } catch { /* ok */ }
    setSending(false);
  }

  /* ── Borrar mensaje (solo mods) ───────────────────────── */
  async function borrar(id: string) {
    await updateDoc(doc(db, 'cantina_messages', id), { deleted: true });
  }

  /* ── Limpiar historial completo (solo CEO/mods) ─────── */
  async function limpiarChat() {
    if (!isMod) return;
    if (!confirm('¿Borrar todo el historial de la Cantina? Esta acción no se puede deshacer.')) return;
    try {
      const snap = await getDocs(collection(db, 'cantina_messages'));
      const b = writeBatch(db);
      snap.forEach(d => b.delete(d.ref));
      await b.commit();
    } catch { /* ok */ }
  }

  /* ══ RENDER ══════════════════════════════════════════════ */
  const onlineList  = presences.filter(p => p.estado === 'online');
  const ausenteList = presences.filter(p => p.estado === 'ausente');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontFamily: "'Roboto',sans-serif" }}>
      <style>{`
        .cant-msg:hover .cant-del { opacity:1 !important; }
        .cant-input:focus { border-color:#00ff8880 !important; outline:none; }
        .cant-send:hover:not(:disabled) { background:rgba(0,255,136,0.2) !important; }
        .cant-user:hover { background:rgba(255,255,255,0.04) !important; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0b0e14}
        ::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}
      `}</style>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #1c2028', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.1rem' }}>🍺</span>
        <span style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.82rem', fontWeight: 900 }}>CANTINA LFA</span>
        <span style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff8840', borderRadius: 10, padding: '2px 8px', fontSize: '0.62rem', color: '#00ff88', fontFamily: "'Orbitron',sans-serif" }}>
          🟢 {onlineList.length} online
        </span>
        {ausenteList.length > 0 && (
          <span style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid #ffd70030', borderRadius: 10, padding: '2px 8px', fontSize: '0.62rem', color: '#ffd700', fontFamily: "'Orbitron',sans-serif" }}>
            🌙 {ausenteList.length} ausente{ausenteList.length > 1 ? 's' : ''}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Toggle ausente/online */}
        {userInfo && (
          <button
            onClick={() => setMiEstado(miEstado === 'online' ? 'ausente' : 'online')}
            style={{
              background: miEstado === 'online' ? 'rgba(0,255,136,0.08)' : 'rgba(255,215,0,0.08)',
              border: `1px solid ${miEstado === 'online' ? 'rgba(0,255,136,0.25)' : 'rgba(255,215,0,0.25)'}`,
              color: miEstado === 'online' ? '#00ff88' : '#ffd700',
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
              fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 900,
              transition: '0.15s',
            }}
            title="Cambiar tu estado"
          >
            {miEstado === 'online' ? '🟢 EN LÍNEA' : '🌙 AUSENTE'}
          </button>
        )}
        {/* Limpiar historial (mods) */}
        {isMod && (
          <button
            onClick={limpiarChat}
            style={{
              background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)',
              color: '#ff4757', borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
              fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 900,
              transition: '0.15s',
            }}
            title="Borrar todo el historial"
          >
            🗑️ LIMPIAR
          </button>
        )}
      </div>

      {/* ── Cuerpo: sidebar + mensajes ──────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Sidebar online ──────────────────────────────── */}
        <div style={{ width: 190, flexShrink: 0, borderRight: '1px solid #1c2028', overflowY: 'auto', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', color: '#4a5568', fontWeight: 900, padding: '2px 6px', marginBottom: 6, letterSpacing: 1 }}>
            — EN LÍNEA —
          </div>

          {presences.length === 0 && (
            <div style={{ color: '#4a5568', fontSize: '0.68rem', textAlign: 'center', padding: '20px 0' }}>Nadie por aquí</div>
          )}

          {presences.map(p => {
            const isMe    = p.uid === uid;
            const rc      = ROL_CLR[p.rol?.toLowerCase() ?? 'jugador'] ?? '#8b949e';
            const isOnline = p.estado === 'online';
            return (
              <div key={p.uid} className="cant-user" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 6px', borderRadius: 8, background: isMe ? 'rgba(0,255,136,0.04)' : 'transparent', transition: '0.15s' }}>
                {/* Dot de estado */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1c2028', border: `2px solid ${rc}30`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '0.8rem' }}>👤</span>
                    }
                  </div>
                  <div style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: isOnline ? '#00ff88' : '#ffd700', border: '2px solid #0b0e14' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: isMe ? '#00ff88' : 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.nombre}{isMe ? ' (vos)' : ''}
                  </div>
                  {!isOnline && (
                    <div style={{ fontSize: '0.56rem', color: '#ffd700' }}>ausente</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Mensajes ────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4a5568' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🍺</div>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', marginBottom: 4 }}>LA CANTINA ESTÁ VACÍA</div>
              <div style={{ fontSize: '0.75rem' }}>¡Sé el primero en saludar!</div>
            </div>
          )}

          {messages.filter(m => !m.deleted || isMod).map(msg => {
            const isMe  = msg.uid === uid;
            const rolKey = msg.rol?.toLowerCase() ?? 'jugador';
            const rc    = ROL_CLR[rolKey] ?? '#8b949e';
            const rl    = ROL_LABEL[rolKey] ?? '';
            const isDeleted = !!msg.deleted;

            return (
              <div key={msg.id} className="cant-msg" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', opacity: isDeleted ? 0.35 : 1 }}>
                {/* Avatar */}
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1c2028', border: `2px solid ${rc}30`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {msg.avatar_url
                    ? <img src={msg.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '1rem' }}>👤</span>
                  }
                </div>

                {/* Contenido */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.67rem', fontWeight: 900, color: isMe ? '#00ff88' : 'white' }}>
                      {(msg.nombre || 'ANÓNIMO').toUpperCase()}
                    </span>
                    {rl && (
                      <span style={{ background: `${rc}18`, color: rc, border: `1px solid ${rc}40`, borderRadius: 4, padding: '0 5px', fontSize: '0.57rem', fontWeight: 700 }}>
                        {rl}
                      </span>
                    )}
                    <span style={{ color: '#30363d', fontSize: '0.61rem' }}>{timeStr(msg.timestamp)}</span>
                    {isMod && !isDeleted && (
                      <button
                        className="cant-del"
                        onClick={() => borrar(msg.id)}
                        style={{ background: 'none', border: 'none', color: '#ff4757', cursor: 'pointer', fontSize: '0.68rem', padding: '0 2px', opacity: 0, transition: '0.15s', lineHeight: 1 }}
                        title="Borrar mensaje"
                      >🗑️</button>
                    )}
                  </div>

                  <div style={{
                    background: isMe ? 'rgba(0,255,136,0.06)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isMe ? 'rgba(0,255,136,0.18)' : '#21262d'}`,
                    borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    padding: '8px 12px',
                    fontSize: '0.82rem',
                    color: isDeleted ? '#4a5568' : '#e6edf3',
                    wordBreak: 'break-word',
                    lineHeight: 1.55,
                    maxWidth: '100%',
                  }}>
                    {isDeleted ? <i>🚫 Mensaje eliminado por moderación</i> : msg.texto}
                  </div>
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} style={{ height: 1 }} />
        </div>
      </div>

      {/* ── Input envío ─────────────────────────────────────── */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #1c2028', display: 'flex', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1c2028', border: '2px solid #30363d', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
          {userInfo?.avatar_url
            ? <img src={userInfo.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '0.9rem' }}>👤</span>
          }
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          {errMsg && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, background: 'rgba(255,71,87,0.12)', border: '1px solid #ff475750', borderRadius: 8, padding: '6px 10px', fontSize: '0.72rem', color: '#ff4757', zIndex: 10 }}>
              {errMsg}
            </div>
          )}
          <input
            ref={inputRef}
            className="cant-input"
            value={texto}
            onChange={e => setTexto(e.target.value.slice(0, 280))}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), enviar())}
            placeholder={userInfo ? `Escribí algo, ${userInfo.nombre.split(' ')[0]}... (Enter)` : 'Cargando...'}
            disabled={sending || !userInfo}
            maxLength={280}
            style={{
              width: '100%',
              background: '#1c2028',
              border: '1px solid #30363d',
              color: 'white',
              borderRadius: 10,
              padding: '10px 40px 10px 14px',
              fontFamily: "'Roboto',sans-serif",
              fontSize: '0.83rem',
              boxSizing: 'border-box',
              transition: '0.2s',
            }}
          />
          {texto.length > 240 && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.62rem', color: texto.length > 260 ? '#ff4757' : '#ffd700' }}>
              {280 - texto.length}
            </span>
          )}
        </div>

        <button
          className="cant-send"
          onClick={enviar}
          disabled={!texto.trim() || sending || !userInfo}
          style={{
            background: 'rgba(0,255,136,0.08)',
            border: '1px solid rgba(0,255,136,0.3)',
            color: '#00ff88',
            borderRadius: 10,
            padding: '0 16px',
            cursor: 'pointer',
            fontFamily: "'Orbitron',sans-serif",
            fontSize: '0.68rem',
            fontWeight: 900,
            transition: '0.2s',
            opacity: !texto.trim() || !userInfo ? 0.4 : 1,
            flexShrink: 0,
            letterSpacing: 1,
          }}
        >
          {sending ? '...' : 'ENVIAR'}
        </button>
      </div>

      {isMod && (
        <div style={{ padding: '4px 14px 8px', color: '#4a5568', fontSize: '0.62rem', flexShrink: 0 }}>
          🛡️ Modo moderador activo — hover sobre mensaje para 🗑️ borrar individualmente
        </div>
      )}
    </div>
  );
}
