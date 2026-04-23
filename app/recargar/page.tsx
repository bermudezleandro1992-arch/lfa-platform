'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { LfaCoin } from '@/app/_components/LfaCoin';

/* ─── Constantes ─────────────────────────────────────── */
// 1000 LFA Coins = 1 USDT
const RATE = 1000;
// Alias e ID de Binance Pay oficial LFA
const BINANCE_ALIAS = 'somoslfa';
const BINANCE_ID    = '359177674';

/* ─── Packs ──────────────────────────────────────────── */
const PACKS = [
  {
    id: 'starter', emoji: '🟢', label: 'STARTER',
    coins: 500,   bonus: 0,    usd: 0.50,
    color: '#00ff88', glow: 'rgba(0,255,136,0.25)',
    border: 'rgba(0,255,136,0.3)', bg: 'rgba(0,255,136,0.05)',
    badge: null, popular: false,
    desc: 'Para probar la plataforma',
  },
  {
    id: 'basic',   emoji: '🟢', label: 'BASIC',
    coins: 1000,  bonus: 0,    usd: 1.00,
    color: '#00ff88', glow: 'rgba(0,255,136,0.25)',
    border: 'rgba(0,255,136,0.3)', bg: 'rgba(0,255,136,0.05)',
    badge: null, popular: false,
    desc: 'Duelos y salas Standard',
  },
  {
    id: 'standard', emoji: '🟡', label: 'STANDARD',
    coins: 2000,  bonus: 200,   usd: 2.00,
    color: '#ffd700', glow: 'rgba(255,215,0,0.25)',
    border: 'rgba(255,215,0,0.35)', bg: 'rgba(255,215,0,0.06)',
    badge: '+10%', popular: false,
    desc: 'Gran LFA Pro',
  },
  {
    id: 'popular',  emoji: '🟡', label: 'POPULAR',
    coins: 3000,  bonus: 450,  usd: 3.00,
    color: '#ffd700', glow: 'rgba(255,215,0,0.3)',
    border: 'rgba(255,215,0,0.4)', bg: 'rgba(255,215,0,0.07)',
    badge: '+15%', popular: true,
    desc: 'Salas Standard Pro',
  },
  {
    id: 'pro',      emoji: '🔴', label: 'PRO',
    coins: 5000,  bonus: 1000,  usd: 5.00,
    color: '#ff4757', glow: 'rgba(255,71,87,0.25)',
    border: 'rgba(255,71,87,0.35)', bg: 'rgba(255,71,87,0.06)',
    badge: '+20%', popular: false,
    desc: 'Salas Elite',
  },
  {
    id: 'vip',      emoji: '🔴', label: 'VIP',
    coins: 10000, bonus: 2500,  usd: 10.00,
    color: '#ff4757', glow: 'rgba(255,71,87,0.3)',
    border: 'rgba(255,71,87,0.4)', bg: 'rgba(255,71,87,0.07)',
    badge: '+25%', popular: false,
    desc: 'Multi-torneos Elite',
  },
  {
    id: 'elite',    emoji: '👑', label: 'ELITE',
    coins: 25000, bonus: 7500, usd: 25.00,
    color: '#9146FF', glow: 'rgba(145,70,255,0.35)',
    border: 'rgba(145,70,255,0.45)', bg: 'rgba(145,70,255,0.08)',
    badge: '+30%', popular: false,
    desc: 'Jugadores Pro de LATAM',
  },
] as const;

type PackId = typeof PACKS[number]['id'];

/* ─── Tipos ──────────────────────────────────────────── */
interface UserSnap { nombre?: string; number?: number; }

