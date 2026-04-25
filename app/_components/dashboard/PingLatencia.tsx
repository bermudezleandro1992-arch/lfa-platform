'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface ServerEntry { region: string; city: string; host: string }
interface PingResult  { ms: number; label: string; color: string; bg: string; icon: string }
interface GamePing    { ms: number | null; server?: ServerEntry; error?: string }

// ─── Servidores FC26 (EA) por región ─────────────────────────────────────────
const FC26_SERVERS: ServerEntry[] = [
  { region: 'Sudamérica',   city: 'Buenos Aires', host: 'utas.s2.ea.com' },
  { region: 'Sudamérica',   city: 'São Paulo',    host: 'utas.s3.ea.com' },
  { region: 'Sudamérica',   city: 'Lima',         host: 'utas.s4.ea.com' },
  { region: 'Norteamérica', city: 'Dallas',       host: 'utas.s5.ea.com' },
  { region: 'Norteamérica', city: 'Ashburn',      host: 'utas.s6.ea.com' },
  { region: 'Norteamérica', city: 'Los Ángeles',  host: 'utas.s7.ea.com' },
  { region: 'México/Caribe',city: 'Cd. de México',host: 'utas.s8.ea.com' },
  { region: 'Europa',       city: 'Ámsterdam',    host: 'utas.s9.ea.com' },
  { region: 'Europa',       city: 'Londres',      host: 'utas.s10.ea.com' },
  { region: 'Europa',       city: 'Madrid',       host: 'utas.s11.ea.com' },
];

// ─── Servidores eFootball (Konami) ───────────────────────────────────────────
const EFOOTBALL_SERVERS: ServerEntry[] = [
  { region: 'Sudamérica', city: 'São Paulo', host: 'we-pes-mobile.konami.net' },
  { region: 'Europa',     city: 'Frankfurt', host: 'pes.konami.net' },
  { region: 'Asia',       city: 'Tokio',     host: 'pes-gameserver.konami.net' },
];

// ─── Clasificación por bloque geográfico ─────────────────────────────────────
const SUDAM  = ['AR','CL','PE','BR','UY','PY','BO','EC','CO','VE','GY','SR'];
const NORDAM = ['US','CA'];
const CARIBE = ['MX','GT','HN','SV','NI','CR','PA','CU','DO','PR','JM','HT'];
const EUROPA = ['ES','FR','DE','IT','GB','IE','NL','PT','CH','PL','FI','SE','NO','DK','BE','AT','GR','CZ','HU','RO','BG','HR','RS','UA','TR','IL'];

function getNearestServer(servers: ServerEntry[], country: string): ServerEntry {
  if (!country) return servers[0];
  if (SUDAM.includes(country))  return servers.find(s => s.region === 'Sudamérica')     ?? servers[0];
  if (NORDAM.includes(country)) return servers.find(s => s.region === 'Norteamérica')   ?? servers[0];
  if (CARIBE.includes(country)) return servers.find(s => s.region.startsWith('México')) ?? servers[0];
  if (EUROPA.includes(country)) return servers.find(s => s.region === 'Europa')          ?? servers[0];
  return servers[0];
}

