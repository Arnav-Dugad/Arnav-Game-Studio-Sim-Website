/**
 * Procedural vector sprites for office items and staff (drawn with Pixi Graphics, cached as textures).
 * Shape language: rounded boxes with a lighter top face, darker front face and a soft contact shadow.
 */
import type { Graphics } from 'pixi.js';
import type { ItemId } from '@/data/facilities';
import { type ScenePalette, mix, shade } from './palette';

export const T = 40; // world px per tile
export const LIFT = 0.42; // how far tall objects rise above their footprint (in tiles)

interface Box {
  x: number;
  y: number;
  w: number;
  h: number; // footprint depth on floor
  height: number; // vertical height in px (drawn upward)
  top: number;
  front: number;
  r?: number;
}

function shadow(g: Graphics, x: number, y: number, w: number, h: number, alpha = 0.16): void {
  g.ellipse(x + w / 2, y + h - 2, w * 0.55, Math.max(4, h * 0.22)).fill({ color: 0x000000, alpha });
}

/** A ¾-view box: top face at (y - height), front face below it. */
function box(g: Graphics, b: Box): void {
  const r = b.r ?? 5;
  const frontH = Math.max(4, b.height);
  // front face
  g.roundRect(b.x, b.y + b.h - frontH, b.w, frontH, r).fill(b.front);
  // top face
  g.roundRect(b.x, b.y - b.height + b.h * 0, b.w, b.h, r).fill(b.top);
  // highlight edge
  g.roundRect(b.x + 2, b.y - b.height + 2, b.w - 4, 3, 2).fill({ color: 0xffffff, alpha: 0.18 });
}

function monitor(g: Graphics, P: ScenePalette, x: number, y: number, w: number, era: number, on = true): void {
  if (era < 2003) {
    // CRT
    g.roundRect(x, y, w, w * 0.8, 4).fill(mix(0xe8e0cc, P.metal, P.night ? 0.5 : 0));
    g.roundRect(x + 3, y + 3, w - 6, w * 0.8 - 9, 3).fill(on ? (P.night ? 0x2f6fa8 : 0x2d5f8f) : P.screenOff);
    if (on) for (let i = 0; i < 3; i++) g.rect(x + 6, y + 7 + i * 4, w * (0.3 + ((i * 37) % 30) / 100), 1.6).fill({ color: 0xbfe6ff, alpha: 0.75 });
  } else {
    g.roundRect(x + w / 2 - 2, y + w * 0.6, 4, 6, 1).fill(P.metalDark);
    g.roundRect(x, y, w, w * 0.62, 3).fill(0x1e232b);
    g.roundRect(x + 2, y + 2, w - 4, w * 0.62 - 4, 2).fill(on ? P.screenOn : P.screenOff);
    if (on) for (let i = 0; i < 3; i++) g.rect(x + 5, y + 5 + i * 3.5, w * (0.25 + ((i * 41) % 40) / 100), 1.4).fill({ color: 0xffffff, alpha: 0.7 });
  }
  if (on && P.night) g.circle(x + w / 2, y + w * 0.35, w * 0.9).fill({ color: P.glow, alpha: 0.07 });
}

function chair(g: Graphics, P: ScenePalette, cx: number, y: number, color: number): void {
  g.ellipse(cx, y + 9, 9, 3.5).fill({ color: 0x000000, alpha: 0.12 });
  g.roundRect(cx - 8, y - 2, 16, 9, 4).fill(shade(color, 0.85));
  g.roundRect(cx - 8, y - 8, 16, 7, 4).fill(color);
  void P;
}

function plant(g: Graphics, P: ScenePalette, cx: number, base: number, s: number): void {
  g.ellipse(cx, base, 9 * s, 3.5 * s).fill({ color: 0x000000, alpha: 0.15 });
  g.roundRect(cx - 7 * s, base - 12 * s, 14 * s, 12 * s, 3 * s).fill(P.pot);
  g.roundRect(cx - 7 * s, base - 12 * s, 14 * s, 3 * s, 2).fill(shade(P.pot, 1.15));
  const leaves: [number, number, number][] = [
    [0, -22, 9],
    [-7, -17, 7],
    [7, -17, 7],
    [-4, -28, 6],
    [5, -27, 6],
  ];
  for (const [dx, dy, r] of leaves) g.circle(cx + dx * s, base + dy * s, r * s).fill(P.plantDark);
  for (const [dx, dy, r] of leaves) g.circle(cx + dx * s - 1.5 * s, base + dy * s - 1.5 * s, r * s * 0.75).fill(P.plant);
}

