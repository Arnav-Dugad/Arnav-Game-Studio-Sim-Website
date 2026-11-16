import type { ReactNode } from 'react';

/*
 * Hand-built icon set. Every glyph lives on a 24×24 grid with a 1.75 stroke and round caps/joins
 * (see docs/ART.md §8). Path data is authored here; a couple of radially symmetric shapes (gear, stars)
 * are computed once at module load so their geometry stays exact. No icon fonts, no external assets.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Closed star/polygon path with alternating outer and inner radii. */
function starPath(cx: number, cy: number, outer: number, inner: number, points: number, rotDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = ((rotDeg + (i * 180) / points) * Math.PI) / 180;
    pts.push(`${r2(cx + Math.cos(a) * rad)} ${r2(cy + Math.sin(a) * rad)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Cog outline: trapezoid teeth around a circle. */
function gearPath(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const seq: [number, number][] = [
      [a - step * 0.3, inner],
      [a - step * 0.16, outer],
      [a + step * 0.16, outer],
      [a + step * 0.3, inner],
    ];
    for (const [ang, rad] of seq) pts.push(`${r2(cx + Math.cos(ang) * rad)} ${r2(cy + Math.sin(ang) * rad)}`);
  }
  return `M${pts.join('L')}Z`;
}

const STAR5 = starPath(12, 12.6, 9.2, 4, 5);
const STAR_SMALL = starPath(12, 15.4, 2.9, 1.25, 5);
const SHURIKEN = starPath(12, 12, 9.5, 3, 4, -45);
const GEAR = gearPath(12, 12, 9.6, 7.4, 8);

const DOT = 'currentColor';

const ICONS = {
  // ── Time controls ───────────────────────────────────────────────
  play: <path d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10.1-6.4a1 1 0 0 0 0-1.7L9.53 4.75A1 1 0 0 0 8 5.6z" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1.3" />
      <rect x="14" y="5" width="4" height="14" rx="1.3" />
    </>
  ),
  fast: (
    <>
      <path d="M3.5 6.6v10.8a.8.8 0 0 0 1.3.62L11.5 12 4.8 5.98a.8.8 0 0 0-1.3.62z" />
      <path d="M12.5 6.6v10.8a.8.8 0 0 0 1.3.62L20.5 12l-6.7-6.02a.8.8 0 0 0-1.3.62z" />
    </>
  ),
  faster: (
    <>
      <path d="M2.5 7.5v9l5-4.5z" />
      <path d="M9.5 7.5v9l5-4.5z" />
      <path d="M16.5 7.5v9l5-4.5z" />
    </>
  ),
  fastest: (
    <>
      <path d="M2.5 6.5v11L9 12z" />
      <path d="M10 6.5v11l6.5-5.5z" />
      <path d="M20 6v12" />
    </>
  ),

  // ── Core stats / nav ────────────────────────────────────────────
  cash: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.75" />
      <path d="M6 9.5v.01M18 14.5v.01" />
    </>
  ),
  reputation: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.4-3.1 7.9-7.5 9.5-4.4-1.6-7.5-5.1-7.5-9.5V6z" />
      <path d="M12 8.6l1.1 2.25 2.45.35-1.78 1.73.42 2.45L12 14.2l-2.19 1.18.42-2.45-1.78-1.73 2.45-.35z" />
    </>
  ),
  fans: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c.5-3.3 2.9-5.5 6-5.5 1.7 0 3.2.6 4.2 1.7" />
      <path d="M18 19s-3.5-2.1-3.5-4.6a1.8 1.8 0 0 1 3.5-.9 1.8 1.8 0 0 1 3.5.9C21.5 16.9 18 19 18 19z" />
    </>
  ),
  staff: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.75 20c.6-3.4 3-5.6 6.25-5.6s5.65 2.2 6.25 5.6" />
      <path d="M15.6 4.9a3.25 3.25 0 0 1 0 6.2" />
      <path d="M17.6 14.6c2 .6 3.3 2.5 3.65 5.4" />
    </>
  ),
  build: (
    <>
      <rect x="11" y="3.5" width="9" height="5" rx="1.2" transform="rotate(45 15.5 6)" />
      <path d="M13.7 7.8L4.6 16.9a1.6 1.6 0 0 0 2.25 2.25L15.9 10" />
    </>
  ),
  research: (
    <>
      <circle cx="12" cy="12" r="1.6" fill={DOT} />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-60 12 12)" />
    </>
  ),
  market: (
    <>
      <path d="M4.5 10.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-8.5" />
      <path d="M3 9.2L4.6 4h14.8L21 9.2a2.25 2.25 0 0 1-4.5.3 2.25 2.25 0 0 1-4.5 0 2.25 2.25 0 0 1-4.5 0A2.25 2.25 0 0 1 3 9.2z" />
      <path d="M10 20.5v-5h4v5" />
    </>
  ),
  finance: (
    <>
      <path d="M11 4a8.5 8.5 0 1 0 9 9h-9z" />
      <path d="M14 2.75a7.5 7.5 0 0 1 7.25 7.25H14z" />
    </>
  ),
  company: (
    <>
      <path d="M4 20.5V6.6a1 1 0 0 1 .7-.95l7-2.25a1 1 0 0 1 1.3.95V20.5" />
      <path d="M13 9h6a1 1 0 0 1 1 1v10.5" />
      <path d="M2.5 20.5h19" />
      <path d="M7.5 8.5h2M7.5 12h2M7.5 15.5h2M16 13h1M16 16.5h1" />
    </>
  ),
  news: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h10A1.5 1.5 0 0 1 17 5.5V18a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
      <path d="M17 8.5h2.5a1 1 0 0 1 1 1V18a2 2 0 0 1-2 2" />
      <path d="M7.5 8h6M7.5 11.5h6M7.5 15h4" />
    </>
  ),
  goals: (
    <>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <path d="M3.5 6.6l1.4 1.4L7.5 5.3M3.5 12.1l1.4 1.4 2.6-2.7" />
      <circle cx="5.25" cy="17.5" r="1.5" />
    </>
  ),
  settings: (
    <>
      <path d={GEAR} />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  develop: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
      <path d="M10 8.25l-2 2 2 2M14 8.25l2 2-2 2" />
    </>
  ),

  // ── UI primitives ───────────────────────────────────────────────
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  'chevron-right': <path d="M9.5 6l6 6-6 6" />,
  'chevron-left': <path d="M14.5 6l-6 6 6 6" />,
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  'arrow-up': <path d="M12 19.5v-15M6 10.5l6-6 6 6" />,
  'arrow-down': <path d="M12 4.5v15M6 13.5l6 6 6-6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.75v.01" />
    </>
  ),
  warning: (
    <>
      <path d="M10.27 4.2a2 2 0 0 1 3.46 0l7.6 13.3a2 2 0 0 1-1.73 3H4.4a2 2 0 0 1-1.73-3z" />
      <path d="M12 9.5v4.5M12 17.25v.01" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.5a2.5 2.5 0 0 1 4.85-.6c.45 1.75-2.45 2.3-2.45 4v.3M12 16.75v.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4l5.1 5.1" />
    </>
  ),
  filter: <path d="M3.5 5h17l-6.5 8v5.5l-4 2.25V13z" />,
  external: <path d="M14 3.5h6.5V10M20.5 3.5l-9 9M18 14v4.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H10" />,
  download: <path d="M12 3.5v12M7 10.5l5 5 5-5M4 20.5h16" />,
  refresh: (
    <>
      <path d="M19.6 10.5A8 8 0 0 0 5.3 7.2M4.4 13.5a8 8 0 0 0 14.3 3.3" />
      <path d="M4.8 3.5v4h4M19.2 20.5v-4h-4" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 12a8 8 0 1 1-2.35-5.65" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  move: <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />,
  trash: <path d="M4 6.5h16M9.5 6.5V4.5h5v2M6 6.5l1 13a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5l1-13M10 10.5v6.5M14 10.5v6.5" />,
  edit: (
    <>
      <path d="M4 20l1-4.5L16 4.5a2.12 2.12 0 0 1 3 3L8 18.5z" />
      <path d="M14 6.5l3 3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
  /** Generic key glyph for the sign-in button. Deliberately NOT any provider's logo. */
  google: (
    <>
      <circle cx="7.5" cy="16" r="4" />
      <path d="M10.4 13.1L20 3.5M16.5 7l2.5 2.5M14 9.5l2 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.7-3.8 3.6-6 7.5-6s6.8 2.2 7.5 6" />
    </>
  ),
  logout: <path d="M9.5 20.5h-4A1.5 1.5 0 0 1 4 19V5a1.5 1.5 0 0 1 1.5-1.5h4M15.5 16.5L20 12l-4.5-4.5M20 12H9.5" />,
  save: (
    <>
      <path d="M5 3.5h11l3.5 3.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z" />
      <path d="M7.5 3.5V8h7V3.5" />
      <rect x="7" y="13" width="10" height="7.5" rx="1" />
    </>
  ),
  cloud: <path d="M7 19a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.42 1.56A3.75 3.75 0 0 1 17.5 19z" />,
  'cloud-off': (
    <>
      <path d="M9.2 5.8A6 6 0 0 1 17.82 11.6a3.75 3.75 0 0 1 2.28 6.1M16 19H7a4.5 4.5 0 0 1-.6-8.96" />
      <path d="M3 3l18 18" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  'volume-off': (
    <>
      <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  sound: <path d="M3 12h1.5M6.5 8.5v7M10 5v14M13.5 8v8M17 6.5v11M20.5 10.5v3" />,
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 9.5h.01M9.3 9.5h.01M12.6 9.5h.01M15.9 9.5h.01M18 9.5h.01M7.5 12.2h.01M10.8 12.2h.01M14.1 12.2h.01M17 12.2h.01M8 15h8" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l9 4.75-9 4.75-9-4.75z" />
      <path d="M3 12.25L12 17l9-4.75M3 16.25L12 21l9-4.75" />
    </>
  ),
  zap: <path d="M13 2.5L4.5 13.5H11l-1 8 9.5-11H13z" />,
  sliders: (
    <>
      <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
      <circle cx="15" cy="6.5" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.25 2" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M7.75 3.5c0 4.4 4.25 5.4 4.25 8.5s-4.25 4.1-4.25 8.5M16.25 3.5c0 4.4-4.25 5.4-4.25 8.5s4.25 4.1 4.25 8.5" />
      <path d="M9.6 18.4h4.8" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.75M10 2.5h4M12 2.5V6M18.4 6.6l1.5-1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" />
    </>
  ),

  // ── Achievements & flavour ─────────────────────────────────────
  trophy: (
    <>
      <path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z" />
      <path d="M7.5 6H5a.5.5 0 0 0-.5.5c0 2.2 1.4 3.9 3.4 4.3M16.5 6H19a.5.5 0 0 1 .5.5c0 2.2-1.4 3.9-3.4 4.3" />
      <path d="M12 14v3.5M8.5 20.5h7M9.5 20.5c0-1.7 1.1-3 2.5-3s2.5 1.3 2.5 3" />
    </>
  ),
  star: <path d={STAR5} />,
  crown: (
    <>
      <path d="M4.2 17.5L3 7.5l5 4 4-6.5 4 6.5 5-4-1.2 10z" />
      <path d="M4.5 20.5h15" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.8c3.2 2.2 4.8 5.5 4.8 9.2v4.5H7.2V12c0-3.7 1.6-7 4.8-9.2z" />
      <circle cx="12" cy="9.5" r="1.8" />
      <path d="M7.2 12.5L4.5 15v3.5l2.7-1.5M16.8 12.5l2.7 2.5v3.5l-2.7-1.5" />
      <path d="M10 19.5v1.5M14 19.5v1.5M12 19.5v2.5" />
    </>
  ),
  stack: (
    <>
      <rect x="4" y="15.5" width="16" height="4.5" rx="1.5" />
      <rect x="5.5" y="10" width="13" height="4.5" rx="1.5" />
      <rect x="7" y="4.5" width="10" height="4.5" rx="1.5" />
    </>
  ),
  library: (
    <>
      <rect x="3.5" y="4.5" width="4" height="15" rx="1" />
      <rect x="8.5" y="6.5" width="4" height="13" rx="1" />
      <path d="M14 7.2l3.4-.95 3.6 13.05-3.4.95z" />
      <path d="M3 20.5h18M5.5 8h.01M10.5 10h.01" />
    </>
  ),
  skull: (
    <>
      <path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.5V19a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19v-2.5c1.8-1.1 3-2.9 3-5.5a8 8 0 0 0-8-8z" />
      <circle cx="9" cy="11.5" r="1.75" fill={DOT} />
      <circle cx="15" cy="11.5" r="1.75" fill={DOT} />
      <path d="M10.5 20.5v-2.5M13.5 20.5v-2.5" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 20.5h17" />
      <rect x="5" y="12.5" width="3.25" height="5.5" rx=".8" />
      <rect x="10.4" y="8.5" width="3.25" height="9.5" rx=".8" />
      <rect x="15.8" y="4.5" width="3.25" height="13.5" rx=".8" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 6a6 6 0 0 0-6 6" />
    </>
  ),
  fire: (
    <>
      <path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3.1 2-5 3.3-6.5.5 1.5 1.4 2.4 2.4 2.7.1-3.6 1.2-6.1 3.8-7.6-.2 2.7 1.1 4.5 2.7 6.2C18.5 10.6 19 12.2 19 14.4 19 18.2 15.9 21 12 21z" />
      <path d="M12 21c-1.7 0-3-1.2-3-2.9 0-1.7 1.4-2.6 2.2-3.8.9 1.3 3.8 2 3.8 4.1 0 1.5-1.3 2.6-3 2.6z" />
    </>
  ),
  chain: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </>
  ),
  scroll: (
    <>
      <path d="M5.5 3.5H16a2 2 0 0 1 2 2v11" />
      <path d="M5.5 3.5a2 2 0 0 0-2 2V7.5h4" />
      <path d="M7.5 5.5v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2h-9v2a2 2 0 0 1-2 2" />
      <path d="M10.5 8.5h4.5M10.5 12h4.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.4-3.1 7.9-7.5 9.5-4.4-1.6-7.5-5.1-7.5-9.5V6z" />
      <path d="M9 12l2.2 2.2 4-4.2" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.75" />
      <path d="M12 9.5v5" />
    </>
  ),
  vault: (
    <>
      <rect x="3" y="4" width="18" height="15" rx="2" />
      <circle cx="11.5" cy="11.5" r="4" />
      <path d="M11.5 9.5v4M9.5 11.5h4M18 9v5M6.5 19v1.5M17.5 19v1.5" />
    </>
  ),
  gem: (
    <>
      <path d="M6.5 4h11l3.5 5-9 11L3 9z" />
      <path d="M3 9h18M9.5 4L8 9l4 11 4-11-1.5-5" />
    </>
  ),
  diamond: (
    <>
      <path d="M12 2.5l7.5 9.5L12 21.5 4.5 12z" />
      <path d="M12 7.5l3.6 4.5-3.6 4.5-3.6-4.5z" />
    </>
  ),
  people: (
    <>
      <circle cx="12" cy="7.5" r="2.9" />
      <path d="M6.5 19.5c.4-3.2 2.7-5.3 5.5-5.3s5.1 2.1 5.5 5.3" />
      <circle cx="5.5" cy="9.5" r="2" />
      <path d="M2 17.5c.3-2 1.6-3.4 3.4-3.6" />
      <circle cx="18.5" cy="9.5" r="2" />
      <path d="M22 17.5c-.3-2-1.6-3.4-3.4-3.6" />
    </>
  ),
  crowd: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="8.5" cy="12.5" r="2.4" />
      <circle cx="15.5" cy="12.5" r="2.4" />
      <path d="M3.5 21c.4-2.8 2.4-4.6 5-4.6s4.6 1.8 5 4.6M10.5 21c.4-2.8 2.4-4.6 5-4.6s4.6 1.8 5 4.6" />
    </>
  ),
  city: (
    <>
      <path d="M3 20.5h18" />
      <path d="M4.5 20.5V11h5M9.5 20.5V5.5h6v15M15.5 9h4v11.5" />
      <path d="M11.5 8.5h2M11.5 11.5h2M11.5 14.5h2M6.5 13.5h1M6.5 16.5h1M17 12h1M17 15h1" />
    </>
  ),
  box: (
    <>
      <path d="M12 3l8 4.25v9.5L12 21l-8-4.25v-9.5z" />
      <path d="M4 7.25l8 4.25 8-4.25M12 11.5V21M8 5.1l8 4.3" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="17.5" rx="1.5" />
      <path d="M8.75 7h.01M12 7h.01M15.25 7h.01M8.75 10.5h.01M12 10.5h.01M15.25 10.5h.01M8.75 14h.01M15.25 14h.01" />
      <path d="M10.25 20.5V17h3.5v3.5" />
    </>
  ),
  tower: (
    <>
      <path d="M12 2.5v3M9 5.5h6l1.2 15H7.8z" />
      <path d="M10 9.5h4M10 13h4M9.8 16.5h4.4M5 20.5h14" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3.5h5M10.25 3.5v5.2L4.9 17.6a2 2 0 0 0 1.7 2.9h10.8a2 2 0 0 0 1.7-2.9L13.75 8.7V3.5" />
      <path d="M7.2 14h9.6M10.5 17h.01M13.5 16.5h.01" />
    </>
  ),
  gear: (
    <>
      <path d={GEAR} />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v4.5M15 3v4.5" />
      <path d="M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16.5V21" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0M12 3v2" />
    </>
  ),
  unicorn: (
    <>
      <path d="M8 21v-4.3c-2-.5-3.5-1.9-3.5-3.7 0-.8.6-1.4 1.4-1.3l3.6.4L11.6 8l-.6-3.2 3 2.3c3.3.6 5.5 3.6 5.5 7.3V21" />
      <path d="M10.6 7.6L7 2.8" />
      <path d="M12.6 11.2h.01M14.3 7.4c1.1 1.1 1.6 2.6 1.3 4.1" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2.2l2.3 11h10.5l2-8H6.3" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  castle: (
    <>
      <path d="M4 20.5V6.5h2.5v2h2v-2h2V10h3V6.5h2v2h2v-2H20v14z" />
      <path d="M10 20.5V16a2 2 0 0 1 4 0v4.5" />
    </>
  ),
  medal: (
    <>
      <path d="M7.5 3l3.5 6.5M16.5 3L13 9.5" />
      <circle cx="12" cy="15" r="5.5" />
      <path d={STAR_SMALL} />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 10 10 4.5 20 4c-.5 10-6 15-15 15z" />
      <path d="M5 19l8-8" />
    </>
  ),
  phoenix: (
    <>
      <path d="M12 13.5C9.6 9.6 6.3 8 3 8.4c1.5 1.9 2.4 4.3 5.4 5.9M12 13.5c2.4-3.9 5.7-5.5 9-5.1-1.5 1.9-2.4 4.3-5.4 5.9" />
      <circle cx="12" cy="8.6" r="1.7" />
      <path d="M12.3 6.9c-.2-1.4.4-2.7 1.6-3.4" />
      <path d="M12 13.5c-1.6 2.4-1.6 5 0 7.5 1.6-2.5 1.6-5.1 0-7.5z" />
      <path d="M9.4 15.6c-.5 2 0 3.6 1 4.6M14.6 15.6c.5 2 0 3.6-1 4.6" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  goggles: (
    <>
      <path d="M2.5 11.5c0-4 4-6.5 9.5-6.5s9.5 2.5 9.5 6.5" />
      <circle cx="7.5" cy="13.5" r="3.5" />
      <circle cx="16.5" cy="13.5" r="3.5" />
      <path d="M11 13.2c.6-.4 1.4-.4 2 0" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="3.8" ry="9" />
      <path d="M3.5 9h17M3.5 15h17" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 4c.6 4.4 3.1 6.9 7.5 7.5-4.4.6-6.9 3.1-7.5 7.5-.6-4.4-3.1-6.9-7.5-7.5C7.9 10.9 10.4 8.4 11 4z" />
      <path d="M19 2.5v3.5M17.25 4.25h3.5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18M11 12.5v1.5h2v-1.5" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.5-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.5 12 20 12 20z" />,
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4.5c2.5-1.5 5-1.5 7 0s4.5 1.5 7 0v9c-2.5 1.5-5 1.5-7 0s-4.5-1.5-7 0" />
    </>
  ),
  satellite: (
    <g transform="rotate(-45 12 12)">
      <rect x="10" y="9.5" width="4" height="5" rx="1" />
      <rect x="2.5" y="10" width="5.75" height="4" rx=".8" />
      <rect x="15.75" y="10" width="5.75" height="4" rx=".8" />
      <path d="M8.25 12H10M14 12h1.75M5.4 10v4M18.6 10v4M12 9.5V7M10.5 6.5h3" />
    </g>
  ),
  money: (
    <>
      <path d="M9.5 3.5h5l-1.5 3h-2z" />
      <path d="M10 6.8C6 8.3 4 11.8 4 15.3c0 3 2 5.2 5 5.2h6c3 0 5-2.2 5-5.2 0-3.5-2-7-6-8.5" />
      <path d="M14 11.6c-.4-.8-1.2-1.2-2-1.2-1.1 0-2 .6-2 1.5s.9 1.3 2 1.5 2 .6 2 1.5-.9 1.6-2 1.6c-.9 0-1.7-.4-2.1-1.2M12 9.1v1.3M12 16v1.3" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.9 1.5-2l-.3-1c-.4-1.3.6-2.5 1.9-2.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" />
      <circle cx="7.5" cy="11.5" r="1.25" fill={DOT} />
      <circle cx="10" cy="7.5" r="1.25" fill={DOT} />
      <circle cx="14.5" cy="7.5" r="1.25" fill={DOT} />
    </>
  ),
  wrench: <path d="M15.5 3.5a4.5 4.5 0 0 0-4.3 5.8L4 16.5a2.12 2.12 0 0 0 3 3l7.2-7.2a4.5 4.5 0 0 0 5.8-4.3l-2.7 1.1-2.4-2.4z" />,
  handshake: (
    <>
      <path d="M2 9.5l3-2.5 2.5 1M22 9.5l-3-2.5-2.5 1" />
      <path d="M7.5 8l3.6-1.6c.9-.4 1.9-.2 2.6.5L17.5 11a1.25 1.25 0 0 1-1.77 1.77L13.5 10.5" />
      <path d="M15.7 12.8a1.25 1.25 0 0 1-1.77 1.77l-1.6-1.6M13.9 14.6a1.25 1.25 0 0 1-1.77 1.77l-1.2-1.2" />
      <path d="M7.5 8L5 14.5l5.6 4.3c.6.45 1.4.4 1.9-.15M16.5 8l2.5 6-2.6 2" />
    </>
  ),
  press: (
    <>
      <rect x="3.5" y="6" width="17" height="13" rx="2" />
      <path d="M9.5 6V4.5h5V6" />
      <circle cx="8.5" cy="11.5" r="2" />
      <path d="M5.8 16.5c.4-1.3 1.4-2 2.7-2s2.3.7 2.7 2M13.5 11h4M13.5 14h3" />
    </>
  ),
  conflict: <path d="M4 4l11.5 11.5M13 17.5l4.5-4.5M16.5 16.5L20 20M20 4L8.5 15.5M6.5 13l4.5 4.5M7.5 16.5L4 20" />,
  mountain: (
    <>
      <path d="M2.5 19.5l6.5-11 4 6.5 2.5-3.5 6 8z" />
      <path d="M7.2 11.5l1.8 1 1.6-1" />
    </>
  ),
  pizza: (
    <>
      <path d="M12 21.5L3.5 5a17 17 0 0 1 17 0z" />
      <path d="M4.9 7.7a15 15 0 0 1 14.2 0" />
      <circle cx="10" cy="10.5" r="1.1" fill={DOT} />
      <circle cx="14.2" cy="11.5" r="1.1" fill={DOT} />
      <circle cx="12" cy="15.5" r="1" fill={DOT} />
    </>
  ),
  megaphone: (
    <>
      <path d="M3.5 10v4a1 1 0 0 0 1 1h2l9 5V4l-9 5h-2a1 1 0 0 0-1 1z" />
      <path d="M6.5 15l1.5 5h2.5l-1.3-4.3M19 9.5a3 3 0 0 1 0 5" />
    </>
  ),
  contract: (
    <>
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M14 3v5h5M8 10h4M8 13h7" />
      <path d="M8 17.5c1-1.5 1.8-1.5 2.2 0s1.3 1.5 2.3-.3c.5.9 1.2 1.1 2.5.8" />
    </>
  ),
  smoke: <path d="M7 20.5c-1.5-2 1.5-3.5 0-5.5s1.5-3.5 0-5.5M12 20.5c-1.5-2.2 1.5-3.8 0-6s1.5-3.8 0-6-1.5-3 0-5M17 20.5c-1.5-2 1.5-3.5 0-5.5s1.5-3.5 0-5.5" />,
  audit: (
    <>
      <rect x="4" y="4.5" width="12" height="16" rx="1.5" />
      <path d="M8 4.5V3h4v1.5M7 9h6M7 12h3.5" />
      <circle cx="16" cy="15.5" r="3.25" />
      <path d="M18.3 17.8l2.4 2.4" />
    </>
  ),
  student: (
    <>
      <path d="M12 4.5l10 4.5-10 4.5L2 9z" />
      <path d="M6 11v4.5c0 1.5 2.7 3 6 3s6-1.5 6-3V11M22 9v5" />
    </>
  ),
  letters: (
    <>
      <rect x="2.5" y="8.5" width="15" height="11" rx="1.5" />
      <path d="M3 9.5l7 5 7-5" />
      <path d="M6.5 8.5V6.5A1.5 1.5 0 0 1 8 5h12a1.5 1.5 0 0 1 1.5 1.5V14a1.5 1.5 0 0 1-1.5 1.5h-2.5" />
    </>
  ),
  shark: (
    <>
      <path d="M4 15.5C8 14 9 7 16 4.5c-1.2 3.6-1 7.4.8 11" />
      <path d="M2.5 18.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2v.5h5V16c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
      <path d="M9.5 19h5M10.5 21.5h3" />
    </>
  ),
  house: (
    <>
      <path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
      <path d="M10 20.5v-5h4v5" />
    </>
  ),
  robot: (
    <>
      <rect x="5" y="7.5" width="14" height="11" rx="3" />
      <path d="M12 7.5V4.5M3 12v3M21 12v3M9.5 15.5h5" />
      <circle cx="12" cy="3.5" r="1" />
      <circle cx="9.25" cy="11.75" r="1.25" fill={DOT} />
      <circle cx="14.75" cy="11.75" r="1.25" fill={DOT} />
    </>
  ),
  leak: (
    <>
      <path d="M12 3.5s-6 6.5-6 10.5a6 6 0 0 0 12 0c0-4-6-10.5-6-10.5z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  sell: (
    <>
      <path d="M3.5 12.4V5A1.5 1.5 0 0 1 5 3.5h7.4a1.5 1.5 0 0 1 1.06.44l7.1 7.1a1.5 1.5 0 0 1 0 2.12l-7.5 7.5a1.5 1.5 0 0 1-2.12 0l-7-7a1.5 1.5 0 0 1-.44-1.06z" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  coffee: (
    <>
      <path d="M4.5 9h12v6.5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z" />
      <path d="M16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-1.6M8.5 3.5c-.8 1 .8 2 0 3M12.5 3.5c-.8 1 .8 2 0 3" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.25" />
      <circle cx="12" cy="12" r="1.6" fill={DOT} />
    </>
  ),
  bug: (
    <>
      <path d="M8 10.5a4 4 0 0 1 8 0V15a4 4 0 0 1-8 0z" />
      <path d="M9.5 7.6a2.5 2.5 0 0 1 5 0M12 11v7.5M8 12H4M8 16H4.5M16 12h4M16 16h3.5M8.6 18.8L6 21M15.4 18.8L18 21M9.8 5.4L8.5 3.5M14.2 5.4l1.3-1.9" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5c-2-1.7-5-2.3-8.5-2v14c3.5-.3 6.5.3 8.5 2 2-1.7 5-2.3 8.5-2v-14c-3.5-.3-6.5.3-8.5 2z" />
      <path d="M12 6.5v14" />
    </>
  ),
  pen: (
    <>
      <path d="M12 21.5l-5-9.5 2.5-8.5h5l2.5 8.5z" />
      <path d="M12 21.5v-8" />
      <circle cx="12" cy="11.5" r="1.5" />
    </>
  ),
  code: <path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />,
  brush: (
    <>
      <path d="M20 3.5c-3.2 1.7-7.4 5.8-9 8.6l1.4 1.4c2.8-1.6 6.9-5.8 8.6-9z" />
      <path d="M9.6 13.2c-2 0-3.6 1.5-3.6 3.6 0 1.3-.7 2.3-2 3 4.1.8 7.6-.6 7.6-4.6" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5.5l11-2V16" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7" />
    </>
  ),
  camera: (
    <>
      <path d="M4.5 7.5h3l1.5-2.5h6l1.5 2.5h3A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V9a1.5 1.5 0 0 1 1.5-1.5z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="7" rx="1.75" />
      <rect x="3.5" y="13" width="17" height="7" rx="1.75" />
      <path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6" />
    </>
  ),
  controller: (
    <>
      <path d="M7.5 7h9a5 5 0 0 1 4.9 4l.9 4.5a2.6 2.6 0 0 1-4.6 2.1l-1.5-2.1H7.8l-1.5 2.1a2.6 2.6 0 0 1-4.6-2.1L2.6 11A5 5 0 0 1 7.5 7z" />
      <path d="M7 10v3M5.5 11.5h3M16 10.5h.01M18 12.5h.01" />
    </>
  ),
  handheld: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <rect x="8.5" y="5" width="7" height="6" rx="1" />
      <path d="M9.75 14.5v3M8.25 16h3M15 15h.01M13.75 17.25h.01" />
    </>
  ),
  pc: (
    <>
      <rect x="2.5" y="4.5" width="13" height="10" rx="1.5" />
      <path d="M6.5 18.5h5M9 14.5v4" />
      <rect x="17.5" y="4.5" width="4" height="15" rx="1" />
      <path d="M19.5 7.5h.01" />
    </>
  ),
  mobile: (
    <>
      <rect x="6.5" y="3" width="11" height="18" rx="2.5" />
      <path d="M10.5 5.5h3M12 18.25v.01" />
    </>
  ),
  vr: (
    <>
      <path d="M5.5 8h13a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-3l-2-2.2a1.4 1.4 0 0 0-2 0l-2 2.2h-3a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3z" />
      <path d="M7 8V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V8" />
    </>
  ),
  'cloud-game': (
    <>
      <path d="M7 19a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.42 1.56A3.75 3.75 0 0 1 17.5 19z" />
      <path d="M10.75 12.25v4.5l3.75-2.25z" />
    </>
  ),
  shuriken: (
    <>
      <path d={SHURIKEN} />
      <circle cx="12" cy="12" r="1.6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES: IconName[] = Object.keys(ICONS) as IconName[];

export function Icon({
  name,
  size = 20,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** When given, the icon is announced to assistive tech; otherwise it is decorative. */
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {ICONS[name]}
    </svg>
  );
}
