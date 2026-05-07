'use client';

/** Converts a flag emoji (🇦🇷, 🇧🇷…) to its ISO-2 code, or null if not a flag. */
export function flagEmojiToCode(emoji: string): string | null {
  const pts = [...emoji].map(c => c.codePointAt(0)!);
  if (pts.length === 2 && pts.every(p => p >= 0x1F1E6 && p <= 0x1F1FF)) {
    return String.fromCharCode(pts[0] - 0x1F1E6 + 65, pts[1] - 0x1F1E6 + 65).toLowerCase();
  }
  return null;
}

interface LogoImgProps {
  logo?: string;
  /** Box size in px (used for both width and height, except flag images keep aspect ratio) */
  size?: number;
  style?: React.CSSProperties;
}

/**
 * Renders a team logo correctly on all platforms including Windows PC.
 * - HTTP URL  → <img>
 * - Flag emoji → flagcdn image (fixes Windows not rendering flag emojis)
 * - Other emoji → <span>
 */
export default function LogoImg({ logo = '⚽', size = 36, style }: LogoImgProps) {
  const l = logo || '⚽';

  // HTTP(S) image URL
  if (l.startsWith('http')) {
    return (
      <img
        src={l}
        alt="logo"
        style={{
          width: size, height: size,
          borderRadius: Math.round(size / 5),
          objectFit: 'cover', flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  // Flag emoji → flagcdn (fixes Windows PC where flag emojis show as letter pairs)
  const code = flagEmojiToCode(l);
  if (code) {
    const h = Math.round(size * 0.75);
    return (
      <img
        src={`https://flagcdn.com/${size * 2}x${h * 2}/${code}.png`}
        alt={code.toUpperCase()}
        style={{
          width: size, height: h, borderRadius: 3,
          flexShrink: 0, objectFit: 'cover', alignSelf: 'center',
          ...style,
        }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  // Plain emoji or text
  return (
    <span style={{ fontSize: `${Math.round(size * 0.6)}px`, lineHeight: 1, flexShrink: 0, ...style }}>
      {l}
    </span>
  );
}
