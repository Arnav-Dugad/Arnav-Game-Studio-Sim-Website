import { useId } from 'react';
import type { ReactNode } from 'react';

/*
 * Procedural box art (docs/ART.md §6). A 300×400 canvas built from:
 *   genre  → layout template (slash / emblem / grid / speed / bubbly / globe / sunburst)
 *   topic  → motif glyph drawn in a 100×100 box and placed centre-stage
 *   hash(genre, topic, seed) → palette within the restrained studio palette
 * Title is set in the display face, wrapped to two lines and shrunk to fit. No external assets.
 */

// ── Deterministic helpers ─────────────────────────────────────────

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f2 = (n: number) => Math.round(n * 100) / 100;

function starPath(cx: number, cy: number, outer: number, inner: number, points: number, rotDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = ((rotDeg + (i * 180) / points) * Math.PI) / 180;
    pts.push(`${f2(cx + Math.cos(a) * rad)} ${f2(cy + Math.sin(a) * rad)}`);
  }
  return `M${pts.join('L')}Z`;
}

function sectorPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => `${f2(cx + r * Math.cos((a * Math.PI) / 180))} ${f2(cy + r * Math.sin((a * Math.PI) / 180))}`;
  return `M${pt(r0, a0)}L${pt(r1, a0)}A${r1} ${r1} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`;
}

// ── Palettes ──────────────────────────────────────────────────────

interface Pal {
  /** gradient top */
  a: string;
  /** gradient bottom */
  b: string;
  accent: string;
  /** motif body colour */
  ink: string;
  /** details drawn on top of the motif */
  detail: string;
  /** deep shade for overlays */
  dark: string;
}

const PALETTES = {
  ember: { a: '#E8876B', b: '#9E3B2C', accent: '#F2C450', ink: '#FFF4E6', detail: '#3A1712', dark: '#2A0F0B' },
  ocean: { a: '#4B92D0', b: '#1E3F66', accent: '#7FD1C7', ink: '#EAF4FF', detail: '#0E1F33', dark: '#0A1626' },
  violet: { a: '#A67EDB', b: '#4B2C7A', accent: '#F2C450', ink: '#F6EEFF', detail: '#1F1233', dark: '#160C26' },
  teal: { a: '#3CC2B4', b: '#16615A', accent: '#F4E3B0', ink: '#EFFFFB', detail: '#0B2A27', dark: '#08201D' },
  gold: { a: '#EBC15A', b: '#A0661A', accent: '#C8553D', ink: '#FFF7DF', detail: '#3B2508', dark: '#2A1A05' },
  forest: { a: '#6FB27A', b: '#2D5A35', accent: '#F2D16B', ink: '#F1FFF0', detail: '#132A17', dark: '#0C1F10' },
  dusk: { a: '#D9789A', b: '#5A2A55', accent: '#FFD7A8', ink: '#FFF0F5', detail: '#2A1029', dark: '#1E0A1D' },
  slate: { a: '#6B7C91', b: '#232B36', accent: '#E07A5F', ink: '#EEF2F7', detail: '#11161D', dark: '#0B0F14' },
  night: { a: '#3A4870', b: '#121726', accent: '#F2C450', ink: '#E8EDFF', detail: '#080B14', dark: '#06080F' },
  crimson: { a: '#D0624A', b: '#5B1F1A', accent: '#F2C450', ink: '#FFEDE6', detail: '#260B08', dark: '#1C0806' },
  mint: { a: '#A6DCC8', b: '#3E8E7E', accent: '#E07A5F', ink: '#173D35', detail: '#F4FFFB', dark: '#0F2A24' },
  sand: { a: '#EAD9BE', b: '#B98957', accent: '#3D85C6', ink: '#3B2A1A', detail: '#FFF9EF', dark: '#2A1D10' },
} satisfies Record<string, Pal>;

type PalName = keyof typeof PALETTES;
const ALL_PALS = Object.keys(PALETTES) as PalName[];

const TOPIC_MOOD: Record<string, readonly PalName[]> = {
  dark: ['night', 'crimson', 'slate', 'violet', 'dusk'],
  bright: ['mint', 'sand', 'gold', 'teal', 'ember', 'dusk', 'forest'],
  green: ['forest', 'teal', 'mint', 'gold'],
  sea: ['ocean', 'teal', 'night', 'mint'],
};

const TOPIC_TONE: Record<string, keyof typeof TOPIC_MOOD> = {
  horror: 'dark',
  zombies: 'dark',
  vampires: 'dark',
  crime: 'dark',
  post_apoc: 'dark',
  cyberpunk: 'dark',
  heist: 'dark',
  spy: 'dark',
  dungeon: 'dark',
  aliens: 'dark',
  space: 'dark',
  scifi: 'dark',
  animals: 'bright',
  pets: 'bright',
  cooking: 'bright',
  fairy_tale: 'bright',
  comedy: 'bright',
  music: 'bright',
  dating: 'bright',
  school: 'bright',
  sports_topic: 'bright',
  farming: 'green',
  survival: 'green',
  dinosaurs: 'green',
  underwater: 'sea',
  pirates: 'sea',
};

// ── Motifs (100×100 box) ──────────────────────────────────────────

type Motif = (p: Pal) => ReactNode;

