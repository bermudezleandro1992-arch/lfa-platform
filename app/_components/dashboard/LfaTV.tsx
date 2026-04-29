'use client';

import { useEffect, useState } from 'react';
import {
  collection, query, where, limit, getDocs,
  addDoc, serverTimestamp, doc, setDoc, getDoc, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/* ─── Tipos ─────────────────────────────────────────── */
interface Streamer {
  uid: string; nombre?: string; avatar_url?: string;
  twitch_canal?: string; kick_canal?: string; youtube_canal?: string;
  lfa_tv?: boolean;
  juego_lfa_tv?: 'FC26' | 'EFOOTBALL' | 'AMBOS';
}

interface LivePlayer {
  uid: string;
  nombre?: string;
  avatar_url?: string;
  twitch_canal?: string;
  kick_canal?: string;
  youtube_canal?: string;
  matchId?: string;
  game?: string;
}

interface CommunityStream {
  uid:        string;
  nombre:     string;
  plataforma: 'twitch' | 'kick' | 'youtube';
  canal:      string;
  juego:      'FC26' | 'EFOOTBALL' | 'AMBOS';
}

/* ─── Canales oficiales LFA ─────────────────────────── */
const LFA_OFICIAL = {
  twitch:  'somoslfa',
  kick:    'somoslfa',
  youtube: 'somoslfa',
};

/* ─── Helpers ────────────────────────────────────────── */
function getPlatform(s: Streamer): 'twitch' | 'kick' | 'youtube' | null {
  if (s.twitch_canal)  return 'twitch';
  if (s.kick_canal)    return 'kick';
  if (s.youtube_canal) return 'youtube';
  return null;
}

function embedUrl(plat: 'twitch' | 'kick' | 'youtube', canal: string, parent: string) {
  if (plat === 'twitch')  return `https://player.twitch.tv/?channel=${canal}&parent=${parent}&muted=true&autoplay=false`;
  if (plat === 'kick')    return `https://player.kick.com/${canal}`;
  if (plat === 'youtube') return `https://www.youtube.com/embed/live_stream?channel=${canal}&autoplay=0`;
  return '';
}

function channelLink(plat: 'twitch' | 'kick' | 'youtube', canal: string) {
  if (plat === 'twitch')  return `https://twitch.tv/${canal}`;
  if (plat === 'kick')    return `https://kick.com/${canal}`;
  if (plat === 'youtube') return `https://youtube.com/@${canal}`;
  return '#';
}

const PLAT_COLOR: Record<string, string> = { twitch: '#9146FF', kick: '#53FC18', youtube: '#ff0000' };
const PLAT_LABEL: Record<string, string> = { twitch: '💜 TWITCH', kick: '🟢 KICK', youtube: '▶️ YOUTUBE' };
const JUEGO_BADGE: Record<string, { label: string; color: string }> = {
  FC26:      { label: '⚽ FC 26',     color: '#00ff88' },
  EFOOTBALL: { label: '🏅 eFootball', color: '#009ee3' },
  AMBOS:     { label: '🎮 Ambos',     color: '#ffd700' },
};

/* ═══════════════════════════════════════════════════ */
export default function LfaTV({ uid }: { uid: string }) {
  const [streamers,    setStreamers]    = useState<Streamer[]>([]);
  const [community,    setCommunity]    = useState<CommunityStream[]>([]);
  const [myStream,     setMyStream]     = useState<CommunityStream | null>(null);
  const [gameTab,      setGameTab]      = useState<'todos'|'FC26'|'EFOOTBALL'>('todos');
  const [featured,     setFeatured]     = useState<'twitch'|'kick'|'youtube'>('youtube');
  const [parent,       setParent]       = useState('localhost');
  const [livePlayers,  setLivePlayers]  = useState<LivePlayer[]>([]);

  /* Lead modal (aplicar como partner oficial) */
  const [leadOpen,     setLeadOpen]     = useState(false);
  const [leadSent,     setLeadSent]     = useState(false);
  const [leadSending,  setLeadSending]  = useState(false);
  const [lead, setLead] = useState({ nombre: '', email: '', celular: '', juego: 'FC26', mensaje: '' });

  /* Modal: agregar/editar mi canal de comunidad */
  const [streamOpen,   setStreamOpen]   = useState(false);
  const [streamSaving, setStreamSaving] = useState(false);
  const [streamForm, setStreamForm] = useState<{
    plataforma: 'twitch' | 'kick' | 'youtube';
    canal: string;
    juego: 'FC26' | 'EFOOTBALL' | 'AMBOS';
  }>({ plataforma: 'kick', canal: '', juego: 'FC26' });

  useEffect(() => {
    if (typeof window !== 'undefined') setParent(window.location.hostname);
  }, []);

  /* ── Jugadores en partida activa con canal de stream ──── */
  useEffect(() => {
    const q = query(
      collection(db, 'matches'),
      where('status', 'in', ['WAITING', 'PENDING_RESULT']),
      limit(30),
    );
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) { setLivePlayers([]); return; }
      const uids = new Set<string>();
      const matchByUid: Record<string, { matchId: string; game?: string }> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const game = data.game as string | undefined;
        if (data.p1) { uids.add(data.p1); matchByUid[data.p1] = { matchId: d.id, game }; }
        if (data.p2) { uids.add(data.p2); matchByUid[data.p2] = { matchId: d.id, game }; }
      });
      // Filtrar solo los que tienen canales configurados
      const results: LivePlayer[] = [];
      for (const uid of uids) {
        try {
          const snap2 = await getDoc(doc(db, 'usuarios', uid));
          if (!snap2.exists()) continue;
          const data = snap2.data();
          if (data.twitch_canal || data.kick_canal || data.youtube_canal) {
            results.push({
              uid,
              nombre: data.nombre,
              avatar_url: data.avatar_url,
              twitch_canal: data.twitch_canal,
              kick_canal: data.kick_canal,
              youtube_canal: data.youtube_canal,
              matchId: matchByUid[uid]?.matchId,
              game: matchByUid[uid]?.game,
            });
          }
        } catch { /* ok */ }
      }
      setLivePlayers(results);
    });
    return unsub;
  }, []);

  /* ── Streamers oficiales (lfa_tv === true) ─────────── */
  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'usuarios'),
          where('lfa_tv', '==', true),
          limit(20)
        ));
        const list: Streamer[] = [];
        snap.forEach(d => {
          const data = d.data() as Streamer;
          if (data.twitch_canal || data.kick_canal || data.youtube_canal) {
            list.push({ ...data, uid: d.id });
          }
        });
        setStreamers(list.filter(s => s.uid !== 'somoslfa_oficial'));
      } catch { /* ok */ }
    };
    fetch();
  }, []);

  /* ── Canales de la comunidad ─────────────────────────── */
  useEffect(() => {
    if (!uid) return;
    const fetch = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'community_streams'), limit(60)));
        const list: CommunityStream[] = [];
        snap.forEach(d => list.push({ uid: d.id, ...d.data() } as CommunityStream));
        setCommunity(list);
        const mine = list.find(s => s.uid === uid);
        if (mine) {
          setMyStream(mine);
          setStreamForm({ plataforma: mine.plataforma, canal: mine.canal, juego: mine.juego });
        }
      } catch { /* ok */ }
    };
    fetch();
  }, [uid]);

  /* ── Filtro por juego ────────────────────────────────── */
  function filterGame<T extends { juego?: string; juego_lfa_tv?: string }>(list: T[]): T[] {
    if (gameTab === 'todos') return list;
    return list.filter(s => {
      const j = (s as { juego_lfa_tv?: string }).juego_lfa_tv ?? (s as { juego?: string }).juego ?? 'AMBOS';
      return j === gameTab || j === 'AMBOS';
    });
  }

  /* ── Enviar lead (aplicar como partner) ─────────────── */
  async function enviarLead() {
    if (!lead.nombre.trim() || !lead.email.trim()) return;
    setLeadSending(true);
    try {
      await addDoc(collection(db, 'leads_streamers'), { ...lead, uid: uid || null, fecha: serverTimestamp() });
      setLeadSent(true);
    } catch { /* ok */ }
    setLeadSending(false);
  }

  /* ── Guardar mi canal de comunidad ──────────────────── */
  async function guardarStream() {
    if (!streamForm.canal.trim() || !uid) return;
    setStreamSaving(true);
    try {
      // Sanitizar: quitar @, espacios, slashes
      const canal = streamForm.canal.trim().replace(/^[@/\s]+/, '').replace(/[\s]/g, '');
      // Obtener nombre del usuario
      let nombre = 'JUGADOR';
      try {
        const snap = await getDoc(doc(db, 'usuarios', uid));
        if (snap.exists()) nombre = (snap.data().nombre as string) || 'JUGADOR';
      } catch { /* ok */ }

      const data: CommunityStream = { uid, nombre, plataforma: streamForm.plataforma, canal, juego: streamForm.juego };
      await setDoc(doc(db, 'community_streams', uid), data);
      setMyStream(data);
      setCommunity(prev => {
        const idx = prev.findIndex(s => s.uid === uid);
        if (idx >= 0) { const copy = [...prev]; copy[idx] = data; return copy; }
        return [...prev, data];
      });
      setStreamOpen(false);
    } catch { /* ok */ }
    setStreamSaving(false);
  }

  const featuredEmbed = embedUrl(featured, LFA_OFICIAL[featured], parent);
  const filteredOfficial = filterGame(streamers.map(s => ({ ...s, juego: s.juego_lfa_tv ?? 'AMBOS' })));
  const filteredCommunity = filterGame(community);

  return (
    <>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .tvcard:hover{border-color:rgba(0,255,136,0.3)!important;transform:translateY(-2px)}
        .tvcard{transition:all .2s ease}
        .comcard:hover{border-color:rgba(255,255,255,0.15)!important;transform:translateY(-2px)}
        .comcard{transition:all .2s ease}
        .lead-inp{width:100%;padding:9px 12px;background:#0b0e14;border:1px solid #30363d;color:white;border-radius:8px;font-size:0.83rem;box-sizing:border-box;margin-bottom:10px;font-family:'Roboto',sans-serif;outline:none}
        .lead-inp:focus{border-color:#53FC18 !important}
      `}</style>

      {/* ── MODAL LEAD (partner oficial) ──────────────── */}
      {leadOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => { setLeadOpen(false); setLeadSent(false); }}>
          <div style={{ background: '#161b22', border: '1px solid rgba(83,252,24,0.3)', borderRadius: 18, padding: 'clamp(20px,4vw,32px)', width: '100%', maxWidth: 440, position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { setLeadOpen(false); setLeadSent(false); }} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#8b949e', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            {leadSent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🎙️</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#53FC18', fontSize: '1rem', fontWeight: 900, marginBottom: 8 }}>¡SOLICITUD ENVIADA!</div>
                <div style={{ color: '#8b949e', fontSize: '0.8rem' }}>El equipo SOMOS LFA se va a contactar a la brevedad.</div>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#53FC18', fontSize: '0.9rem', fontWeight: 900, marginBottom: 4 }}>🎙️ APLICAR COMO PARTNER OFICIAL</div>
                <div style={{ color: '#8b949e', fontSize: '0.72rem', marginBottom: 18 }}>Completá el formulario y te contactamos nosotros.</div>
                <label style={{ color: '#8b949e', fontSize: '0.68rem', display: 'block', marginBottom: 4 }}>NOMBRE / NICK *</label>
                <input className="lead-inp" value={lead.nombre} onChange={e => setLead(l => ({ ...l, nombre: e.target.value }))} placeholder="Tu nombre o nick" maxLength={60} />
                <label style={{ color: '#8b949e', fontSize: '0.68rem', display: 'block', marginBottom: 4 }}>EMAIL *</label>
                <input className="lead-inp" type="email" value={lead.email} onChange={e => setLead(l => ({ ...l, email: e.target.value }))} placeholder="tucorreo@ejemplo.com" maxLength={100} />
                <label style={{ color: '#8b949e', fontSize: '0.68rem', display: 'block', marginBottom: 4 }}>CELULAR / WHATSAPP</label>
                <input className="lead-inp" type="tel" value={lead.celular} onChange={e => setLead(l => ({ ...l, celular: e.target.value }))} placeholder="+54 9 11..." maxLength={25} />
                <label style={{ color: '#8b949e', fontSize: '0.68rem', display: 'block', marginBottom: 4 }}>JUEGO</label>
                <select className="lead-inp" value={lead.juego} onChange={e => setLead(l => ({ ...l, juego: e.target.value }))} style={{ cursor: 'pointer' }}>
                  <option value="FC26">EA SPORTS FC 26</option>
                  <option value="EFOOTBALL">eFootball</option>
                  <option value="AMBOS">Ambos juegos</option>
                </select>
                <label style={{ color: '#8b949e', fontSize: '0.68rem', display: 'block', marginBottom: 4 }}>MENSAJE (opcional)</label>
                <textarea className="lead-inp" value={lead.mensaje} onChange={e => setLead(l => ({ ...l, mensaje: e.target.value }))} placeholder="Contanos sobre tu canal, seguidores, tipo de contenido..." maxLength={500} rows={3} style={{ resize: 'vertical', marginBottom: 16 }} />
                <button onClick={enviarLead} disabled={!lead.nombre.trim() || !lead.email.trim() || leadSending} style={{ width: '100%', background: 'linear-gradient(135deg,#53FC18,#00cc44)', color: '#0b0e14', border: 'none', borderRadius: 10, padding: '12px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.78rem', fontWeight: 900, cursor: 'pointer', opacity: (!lead.nombre.trim() || !lead.email.trim() || leadSending) ? 0.5 : 1, transition: '0.15s', letterSpacing: 1 }}>
                  {leadSending ? 'ENVIANDO...' : '📤 ENVIAR SOLICITUD'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: AGREGAR MI CANAL ───────────────────── */}
      {streamOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setStreamOpen(false)}>
          <div style={{ background: '#161b22', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 18, padding: 'clamp(20px,4vw,28px)', width: '100%', maxWidth: 400, position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setStreamOpen(false)} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#8b949e', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.85rem', fontWeight: 900, marginBottom: 4 }}>
              📺 {myStream ? 'EDITAR MI CANAL' : 'AGREGAR MI CANAL'}
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.72rem', marginBottom: 18 }}>Aparecerás en los reproductores de la comunidad.</div>
            <label style={{ color: '#8b949e', fontSize: '0.68rem', display: 'block', marginBottom: 4 }}>PLATAFORMA</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['kick', 'twitch', 'youtube'] as const).map(p => (
                <button key={p} onClick={() => setStreamForm(f => ({ ...f, plataforma: p }))} style={{ flex: 1, background: streamForm.plataforma === p ? PLAT_COLOR[p] + '22' : 'transparent', border: `1px solid ${streamForm.plataforma === p ? PLAT_COLOR[p] : '#30363d'}`, color: streamForm.plataforma === p ? PLAT_COLOR[p] : '#8b949e', borderRadius: 8, padding: '7px 4px', cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 900, transition: '0.15s' }}>
                  {PLAT_LABEL[p]}
                </button>
              ))}
            </div>
            <label style={{ color: '#8b949e', fontSize: '0.68rem', display: 'block', marginBottom: 4 }}>NOMBRE DEL CANAL *</label>
            <input className="lead-inp" value={streamForm.canal} onChange={e => setStreamForm(f => ({ ...f, canal: e.target.value }))} placeholder={streamForm.plataforma === 'youtube' ? 'SomosLFA (sin @)' : 'somoslfa'} maxLength={60} />
            <label style={{ color: '#8b949e', fontSize: '0.68rem', display: 'block', marginBottom: 4 }}>JUEGO QUE STREAMEÁS</label>
            <select className="lead-inp" value={streamForm.juego} onChange={e => setStreamForm(f => ({ ...f, juego: e.target.value as 'FC26'|'EFOOTBALL'|'AMBOS' }))} style={{ cursor: 'pointer', marginBottom: 18 }}>
              <option value="FC26">EA SPORTS FC 26</option>
              <option value="EFOOTBALL">eFootball</option>
              <option value="AMBOS">Ambos juegos</option>
            </select>
            <button onClick={guardarStream} disabled={!streamForm.canal.trim() || streamSaving} style={{ width: '100%', background: 'linear-gradient(135deg,#00ff88,#00a859)', color: '#0b0e14', border: 'none', borderRadius: 10, padding: '12px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.78rem', fontWeight: 900, cursor: 'pointer', opacity: (!streamForm.canal.trim() || streamSaving) ? 0.5 : 1, transition: '0.15s', letterSpacing: 1 }}>
              {streamSaving ? 'GUARDANDO...' : myStream ? '💾 ACTUALIZAR CANAL' : '📺 AGREGAR CANAL'}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: '#0b0e14', minHeight: 'calc(100vh - 52px)', color: 'white', fontFamily: "'Roboto',sans-serif" }}>

        {/* ── BANNER ───────────────────────────────────── */}
        <div style={{ background: 'linear-gradient(135deg,#0d1117,#160505)', borderBottom: '1px solid #30363d', padding: 'clamp(20px,3vw,32px) 5%', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%,rgba(255,71,87,0.08),transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff4757', display: 'inline-block', animation: 'pulse 1.5s infinite', boxShadow: '0 0 8px #ff4757' }} />
                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', color: '#ff4757', fontWeight: 900, letterSpacing: 2 }}>EN VIVO</span>
                </div>
                <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.4rem,4vw,2.2rem)', fontWeight: 900, margin: 0 }}>
                  📺 <span style={{ color: '#ff4757' }}>LFA</span> TV
                </h1>
                <p style={{ color: '#8b949e', fontSize: '0.78rem', margin: '4px 0 0' }}>Seguí las transmisiones en vivo de LFA y la comunidad</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(16px,3vw,28px) clamp(12px,4vw,5%)' }}>

          {/* ── CANAL OFICIAL LFA ────────────────────── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.82rem', fontWeight: 900 }}>
                🏆 CANAL OFICIAL LFA
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['youtube', 'twitch', 'kick'] as const).map(p => (
                  <button key={p} onClick={() => setFeatured(p)} style={{ background: featured === p ? PLAT_COLOR[p] + '20' : 'transparent', border: `1px solid ${featured === p ? PLAT_COLOR[p] : '#30363d'}`, color: featured === p ? PLAT_COLOR[p] : '#8b949e', padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 900, transition: '0.15s' }}>
                    {PLAT_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#0d1117', borderRadius: 14, overflow: 'hidden', border: '2px solid #ffd70030', boxShadow: '0 0 30px rgba(255,215,0,0.07)' }}>
              <iframe src={featuredEmbed} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} allowFullScreen allow="autoplay; fullscreen" title={`LFA TV - ${featured}`} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {(['youtube', 'twitch', 'kick'] as const).map(p => (
                <a key={p} href={channelLink(p, LFA_OFICIAL[p])} target="_blank" rel="noopener noreferrer" style={{ color: PLAT_COLOR[p], border: `1px solid ${PLAT_COLOR[p]}40`, padding: '5px 14px', borderRadius: 20, textDecoration: 'none', fontSize: '0.72rem', fontWeight: 700, transition: '0.15s' }}>
                  {PLAT_LABEL[p]} ↗
                </a>
              ))}
            </div>
          </div>

          {/* ── FILTROS GLOBALES ─────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', color: '#4a5568', letterSpacing: 1 }}>FILTRAR:</span>
            {([['todos', '🌐 Todos'], ['FC26', '⚽ FC 26'], ['EFOOTBALL', '🏅 eFootball']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setGameTab(v)} style={{ background: gameTab === v ? 'rgba(0,255,136,0.1)' : 'transparent', border: `1px solid ${gameTab === v ? '#00ff88' : '#30363d'}`, color: gameTab === v ? '#00ff88' : '#8b949e', padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', fontWeight: 900, transition: '0.15s' }}>
                {l}
              </button>
            ))}
          </div>

          {/* ── STREAMERS OFICIALES LFA ──────────────────── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.82rem', fontWeight: 900, marginBottom: 14 }}>
              🎙️ STREAMERS OFICIALES LFA
            </div>

            {filteredOfficial.length === 0 ? (
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: '40px', textAlign: 'center', color: '#8b949e' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🎙️</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Próximamente — Streamers Oficiales LFA</div>
                <div style={{ fontSize: '0.78rem' }}>
                  Los partners oficiales aparecerán acá.{' '}
                  <button onClick={() => { setLeadOpen(true); setLeadSent(false); }} style={{ background: 'none', border: 'none', color: '#53FC18', cursor: 'pointer', padding: 0, fontSize: '0.78rem', textDecoration: 'underline' }}>Aplicar como partner</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 14 }}>
                {filteredOfficial.map(s => {
                  const plat = getPlatform(s);
                  if (!plat) return null;
                  const canal = s[`${plat}_canal` as keyof Streamer] as string;
                  const juegoKey = (s.juego_lfa_tv ?? 'AMBOS') as keyof typeof JUEGO_BADGE;
                  return (
                    <div key={s.uid} className="tvcard" style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, overflow: 'hidden' }}>
                      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#0d1117' }}>
                        <iframe src={embedUrl(plat, canal, parent)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} allowFullScreen title={s.nombre || canal} />
                      </div>
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: '#1c2028', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {s.avatar_url ? <img src={s.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.2rem' }}>👤</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nombre || canal}</div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: '0.62rem', color: PLAT_COLOR[plat], fontWeight: 700 }}>{PLAT_LABEL[plat]}</span>
                            <span style={{ fontSize: '0.62rem', color: JUEGO_BADGE[juegoKey]?.color ?? '#8b949e', fontWeight: 700 }}>{JUEGO_BADGE[juegoKey]?.label}</span>
                          </div>
                        </div>
                        <a href={channelLink(plat, canal)} target="_blank" rel="noopener noreferrer" style={{ color: PLAT_COLOR[plat], textDecoration: 'none', fontSize: '0.7rem', fontWeight: 700, border: `1px solid ${PLAT_COLOR[plat]}40`, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          Ver ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CTA partner */}
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(83,252,24,0.04)', border: '1px solid rgba(83,252,24,0.13)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#53FC18', fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', fontWeight: 900, marginBottom: 2 }}>¿QUERÉS SER STREAMER OFICIAL SOMOS LFA?</div>
                <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>Los partners son seleccionados por el equipo. Completá el formulario y te contactamos.</div>
              </div>
              <button onClick={() => { setLeadOpen(true); setLeadSent(false); }} style={{ background: 'linear-gradient(135deg,#53FC18,#00cc44)', color: '#0b0e14', border: 'none', padding: '8px 16px', borderRadius: 8, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.7rem', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                📤 APLICAR
              </button>
            </div>
          </div>

          {/* ── JUGANDO EN VIVO (players en partida con canal) ──── */}
          {livePlayers.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ff4757', fontSize: '0.82rem', fontWeight: 900, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4757', display: 'inline-block', boxShadow: '0 0 8px #ff4757', animation: 'pulse 1.5s infinite' }} />
                JUGANDO EN VIVO AHORA
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,240px),1fr))', gap: 12 }}>
                {livePlayers
                  .filter(p => gameTab === 'todos' || p.game === gameTab || !p.game)
                  .map(p => {
                    const plat = p.twitch_canal ? 'twitch' : p.kick_canal ? 'kick' : 'youtube';
                    const canal = (p.twitch_canal || p.kick_canal || p.youtube_canal)!;
                    return (
                      <div key={p.uid} className="comcard" style={{ background: '#161b22', border: '1px solid rgba(255,71,87,0.35)', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#0d1117' }}>
                          <iframe
                            src={embedUrl(plat, canal, parent)}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                            allowFullScreen title={p.nombre || canal} loading="lazy"
                          />
                        </div>
                        <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', background: '#1c2028', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1rem' }}>👤</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre || canal}</div>
                            <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center' }}>
                              <span style={{ fontSize: '0.6rem', color: '#ff4757', fontWeight: 700 }}>⚔️ EN PARTIDA</span>
                              <span style={{ fontSize: '0.6rem', color: PLAT_COLOR[plat], fontWeight: 700 }}>{PLAT_LABEL[plat]}</span>
                            </div>
                          </div>
                          <a href={channelLink(plat, canal)} target="_blank" rel="noopener noreferrer" style={{ color: '#ff4757', textDecoration: 'none', fontSize: '0.65rem', fontWeight: 700, border: '1px solid rgba(255,71,87,0.4)', padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            Ver ↗
                          </a>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── CANALES DE LA COMUNIDAD ───────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#009ee3', fontSize: '0.82rem', fontWeight: 900 }}>
                🎮 CANALES DE LA COMUNIDAD
              </div>
              <button
                onClick={() => { setStreamOpen(true); if (myStream) setStreamForm({ plataforma: myStream.plataforma, canal: myStream.canal, juego: myStream.juego }); }}
                style={{ background: myStream ? 'rgba(0,158,227,0.1)' : 'linear-gradient(135deg,#009ee3,#0066cc)', color: myStream ? '#009ee3' : '#fff', border: myStream ? '1px solid #009ee360' : 'none', padding: '6px 14px', borderRadius: 8, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.65rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {myStream ? '✏️ EDITAR MI CANAL' : '📺 AGREGAR MI CANAL'}
              </button>
            </div>

            {filteredCommunity.length === 0 ? (
              <div style={{ background: '#161b22', border: '1px dashed #30363d', borderRadius: 14, padding: '36px', textAlign: 'center', color: '#8b949e' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📺</div>
                <div style={{ fontWeight: 700, marginBottom: 5, fontSize: '0.82rem' }}>Ningún canal registrado aún</div>
                <div style={{ fontSize: '0.75rem' }}>
                  {gameTab !== 'todos' ? `No hay canales para el juego seleccionado.` : '¡Sé el primero en agregar tu canal!'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,240px),1fr))', gap: 12 }}>
                {filteredCommunity.map(s => {
                  const juegoKey = s.juego as keyof typeof JUEGO_BADGE;
                  const isMe = s.uid === uid;
                  return (
                    <div key={s.uid} className="comcard" style={{ background: '#161b22', border: `1px solid ${isMe ? 'rgba(0,158,227,0.35)' : '#30363d'}`, borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#0d1117' }}>
                        <iframe
                          src={embedUrl(s.plataforma, s.canal, parent)}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                          allowFullScreen
                          title={s.nombre}
                          loading="lazy"
                        />
                      </div>
                      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.78rem', color: isMe ? '#009ee3' : 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.nombre}{isMe ? ' (vos)' : ''}
                          </div>
                          <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                            <span style={{ fontSize: '0.6rem', color: PLAT_COLOR[s.plataforma], fontWeight: 700 }}>{PLAT_LABEL[s.plataforma]}</span>
                            <span style={{ fontSize: '0.6rem', color: JUEGO_BADGE[juegoKey]?.color ?? '#8b949e', fontWeight: 700 }}>{JUEGO_BADGE[juegoKey]?.label}</span>
                          </div>
                        </div>
                        <a href={channelLink(s.plataforma, s.canal)} target="_blank" rel="noopener noreferrer" style={{ color: PLAT_COLOR[s.plataforma], textDecoration: 'none', fontSize: '0.65rem', fontWeight: 700, border: `1px solid ${PLAT_COLOR[s.plataforma]}40`, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          Ver ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
