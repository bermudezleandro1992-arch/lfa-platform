'use client';

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';
import { onAuthStateChanged }  from 'firebase/auth';
import { doc, onSnapshot }    from 'firebase/firestore';
import { auth, db }           from '@/lib/firebase';
import Link                   from 'next/link';

/* ─── Tipos de premio ──────────────────────────────────── */
interface PrizeItem {
  id:       string;
  emoji:    string;
  name:     string;
  category: string;
  points:   number | null;  // null = precio por definir
  color:    string;
  soon:     boolean;
}

const PRIZES: PrizeItem[] = [
  /* ── Coins / Entradas ─────────────────────────────── */
  { id: 'coins-500',   emoji: '🪙', name: '500 LFA Coins',            category: 'MONEDAS',    points: 2000,  color: '#ffd700', soon: false },
  { id: 'coins-1000',  emoji: '🪙', name: '1.000 LFA Coins',          category: 'MONEDAS',    points: 3800,  color: '#ffd700', soon: false },
  { id: 'coins-2000',  emoji: '🪙', name: '2.000 LFA Coins',          category: 'MONEDAS',    points: 7000,  color: '#ffd700', soon: false },
  { id: 'entry-std',   emoji: '🎟️', name: 'Entrada Torneo Standard',  category: 'ENTRADAS',   points: 5000,  color: '#00ff88', soon: false },
  { id: 'entry-elite', emoji: '🎟️', name: 'Entrada Torneo Elite',     category: 'ENTRADAS',   points: 12000, color: '#00ff88', soon: false },

  /* ── Monedas de juegos ────────────────────────────── */
  { id: 'fc-coins',    emoji: '⚽', name: 'FC26 / FC27 Coins',        category: 'VIDEOJUEGOS', points: null, color: '#009ee3', soon: true },
  { id: 'ef-coins',    emoji: '⚽', name: 'eFootball Coins',           category: 'VIDEOJUEGOS', points: null, color: '#009ee3', soon: true },

  /* ── Hardware / Periféricos ───────────────────────── */
  { id: 'joystick',    emoji: '🕹️', name: 'Joystick / Gamepad',       category: 'HARDWARE',    points: null, color: '#9146FF', soon: true },
  { id: 'headset',     emoji: '🎧', name: 'Auriculares Gaming',        category: 'HARDWARE',    points: null, color: '#9146FF', soon: true },
  { id: 'keyboard',    emoji: '⌨️', name: 'Teclado Gaming',            category: 'HARDWARE',    points: null, color: '#9146FF', soon: true },
  { id: 'mouse',       emoji: '🖱️', name: 'Mouse Gaming',              category: 'HARDWARE',    points: null, color: '#9146FF', soon: true },
  { id: 'headset-ps',  emoji: '🎮', name: 'Auriculares PS5 / Xbox',   category: 'CONSOLAS',    points: null, color: '#ff4757', soon: true },
  { id: 'card-ps',     emoji: '💳', name: 'Gift Card PSN',             category: 'CONSOLAS',    points: null, color: '#ff4757', soon: true },
  { id: 'card-xbox',   emoji: '💳', name: 'Gift Card Xbox',            category: 'CONSOLAS',    points: null, color: '#ff4757', soon: true },

  /* ── Premio mensual ───────────────────────────────── */
  { id: 'mvp-month',   emoji: '👑', name: 'Premio Mejor Jugador del Mes', category: 'ESPECIAL', points: null, color: '#f3ba2f', soon: true },
];

