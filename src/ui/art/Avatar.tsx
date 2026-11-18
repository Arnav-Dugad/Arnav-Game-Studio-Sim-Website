import { useId } from 'react';
import type { ReactNode } from 'react';

/*
 * Procedural portraits (docs/ART.md §5). Everything is layered flat SVG on a 100×100 grid, chosen from a
 * seeded mulberry32 stream so the same seed always yields the same person. Friendly and stylised —
 * never realistic, never a likeness of anyone. Real, legendary people get an InitialsBadge instead.
 */

// ── Seeded randomness ──────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scrambles small consecutive seeds so neighbours look unrelated. */
function scramble(n: number): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length) % arr.length] as T;
}

/** Weighted pick from [value, weight] pairs. */
function pickWeighted<T>(rand: () => number, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rand() * total;
  for (const [v, w] of entries) {
    x -= w;
    if (x <= 0) return v;
  }
  return (entries[entries.length - 1] as readonly [T, number])[0];
}

// ── Colour helpers ────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const c = ca.map((v, i) => Math.round(v + ((cb[i] ?? 0) - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const darken = (c: string, t: number) => mix(c, '#000000', t);
const lighten = (c: string, t: number) => mix(c, '#ffffff', t);

function luminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0.2;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const readableOn = (bg: string) => (luminance(bg) > 0.42 ? '#1E1A16' : '#FFFFFF');

// ── Palettes ──────────────────────────────────────────────────────

const SKIN = ['#FBE3D0', '#F5D0B5', '#ECBC97', '#DFA67D', '#C98B62', '#B27450', '#98603D', '#7D4A2F', '#613924', '#4A2C1D'] as const;

const HAIR_NATURAL = ['#1F1915', '#2F2219', '#4A3123', '#6B4630', '#8E3F22', '#B9652F', '#D4AE6A', '#E6D7B8', '#A39D94', '#5E5A55'] as const;
const HAIR_FUN = ['#2E8B88', '#7A5BB5', '#D06A8E', '#3D6EA8', '#E07A5F'] as const;

const TOPS = ['#E07A5F', '#3D85C6', '#9B6BD3', '#2EB5A8', '#E3B23C', '#5FA36A', '#6C7A89', '#C8553D', '#4F6D7A', '#D4A373', '#8E7DBE', '#2F4858', '#B5838D', '#457B9D'] as const;

const BACKDROPS = ['#F3D9C6', '#D6E4F0', '#E4DBF2', '#D3EFEA', '#F5E7C2', '#DCEBD6', '#F1D5DC', '#E6E1D6', '#D9E7E3', '#EADFD0'] as const;

const ACCESSORY = ['#E07A5F', '#3D85C6', '#2EB5A8', '#E3B23C', '#9B6BD3', '#2F4858', '#5FA36A', '#C8553D'] as const;

const IRIS = ['#5B3A24', '#3A2618', '#4C7A9E', '#5E8A5A', '#7A6A3C'] as const;

const FRAME = ['#2A2622', '#7A4E2D', '#3D6EA8', '#C8553D', '#8A8075'] as const;

// ── Geometry ─────────────────────────────────────────────────────

const CX = 50;
const CY = 46;
const EYE_Y = 47;
const EYE_DX = 7;

interface FaceShape {
  hw: number;
  el: (fill: string) => ReactNode;
}

const FACES: readonly FaceShape[] = [
  { hw: 17.5, el: (f) => <ellipse cx={CX} cy={CY} rx={17.5} ry={21} fill={f} /> },
  { hw: 19.5, el: (f) => <ellipse cx={CX} cy={CY} rx={19.5} ry={20} fill={f} /> },
  { hw: 18, el: (f) => <path d="M32 38Q32 25 50 25Q68 25 68 38L68 52Q68 66 50 67Q32 66 32 52Z" fill={f} /> },
  { hw: 18.5, el: (f) => <path d="M31.5 42Q31.5 25 50 25Q68.5 25 68.5 42Q68.5 57 56 64.5Q50 68 44 64.5Q31.5 57 31.5 42Z" fill={f} /> },
  { hw: 16.5, el: (f) => <ellipse cx={CX} cy={CY} rx={16.5} ry={22} fill={f} /> },
  { hw: 18.5, el: (f) => <path d="M32 40Q32 25 50 25Q68 25 68 40L69 52Q68 63 58 66.5Q50 69 42 66.5Q32 63 31 52Z" fill={f} /> },
];

export type HairStyle =
  | 'bald'
  | 'buzz'
  | 'crop'
  | 'swept'
  | 'curly'
  | 'afro'
  | 'long'
  | 'bob'
  | 'bun'
  | 'ponytail'
  | 'mohawk'
  | 'hijab'
  | 'beanie'
  | 'cap'
  | 'spiky'
  | 'wavy'
  | 'locs'
  | 'quiff';

