'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc, onSnapshot, collection, addDoc,
  query, where, orderBy, limit, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { LfaCoin } from '@/app/_components/LfaCoin';

/* ─── Constantes ────────────────────────────────────── */
// 1000 LFA Coins = 1 USDT
const RATE        = 1000;         // coins por 1 USDT
const MIN_DEPOSIT = 500;          // coins mínimo para depositar
const MIN_RETIRO  = 10000;        // coins mínimo para retirar (10 USDT)
const FP_BLOQUEO  = 15;           // Fair Play mínimo para retirar (solo jugadores con muchos reportes)
const BINANCE_ID  = 'somoslfa';   // ← Alias Binance Pay oficial LFA

/* ─── Tipos ─────────────────────────────────────────── */
interface Tx {
  id: string;
  tipo: 'entrada' | 'salida' | 'pendiente';
  monto: number;
  descripcion: string;
  estado?: string;
  fecha?: { toDate?: () => Date };
}
interface UserSnap {
  nombre?: string;
  number?: number;
  fair_play?: number;
}

/* ─── Helpers ────────────────────────────────────────── */
const inp: React.CSSProperties = {
  width: '100%', padding: '11px 14px',
  background: '#0b0e14', border: '1px solid #30363d',
  color: 'white', borderRadius: 10, outline: 'none',
  fontFamily: "'Roboto',sans-serif", fontSize: '0.9rem',
  boxSizing: 'border-box',
};
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
/* ─── Reserva de cupo: banner con countdown ──────────── */
function ReservaBanner() {
  const router = useRouter();
  const params = useSearchParams();
  const torneo  = params.get('torneo');
  const falta   = Number(params.get('falta') ?? 0);
  const expira  = params.get('expira');
  const [secsLeft, setSecsLeft] = useState(0);

  useEffect(() => {
    if (!expira) return;
    const calc = () => Math.max(0, Math.floor((new Date(expira).getTime() - Date.now()) / 1000));
    setSecsLeft(calc());
    const id = setInterval(() => setSecsLeft(calc()), 1000);
    return () => clearInterval(id);
  }, [expira]);

  if (!torneo || secsLeft <= 0) return null;
  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  return (
    <div style={{ background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.4)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <p style={{ color: '#ffa500', fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 2, margin: 0 }}>⏱ CUPO RESERVADO</p>
        <p style={{ color: '#ccc', fontSize: '0.8rem', margin: '4px 0 0' }}>
          Torneo: <strong style={{ color: 'white' }}>{torneo}</strong> — Te faltan <strong style={{ color: 'white' }}>{falta.toLocaleString()} LFC</strong>
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: secsLeft < 60 ? '#ff4757' : '#ffa500', fontWeight: 900, fontSize: '1.2rem', fontVariantNumeric: 'tabular-nums' }}>
          {mins}:{String(secs).padStart(2, '0')}
        </span>
        <button onClick={() => router.back()} style={{ background: '#ffa500', color: '#0b0e14', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', textTransform: 'uppercase' }}>
          ← VOLVER AL TORNEO
        </button>
      </div>
    </div>
  );
}

export default function BilleteraPage() {
  const router = useRouter();

  const [uid,       setUid]       = useState('');
  const [userData,  setUserData]  = useState<UserSnap | null>(null);
  const [txList,    setTxList]    = useState<Tx[]>([]);
  const [tab,       setTab]       = useState<'depositar' | 'retirar' | 'historial'>('depositar');
  const [ready,     setReady]     = useState(false);
  const [sending,   setSending]   = useState(false);
  const [msg,       setMsg]       = useState('');

  /* Depósito */
  const [depCoins,  setDepCoins]  = useState('');
  const [txHash,    setTxHash]    = useState('');
  const [senderWallet, setSenderWallet] = useState('');

  /* Retiro */
  const [retCoins,  setRetCoins]  = useState('');
  const [wallet,    setWallet]    = useState('');
  const [redWallet, setRedWallet] = useState<'TRC20' | 'BEP20'>('TRC20');

  const coins     = userData?.number  ?? 0;
  const fairPlay  = userData?.fair_play ?? 100;
  const depNum    = parseInt(depCoins)  || 0;
  const retNum    = parseInt(retCoins)  || 0;
  const depUsd    = (depNum / RATE).toFixed(2);
  const retUsd    = (retNum / RATE).toFixed(2);

  /* ── Auth + live balance ─────────────────────────── */
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

  /* ── Historial ───────────────────────────────────── */
  useEffect(() => {
    if (!uid || tab !== 'historial') return;
    const fetch = async () => {
      const list: Tx[] = [];
      try {
        const s = await getDocs(query(collection(db, 'pagos_pendientes'), where('uid', '==', uid), orderBy('fecha', 'desc'), limit(30)));
        s.forEach(d => {
          const data = d.data();
          list.push({
            id: d.id, tipo: data.estado === 'aprobado' ? 'entrada' : 'pendiente',
            monto: data.coins || 0,
            descripcion: data.estado === 'aprobado' ? '💳 Depósito aprobado (Binance)' : data.estado === 'rechazado' ? '❌ Depósito rechazado' : '⏳ Depósito en revisión',
            estado: data.estado,
            fecha: data.fecha,
          });
        });
      } catch { /* índice pendiente */ }
      try {
        const s = await getDocs(query(collection(db, 'retiros'), where('uid', '==', uid), orderBy('fecha', 'desc'), limit(30)));
        s.forEach(d => {
          const data = d.data();
          list.push({
            id: d.id,
            tipo: data.estado === 'completado' ? 'salida' : 'pendiente',
            monto: data.montoCoins || 0,
            descripcion: data.estado === 'completado' ? '💸 Retiro pagado' : data.estado === 'rechazado' ? '↩ Retiro devuelto' : '⏳ Retiro en proceso',
            estado: data.estado,
            fecha: data.fecha,
          });
        });
      } catch { /* ok */ }
      try {
        const s = await getDocs(query(collection(db, 'transactions'), where('uid', '==', uid), orderBy('fecha', 'desc'), limit(20)));
        s.forEach(d => list.push({ id: d.id, ...d.data() } as Tx));
      } catch { /* ok */ }
      list.sort((a, b) => (b.fecha?.toDate?.()?.getTime() || 0) - (a.fecha?.toDate?.()?.getTime() || 0));
      setTxList(list);
    };
    fetch();
  }, [uid, tab]);

  /* ── Enviar depósito ─────────────────────────────── */
  const enviarDeposito = useCallback(async () => {
    setMsg('');
    if (depNum < MIN_DEPOSIT)  return setMsg(`❌ Mínimo ${MIN_DEPOSIT} coins ($${(MIN_DEPOSIT/RATE).toFixed(2)} USDT)`);
    if (!txHash.trim())        return setMsg('❌ Ingresá el TX Hash de la transacción');
    if (!senderWallet.trim())  return setMsg('❌ Ingresá tu dirección de billetera Binance');
    setSending(true);
    try {
      await addDoc(collection(db, 'pagos_pendientes'), {
        uid,
        jugador_nombre: userData?.nombre || '',
        coins: depNum,
        usd: parseFloat(depUsd),
        metodo: 'Binance USDT',
        tx_hash: txHash.trim(),
        sender_wallet: senderWallet.trim(),
        estado: 'pendiente',
        fecha: serverTimestamp(),
      });
      setMsg('✅ Solicitud enviada. El equipo LFA verificará tu depósito en hasta 24 h.');
      setDepCoins(''); setTxHash(''); setSenderWallet('');
    } catch { setMsg('❌ Error al enviar. Intentá de nuevo.'); }
    setSending(false);
  }, [uid, userData, depNum, depUsd, txHash, senderWallet]);

  /* ── Enviar retiro (automático vía Binance API) ──── */
  const enviarRetiro = useCallback(async () => {
    setMsg('');
    if (retNum < MIN_RETIRO)   return setMsg(`❌ Mínimo ${MIN_RETIRO.toLocaleString()} coins ($${(MIN_RETIRO/RATE).toFixed(0)} USDT) para retirar`);
    if (retNum > coins)        return setMsg('❌ Saldo insuficiente');
    if (fairPlay < FP_BLOQUEO) return setMsg(`❌ Fair Play muy bajo (${fairPlay}%). Jugá torneos limpios para recuperarlo y desbloquear retiros.`);
    if (!wallet.trim())        return setMsg('❌ Ingresá tu dirección de billetera Binance');
    setSending(true);
    try {
      const token = await import('firebase/auth').then(m => m.getIdToken(m.getAuth().currentUser!));
      const res = await fetch('/api/retiro', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ montoCoins: retNum, wallet: wallet.trim(), network: redWallet === 'TRC20' ? 'TRX' : 'BSC' }),
      });
      const data = await res.json() as { ok?: boolean; auto?: boolean; message?: string; error?: string };
      if (!res.ok || data.error) {
        setMsg(`❌ ${data.error ?? 'Error al procesar el retiro.'}`);
      } else {
        setMsg(data.message ?? '✅ Retiro procesado.');
        setRetCoins('');
        setWallet('');
      }
    } catch { setMsg('❌ Error de conexión. Intentá de nuevo.'); }
    setSending(false);
  }, [uid, retNum, coins, fairPlay, wallet, redWallet]);

  /* ── Render ──────────────────────────────────────── */
  if (!ready || !userData) return <Spinner />;

  const TABS = [
    { id: 'depositar'  as const, label: '⬇️ DEPOSITAR'  },
    { id: 'retirar'    as const, label: '⬆️ RETIRAR'    },
    { id: 'historial'  as const, label: '📋 HISTORIAL'  },
  ];

  return (
    <>
      <style>{`
        @keyframes sp{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .bltab:hover{background:rgba(255,215,0,0.07)!important}
        .copybtn:hover{background:rgba(243,186,47,0.15)!important}
        .subbtn:hover{opacity:0.85!important}
        input::placeholder{color:#555}
      `}</style>

      <div style={{ background: '#0b0e14', minHeight: '100vh', color: 'white', fontFamily: "'Roboto',sans-serif" }}>

        {/* ── HEADER ─────────────────────────────────── */}
        <header style={{ background: 'rgba(7,9,13,0.97)', borderBottom: '1px solid #30363d', padding: '13px 5%', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap' }}>
          <button onClick={() => router.back()} style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem' }}>
            ← VOLVER
          </button>
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.85rem', color: '#ffd700', fontWeight: 900 }}>
            💰 BILLETERA LFA
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: "'Orbitron',sans-serif", fontSize: '0.85rem', color: '#ffd700', fontWeight: 900 }}>
            <LfaCoin size={20} />
            {coins.toLocaleString()}
          </div>
        </header>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,24px) 80px' }}>

          {/* ── BANNER CUPO RESERVADO ─────────────────── */}
          <Suspense fallback={null}>
            <ReservaBanner />
          </Suspense>

          {/* ── BALANCE CARD ──────────────────────────── */}
          <div style={{ background: 'linear-gradient(135deg,#161b22,#0d1117)', border: '2px solid rgba(255,215,0,0.3)', borderRadius: 20, padding: 'clamp(20px,4vw,32px)', marginBottom: 18, textAlign: 'center', position: 'relative', overflow: 'hidden', animation: 'fadeUp .35s ease' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%,rgba(255,215,0,0.07),transparent 65%)', pointerEvents: 'none' }} />
            <div style={{ color: '#8b949e', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', letterSpacing: 2, marginBottom: 8 }}>SALDO DISPONIBLE</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(2.4rem,8vw,3.6rem)', fontWeight: 900, color: '#ffd700', lineHeight: 1, textShadow: '0 0 30px rgba(255,215,0,0.4)' }}>
              <LfaCoin size={52} glow />
              {coins.toLocaleString()}
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.82rem', marginTop: 8 }}>
              ≈ <strong style={{ color: '#f3ba2f' }}>${(coins / RATE).toFixed(2)} USDT</strong>
            </div>
            {fairPlay < FP_BLOQUEO && (
              <div style={{ marginTop: 14, background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 10, padding: '8px 14px', fontSize: '0.75rem', color: '#ff4757' }}>
                🚨 Fair Play muy bajo ({fairPlay}%) — Retiros suspendidos. Jugá torneos limpios para recuperarlo.
              </div>
            )}
            {fairPlay >= FP_BLOQUEO && fairPlay < 60 && (
              <div style={{ marginTop: 14, background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.25)', borderRadius: 10, padding: '8px 14px', fontSize: '0.75rem', color: '#ffa500' }}>
                ⚠️ Fair Play ({fairPlay}%) — Podés jugar y retirar. Mejorá tu puntuación participando limpio.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', color: '#8b949e', marginBottom: 2 }}>TASA HOY</div>
                <div style={{ color: '#f3ba2f', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 5 }}>1 USDT = {RATE} <LfaCoin size={14} /></div>
              </div>
              <div style={{ width: 1, background: '#30363d' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', color: '#8b949e', marginBottom: 2 }}>FAIR PLAY</div>
                  <div style={{ color: fairPlay >= 60 ? '#00ff88' : fairPlay >= FP_BLOQUEO ? '#ffa500' : '#ff4757', fontWeight: 700, fontSize: '0.82rem' }}>⚖️ {fairPlay}%</div>
              </div>
            </div>
          </div>

          {/* ── BOTÓN RECARGAR ─────────────────────── */}
          <a href="/recargar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(90deg,rgba(243,186,47,0.15),rgba(243,186,47,0.08))', border: '2px solid rgba(243,186,47,0.4)', borderRadius: 14, padding: '13px', marginBottom: 22, textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.82rem', color: '#f3ba2f', letterSpacing: 0.5, transition: '0.2s' }}>
            ⚡ RECARGAR COINS — Ver Packs y Precios
          </a>

          {/* ── TABS ──────────────────────────────────── */}
          <div style={{ display: 'flex', background: '#161b22', border: '1px solid #30363d', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
            {TABS.map(t => (
              <button key={t.id} className="bltab" onClick={() => { setTab(t.id); setMsg(''); }} style={{
                flex: 1, padding: '13px 8px',
                background: tab === t.id ? 'rgba(255,215,0,0.08)' : 'transparent',
                borderRight: '1px solid #30363d',
                borderTop: tab === t.id ? '2px solid #ffd700' : '2px solid transparent',
                color: tab === t.id ? '#ffd700' : '#8b949e',
                cursor: 'pointer', fontFamily: "'Orbitron',sans-serif",
                fontSize: 'clamp(0.55rem,2vw,0.7rem)', fontWeight: 900,
                transition: '0.15s', letterSpacing: 0.5,
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── MSG ───────────────────────────────────── */}
          {msg && (
            <div style={{ padding: '12px 16px', borderRadius: 12, marginBottom: 18, background: msg.startsWith('✅') ? 'rgba(0,255,136,0.08)' : 'rgba(255,71,87,0.08)', border: `1px solid ${msg.startsWith('✅') ? 'rgba(0,255,136,0.3)' : 'rgba(255,71,87,0.3)'}`, color: msg.startsWith('✅') ? '#00ff88' : '#ff4757', fontSize: '0.82rem' }}>
              {msg}
            </div>
          )}

          {/* ═══ TAB: DEPOSITAR ════════════════════════ */}
          {tab === 'depositar' && (
            <div style={{ animation: 'fadeUp .3s ease' }}>

              {/* Instrucciones */}
              <div style={{ background: 'linear-gradient(135deg,#161b22,rgba(243,186,47,0.04))', border: '1px solid rgba(243,186,47,0.2)', borderRadius: 16, padding: 'clamp(16px,3vw,22px)', marginBottom: 20 }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#f3ba2f', fontSize: '0.82rem', fontWeight: 900, marginBottom: 12 }}>₿ CÓMO DEPOSITAR VÍA BINANCE</div>
                {[
                  { n: '1', t: 'Enviá USDT a nuestra wallet', d: 'Red: TRC20 o BEP20 (BNB Smart Chain). Usá el ID o address de abajo.' },
                  { n: '2', t: 'Copiá el TX Hash', d: 'Es el ID de la transacción que Binance te muestra al completar el envío.' },
                  { n: '3', t: 'Completá el formulario', d: 'Ingresá la cantidad de coins que querés + el TX Hash + tu dirección Binance.' },
                  { n: '4', t: 'Esperá la verificación', d: 'El equipo LFA verifica en hasta 24 hs. Las coins se acreditan automáticamente al aprobar.' },
                ].map(s => (
                  <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #1c2028' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(243,186,47,0.12)', border: '1px solid rgba(243,186,47,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#f3ba2f', fontSize: '0.7rem', flexShrink: 0 }}>{s.n}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{s.t}</div>
                      <div style={{ color: '#8b949e', fontSize: '0.72rem', marginTop: 2 }}>{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* QR + Alias Binance Pay */}
              <div style={{ background: '#161b22', border: '1px solid rgba(243,186,47,0.25)', borderRadius: 14, padding: '18px', marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#f3ba2f', fontSize: '0.75rem', fontWeight: 900 }}>₿ BINANCE PAY — LFA OFICIAL</div>
                <img
                  src="/assets/binance-qr.png"
                  width={150}
                  height={150}
                  alt="QR Binance Pay LFA"
                  style={{ borderRadius: 12, border: '2px solid rgba(243,186,47,0.35)', background: 'white', padding: 5 }}
                  onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display','flex'); }}
                />
                {/* Fallback si no existe el QR aún */}
                <div style={{ display:'none', width:150, height:150, background:'#0b0e14', border:'2px solid rgba(243,186,47,0.25)', borderRadius:12, flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <span style={{ fontSize:'2.5rem' }}>₿</span>
                  <span style={{ color:'#8b949e', fontSize:'0.62rem', textAlign:'center' }}>Guardá binance-qr.png en public/assets/</span>
                </div>
                <div style={{ width: '100%' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.62rem', fontFamily: "'Orbitron',sans-serif", marginBottom: 5 }}>ALIAS BINANCE PAY</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0b0e14', border: '1px solid rgba(243,186,47,0.3)', borderRadius: 10, padding: '10px 13px' }}>
                    <code style={{ flex: 1, color: '#f3ba2f', fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 700 }}>{BINANCE_ID}</code>
                    <button className="copybtn" onClick={() => { navigator.clipboard?.writeText(BINANCE_ID); setMsg('✅ Alias copiado'); }} style={{ background: 'rgba(243,186,47,0.08)', border: '1px solid rgba(243,186,47,0.3)', color: '#f3ba2f', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap', transition: '0.15s' }}>
                      📋
                    </button>
                  </div>
                </div>
                <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 10, padding: '8px 14px', fontSize: '0.68rem', color: '#00ff88', textAlign: 'center', width: '100%', boxSizing: 'border-box' as const }}>
                  ✅ Escaneá el QR o buscá el alias en Binance Pay → Enviar
                </div>
              </div>

              {/* Wallet LFA */}
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#8b949e', fontSize: '0.65rem', marginBottom: 6 }}>DIRECCIÓN OFICIAL LFA (USDT · TRC20 / BEP20)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <code style={{ background: '#0b0e14', border: '1px solid #30363d', padding: '10px 14px', borderRadius: 8, color: '#f3ba2f', fontSize: 'clamp(0.7rem,2.5vw,0.85rem)', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
                    {BINANCE_ID}
                  </code>
                  <button className="copybtn" onClick={() => { navigator.clipboard?.writeText(BINANCE_ID); setMsg('✅ Dirección copiada'); }} style={{ background: 'rgba(243,186,47,0.08)', border: '1px solid rgba(243,186,47,0.3)', color: '#f3ba2f', padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap', transition: '0.15s' }}>
                    📋 COPIAR
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#ff4757' }}>
                  ⚠️ Solo enviá USDT. No enviés otras monedas — los fondos no se recuperan.
                </div>
              </div>

              {/* Formulario */}
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: 'clamp(16px,3vw,22px)' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.8rem', fontWeight: 900, marginBottom: 16 }}>📝 FORMULARIO DE DEPÓSITO</div>

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.72rem', marginBottom: 6, fontWeight: 700 }}>CANTIDAD DE LFA COINS A ACREDITAR</label>
                <input style={inp} type="number" min={MIN_DEPOSIT} step={100} placeholder={`Mínimo ${MIN_DEPOSIT} coins`} value={depCoins} onChange={e => setDepCoins(e.target.value)} />
                {depNum >= MIN_DEPOSIT && (
                  <div style={{ color: '#f3ba2f', fontSize: '0.75rem', marginTop: -8, marginBottom: 12 }}>
                    Debés enviar: <strong>{depUsd} USDT</strong> ({depNum} coins × ${(1/RATE).toFixed(4)})
                  </div>
                )}

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.72rem', marginBottom: 6, fontWeight: 700, marginTop: 10 }}>TX HASH (ID DE TRANSACCIÓN BINANCE)</label>
                <input style={inp} type="text" placeholder="0x1a2b3c..." value={txHash} onChange={e => setTxHash(e.target.value)} />

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.72rem', marginBottom: 6, fontWeight: 700, marginTop: 10 }}>TU DIRECCIÓN BINANCE (desde la que enviaste)</label>
                <input style={inp} type="text" placeholder="Tu wallet address..." value={senderWallet} onChange={e => setSenderWallet(e.target.value)} />

                <button className="subbtn" onClick={enviarDeposito} disabled={sending} style={{ marginTop: 18, width: '100%', padding: '14px', background: sending ? '#30363d' : '#f3ba2f', color: '#0b0e14', border: 'none', borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.82rem', cursor: sending ? 'not-allowed' : 'pointer', transition: '0.2s', opacity: sending ? 0.6 : 1 }}>
                  {sending ? '⏳ ENVIANDO...' : '⚡ CONFIRMAR DEPÓSITO'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ TAB: RETIRAR ══════════════════════════ */}
          {tab === 'retirar' && (
            <div style={{ animation: 'fadeUp .3s ease' }}>

              {/* Info retiro */}
              <div style={{ background: 'linear-gradient(135deg,#161b22,rgba(255,71,87,0.03))', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 16, padding: 'clamp(16px,3vw,22px)', marginBottom: 20 }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ff4757', fontSize: '0.82rem', fontWeight: 900, marginBottom: 10 }}>💸 CÓMO FUNCIONA EL RETIRO</div>
                {[
                  { n: '1', t: `Mínimo ${MIN_RETIRO.toLocaleString()} coins`, d: `Equivale a $${(MIN_RETIRO/RATE).toFixed(0)} USDT. Los retiros solo se bloquean si tu Fair Play baja del ${FP_BLOQUEO}% por múltiples reportes.` },
                  { n: '2', t: 'Completá el formulario', d: 'Ingresá la cantidad de coins y tu dirección Binance (TRC20 o BEP20).' },
                  { n: '3', t: 'Procesamos en 24-72 hs', d: 'El equipo LFA verifica tu cuenta y envía el USDT manualmente a tu wallet.' },
                  { n: '4', t: 'Tu saldo se descuenta al aprobar', d: 'Las coins quedan reservadas hasta que el pago se confirme.' },
                ].map(s => (
                  <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #1c2028' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#ff4757', fontSize: '0.7rem', flexShrink: 0 }}>{s.n}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{s.t}</div>
                      <div style={{ color: '#8b949e', fontSize: '0.72rem', marginTop: 2 }}>{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Formulario retiro */}
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: 'clamp(16px,3vw,22px)' }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.8rem', fontWeight: 900, marginBottom: 16 }}>📝 FORMULARIO DE RETIRO</div>

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.72rem', marginBottom: 6, fontWeight: 700 }}>CANTIDAD DE LFA COINS A RETIRAR</label>
                <input style={inp} type="number" min={MIN_RETIRO} max={coins} step={100} placeholder={`Mínimo ${MIN_RETIRO} coins — Saldo: ${coins.toLocaleString()}`} value={retCoins} onChange={e => setRetCoins(e.target.value)} />
                {retNum >= MIN_RETIRO && retNum <= coins && (
                  <div style={{ color: '#00ff88', fontSize: '0.75rem', marginTop: -8, marginBottom: 12 }}>
                    Recibirás: <strong>{retUsd} USDT</strong>
                  </div>
                )}
                {retNum > coins && (
                  <div style={{ color: '#ff4757', fontSize: '0.75rem', marginTop: -8, marginBottom: 12 }}>
                    ❌ Saldo insuficiente
                  </div>
                )}

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.72rem', marginBottom: 6, fontWeight: 700, marginTop: 10 }}>RED DE BINANCE</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {(['TRC20', 'BEP20'] as const).map(r => (
                    <button key={r} onClick={() => setRedWallet(r)} style={{ flex: 1, padding: '10px', background: redWallet === r ? 'rgba(243,186,47,0.1)' : '#0b0e14', border: `1px solid ${redWallet === r ? '#f3ba2f' : '#30363d'}`, color: redWallet === r ? '#f3ba2f' : '#8b949e', borderRadius: 10, cursor: 'pointer', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900, transition: '0.15s' }}>
                      {r}
                    </button>
                  ))}
                </div>

                <label style={{ display: 'block', color: '#8b949e', fontSize: '0.72rem', marginBottom: 6, fontWeight: 700 }}>TU DIRECCIÓN BINANCE ({redWallet})</label>
                <input style={inp} type="text" placeholder={`Tu wallet ${redWallet}...`} value={wallet} onChange={e => setWallet(e.target.value)} />

                <div style={{ background: '#0b0e14', border: '1px solid #30363d', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: '0.72rem', color: '#8b949e' }}>
                  ℹ️ Asegurate de ingresar la dirección correcta para la red <strong style={{ color: '#f3ba2f' }}>{redWallet}</strong>. Las transacciones enviadas a redes incorrectas no se recuperan.
                </div>

                <button className="subbtn" onClick={enviarRetiro} disabled={sending || fairPlay < FP_BLOQUEO} style={{ marginTop: 18, width: '100%', padding: '14px', background: (sending || fairPlay < FP_BLOQUEO) ? '#30363d' : '#ff4757', color: 'white', border: 'none', borderRadius: 12, fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.82rem', cursor: (sending || fairPlay < FP_BLOQUEO) ? 'not-allowed' : 'pointer', transition: '0.2s', opacity: (sending || fairPlay < FP_BLOQUEO) ? 0.6 : 1 }}>
                  {sending ? '⏳ ENVIANDO...' : fairPlay < FP_BLOQUEO ? '🔒 FAIR PLAY MUY BAJO' : '💸 SOLICITAR RETIRO'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ TAB: HISTORIAL ════════════════════════ */}
          {tab === 'historial' && (
            <div style={{ animation: 'fadeUp .3s ease' }}>
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '13px 18px', borderBottom: '1px solid #30363d', fontFamily: "'Orbitron',sans-serif", color: '#ffd700', fontSize: '0.8rem' }}>
                  📋 HISTORIAL DE MOVIMIENTOS
                </div>
                {txList.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>💰</div>
                    Sin movimientos todavía
                  </div>
                ) : (
                  txList.map(tx => {
                    const esEntrada  = tx.tipo === 'entrada';
                    const esPendiente = tx.tipo === 'pendiente';
                    const color = esPendiente ? '#ffd700' : esEntrada ? '#00ff88' : '#ff4757';
                    return (
                      <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid #1c2028', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.descripcion}</div>
                          <div style={{ color: '#8b949e', fontSize: '0.66rem', marginTop: 2 }}>{tx.fecha?.toDate?.()?.toLocaleString() || '—'}</div>
                        </div>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: '0.9rem', color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {esPendiente ? '⏳' : esEntrada ? '+' : '-'}🪙{tx.monto.toLocaleString()}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