export interface DrawOpts {
  era: number;
  P: ScenePalette;
}

/**
 * Draw an item into `g` with origin at the footprint's top-left. `w`/`h` are footprint tiles (already rotated).
 */
export function drawItem(g: Graphics, id: ItemId, w: number, h: number, o: DrawOpts): void {
  const { P, era } = o;
  const W = w * T;
  const H = h * T;
  const pad = 4;
  switch (id) {
    case 'desk_basic':
    case 'desk_pro':
    case 'desk_studio':
    case 'desk_workstation': {
      const tier = ['desk_basic', 'desk_pro', 'desk_studio', 'desk_workstation'].indexOf(id);
      const top = tier === 0 ? 0xd7c09a : tier === 1 ? P.wood : tier === 2 ? 0xe9e2d6 : 0x3b3f48;
      shadow(g, pad, 6, W - pad * 2, H - 6);
      box(g, { x: pad, y: 8, w: W - pad * 2, h: H - 18, height: 10, top: P.night ? shade(top, 0.75) : top, front: shade(top, 0.72), r: 4 });
      const mw = tier >= 3 ? W * 0.62 : W * 0.38;
      if (tier === 2) {
        monitor(g, P, W * 0.12, -4, W * 0.34, era);
        monitor(g, P, W * 0.52, -4, W * 0.34, era);
      } else monitor(g, P, (W - mw) / 2, -6, mw, era);
      // keyboard
      g.roundRect(W * 0.3, H - 22, W * 0.4, 5, 2).fill(shade(top, 0.6));
      if (tier === 3) g.rect(pad + 2, H - 12, W - pad * 2 - 4, 2).fill({ color: P.accentArt, alpha: 0.9 });
      chair(g, P, W / 2, H - 2, tier >= 2 ? P.accentTech : tier === 1 ? P.accentDesign : 0x8a8f99);
      break;
    }
    case 'coffee_machine':
      shadow(g, 6, 4, W - 12, H - 4);
      box(g, { x: 8, y: 6, w: W - 16, h: H - 12, height: 22, top: 0x4a4f58, front: 0x30343b, r: 5 });
      g.roundRect(13, H - 30, W - 26, 10, 3).fill(0x1e2126);
      g.circle(W - 14, H - 37, 2.2).fill(0xe0533a);
      g.roundRect(W / 2 - 4, H - 16, 8, 7, 2).fill(0xffffff);
      g.roundRect(W / 2 - 3, H - 22, 6, 4, 1).fill({ color: 0x6b3f22, alpha: 0.9 });
      break;
    case 'water_cooler':
      shadow(g, 8, 4, W - 16, H - 4);
      box(g, { x: 11, y: 10, w: W - 22, h: H - 16, height: 16, top: 0xe8ecef, front: 0xc5ccd3, r: 4 });
      g.roundRect(13, -12, W - 26, 20, 8).fill({ color: 0x7cc4ef, alpha: 0.85 });
      g.roundRect(15, -10, 4, 14, 2).fill({ color: 0xffffff, alpha: 0.5 });
      break;
    case 'vending_machine':
      shadow(g, 4, 4, W - 8, H - 4);
      box(g, { x: 5, y: 4, w: W - 10, h: H - 8, height: 34, top: 0xd1495b, front: 0xa63446, r: 5 });
      g.roundRect(9, H - 40, W - 26, 30, 3).fill(0x22262c);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.roundRect(11 + c * 6, H - 37 + r * 9, 4, 6, 1).fill([P.accentBiz, P.accentAudio, P.accentArt][(r + c) % 3]!);
      break;
    case 'kitchen':
      shadow(g, 3, 4, W - 6, H - 4);
      box(g, { x: 4, y: 6, w: W - 8, h: H - 10, height: 18, top: 0xe9e4dc, front: P.wood, r: 4 });
      g.roundRect(W * 0.12, 6, W * 0.25, H - 26, 4).fill(0xb8c2cc);
      g.roundRect(W * 0.62, -16, W * 0.3, H + 4, 5).fill(0xf4f4f4);
      g.roundRect(W * 0.62, -16, W * 0.3, 4, 2).fill(0xdadada);
      g.rect(W * 0.66, H * 0.2, 2, 10).fill(0x9aa4b2);
      break;
    case 'lounge_sofa':
    case 'bean_bag': {
      const c = id === 'bean_bag' ? P.accentBiz : P.accentDesign;
      shadow(g, 3, 4, W - 6, H - 4);
      if (id === 'bean_bag') {
        g.ellipse(W / 2, H - 14, W * 0.38, H * 0.32).fill(shade(c, 0.8));
        g.ellipse(W / 2 - 2, H - 18, W * 0.32, H * 0.24).fill(c);
      } else {
        g.roundRect(4, 2, W - 8, H - 10, 8).fill(shade(c, 0.78));
        g.roundRect(8, 10, W - 16, H - 20, 6).fill(c);
        for (let i = 0; i < 2; i++) g.roundRect(12 + i * (W / 2 - 8), 13, W / 2 - 16, H - 28, 5).fill(shade(c, 1.12));
      }
      break;
    }
    case 'arcade_cabinet':
      shadow(g, 5, 4, W - 10, H - 4);
      box(g, { x: 7, y: 4, w: W - 14, h: H - 8, height: 38, top: 0x2a2440, front: 0x1c1830, r: 4 });
      g.roundRect(10, -32, W - 20, 6, 2).fill(P.accentBiz);
      g.roundRect(10, -24, W - 20, 18, 3).fill(0x1b1b1b);
      g.roundRect(12, -22, W - 24, 14, 2).fill(P.night ? 0x47d1c7 : 0x2eb5a8);
      g.circle(15, H - 26, 2.5).fill(0xe0533a);
      g.circle(W - 15, H - 26, 2.5).fill(0x3d85c6);
      if (P.night) g.circle(W / 2, -14, 26).fill({ color: 0x47d1c7, alpha: 0.08 });
      break;
    case 'pinball':
      shadow(g, 4, 4, W - 8, H - 4);
      box(g, { x: 6, y: 6, w: W - 12, h: H - 14, height: 14, top: 0x3d2f5b, front: 0x281e3d, r: 6 });
      g.roundRect(10, -2, W - 20, H - 26, 4).fill(P.night ? 0x5a3d9b : 0x6b4bb5);
      for (let i = 0; i < 4; i++) g.circle(14 + (i % 2) * (W - 28), 8 + i * 14, 3).fill([P.accentBiz, P.accentDesign, P.accentAudio, P.accentTech][i]!);
      break;
    case 'ping_pong':
      shadow(g, 6, 8, W - 12, H - 12);
      box(g, { x: 8, y: 10, w: W - 16, h: H - 22, height: 8, top: 0x2f8a63, front: 0x1f6047, r: 4 });
      g.rect(W / 2 - 1, 10, 2, H - 30).fill({ color: 0xffffff, alpha: 0.9 });
      g.rect(8, H / 2 - 6, W - 16, 2).fill({ color: 0xffffff, alpha: 0.6 });
      break;
    case 'plant_small':
      plant(g, P, W / 2, H - 6, 0.8);
      break;
    case 'plant_large':
      plant(g, P, W / 2, H - 4, 1.25);
      break;
    case 'poster':
      shadow(g, 10, 4, W - 20, H - 4, 0.12);
      g.moveTo(W / 2 - 8, H - 4).lineTo(W / 2, 4).lineTo(W / 2 + 8, H - 4).stroke({ width: 2, color: P.woodDark });
      g.roundRect(8, -6, W - 16, H - 8, 2).fill(0xffffff);
      g.roundRect(10, -4, W - 20, H - 12, 1).fill(P.accentArt);
      g.circle(W / 2, 8, 6).fill(P.accentBiz);
      break;
    case 'rug':
      g.roundRect(4, 4, W - 8, H - 8, 10).fill({ color: P.rug, alpha: 0.9 });
      g.roundRect(10, 10, W - 20, H - 20, 8).stroke({ width: 2, color: shade(P.rug, 1.3), alpha: 0.7 });
      break;
    case 'aquarium':
      shadow(g, 3, 4, W - 6, H - 4);
      box(g, { x: 4, y: 8, w: W - 8, h: H - 12, height: 10, top: P.woodDark, front: shade(P.woodDark, 0.8), r: 3 });
      g.roundRect(5, -18, W - 10, H, 4).fill({ color: 0x5fb4e0, alpha: 0.75 });
      g.roundRect(5, -18, W - 10, 4, 2).fill({ color: 0xffffff, alpha: 0.5 });
      g.ellipse(W * 0.35, H * 0.05, 5, 3).fill(0xf29e4c);
      g.ellipse(W * 0.65, -H * 0.12, 4, 2.5).fill(0xf2d14c);
      g.rect(W * 0.2, H * 0.3, 2, 10).fill(P.plant);
      break;
    case 'bookshelf':
      shadow(g, 3, 4, W - 6, H - 4);
      box(g, { x: 4, y: 4, w: W - 8, h: H - 8, height: 36, top: P.wood, front: P.woodDark, r: 3 });
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 8; i++) g.rect(8 + i * ((W - 16) / 8), -28 + row * 12, (W - 16) / 8 - 1.5, 9).fill([P.accentDesign, P.accentTech, P.accentArt, P.accentBiz, P.accentAudio][(i + row * 2) % 5]!);
      break;
    case 'neon_sign':
      shadow(g, 10, 4, W - 20, H - 4, 0.12);
      g.roundRect(6, -10, W - 12, 22, 6).fill(0x1e1b26);
      g.roundRect(9, -7, W - 18, 16, 5).stroke({ width: 2.5, color: P.accentDesign });
      if (P.night) g.circle(W / 2, 0, 30).fill({ color: P.accentDesign, alpha: 0.12 });
      g.rect(W / 2 - 1, 12, 2, H - 16).fill(P.metalDark);
      break;
    case 'trophy_shelf':
      shadow(g, 3, 4, W - 6, H - 4);
      box(g, { x: 4, y: 6, w: W - 8, h: H - 10, height: 22, top: P.wood, front: P.woodDark, r: 3 });
      for (let i = 0; i < 3; i++) {
        const cx = 14 + i * ((W - 28) / 2);
        g.roundRect(cx - 5, -14, 10, 9, 3).fill(P.accentBiz);
        g.rect(cx - 1.5, -5, 3, 5).fill(shade(P.accentBiz, 0.8));
        g.rect(cx - 4, 0, 8, 2.5).fill(shade(P.accentBiz, 0.7));
      }
      break;
    case 'whiteboard':
      shadow(g, 4, 4, W - 8, H - 4, 0.12);
      g.rect(8, 4, 2, H - 8).fill(P.metalDark);
      g.rect(W - 10, 4, 2, H - 8).fill(P.metalDark);
      g.roundRect(4, -20, W - 8, H - 4, 3).fill(0xfbfbfb);
      g.roundRect(4, -20, W - 8, H - 4, 3).stroke({ width: 2, color: P.metal });
      g.moveTo(12, -8).lineTo(30, -12).lineTo(42, -2).stroke({ width: 1.6, color: P.accentTech });
      g.circle(W - 22, -6, 6).stroke({ width: 1.6, color: P.accentDesign });
      break;
    case 'meeting_table':
      shadow(g, 6, 8, W - 12, H - 10);
      for (const [cx, cy] of [
        [W * 0.3, 8],
        [W * 0.7, 8],
        [W * 0.3, H - 6],
        [W * 0.7, H - 6],
      ] as [number, number][])
        chair(g, P, cx, cy, P.metal);
      g.roundRect(10, 14, W - 20, H - 32, (H - 32) / 2).fill(shade(P.wood, 0.75));
      g.roundRect(10, 10, W - 20, H - 32, (H - 32) / 2).fill(P.wood);
      g.roundRect(W * 0.4, H * 0.32, W * 0.2, 6, 2).fill(0xffffff);
      break;
    case 'qa_station':
      shadow(g, 3, 6, W - 6, H - 6);
      box(g, { x: 4, y: 8, w: W - 8, h: H - 16, height: 10, top: 0xdde2e7, front: 0xb4bcc5, r: 4 });
      monitor(g, P, 8, -4, W * 0.28, Math.max(era, 2004));
      g.roundRect(W * 0.42, 2, W * 0.2, 12, 3).fill(0x2a2d33);
      g.roundRect(W * 0.68, 4, W * 0.22, 9, 3).fill(0x3b3f48);
      g.circle(W * 0.79, 8, 2).fill(0x46c07a);
      chair(g, P, W * 0.3, H - 2, P.accentAudio);
      break;
    case 'server_rack': {
      shadow(g, 4, 4, W - 8, H - 4);
      box(g, { x: 6, y: 4, w: W - 12, h: H - 8, height: 40, top: 0x2a2f37, front: 0x1b1f25, r: 3 });
      for (let i = 0; i < 6; i++) {
        g.roundRect(9, -32 + i * 7, W - 18, 5, 1).fill(0x3a414c);
        g.circle(W - 13, -29.5 + i * 7, 1.3).fill(i % 2 ? 0x46c07a : 0x5aa0e0);
      }
      break;
    }
    case 'sound_booth':
      shadow(g, 4, 6, W - 8, H - 6);
      box(g, { x: 6, y: 6, w: W - 12, h: H - 12, height: 26, top: 0x3a3442, front: 0x29242f, r: 6 });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.roundRect(12 + c * ((W - 24) / 4), -14 + r * 10, (W - 24) / 4 - 3, 7, 2).fill(shade(0x4b4256, 1 + ((r + c) % 2) * 0.15));
      g.rect(W / 2 - 1, H * 0.35, 2, 16).fill(P.metal);
      g.roundRect(W / 2 - 5, H * 0.3, 10, 9, 4).fill(0x1b1b1b);
      break;
    case 'mocap_rig':
      g.roundRect(6, 6, W - 12, H - 12, 6).fill({ color: 0x2a2f37, alpha: 0.85 });
      for (let i = 1; i < 6; i++) {
        g.rect(6 + (i * (W - 12)) / 6, 6, 1, H - 12).fill({ color: P.accentArt, alpha: 0.35 });
        g.rect(6, 6 + (i * (H - 12)) / 6, W - 12, 1).fill({ color: P.accentArt, alpha: 0.35 });
      }
      for (const [cx, cy] of [
        [10, 10],
        [W - 10, 10],
        [10, H - 10],
        [W - 10, H - 10],
      ] as [number, number][]) {
        g.rect(cx - 1, cy - 22, 2, 22).fill(P.metal);
        g.roundRect(cx - 5, cy - 28, 10, 7, 2).fill(0x1b1b1b);
        g.circle(cx, cy - 24.5, 1.6).fill(0xe0533a);
      }
      break;
    case 'training_desk':
      shadow(g, 4, 6, W - 8, H - 6);
      box(g, { x: 5, y: 8, w: W - 10, h: H - 18, height: 10, top: 0xe9e2d6, front: 0xc8bfae, r: 4 });
      for (let i = 0; i < 3; i++) g.rect(9 + i * 3, 2 - i * 3, 14, 3).fill([P.accentDesign, P.accentTech, P.accentBiz][i]!);
      chair(g, P, W / 2, H - 2, P.accentBiz);
      break;
    case 'rnd_bench':
      shadow(g, 3, 6, W - 6, H - 6);
      box(g, { x: 4, y: 8, w: W - 8, h: H - 16, height: 12, top: 0xf2f4f6, front: 0xbcc3cb, r: 3 });
      g.moveTo(16, 0).lineTo(22, -14).lineTo(28, 0).closePath().fill({ color: 0x46c07a, alpha: 0.8 });
      g.rect(20, -20, 4, 7).fill({ color: 0xffffff, alpha: 0.7 });
      g.roundRect(W * 0.5, -10, W * 0.36, 16, 3).fill(0x22262c);
      g.moveTo(W * 0.53, -2).lineTo(W * 0.6, -6).lineTo(W * 0.67, 2).lineTo(W * 0.74, -4).lineTo(W * 0.82, -1).stroke({ width: 1.4, color: 0x46c07a });
      break;
    case 'marketing_board':
      shadow(g, 4, 4, W - 8, H - 4, 0.12);
      g.roundRect(4, -18, W - 8, H - 2, 4).fill(0x1f2430);
      for (let i = 0; i < 5; i++) g.roundRect(12 + i * 12, H - 26 - i * 5, 8, 6 + i * 5, 1).fill(P.accentBiz);
      g.moveTo(10, -6).lineTo(30, -12).lineTo(50, -4).lineTo(70, -14).stroke({ width: 2, color: P.accentDesign });
      break;
    default:
      box(g, { x: 6, y: 6, w: W - 12, h: H - 12, height: 12, top: P.metal, front: P.metalDark });
  }
}