const HAIR_WEIGHTS: readonly (readonly [HairStyle, number])[] = [
  ['bald', 4],
  ['buzz', 6],
  ['crop', 9],
  ['swept', 8],
  ['curly', 8],
  ['afro', 6],
  ['long', 9],
  ['bob', 7],
  ['bun', 6],
  ['ponytail', 6],
  ['mohawk', 3],
  ['hijab', 5],
  ['beanie', 4],
  ['cap', 4],
  ['spiky', 4],
  ['wavy', 7],
  ['locs', 5],
  ['quiff', 6],
];

/** Generic short-hair cap that hugs the head with a fringe edge across the forehead. */
function capPath(hw: number, top: number, fringe: number, sideBottom = 48): string {
  const L = CX - hw - 1.5;
  const R = CX + hw + 1.5;
  return [
    `M${L} ${sideBottom}`,
    `C${L - 0.5} 30 40 ${top} 50 ${top}`,
    `C60 ${top} ${R + 0.5} 30 ${R} ${sideBottom}`,
    `L${R - 3} ${sideBottom}`,
    `C${R - 3} 40 ${R - 5} 36 ${R - 9} ${33 + fringe * 0.4}`,
    `C58 ${35 + fringe} 42 ${35 + fringe} ${L + 7} ${32 + fringe * 0.4}`,
    `C${L + 4} 36 ${L + 3} 40 ${L + 3} ${sideBottom}Z`,
  ].join('');
}

interface Traits {
  bg: string;
  skin: string;
  top: string;
  topStyle: number;
  face: FaceShape;
  eyes: number;
  iris: string;
  brows: number;
  nose: number;
  hair: HairStyle;
  hairColor: string;
  hat: string;
  pompom: boolean;
  facial: 'none' | 'stubble' | 'mustache' | 'beard' | 'goatee';
  glasses: 'none' | 'round' | 'square';
  frame: string;
  headphones: boolean;
  earrings: boolean;
}

/** The parts of a portrait the office sprite copies, so a person looks the same in both places. */
export function portraitBasics(seed: number): { skin: string; hairColor: string; hat: string; hair: HairStyle; glasses: boolean; headphones: boolean } {
  const t = traitsFor(seed);
  return { skin: t.skin, hairColor: t.hairColor, hat: t.hat, hair: t.hair, glasses: t.glasses !== 'none', headphones: t.headphones };
}

function traitsFor(seed: number): Traits {
  const rand = mulberry32(scramble(seed));
  const bg = pick(rand, BACKDROPS);
  const skin = pick(rand, SKIN);
  const top = pick(rand, TOPS);
  const topStyle = Math.floor(rand() * 4);
  const face = pick(rand, FACES);
  const eyes = Math.floor(rand() * 6);
  const iris = pick(rand, IRIS);
  const brows = Math.floor(rand() * 5);
  const nose = Math.floor(rand() * 4);
  const hair = pickWeighted(rand, HAIR_WEIGHTS);
  const fun = rand() < 0.12;
  let hairColor: string = fun ? pick(rand, HAIR_FUN) : pick(rand, HAIR_NATURAL);
  if (hair === 'bald') hairColor = darken(skin, 0.45);
  const hat = pick(rand, ACCESSORY);
  const pompom = rand() < 0.5;
  const facialRoll = rand();
  const facial: Traits['facial'] =
    hair === 'hijab' || facialRoll > 0.3 ? 'none' : pick(rand, ['stubble', 'mustache', 'beard', 'goatee'] as const);
  const gRoll = rand();
  const glasses: Traits['glasses'] = gRoll < 0.14 ? 'round' : gRoll < 0.27 ? 'square' : 'none';
  const frame = pick(rand, FRAME);
  const hatted = hair === 'cap' || hair === 'beanie' || hair === 'hijab';
  const headphones = !hatted && rand() < 0.12;
  const earsVisible = hair !== 'hijab' && hair !== 'long' && hair !== 'wavy' && hair !== 'locs' && hair !== 'afro';
  const earrings = earsVisible && !headphones && rand() < 0.2;
  return { bg, skin, top, topStyle, face, eyes, iris, brows, nose, hair, hairColor, hat, pompom, facial, glasses, frame, headphones, earrings };
}

// ── Layers ───────────────────────────────────────────────────────

