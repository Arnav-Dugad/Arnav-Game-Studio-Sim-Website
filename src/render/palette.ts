/** Renderer colour palettes (numbers for Pixi), mirroring docs/ART.md §2. */
export interface ScenePalette {
  bg: number;
  floorWood: number;
  floorWood2: number;
  floorCarpet: number;
  floorCarpet2: number;
  wall: number;
  wallTop: number;
  trim: number;
  wood: number;
  woodDark: number;
  metal: number;
  metalDark: number;
  plant: number;
  plantDark: number;
  pot: number;
  ink: number;
  screenOff: number;
  screenOn: number;
  glow: number;
  shadow: number;
  accentDesign: number;
  accentTech: number;
  accentArt: number;
  accentAudio: number;
  accentBiz: number;
  window: number;
  windowFrame: number;
  rug: number;
  night: boolean;
}

export const LIGHT: ScenePalette = {
  bg: 0xe8dfd1,
  floorWood: 0xe6d3b6,
  floorWood2: 0xdcc6a6,
  floorCarpet: 0xd5dbe3,
  floorCarpet2: 0xcbd2dc,
  wall: 0xf3ece1,
  wallTop: 0xfaf6ef,
  trim: 0xc9b597,
  wood: 0xb98957,
  woodDark: 0x8f6640,
  metal: 0xa7b0bd,
  metalDark: 0x6f7987,
  plant: 0x5fa36a,
  plantDark: 0x3f7d4a,
  pot: 0xd9825f,
  ink: 0x2a2622,
  screenOff: 0x2b3440,
  screenOn: 0x3d85c6,
  glow: 0x9fd3ff,
  shadow: 0x000000,
  accentDesign: 0xe07a5f,
  accentTech: 0x3d85c6,
  accentArt: 0x9b6bd3,
  accentAudio: 0x2eb5a8,
  accentBiz: 0xe3b23c,
  window: 0xbfe3f5,
  windowFrame: 0xffffff,
  rug: 0xc96f5a,
  night: false,
};

export const DARK: ScenePalette = {
  bg: 0x16130f,
  floorWood: 0x4a3b2d,
  floorWood2: 0x433527,
  floorCarpet: 0x323a48,
  floorCarpet2: 0x2c3340,
  wall: 0x2b2722,
  wallTop: 0x38332c,
  trim: 0x5a4c3d,
  wood: 0x8a6440,
  woodDark: 0x5f4329,
  metal: 0x6d7685,
  metalDark: 0x474f5b,
  plant: 0x4e8a58,
  plantDark: 0x335c3a,
  pot: 0xa8604a,
  ink: 0xf1ede6,
  screenOff: 0x1a2028,
  screenOn: 0x5aa0e0,
  glow: 0x7cc2ff,
  shadow: 0x000000,
  accentDesign: 0xf08a6f,
  accentTech: 0x5aa0e0,
  accentArt: 0xb28ae6,
  accentAudio: 0x3ccfc0,
  accentBiz: 0xf2c450,
  window: 0x23324a,
  windowFrame: 0x55606e,
  rug: 0x8f4e40,
  night: true,
};

export function hexToNum(hex: string): number {
  const h = hex.replace('#', '');
  return parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
}

export function shade(c: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