/** How far an item visually extends above its footprint (for depth & ghosts). */
export function itemLift(id: ItemId): number {
  switch (id) {
    case 'server_rack':
    case 'bookshelf':
    case 'arcade_cabinet':
    case 'vending_machine':
      return 44;
    case 'kitchen':
    case 'aquarium':
    case 'whiteboard':
    case 'sound_booth':
    case 'trophy_shelf':
    case 'marketing_board':
    case 'mocap_rig':
      return 34;
    case 'rug':
      return 0;
    default:
      return 26;
  }
}

// ── Staff ───────────────────────────────────────────────────────────────────

const SKIN = [0xf6d6bd, 0xeec0a0, 0xd9a07b, 0xc68a62, 0xa8714b, 0x8d5a3b, 0x6e432a, 0x4e2f1f];
const HAIR = [0x2b211b, 0x4a3426, 0x7a5232, 0xb98957, 0xe0c27a, 0x8a8f99, 0xc2563a, 0x1f1f2a, 0xd9d4cc];
export const ROLE_COLORS: Record<string, number> = {
  founder: 0xe07a5f,
  designer: 0xe07a5f,
  programmer: 0x3d85c6,
  artist: 0x9b6bd3,
  audio: 0x2eb5a8,
  writer: 0xc9a227,
  qa: 0x5f9e6e,
  marketer: 0xe3b23c,
  producer: 0x7a8696,
};