function hairBack(t: Traits): ReactNode {
  const { hw } = t.face;
  const L = CX - hw - 1.5;
  const R = CX + hw + 1.5;
  const c = t.hairColor;
  const shade = darken(c, 0.18);
  switch (t.hair) {
    case 'afro':
      return (
        <>
          <circle cx={CX} cy={37} r={hw + 12} fill={shade} />
          <circle cx={CX} cy={35} r={hw + 10.5} fill={c} />
        </>
      );
    case 'long':
      return (
        <path
          d={`M${L - 1} 46C${L - 2} 22 40 16 50 16C60 16 ${R + 2} 22 ${R + 1} 46L${R + 4} 84Q50 90 ${L - 4} 84Z`}
          fill={shade}
        />
      );
    case 'wavy':
      return (
        <path
          d={`M${L - 1.5} 44C${L - 2.5} 21 40 16 50 16C60 16 ${R + 2.5} 21 ${R + 1.5} 44C${R + 4} 52 ${R + 1} 58 ${R + 4} 66C${R + 6} 72 ${R + 1} 76 ${R - 3} 74L${L + 3} 74C${L - 1} 76 ${L - 6} 72 ${L - 4} 66C${L - 1} 58 ${L - 4} 52 ${L - 1.5} 44Z`}
          fill={shade}
        />
      );
    case 'bob':
      return (
        <path
          d={`M${L - 2} 44C${L - 3} 20 40 16 50 16C60 16 ${R + 3} 20 ${R + 2} 44L${R + 3} 65Q${R} 69 ${R - 4} 67L${L + 4} 67Q${L} 69 ${L - 3} 65Z`}
          fill={shade}
        />
      );
    case 'bun':
      return (
        <>
          <circle cx={CX} cy={15} r={8.5} fill={shade} />
          <circle cx={CX - 2} cy={13.5} r={3} fill={lighten(c, 0.12)} opacity={0.5} />
        </>
      );
    case 'ponytail':
      return (
        <path
          d={`M${R - 4} 28C${R + 12} 26 ${R + 15} 50 ${R + 6} 68C${R + 5} 55 ${R + 2} 43 ${R - 6} 36Z`}
          fill={shade}
        />
      );
    case 'locs': {
      const strands: ReactNode[] = [];
      const xs = [L - 2.5, L + 1, R - 1, R + 2.5, L + 4.5, R - 4.5];
      xs.forEach((x, i) => {
        const len = 70 + ((i * 7) % 9);
        strands.push(<rect key={i} x={x - 2.6} y={30} width={5.2} height={len - 30} rx={2.6} fill={i % 2 ? shade : darken(c, 0.08)} />);
      });
      return <>{strands}</>;
    }
    case 'curly': {
      const dots: ReactNode[] = [];
      for (let i = 0; i < 4; i++) {
        dots.push(<circle key={`l${i}`} cx={L + 0.5 - (i % 2)} cy={34 + i * 6} r={5.2} fill={shade} />);
        dots.push(<circle key={`r${i}`} cx={R - 0.5 + (i % 2)} cy={34 + i * 6} r={5.2} fill={shade} />);
      }
      return <>{dots}</>;
    }
    case 'hijab':
      return (
        <>
          <path d="M50 13C29 13 24 30 25 50C26 64 21 75 13 94L87 94C79 75 74 64 75 50C76 30 71 13 50 13Z" fill={t.hat} />
          <path d="M28 70C33 77 40 80 50 80C60 80 67 77 72 70" fill="none" stroke={darken(t.hat, 0.18)} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    default:
      return null;
  }
}

function hairFront(t: Traits): ReactNode {
  const { hw } = t.face;
  const L = CX - hw - 1.5;
  const R = CX + hw + 1.5;
  const c = t.hairColor;
  const hl = lighten(c, 0.18);
  switch (t.hair) {
    case 'bald':
      return <ellipse cx={CX - 6} cy={30} rx={6} ry={2.6} fill="#FFFFFF" opacity={0.22} transform={`rotate(-18 ${CX - 6} 30)`} />;
    case 'buzz':
      return <path d={capPath(hw, 23.5, -3, 44)} fill={c} opacity={0.62} />;
    case 'crop':
      return (
        <>
          <path d={capPath(hw, 20, 0)} fill={c} />
          <path d={`M${CX + 5} 22C${CX + 4} 26 ${CX + 4} 30 ${CX + 6} 34`} stroke={hl} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.6} />
        </>
      );
    case 'swept':
      return (
        <path
          d={`M${L} 48C${L - 0.5} 30 40 19 50 19C60 19 ${R + 0.5} 30 ${R} 48L${R - 3} 48C${R - 3} 40 ${R - 4} 34 ${R - 7} 31C56 33 46 41 ${L + 3} 42L${L + 3} 48Z`}
          fill={c}
        />
      );
    case 'curly': {
      const bumps: ReactNode[] = [];
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI * (1.08 + (i / 6) * 0.84);
        bumps.push(<circle key={i} cx={CX + Math.cos(a) * (hw - 1)} cy={40 + Math.sin(a) * 17} r={6.2} fill={i % 2 ? c : darken(c, 0.06)} />);
      }
      return (
        <>
          <path d={capPath(hw, 20, -1, 42)} fill={c} />
          {bumps}
        </>
      );
    }
    case 'afro':
      return <path d={capPath(hw, 18, -1, 42)} fill={c} />;
    case 'long':
      return (
        <>
          <path d={`M${L} 60C${L - 0.5} 30 40 19 50 19C60 19 ${R + 0.5} 30 ${R} 60L${R - 3} 60C${R - 3} 42 ${R - 5} 34 50 26C${L + 5} 34 ${L + 3} 42 ${L + 3} 60Z`} fill={c} />
          <path d={`M50 21C50 23 49.5 25 50 27`} stroke={darken(c, 0.25)} strokeWidth={1} fill="none" />
        </>
      );
    case 'wavy':
      return (
        <path
          d={`M${L} 56C${L - 0.5} 30 40 19 50 19C60 19 ${R + 0.5} 30 ${R} 56L${R - 3} 56C${R - 3} 42 ${R - 3} 35 ${R - 8} 31C58 36 50 31 46 34C42 37 38 34 ${L + 4} 36C${L + 3} 42 ${L + 3} 48 ${L + 3} 56Z`}
          fill={c}
        />
      );
    case 'bob':
      return (
        <path
          d={`M${L} 54C${L - 0.5} 30 40 19 50 19C60 19 ${R + 0.5} 30 ${R} 54L${R - 3} 54C${R - 3} 44 ${R - 3} 38 ${R - 6} 36.5L${L + 6} 36.5C${L + 3} 38 ${L + 3} 44 ${L + 3} 54Z`}
          fill={c}
        />
      );
    case 'bun':
      return <path d={capPath(hw, 20, -3, 44)} fill={c} />;
    case 'ponytail':
      return (
        <>
          <path d={capPath(hw, 20, -2, 46)} fill={c} />
          <circle cx={R - 3} cy={30} r={2.2} fill={t.hat} />
        </>
      );
    case 'mohawk':
      return (
        <>
          <path d={capPath(hw, 24, -3, 42)} fill={c} opacity={0.32} />
          <path d="M44 34C43 22 46 10 50 7C54 10 57 22 56 34Q50 31 44 34Z" fill={c} />
          <path d="M49 12C48 18 48 24 48.5 30" stroke={hl} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.7} />
        </>
      );
    case 'spiky':
      return (
        <path
          d={`M${L} 44L${L - 2} 28L${L + 5} 29L${L + 5} 17L44 23L48 11L53 21L60 13L61 24L${R + 3} 20L${R - 1} 31L${R} 44L${R - 3} 44C${R - 4} 37 ${R - 6} 34 ${R - 9} 33C58 35 42 35 ${L + 7} 32C${L + 4} 36 ${L + 3} 40 ${L + 3} 44Z`}
          fill={c}
          strokeLinejoin="round"
          stroke={c}
          strokeWidth={1.5}
        />
      );
    case 'locs':
      return (
        <>
          <path d={capPath(hw, 19, -1, 40)} fill={c} />
          <path d={`M44 21C45 26 47 30 50 32M56 21C55 26 53 30 50 32`} stroke={darken(c, 0.2)} strokeWidth={1.2} fill="none" />
        </>
      );
    case 'quiff':
      return (
        <>
          <path d={capPath(hw, 23, -2, 44)} fill={c} opacity={0.55} />
          <path d={`M${L + 3} 34C${L + 2} 18 44 11 56 12C${R + 3} 13 ${R + 3} 24 ${R - 2} 34C58 29 46 29 ${L + 3} 34Z`} fill={c} />
          <path d="M46 16C52 13 58 15 60 20" stroke={hl} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.65} />
        </>
      );
    case 'hijab':
      return (
        <>
          <path
            d={`M${L - 1} 50C${L - 1} 27 40 20.5 50 20.5C60 20.5 ${R + 1} 27 ${R + 1} 50C${R - 1} 38 ${R - 6} 30.5 50 30.5C${L + 6} 30.5 ${L + 1} 38 ${L - 1} 50Z`}
            fill={t.hat}
          />
          <path d={`M${L + 1} 34C${L + 6} 27 44 25.5 50 25.5`} stroke={lighten(t.hat, 0.25)} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.6} />
        </>
      );
    case 'beanie': {
      const band = darken(t.hat, 0.16);
      return (
        <>
          <path d={capPath(hw, 24, 2, 46)} fill={c} />
          <path d={`M${L - 1.5} 36C${L - 1.5} 14 40 11 50 11C60 11 ${R + 1.5} 14 ${R + 1.5} 36Z`} fill={t.hat} />
          <rect x={L - 2.5} y={30.5} width={R - L + 5} height={8} rx={4} fill={band} />
          {[0.2, 0.4, 0.6, 0.8].map((f) => (
            <path key={f} d={`M${L + (R - L) * f} 32.5v4`} stroke={darken(band, 0.15)} strokeWidth={1.1} strokeLinecap="round" />
          ))}
          {t.pompom ? <circle cx={CX} cy={11} r={4.6} fill={lighten(t.hat, 0.35)} /> : null}
        </>
      );
    }
    case 'cap': {
      const dark = darken(t.hat, 0.2);
      return (
        <>
          <path d={capPath(hw, 24, 3, 47)} fill={c} />
          <path d={`M${L - 0.5} 36C${L - 0.5} 17 40 14 50 14C60 14 ${R + 0.5} 17 ${R + 0.5} 36Z`} fill={t.hat} />
          <path d={`M50 14.5L50 35`} stroke={dark} strokeWidth={1} opacity={0.6} />
          <path d={`M${L - 1} 36C45 32 ${R + 6} 32 ${R + 13} 36.5C${R + 11} 39.5 ${R + 3} 39.5 ${R - 3} 38.5C50 37.5 ${L + 2} 38.5 ${L - 1} 36Z`} fill={dark} />
          <circle cx={CX} cy={14.6} r={1.7} fill={dark} />
        </>
      );
    }
    default:
      return null;
  }
}