const M = {
  dragon: (p) => (
    <>
      <path d="M14 76L46 18Q50 30 58 34Q66 24 86 24Q78 36 80 46Q70 46 66 56Q58 54 54 64Q44 62 40 72Q28 68 14 76Z" fill={p.ink} />
      <path d="M46 18L40 72M46 18L54 64M46 18L66 56M46 18L80 46" stroke={p.detail} strokeWidth={2.4} strokeLinecap="round" opacity={0.45} />
      <circle cx={46} cy={18} r={4} fill={p.accent} />
      <path d="M18 88Q28 82 24 72Q34 78 32 88Z" fill={p.accent} />
    </>
  ),
  rocket: (p) => (
    <>
      <path d="M42 68Q50 96 58 68Z" fill={p.accent} />
      <path d="M46 68Q50 84 54 68Z" fill={p.ink} />
      <path d="M36 50L21 72L37 66ZM64 50L79 72L63 66Z" fill={p.accent} />
      <path d="M50 8C64 20 68 42 64 68H36C32 42 36 20 50 8Z" fill={p.ink} />
      <circle cx={50} cy={38} r={8.5} fill={p.accent} stroke={p.detail} strokeWidth={2.5} />
      <path d="M40 56H60" stroke={p.detail} strokeWidth={2} opacity={0.3} />
    </>
  ),
  planet: (p) => (
    <>
      <ellipse cx={50} cy={50} rx={44} ry={11} transform="rotate(-18 50 50)" fill="none" stroke={p.accent} strokeWidth={5} opacity={0.75} />
      <circle cx={50} cy={50} r={25} fill={p.ink} />
      <path d="M27 44Q50 52 74 42M28 58Q50 64 72 56" stroke={p.detail} strokeWidth={3} fill="none" opacity={0.22} />
      <path d="M6 50A44 11 0 0 0 94 50" transform="rotate(-18 50 50)" fill="none" stroke={p.accent} strokeWidth={5} strokeLinecap="round" />
      <circle cx={84} cy={18} r={5} fill={p.accent} />
    </>
  ),
  saucer: (p) => (
    <>
      <path d="M38 56L20 94H80L62 56Z" fill={p.accent} opacity={0.3} />
      <path d="M35 46A15 15 0 0 1 65 46Z" fill={p.accent} />
      <ellipse cx={50} cy={50} rx={36} ry={10} fill={p.ink} />
      <ellipse cx={50} cy={54} rx={20} ry={5} fill={p.detail} opacity={0.3} />
      {[28, 40, 60, 72].map((x) => (
        <circle key={x} cx={x} cy={50} r={2.6} fill={p.accent} />
      ))}
    </>
  ),
  skull: (p) => (
    <>
      <path d="M50 14C32 14 21 27 21 43C21 53 26 60 33 63.5V74Q33 79 38 79H62Q67 79 67 74V63.5C74 60 79 53 79 43C79 27 68 14 50 14Z" fill={p.ink} />
      <ellipse cx={38.5} cy={46} rx={7.5} ry={8.5} fill={p.detail} />
      <ellipse cx={61.5} cy={46} rx={7.5} ry={8.5} fill={p.detail} />
      <path d="M50 55L45.5 62.5H54.5Z" fill={p.detail} />
      <path d="M43 70V79M50 70V79M57 70V79" stroke={p.detail} strokeWidth={2.6} strokeLinecap="round" />
      <circle cx={40} cy={44} r={2} fill={p.accent} />
      <circle cx={63} cy={44} r={2} fill={p.accent} />
    </>
  ),
  bat: (p) => (
    <>
      <circle cx={62} cy={38} r={27} fill={p.accent} opacity={0.9} />
      <path d="M50 46C44 40 38 40 34 44C30 36 20 34 10 40C18 44 20 52 18 60C24 56 30 56 34 62C38 56 44 56 50 62C56 56 62 56 66 62C70 56 76 56 82 60C80 52 82 44 90 40C80 34 70 36 66 44C62 40 56 40 50 46Z" fill={p.ink} />
      <ellipse cx={50} cy={53} rx={6} ry={9} fill={p.ink} />
      <circle cx={50} cy={44} r={7} fill={p.ink} />
      <path d="M45 41L44 32L49 38ZM55 41L56 32L51 38Z" fill={p.ink} />
      <circle cx={47.4} cy={44.5} r={1.4} fill={p.detail} />
      <circle cx={52.6} cy={44.5} r={1.4} fill={p.detail} />
    </>
  ),
  car: (p) => (
    <>
      <path d="M8 74H92" stroke={p.accent} strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
      <path d="M12 62Q12 52 22 50L32 48L42 36Q46 32 54 32H66Q72 32 76 38L82 48Q90 50 90 58V63Q90 66 87 66H15Q12 66 12 62Z" fill={p.ink} />
      <path d="M36 48L44 38.5Q47 35.5 52 35.5H56V48ZM60 35.5H64Q69 35.5 72 40L76 48H60Z" fill={p.accent} />
      <rect x={82} y={52} width={7} height={4} rx={2} fill={p.accent} />
      <circle cx={30} cy={66} r={9} fill={p.detail} />
      <circle cx={30} cy={66} r={4} fill={p.ink} />
      <circle cx={72} cy={66} r={9} fill={p.detail} />
      <circle cx={72} cy={66} r={4} fill={p.ink} />
    </>
  ),
  ball: (p) => (
    <>
      <circle cx={50} cy={50} r={31} fill={p.ink} />
      <path d="M27 29Q45 50 27 71M73 29Q55 50 73 71" stroke={p.detail} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.75} />
      <path d="M31 36l4 -2M33 44l4.5 -1M33 56l4.5 1M31 64l4 2M69 36l-4 -2M67 44l-4.5 -1M67 56l-4.5 1M69 64l-4 2" stroke={p.accent} strokeWidth={2} strokeLinecap="round" />
      <ellipse cx={40} cy={32} rx={8} ry={4} fill="#FFFFFF" opacity={0.25} transform="rotate(-30 40 32)" />
    </>
  ),
  crown: (p) => (
    <>
      <path d="M18 72L13 32L34 48L50 20L66 48L87 32L82 72Z" fill={p.ink} strokeLinejoin="round" />
      <rect x={17} y={66} width={66} height={13} rx={3.5} fill={p.accent} />
      {[34, 50, 66].map((x) => (
        <circle key={x} cx={x} cy={72.5} r={3.6} fill={p.detail} />
      ))}
      {(
        [
          [13, 32],
          [50, 20],
          [87, 32],
        ] as const
      ).map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={4.5} fill={p.accent} />
      ))}
    </>
  ),
  ship: (p) => (
    <>
      <path d="M50 12V66" stroke={p.ink} strokeWidth={3.5} />
      <path d="M50 12L65 16.5L50 21Z" fill={p.accent} />
      <path d="M28 24Q50 28 72 24L67 54Q50 58 33 54Z" fill={p.ink} />
      <path d="M45 34L55 44M55 34L45 44" stroke={p.detail} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M14 64H86L75 80H27Z" fill={p.accent} />
      <path d="M30 70h4M44 70h4M58 70h4" stroke={p.detail} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
      <path d="M4 84Q15 78 26 84T48 84T70 84T92 84" stroke={p.ink} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.6} />
    </>
  ),
  shuriken: (p) => (
    <>
      <path d={starPath(50, 50, 42, 11, 4, -45)} fill={p.ink} strokeLinejoin="round" />
      <path d={starPath(50, 50, 20, 8, 4, 0)} fill={p.accent} opacity={0.55} />
      <circle cx={50} cy={50} r={6.5} fill={p.detail} />
    </>
  ),
  robot: (p) => (
    <>
      <path d="M50 28V16" stroke={p.ink} strokeWidth={3.5} />
      <circle cx={50} cy={13} r={4.5} fill={p.accent} />
      <rect x={15} y={40} width={10} height={15} rx={3} fill={p.accent} />
      <rect x={75} y={40} width={10} height={15} rx={3} fill={p.accent} />
      <rect x={23} y={27} width={54} height={46} rx={13} fill={p.ink} />
      <circle cx={39} cy={46} r={7.5} fill={p.detail} />
      <circle cx={61} cy={46} r={7.5} fill={p.detail} />
      <circle cx={39} cy={46} r={3.6} fill={p.accent} />
      <circle cx={61} cy={46} r={3.6} fill={p.accent} />
      <rect x={37} y={58} width={26} height={8} rx={4} fill={p.detail} />
      <path d="M44 58v8M50 58v8M56 58v8" stroke={p.accent} strokeWidth={1.6} />
    </>
  ),
  mech: (p) => (
    <>
      <path d="M50 30L26 10M50 30L74 10" stroke={p.accent} strokeWidth={6} strokeLinecap="round" />
      <path d="M50 16L77 29L81 57L66 82H34L19 57L23 29Z" fill={p.ink} strokeLinejoin="round" />
      <path d="M29 45L50 54L71 45L66 59H34Z" fill={p.detail} />
      <path d="M36 52L48 56" stroke={p.accent} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M41 68H59M43 74H57" stroke={p.detail} strokeWidth={2.6} strokeLinecap="round" opacity={0.6} />
    </>
  ),
  chip: (p) => (
    <>
      {[34, 44, 56, 66].map((x) => (
        <path key={x} d={`M${x} 26V14M${x} 74V86M26 ${x}H14M74 ${x}H86`} stroke={p.ink} strokeWidth={4} strokeLinecap="round" />
      ))}
      <rect x={24} y={24} width={52} height={52} rx={9} fill={p.ink} />
      <rect x={37} y={37} width={26} height={26} rx={5} fill={p.accent} />
      <path d="M43 50H57M50 43V57" stroke={p.detail} strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
      <circle cx={31} cy={31} r={2.2} fill={p.detail} opacity={0.5} />
    </>
  ),
  sprout: (p) => (
    <>
      <path d="M16 82Q50 62 84 82Z" fill={p.accent} />
      <path d="M50 76V40" stroke={p.ink} strokeWidth={4.5} strokeLinecap="round" />
      <path d="M50 50C36 50 25 40 25 26C39 26 50 35 50 50Z" fill={p.ink} />
      <path d="M50 43C62 43 75 33 75 19C61 19 50 28 50 43Z" fill={p.ink} />
      <path d="M48 48L31 31M52 41L69 24" stroke={p.detail} strokeWidth={1.8} strokeLinecap="round" opacity={0.35} />
    </>
  ),
  magnifier: (p) => (
    <>
      <path d="M58 58L82 82" stroke={p.ink} strokeWidth={11} strokeLinecap="round" />
      <circle cx={42} cy={42} r={23} fill={p.accent} fillOpacity={0.35} stroke={p.ink} strokeWidth={7} />
      <path d="M29 37A14 14 0 0 1 39 27" stroke={p.ink} strokeWidth={3.5} fill="none" strokeLinecap="round" opacity={0.8} />
      <ellipse cx={20} cy={86} rx={5} ry={3} fill={p.accent} opacity={0.6} />
      <ellipse cx={34} cy={90} rx={5} ry={3} fill={p.accent} opacity={0.4} />
    </>
  ),
  note: (p) => (
    <>
      <path d="M38 22L76 14V26L38 34Z" fill={p.ink} />
      <path d="M38 24V70M76 16V62" stroke={p.ink} strokeWidth={5} strokeLinecap="round" />
      <ellipse cx={29} cy={71} rx={11} ry={8.5} transform="rotate(-20 29 71)" fill={p.ink} />
      <ellipse cx={67} cy={63} rx={11} ry={8.5} transform="rotate(-20 67 63)" fill={p.ink} />
      <path d={starPath(16, 30, 7, 2.5, 4, 0)} fill={p.accent} />
      <path d={starPath(88, 80, 5, 1.8, 4, 0)} fill={p.accent} />
    </>
  ),
  heart: (p) => (
    <>
      <path d="M72 30S58 22 58 13A6 6 0 0 1 70 11A6 6 0 0 1 82 13C82 22 72 30 72 30Z" fill={p.accent} transform="translate(6 -2)" />
      <path d="M50 84S15 63 15 38A17.5 17.5 0 0 1 50 29A17.5 17.5 0 0 1 85 38C85 63 50 84 50 84Z" fill={p.ink} />
      <path d="M27 36A10 10 0 0 1 37 27" stroke={p.accent} strokeWidth={4} strokeLinecap="round" fill="none" />
    </>
  ),
  skyline: (p) => {
    const blds: [number, number, number][] = [
      [12, 46, 17],
      [31, 22, 19],
      [52, 36, 15],
      [69, 54, 19],
    ];
    return (
      <>
        <circle cx={78} cy={26} r={10} fill={p.accent} opacity={0.85} />
        {blds.map(([x, y, w]) => (
          <rect key={x} x={x} y={y} width={w} height={86 - y} rx={2.5} fill={p.ink} />
        ))}
        {blds.flatMap(([x, y, w]) => {
          const out: ReactNode[] = [];
          for (let wy = y + 6; wy < 80; wy += 8)
            for (let wx = x + 4; wx + 3 < x + w - 2; wx += 6)
              if ((wx * 7 + wy * 3) % 5 !== 0) out.push(<rect key={`${wx}-${wy}`} x={wx} y={wy} width={3} height={4} rx={0.8} fill={p.accent} opacity={0.85} />);
          return out;
        })}
        <path d="M6 86H94" stroke={p.ink} strokeWidth={3} strokeLinecap="round" />
      </>
    );
  },
  chart: (p) => (
    <>
      <rect x={18} y={60} width={14} height={24} rx={3} fill={p.ink} />
      <rect x={38} y={48} width={14} height={36} rx={3} fill={p.ink} />
      <rect x={58} y={34} width={14} height={50} rx={3} fill={p.ink} />
      <path d="M14 52L38 36L52 44L82 18" stroke={p.accent} strokeWidth={5.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M69 17H83V31" stroke={p.accent} strokeWidth={5.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 88H88" stroke={p.ink} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  paw: (p) => (
    <>
      <path d="M50 50C38 50 30 60 30 70C30 78 38 80 44 78C47 77 53 77 56 78C62 80 70 78 70 70C70 60 62 50 50 50Z" fill={p.ink} />
      <ellipse cx={27} cy={44} rx={7.5} ry={9.5} transform="rotate(-22 27 44)" fill={p.ink} />
      <ellipse cx={41} cy={30} rx={7.5} ry={10} transform="rotate(-8 41 30)" fill={p.ink} />
      <ellipse cx={59} cy={30} rx={7.5} ry={10} transform="rotate(8 59 30)" fill={p.ink} />
      <ellipse cx={73} cy={44} rx={7.5} ry={9.5} transform="rotate(22 73 44)" fill={p.ink} />
      <path d="M80 14S73 10 73 5.5A3 3 0 0 1 80 4A3 3 0 0 1 87 5.5C87 10 80 14 80 14Z" fill={p.accent} />
    </>
  ),
  helmet: (p) => (
    <>
      <path d="M28 70Q30 86 50 88Q70 86 72 70" stroke={p.ink} strokeWidth={3} fill="none" />
      <path d="M17 62C17 35 31 21 50 21C69 21 83 35 83 62Z" fill={p.ink} />
      <path d="M24 42H76M20 52H80M38 23Q34 42 36 62M62 23Q66 42 64 62" stroke={p.detail} strokeWidth={1.8} opacity={0.22} fill="none" />
      <path d="M9 62H91Q91 71 82 71H18Q9 71 9 62Z" fill={p.accent} />
      <path d={starPath(50, 42, 9, 3.8, 5)} fill={p.accent} />
    </>
  ),
  sword: (p) => (
    <>
      <path d="M22 92V46A28 28 0 0 1 78 46V92Z" fill={p.dark} opacity={0.35} />
      <path d="M50 8L57 19V62H43V19Z" fill={p.ink} />
      <path d="M50 14V60" stroke={p.detail} strokeWidth={2} opacity={0.25} />
      <rect x={32} y={61} width={36} height={7} rx={3.5} fill={p.accent} />
      <rect x={46} y={68} width={8} height={15} rx={2.5} fill={p.ink} opacity={0.8} />
      <circle cx={50} cy={87} r={5.5} fill={p.accent} />
    </>
  ),
  sheriff: (p) => {
    const tips: ReactNode[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (-90 + i * 60) * (Math.PI / 180);
      tips.push(<circle key={i} cx={f2(50 + Math.cos(a) * 38)} cy={f2(50 + Math.sin(a) * 38)} r={5} fill={p.ink} />);
    }
    return (
      <>
        <path d={starPath(50, 50, 38, 21, 6)} fill={p.ink} strokeLinejoin="round" />
        {tips}
        <circle cx={50} cy={50} r={13} fill={p.accent} />
        <circle cx={50} cy={50} r={8} fill="none" stroke={p.detail} strokeWidth={2} opacity={0.4} />
      </>
    );
  },
  dino: (p) => (
    <>
      <path d="M76 58C86 60 93 68 97 78C87 73 80 71 72 71Z" fill={p.ink} />
      <ellipse cx={55} cy={62} rx={25} ry={14} fill={p.ink} />
      <path d="M34 60C27 46 25 31 29 20C31 13 40 11 45 15C47 17.5 45 22 41 22C36 23 38 40 47 54Z" fill={p.ink} />
      <rect x={38} y={68} width={9} height={18} rx={3.5} fill={p.ink} />
      <rect x={63} y={68} width={9} height={18} rx={3.5} fill={p.ink} />
      <path d="M44 49L48 40L52 48ZM53 47L58 38L62 47ZM63 48L68 40L71 49Z" fill={p.accent} />
      <circle cx={37} cy={17.5} r={1.9} fill={p.detail} />
      <path d="M8 88H96" stroke={p.accent} strokeWidth={3} strokeLinecap="round" opacity={0.6} />
    </>
  ),
  bolt: (p) => (
    <>
      <path d="M50 8L88 26V54C88 74 72 86 50 93C28 86 12 74 12 54V26Z" fill={p.accent} />
      <path d="M50 16L80 30V54C80 69 68 79 50 85C32 79 20 69 20 54V30Z" fill="none" stroke={p.ink} strokeWidth={2} opacity={0.5} />
      <path d="M57 18L30 56H48L41 84L71 42H52Z" fill={p.ink} strokeLinejoin="round" />
    </>
  ),
  laugh: (p) => (
    <>
      <circle cx={50} cy={50} r={35} fill={p.ink} />
      <path d="M33 43Q38.5 34 44 43M56 43Q61.5 34 67 43" stroke={p.detail} strokeWidth={3.6} fill="none" strokeLinecap="round" />
      <path d="M30 54H70Q68 77 50 77Q32 77 30 54Z" fill={p.detail} />
      <ellipse cx={50} cy={71} rx={9} ry={5} fill={p.accent} />
      <path d="M17 44Q13 52 17 55Q21 52 17 44ZM83 44Q79 52 83 55Q87 52 83 44Z" fill={p.accent} />
    </>
  ),
  hourglass: (p) => (
    <>
      <path d="M31 17C31 40 46 44 46 50C46 56 31 60 31 83H69C69 60 54 56 54 50C54 44 69 40 69 17Z" fill={p.ink} opacity={0.92} />
      <path d="M37 25H63C61 35 52 40 50 46C48 40 39 35 37 25Z" fill={p.accent} />
      <path d="M35 80C37 70 46 66 50 64C54 66 63 70 65 80Z" fill={p.accent} />
      <path d="M50 46V64" stroke={p.accent} strokeWidth={2} />
      <path d="M24 14H76M24 86H76" stroke={p.accent} strokeWidth={6} strokeLinecap="round" />
    </>
  ),
  hazard: (p) => (
    <>
      <circle cx={50} cy={50} r={39} fill={p.accent} />
      {[-90, 30, 150].map((a) => (
        <path key={a} d={sectorPath(50, 50, 11, 33, a - 30, a + 30)} fill={p.detail} />
      ))}
      <circle cx={50} cy={50} r={6.5} fill={p.detail} />
    </>
  ),
  castle: (p) => (
    <>
      <path d="M50 4V12M50 4L58 7L50 10" stroke={p.accent} strokeWidth={2} fill={p.accent} />
      <rect x={26} y={46} width={48} height={40} fill={p.ink} />
      <rect x={15} y={34} width={15} height={52} rx={2} fill={p.ink} />
      <rect x={70} y={34} width={15} height={52} rx={2} fill={p.ink} />
      <rect x={41} y={28} width={18} height={22} fill={p.ink} />
      <path d="M13 36L22.5 12L32 36ZM68 36L77.5 12L87 36ZM39 30L50 10L61 30Z" fill={p.accent} strokeLinejoin="round" />
      <path d="M42 86V72A8 8 0 0 1 58 72V86Z" fill={p.detail} />
      <rect x={20} y={46} width={5} height={8} rx={2.5} fill={p.detail} />
      <rect x={75} y={46} width={5} height={8} rx={2.5} fill={p.detail} />
      <rect x={47.5} y={36} width={5} height={8} rx={2.5} fill={p.detail} />
    </>
  ),
  pan: (p) => (
    <>
      <path d="M68 66L92 86" stroke={p.ink} strokeWidth={9} strokeLinecap="round" />
      <circle cx={44} cy={52} r={30} fill={p.dark} stroke={p.ink} strokeWidth={3.5} />
      <path d="M28 48C26 38 38 32 46 36C54 32 63 42 59 50C63 60 49 66 41 62C31 64 24 56 28 48Z" fill="#FFFBF2" />
      <circle cx={44} cy={49} r={8.5} fill={p.accent} />
      <circle cx={41.5} cy={46.5} r={2.4} fill="#FFFFFF" opacity={0.6} />
      <path d="M78 14C75 18 81 20 78 24M86 18C83 22 89 24 86 28" stroke={p.ink} strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.7} />
    </>
  ),
  pencil: (p) => (
    <g transform="rotate(-35 50 50)">
      <rect x={6} y={40} width={10} height={20} rx={3.5} fill="#E88A9A" />
      <rect x={15} y={40} width={8} height={20} fill={p.ink} />
      <rect x={22} y={40} width={50} height={20} fill={p.accent} />
      <path d="M22 46.7H72M22 53.3H72" stroke={p.dark} strokeWidth={1.2} opacity={0.25} />
      <path d="M72 40L92 50L72 60Z" fill="#F3D9B1" />
      <path d="M85 46.5L92 50L85 53.5Z" fill={p.dark} />
    </g>
  ),
  pulse: (p) => (
    <>
      <rect x={16} y={16} width={68} height={68} rx={18} fill={p.ink} />
      <path d="M22 52H37L43.5 34L52 70L58.5 45L63 52H78" stroke={p.accent} strokeWidth={5.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  gem: (p) => (
    <>
      <path d="M30 20H70L87 41L50 85L13 41Z" fill={p.ink} strokeLinejoin="round" />
      <path d="M13 41H87M30 20L40 41L50 85L60 41L70 20M40 41L50 20L60 41" stroke={p.detail} strokeWidth={2} fill="none" opacity={0.3} strokeLinejoin="round" />
      <path d="M30 20H50L40 41H13Z" fill="#FFFFFF" opacity={0.25} />
      <path d={starPath(84, 16, 8, 2.6, 4, 0)} fill={p.accent} />
    </>
  ),
  moneybag: (p) => (
    <>
      <path d="M40 27C24 35 18 51 18 63C18 79 30 87 50 87C70 87 82 79 82 63C82 51 76 35 60 27Z" fill={p.ink} />
      <path d="M37 13H63L57 27H43Z" fill={p.ink} />
      <rect x={38} y={25} width={24} height={6} rx={3} fill={p.accent} />
      <path d="M59 51C57 47 54 45.5 50 45.5C45 45.5 41.5 48 41.5 52S45.5 57.5 50 58.5S58.5 61 58.5 65.5S55 72 50 72C45.5 72 41.5 70 40.5 66M50 41V76" stroke={p.detail} strokeWidth={4} fill="none" strokeLinecap="round" />
    </>
  ),
  campfire: (p) => (
    <>
      <path d="M24 82L76 67M24 67L76 82" stroke="#8A6440" strokeWidth={8} strokeLinecap="round" />
      <path d="M50 14C58 28 71 37 71 54C71 66 62 73 50 73C38 73 29 66 29 54C29 44 37 40 39 29C43 37 45 39 48 40C46 30 46 23 50 14Z" fill={p.accent} />
      <path d="M50 39C54 47 60 51 60 58C60 65 56 69 50 69C44 69 40 65 40 58C40 52 46 49 50 39Z" fill={p.ink} />
      <circle cx={20} cy={24} r={2} fill={p.ink} opacity={0.7} />
      <circle cx={82} cy={30} r={1.6} fill={p.ink} opacity={0.6} />
      <circle cx={74} cy={14} r={1.3} fill={p.ink} opacity={0.5} />
    </>
  ),
  fish: (p) => (
    <>
      <path d="M46 33L56 20L61 35Z" fill={p.accent} />
      <path d="M76 50L93 35V65Z" fill={p.ink} strokeLinejoin="round" />
      <path d="M18 50C30 29 62 27 77 50C62 73 30 71 18 50Z" fill={p.ink} />
      <path d="M44 38Q39 50 44 62" stroke={p.detail} strokeWidth={2.2} fill="none" opacity={0.4} />
      <path d="M54 36Q50 50 54 64" stroke={p.accent} strokeWidth={4} fill="none" opacity={0.7} />
      <circle cx={31} cy={46} r={4} fill={p.detail} />
      <circle cx={32} cy={45} r={1.3} fill="#FFFFFF" />
      {(
        [
          [12, 30, 4],
          [20, 18, 2.6],
          [10, 12, 2],
        ] as const
      ).map(([x, y, r]) => (
        <circle key={x * 10 + y} cx={x} cy={y} r={r} fill="none" stroke={p.accent} strokeWidth={2} />
      ))}
    </>
  ),
  trophy: (p) => (
    <>
      <path d="M30 24H19C19 37 25 43 32 45M70 24H81C81 37 75 43 68 45" stroke={p.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
      <path d="M29 16H71V40C71 54 61 63 50 63C39 63 29 54 29 40Z" fill={p.ink} />
      <rect x={45} y={62} width={10} height={12} fill={p.ink} />
      <rect x={31} y={73} width={38} height={11} rx={3} fill={p.accent} />
      <path d={starPath(50, 37, 10, 4.2, 5)} fill={p.accent} />
    </>
  ),
  crosshair: (p) => (
    <>
      <circle cx={50} cy={50} r={31} fill="none" stroke={p.ink} strokeWidth={5} />
      <circle cx={50} cy={50} r={13} fill="none" stroke={p.accent} strokeWidth={4} />
      <path d="M50 8V30M50 70V92M8 50H30M70 50H92" stroke={p.ink} strokeWidth={5} strokeLinecap="round" />
      <circle cx={50} cy={50} r={3.5} fill={p.accent} />
    </>
  ),
  column: (p) => (
    <>
      <path d="M12 34L50 13L88 34Z" fill={p.ink} strokeLinejoin="round" />
      <rect x={14} y={34} width={72} height={7} rx={1.5} fill={p.accent} />
      {[21, 37, 54, 70].map((x) => (
        <g key={x}>
          <rect x={x} y={43} width={9} height={35} fill={p.ink} />
          <path d={`M${x + 3} 45V76M${x + 6} 45V76`} stroke={p.detail} strokeWidth={1} opacity={0.25} />
        </g>
      ))}
      <rect x={10} y={78} width={80} height={8} rx={2} fill={p.accent} />
      <circle cx={50} cy={26} r={3.5} fill={p.accent} />
    </>
  ),
  keyhole: (p) => (
    <>
      <circle cx={50} cy={50} r={37} fill={p.ink} />
      <circle cx={50} cy={50} r={31} fill="none" stroke={p.accent} strokeWidth={2.5} strokeDasharray="4 5" />
      <circle cx={50} cy={42} r={10} fill={p.detail} />
      <path d="M44 47L40 72H60L56 47Z" fill={p.detail} />
    </>
  ),
  sparkle: (p) => (
    <>
      <path d="M50 10C53 34 66 47 90 50C66 53 53 66 50 90C47 66 34 53 10 50C34 47 47 34 50 10Z" fill={p.ink} />
      <path d="M80 14C81 20 84 23 90 24C84 25 81 28 80 34C79 28 76 25 70 24C76 23 79 20 80 14Z" fill={p.accent} />
      <circle cx={22} cy={80} r={4} fill={p.accent} />
    </>
  ),
  train: (p) => (
    <>
      <path d="M8 80H92" stroke={p.accent} strokeWidth={3} strokeLinecap="round" />
      <rect x={18} y={40} width={44} height={30} rx={4} fill={p.ink} />
      <rect x={60} y={28} width={20} height={42} rx={3} fill={p.ink} />
      <rect x={64} y={33} width={12} height={10} rx={2} fill={p.accent} />
      <rect x={24} y={24} width={8} height={18} rx={2} fill={p.ink} />
      <circle cx={28} cy={16} r={5} fill={p.detail} opacity={0.7} />
      <circle cx={36} cy={9} r={4} fill={p.detail} opacity={0.5} />
      <circle cx={30} cy={74} r={7} fill={p.detail} />
      <circle cx={52} cy={74} r={7} fill={p.detail} />
      <circle cx={72} cy={74} r={6} fill={p.detail} />
      <path d="M80 62L90 70V72H80Z" fill={p.accent} />
    </>
  ),
  witch_hat: (p) => (
    <>
      <ellipse cx={50} cy={74} rx={38} ry={8} fill={p.ink} />
      <path d="M30 72Q40 40 50 20Q56 12 66 14Q58 22 60 40Q62 56 70 72Z" fill={p.ink} />
      <rect x={32} y={62} width={36} height={6} rx={2} fill={p.accent} />
      <path d="M78 22L80 28L86 30L80 32L78 38L76 32L70 30L76 28Z" fill={p.accent} />
      <circle cx={22} cy={36} r={2.5} fill={p.accent} />
    </>
  ),
  kaiju: (p) => (
    <>
      <path d="M8 86H92" stroke={p.accent} strokeWidth={2.5} opacity={0.6} />
      <rect x={14} y={58} width={10} height={28} fill={p.detail} />
      <rect x={76} y={50} width={12} height={36} fill={p.detail} />
      <path d="M30 86Q28 60 38 46Q36 30 48 22Q60 16 68 26Q74 34 66 40Q72 50 70 64Q72 76 66 86H56V72H44V86Z" fill={p.ink} />
      <path d="M48 22L46 12L52 18L56 10L58 20" fill={p.ink} />
      <circle cx={60} cy={28} r={2.5} fill={p.accent} />
      <path d="M66 36L80 32" stroke={p.accent} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  cottage: (p) => (
    <>
      <path d="M8 82Q50 72 92 82V92H8Z" fill={p.detail} opacity={0.7} />
      <path d="M24 50L50 26L76 50V80H24Z" fill={p.ink} />
      <path d="M18 52L50 22L82 52" stroke={p.accent} strokeWidth={5} strokeLinejoin="round" fill="none" />
      <rect x={44} y={60} width={12} height={20} rx={2} fill={p.accent} />
      <rect x={30} y={56} width={9} height={9} rx={1.5} fill={p.detail} />
      <rect x={61} y={56} width={9} height={9} rx={1.5} fill={p.detail} />
      <rect x={64} y={28} width={6} height={12} fill={p.ink} />
      <circle cx={70} cy={20} r={3.5} fill={p.detail} opacity={0.6} />
    </>
  ),
} satisfies Record<string, Motif>;

const TOPIC_MOTIF: Record<string, keyof typeof M> = {
  fantasy: 'dragon',
  scifi: 'planet',
  space: 'rocket',
  military: 'helmet',
  medieval: 'crown',
  dungeon: 'sword',
  aliens: 'saucer',
  sports_topic: 'ball',
  cars: 'car',
  detective: 'magnifier',
  horror: 'skull',
  pirates: 'ship',
  ninjas: 'shuriken',
  martial_arts: 'shuriken',
  mythology: 'column',
  wild_west: 'sheriff',
  dinosaurs: 'dino',
  robots: 'robot',
  animals: 'paw',
  city: 'skyline',
  business: 'chart',
  spy: 'keyhole',
  superheroes: 'bolt',
  comedy: 'laugh',
  music: 'note',
  time_travel: 'hourglass',
  post_apoc: 'hazard',
  cyberpunk: 'chip',
  fairy_tale: 'castle',
  mecha: 'mech',
  vampires: 'bat',
  zombies: 'skull',
  farming: 'sprout',
  cooking: 'pan',
  school: 'pencil',
  hospital: 'pulse',
  heist: 'gem',
  crime: 'moneybag',
  survival: 'campfire',
  underwater: 'fish',
  dating: 'heart',
  pets: 'paw',
  esports_topic: 'trophy',
  battle_royale: 'crosshair',
  ai_robots: 'chip',
  trains: 'train',
  witches: 'witch_hat',
  kaiju: 'kaiju',
  cozy_village: 'cottage',
};

// ── Layout templates (300×400) ────────────────────────────────────

type Template = 'slash' | 'emblem' | 'grid' | 'speed' | 'bubbly' | 'globe' | 'sunburst';

const GENRE_TEMPLATE: Record<string, Template> = {
  action: 'slash',
  shooter: 'slash',
  fighting: 'slash',
  rpg: 'emblem',
  adventure: 'emblem',
  strategy: 'grid',
  simulation: 'grid',
  puzzle: 'grid',
  racing: 'speed',
  sports: 'speed',
  casual: 'bubbly',
  platformer: 'bubbly',
  rhythm: 'bubbly',
  mmo: 'globe',
  sandbox: 'globe',
};

const GENRE_LABEL: Record<string, string> = { rpg: 'RPG', mmo: 'MMO' };

function genreLabel(genre: string): string {
  return GENRE_LABEL[genre] ?? genre.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function templateLayer(tpl: Template, p: Pal, rand: () => number): ReactNode {
  switch (tpl) {
    case 'slash': {
      const y = 250 + rand() * 40;
      return (
        <>
          <path d="M300 0V150L110 0Z" fill={p.dark} opacity={0.28} />
          <path d={`M0 ${y}L300 ${y - 170}V${y - 92}L0 ${y + 78}Z`} fill={p.accent} opacity={0.88} />
          <path d={`M0 ${y + 94}L300 ${y - 76}V${y - 64}L0 ${y + 106}Z`} fill="#FFFFFF" opacity={0.28} />
          <path d={`M0 ${y - 22}L300 ${y - 192}V${y - 184}L0 ${y - 14}Z`} fill="#FFFFFF" opacity={0.2} />
          {[0, 1, 2, 3, 4].map((i) => {
            const sx = 20 + rand() * 260;
            const sy = 30 + rand() * 120;
            const len = 20 + rand() * 40;
            return <path key={i} d={`M${f2(sx)} ${f2(sy)}l${f2(len)} ${f2(-len * 0.57)}`} stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" opacity={0.25} />;
          })}
        </>
      );
    }
    case 'emblem':
      return (
        <>
          <circle cx={150} cy={170} r={98} fill={p.accent} opacity={0.16} />
          <circle cx={150} cy={170} r={98} fill="none" stroke={p.accent} strokeWidth={2.5} opacity={0.75} />
          <circle cx={150} cy={170} r={88} fill="none" stroke={p.accent} strokeWidth={1.2} strokeDasharray="3 6" opacity={0.6} />
          <rect x={14} y={14} width={272} height={372} rx={10} fill="none" stroke={p.accent} strokeWidth={3} opacity={0.85} />
          <rect x={22} y={22} width={256} height={356} rx={6} fill="none" stroke={p.accent} strokeWidth={1.2} opacity={0.5} />
          {(
            [
              [14, 14],
              [286, 14],
              [14, 386],
              [286, 386],
            ] as const
          ).map(([x, y]) => (
            <path key={`${x}-${y}`} d={`M${x} ${y - 9}L${x + 9} ${y}L${x} ${y + 9}L${x - 9} ${y}Z`} fill={p.accent} />
          ))}
        </>
      );
    case 'grid': {
      const lines: ReactNode[] = [];
      for (let x = 30; x < 300; x += 30) lines.push(<path key={`v${x}`} d={`M${x} 0V400`} />);
      for (let y = 20; y < 400; y += 30) lines.push(<path key={`h${y}`} d={`M0 ${y}H300`} />);
      const cells: ReactNode[] = [];
      for (let i = 0; i < 9; i++) {
        const cx = Math.floor(rand() * 10) * 30;
        const cy = 20 + Math.floor(rand() * 12) * 30;
        cells.push(<rect key={i} x={cx + 2} y={cy + 2} width={26} height={26} rx={5} fill={i % 3 === 0 ? '#FFFFFF' : p.accent} opacity={i % 3 === 0 ? 0.14 : 0.32} />);
      }
      return (
        <>
          <g stroke="#FFFFFF" strokeWidth={1} opacity={0.14}>
            {lines}
          </g>
          {cells}
          <rect x={60} y={80} width={180} height={180} rx={36} fill={p.dark} opacity={0.3} />
          <rect x={60} y={80} width={180} height={180} rx={36} fill="none" stroke={p.accent} strokeWidth={2.5} opacity={0.7} />
        </>
      );
    }
    case 'speed': {
      const streaks: ReactNode[] = [];
      for (let i = 0; i < 14; i++) {
        const y = 20 + rand() * 320;
        const x = rand() * 160;
        const len = 60 + rand() * 160;
        streaks.push(
          <path key={i} d={`M${f2(x)} ${f2(y)}H${f2(Math.min(300, x + len))}`} stroke={i % 4 === 0 ? p.accent : '#FFFFFF'} strokeWidth={2 + (i % 3) * 2} strokeLinecap="round" opacity={i % 4 === 0 ? 0.7 : 0.18} />,
        );
      }
      return (
        <>
          {streaks}
          <path d="M0 262Q150 206 300 236V272Q150 246 0 300Z" fill={p.accent} opacity={0.9} />
          <path d="M0 312Q150 262 300 286V294Q150 272 0 322Z" fill="#FFFFFF" opacity={0.3} />
        </>
      );
    }
    case 'bubbly': {
      const bubbles: ReactNode[] = [];
      for (let i = 0; i < 12; i++) {
        const r = 8 + rand() * 34;
        bubbles.push(<circle key={i} cx={f2(rand() * 300)} cy={f2(rand() * 290)} r={f2(r)} fill={i % 3 === 0 ? p.accent : '#FFFFFF'} opacity={i % 3 === 0 ? 0.35 : 0.14} />);
      }
      return (
        <>
          {bubbles}
          <path d="M0 292Q75 252 150 282T300 270V400H0Z" fill={p.dark} opacity={0.3} />
          <path d="M0 316Q80 284 160 306T300 300V400H0Z" fill={p.accent} opacity={0.55} />
        </>
      );
    }
    case 'globe': {
      const stars: ReactNode[] = [];
      for (let i = 0; i < 22; i++) {
        stars.push(<circle key={i} cx={f2(rand() * 300)} cy={f2(rand() * 220)} r={f2(0.8 + rand() * 1.8)} fill="#FFFFFF" opacity={f2(0.3 + rand() * 0.5)} />);
      }
      return (
        <>
          {stars}
          <circle cx={150} cy={470} r={240} fill={p.dark} opacity={0.45} />
          <circle cx={150} cy={470} r={240} fill="none" stroke={p.accent} strokeWidth={3} opacity={0.8} />
          <g stroke={p.accent} strokeWidth={1.5} fill="none" opacity={0.35}>
            <ellipse cx={150} cy={470} rx={80} ry={240} />
            <ellipse cx={150} cy={470} rx={165} ry={240} />
            <path d="M-90 300Q150 270 390 300M-90 360Q150 330 390 360" />
          </g>
        </>
      );
    }
    default: {
      const rays: ReactNode[] = [];
      for (let i = 0; i < 16; i += 2) {
        rays.push(<path key={i} d={sectorPath(150, 170, 0, 420, i * 22.5, (i + 1) * 22.5)} fill="#FFFFFF" opacity={0.08} />);
      }
      return <>{rays}</>;
    }
  }
}

// ── Title fitting ─────────────────────────────────────────────────

const TITLE_MAX_W = 252;
const CHAR_W = 0.58;

function wrapTitle(title: string): { lines: string[]; fontSize: number; squeeze: boolean } {
  const clean = title.trim().replace(/\s+/g, ' ') || 'Untitled';
  const words = clean.split(' ');
  let lines: string[];
  if (clean.length * CHAR_W * 34 <= TITLE_MAX_W || words.length === 1) {
    lines = [clean];
  } else {
    let best = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ').length;
      const b = words.slice(i).join(' ').length;
      const diff = Math.max(a, b);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  const longest = Math.max(...lines.map((l) => l.length));
  const ideal = TITLE_MAX_W / (longest * CHAR_W);
  const fontSize = Math.max(17, Math.min(lines.length === 1 ? 44 : 38, ideal));
  return { lines, fontSize: f2(fontSize), squeeze: longest * CHAR_W * fontSize > TITLE_MAX_W };
}

function scoreColor(score: number): { bg: string; ink: string } {
  if (score >= 85) return { bg: '#E3B23C', ink: '#2A2008' };
  if (score >= 70) return { bg: '#2E9E5B', ink: '#FFFFFF' };
  if (score >= 50) return { bg: '#E09A3A', ink: '#2A1A05' };
  return { bg: '#D1495B', ink: '#FFFFFF' };
}

// ── Component ────────────────────────────────────────────────────

export function Cover({
  title,
  genre,
  topic,
  seed,
  size = 160,
  className,
  score,
}: {
  title: string;
  genre: string;
  topic: string;
  seed: number;
  /** Rendered width in px (height is 4/3 of this). */
  size?: number;
  className?: string;
  score?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids = { clip: `cv-c-${uid}`, bg: `cv-b-${uid}`, vig: `cv-v-${uid}`, shade: `cv-s-${uid}`, sheen: `cv-h-${uid}`, grain: `cv-g-${uid}` };

  const rand = mulberry32(hashString(`${genre}|${topic}|${seed}`));
  const tone = TOPIC_TONE[topic];
  const pool = tone ? TOPIC_MOOD[tone] ?? ALL_PALS : ALL_PALS;
  const palName = pool[Math.floor(rand() * pool.length)] ?? 'ember';
  const p: Pal = PALETTES[palName];
  const tpl = GENRE_TEMPLATE[genre] ?? 'sunburst';
  const motif: Motif = M[TOPIC_MOTIF[topic] ?? 'sparkle'];
  const tilt = (rand() - 0.5) * 10;
  const motifScale = tpl === 'emblem' || tpl === 'grid' ? 1.6 : 1.78;
  const motifY = tpl === 'globe' ? 150 : 168;

  const { lines, fontSize, squeeze } = wrapTitle(title);
  const lineH = fontSize * 1.04;
  const lastBaseline = 372;
  const firstBaseline = lastBaseline - (lines.length - 1) * lineH;
  const barY = firstBaseline - fontSize * 0.92 - 12;
  const showChrome = size >= 96;
  const label = genreLabel(genre);
  const sc = score === undefined ? null : scoreColor(score);

  return (
    <svg
      width={size}
      height={(size * 4) / 3}
      viewBox="0 0 300 400"
      className={className}
      role="img"
      aria-label={`Cover art for ${title}${score === undefined ? '' : `, rated ${Math.round(score)}`}`}
      focusable="false"
    >
      <defs>
        <clipPath id={ids.clip}>
          <rect width={300} height={400} rx={16} />
        </clipPath>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={p.a} />
          <stop offset="1" stopColor={p.b} />
        </linearGradient>
        <radialGradient id={ids.vig} cx="0.5" cy="0.42" r="0.78">
          <stop offset="0.55" stopColor="#000000" stopOpacity={0} />
          <stop offset="1" stopColor="#000000" stopOpacity={0.42} />
        </radialGradient>
        <linearGradient id={ids.shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.dark} stopOpacity={0} />
          <stop offset="1" stopColor={p.dark} stopOpacity={0.88} />
        </linearGradient>
        <linearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.2} />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
        </linearGradient>
        <pattern id={ids.grain} width={7} height={7} patternUnits="userSpaceOnUse">
          <circle cx={1.5} cy={1.5} r={0.7} fill="#FFFFFF" opacity={0.07} />
          <circle cx={5} cy={4.5} r={0.7} fill="#000000" opacity={0.08} />
        </pattern>
      </defs>
      <g clipPath={`url(#${ids.clip})`}>
        <rect width={300} height={400} fill={`url(#${ids.bg})`} />
        {templateLayer(tpl, p, rand)}
        {/* soft contact shadow under the motif */}
        <ellipse cx={150} cy={motifY + 50 * motifScale + 6} rx={62} ry={9} fill="#000000" opacity={0.18} />
        <g transform={`translate(${150 - 50 * motifScale} ${motifY - 50 * motifScale}) rotate(${f2(tilt)} ${50 * motifScale} ${50 * motifScale}) scale(${motifScale})`}>
          {motif(p)}
        </g>
        <rect y={210} width={300} height={190} fill={`url(#${ids.shade})`} />
        <rect width={300} height={400} fill={`url(#${ids.grain})`} />
        <rect width={300} height={400} fill={`url(#${ids.vig})`} />
        <rect width={300} height={400} fill={`url(#${ids.sheen})`} />
        <rect x={24} y={f2(barY)} width={38} height={5} rx={2.5} fill={p.accent} />
        <text
          x={24}
          fill="#FFF8EE"
          fontSize={fontSize}
          fontWeight={700}
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
        >
          {lines.map((line, i) => (
            <tspan
              key={i}
              x={24}
              y={f2(firstBaseline + i * lineH)}
              textLength={squeeze && line.length * CHAR_W * fontSize > TITLE_MAX_W ? TITLE_MAX_W : undefined}
              lengthAdjust={squeeze ? 'spacingAndGlyphs' : undefined}
            >
              {line}
            </tspan>
          ))}
        </text>
        {showChrome ? (
          <g>
            <rect x={18} y={18} width={label.length * 9 + 22} height={26} rx={13} fill={p.dark} opacity={0.5} />
            <text
              x={29}
              y={35.5}
              fontSize={13}
              fontWeight={700}
              fill="#FFF8EE"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
            >
              {label.toUpperCase()}
            </text>
          </g>
        ) : null}
        {sc && score !== undefined ? (
          <g>
            <circle cx={256} cy={44} r={30} fill={sc.bg} stroke="#FFF8EE" strokeWidth={4} />
            <text
              x={256}
              y={45}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.round(score) >= 100 ? 22 : 27}
              fontWeight={700}
              fill={sc.ink}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {Math.round(score)}
            </text>
          </g>
        ) : null}
        <rect x={1.5} y={1.5} width={297} height={397} rx={15} fill="none" stroke="#FFFFFF" strokeOpacity={0.16} strokeWidth={3} />
      </g>
    </svg>
  );
}

// ── Fan art (a child's crayon drawing of one of your games) ──────────────

const CRAYONS = ['#E4572E', '#3D85C6', '#F2C14E', '#8E5CC2', '#4CA65A', '#F28FB0', '#2A2622', '#F08A24'];

/** A kid's drawing of a game: its motif in crayon, a sun, grass, a stick-figure "me", and a caption. */
export function FanArt({ topic, seed, caption, by, size = 160 }: { topic: string; seed: number; caption: string; by: string; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const rand = mulberry32(seed || 1);
  const pick = () => CRAYONS[Math.floor(rand() * CRAYONS.length)]!;
  const body = pick();
  let accent = pick();
  if (accent === body) accent = CRAYONS[(CRAYONS.indexOf(body) + 3) % CRAYONS.length]!;
  const motif = M[TOPIC_MOTIF[topic] ?? 'planet'];
  const pal: Pal = { a: '#fff', b: '#fff', accent, ink: body, detail: '#2A2622', dark: '#2A2622' };
  const sunX = rand() < 0.5 ? 24 : 136;
  const tilt = (rand() - 0.5) * 4;
  const kidX = rand() < 0.5 ? 30 : 130;
  const wave = Array.from({ length: 9 }, (_, i) => `${i === 0 ? 'M' : 'L'}${4 + i * 19.5} ${172 + Math.sin(i * 1.7 + seed) * 3}`).join(' ');
  const hatch = Array.from({ length: 16 }, (_, i) => `M${6 + i * 10} 186L${12 + i * 10} 176`).join(' ');
  const sky = Array.from({ length: 6 }, (_, i) => `M${10 + i * 26} ${10 + (i % 2) * 4}l14 -4`).join(' ');
  return (
    <svg viewBox="0 0 160 200" width={size} height={(size * 200) / 160} role="img" aria-label={`A crayon drawing by ${by}: ${caption}`} style={{ transform: `rotate(${tilt}deg)` }}>
      <defs>
        <filter id={`crayon${uid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed={seed % 97} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" />
        </filter>
      </defs>
      <rect x={0} y={0} width={160} height={200} rx={3} fill="#FFFDF6" stroke="#E6DCCB" />
      <g filter={`url(#crayon${uid})`} strokeLinecap="round" strokeLinejoin="round">
        <path d={sky} stroke="#7CC4EF" strokeWidth={3} opacity={0.7} fill="none" />
        <circle cx={sunX} cy={26} r={11} fill="#F2C14E" opacity={0.9} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <path key={i} d={`M${sunX + Math.cos(a) * 15} ${26 + Math.sin(a) * 15}L${sunX + Math.cos(a) * 21} ${26 + Math.sin(a) * 21}`} stroke="#F2C14E" strokeWidth={2.4} />;
        })}
        <g transform="translate(36 52) scale(0.9)" opacity={0.92}>
          {motif(pal)}
        </g>
        <path d={wave} stroke="#4CA65A" strokeWidth={3.5} fill="none" />
        <path d={hatch} stroke="#4CA65A" strokeWidth={2} opacity={0.55} />
        {/* me */}
        <g stroke="#2A2622" strokeWidth={2.2} fill="none">
          <circle cx={kidX} cy={128} r={7} fill="#FFE0BD" />
          <path d={`M${kidX} 135V156M${kidX} 156L${kidX - 7} 170M${kidX} 156L${kidX + 7} 170M${kidX} 142L${kidX - 10} 134M${kidX} 142L${kidX + 11} 136`} />
          <path d={`M${kidX - 3} 129q3 3 6 0`} strokeWidth={1.4} />
        </g>
        <path d={`M${kidX + 11} 136l4 -6`} stroke={accent} strokeWidth={2.4} />
      </g>
      <text x={80} y={194} textAnchor="middle" fontSize={caption.length > 22 ? 9.5 : 11.5} fill="#2A2622" style={{ fontFamily: "'Comic Sans MS','Chalkboard SE','Comic Neue',cursive" }}>
        {caption}
      </text>
      <text x={154} y={12} textAnchor="end" fontSize={8} fill="#8A7F72" style={{ fontFamily: "'Comic Sans MS','Chalkboard SE','Comic Neue',cursive" }}>
        {by}
      </text>
    </svg>
  );
}
