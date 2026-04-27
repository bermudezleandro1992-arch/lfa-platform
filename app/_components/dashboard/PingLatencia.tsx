'use client';

import { useState, useCallback, useEffect } from 'react';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface ServerEntry {
  id: string; label: string; country: string; flag: string;
  host: string; region: 'SUR' | 'NORTE' | 'EUROPA'; game: 'FC26' | 'EFOOTBALL';
}
interface PingState { ms: number | null; status: 'idle' | 'measuring' | 'done' | 'error' }
interface ClientInfo { ip: string; country: string; countryName: string; city: string; region: string; isVpn: boolean }

// ─── Servidores ───────────────────────────────────────────────────────────────
const SERVERS: ServerEntry[] = [
  // FC26 — Región Sur
  { id: 'fc26-bsas', label: 'Buenos Aires', country: 'Argentina', flag: '🇦🇷', host: 'utas.s2.ea.com',  region: 'SUR',   game: 'FC26' },
  { id: 'fc26-sao',  label: 'São Paulo',    country: 'Brasil',    flag: '🇧🇷', host: 'utas.s3.ea.com',  region: 'SUR',   game: 'FC26' },
  { id: 'fc26-lima', label: 'Lima',          country: 'Perú',      flag: '🇵🇪', host: 'utas.s4.ea.com',  region: 'SUR',   game: 'FC26' },
  // FC26 — Región Norte
  { id: 'fc26-mex',  label: 'Cd. México',   country: 'México',    flag: '🇲🇽', host: 'utas.s8.ea.com',  region: 'NORTE', game: 'FC26' },
  { id: 'fc26-dal',  label: 'Dallas',        country: 'EEUU',      flag: '🇺🇸', host: 'utas.s5.ea.com',  region: 'NORTE', game: 'FC26' },
  { id: 'fc26-ash',  label: 'Ashburn',       country: 'EEUU',      flag: '🇺🇸', host: 'utas.s6.ea.com',  region: 'NORTE', game: 'FC26' },
  // eFootball — Región Sur
  { id: 'ef-sao',    label: 'São Paulo',     country: 'Brasil',    flag: '🇧🇷', host: 'we-pes-mobile.konami.net',  region: 'SUR',   game: 'EFOOTBALL' },
  // eFootball — Región Norte
  { id: 'ef-fra',    label: 'Frankfurt',     country: 'Alemania',  flag: '🇩🇪', host: 'pes.konami.net',            region: 'EUROPA', game: 'EFOOTBALL' },
];

// ─── Clasificar latencia ──────────────────────────────────────────────────────
function clasificarPing(ms: number) {
  if (ms < 50)  return { label: 'EXCELENTE', color: '#00ff88', icon: '🟢' };
  if (ms < 80)  return { label: 'MUY BUENO', color: '#00e676', icon: '🟢' };
  if (ms < 120) return { label: 'ACEPTABLE', color: '#ffd700', icon: '🟡' };
  if (ms < 180) return { label: 'ALTO',      color: '#ff9800', icon: '🟠' };
  return          { label: 'MUY ALTO',      color: '#ff4757', icon: '🔴' };
}

// ─── Medir ping a un host (browser fetch timing) ─────────────────────────────
async function medirHost(host: string): Promise<number | null> {
  try {
    const samples: number[] = [];
    for (let i = 0; i < 2; i++) {
      const t0 = performance.now();
      await fetch(`https://${host}/favicon.ico`, { mode: 'no-cors', cache: 'no-store' });
      samples.push(Math.round(performance.now() - t0));
    }
    return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  } catch {
    return null;
  }
}