function eyesLayer(t: Traits, mood: number): ReactNode {
  const ink = '#2A2622';
  const variant = t.eyes === 4 && mood < 45 ? 0 : t.eyes;
  return [-1, 1].map((side) => {
    const x = CX + side * EYE_DX;
    const y = EYE_Y;
    switch (variant) {
      case 1:
        return <ellipse key={side} cx={x} cy={y} rx={2} ry={2.8} fill={ink} />;
      case 2:
        return (
          <g key={side}>
            <ellipse cx={x} cy={y} rx={3.5} ry={2.7} fill="#FFFFFF" />
            <circle cx={x} cy={y + 0.2} r={1.9} fill={t.iris} />
            <circle cx={x} cy={y + 0.2} r={0.95} fill={ink} />
            <circle cx={x + 0.7} cy={y - 0.6} r={0.55} fill="#FFFFFF" />
          </g>
        );
      case 3:
        return (
          <g key={side}>
            <ellipse cx={x} cy={y + 0.3} rx={2.6} ry={2.2} fill={ink} />
            <rect x={x - 3.4} y={y - 2.6} width={6.8} height={2.6} fill={t.skin} />
            <path d={`M${x - 3} ${y}H${x + 3}`} stroke={ink} strokeWidth={1.3} strokeLinecap="round" />
          </g>
        );
      case 4:
        return <path key={side} d={`M${x - 2.8} ${y + 0.9}Q${x} ${y - 2.4} ${x + 2.8} ${y + 0.9}`} stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
      case 5:
        return (
          <g key={side}>
            <circle cx={x} cy={y} r={2.3} fill={ink} />
            <path d={`M${x + side * 1.7} ${y - 1.5}l${side * 1.7} -1.3`} stroke={ink} strokeWidth={1.2} strokeLinecap="round" />
            <circle cx={x + 0.7} cy={y - 0.7} r={0.6} fill="#FFFFFF" />
          </g>
        );
      default:
        return (
          <g key={side}>
            <circle cx={x} cy={y} r={2.4} fill={ink} />
            <circle cx={x + 0.8} cy={y - 0.8} r={0.6} fill="#FFFFFF" />
          </g>
        );
    }
  });
}

