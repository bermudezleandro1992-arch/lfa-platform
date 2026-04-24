'use client';

import { useState, useCallback } from 'react';

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface PingResult {
  ms: number;
  label: string;
  color: string;
  bg: string;
  icon: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clasificarPing(ms: number): Omit<PingResult, 'ms'> {
  if (ms < 50)  return { label: 'EXCELENTE',  color: '#00ff88', bg: 'rgba(0,255,136,0.08)', icon: '🟢' };
  if (ms < 80)  return { label: 'MUY BUENO',  color: '#00e676', bg: 'rgba(0,230,118,0.08)', icon: '🟢' };
  if (ms < 120) return { label: 'ACEPTABLE',  color: '#ffd700', bg: 'rgba(255,215,0,0.08)',  icon: '🟡' };
  if (ms < 180) return { label: 'ALTO',       color: '#ff9800', bg: 'rgba(255,152,0,0.08)', icon: '🟠' };
  return          { label: 'MUY ALTO',       color: '#ff4757', bg: 'rgba(255,71,87,0.08)', icon: '🔴' };
}

// ─── Sección de tip ───────────────────────────────────────────────────────────
function TipCard({ emoji, title, body, priority }: { emoji: string; title: string; body: string; priority?: 'alta' | 'media' }) {
  const borderColor = priority === 'alta' ? '#00ff8840' : '#1c2028';
  const tagColor    = priority === 'alta' ? '#00ff88' : '#58a6ff';
  const tagLabel    = priority === 'alta' ? 'PRIORIDAD' : undefined;

  return (
    <div style={{
      background: '#0d1117',
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      gap: 14,
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ color: '#e6edf3', fontFamily: "'Orbitron',sans-serif", fontSize: '0.7rem', fontWeight: 700, letterSpacing: 0.5 }}>
            {title}
          </span>
          {tagLabel && (
            <span style={{ background: `${tagColor}20`, color: tagColor, fontSize: '0.55rem', fontWeight: 900, padding: '1px 6px', borderRadius: 4, letterSpacing: 1 }}>
              {tagLabel}
            </span>
          )}
        </div>
        <p style={{ color: '#8b949e', fontSize: '0.78rem', margin: 0, lineHeight: 1.6 }}>
          {body}
        </p>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PingLatencia() {
  const [pinging,   setPinging]   = useState(false);
  const [resultado, setResultado] = useState<PingResult | null>(null);
  const [historial, setHistorial] = useState<number[]>([]);
  const [error,     setError]     = useState<string | null>(null);

  const medir = useCallback(async () => {
    setPinging(true);
    setError(null);
    try {
      // 3 muestras para mayor precisión, descarta la primera (warm-up)
      const muestras: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        await fetch('/api/server-ip', { cache: 'no-store' });
        muestras.push(Math.round(performance.now() - t0));
      }
      muestras.shift(); // descarta warm-up
      const ms = Math.round(muestras.reduce((a, b) => a + b, 0) / muestras.length);
      const clase = clasificarPing(ms);
      setResultado({ ms, ...clase });
      setHistorial(prev => [...prev.slice(-9), ms]);
    } catch {
      setError('No se pudo medir. Verificá tu conexión.');
    } finally {
      setPinging(false);
    }
  }, []);

  const promedio = historial.length
    ? Math.round(historial.reduce((a, b) => a + b, 0) / historial.length)
    : null;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 'clamp(16px,4vw,32px) clamp(12px,4vw,24px)' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: "'Orbitron',sans-serif",
          fontSize: 'clamp(1rem,3.5vw,1.4rem)',
          fontWeight: 900,
          color: '#e6edf3',
          letterSpacing: 1.5,
          margin: 0,
        }}>
          📡 PING & LATENCIA
        </h1>
        <p style={{ color: '#8b949e', fontSize: '0.82rem', marginTop: 6, marginBottom: 0 }}>
          Medí tu conexión al servidor LFA y aplicá los tips para eliminar el lag.
        </p>
      </div>

      {/* Medidor de ping */}
      <div style={{
        background: '#0d1117',
        border: '1px solid #1c2028',
        borderRadius: 14,
        padding: '24px 20px',
        marginBottom: 28,
        textAlign: 'center',
      }}>
        <p style={{ color: '#8b949e', fontSize: '0.72rem', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1, marginTop: 0, marginBottom: 16 }}>
          TEST DE LATENCIA — SERVIDOR LFA
        </p>

        {/* Resultado */}
        {resultado && !pinging ? (
          <div style={{ background: resultado.bg, border: `1px solid ${resultado.color}40`, borderRadius: 12, padding: '18px 24px', marginBottom: 16, display: 'inline-block', minWidth: 200 }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(2.4rem,8vw,3.5rem)', fontWeight: 900, color: resultado.color, lineHeight: 1 }}>
              {resultado.ms}
              <span style={{ fontSize: '0.9rem', fontWeight: 400, marginLeft: 6 }}>ms</span>
            </div>
            <div style={{ color: resultado.color, fontSize: '0.72rem', fontWeight: 900, letterSpacing: 2, marginTop: 6 }}>
              {resultado.icon} {resultado.label}
            </div>
          </div>
        ) : (
          <div style={{ background: '#0b0e14', border: '1px solid #1c2028', borderRadius: 12, padding: '18px 24px', marginBottom: 16, display: 'inline-block', minWidth: 200 }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 'clamp(2.4rem,8vw,3.5rem)', fontWeight: 900, color: '#30363d', lineHeight: 1 }}>
              {pinging ? '...' : '—'}
              {!pinging && <span style={{ fontSize: '0.9rem' }}></span>}
            </div>
            <div style={{ color: '#30363d', fontSize: '0.72rem', fontWeight: 900, letterSpacing: 2, marginTop: 6 }}>
              {pinging ? 'MIDIENDO...' : 'SIN DATOS'}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{ color: '#ff4757', fontSize: '0.75rem', margin: '0 0 12px' }}>{error}</p>
        )}

        {/* Botón */}
        <div>
          <button
            onClick={medir}
            disabled={pinging}
            style={{
              background: pinging ? '#0d1117' : '#00ff88',
              color: pinging ? '#8b949e' : '#0b0e14',
              border: pinging ? '1px solid #30363d' : 'none',
              borderRadius: 8,
              padding: '11px 32px',
              fontFamily: "'Orbitron',sans-serif",
              fontSize: '0.75rem',
              fontWeight: 900,
              letterSpacing: 1.5,
              cursor: pinging ? 'not-allowed' : 'pointer',
              transition: '0.2s',
            }}
          >
            {pinging ? '⏳ MIDIENDO...' : resultado ? '🔄 VOLVER A MEDIR' : '▶ MEDIR PING'}
          </button>
        </div>

        {/* Historial */}
        {historial.length > 1 && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 4, height: 40 }}>
            {historial.map((ms, i) => {
              const cl = clasificarPing(ms);
              const h  = Math.max(8, Math.min(40, Math.round((200 - ms) / 5)));
              return (
                <div key={i} title={`${ms}ms`} style={{
                  width: 10,
                  height: h,
                  background: cl.color,
                  borderRadius: 3,
                  opacity: i === historial.length - 1 ? 1 : 0.4 + (i / historial.length) * 0.4,
                  transition: '0.3s',
                }} />
              );
            })}
            {promedio !== null && (
              <span style={{ color: '#8b949e', fontSize: '0.68rem', marginLeft: 8, alignSelf: 'center' }}>
                prom. {promedio}ms
              </span>
            )}
          </div>
        )}
      </div>

      {/* Referencia de colores */}
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

      {/* Tips ─────────────────────────────────────────────────── */}
      <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '0.75rem', fontWeight: 900, color: '#58a6ff', letterSpacing: 2, marginBottom: 14, marginTop: 0 }}>
        🛠️ CÓMO REDUCIR EL LAG
      </h2>

      {/* CONEXIÓN FÍSICA */}
      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>CONEXIÓN FÍSICA</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard
          priority="alta"
          emoji="🔌"
          title="Usá siempre cable de red Ethernet"
          body="Es la mejora más grande que podés hacer. El WiFi agrega entre 20-80ms extra y tiene jitter (variación de ping) que afecta mucho a los shooters y juegos de fútbol. Conectá la consola o PC directo al router con un cable Cat5e o Cat6."
        />
        <TipCard
          emoji="📍"
          title="Acercá el router si no podés usar cable"
          body="Si tenés que usar WiFi, asegurate de estar en la misma habitación que el router o cerca. Paredes de hormigón y microondas interfieren la señal de 2.4GHz. Usá la banda de 5GHz si tu router y consola lo soportan — tiene más velocidad y menos interferencia."
        />
        <TipCard
          emoji="🔁"
          title="Reiniciá el router seguido"
          body="Un router que lleva días prendido puede acumular conexiones y tener pérdida de paquetes. Reiniciarlo limpia la tabla de conexiones. Si tenés lag constante, apagalo 30 segundos y volvé a encenderlo."
        />
      </div>

      {/* CONFIGURACIÓN DE RED */}
      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>CONFIGURACIÓN DE RED</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard
          priority="alta"
          emoji="🌐"
          title="Cambiá el DNS a uno más rápido"
          body="El DNS por defecto de tu ISP suele ser lento. Cambialo en tu consola o router a: Cloudflare 1.1.1.1 / 1.0.0.1 o Google 8.8.8.8 / 8.8.4.4. Esto mejora los tiempos de conexión a los servidores del juego."
        />
        <TipCard
          emoji="⚡"
          title="Activá QoS (Quality of Service) en el router"
          body="QoS le da prioridad al tráfico de juego sobre el streaming o las descargas. Entrá al panel del router (generalmente 192.168.0.1 o 192.168.1.1) y buscá la opción QoS o Gaming Mode. Dale prioridad a tu consola o PC."
        />
        <TipCard
          emoji="🎮"
          title="Configurá IP fija para tu consola"
          body="Asignale una IP fija a tu consola en el router (DHCP Reservation). Esto evita que el router le cambie la IP y facilita la configuración de NAT abierto y reenvío de puertos."
        />
        <TipCard
          emoji="🔓"
          title="NAT Abierto (Tipo A / Tipo 1)"
          body="En PS5/PS4: Configuración → Red → Estado de la conexión → Tipo de NAT. Tiene que decir Tipo A o Tipo B. Tipo C o NAT estricto causa lag y problemas para encontrar partidas. Si tenés Tipo C, activá UPnP en el router o configurá DMZ para tu consola."
        />
      </div>

      {/* REDUCIR CONSUMO DE ANCHO DE BANDA */}
      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>LIBERAR ANCHO DE BANDA</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard
          emoji="📥"
          title="Pausá las descargas y actualizaciones"
          body="Una descarga activa en la consola o PC puede consumir todo el ancho de banda y disparar el ping al doble o triple. Antes de jugar, verificá que no haya actualizaciones en segundo plano en la consola, Steam, Epic o Windows Update."
        />
        <TipCard
          emoji="📱"
          title="Desconectá dispositivos que no usás"
          body="Cada celular, smart TV o tablet conectado al WiFi consume ancho de banda. Pedile a las personas en tu casa que pausen el streaming (Netflix, YouTube) mientras jugás torneos importantes."
        />
        <TipCard
          emoji="🎵"
          title="Cerrá apps en segundo plano"
          body="Spotify, Discord con video, navegadores con YouTube abierto, y OneDrive/Google Drive sincronizando archivos consumen red. Cerrá todo lo que no necesitás mientras jugás."
        />
      </div>

      {/* HARDWARE Y SOFTWARE */}
      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>HARDWARE & SOFTWARE</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <TipCard
          emoji="🛜"
          title="Router gaming o actualizá el firmware"
          body="Routers de más de 5 años pueden saturarse con pocas conexiones. Si podés, actualizá el firmware del router (en el panel de admin → Actualización/Firmware). Routers con chipsets Qualcomm Atheros manejan mejor el gaming."
        />
        <TipCard
          emoji="🖥️"
          title="Actualizá los drivers de red (PC)"
          body="Si jugás en PC, drivers de red desactualizados pueden causar micro-cortes. En Windows: Administrador de dispositivos → Adaptadores de red → Actualizar controlador. También desactivá el escalado de RSS si tenés problemas de jitter."
        />
        <TipCard
          emoji="🌡️"
          title="Temperatura del router"
          body="Un router muy caliente reduce su rendimiento (thermal throttling). Asegurate de que tenga ventilación, no esté encima de la TV ni bajo el decodificador de cable. Un router fresco procesa los paquetes más rápido."
        />
      </div>

      {/* PLAN DE INTERNET */}
      <p style={{ color: '#30363d', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>TIPO DE CONEXIÓN</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        <div style={{ background: '#0d1117', border: '1px solid #1c2028', borderRadius: 10, overflow: 'hidden' }}>
          {[
            { tipo: 'Fibra óptica',  icon: '🥇', color: '#00ff88', desc: 'Menor latencia, sin jitter. Ideal para torneos. Latencia típica: 5–20ms al servidor.' },
            { tipo: 'Cable coaxial', icon: '🥈', color: '#58a6ff', desc: 'Buena para gaming, puede tener algo de jitter en hora pico. 10–40ms.' },
            { tipo: 'ADSL / VDSL',   icon: '🥉', color: '#ffd700', desc: 'Funciona, pero la latencia es mayor (30–80ms). Poco margen para el lag.' },
            { tipo: 'Datos móviles', icon: '⚠️',  color: '#ff9800', desc: '4G tiene picos de 50–200ms. 5G mejora, pero hay jitter por handover de antenas. Usalo como último recurso.' },
            { tipo: 'Satelital',     icon: '🚫', color: '#ff4757', desc: 'Latencia de 600ms+ con Starlink mejora a ~40ms, pero con variación alta. No recomendado para torneos.' },
          ].map((row, i, arr) => (
            <div key={row.tipo} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderBottom: i < arr.length - 1 ? '1px solid #1c2028' : 'none',
            }}>
              <span style={{ fontSize: '1.2rem', width: 28, textAlign: 'center' }}>{row.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: row.color, fontFamily: "'Orbitron',sans-serif", fontSize: '0.65rem', fontWeight: 700, marginBottom: 2 }}>{row.tipo}</div>
                <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>{row.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Consejo final */}
      <div style={{
        background: 'rgba(0,255,136,0.05)',
        border: '1px solid #00ff8830',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 8,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>💡</span>
        <div>
          <p style={{ color: '#00ff88', fontFamily: "'Orbitron',sans-serif", fontSize: '0.68rem', fontWeight: 700, margin: '0 0 6px' }}>
            CONSEJO PRO
          </p>
          <p style={{ color: '#8b949e', fontSize: '0.8rem', margin: 0, lineHeight: 1.6 }}>
            El 90% de los problemas de lag se resuelven con{' '}
            <strong style={{ color: '#e6edf3' }}>cable Ethernet + pausar descargas</strong>.
            Si tenés ping alto aun así, el problema probablemente está en el proveedor de internet o en la distancia al servidor del juego. En ese caso, probá un servidor VPN gaming como{' '}
            <strong style={{ color: '#e6edf3' }}>ExitLag</strong> o <strong style={{ color: '#e6edf3' }}>Mudfish</strong>{' '}
            para optimizar la ruta de red hacia los servidores de EA o Konami.
          </p>
        </div>
      </div>
    </div>
  );
}
