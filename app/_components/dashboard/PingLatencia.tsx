'use client';

import { useState, useCallback, useEffect } from 'react';

// â”€â”€â”€ Tipos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ServerEntry {
  id: string; label: string; country: string; flag: string;
  host: string; region: 'SUR' | 'NORTE' | 'EUROPA'; game: 'FC26' | 'EFOOTBALL';
}
interface PingState { ms: number | null; status: 'idle' | 'measuring' | 'done' | 'error' }
interface ClientInfo { ip: string; country: string; countryName: string; city: string; region: string; isVpn: boolean }

// â”€â”€â”€ Servidores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SERVERS: ServerEntry[] = [
  // FC26 â€” RegiÃ³n Sur
  { id: 'fc26-bsas', label: 'Buenos Aires', country: 'Argentina', flag: 'ðŸ‡¦ðŸ‡·', host: 'utas.s2.ea.com',  region: 'SUR',   game: 'FC26' },
  { id: 'fc26-sao',  label: 'SÃ£o Paulo',    country: 'Brasil',    flag: 'ðŸ‡§ðŸ‡·', host: 'utas.s3.ea.com',  region: 'SUR',   game: 'FC26' },
  { id: 'fc26-lima', label: 'Lima',          country: 'PerÃº',      flag: 'ðŸ‡µðŸ‡ª', host: 'utas.s4.ea.com',  region: 'SUR',   game: 'FC26' },
  // FC26 â€” RegiÃ³n Norte
  { id: 'fc26-mex',  label: 'Cd. MÃ©xico',   country: 'MÃ©xico',    flag: 'ðŸ‡²ðŸ‡½', host: 'utas.s8.ea.com',  region: 'NORTE', game: 'FC26' },
  { id: 'fc26-dal',  label: 'Dallas',        country: 'EEUU',      flag: 'ðŸ‡ºðŸ‡¸', host: 'utas.s5.ea.com',  region: 'NORTE', game: 'FC26' },
  { id: 'fc26-ash',  label: 'Ashburn',       country: 'EEUU',      flag: 'ðŸ‡ºðŸ‡¸', host: 'utas.s6.ea.com',  region: 'NORTE', game: 'FC26' },
  // eFootball â€” RegiÃ³n Sur
  { id: 'ef-sao',    label: 'SÃ£o Paulo',     country: 'Brasil',    flag: 'ðŸ‡§ðŸ‡·', host: 'we-pes-mobile.konami.net',  region: 'SUR',   game: 'EFOOTBALL' },
  // eFootball â€” RegiÃ³n Norte
  { id: 'ef-fra',    label: 'Frankfurt',     country: 'Alemania',  flag: 'ðŸ‡©ðŸ‡ª', host: 'pes.konami.net',            region: 'EUROPA', game: 'EFOOTBALL' },
];

// â”€â”€â”€ Clasificar latencia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function clasificarPing(ms: number) {
  if (ms < 50)  return { label: 'EXCELENTE', color: '#00ff88', icon: 'ðŸŸ¢' };
  if (ms < 80)  return { label: 'MUY BUENO', color: '#00e676', icon: 'ðŸŸ¢' };
  if (ms < 120) return { label: 'ACEPTABLE', color: '#ffd700', icon: 'ðŸŸ¡' };
  if (ms < 180) return { label: 'ALTO',      color: '#ff9800', icon: 'ðŸŸ ' };
  return          { label: 'MUY ALTO',      color: '#ff4757', icon: 'ðŸ”´' };
}

// â”€â”€â”€ Medir ping a un host (browser fetch timing) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Sub-componente: TipCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Sub-componente: ServerPingRow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        {state.status === 'idle' && <span style={{ color: '#30363d', fontSize: '0.7rem' }}>â€”</span>}
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