// ─── Clasificar latencia ──────────────────────────────────────────────────────
function clasificarPing(ms: number): Omit<PingResult, 'ms'> {
  if (ms < 50)  return { label: 'EXCELENTE', color: '#00ff88', bg: 'rgba(0,255,136,0.08)', icon: '🟢' };
  if (ms < 80)  return { label: 'MUY BUENO', color: '#00e676', bg: 'rgba(0,230,118,0.08)', icon: '🟢' };
  if (ms < 120) return { label: 'ACEPTABLE', color: '#ffd700', bg: 'rgba(255,215,0,0.08)',  icon: '🟡' };
  if (ms < 180) return { label: 'ALTO',      color: '#ff9800', bg: 'rgba(255,152,0,0.08)', icon: '🟠' };
  return          { label: 'MUY ALTO',      color: '#ff4757', bg: 'rgba(255,71,87,0.08)', icon: '🔴' };
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
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

interface GameMeterProps {
  title: string; accentColor: string; data: GamePing | null;
  loading: boolean; onMedir: () => void; disabled: boolean; nearestServer?: ServerEntry;
}
function GameMeter({ title, accentColor, data, loading, onMedir, disabled, nearestServer }: GameMeterProps) {
  return (
    <div style={{ background: '#0d1117', border: `1px solid ${data?.ms != null ? accentColor + '40' : '#1c2028'}`, borderRadius: 14, padding: '18px 16px', textAlign: 'center', transition: 'border-color 0.3s' }}>
      <p style={{ color: '#8b949e', fontSize: '0.68rem', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1, marginTop: 0, marginBottom: 10 }}>{title}</p>
      {nearestServer && (
        <p style={{ color: accentColor, fontSize: '0.7rem', marginBottom: 8, opacity: 0.8 }}>
          📍 Servidor más cercano: <strong>{nearestServer.city}</strong> ({nearestServer.region})
        </p>
      )}
      {loading ? (
        <div style={{ color: accentColor, fontFamily: "'Orbitron',sans-serif", fontSize: '2rem', fontWeight: 900, marginBottom: 10 }}>⏳</div>
      ) : data?.ms != null ? (
        <div style={{ background: '#161b22', border: `1px solid ${accentColor}40`, borderRadius: 12, padding: '12px 20px', marginBottom: 10, display: 'inline-block', minWidth: 120 }}>
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1.8rem,5vw,2.4rem)', fontWeight: 900, color: accentColor }}>{data.ms}</span>
          <span style={{ fontSize: '0.85rem', marginLeft: 5, color: '#8b949e' }}>ms</span>
          <div style={{ color: accentColor, fontSize: '0.65rem', fontWeight: 900, letterSpacing: 2, marginTop: 4 }}>
            {clasificarPing(data.ms).icon} {clasificarPing(data.ms).label}
          </div>
        </div>
      ) : data?.error ? (
        <div style={{ color: '#ff9800', fontSize: '0.73rem', marginBottom: 10, lineHeight: 1.5 }}>
          ⚠️ {data.error}<br />
          <span style={{ color: '#8b949e', fontSize: '0.65rem' }}>Los servidores de EA/Konami bloquean pings externos. Esto es normal.</span>
        </div>
      ) : null}
      <button
        onClick={onMedir}
        disabled={disabled || loading}
        style={{ background: disabled || loading ? '#161b22' : accentColor, color: disabled || loading ? '#8b949e' : '#0b0e14', border: disabled || loading ? `1px solid ${accentColor}30` : 'none', borderRadius: 8, padding: '9px 22px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 900, letterSpacing: 1.2, cursor: disabled || loading ? 'not-allowed' : 'pointer', transition: '0.2s' }}>
        {loading ? 'MIDIENDO...' : data ? '🔄 VOLVER A MEDIR' : '▶ MEDIR PING'}
      </button>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PingLatencia() {
  // Estado LFA
  const [pinging,   setPinging]   = useState(false);
  const [resultado, setResultado] = useState<PingResult | null>(null);
  const [historial, setHistorial] = useState<number[]>([]);
  const [error,     setError]     = useState<string | null>(null);
  // Estado FC26 / eFootball
  const [fc26Loading,      setFc26Loading]      = useState(false);
  const [efootballLoading, setEfootballLoading] = useState(false);
  const [fc26Ping,         setFc26Ping]         = useState<GamePing | null>(null);
  const [efootballPing,    setEfootballPing]    = useState<GamePing | null>(null);
  // VPN / región
  const [vpnWarning,  setVpnWarning]  = useState<string | null>(null);
  const [userCountry, setUserCountry] = useState<string>('');
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detectar región/VPN al montar
  useEffect(() => {
    fetch('/api/detect-region').then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setUserCountry(data.country || '');
      if (data.isVpn) {
        setVpnWarning('⚠️ Estás usando VPN — El ping puede no ser real y solo podés unirte a torneos GLOBAL.');
      } else if (data.region && data.userRegion && data.region !== data.userRegion) {
        setVpnWarning('⚠️ Tu región detectada no coincide con tu perfil. Solo podés unirte a torneos GLOBAL.');
      }
    }).catch(() => {/* silencioso */});
    return () => { if (warningRef.current) clearTimeout(warningRef.current); };
  }, []);

  // Medir LFA
  const medirLfa = useCallback(async () => {
    setPinging(true);
    setError(null);
    try {
      const muestras: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        await fetch('/api/server-ip', { cache: 'no-store' });
        muestras.push(Math.round(performance.now() - t0));
      }
      muestras.shift(); // descarta warm-up
      const ms = Math.round(muestras.reduce((a, b) => a + b, 0) / muestras.length);
      setResultado({ ms, ...clasificarPing(ms) });
      setHistorial(prev => [...prev.slice(-9), ms]);
    } catch { setError('No se pudo medir. Verificá tu conexión.'); }
    finally { setPinging(false); }
  }, []);

  // Medir FC26
  const medirFc26 = useCallback(async () => {
    setFc26Loading(true);
    const server = getNearestServer(FC26_SERVERS, userCountry);
    try {
      const t0 = performance.now();
      await fetch(`https://${server.host}`, { mode: 'no-cors', cache: 'no-store' });
      setFc26Ping({ ms: Math.round(performance.now() - t0), server });
    } catch {
      setFc26Ping({ ms: null, server, error: 'Sin respuesta directa (CORS restringido por EA).' });
    }
    setFc26Loading(false);
  }, [userCountry]);

  // Medir eFootball
  const medirEfootball = useCallback(async () => {
    setEfootballLoading(true);
    const server = getNearestServer(EFOOTBALL_SERVERS, userCountry);
    try {
      const t0 = performance.now();
      await fetch(`https://${server.host}`, { mode: 'no-cors', cache: 'no-store' });
      setEfootballPing({ ms: Math.round(performance.now() - t0), server });
    } catch {
      setEfootballPing({ ms: null, server, error: 'Sin respuesta directa (CORS restringido por Konami).' });
    }
    setEfootballLoading(false);
  }, [userCountry]);

  const promedio    = historial.length ? Math.round(historial.reduce((a, b) => a + b, 0) / historial.length) : null;
  const fc26Server  = getNearestServer(FC26_SERVERS, userCountry);
  const efootServer = getNearestServer(EFOOTBALL_SERVERS, userCountry);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(16px,4vw,32px) clamp(12px,4vw,24px)' }}>

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