/* ─── Helpers ─────────────────────────────────────────── */
function Spinner() {
  return (
    <>
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0b0e14' }}>
        <div style={{ width: 42, height: 42, border: '3px solid #ffd700', borderTopColor: 'transparent', borderRadius: '50%', animation: 'sp .8s linear infinite' }} />
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════ */
export default function RecargarPage() {
  const router = useRouter();

  const [uid,         setUid]         = useState('');
  const [userData,    setUserData]    = useState<UserSnap | null>(null);
  const [ready,       setReady]       = useState(false);
  const [selected,    setSelected]    = useState<PackId | null>(null);
  const [txHash,      setTxHash]      = useState('');
  const [refId,       setRefId]       = useState('');
  const [senderWallet,setSenderWallet]= useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [sending,     setSending]     = useState(false);
  const [msg,         setMsg]         = useState('');
  const [copied,      setCopied]      = useState<'alias'|''>('');

  const pack     = PACKS.find(p => p.id === selected) ?? null;
  const totalCoins = pack ? pack.coins + pack.bonus : 0;
  const coins    = userData?.number ?? 0;

  /* ── Auth ────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace('/'); return; }
      setUid(user.uid);
      setReady(true);
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'usuarios', uid), (snap) => {
      if (snap.exists()) setUserData(snap.data() as UserSnap);
    });
    return unsub;
  }, [uid]);

  /* ── Copiar ──────────────────────────────────────── */
  const copiar = (text: string, key: 'alias') => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  /* ── Enviar solicitud ────────────────────────────── */
  const enviar = useCallback(async () => {
    setMsg('');
    if (!pack)                return setMsg('❌ Seleccioná un pack primero');
    if (!txHash.trim())       return setMsg('❌ Ingresá el TX Hash / ID de referencia de tu pago');
    if (!senderWallet.trim()) return setMsg('❌ Ingresá tu ID o dirección Binance de origen');
    if (!comprobante)         return setMsg('❌ Adjuntá el comprobante (captura de pantalla del pago)');

    const ALLOWED = ['image/jpeg','image/png','image/webp'];
    if (!ALLOWED.includes(comprobante.type)) return setMsg('❌ El comprobante debe ser JPG, PNG o WebP.');
    if (comprobante.size > 5 * 1024 * 1024)  return setMsg('❌ El comprobante no puede superar 5 MB.');

    setSending(true);
    try {
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const { storage } = await import('@/lib/firebase');
      const storageRef = ref(storage, `comprobantes/${uid}/${Date.now()}_${comprobante.name.replace(/[^a-z0-9.]/gi,'_')}`);
      await uploadBytes(storageRef, comprobante, { contentType: comprobante.type });
      const comprobante_url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'pagos_pendientes'), {
        uid,
        jugador_nombre:  userData?.nombre || '',
        coins:           pack.coins,
        bonus:           pack.bonus,
        coins_total:     totalCoins,
        usd:             pack.usd,
        pack_id:         pack.id,
        pack_label:      pack.label,
        metodo:          'Binance Pay',
        tx_hash:         txHash.trim(),
        referencia_id:   refId.trim(),
        sender_id:       senderWallet.trim(),
        comprobante_url,
        estado:          'pendiente',
        fecha:           serverTimestamp(),
      });
      setMsg(`✅ ¡Solicitud enviada! Verificaremos tu pago de $${pack.usd} USDT en hasta 24 hs. Al aprobar recibirás 🪙${totalCoins.toLocaleString()} coins.`);
      setTxHash(''); setRefId(''); setSenderWallet(''); setSelected(null); setComprobante(null);
    } catch {
      setMsg('❌ Error al enviar la solicitud. Intentá de nuevo.');
    }
    setSending(false);
  }, [pack, uid, userData, txHash, refId, senderWallet, comprobante, totalCoins]);

  if (!ready || !userData) return <Spinner />;

  return (
    <>
      <style>{`
        @keyframes sp  { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        .packcard { transition: all .2s ease; cursor: pointer; }
        .packcard:hover { transform: translateY(-3px); }
        .subbtn:hover { opacity: .88 !important; }
        .copybtn:hover { opacity: .8 !important; }
        input::placeholder { color: #444; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
      `}</style>

      <div style={{ background: '#0b0e14', minHeight: '100vh', color: 'white', fontFamily: "'Roboto',sans-serif" }}>

        {/* ── HEADER ───────────────────────────────── */}
        <header style={{ background: 'rgba(7,9,13,0.97)', borderBottom: '1px solid #30363d', padding: '13px 5%', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap' }}>
          <button onClick={() => router.back()} style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem' }}>
            ← VOLVER
          </button>
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.85rem', color: '#f3ba2f', fontWeight: 900 }}>
            ⚡ RECARGAR LFA COINS
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Orbitron',sans-serif", fontSize: '0.82rem', color: '#ffd700', fontWeight: 900 }}>
            <LfaCoin size={20} />
            {coins.toLocaleString()}
          </div>
        </header>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,24px) 80px' }}>

          {/* ── HERO ─────────────────────────────────── */}
          <div style={{ textAlign: 'center', marginBottom: 32, animation: 'fadeUp .35s ease' }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.6rem,5vw,2.6rem)', fontWeight: 900, background: 'linear-gradient(90deg,#f3ba2f,#ffd700,#f3ba2f)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'shimmer 3s linear infinite' }}>
              CARGÁ TUS COINS
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.82rem', marginTop: 8 }}>
              1.000 LFA Coins = <strong style={{ color: '#f3ba2f' }}>1 USDT</strong> · Pago vía Binance Pay · Acreditación en hasta 24 hs
            </div>
          </div>

          {/* ── SELECTOR DE PACKS ────────────────────── */}
          <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#8b949e', fontSize: '0.68rem', letterSpacing: 2, marginBottom: 14 }}>
            ELEGÍ TU PACK
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%,230px), 1fr))', gap: 12, marginBottom: 32 }}>
            {PACKS.map(p => {
              const isSelected = selected === p.id;
              return (
                <div
                  key={p.id}
                  className="packcard"
                  onClick={() => { setSelected(isSelected ? null : p.id); setMsg(''); }}
                  style={{
                    background:  isSelected ? p.bg : '#161b22',
                    border:      `2px solid ${isSelected ? p.color : '#30363d'}`,
                    borderTop:   `3px solid ${isSelected ? p.color : '#30363d'}`,
                    borderRadius: 16,
                    padding:     'clamp(16px,3vw,22px) clamp(14px,2vw,18px)',
                    position:    'relative',
                    overflow:    'hidden',
                    boxShadow:   isSelected ? `0 0 24px ${p.glow}` : 'none',
                    transform:   isSelected ? 'translateY(-3px)' : 'none',
                  }}
                >
                  {/* Badge POPULAR */}
                  {p.popular && (
                    <div style={{ position: 'absolute', top: 10, right: 10, background: '#ffd700', color: '#0b0e14', fontFamily: "'Orbitron',sans-serif", fontSize: '0.55rem', fontWeight: 900, padding: '3px 8px', borderRadius: 20 }}>
                      ⭐ POPULAR
                    </div>
                  )}
                  {/* Bonus badge */}
                  {p.bonus > 0 && !p.popular && (
                    <div style={{ position: 'absolute', top: 10, right: 10, background: `${p.color}20`, border: `1px solid ${p.color}50`, color: p.color, fontFamily: "'Orbitron',sans-serif", fontSize: '0.52rem', fontWeight: 900, padding: '2px 7px', borderRadius: 20 }}>
                      {p.badge}
                    </div>
                  )}

                  {/* Emoji + Label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: '1.3rem' }}>{p.emoji}</span>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.82rem', color: p.color }}>
                      {p.label}
                    </div>
                  </div>

                  {/* Coins */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, color: 'white', lineHeight: 1, marginBottom: 4 }}>
                    <LfaCoin size={28} glow={isSelected} />
                    {p.coins.toLocaleString()}
                  </div>
                  {p.bonus > 0 && (
                    <div style={{ color: p.color, fontSize: '0.72rem', fontWeight: 700, marginBottom: 4 }}>
                      + {p.bonus.toLocaleString()} bonus = <strong>{(p.coins + p.bonus).toLocaleString()} total</strong>
                    </div>
                  )}

                  {/* USD */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid #30363d' }}>
                    <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>{p.desc}</div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.1rem', fontWeight: 900, color: p.color }}>
                      ${p.usd.toFixed(2)}
                    </div>
                  </div>

                  {/* Selected check */}
                  {isSelected && (
                    <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: p.color, color: '#0b0e14', fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', fontWeight: 900, padding: '3px 12px', borderRadius: 20 }}>
                      ✓ SELECCIONADO
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── PANEL DE PAGO (visible al seleccionar) ─ */}
          {pack && (
            <div style={{ animation: 'fadeUp .3s ease', marginBottom: 32 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#8b949e', fontSize: '0.68rem', letterSpacing: 2, marginBottom: 14 }}>
                INSTRUCCIONES DE PAGO
              </div>

              {/* Resumen del pack seleccionado */}
              <div style={{ background: `linear-gradient(135deg,#161b22,${pack.bg})`, border: `2px solid ${pack.border}`, borderRadius: 16, padding: 'clamp(16px,3vw,22px)', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, boxShadow: `0 0 20px ${pack.glow}` }}>
                <div>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', color: '#8b949e', marginBottom: 4 }}>PACK SELECCIONADO</div>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.1rem', fontWeight: 900, color: pack.color }}>{pack.emoji} {pack.label}</div>
                  <div style={{ color: 'white', fontSize: '0.82rem', marginTop: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <LfaCoin size={15} /> {pack.coins.toLocaleString()}
                    </span>
                    {pack.bonus > 0 && <span style={{ color: pack.color }}> + {pack.bonus.toLocaleString()} bonus</span>}
                    {pack.bonus > 0 && <strong style={{ color: pack.color }}> = {totalCoins.toLocaleString()} COINS</strong>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', color: '#8b949e', marginBottom: 4 }}>A PAGAR</div>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '2rem', fontWeight: 900, color: pack.color, textShadow: `0 0 20px ${pack.glow}` }}>
                    ${pack.usd.toFixed(2)}
                  </div>
                  <div style={{ color: '#8b949e', fontSize: '0.7rem' }}>USDT · Binance Pay</div>
                </div>
              </div>

              {/* Grid: QR + Instrucciones */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,300px), 1fr))', gap: 16, marginBottom: 18 }}>

                {/* QR Binance */}
                <div style={{ background: '#161b22', border: '1px solid rgba(243,186,47,0.25)', borderRadius: 16, padding: 'clamp(16px,3vw,22px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#f3ba2f', fontSize: '0.75rem', fontWeight: 900 }}>
                    ₿ BINANCE PAY — LFA OFICIAL
                  </div>

                  {/* QR real — guardá el QR de Binance en public/assets/binance-qr.png */}
                  <img
                    src="/assets/binance-qr.png"
                    width={170}
                    height={170}
                    alt="QR Binance Pay LFA"
                    style={{ borderRadius: 14, border: '2px solid rgba(243,186,47,0.4)', background: 'white', padding: 6 }}
                    onError={(e) => {
                      const el = e.currentTarget;
                      el.style.display = 'none';
                      (el.nextElementSibling as HTMLElement | null)?.style.setProperty('display','flex');
                    }}
                  />
                  {/* Fallback si no existe aún la imagen */}
                  <div style={{ display: 'none', width: 170, height: 170, background: '#0b0e14', border: '2px solid rgba(243,186,47,0.3)', borderRadius: 14, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ fontSize: '3rem' }}>₿</span>
                    <span style={{ color: '#8b949e', fontSize: '0.62rem', textAlign: 'center', padding: '0 12px' }}>QR no encontrado — guardá binance-qr.png en public/assets/</span>
                  </div>

                  <div style={{ width: '100%' }}>
                    <div style={{ color: '#8b949e', fontSize: '0.62rem', fontFamily: "'Orbitron',sans-serif", marginBottom: 5 }}>ALIAS BINANCE PAY</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0b0e14', border: '1px solid rgba(243,186,47,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                      <code style={{ flex: 1, color: '#f3ba2f', fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 700 }}>{BINANCE_ALIAS}</code>
                      <button className="copybtn" onClick={() => copiar(BINANCE_ALIAS, 'alias')} style={{ background: copied === 'alias' ? 'rgba(0,255,136,0.15)' : 'rgba(243,186,47,0.1)', border: `1px solid ${copied === 'alias' ? 'rgba(0,255,136,0.4)' : 'rgba(243,186,47,0.3)'}`, color: copied === 'alias' ? '#00ff88' : '#f3ba2f', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', transition: '0.2s', whiteSpace: 'nowrap' }}>
                        {copied === 'alias' ? '✓ OK' : '📋'}
                      </button>
                    </div>
                    <div style={{ color: '#8b949e', fontSize: '0.62rem' }}>ID Binance: <span style={{ color: '#8b949e', fontFamily: 'monospace' }}>{BINANCE_ID}</span></div>
                  </div>

                  <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 10, padding: '9px 12px', fontSize: '0.68rem', color: '#00ff88', textAlign: 'center', lineHeight: 1.5 }}>
                    ✅ Binance Pay selecciona la red automáticamente — no hay riesgo de equivocarse con TRC20 / BEP20
                  </div>
                </div>

                {/* Pasos */}
                <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: 'clamp(16px,3vw,22px)' }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.75rem', fontWeight: 900, marginBottom: 14 }}>
                    📋 PASOS A SEGUIR
                  </div>
                  {[
                    { n: '1', t: 'Abrí Binance → Pay', d: 'Tocá "Enviar" → buscá el alias somoslfa (ID 359177674), o escaneá el QR.' },
                    { n: '2', t: `Enviá $${pack.usd.toFixed(2)} USDT`, d: 'Ingresá el monto exacto. Binance Pay gestiona la red automáticamente.' },
                    { n: '3', t: 'Copiá el ID de orden', d: 'En Binance: Historial de Pay → la transacción → copiá el "ID de referencia".' },
                    { n: '4', t: 'Completá el formulario', d: 'Pegá el ID de orden y tu alias/email Binance abajo y enviá.' },
                    { n: '5', t: 'Verificación LFA', d: `El equipo acredita 🪙${totalCoins.toLocaleString()} en tu cuenta en hasta 24 hs.` },
                  ].map(s => (
                    <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid #1c2028' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(243,186,47,0.12)', border: '1px solid rgba(243,186,47,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#f3ba2f', fontSize: '0.65rem', flexShrink: 0 }}>{s.n}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.78rem' }}>{s.t}</div>
                        <div style={{ color: '#8b949e', fontSize: '0.68rem', marginTop: 2 }}>{s.d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Formulario TX */}
              <div style={{ background: '#161b22', border: `1px solid ${pack.border}`, borderRadius: 16, padding: 'clamp(16px,3vw,22px)' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.78rem', fontWeight: 900, marginBottom: 16 }}>
                  📝 CONFIRMAR PAGO
                </div>

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.7rem', fontWeight: 700, marginBottom: 6 }}>ID DE REFERENCIA — ORDEN DE PAGO BINANCE PAY</label>
                <input
                  style={{ width: '100%', padding: '11px 14px', background: '#0b0e14', border: '1px solid #30363d', color: 'white', borderRadius: 10, outline: 'none', fontFamily: 'monospace', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: 6 }}
                  type="text"
                  placeholder="El ID de referencia que te muestra Binance Pay..."
                  value={txHash}
                  onChange={e => setTxHash(e.target.value)}
                />
                <div style={{ color: '#8b949e', fontSize: '0.65rem', marginBottom: 14 }}>Binance → Pay → Historial → la transacción → "ID de referencia"</div>

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.7rem', fontWeight: 700, marginBottom: 6 }}>TX HASH (OPCIONAL — si pagaste por blockchain)</label>
                <input
                  style={{ width: '100%', padding: '11px 14px', background: '#0b0e14', border: '1px solid #30363d', color: 'white', borderRadius: 10, outline: 'none', fontFamily: 'monospace', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: 14 }}
                  type="text"
                  placeholder="0x... o TXID de la red blockchain"
                  value={refId}
                  onChange={e => setRefId(e.target.value)}
                />

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.7rem', fontWeight: 700, marginBottom: 6 }}>TU ALIAS O EMAIL DE BINANCE (para identificarte)</label>
                <input
                  style={{ width: '100%', padding: '11px 14px', background: '#0b0e14', border: '1px solid #30363d', color: 'white', borderRadius: 10, outline: 'none', fontFamily: 'monospace', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: 14 }}
                  type="text"
                  placeholder="tu-alias-Binance o email@ejemplo.com"
                  value={senderWallet}
                  onChange={e => setSenderWallet(e.target.value)}
                />

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.7rem', fontWeight: 700, marginBottom: 6 }}>
                  📸 COMPROBANTE DE PAGO <span style={{ color: '#ff4757' }}>*OBLIGATORIO*</span>
                </label>
                <label style={{ display: 'block', cursor: 'pointer' }}>
                  <div style={{ width: '100%', padding: '14px', background: comprobante ? 'rgba(0,255,136,0.06)' : '#0b0e14', border: `2px dashed ${comprobante ? '#00ff88' : '#30363d'}`, borderRadius: 10, textAlign: 'center', color: comprobante ? '#00ff88' : '#8b949e', fontSize: '0.8rem', boxSizing: 'border-box', marginBottom: 6, transition: '0.2s' }}>
                    {comprobante
                      ? `✅ ${comprobante.name} (${(comprobante.size/1024).toFixed(0)} KB)`
                      : '📁 Hacé clic para subir captura de pantalla del pago'}
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={e => setComprobante(e.target.files?.[0] ?? null)}
                  />
                </label>
                <div style={{ color: '#8b949e', fontSize: '0.65rem', marginBottom: 18 }}>Captura de pantalla de Binance Pay mostrando el pago enviado. JPG, PNG o WebP. Máx 5 MB.</div>

                {msg && (
                  <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 14, background: msg.startsWith('✅') ? 'rgba(0,255,136,0.08)' : 'rgba(255,71,87,0.08)', border: `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,0.3)' : 'rgba(255,71,87,0.3)'}`, color: msg.startsWith('✅') ? '#00ff88' : '#ff4757', fontSize: '0.8rem' }}>
                    {msg}
                  </div>
                )}

                <button
                  className="subbtn"
                  onClick={enviar}
                  disabled={sending}
                  style={{ width: '100%', padding: '15px', background: sending ? '#30363d' : pack.color, color: ['#00ff88','#ffd700','#f3ba2f'].includes(pack.color) ? '#0b0e14' : 'white', border: 'none', borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.88rem', cursor: sending ? 'not-allowed' : 'pointer', transition: '0.2s', opacity: sending ? 0.6 : 1, letterSpacing: 0.5 }}
                >
                  {sending ? '⏳ ENVIANDO...' : `⚡ CONFIRMAR — 🪙${totalCoins.toLocaleString()} COINS POR $${pack.usd.toFixed(2)}`}
                </button>
              </div>
            </div>
          )}

          {/* ── TABLA INFORMATIVA ────────────────────── */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid #30363d', fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.8rem' }}>
              📊 TODOS LOS PACKS
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 480 }}>
                <thead>
                  <tr>{['PACK','COINS','BONUS','TOTAL','PRECIO'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#8b949e', fontFamily: "'Orbitron',sans-serif", fontSize: '0.6rem', borderBottom: '1px solid #30363d', background: 'rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {PACKS.map(p => (
                    <tr key={p.id} onClick={() => { setSelected(p.id); setMsg(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ cursor: 'pointer', background: selected === p.id ? `${p.bg}` : 'transparent', transition: '0.15s' }}>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #1c2028' }}>
                        <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: p.color }}>{p.emoji} {p.label}</span>
                        {p.popular && <span style={{ marginLeft: 6, background: '#ffd700', color: '#0b0e14', fontSize: '0.5rem', padding: '2px 6px', borderRadius: 20, fontWeight: 900 }}>POPULAR</span>}
                      </td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #1c2028', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LfaCoin size={13} /> {p.coins.toLocaleString()}</span>
                      </td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #1c2028', color: p.bonus > 0 ? p.color : '#8b949e' }}>{p.bonus > 0 ? `+${p.bonus.toLocaleString()} 🎁` : '—'}</td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #1c2028', color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontWeight: 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LfaCoin size={13} /> {(p.coins + p.bonus).toLocaleString()}</span>
                      </td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #1c2028', color: p.color, fontFamily: "'Orbitron',sans-serif", fontWeight: 900 }}>${p.usd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── NOTA LEGAL ───────────────────────────── */}
          <div style={{ background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.15)', borderRadius: 12, padding: '14px 18px', fontSize: '0.72rem', color: '#8b949e', lineHeight: 1.6 }}>
            ℹ️ Las LFA Coins son moneda virtual de la plataforma SomosLFA destinadas exclusivamente a torneos de eSports. No constituyen moneda de curso legal. Los pagos se verifican en hasta 24 hs. Retiro mínimo: 2.000 Coins (2 USDT). Consultá los <a href="/terminos" style={{ color: '#009ee3' }}>Términos y Condiciones</a> y el <a href="/reglamento" style={{ color: '#009ee3' }}>Reglamento</a>.
          </div>

        </div>
      </div>
    </>
  );
}