function browsLayer(t: Traits, mood: number): ReactNode {
  const base = t.hair === 'bald' || t.hair === 'hijab' ? darken(t.skin, 0.5) : darken(t.hairColor, 0.25);
  // Inner ends rise when worried, the whole brow lifts a touch when delighted.
  const worry = mood < 35 ? (35 - mood) / 35 : 0;
  const lift = mood > 80 ? 0.8 : 0;
  const y = 40.2 - lift;
  return [-1, 1].map((side) => {
    const outer = CX + side * 11;
    const inner = CX + side * 3.6;
    const yi = y - worry * 2.6;
    let d: string;
    let w: number;
    switch (t.brows) {
      case 1:
        d = `M${outer} ${y + 0.8}Q${(outer + inner) / 2} ${y - 2.2} ${inner} ${yi}`;
        w = 1.9;
        break;
      case 2:
        d = `M${outer} ${y + 0.3}L${inner} ${yi}`;
        w = 3;
        break;
      case 3:
        d = `M${outer} ${y + 1.6}L${inner} ${yi - 0.6}`;
        w = 2.1;
        break;
      case 4:
        d = `M${outer} ${y + 1}Q${(outer + inner) / 2} ${y - 1} ${inner} ${yi + 0.2}`;
        w = 2.7;
        break;
      default:
        d = `M${outer} ${y}L${inner} ${yi}`;
        w = 1.6;
    }
    return <path key={side} d={d} stroke={base} strokeWidth={w} strokeLinecap="round" fill="none" />;
  });
}