// â”€â”€â”€ Componente principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          ip:          d.ip          ?? 'â€”',
          country:     d.country     ?? '??',
          countryName: d.countryName ?? 'Desconocido',
          city:        d.city        ?? 'â€”',
          region:      d.region      ?? 'â€”',
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

  // RegiÃ³n label
  const regionLabel = clientInfo
    ? clientInfo.region === 'LATAM_SUR'   ? 'ðŸŒŽ LATAM SUR'
    : clientInfo.region === 'LATAM_NORTE' ? 'ðŸŒŽ LATAM NORTE'
    : clientInfo.region === 'AMERICA'     ? 'ðŸŒŽ AMÃ‰RICA'
    : clientInfo.region
    : 'â€”';

  const surFc26   = SERVERS.filter(s => s.game === 'FC26'      && s.region === 'SUR');
  const norteFc26 = SERVERS.filter(s => s.game === 'FC26'      && s.region === 'NORTE');
  const efSur     = SERVERS.filter(s => s.game === 'EFOOTBALL' && s.region === 'SUR');
  const efEuropa  = SERVERS.filter(s => s.game === 'EFOOTBALL' && s.region === 'EUROPA');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(16px,4vw,32px) clamp(12px,4vw,24px)' }}>

      {/* â”€â”€ HEADER â”€â”€ */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(1rem,3.5vw,1.4rem)', fontWeight: 900, color: '#e6edf3', letterSpacing: 1.5, margin: 0 }}>
          ðŸ“¡ PING & LATENCIA
        </h1>
        <p style={{ color: '#8b949e', fontSize: '0.82rem', marginTop: 6, marginBottom: 0 }}>
          MedÃ­ tu ping a los servidores de FC 26 y eFootball en tu regiÃ³n.
        </p>
      </div>

      {/* â”€â”€ TARJETA TU CONEXIÃ“N â”€â”€ */}
      <div style={{ background: 'linear-gradient(135deg,#0d1117,#161b22)', border: `1px solid ${clientInfo?.isVpn ? '#ff475750' : '#00ff8830'}`, borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
        <p style={{ color: '#8b949e', fontFamily: "'Orbitron',sans-serif", fontSize: '0.62rem', letterSpacing: 2, margin: '0 0 14px', fontWeight: 700 }}>
          ðŸ’» TU CONEXIÃ“N
        </p>
        {loadingInfo ? (
          <div style={{ color: '#8b949e', fontSize: '0.8rem' }}>Detectando tu ubicaciÃ³n...</div>
        ) : clientInfo ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
            <div>
              <div style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>IP PÃšBLICA</div>
              <div style={{ color: '#e6edf3', fontFamily: 'monospace', fontSize: '0.88rem', fontWeight: 700 }}>{clientInfo.ip}</div>
            </div>
            <div>
              <div style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>PAÃS / CIUDAD</div>
              <div style={{ color: '#e6edf3', fontSize: '0.88rem', fontWeight: 700 }}>{clientInfo.countryName}</div>
              <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>{clientInfo.city}</div>
            </div>
            <div>
              <div style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>REGIÃ“N LFA</div>
              <div style={{ color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900 }}>{regionLabel}</div>
            </div>
            <div>
              <div style={{ color: '#4a5568', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>ESTADO</div>
              {clientInfo.isVpn ? (
                <div style={{ color: '#ff4757', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900 }}>ðŸš« VPN DETECTADA</div>
              ) : (
                <div style={{ color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontSize: '0.72rem', fontWeight: 900 }}>âœ… CONEXIÃ“N DIRECTA</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ color: '#ff4757', fontSize: '0.8rem' }}>No se pudo detectar tu ubicaciÃ³n.</div>
        )}
        {clientInfo?.isVpn && (
          <div style={{ marginTop: 12, background: 'rgba(255,71,87,0.08)', border: '1px solid #ff475730', borderRadius: 8, padding: '8px 12px', color: '#ff4757', fontSize: '0.73rem' }}>
            âš ï¸ EstÃ¡s usando VPN â€” El ping puede no ser real. Solo podÃ©s participar en torneos GLOBAL.
          </div>
        )}
      </div>

      {/* â”€â”€ BOTÃ“N MEDIR TODO â”€â”€ */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <button
          onClick={medirTodo}
          disabled={measuring}
          style={{ background: measuring ? '#161b22' : 'linear-gradient(135deg,#00ff88,#00cc6a)', color: measuring ? '#8b949e' : '#0b0e14', border: measuring ? '1px solid #30363d' : 'none', borderRadius: 10, padding: '12px 36px', fontFamily: "'Orbitron',sans-serif", fontSize: '0.78rem', fontWeight: 900, letterSpacing: 1.5, cursor: measuring ? 'not-allowed' : 'pointer', transition: '0.2s', boxShadow: measuring ? 'none' : '0 0 20px #00ff8840' }}
        >
          {measuring ? 'â³ MIDIENDO SERVIDORES...' : pings[SERVERS[0].id].status === 'idle' ? 'â–¶ MEDIR PING AHORA' : 'ðŸ”„ VOLVER A MEDIR'}
        </button>
        <p style={{ color: '#4a5568', fontSize: '0.68rem', marginTop: 8, marginBottom: 0 }}>
          Mide tu latencia a todos los servidores de RegiÃ³n Sur y Norte en paralelo
        </p>
      </div>

      {/* â”€â”€ FC26 â€” REGIÃ“N SUR â”€â”€ */}
      <div style={{ background: '#0d1117', border: '1px solid #58a6ff30', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ background: 'rgba(88,166,255,0.06)', padding: '10px 14px', borderBottom: '1px solid #58a6ff20', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#58a6ff', fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1 }}>FC 26 â€” REGIÃ“N SUR</span>
          <span style={{ color: '#4a5568', fontSize: '0.62rem' }}>Buenos Aires Â· SÃ£o Paulo Â· Lima</span>
        </div>
        {surFc26.map(srv => <ServerPingRow key={srv.id} srv={srv} state={pings[srv.id]} />)}
      </div>

      {/* â”€â”€ FC26 â€” REGIÃ“N NORTE â”€â”€ */}
      <div style={{ background: '#0d1117', border: '1px solid #58a6ff30', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ background: 'rgba(88,166,255,0.06)', padding: '10px 14px', borderBottom: '1px solid #58a6ff20', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#58a6ff', fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1 }}>FC 26 â€” REGIÃ“N NORTE</span>
          <span style={{ color: '#4a5568', fontSize: '0.62rem' }}>Dallas Â· Cd. MÃ©xico Â· Ashburn</span>
        </div>
        {norteFc26.map(srv => <ServerPingRow key={srv.id} srv={srv} state={pings[srv.id]} />)}
      </div>

      {/* â”€â”€ eFOOTBALL â”€â”€ */}
      <div style={{ background: '#0d1117', border: '1px solid #009ee330', borderRadius: 14, overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ background: 'rgba(0,158,227,0.06)', padding: '10px 14px', borderBottom: '1px solid #009ee320', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#009ee3', fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1 }}>eFOOTBALL â€” SERVIDORES</span>
        </div>
        {[...efSur, ...efEuropa].map(srv => <ServerPingRow key={srv.id} srv={srv} state={pings[srv.id]} />)}
        <div style={{ padding: '8px 14px', background: 'rgba(255,152,0,0.04)' }}>
          <span style={{ color: '#ff9800', fontSize: '0.65rem' }}>âš ï¸ Konami bloquea pings externos â€” si aparece "sin resp." es normal, el ping en juego suele ser diferente.</span>
        </div>
      </div>

      {/* â”€â”€ REFERENCIA DE COLORES â”€â”€ */}
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
            <span style={{ color: '#8b949e', fontSize: '0.68rem' }}><b style={{ color: r.color }}>{r.ms}</b> â€” {r.label}</span>
          </div>
        ))}
      </div>

      {/* â”€â”€ Â¿PUEDO VER PING ARGENTINA VS COLOMBIA? â”€â”€ */}
      <div style={{ background: '#0d1117', border: '1px solid #ffd70030', borderRadius: 14, padding: '20px', marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900, color: '#ffd700', letterSpacing: 2, marginTop: 0, marginBottom: 14 }}>
          ðŸŒŽ Â¿PUEDO VER EL PING ARGENTINA VS COLOMBIA?
        </h2>
        <p style={{ color: '#8b949e', fontSize: '0.82rem', lineHeight: 1.7, margin: '0 0 14px' }}>
          <strong style={{ color: '#e6edf3' }}>Desde el navegador, solo medÃ­s tu propio ping</strong> al servidor â€”
          no es posible medir el ping entre dos paÃ­ses distintos desde un solo punto.
          Para comparar, <strong style={{ color: '#e6edf3' }}>ambos jugadores deben abrir esta secciÃ³n y comparar su resultado</strong> al mismo servidor.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 10 }}>
          {[
            { flag: 'ðŸ‡¦ðŸ‡·', pais: 'Argentina', servidor: 'Buenos Aires (EA FC26)', ping: '20â€“60ms',   color: '#00ff88' },
            { flag: 'ðŸ‡§ðŸ‡·', pais: 'Brasil',    servidor: 'SÃ£o Paulo (EA FC26)',    ping: '15â€“50ms',   color: '#00ff88' },
            { flag: 'ðŸ‡¨ðŸ‡´', pais: 'Colombia',  servidor: 'Buenos Aires (EA FC26)', ping: '80â€“140ms',  color: '#ffd700' },
            { flag: 'ðŸ‡¨ðŸ‡±', pais: 'Chile',     servidor: 'Buenos Aires (EA FC26)', ping: '40â€“90ms',   color: '#00e676' },
            { flag: 'ðŸ‡²ðŸ‡½', pais: 'MÃ©xico',    servidor: 'Dallas (EA FC26)',       ping: '20â€“60ms',   color: '#00ff88' },
            { flag: 'ðŸ‡ªðŸ‡¸', pais: 'EspaÃ±a',    servidor: 'Madrid (EA FC26)',       ping: '10â€“40ms',   color: '#00ff88' },
            { flag: 'ðŸ‡µðŸ‡ª', pais: 'PerÃº',      servidor: 'Buenos Aires (EA FC26)', ping: '60â€“120ms',  color: '#ffd700' },
            { flag: 'ðŸ‡ºðŸ‡¸', pais: 'EEUU',      servidor: 'Ashburn/Dallas (EA)',    ping: '10â€“50ms',   color: '#00ff88' },
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
          * Valores aproximados en condiciones normales de red. VarÃ­an segÃºn ISP, hora pico y enrutamiento.
        </p>
      </div>

      {/* â”€â”€ TIPS ANTI-LAG â”€â”€ */}
      <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900, color: '#58a6ff', letterSpacing: 2, marginBottom: 14, marginTop: 0 }}>
        ðŸ› ï¸ CÃ“MO REDUCIR EL LAG
      </h2>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>CONEXIÃ“N FÃSICA</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard priority="alta" emoji="ðŸ”Œ" title="UsÃ¡ siempre cable de red Ethernet" body="Es la mejora mÃ¡s grande que podÃ©s hacer. El WiFi agrega entre 20-80ms extra y tiene jitter (variaciÃ³n de ping) que afecta mucho a los juegos de fÃºtbol. ConectÃ¡ la consola o PC directo al router con cable Cat5e o Cat6." />
        <TipCard emoji="ðŸ“" title="AcercÃ¡ el router si no podÃ©s usar cable" body="Asegurate de estar cerca del router. Paredes de hormigÃ³n y microondas interfieren la seÃ±al 2.4GHz. UsÃ¡ la banda de 5GHz si tu router y consola lo soportan." />
        <TipCard emoji="ðŸ”" title="ReiniciÃ¡ el router seguido" body="Un router prendido por dÃ­as puede acumular conexiones y perder paquetes. Apagalo 30 segundos y volvÃ© a encenderlo." />
      </div>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>CONFIGURACIÃ“N DE RED</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard priority="alta" emoji="ðŸŒ" title="CambiÃ¡ el DNS a uno mÃ¡s rÃ¡pido" body="CambiÃ¡ el DNS en tu consola o router a Cloudflare 1.1.1.1 / 1.0.0.1 o Google 8.8.8.8 / 8.8.4.4. Mejora los tiempos de conexiÃ³n a los servidores del juego." />
        <TipCard emoji="âš¡" title="ActivÃ¡ QoS en el router" body="QoS le da prioridad al trÃ¡fico de juego sobre el streaming o las descargas. BuscÃ¡ la opciÃ³n en el panel del router (192.168.0.1 o 192.168.1.1) y dales prioridad a tu consola o PC." />
        <TipCard emoji="ðŸ”“" title="NAT Abierto (Tipo A / Tipo 1)" body="En PS5/PS4: ConfiguraciÃ³n â†’ Red â†’ Tipo de NAT â†’ debe decir Tipo A o Tipo B. Tipo C causa lag. Si lo tenÃ©s, activÃ¡ UPnP en el router o configurÃ¡ DMZ para tu consola." />
      </div>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>LIBERAR ANCHO DE BANDA</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard emoji="ðŸ“¥" title="PausÃ¡ las descargas y actualizaciones" body="Una descarga activa puede disparar el ping al doble o triple. VerificÃ¡ que no haya actualizaciones en segundo plano en la consola, Steam, Epic o Windows Update." />
        <TipCard emoji="ðŸ“±" title="DesconectÃ¡ dispositivos que no usÃ¡s" body="Pedile a las personas en tu casa que pausen el streaming (Netflix, YouTube) mientras jugÃ¡s torneos importantes." />
        <TipCard emoji="ðŸŽµ" title="CerrÃ¡ apps en segundo plano" body="Spotify, Discord con video, YouTube y OneDrive/Google Drive sincronizando consumen red. CerrÃ¡ todo lo que no necesitÃ¡s mientras jugÃ¡s." />
      </div>

      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>TIPO DE CONEXIÃ“N</p>
      <div style={{ background: '#0d1117', border: '1px solid #1c2028', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
        {[
          { tipo: 'Fibra Ã³ptica',  icon: 'ðŸ¥‡', color: '#00ff88', desc: 'Menor latencia, sin jitter. Ideal para torneos. Latencia tÃ­pica: 5â€“20ms al servidor.' },
          { tipo: 'Cable coaxial', icon: 'ðŸ¥ˆ', color: '#58a6ff', desc: 'Buena para gaming, puede tener jitter en hora pico. 10â€“40ms.' },
          { tipo: 'ADSL / VDSL',   icon: 'ðŸ¥‰', color: '#ffd700', desc: 'Funciona, pero la latencia es mayor (30â€“80ms). Poco margen para el lag.' },
          { tipo: 'Datos mÃ³viles', icon: 'âš ï¸', color: '#ff9800', desc: '4G tiene picos de 50â€“200ms. 5G mejora, pero hay jitter por handover. Usalo como Ãºltimo recurso.' },
          { tipo: 'Satelital',     icon: 'ðŸš«', color: '#ff4757', desc: 'Latencia de 600ms+. Starlink mejora a ~40ms pero con variaciÃ³n alta. No recomendado para torneos.' },
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
        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>ðŸ’¡</span>
        <div>
          <p style={{ color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 700, margin: '0 0 6px' }}>CONSEJO PRO</p>
          <p style={{ color: '#8b949e', fontSize: '0.8rem', margin: 0, lineHeight: 1.6 }}>
            El 90% de los problemas de lag se resuelven con <strong style={{ color: '#e6edf3' }}>cable Ethernet + pausar descargas</strong>.
            Si seguÃ­s con ping alto, probÃ¡ <strong style={{ color: '#e6edf3' }}>ExitLag</strong> o <strong style={{ color: '#e6edf3' }}>Mudfish</strong> â€” optimizan la ruta de red hacia los servidores de EA y Konami.
          </p>
        </div>
      </div>

    </div>
  );
}