const CATEGORIES = ['TODOS', 'MONEDAS', 'ENTRADAS', 'VIDEOJUEGOS', 'HARDWARE', 'CONSOLAS', 'ESPECIAL'];

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0b0e14' }}>
      <div style={{ width: 42, height: 42, border: '3px solid #ffd700', borderTopColor: 'transparent', borderRadius: '50%', animation: 'sp .8s linear infinite' }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
export default function TiendaPage() {
  const router = useRouter();

  const [uid,       setUid]       = useState('');
  const [points,    setPoints]    = useState<number>(0);
  const [ready,     setReady]     = useState(false);
  const [filter,    setFilter]    = useState('TODOS');

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
    const unsub = onSnapshot(doc(db, 'usuarios', uid), snap => {
      if (snap.exists()) setPoints((snap.data().puntos_gratis ?? 0) as number);
    });
    return unsub;
  }, [uid]);

  const filtered = filter === 'TODOS' ? PRIZES : PRIZES.filter(p => p.category === filter);

  if (!ready) return <Spinner />;

  return (
    <>
      <style>{`
        @keyframes sp      { to { transform: rotate(360deg) } }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.5} }
        .prizecard { transition: all .2s ease; }
        .prizecard:hover { transform: translateY(-4px); }
        .filtbtn:hover { opacity: .85; }
      `}</style>

      <div style={{ background: '#0b0e14', minHeight: '100vh', color: 'white', fontFamily: "'Roboto',sans-serif" }}>

        {/* ── HEADER ──────────────────────────────────── */}
        <header style={{ background: 'rgba(7,9,13,0.97)', borderBottom: '1px solid #30363d', padding: '13px 5%', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap' }}>
          <Link href="/hub" style={{ color: '#8b949e', textDecoration: 'none', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem' }}>← HUB</Link>
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.85rem', color: '#f3ba2f', fontWeight: 900 }}>
            🛒 TIENDA DE PUNTOS
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ background: 'rgba(243,186,47,0.08)', border: '1px solid rgba(243,186,47,0.3)', borderRadius: 10, padding: '6px 14px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.82rem', color: '#f3ba2f', fontWeight: 900 }}>
            ⭐ {points.toLocaleString()} pts
          </div>
        </header>

        <div style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(20px,4vw,36px) clamp(14px,4vw,24px) 80px' }}>

          {/* ── BANNER PRÓXIMAMENTE ─────────────────── */}
          <div style={{ background: 'linear-gradient(135deg,rgba(243,186,47,0.08),rgba(145,70,255,0.06))', border: '2px solid rgba(243,186,47,0.25)', borderRadius: 20, padding: 'clamp(20px,4vw,36px)', marginBottom: 32, textAlign: 'center', animation: 'fadeUp .35s ease', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 300, height: 200, background: 'rgba(243,186,47,0.06)', borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none' }} />
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(0.6rem,2vw,0.75rem)', color: '#f3ba2f', letterSpacing: 4, marginBottom: 10, position: 'relative' }}>
              🚧 EN CONSTRUCCIÓN
            </div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.6rem,5vw,2.8rem)', fontWeight: 900, background: 'linear-gradient(90deg,#f3ba2f,#ffd700,#9146FF,#f3ba2f)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'shimmer 4s linear infinite', lineHeight: 1.15, position: 'relative' }}>
              TIENDA DE PUNTOS
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.82rem', marginTop: 12, maxWidth: 560, margin: '12px auto 0', lineHeight: 1.7, position: 'relative' }}>
              Ganás <strong style={{ color: '#f3ba2f' }}>Puntos LFA</strong> jugando torneos gratuitos, reportando resultados correctamente y manteniendo tu Fair Play alto. Canjeá puntos por coins, entradas a torneos, hardware gaming, gift cards y más.
            </div>
            <div style={{ marginTop: 16, display: 'inline-block', background: 'rgba(243,186,47,0.1)', border: '1px solid rgba(243,186,47,0.4)', borderRadius: 20, padding: '6px 20px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', color: '#f3ba2f', animation: 'pulse 2s ease-in-out infinite', position: 'relative' }}>
              ⏳ PRÓXIMAMENTE — PRECIOS EN CONFIGURACIÓN
            </div>
          </div>

          {/* ── CÓMO GANAR PUNTOS ──────────────────── */}
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: 'clamp(16px,3vw,24px)', marginBottom: 28 }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#00ff88', fontSize: '0.78rem', fontWeight: 900, marginBottom: 16 }}>
              ⭐ ¿CÓMO GANAR PUNTOS?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))', gap: 12 }}>
              {[
                { icon: '🎮', action: 'Jugar torneo gratuito',       pts: '+5 pts por partido',  color: '#00ff88' },
                { icon: '📸', action: 'Reportar resultado con foto', pts: '+3 pts',               color: '#00ff88' },
                { icon: '✔️', action: 'Verificar resultado del rival', pts: '+2 pts',             color: '#00ff88' },
                { icon: '🏆', action: 'Ganar un torneo gratuito',    pts: '+50 pts',              color: '#ffd700' },
                { icon: '⭐', action: 'Torneo pagado completado',    pts: '+20 pts bonus',        color: '#ffd700' },
                { icon: '📅', action: 'Racha de 7 días activo',      pts: '+15 pts semanales',    color: '#9146FF' },
                { icon: '🤝', action: 'Referir un amigo activo',     pts: '+100 pts',             color: '#9146FF' },
                { icon: '⚖️', action: 'Mantener Fair Play > 90%',    pts: 'Multiplicador x1.5',  color: '#f3ba2f' },
              ].map(item => (
                <div key={item.action} style={{ background: '#0b0e14', border: '1px solid #30363d', borderLeft: `3px solid ${item.color}`, borderRadius: 10, padding: '11px 13px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'white', marginBottom: 2 }}>{item.action}</div>
                    <div style={{ fontSize: '0.68rem', color: item.color, fontFamily: "'Orbitron',sans-serif", fontWeight: 900 }}>{item.pts}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── FILTROS ─────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                className="filtbtn"
                onClick={() => setFilter(cat)}
                style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', fontWeight: 700, padding: '6px 14px', borderRadius: 20, border: `1px solid ${filter === cat ? '#f3ba2f' : '#30363d'}`, background: filter === cat ? 'rgba(243,186,47,0.12)' : 'transparent', color: filter === cat ? '#f3ba2f' : '#8b949e', cursor: 'pointer', transition: '0.2s' }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* ── GRID DE PREMIOS ─────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))', gap: 14 }}>
            {filtered.map(item => (
              <div
                key={item.id}
                className="prizecard"
                style={{
                  background:   item.soon ? '#161b22' : `linear-gradient(135deg,#161b22,${item.color}08)`,
                  border:       `1px solid ${item.soon ? '#30363d' : item.color + '40'}`,
                  borderTop:    `3px solid ${item.soon ? '#30363d' : item.color}`,
                  borderRadius: 16,
                  padding:      'clamp(14px,2vw,20px)',
                  position:     'relative',
                  opacity:      item.soon ? 0.75 : 1,
                }}
              >
                {/* Badge categoría */}
                <div style={{ position: 'absolute', top: 10, right: 10, fontSize: '0.5rem', fontFamily: "'Orbitron',sans-serif", color: '#8b949e', background: '#0b0e14', border: '1px solid #30363d', padding: '2px 7px', borderRadius: 20 }}>
                  {item.category}
                </div>

                {/* Emoji */}
                <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>{item.emoji}</div>

                {/* Nombre */}
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 8, paddingRight: 40 }}>
                  {item.name}
                </div>

                {/* Precio */}
                {item.points !== null ? (
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '1.1rem', fontWeight: 900, color: item.color }}>
                    ⭐ {item.points.toLocaleString()} pts
                  </div>
                ) : (
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', color: '#8b949e' }}>
                    💲 Precio por definir
                  </div>
                )}

                {/* Botón */}
                <button
                  disabled
                  style={{ marginTop: 12, width: '100%', padding: '9px', background: item.soon ? '#30363d' : `${item.color}22`, border: `1px solid ${item.soon ? '#30363d' : item.color + '50'}`, color: item.soon ? '#555' : item.color, borderRadius: 10, fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', fontWeight: 900, cursor: 'not-allowed' }}
                >
                  {item.soon ? '⏳ PRÓXIMAMENTE' : '🔒 CANJE PRONTO'}
                </button>
              </div>
            ))}
          </div>

          {/* ── PREMIO ESPECIAL MES ─────────────────── */}
          <div style={{ marginTop: 32, background: 'linear-gradient(135deg,rgba(241,196,15,0.06),rgba(145,70,255,0.05))', border: '2px solid rgba(241,196,15,0.25)', borderRadius: 20, padding: 'clamp(20px,4vw,32px)', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 10 }}>👑</div>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1rem,3vw,1.4rem)', fontWeight: 900, color: '#f3ba2f', marginBottom: 8 }}>
              MEJOR JUGADOR DEL MES
            </div>
            <div style={{ color: '#8b949e', fontSize: '0.78rem', maxWidth: 460, margin: '0 auto', lineHeight: 1.7 }}>
              El jugador con más puntos al final de cada mes gana premios físicos: joystick, teclado, auriculares, gift cards de consolas y más. Los premios se anuncian al inicio de cada mes.
            </div>
            <div style={{ marginTop: 14, display: 'inline-block', background: 'rgba(243,186,47,0.08)', border: '1px solid rgba(243,186,47,0.3)', borderRadius: 20, padding: '6px 20px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', color: '#f3ba2f' }}>
              ⏳ PRIMER PREMIO: PRÓXIMAMENTE
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