function noseLayer(t: Traits): ReactNode {
  const c = darken(t.skin, 0.22);
  switch (t.nose) {
    case 1:
      return (
        <>
          <circle cx={48.6} cy={53} r={0.8} fill={c} />
          <circle cx={51.4} cy={53} r={0.8} fill={c} />
        </>
      );
    case 2:
      return <ellipse cx={CX} cy={52.4} rx={2.4} ry={1.6} fill={c} opacity={0.55} />;
    case 3:
      return <path d="M50.5 48.5L49 53.2H51.4" stroke={c} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
    default:
      return <path d="M48 52.8Q50 54.6 52 52.8" stroke={c} strokeWidth={1.4} strokeLinecap="round" fill="none" />;
  }
}

function mouthLayer(t: Traits, mood: number): ReactNode {
  const ink = mix(t.skin, '#3A1A14', 0.75);
  const s = { stroke: ink, strokeWidth: 1.9, strokeLinecap: 'round' as const, fill: 'none' };
  if (mood < 18) return <path d="M44.5 60.5Q50 55.5 55.5 60.5" {...s} strokeWidth={2.1} />;
  if (mood < 38) return <path d="M45 59.2Q50 56.8 55 59.2" {...s} />;
  if (mood < 55) return <path d="M45.5 58Q50 58.8 54.5 58" {...s} />;
  if (mood < 72) return <path d="M44.5 56.8Q50 61.5 55.5 56.8" {...s} />;
  const mouthFill = '#6B2E2A';
  if (mood < 88)
    return (
      <>
        <path d="M44 56.5Q50 57.6 56 56.5Q55 63.2 50 63.2Q45 63.2 44 56.5Z" fill={mouthFill} />
        <path d="M45.1 57.1Q50 58 54.9 57.1L54.6 58.6Q50 59.4 45.4 58.6Z" fill="#FFFFFF" />
      </>
    );
  return (
    <>
      <path d="M43 55.8Q50 57.4 57 55.8Q56.2 65 50 65Q43.8 65 43 55.8Z" fill={mouthFill} />
      <path d="M44.2 56.5Q50 57.8 55.8 56.5L55.5 58.2Q50 59.3 44.5 58.2Z" fill="#FFFFFF" />
      <ellipse cx={CX} cy={62.6} rx={3.8} ry={2} fill="#E0787A" />
    </>
  );
}

function facialHairLayer(t: Traits): ReactNode {
  const { hw } = t.face;
  const L = CX - hw - 1.5;
  const R = CX + hw + 1.5;
  const c = t.hairColor;
  switch (t.facial) {
    case 'stubble':
      return (
        <path
          d={`M${L + 2} 48C${L + 2} 62 42 68 50 68C58 68 ${R - 2} 62 ${R - 2} 48C${R - 4} 58 ${R - 7} 61 50 61.5C${L + 7} 61 ${L + 4} 58 ${L + 2} 48Z`}
          fill={c}
          opacity={0.28}
        />
      );
    case 'beard':
      return (
        <>
          <path
            d={`M${L + 1.5} 46C${L + 1} 62 42 71 50 71C58 71 ${R - 1} 62 ${R - 1.5} 46C${R - 3} 56 ${R - 6} 60.5 50 61C${L + 6} 60.5 ${L + 3} 56 ${L + 1.5} 46Z`}
            fill={c}
          />
          <path d="M43.5 55.4C46 53 49 53.6 50 54.6C51 53.6 54 53 56.5 55.4C54 55.9 51.5 56.1 50 55.5C48.5 56.1 46 55.9 43.5 55.4Z" fill={c} />
        </>
      );
    case 'goatee':
      return <path d="M45.5 61.6Q50 60.2 54.5 61.6Q54 67.6 50 68.2Q46 67.6 45.5 61.6Z" fill={c} />;
    case 'mustache':
      return <path d="M43.5 55.6C46 52.8 49 53.4 50 54.5C51 53.4 54 52.8 56.5 55.6C54 55.9 51.5 56.1 50 55.5C48.5 56.1 46 55.9 43.5 55.6Z" fill={c} />;
    default:
      return null;
  }
}