export interface Look {
  skin: number;
  hair: number;
  hairStyle: number;
  top: number;
  glasses: boolean;
  headphones: boolean;
}

function hash32(n: number): () => number {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lookFor(seed: number, role: string, companyColor?: number): Look {
  const r = hash32(seed || 1);
  return {
    skin: SKIN[Math.floor(r() * SKIN.length)]!,
    hair: HAIR[Math.floor(r() * HAIR.length)]!,
    hairStyle: Math.floor(r() * 6),
    top: role === 'founder' && companyColor !== undefined ? companyColor : (ROLE_COLORS[role] ?? 0x888888),
    glasses: r() < 0.3,
    headphones: role === 'audio' || r() < 0.12,
  };
}

/** Draw a staff figure centred at (0,0) = feet. Pose: 'stand' | 'sit' | 'slump'. */
export function drawPerson(g: Graphics, look: Look, pose: 'stand' | 'sit' | 'slump', P: ScenePalette): void {
  const s = 1;
  g.ellipse(0, 0, 9 * s, 3.5 * s).fill({ color: 0x000000, alpha: 0.18 });
  const bodyY = pose === 'sit' ? -12 : -14;
  // legs are separate (animated) graphics owned by the renderer when standing
  // torso
  g.roundRect(-8, bodyY - 10, 16, 14, 6).fill(look.top);
  g.roundRect(-8, bodyY - 10, 16, 4, 3).fill({ color: 0xffffff, alpha: 0.15 });
  const headX = pose === 'slump' ? 3 : 0;
  const headY = pose === 'slump' ? bodyY - 8 : bodyY - 17;
  // head
  g.circle(headX, headY, 7.5).fill(look.skin);
  // hair
  switch (look.hairStyle) {
    case 0:
      g.ellipse(headX, headY - 3.5, 7.8, 5).fill(look.hair);
      break;
    case 1:
      g.circle(headX, headY - 2, 8.5).fill(look.hair);
      g.circle(headX, headY + 1.5, 7).fill(look.skin);
      break;
    case 2:
      g.ellipse(headX, headY - 4, 8, 4).fill(look.hair);
      g.circle(headX + 6, headY - 5, 3.5).fill(look.hair);
      break;
    case 3:
      for (let i = -2; i <= 2; i++) g.circle(headX + i * 3.2, headY - 5.5, 3.5).fill(look.hair);
      break;
    case 4:
      g.ellipse(headX, headY - 4, 8, 4.5).fill(look.hair);
      g.roundRect(headX - 8, headY - 3, 3, 10, 2).fill(look.hair);
      g.roundRect(headX + 5, headY - 3, 3, 10, 2).fill(look.hair);
      break;
    default:
      g.ellipse(headX, headY - 6, 6, 2.5).fill(look.hair);
  }
  if (look.glasses) {
    g.roundRect(headX - 5, headY - 0.5, 4, 3, 1).stroke({ width: 1, color: 0x222222 });
    g.roundRect(headX + 1, headY - 0.5, 4, 3, 1).stroke({ width: 1, color: 0x222222 });
  }
  if (look.headphones) {
    g.moveTo(headX - 9, headY - 1).arc(headX, headY - 1, 9, Math.PI, 0).stroke({ width: 2, color: 0x2a2a2a });
    g.roundRect(headX - 10, headY - 2, 3.5, 6, 1.5).fill(0x2a2a2a);
    g.roundRect(headX + 6.5, headY - 2, 3.5, 6, 1.5).fill(0x2a2a2a);
  }
  void P;
}