// ─── Sub-componente: TipCard ──────────────────────────────────────────────────
function TipCard({ emoji, title, body, priority }: { emoji: string; title: string; body: string; priority?: 'alta' }) {
  const border = priority === 'alta' ? '#00ff8840' : '#1c2028';
  return (
    <div style={{ background: '#0d1117', border: `1px solid ${border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ color: '#e6edf3', fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', fontWeight: 700 }}>{title}</span>
          {priority === 'alta' && (
            <span style={{ background: '#00ff8820', color: '#00ff88', fontSize: '0.55rem', fontWeight: 900, padding: '1px 6px', borderRadius: 4, letterSpacing: 1 }}>PRIORIDAD</span>
          )}
        </div>
        <p style={{ color: '#8b949e', fontSize: '0.78rem', margin: 0, lineHeight: 1.6 }}>{body}</p>
      </div>
    </div>
  );
}

// ─── Sub-componente: ServerPingRow ────────────────────────────────────────────
function ServerPingRow({ srv, state }: { srv: ServerEntry; state: PingState }) {
  const cl = state.ms != null ? clasificarPing(state.ms) : null;
  const barWidth = state.ms != null ? Math.max(4, Math.min(100, Math.round((200 - state.ms) / 2))) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #161b22' }}>
      <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{srv.flag}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ color: '#e6edf3', fontSize: '0.78rem', fontWeight: 700 }}>{srv.label}</span>
          <span style={{ color: '#4a5568', fontSize: '0.6rem' }}>{srv.host}</span>
        </div>
        <div style={{ height: 5, background: '#0b0e14', borderRadius: 4, overflow: 'hidden' }}>
          {state.status === 'measuring' && (
            <div style={{ height: '100%', width: '60%', background: '#30363d', borderRadius: 4, animation: 'pulse 1s infinite' }} />
          )}
          {state.status === 'done' && cl && (
            <div style={{ height: '100%', width: `${barWidth}%`, background: cl.color, borderRadius: 4, transition: 'width 0.6s ease', boxShadow: `0 0 6px ${cl.color}60` }} />
          )}
          {state.status === 'error' && (
            <div style={{ height: '100%', width: '100%', background: '#ff475730', borderRadius: 4 }} />
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 72, flexShrink: 0 }}>
        {state.status === 'idle' && <span style={{ color: '#30363d', fontSize: '0.7rem' }}>—</span>}
        {state.status === 'measuring' && <span style={{ color: '#8b949e', fontSize: '0.65rem' }}>midiendo...</span>}
        {state.status === 'error' && <span style={{ color: '#ff4757', fontSize: '0.65rem' }}>sin resp.</span>}
        {state.status === 'done' && cl && state.ms != null && (
          <div>
            <span style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, color: cl.color, fontSize: '0.9rem' }}>{state.ms}</span>
            <span style={{ color: '#8b949e', fontSize: '0.6rem' }}> ms</span>
            <div style={{ color: cl.color, fontSize: '0.55rem', fontWeight: 700, letterSpacing: 1 }}>{cl.icon} {cl.label}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PingLatencia() {
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [measuring, setMeasuring] = useState(false);
  const [pings, setPings] = useState<Record<string, PingState>>(
    () => Object.fromEntries(SERVERS.map(s => [s.id, { ms: null, status: 'idle' as const }]))
  );

  // Cargar info del cliente al montar
  useEffect(() => {
    fetch('/api/detect-region')
      .then(async res => {
        if (!res.ok) return;
        const d = await res.json();
        setClientInfo({
          ip:          d.ip          ?? '—',
          country:     d.country     ?? '??',
          countryName: d.countryName ?? 'Desconocido',
          city:        d.city        ?? '—',
          region:      d.region      ?? '—',
          isVpn:       !!d.isVpn,
        });
      })
      .catch(() => {})
      .finally(() => setLoadingInfo(false));
  }, []);

  // Medir todos los servidores en paralelo
  const medirTodo = useCallback(async () => {
    setMeasuring(true);
    // Marcar todos como 'measuring'
    setPings(prev => {
      const next = { ...prev };
      SERVERS.forEach(s => { next[s.id] = { ms: null, status: 'measuring' }; });
      return next;
    });
    // Lanzar todos en paralelo
    await Promise.all(
      SERVERS.map(async (srv) => {
        const ms = await medirHost(srv.host);
        setPings(prev => ({
          ...prev,
          [srv.id]: { ms, status: ms !== null ? 'done' : 'error' },
        }));
      })
    );
    setMeasuring(false);
  }, []);

  // Región label
  const regionLabel = clientInfo
    ? clientInfo.region === 'LATAM_SUR'   ? '🌎 LATAM SUR'
    : clientInfo.region === 'LATAM_NORTE' ? '🌎 LATAM NORTE'
    : clientInfo.region === 'AMERICA'     ? '🌎 AMÉRICA'
    : clientInfo.region
    : '—';

  const surFc26   = SERVERS.filter(s => s.game === 'FC26'      && s.region === 'SUR');
  const norteFc26 = SERVERS.filter(s => s.game === 'FC26'      && s.region === 'NORTE');
  const efSur     = SERVERS.filter(s => s.game === 'EFOOTBALL' && s.region === 'SUR');
  const efEuropa  = SERVERS.filter(s => s.game === 'EFOOTBALL' && s.region === 'EUROPA');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(16px,4vw,32px) clamp(12px,4vw,24px)' }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1rem,3.5vw,1.4rem)', fontWeight: 900, color: '#e6edf3', letterSpacing: 1.5, margin: 0 }}>
          📡 PING & LATENCIA
        </h1>
        <p style={{ color: '#8b949e', fontSize: '0.82rem', marginTop: 6, marginBottom: 0 }}>
          Medí tu ping a los servidores de FC 26 y eFootball en tu región.
        </p>
      </div>

      {/* ── TARJETA TU CONEXIÓN ── */}
      <div style={{ background: 'linear-gradient(135deg,#0d1117,#161b22)', border: `1px solid ${clientInfo?.isVpn ? '#ff475750' : '#00ff8830'}`, borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
        <p style={{ color: '#8b949e', fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', letterSpacing: 2, margin: '0 0 14px', fontWeight: 700 }}>
          💻 TU CONEXIÓN
        </p>
        {loadingInfo ? (
          <div style={{ color: '#8b949e', fontSize: '0.8rem' }}>Detectando tu ubicación...</div>
        ) : clientInfo ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
            <div>
              <div style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>IP PÚBLICA</div>
              <div style={{ color: '#e6edf3', fontFamily: 'monospace', fontSize: '0.88rem', fontWeight: 700 }}>{clientInfo.ip}</div>
            </div>
            <div>
              <div style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>PAÍS / CIUDAD</div>
              <div style={{ color: '#e6edf3', fontSize: '0.88rem', fontWeight: 700 }}>{clientInfo.countryName}</div>
              <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>{clientInfo.city}</div>
            </div>
            <div>
              <div style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>REGIÓN LFA</div>
              <div style={{ color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900 }}>{regionLabel}</div>
            </div>
            <div>
              <div style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>ESTADO</div>
              {clientInfo.isVpn ? (
                <div style={{ color: '#ff4757', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900 }}>🚫 VPN DETECTADA</div>
              ) : (
                <div style={{ color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900 }}>✅ CONEXIÓN DIRECTA</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ color: '#ff4757', fontSize: '0.8rem' }}>No se pudo detectar tu ubicación.</div>
        )}
        {clientInfo?.isVpn && (
          <div style={{ marginTop: 12, background: 'rgba(255,71,87,0.08)', border: '1px solid #ff475730', borderRadius: 8, padding: '8px 12px', color: '#ff4757', fontSize: '0.73rem' }}>
            ⚠️ Estás usando VPN — El ping puede no ser real. Solo podés participar en torneos GLOBAL.
          </div>
        )}
      </div>

      {/* ── BOTÓN MEDIR TODO ── */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <button
          onClick={medirTodo}
          disabled={measuring}
          style={{ background: measuring ? '#161b22' : 'linear-gradient(135deg,#00ff88,#00cc6a)', color: measuring ? '#8b949e' : '#0b0e14', border: measuring ? '1px solid #30363d' : 'none', borderRadius: 10, padding: '12px 36px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.78rem', fontWeight: 900, letterSpacing: 1.5, cursor: measuring ? 'not-allowed' : 'pointer', transition: '0.2s', boxShadow: measuring ? 'none' : '0 0 20px #00ff8840' }}
        >
          {measuring ? '⏳ MIDIENDO SERVIDORES...' : pings[SERVERS[0].id].status === 'idle' ? '▶ MEDIR PING AHORA' : '🔄 VOLVER A MEDIR'}
        </button>
        <p style={{ color: '#4a5568', fontSize: '0.68rem', marginTop: 8, marginBottom: 0 }}>
          Mide tu latencia a todos los servidores de Región Sur y Norte en paralelo
        </p>
      </div>

      {/* ── FC26 — REGIÓN SUR ── */}
      <div style={{ background: '#0d1117', border: '1px solid #58a6ff30', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ background: 'rgba(88,166,255,0.06)', padding: '10px 14px', borderBottom: '1px solid #58a6ff20', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#58a6ff', fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1 }}>FC 26 — REGIÓN SUR</span>
          <span style={{ color: '#4a5568', fontSize: '0.62rem' }}>Buenos Aires · São Paulo · Lima</span>
        </div>
        {surFc26.map(srv => <ServerPingRow key={srv.id} srv={srv} state={pings[srv.id]} />)}
      </div>

      {/* ── FC26 — REGIÓN NORTE ── */}
      <div style={{ background: '#0d1117', border: '1px solid #58a6ff30', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ background: 'rgba(88,166,255,0.06)', padding: '10px 14px', borderBottom: '1px solid #58a6ff20', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#58a6ff', fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1 }}>FC 26 — REGIÓN NORTE</span>
          <span style={{ color: '#4a5568', fontSize: '0.62rem' }}>Dallas · Cd. México · Ashburn</span>
        </div>
        {norteFc26.map(srv => <ServerPingRow key={srv.id} srv={srv} state={pings[srv.id]} />)}
      </div>

      {/* ── eFOOTBALL ── */}
      <div style={{ background: '#0d1117', border: '1px solid #009ee330', borderRadius: 14, overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ background: 'rgba(0,158,227,0.06)', padding: '10px 14px', borderBottom: '1px solid #009ee320', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#009ee3', fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1 }}>eFOOTBALL — SERVIDORES</span>
        </div>
        {[...efSur, ...efEuropa].map(srv => <ServerPingRow key={srv.id} srv={srv} state={pings[srv.id]} />)}
        <div style={{ padding: '8px 14px', background: 'rgba(255,152,0,0.04)' }}>
          <span style={{ color: '#ff9800', fontSize: '0.65rem' }}>⚠️ Konami bloquea pings externos — si aparece "sin resp." es normal, el ping en juego suele ser diferente.</span>
        </div>
      </div>

      {/* ── REFERENCIA DE COLORES ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {[
          { ms: '< 50ms',    label: 'Excelente',  color: '#00ff88' },
          { ms: '50-80ms',   label: 'Muy bueno',  color: '#00e676' },
          { ms: '80-120ms',  label: 'Aceptable',  color: '#ffd700' },
          { ms: '120-180ms', label: 'Alto',        color: '#ff9800' },
          { ms: '> 180ms',   label: 'Muy alto',   color: '#ff4757' },
        ].map(r => (
          <div key={r.ms} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1c2028', borderRadius: 20, padding: '4px 12px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
            <span style={{ color: '#8b949e', fontSize: '0.68rem' }}><b style={{ color: r.color }}>{r.ms}</b> — {r.label}</span>
          </div>
        ))}
      </div>

      {/* ── ¿PUEDO VER PING ARGENTINA VS COLOMBIA? ── */}
      <div style={{ background: '#0d1117', border: '1px solid #ffd70030', borderRadius: 14, padding: '20px', marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900, color: '#ffd700', letterSpacing: 2, marginTop: 0, marginBottom: 14 }}>
          🌎 ¿PUEDO VER EL PING ARGENTINA VS COLOMBIA?
        </h2>
        <p style={{ color: '#8b949e', fontSize: '0.82rem', lineHeight: 1.7, margin: '0 0 14px' }}>
          <strong style={{ color: '#e6edf3' }}>Desde el navegador, solo medís tu propio ping</strong> al servidor —
          no es posible medir el ping entre dos países distintos desde un solo punto.
          Para comparar, <strong style={{ color: '#e6edf3' }}>ambos jugadores deben abrir esta sección y comparar su resultado</strong> al mismo servidor.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 10 }}>
          {[
            { flag: '🇦🇷', pais: 'Argentina', servidor: 'Buenos Aires (EA FC26)', ping: '20–60ms',   color: '#00ff88' },
            { flag: '🇧🇷', pais: 'Brasil',    servidor: 'São Paulo (EA FC26)',    ping: '15–50ms',   color: '#00ff88' },
            { flag: '🇨🇴', pais: 'Colombia',  servidor: 'Buenos Aires (EA FC26)', ping: '80–140ms',  color: '#ffd700' },
            { flag: '🇨🇱', pais: 'Chile',     servidor: 'Buenos Aires (EA FC26)', ping: '40–90ms',   color: '#00e676' },
            { flag: '🇲🇽', pais: 'México',    servidor: 'Dallas (EA FC26)',       ping: '20–60ms',   color: '#00ff88' },
            { flag: '🇪🇸', pais: 'España',    servidor: 'Madrid (EA FC26)',       ping: '10–40ms',   color: '#00ff88' },
            { flag: '🇵🇪', pais: 'Perú',      servidor: 'Buenos Aires (EA FC26)', ping: '60–120ms',  color: '#ffd700' },
            { flag: '🇺🇸', pais: 'EEUU',      servidor: 'Ashburn/Dallas (EA)',    ping: '10–50ms',   color: '#00ff88' },
          ].map(r => (
            <div key={r.pais} style={{ background: '#161b22', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.8rem' }}>{r.flag}</span>
              <div>
                <div style={{ color: '#e6edf3', fontWeight: 700, fontSize: '0.82rem' }}>{r.pais}</div>
                <div style={{ color: '#8b949e', fontSize: '0.68rem' }}>{r.servidor}</div>
                <div style={{ color: r.color, fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, marginTop: 3 }}>~{r.ping}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ color: '#4a5568', fontSize: '0.7rem', marginTop: 14, marginBottom: 0 }}>
          * Valores aproximados en condiciones normales de red. Varían según ISP, hora pico y enrutamiento.
        </p>
      </div>

      {/* ── TIPS ANTI-LAG ── */}
      <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900, color: '#58a6ff', letterSpacing: 2, marginBottom: 14, marginTop: 0 }}>
        🛠️ CÓMO REDUCIR EL LAG
      </h2>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>CONEXIÓN FÍSICA</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard priority="alta" emoji="🔌" title="Usá siempre cable de red Ethernet" body="Es la mejora más grande que podés hacer. El WiFi agrega entre 20-80ms extra y tiene jitter (variación de ping) que afecta mucho a los juegos de fútbol. Conectá la consola o PC directo al router con cable Cat5e o Cat6." />
        <TipCard emoji="📍" title="Acercá el router si no podés usar cable" body="Asegurate de estar cerca del router. Paredes de hormigón y microondas interfieren la señal 2.4GHz. Usá la banda de 5GHz si tu router y consola lo soportan." />
        <TipCard emoji="🔁" title="Reiniciá el router seguido" body="Un router prendido por días puede acumular conexiones y perder paquetes. Apagalo 30 segundos y volvé a encenderlo." />
      </div>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>CONFIGURACIÓN DE RED</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard priority="alta" emoji="🌐" title="Cambiá el DNS a uno más rápido" body="Cambiá el DNS en tu consola o router a Cloudflare 1.1.1.1 / 1.0.0.1 o Google 8.8.8.8 / 8.8.4.4. Mejora los tiempos de conexión a los servidores del juego." />
        <TipCard emoji="⚡" title="Activá QoS en el router" body="QoS le da prioridad al tráfico de juego sobre el streaming o las descargas. Buscá la opción en el panel del router (192.168.0.1 o 192.168.1.1) y dales prioridad a tu consola o PC." />
        <TipCard emoji="🔓" title="NAT Abierto (Tipo A / Tipo 1)" body="En PS5/PS4: Configuración → Red → Tipo de NAT → debe decir Tipo A o Tipo B. Tipo C causa lag. Si lo tenés, activá UPnP en el router o configurá DMZ para tu consola." />
      </div>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>LIBERAR ANCHO DE BANDA</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard emoji="📥" title="Pausá las descargas y actualizaciones" body="Una descarga activa puede disparar el ping al doble o triple. Verificá que no haya actualizaciones en segundo plano en la consola, Steam, Epic o Windows Update." />
        <TipCard emoji="📱" title="Desconectá dispositivos que no usás" body="Pedile a las personas en tu casa que pausen el streaming (Netflix, YouTube) mientras jugás torneos importantes." />
        <TipCard emoji="🎵" title="Cerrá apps en segundo plano" body="Spotify, Discord con video, YouTube y OneDrive/Google Drive sincronizando consumen red. Cerrá todo lo que no necesitás mientras jugás." />
      </div>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>TIPO DE CONEXIÓN</p>
      <div style={{ background: '#0d1117', border: '1px solid #1c2028', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
        {[
          { tipo: 'Fibra óptica',  icon: '🥇', color: '#00ff88', desc: 'Menor latencia, sin jitter. Ideal para torneos. Latencia típica: 5–20ms al servidor.' },
          { tipo: 'Cable coaxial', icon: '🥈', color: '#58a6ff', desc: 'Buena para gaming, puede tener jitter en hora pico. 10–40ms.' },
          { tipo: 'ADSL / VDSL',   icon: '🥉', color: '#ffd700', desc: 'Funciona, pero la latencia es mayor (30–80ms). Poco margen para el lag.' },
          { tipo: 'Datos móviles', icon: '⚠️', color: '#ff9800', desc: '4G tiene picos de 50–200ms. 5G mejora, pero hay jitter por handover. Usalo como último recurso.' },
          { tipo: 'Satelital',     icon: '🚫', color: '#ff4757', desc: 'Latencia de 600ms+. Starlink mejora a ~40ms pero con variación alta. No recomendado para torneos.' },
        ].map((row, i, arr) => (
          <div key={row.tipo} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid #1c2028' : 'none' }}>
            <span style={{ fontSize: '1.2rem', width: 28, textAlign: 'center' }}>{row.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: row.color, fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 700, marginBottom: 2 }}>{row.tipo}</div>
              <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>{row.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Consejo pro */}
      <div style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid #00ff8830', borderRadius: 12, padding: '16px 20px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>💡</span>
        <div>
          <p style={{ color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 700, margin: '0 0 6px' }}>CONSEJO PRO</p>
          <p style={{ color: '#8b949e', fontSize: '0.8rem', margin: 0, lineHeight: 1.6 }}>
            El 90% de los problemas de lag se resuelven con <strong style={{ color: '#e6edf3' }}>cable Ethernet + pausar descargas</strong>.
            Si seguís con ping alto, probá <strong style={{ color: '#e6edf3' }}>ExitLag</strong> o <strong style={{ color: '#e6edf3' }}>Mudfish</strong> — optimizan la ruta de red hacia los servidores de EA y Konami.
          </p>
        </div>
      </div>

    </div>
  );
}


      {/* ── ADVERTENCIA VPN / REGIÓN ── */}
      {vpnWarning && (
        <div style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid #ff475780', borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>🚫</span>
          <span style={{ color: '#ff4757', fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: '0.82rem' }}>{vpnWarning}</span>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1rem,3.5vw,1.4rem)', fontWeight: 900, color: '#e6edf3', letterSpacing: 1.5, margin: 0 }}>
          📡 PING & LATENCIA
        </h1>
        <p style={{ color: '#8b949e', fontSize: '0.82rem', marginTop: 6, marginBottom: 0 }}>
          Medí tu conexión a los servidores de LFA, FC 26 y eFootball y encontrá el más cercano a vos.
        </p>
      </div>

      {/* ── MEDIDORES EN GRID 3 COLUMNAS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 14, marginBottom: 28 }}>

        {/* SERVIDOR LFA */}
        <div style={{ background: '#0d1117', border: `1px solid ${resultado ? resultado.color + '50' : '#1c2028'}`, borderRadius: 14, padding: '18px 16px', textAlign: 'center', transition: 'border-color 0.3s' }}>
          <p style={{ color: '#8b949e', fontSize: '0.68rem', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1, marginTop: 0, marginBottom: 12 }}>SERVIDOR LFA</p>
          {resultado && !pinging ? (
            <div style={{ background: resultado.bg, border: `1px solid ${resultado.color}40`, borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'inline-block', minWidth: 110 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.8rem,5vw,2.6rem)', fontWeight: 900, color: resultado.color, lineHeight: 1 }}>
                {resultado.ms}<span style={{ fontSize: '0.85rem', marginLeft: 4 }}>ms</span>
              </div>
              <div style={{ color: resultado.color, fontSize: '0.65rem', fontWeight: 900, letterSpacing: 2, marginTop: 5 }}>{resultado.icon} {resultado.label}</div>
            </div>
          ) : (
            <div style={{ background: '#0b0e14', border: '1px solid #1c2028', borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'inline-block', minWidth: 110 }}>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.8rem,5vw,2.6rem)', fontWeight: 900, color: '#30363d', lineHeight: 1 }}>{pinging ? '...' : '—'}</div>
              <div style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 900, letterSpacing: 2, marginTop: 5 }}>{pinging ? 'MIDIENDO...' : 'SIN DATOS'}</div>
            </div>
          )}
          {error && <p style={{ color: '#ff4757', fontSize: '0.7rem', margin: '0 0 8px' }}>{error}</p>}
          <button onClick={medirLfa} disabled={pinging} style={{ background: pinging ? '#0d1117' : '#00ff88', color: pinging ? '#8b949e' : '#0b0e14', border: pinging ? '1px solid #30363d' : 'none', borderRadius: 8, padding: '9px 20px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, letterSpacing: 1, cursor: pinging ? 'not-allowed' : 'pointer', transition: '0.2s' }}>
            {pinging ? '⏳ MIDIENDO...' : resultado ? '🔄 VOLVER' : '▶ MEDIR'}
          </button>
          {historial.length > 1 && (
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 3, height: 28 }}>
              {historial.map((ms, i) => { const cl = clasificarPing(ms); const h = Math.max(5, Math.min(28, Math.round((200 - ms) / 7))); return <div key={i} title={`${ms}ms`} style={{ width: 8, height: h, background: cl.color, borderRadius: 2, opacity: i === historial.length - 1 ? 1 : 0.35 + (i / historial.length) * 0.5 }} />; })}
              {promedio !== null && <span style={{ color: '#8b949e', fontSize: '0.62rem', marginLeft: 6, alignSelf: 'center' }}>prom {promedio}ms</span>}
            </div>
          )}
        </div>

        {/* SERVIDOR FC26 */}
        <GameMeter
          title="SERVIDOR FC 26"
          accentColor="#58a6ff"
          data={fc26Ping}
          loading={fc26Loading}
          disabled={!userCountry}
          onMedir={medirFc26}
          nearestServer={userCountry ? fc26Server : undefined}
        />

        {/* SERVIDOR eFOOTBALL */}
        <GameMeter
          title="SERVIDOR eFOOTBALL"
          accentColor="#009ee3"
          data={efootballPing}
          loading={efootballLoading}
          disabled={!userCountry}
          onMedir={medirEfootball}
          nearestServer={userCountry ? efootServer : undefined}
        />
      </div>

      {/* ── REFERENCIA DE COLORES ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {[
          { ms: '< 50ms',    label: 'Excelente',  color: '#00ff88' },
          { ms: '50-80ms',   label: 'Muy bueno',  color: '#00e676' },
          { ms: '80-120ms',  label: 'Aceptable',  color: '#ffd700' },
          { ms: '120-180ms', label: 'Alto',        color: '#ff9800' },
          { ms: '> 180ms',   label: 'Muy alto',   color: '#ff4757' },
        ].map(r => (
          <div key={r.ms} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1c2028', borderRadius: 20, padding: '4px 12px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
            <span style={{ color: '#8b949e', fontSize: '0.68rem' }}><b style={{ color: r.color }}>{r.ms}</b> — {r.label}</span>
          </div>
        ))}
      </div>

      {/* ── ¿PUEDO VER PING ARGENTINA VS COLOMBIA? ── */}
      <div style={{ background: '#0d1117', border: '1px solid #ffd70030', borderRadius: 14, padding: '20px', marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900, color: '#ffd700', letterSpacing: 2, marginTop: 0, marginBottom: 14 }}>
          🌎 ¿PUEDO VER EL PING ARGENTINA VS COLOMBIA?
        </h2>
        <p style={{ color: '#8b949e', fontSize: '0.82rem', lineHeight: 1.7, margin: '0 0 14px' }}>
          <strong style={{ color: '#e6edf3' }}>Desde el navegador, solo medís tu propio ping</strong> al servidor —
          no es posible medir el ping entre dos países distintos desde un solo punto.
          Para comparar, <strong style={{ color: '#e6edf3' }}>ambos jugadores deben abrir esta sección y comparar su resultado</strong> al mismo servidor.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 10 }}>
          {[
            { flag: '🇦🇷', pais: 'Argentina', servidor: 'Buenos Aires (EA FC26)', ping: '20–60ms',   color: '#00ff88' },
            { flag: '🇧🇷', pais: 'Brasil',    servidor: 'São Paulo (EA FC26)',    ping: '15–50ms',   color: '#00ff88' },
            { flag: '🇨🇴', pais: 'Colombia',  servidor: 'Buenos Aires (EA FC26)', ping: '80–140ms',  color: '#ffd700' },
            { flag: '🇨🇱', pais: 'Chile',     servidor: 'Buenos Aires (EA FC26)', ping: '40–90ms',   color: '#00e676' },
            { flag: '🇲🇽', pais: 'México',    servidor: 'Dallas (EA FC26)',       ping: '20–60ms',   color: '#00ff88' },
            { flag: '🇪🇸', pais: 'España',    servidor: 'Madrid (EA FC26)',       ping: '10–40ms',   color: '#00ff88' },
            { flag: '🇵🇪', pais: 'Perú',      servidor: 'Buenos Aires (EA FC26)', ping: '60–120ms',  color: '#ffd700' },
            { flag: '🇺🇸', pais: 'EEUU',      servidor: 'Ashburn/Dallas (EA)',    ping: '10–50ms',   color: '#00ff88' },
          ].map(r => (
            <div key={r.pais} style={{ background: '#161b22', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.8rem' }}>{r.flag}</span>
              <div>
                <div style={{ color: '#e6edf3', fontWeight: 700, fontSize: '0.82rem' }}>{r.pais}</div>
                <div style={{ color: '#8b949e', fontSize: '0.68rem' }}>{r.servidor}</div>
                <div style={{ color: r.color, fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, marginTop: 3 }}>~{r.ping}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ color: '#4a5568', fontSize: '0.7rem', marginTop: 14, marginBottom: 0 }}>
          * Valores aproximados en condiciones normales de red. Varían según ISP, hora pico y enrutamiento.
        </p>
      </div>

      {/* ── TIPS ANTI-LAG ── */}
      <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900, color: '#58a6ff', letterSpacing: 2, marginBottom: 14, marginTop: 0 }}>
        🛠️ CÓMO REDUCIR EL LAG
      </h2>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>CONEXIÓN FÍSICA</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard priority="alta" emoji="🔌" title="Usá siempre cable de red Ethernet" body="Es la mejora más grande que podés hacer. El WiFi agrega entre 20-80ms extra y tiene jitter (variación de ping) que afecta mucho a los juegos de fútbol. Conectá la consola o PC directo al router con cable Cat5e o Cat6." />
        <TipCard emoji="📍" title="Acercá el router si no podés usar cable" body="Asegurate de estar cerca del router. Paredes de hormigón y microondas interfieren la señal 2.4GHz. Usá la banda de 5GHz si tu router y consola lo soportan." />
        <TipCard emoji="🔁" title="Reiniciá el router seguido" body="Un router prendido por días puede acumular conexiones y perder paquetes. Apagalo 30 segundos y volvé a encenderlo." />
      </div>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>CONFIGURACIÓN DE RED</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard priority="alta" emoji="🌐" title="Cambiá el DNS a uno más rápido" body="Cambiá el DNS en tu consola o router a Cloudflare 1.1.1.1 / 1.0.0.1 o Google 8.8.8.8 / 8.8.4.4. Mejora los tiempos de conexión a los servidores del juego." />
        <TipCard emoji="⚡" title="Activá QoS en el router" body="QoS le da prioridad al tráfico de juego sobre el streaming o las descargas. Buscá la opción en el panel del router (192.168.0.1 o 192.168.1.1) y dales prioridad a tu consola o PC." />
        <TipCard emoji="🔓" title="NAT Abierto (Tipo A / Tipo 1)" body="En PS5/PS4: Configuración → Red → Tipo de NAT → debe decir Tipo A o Tipo B. Tipo C causa lag. Si lo tenés, activá UPnP en el router o configurá DMZ para tu consola." />
      </div>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>LIBERAR ANCHO DE BANDA</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard emoji="📥" title="Pausá las descargas y actualizaciones" body="Una descarga activa puede disparar el ping al doble o triple. Verificá que no haya actualizaciones en segundo plano en la consola, Steam, Epic o Windows Update." />
        <TipCard emoji="📱" title="Desconectá dispositivos que no usás" body="Pedile a las personas en tu casa que pausen el streaming (Netflix, YouTube) mientras jugás torneos importantes." />
        <TipCard emoji="🎵" title="Cerrá apps en segundo plano" body="Spotify, Discord con video, YouTube y OneDrive/Google Drive sincronizando consumen red. Cerrá todo lo que no necesitás mientras jugás." />
      </div>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>TIPO DE CONEXIÓN</p>
      <div style={{ background: '#0d1117', border: '1px solid #1c2028', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
        {[
          { tipo: 'Fibra óptica',  icon: '🥇', color: '#00ff88', desc: 'Menor latencia, sin jitter. Ideal para torneos. Latencia típica: 5–20ms al servidor.' },
          { tipo: 'Cable coaxial', icon: '🥈', color: '#58a6ff', desc: 'Buena para gaming, puede tener jitter en hora pico. 10–40ms.' },
          { tipo: 'ADSL / VDSL',   icon: '🥉', color: '#ffd700', desc: 'Funciona, pero la latencia es mayor (30–80ms). Poco margen para el lag.' },
          { tipo: 'Datos móviles', icon: '⚠️', color: '#ff9800', desc: '4G tiene picos de 50–200ms. 5G mejora, pero hay jitter por handover. Usalo como último recurso.' },
          { tipo: 'Satelital',     icon: '🚫', color: '#ff4757', desc: 'Latencia de 600ms+. Starlink mejora a ~40ms pero con variación alta. No recomendado para torneos.' },
        ].map((row, i, arr) => (
          <div key={row.tipo} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid #1c2028' : 'none' }}>
            <span style={{ fontSize: '1.2rem', width: 28, textAlign: 'center' }}>{row.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: row.color, fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 700, marginBottom: 2 }}>{row.tipo}</div>
              <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>{row.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Consejo pro */}
      <div style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid #00ff8830', borderRadius: 12, padding: '16px 20px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>💡</span>
        <div>
          <p style={{ color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 700, margin: '0 0 6px' }}>CONSEJO PRO</p>
          <p style={{ color: '#8b949e', fontSize: '0.8rem', margin: 0, lineHeight: 1.6 }}>
            El 90% de los problemas de lag se resuelven con <strong style={{ color: '#e6edf3' }}>cable Ethernet + pausar descargas</strong>.
            Si seguís con ping alto, probá <strong style={{ color: '#e6edf3' }}>ExitLag</strong> o <strong style={{ color: '#e6edf3' }}>Mudfish</strong> — optimizan la ruta de red hacia los servidores de EA y Konami.
          </p>
        </div>
      </div>

    </div>
  );
}
