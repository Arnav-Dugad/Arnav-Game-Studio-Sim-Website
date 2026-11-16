/*
 * Rival/own company badge: a rounded-square monogram on the company's brand-adjacent colour with a lighter
 * inner ring (docs/ART.md §6). Deliberately generic — never a logo, never a wordmark.
 */

const STOP_WORDS = new Set([
  'the',
  'inc',
  'inc.',
  'games',
  'game',
  'gaming',
  'entertainment',
  'interactive',
  'studios',
  'studio',
  'software',
  'ltd',
  'llc',
  'co',
  'corp',
  'corporation',
  'company',
  'productions',
  'digital',
  'media',
  'group',
  'holdings',
  'and',
  'of',
  '&',
]);

function monogram(name: string): string {
  const raw = name
    .trim()
    .split(/[\s\-_/.,]+/)
    .filter(Boolean);
  const words = raw.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const use = (words.length ? words : raw).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  const first = use[0];
  if (!first) return '?';
  const second = use[1];
  if (second) return (first.charAt(0) + second.charAt(0)).toUpperCase();
  // Single word: take an inner capital if the name is CamelCase ("MegaSoft" → "MS"), otherwise one letter.
  const inner = /^.[^A-Z]*([A-Z])/.exec(first)?.[1];
  return (first.charAt(0) + (inner ?? '')).toUpperCase();
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function lighten(rgb: [number, number, number], t: number): string {
  return `rgb(${rgb.map((v) => Math.round(v + (255 - v) * t)).join(' ')})`;
}

export function CompanyBadge({
  name,
  color,
  size = 36,
  className,
}: {
  name: string;
  /** Brand-adjacent tint (hex preferred; any CSS colour works with a white monogram). */
  color: string;
  size?: number;
  className?: string;
}) {
  const letters = monogram(name);
  const rgb = parseHex(color);
  const light = rgb ? luminance(rgb) > 0.45 : false;
  const ink = light ? '#1E1A16' : '#FFFFFF';
  const ring = rgb ? lighten(rgb, light ? 0.55 : 0.4) : 'rgb(255 255 255 / 0.45)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label={`${name} badge`}
      focusable="false"
    >
      <rect x={0.5} y={0.5} width={39} height={39} rx={10} fill={color} />
      <rect x={0.5} y={0.5} width={39} height={20} rx={10} fill="#FFFFFF" opacity={0.1} />
      <rect x={3.5} y={3.5} width={33} height={33} rx={7.5} fill="none" stroke={ring} strokeWidth={1.3} opacity={0.9} />
      <text
        x={20}
        y={21}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={letters.length > 1 ? 15 : 19}
        fontWeight={700}
        fill={ink}
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
      >
        {letters}
      </text>
    </svg>
  );
}