function glassesLayer(t: Traits): ReactNode {
  if (t.glasses === 'none') return null;
  const { hw } = t.face;
  const st = { stroke: t.frame, strokeWidth: 1.6, fill: '#FFFFFF', fillOpacity: 0.16 };
  const lens =
    t.glasses === 'round'
      ? [-1, 1].map((s) => <circle key={s} cx={CX + s * EYE_DX} cy={EYE_Y} r={5} {...st} />)
      : [-1, 1].map((s) => <rect key={s} x={CX + s * EYE_DX - 5.6} y={EYE_Y - 4} width={11.2} height={8} rx={2.6} {...st} />);
  return (
    <>
      {lens}
      <path d={`M47.6 ${EYE_Y - 0.6}Q50 ${EYE_Y - 2} 52.4 ${EYE_Y - 0.6}`} stroke={t.frame} strokeWidth={1.5} fill="none" />
      <path d={`M${CX - EYE_DX - 5.4} ${EYE_Y - 1}L${CX - hw} ${EYE_Y - 2}M${CX + EYE_DX + 5.4} ${EYE_Y - 1}L${CX + hw} ${EYE_Y - 2}`} stroke={t.frame} strokeWidth={1.5} strokeLinecap="round" />
    </>
  );
}

function headphonesLayer(t: Traits): ReactNode {
  if (!t.headphones) return null;
  const { hw } = t.face;
  const L = CX - hw - 1.5;
  const R = CX + hw + 1.5;
  return (
    <>
      <path d={`M${L - 1.5} 44C${L - 3} 11 ${R + 3} 11 ${R + 1.5} 44`} stroke="#2F2B28" strokeWidth={3.4} fill="none" strokeLinecap="round" />
      <rect x={L - 5} y={39} width={7} height={13} rx={3.5} fill={t.hat} />
      <rect x={R - 2} y={39} width={7} height={13} rx={3.5} fill={t.hat} />
      <rect x={L - 3.2} y={41.5} width={2} height={8} rx={1} fill={lighten(t.hat, 0.35)} opacity={0.7} />
    </>
  );
}

function topLayer(t: Traits): ReactNode {
  const dark = darken(t.top, 0.2);
  const body = <path d="M12 104C12 84 26 75 50 75C74 75 88 84 88 104Z" fill={t.top} />;
  switch (t.topStyle) {
    case 1: // v-neck
      return (
        <>
          {body}
          <path d="M42.5 75.2L50 85L57.5 75.2Z" fill={t.skin} />
          <path d="M42.5 75.2L50 85L57.5 75.2" stroke={dark} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </>
      );
    case 2: // hoodie
      return (
        <>
          {body}
          <path d="M33 78C36 86 44 88 50 88C56 88 64 86 67 78" stroke={dark} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <path d="M46 84v8M54 84v8" stroke={lighten(t.top, 0.5)} strokeWidth={1.6} strokeLinecap="round" />
        </>
      );
    case 3: // collared shirt
      return (
        <>
          {body}
          <path d="M41 74.5L50 81L45 86Z" fill="#F7F3EC" />
          <path d="M59 74.5L50 81L55 86Z" fill="#F7F3EC" />
          <path d="M50 81V100" stroke={dark} strokeWidth={1.4} />
        </>
      );
    default: // crew neck
      return (
        <>
          {body}
          <path d="M41 75.6Q50 83 59 75.6" stroke={dark} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </>
      );
  }
}

function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

// ── Components ───────────────────────────────────────────────────

