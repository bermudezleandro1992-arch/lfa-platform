/**
 * LfaCoin — ícono de moneda LFA Coins
 * SVG escalable. Usá el prop `size` para controlar el tamaño.
 * Cada instancia genera IDs únicos para que múltiples coins en pantalla no colisionen.
 */

let _counter = 0;

interface LfaCoinProps {
  size?: number;
  style?: React.CSSProperties;
  glow?: boolean;
}

export function LfaCoin({ size = 24, style, glow = false }: LfaCoinProps) {
  const id = `lfa${++_counter}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      <defs>
        {/* Gradiente dorado principal */}
        <radialGradient id={`cg-${id}`} cx="38%" cy="28%" r="70%">
          <stop offset="0%"   stopColor="#FFF176" />
          <stop offset="25%"  stopColor="#FFD700" />
          <stop offset="65%"  stopColor="#F3BA2F" />
          <stop offset="100%" stopColor="#B8760A" />
        </radialGradient>
        {/* Reflejo/brillo */}
        <radialGradient id={`sh-${id}`} cx="28%" cy="22%" r="55%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.52)" />
          <stop offset="70%"  stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        {/* Rim gradient para el borde */}
        <linearGradient id={`rim-${id}`} x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%"   stopColor="#D4950F" />
          <stop offset="50%"  stopColor="#96640A" />
          <stop offset="100%" stopColor="#C8860A" />
        </linearGradient>
        {glow && (
          <filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Sombra sutil de profundidad */}
      <ellipse cx="22" cy="24" rx="17" ry="5" fill="rgba(0,0,0,0.28)" />

      {/* Borde exterior (rim) */}
      <circle cx="22" cy="21" r="20.5" fill={`url(#rim-${id})`} />

      {/* Aro interior más claro */}
      <circle cx="22" cy="21" r="19" fill="#C8860A" />

      {/* Cara principal de la moneda */}
      <circle
        cx="22" cy="21" r="17.5"
        fill={`url(#cg-${id})`}
        filter={glow ? `url(#glow-${id})` : undefined}
      />

      {/* Anillo decorativo grabado */}
      <circle cx="22" cy="21" r="14.5" fill="none" stroke="rgba(140,80,5,0.35)" strokeWidth="1" />

      {/* Brillo superpuesto */}
      <circle cx="22" cy="21" r="17.5" fill={`url(#sh-${id})`} />

      {/* Texto "LF" grabado */}
      <text
        x="22"
        y="27.5"
        textAnchor="middle"
        fontSize="13.5"
        fontWeight="900"
        fontFamily="'Arial Black', 'Arial', sans-serif"
        fill="rgba(100,55,5,0.85)"
        letterSpacing="-1.5"
        style={{ userSelect: 'none' }}
      >
        LF
      </text>

      {/* Reflejo pequeño en la parte superior izquierda (efecto 3D) */}
      <ellipse cx="16" cy="15" rx="4" ry="2.5" fill="rgba(255,255,255,0.18)" transform="rotate(-30 16 15)" />
    </svg>
  );
}
