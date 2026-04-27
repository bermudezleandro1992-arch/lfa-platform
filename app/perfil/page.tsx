'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc, onSnapshot, updateDoc, collection,
  query, where, orderBy, limit, getDocs,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { COUNTRIES_AMERICA_EUROPE } from '@/lib/constants';
import Link from 'next/link';

/* ─── Tipos ──────────────────────────────────────────── */
interface UserData {
  nombre?: string; email?: string; number?: number;
  fair_play?: number; titulos?: number; partidos_jugados?: number;
  avatar_url?: string; region?: string; baneado?: boolean;
  es_afiliado?: boolean; rol?: string;
  victorias?: number; derrotas?: number;
  nombre_real?: string; celular?: string;
  ciudad?: string; provincia?: string; pais?: string; id_consola?: string; ea_id?: string; konami_id?: string;
  country?: string; countryName?: string;
  referidos?: string[]; coins_referidos?: number;
  twitch_canal?: string; kick_canal?: string; youtube_canal?: string;
}
interface TxItem {
  id: string; tipo: 'entrada' | 'salida'; monto: number;
  descripcion: string; fecha?: { toDate?: () => Date };
}

/* ─── Helpers ────────────────────────────────────────── */
function countryFlag(code = '') {
  if (!code || code.length !== 2) return '';
  const o = 0x1F1E6 - 65;
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + o, code.toUpperCase().charCodeAt(1) + o);
}
function getTierBadge(t: number) {
  if (t >= 50) return { label: 'LEYENDA', color: '#ff4757', glow: 'rgba(255,71,87,0.4)',   icon: '👑' };
  if (t >= 20) return { label: 'ELITE',   color: '#ffd700', glow: 'rgba(255,215,0,0.4)',   icon: '🔥' };
  if (t >= 10) return { label: 'ORO',     color: '#f0c040', glow: 'rgba(240,192,64,0.3)',  icon: '⭐' };
  if (t >= 5)  return { label: 'PLATA',   color: '#a8b2c0', glow: 'rgba(168,178,192,0.3)', icon: '🥈' };
  if (t >= 1)  return { label: 'BRONCE',  color: '#cd7f32', glow: 'rgba(205,127,50,0.3)',  icon: '🥉' };
  return { label: 'NOVATO', color: '#8b949e', glow: 'rgba(139,148,158,0.2)', icon: '🆕' };
}
const inp: React.CSSProperties = {
  width: '100%', padding: '10px 13px', background: '#0b0e14',
  border: '1px solid #30363d', color: 'white', borderRadius: 8,
  marginBottom: 10, fontFamily: "'Roboto',sans-serif",
  boxSizing: 'border-box', outline: 'none', fontSize: '0.875rem',
};
const btn = (bg: string, c = 'black'): React.CSSProperties => ({
  background: bg, color: c, border: 'none', padding: '10px 16px',
  fontFamily: "'Orbitron',sans-serif", fontWeight: 700, borderRadius: 8,
  cursor: 'pointer', transition: '0.2s', fontSize: '0.76rem',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

/* ═══════════════════════════════════════════════════════ */
export default function PerfilPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uid,       setUid]       = useState('');
  const [userData,  setUserData]  = useState<UserData | null>(null);
  const [txList,    setTxList]    = useState<TxItem[]>([]);
  const [tab,       setTab]       = useState<'perfil' | 'billetera' | 'referidos'>('perfil');
  const [uploading, setUploading] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [ready,     setReady]     = useState(false);
  const [msg,       setMsg]       = useState('');

  const [nombre,    setNombre]    = useState('');
  const [nombreReal,setNombreReal]= useState('');
  const [celular,   setCelular]   = useState('');
  const [pais,      setPais]      = useState('');
  const [ciudad,    setCiudad]    = useState('');
  const [provincia, setProvincia] = useState('');
  const [idConsola, setIdConsola] = useState('');
  const [eaId,      setEaId]      = useState('');
  const [konamiId,  setKonamiId]  = useState('');
  const [twitchCanal, setTwitchCanal] = useState('');
  const [kickCanal,   setKickCanal]   = useState('');
  const [youtubeCanal,setYoutubeCanal]= useState('');

  /* Auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace('/'); return; }
      setUid(user.uid); setReady(true);
    });
    return unsub;
  }, [router]);

  /* Listener perfil */
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'usuarios', uid), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as UserData;
      setUserData(d);
      setNombre(d.nombre || '');
      setNombreReal(d.nombre_real || '');
      setCelular(d.celular || '');
      setPais(d.pais || '');
      setCiudad(d.ciudad || '');
      setProvincia(d.provincia || '');
      setIdConsola(d.id_consola || '');
      setEaId(d.ea_id || '');
      setKonamiId(d.konami_id || '');
      setTwitchCanal(d.twitch_canal || '');
      setKickCanal(d.kick_canal || '');
      setYoutubeCanal(d.youtube_canal || '');
    });
    return unsub;
  }, [uid]);

  /* Auto-detect country si falta */
  useEffect(() => {
    if (!uid || !userData || userData.country) return;
    const detectCountry = async () => {
      try {
        const res = await fetch('/api/detect-region');
        if (!res.ok) return;
        const { country, countryName, region } = await res.json();
        if (country && country !== 'XX') {
          await updateDoc(doc(db, 'usuarios', uid), { country, countryName, ...(region && !userData.region ? { region } : {}) });
        }
      } catch { /* silencioso */ }
    };
    detectCountry();
  }, [uid, userData]);

  /* Historial billetera */
  useEffect(() => {
    if (!uid || tab !== 'billetera') return;
    const fetchTx = async () => {
      const list: TxItem[] = [];
      try {
        const s = await getDocs(query(collection(db, 'retiros'), where('uid', '==', uid), orderBy('fecha', 'desc'), limit(30)));
        s.forEach(d => list.push({ id: d.id, tipo: 'salida', monto: d.data().montoCoins || 0, descripcion: '💸 Retiro solicitado', fecha: d.data().fecha }));
      } catch { /* índice pendiente */ }
      try {
        const s = await getDocs(query(collection(db, 'pagos_pendientes'), where('uid', '==', uid), where('estado', '==', 'aprobado'), limit(20)));
        s.forEach(d => list.push({ id: d.id, tipo: 'entrada', monto: d.data().coins || 0, descripcion: '💳 Depósito (Binance)', fecha: d.data().fecha }));
      } catch { /* ok */ }
      try {
        const s = await getDocs(query(collection(db, 'transactions'), where('uid', '==', uid), orderBy('fecha', 'desc'), limit(30)));
        s.forEach(d => list.push({ id: d.id, ...d.data() } as TxItem));
      } catch { /* ok */ }
      list.sort((a, b) => (b.fecha?.toDate?.()?.getTime() || 0) - (a.fecha?.toDate?.()?.getTime() || 0));
      setTxList(list);
    };
    fetchTx();
  }, [uid, tab]);

  /* Avatar */
  const handleAvatar = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    if (file.size > 2 * 1024 * 1024) { setMsg('❌ Máx 2MB'); return; }
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_TYPES.includes(file.type)) { setMsg('❌ Solo JPEG, PNG o WEBP'); return; }
    setUploading(true);
    try {
      const r = ref(storage, `avatars/${uid}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, 'usuarios', uid), { avatar_url: url });
      setMsg('✅ Foto actualizada');
    } catch { setMsg('❌ Error al subir'); }
    setUploading(false);
  }, [uid]);

  /* Guardar */
  const guardar = useCallback(async () => {
    if (nombre.trim().length < 3) { setMsg('❌ Nick mínimo 3 caracteres'); return; }
    setSaving(true);
    await updateDoc(doc(db, 'usuarios', uid), {
      nombre: nombre.trim(), nombre_real: nombreReal.trim(),
      celular: celular.trim(), pais: pais.trim(),
      ciudad: ciudad.trim(),
      provincia: provincia.trim(), id_consola: idConsola.trim(),
      ea_id:     eaId.trim(),
      konami_id: konamiId.trim(),
      twitch_canal: twitchCanal.trim().replace(/^@/, ''),
      kick_canal:   kickCanal.trim().replace(/^@/, ''),
      youtube_canal: youtubeCanal.trim().replace(/^@/, ''),
    });
    setMsg('✅ Datos guardados'); setSaving(false);
  }, [uid, nombre, nombreReal, celular, pais, ciudad, provincia, idConsola, eaId, konamiId, twitchCanal, kickCanal, youtubeCanal]);

  /* Copiar link */
  function copiarRef() {
    const code = uid.slice(0, 8).toUpperCase();
    navigator.clipboard?.writeText(`https://somoslfa.com/?ref=${code}`);
    setMsg('✅ Link copiado!');
  }

  if (!ready || !userData) return (
    <div style={{ background: '#0b0e14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, border: '3px solid #00ff88', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const titulos  = userData.titulos || 0;
  const badge    = getTierBadge(titulos);
  const victs    = userData.victorias || titulos;
  const derrotas = userData.derrotas || 0;
  const partidos = userData.partidos_jugados || (victs + derrotas);
  const wr       = partidos > 0 ? Math.round((victs / partidos) * 100) : 0;
  const fp       = userData.fair_play ?? 100;
  const coins    = userData.number || 0;
  const refCode  = uid.slice(0, 8).toUpperCase();
  const refCount = (userData.referidos || []).length;
  const coinsRef = userData.coins_referidos || 0;

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0b0e14} ::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}
        .pfbtn:hover{filter:brightness(1.1);transform:scale(1.02)} .ptab:hover{background:rgba(255,255,255,0.05)!important}
        .inp-focus:focus{border-color:#00ff88!important;box-shadow:0 0 0 2px rgba(0,255,136,0.1)!important}
      `}</style>

      <div style={{ background: '#0b0e14', minHeight: '100vh', color: 'white', fontFamily: "'Roboto',sans-serif" }}>

        {/* NAV */}
        <header style={{ background: 'rgba(7,9,13,0.97)', borderBottom: '1px solid #30363d', padding: '12px 5%', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap' }}>
          <Link href="/hub" style={{ color: '#8b949e', textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem' }}>← HUB</Link>
          <span style={{ color: '#30363d' }}>|</span>
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.8rem', color: '#00ff88', fontWeight: 900 }}>MI PERFIL</span>
          <div style={{ flex: 1 }} />
          <Link href="/ranking" style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', color: '#ffd700', textDecoration: 'none', border: '1px solid #ffd70050', padding: '5px 12px', borderRadius: 6 }}>🏆 RANKING</Link>
        </header>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(18px,4vw,32px) clamp(12px,4vw,5%)' }}>

          {/* HERO CARD */}
          <div style={{ background: 'linear-gradient(135deg,#161b22,#0d1117)', border: `2px solid ${badge.color}30`, borderRadius: 20, padding: 'clamp(18px,3vw,28px)', marginBottom: 20, position: 'relative', overflow: 'hidden', animation: 'fadeIn .35s ease' }}>
            <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, background: badge.glow, borderRadius: '50%', filter: 'blur(55px)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', gap: 'clamp(14px,3vw,24px)', alignItems: 'flex-start', flexWrap: 'wrap', position: 'relative' }}>

              {/* Avatar */}
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ position: 'relative', width: 100, height: 100 }}>
                  <div style={{ width: 100, height: 100, borderRadius: '50%', border: `3px solid ${badge.color}`, boxShadow: `0 0 20px ${badge.glow}`, overflow: 'hidden', background: '#1c2028', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
                    {userData.avatar_url ? <img src={userData.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '2.8rem' }}>👤</span>}
                  </div>
                  <button className="pfbtn" onClick={() => fileRef.current?.click()} style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: '50%', background: badge.color, border: 'none', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}>
                    {uploading ? '⏳' : '📷'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatar} />
                </div>
                <div style={{ marginTop: 7, fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 900, color: badge.color, background: `${badge.color}18`, border: `1px solid ${badge.color}50`, borderRadius: 20, padding: '2px 10px', display: 'inline-block' }}>
                  {badge.icon} {badge.label}
                </div>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.1rem,3vw,1.6rem)', fontWeight: 900, margin: 0 }}>
                    {userData.nombre || 'SIN NOMBRE'}
                  </h1>
                  {userData.country && <span style={{ fontSize: '1.4rem' }} title={userData.countryName}>{countryFlag(userData.country)}</span>}
                  {userData.es_afiliado && <span style={{ color: '#ffd700', fontSize: '0.68rem', fontWeight: 700 }}>⭐ AFILIADO</span>}
                </div>
                <div style={{ color: '#8b949e', fontSize: '0.76rem', marginBottom: 14 }}>
                  {userData.ciudad && userData.provincia ? `📍 ${userData.ciudad}, ${userData.provincia}` : '📍 Ciudad no configurada'}
                  {(userData.ea_id || userData.id_consola) && <span style={{ marginLeft: 12, color: '#009ee3', fontSize: '0.7rem' }}>⚽ EA: {userData.ea_id || userData.id_consola}</span>}
                  {userData.konami_id && <span style={{ marginLeft: 8, color: '#00c853', fontSize: '0.7rem' }}>⚽ Konami: {userData.konami_id}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(80px,1fr))', gap: 8 }}>
                  {[
                    { l: 'TÍTULOS',   v: titulos,                           c: badge.color },
                    { l: 'WIN RATE',  v: `${wr}%`,                         c: wr >= 60 ? '#00ff88' : wr >= 40 ? '#ffd700' : '#ff4757' },
                    { l: 'FAIR PLAY', v: `${fp}%`,                         c: fp >= 80 ? '#00ff88' : fp >= 50 ? '#ffd700' : '#ff4757' },
                    { l: 'COINS',     v: `🪙${coins.toLocaleString()}`,    c: '#ffd700' },
                  ].map(s => (
                    <div key={s.l} style={{ background: '#0b0e14', borderRadius: 10, padding: '9px 10px', border: '1px solid #30363d', textAlign: 'center' }}>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(0.9rem,2vw,1.2rem)', fontWeight: 900, color: s.c }}>{s.v}</div>
                      <div style={{ color: '#8b949e', fontSize: '0.57rem', marginTop: 2, fontFamily: "'Orbitron',sans-serif" }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* TABS */}
          <div style={{ display: 'flex', borderBottom: '1px solid #30363d', marginBottom: 18 }}>
            {(['perfil', 'billetera', 'referidos'] as const).map((id) => {
              const labels: Record<string, string> = { perfil: '👤 PERFIL', billetera: '💰 BILLETERA', referidos: '🤝 REFERIDOS' };
              return (
                <button key={id} className="ptab" onClick={() => setTab(id)} style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === id ? '#00ff88' : 'transparent'}`, color: tab === id ? '#00ff88' : '#8b949e', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, padding: '10px 18px', cursor: 'pointer', transition: '0.15s', letterSpacing: 0.5 }}>
                  {labels[id]}
                </button>
              );
            })}
          </div>

          {msg && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: msg.startsWith('✅') ? 'rgba(0,255,136,0.08)' : 'rgba(255,71,87,0.08)', border: `1px solid ${msg.startsWith('✅') ? '#00ff88' : '#ff4757'}40`, borderRadius: 8, color: msg.startsWith('✅') ? '#00ff88' : '#ff4757', fontSize: '0.8rem' }}>
              {msg}
            </div>
          )}

          {/* ══ TAB PERFIL ══ */}
          {tab === 'perfil' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>

              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: 'clamp(14px,3vw,20px)', borderTop: '3px solid #ff4757' }}>
                <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ff4757', margin: '0 0 14px', fontSize: '0.8rem' }}>🔒 DATOS PRIVADOS</h3>
                <p style={{ color: '#8b949e', fontSize: '0.71rem', marginTop: -8, marginBottom: 14 }}>Solo vos los ves. Requeridos para retiros.</p>
                <label style={{ color: '#8b949e', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>NICK EN JUEGO</label>
                <input className="inp-focus" value={nombre} onChange={e => setNombre(e.target.value)} style={inp} placeholder="Tu nick de competencia" maxLength={20} />
                <label style={{ color: '#8b949e', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>NOMBRE COMPLETO</label>
                <input className="inp-focus" value={nombreReal} onChange={e => setNombreReal(e.target.value)} style={inp} placeholder="Como figura en tu ID" />
                <label style={{ color: '#8b949e', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>CELULAR / WHATSAPP</label>
                <input className="inp-focus" value={celular} onChange={e => setCelular(e.target.value)} style={{ ...inp, marginBottom: 0 }} placeholder="+54 9 11..." type="tel" />
              </div>

              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: 'clamp(14px,3vw,20px)', borderTop: '3px solid #009ee3' }}>
                <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#009ee3', margin: '0 0 14px', fontSize: '0.8rem' }}>🌐 DATOS PÚBLICOS</h3>
                <p style={{ color: '#8b949e', fontSize: '0.71rem', marginTop: -8, marginBottom: 14 }}>Visible en tu perfil público y ranking.</p>
                <label style={{ color: '#8b949e', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>PAÍS</label>
                <select className="inp-focus" value={pais} onChange={e => { setPais(e.target.value); setProvincia(''); }} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">— Seleccioná tu país —</option>
                  {COUNTRIES_AMERICA_EUROPE.map(({ code, name }) => (
                    <option key={code} value={name}>{name}</option>
                  ))}
                </select>
                <label style={{ color: '#8b949e', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>PROVINCIA / ESTADO</label>
                {pais === 'Argentina' ? (
                  <select className="inp-focus" value={provincia} onChange={e => setProvincia(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">— Seleccioná tu provincia —</option>
                    {['Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : pais === 'México' ? (
                  <select className="inp-focus" value={provincia} onChange={e => setProvincia(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">— Seleccioná tu estado —</option>
                    {['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Guanajuato','Guerrero','Hidalgo','Jalisco','México','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <input className="inp-focus" value={provincia} onChange={e => setProvincia(e.target.value)} style={inp} placeholder="Ej: Santiago" maxLength={60} />
                )}
                <label style={{ color: '#8b949e', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>CIUDAD</label>
                <input className="inp-focus" value={ciudad} onChange={e => setCiudad(e.target.value)} style={inp} placeholder="Ej: Buenos Aires" maxLength={60} />
                <div style={{ borderTop: '1px solid #1c2028', paddingTop: 12, marginBottom: 8 }}>
                  <div style={{ color: '#ffd700', fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', fontWeight: 900, marginBottom: 10 }}>🎮 IDs DE JUEGO</div>
                </div>
                <label style={{ color: '#009ee3', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>⚽ EA ID — FC 26</label>
                <input className="inp-focus" value={eaId} onChange={e => setEaId(e.target.value)} style={{ ...inp, borderColor: eaId ? '#009ee3' : '#30363d' }} placeholder="Ej: TuNick#1234 (EA App)" maxLength={60} />
                <label style={{ color: '#00c853', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>⚽ KONAMI ID — eFootball</label>
                <input className="inp-focus" value={konamiId} onChange={e => setKonamiId(e.target.value)} style={{ ...inp, marginBottom: 14, borderColor: konamiId ? '#00c853' : '#30363d' }} placeholder="Ej: TuNick_eFootball (Konami)" maxLength={60} />

                <div style={{ borderTop: '1px solid #1c2028', paddingTop: 12, marginBottom: 4 }}>
                  <div style={{ color: '#9146FF', fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', fontWeight: 900, marginBottom: 10 }}>📡 CANALES DE STREAMING</div>
                </div>
                <label style={{ color: '#8b949e', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>💜 TWITCH (usuario)</label>
                <input className="inp-focus" value={twitchCanal} onChange={e => setTwitchCanal(e.target.value)} style={inp} placeholder="Ej: tuusuario" />
                <label style={{ color: '#8b949e', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>🟢 KICK (usuario)</label>
                <input className="inp-focus" value={kickCanal} onChange={e => setKickCanal(e.target.value)} style={inp} placeholder="Ej: tuusuario" />
                <label style={{ color: '#8b949e', fontSize: '0.7rem', display: 'block', marginBottom: 4 }}>▶️ YOUTUBE (usuario/@handle)</label>
                <input className="inp-focus" value={youtubeCanal} onChange={e => setYoutubeCanal(e.target.value)} style={{ ...inp, marginBottom: 0 }} placeholder="Ej: tucanal" />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <button className="pfbtn" onClick={guardar} disabled={saving} style={{ ...btn('#00ff88'), width: '100%', justifyContent: 'center', padding: 14, fontSize: '0.82rem', opacity: saving ? 0.6 : 1 }}>
                  {saving ? '⏳ Guardando...' : '💾 GUARDAR TODOS LOS DATOS'}
                </button>
              </div>

              <div style={{ gridColumn: '1/-1', background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: 'clamp(14px,3vw,20px)', borderTop: '3px solid #ffd700' }}>
                <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', margin: '0 0 14px', fontSize: '0.8rem' }}>📈 PROGRESIÓN COMPETITIVA</h3>
                {[
                  { l: 'FAIR PLAY', val: fp, c: fp >= 80 ? '#00ff88' : fp >= 50 ? '#ffd700' : '#ff4757' },
                  { l: 'WIN RATE',  val: wr, c: '#009ee3' },
                ].map(b => (
                  <div key={b.l} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.72rem' }}>
                      <span style={{ color: '#8b949e' }}>{b.l}</span>
                      <span style={{ color: b.c, fontWeight: 700 }}>{b.val}%</span>
                    </div>
                    <div style={{ height: 7, background: '#0b0e14', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${b.val}%`, background: b.c, borderRadius: 10, transition: 'width 1s', boxShadow: `0 0 8px ${b.c}60` }} />
                    </div>
                  </div>
                ))}

                {/* ── Explicación Fair Play ─────────────────── */}
                <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', color: '#00ff88', fontWeight: 900, marginBottom: 10 }}>
                    ⚖️ ¿CÓMO FUNCIONA EL FAIR PLAY?
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#8b949e', lineHeight: 1.6 }}>
                    El puntaje Fair Play refleja tu comportamiento dentro de la plataforma. Comienza en <strong style={{ color: '#00ff88' }}>100%</strong> y puede subir o bajar según tus acciones.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8, marginTop: 12 }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, marginBottom: 6 }}>✅ SUBE TU FAIR PLAY</div>
                      {[
                        '🎮 Jugar torneos (gratis o de pago)',
                        '📸 Reportar resultados con captura',
                        '✔️ Verificar resultados del rival',
                        '🏆 Completar partidos sin disputas',
                        '⏱️ Estar en sala a tiempo',
                      ].map(t => <div key={t} style={{ fontSize: '0.68rem', color: '#8b949e', padding: '3px 0' }}>{t}</div>)}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: '#ff4757', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, marginBottom: 6 }}>❌ BAJA TU FAIR PLAY</div>
                      {[
                        '🚪 Abandonar partidas o salas',
                        '🚫 No reportar resultado a tiempo',
                        '⚠️ Disputas resueltas en tu contra',
                        '📵 No presentarte a la sala',
                        '🔁 Resultados rechazados por el CEO',
                      ].map(t => <div key={t} style={{ fontSize: '0.68rem', color: '#8b949e', padding: '3px 0' }}>{t}</div>)}
                    </div>
                  </div>
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                    {[
                      { min: 80, label: '🟢 EXCELENTE', desc: 'Acceso total, retiro habilitado', color: '#00ff88' },
                      { min: 50, label: '🟡 REGULAR',   desc: 'Advertencia — mejorá tu conducta', color: '#ffd700' },
                      { min: 0,  label: '🔴 BAJO',      desc: 'Restricciones activas en la cuenta', color: '#ff4757' },
                    ].map(r => (
                      <div key={r.min} style={{ background: '#0b0e14', border: `1px solid ${r.color}30`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: r.color, fontFamily: "'Orbitron',sans-serif" }}>{r.label}</div>
                        <div style={{ fontSize: '0.6rem', color: '#8b949e', marginTop: 3 }}>{r.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {(() => {
                  const steps = [0, 1, 5, 10, 20, 50];
                  const labels = ['NOVATO', 'BRONCE', 'PLATA', 'ORO', 'ELITE', 'LEYENDA'];
                  const idx  = steps.findIndex((_, i) => titulos < (steps[i + 1] ?? Infinity));
                  const curr = steps[Math.max(idx, 0)];
                  const next = steps[Math.min(idx + 1, steps.length - 1)];
                  const pct  = next > curr ? Math.round(((titulos - curr) / (next - curr)) * 100) : 100;
                  return (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.72rem' }}>
                        <span style={{ color: '#8b949e' }}>TIER — <span style={{ color: badge.color }}>{badge.label}</span></span>
                        <span style={{ color: '#ffd700', fontWeight: 700 }}>{pct < 100 ? `${titulos}/${next} 🏆` : 'MÁXIMO'}</span>
                      </div>
                      <div style={{ height: 7, background: '#0b0e14', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: `linear-gradient(90deg,${badge.color},${badge.color}90)`, borderRadius: 10, transition: 'width 1s', boxShadow: `0 0 10px ${badge.glow}` }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                        {labels.map((l, i) => (
                          <div key={l} style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: titulos >= (steps[i] || 0) ? badge.color : '#30363d', margin: '0 auto 3px' }} />
                            <div style={{ fontSize: '0.5rem', color: titulos >= (steps[i] || 0) ? '#8b949e' : '#333', fontFamily: "'Orbitron',sans-serif" }}>{l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ══ TAB BILLETERA ══ */}
          {tab === 'billetera' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
                {[
                  { l: 'SALDO ACTUAL',     v: `🪙 ${coins.toLocaleString()}`,   c: '#00ff88' },
                  { l: 'GANADO REFERIDOS', v: `🪙 ${coinsRef.toLocaleString()}`, c: '#ffd700' },
                  { l: 'PARTIDOS JUGADOS', v: String(partidos),                  c: '#009ee3' },
                ].map(s => (
                  <div key={s.l} style={{ background: '#161b22', border: '1px solid #30363d', borderLeft: `3px solid ${s.c}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.3rem', fontWeight: 900, color: s.c }}>{s.v}</div>
                    <div style={{ color: '#8b949e', fontSize: '0.62rem', marginTop: 4, fontFamily: "'Orbitron',sans-serif" }}>{s.l}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #30363d', fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.8rem' }}>
                  📋 HISTORIAL DE MOVIMIENTOS
                </div>
                {txList.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>💰</div>
                    Sin movimientos todavía
                  </div>
                ) : (
                  txList.map(tx => (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1c2028' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{tx.descripcion}</div>
                        <div style={{ color: '#8b949e', fontSize: '0.68rem' }}>{tx.fecha?.toDate?.()?.toLocaleString() || '—'}</div>
                      </div>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.95rem', color: tx.tipo === 'entrada' ? '#00ff88' : '#ff4757', whiteSpace: 'nowrap' }}>
                        {tx.tipo === 'entrada' ? '+' : '-'}🪙{tx.monto.toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p style={{ color: '#8b949e', fontSize: '0.72rem', marginTop: 12 }}>Para cargar saldo o solicitar retiro, usá el botón <strong style={{ color: '#ffd700' }}>BILLETERA</strong> en el Hub.</p>
            </div>
          )}

          {/* ══ TAB REFERIDOS ══ */}
          {tab === 'referidos' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 12, marginBottom: 18 }}>
                {[
                  { l: 'AMIGOS INVITADOS', v: String(refCount),                  c: '#9146FF' },
                  { l: 'COINS GANADAS',    v: `🪙 ${coinsRef.toLocaleString()}`, c: '#ffd700' },
                  { l: 'GANÁS POR INVITE', v: '🪙 50',                           c: '#00ff88' },
                ].map(s => (
                  <div key={s.l} style={{ background: '#161b22', border: '1px solid #30363d', borderLeft: `3px solid ${s.c}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.4rem', fontWeight: 900, color: s.c }}>{s.v}</div>
                    <div style={{ color: '#8b949e', fontSize: '0.61rem', marginTop: 4, fontFamily: "'Orbitron',sans-serif" }}>{s.l}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'linear-gradient(135deg,#161b22,rgba(145,70,255,0.05))', border: '2px solid rgba(145,70,255,0.3)', borderRadius: 16, padding: 'clamp(16px,3vw,24px)', marginBottom: 16 }}>
                <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#9146FF', margin: '0 0 8px', fontSize: '0.85rem' }}>🤝 TU CÓDIGO DE REFERIDO</h3>
                <p style={{ color: '#8b949e', fontSize: '0.75rem', margin: '0 0 14px' }}>Cuando alguien se registra con tu link y <strong style={{ color: '#ffd700' }}>juega su primer torneo pago</strong>, vos ganás <strong style={{ color: '#00ff88' }}>🪙50 LFA Coins</strong> automáticamente.</p>
                <div style={{ background: '#0b0e14', border: '1px solid #9146FF40', borderRadius: 10, padding: '14px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ color: '#8b949e', fontSize: '0.62rem', fontFamily: "'Orbitron',sans-serif", marginBottom: 4 }}>CÓDIGO</div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.5rem', fontWeight: 900, color: '#9146FF', letterSpacing: 3 }}>{refCode}</div>
                  </div>
                  <div>
                    <div style={{ color: '#8b949e', fontSize: '0.62rem', fontFamily: "'Orbitron',sans-serif", marginBottom: 4 }}>LINK COMPLETO</div>
                    <div style={{ color: '#ccc', fontSize: '0.75rem', fontFamily: 'monospace' }}>somoslfa.com/?ref={refCode}</div>
                  </div>
                </div>
                <button className="pfbtn" onClick={copiarRef} style={{ ...btn('#9146FF', 'white'), width: '100%', justifyContent: 'center', padding: 12 }}>
                  📋 COPIAR LINK DE INVITACIÓN
                </button>
              </div>

              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: 'clamp(14px,3vw,20px)' }}>
                <h3 style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', margin: '0 0 14px', fontSize: '0.8rem' }}>📖 CÓMO FUNCIONA</h3>
                {[
                  { n: '1', t: 'Compartís tu link',              d: 'Envialo por WhatsApp, redes o donde quieras.' },
                  { n: '2', t: 'Tu amigo se registra',           d: 'Crea su cuenta en LFA con tu link.' },
                  { n: '3', t: 'Juega un torneo PAGO',           d: 'Debe entrar a un torneo con coins reales (no gratis).' },
                  { n: '4', t: '¡Ganás 🪙50 automáticamente!',  d: 'Se acreditan en tu billetera al instante.' },
                ].map(s => (
                  <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #1c2028' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(145,70,255,0.15)', border: '1px solid #9146FF40', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: '#9146FF', fontSize: '0.75rem', flexShrink: 0 }}>{s.n}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>{s.t}</div>
                      <div style={{ color: '#8b949e', fontSize: '0.72rem', marginTop: 2 }}>{s.d}</div>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ padding: '8px 12px', background: 'rgba(255,215,0,0.06)', border: '1px solid #ffd70030', borderRadius: 8, color: '#8b949e', fontSize: '0.72rem' }}>
                    💡 Sin límite de referidos — 10 amigos = 🪙500 coins (ya estás cerca del dólar)
                  </div>
                  <div style={{ padding: '10px 12px', background: 'rgba(255,71,87,0.06)', border: '1px solid #ff475730', borderRadius: 8 }}>
                    <div style={{ color: '#ff4757', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, marginBottom: 6 }}>⚠️ REGLAS ANTI-ABUSO</div>
                    <div style={{ color: '#8b949e', fontSize: '0.71rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span>🚫 Las coins de referido <strong style={{ color: '#ff4757' }}>NO son retirables</strong> — son solo para jugar torneos</span>
                      <span>🏆 Para habilitar retiros, debés participar en al menos <strong style={{ color: '#ffd700' }}>1 torneo pago</strong></span>
                      <span>🔍 Se detectan automáticamente cuentas duplicadas, IPs iguales y cuentas falsas</span>
                      <span>❌ Un referido = un bono. No se puede repetir con la misma cuenta</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