export function Avatar({
  seed,
  size = 48,
  mood = 60,
  className,
  ring,
  label,
}: {
  seed: number;
  size?: number;
  /** 0..100 → frown / neutral / smile / grin. */
  mood?: number;
  className?: string;
  /** Optional CSS colour for an outer ring (e.g. role or status). */
  ring?: string;
  /** Accessible name. Without it the portrait is treated as decorative. */
  label?: string;
}) {
  const uid = safeId(useId());
  const clip = `av-${uid}`;
  const t = traitsFor(seed);
  const m = Math.max(0, Math.min(100, mood));
  const { face } = t;
  const showEars = t.hair !== 'hijab';
  const skinShade = darken(t.skin, 0.14);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={clip}>
          <circle cx={50} cy={50} r={50} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={100} height={100} fill={t.bg} />
        <circle cx={30} cy={24} r={34} fill="#FFFFFF" opacity={0.28} />
        {t.hair === 'hijab' ? null : hairBackBehindBody(t)}
        {topLayer(t)}
        {t.hair === 'hijab' || isFrontLong(t) ? hairBack(t) : null}
        {t.hair !== 'hijab' ? (
          <>
            <rect x={42.5} y={58} width={15} height={20} rx={6} fill={skinShade} />
            {/* the one soft shadow: chin onto neck */}
            <ellipse cx={CX} cy={64.5} rx={7.5} ry={4.5} fill={darken(t.skin, 0.32)} opacity={0.45} />
          </>
        ) : null}
        {showEars ? (
          <>
            <circle cx={CX - face.hw + 0.5} cy={48} r={4.3} fill={t.skin} />
            <circle cx={CX + face.hw - 0.5} cy={48} r={4.3} fill={t.skin} />
            <circle cx={CX - face.hw + 0.3} cy={48} r={2} fill={skinShade} opacity={0.6} />
            <circle cx={CX + face.hw - 0.3} cy={48} r={2} fill={skinShade} opacity={0.6} />
          </>
        ) : null}
        {face.el(t.skin)}
        {m > 64 ? (
          <>
            <ellipse cx={CX - 11} cy={54.5} rx={3.4} ry={1.9} fill="#F08A8A" opacity={0.32} />
            <ellipse cx={CX + 11} cy={54.5} rx={3.4} ry={1.9} fill="#F08A8A" opacity={0.32} />
          </>
        ) : null}
        {facialHairLayer(t)}
        {noseLayer(t)}
        {mouthLayer(t, m)}
        {eyesLayer(t, m)}
        {browsLayer(t, m)}
        {hairFront(t)}
        {t.earrings ? (
          <>
            <circle cx={CX - face.hw + 0.3} cy={53.4} r={1.7} fill="#E3B23C" />
            <circle cx={CX + face.hw - 0.3} cy={53.4} r={1.7} fill="#E3B23C" />
          </>
        ) : null}
        {glassesLayer(t)}
        {headphonesLayer(t)}
      </g>
      {ring ? <circle cx={50} cy={50} r={47.5} fill="none" stroke={ring} strokeWidth={5} /> : null}
    </svg>
  );
}

/** Hair that hangs in front of the shoulders (drawn after the top, before the neck). */
function isFrontLong(t: Traits): boolean {
  return t.hair === 'long' || t.hair === 'wavy' || t.hair === 'locs';
}

/** Hair volume that sits entirely behind the body. */
function hairBackBehindBody(t: Traits): ReactNode {
  return isFrontLong(t) ? null : hairBack(t);
}

const BADGE_COLORS = ['#3D85C6', '#9B6BD3', '#2EB5A8', '#E07A5F', '#4F6D7A', '#5FA36A', '#C8553D', '#2F4858'] as const;

function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * For REAL people: a monogram, never a face. Legendary figures get a gold ring and a small star.
 */
export function InitialsBadge({
  name,
  size = 48,
  color,
  legendary,
  className,
}: {
  name: string;
  size?: number;
  color?: string;
  legendary?: boolean;
  className?: string;
}) {
  const uid = safeId(useId());
  const bg = color ?? BADGE_COLORS[hashString(name) % BADGE_COLORS.length] ?? '#3D85C6';
  const initials = initialsOf(name);
  const ink = parseHex(bg) ? readableOn(bg) : '#FFFFFF';
  const gold = '#E3B23C';
  const grad = `ib-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={legendary ? `${name} (legend)` : name}
      focusable="false"
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
          <stop offset="1" stopColor="#000000" stopOpacity={0.12} />
        </linearGradient>
      </defs>
      <circle cx={50} cy={50} r={legendary ? 43 : 48} fill={bg} />
      <circle cx={50} cy={50} r={legendary ? 43 : 48} fill={`url(#${grad})`} />
      {legendary ? (
        <>
          <circle cx={50} cy={50} r={46} fill="none" stroke={gold} strokeWidth={6} />
          <circle cx={50} cy={50} r={40} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.5} />
        </>
      ) : (
        <circle cx={50} cy={50} r={43} fill="none" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={1.5} />
      )}
      <text
        x={50}
        y={51}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={initials.length > 1 ? 36 : 44}
        fontWeight={700}
        fill={ink}
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
      >
        {initials}
      </text>
      {legendary ? (
        <g>
          <circle cx={81} cy={81} r={15} fill={gold} stroke="#FFF7DF" strokeWidth={3} />
          <path d={starD(81, 81.6, 9, 4, 5)} fill="#FFF7DF" />
        </g>
      ) : null}
    </svg>
  );
}

function starD(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
