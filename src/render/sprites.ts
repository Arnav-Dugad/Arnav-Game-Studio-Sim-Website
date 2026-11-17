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
  /** Awards to show on a trophy shelf (capped at 8). */
  trophies?: number;
  /** The studio mascot for the statue. */
  mascot?: { kind: string; color: number; acc: string };
  /** Pinned fan drawings: a seed and a crayon colour each. */
  fanArt?: { seed: number; color: number }[];
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
    case 'pet_tortoise': {
      // the enclosure (the tortoise itself roams)
      shadow(g, 6, 10, W - 12, H - 14);
      g.roundRect(8, H - 26, W - 16, 16, 4).fill(0x8a6440);
      g.roundRect(10, H - 24, W - 20, 12, 3).fill(0xd9c27a);
      for (let i = 0; i < 6; i++) g.rect(12 + i * ((W - 26) / 5), H - 22 + (i % 2) * 3, 4, 1).fill({ color: 0xb59b55, alpha: 0.8 });
      g.ellipse(W - 16, H - 18, 3, 2).fill(0x5f9e6e);
      break;
    }
    case 'robot_vacuum': {
      // the charging dock (the robot itself roams)
      shadow(g, 10, 12, W - 20, H - 16);
      g.roundRect(W / 2 - 9, H - 18, 18, 10, 3).fill(0x2a2622);
      g.circle(W / 2, H - 15, 1.6).fill(0x5fd38a);
      break;
    }
    case 'hammock': {
      shadow(g, 6, 6, W - 12, H - 8);
      g.rect(8, 6, 3, H - 12).fill(P.woodDark);
      g.rect(W - 11, 6, 3, H - 12).fill(P.woodDark);
      g.moveTo(10, 14).quadraticCurveTo(W / 2, H * 0.7, W - 10, 14).lineTo(W - 10, 20).quadraticCurveTo(W / 2, H * 0.78, 10, 20).closePath().fill(P.accentArt);
      for (let i = 0; i < 4; i++) g.moveTo(14 + i * ((W - 28) / 3), 16).lineTo(14 + i * ((W - 28) / 3), H * 0.55).stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      break;
    }
    case 'karaoke': {
      shadow(g, 5, 4, W - 10, H - 4);
      box(g, { x: 6, y: 8, w: W - 12, h: H - 12, height: 16, top: 0x3a2a52, front: 0x2a1e3d, r: 4 });
      g.roundRect(9, -14, W - 18, 16, 3).fill(0x1e232b);
      g.roundRect(11, -12, W - 22, 12, 2).fill(0x9b6bd3);
      for (let i = 0; i < 3; i++) g.rect(13, -10 + i * 3.5, (W - 26) * (0.4 + i * 0.2), 1.2).fill({ color: 0xffffff, alpha: 0.8 });
      g.circle(W / 2 - 6, 10, 3).fill(0x2a2622);
      g.circle(W / 2 + 6, 10, 3).fill(0x2a2622);
      g.rect(W - 9, -6, 1.5, 14).fill(0x6d7685);
      g.circle(W - 8.25, -7, 2.4).fill(0x2a2622);
      break;
    }
    case 'parrot_perch': {
      shadow(g, 10, 12, W - 20, H - 16);
      g.rect(W / 2 - 1.5, H - 46, 3, 36).fill(0x6b4430); // pole
      g.ellipse(W / 2, H - 10, 9, 3).fill(0x4a3020);
      g.rect(W / 2 - 12, H - 46, 24, 3).fill(0x8a5a3c); // bar
      // (the parrot itself is animated by render/parrot.ts)
      break;
    }
    case 'bonsai': {
      shadow(g, 10, 12, W - 20, H - 16);
      box(g, { x: W / 2 - 9, y: H - 22, w: 18, h: 8, height: 6, top: 0x8a5a3c, front: 0x6b4430, r: 2 });
      g.moveTo(W / 2, H - 22).bezierCurveTo(W / 2 - 6, H - 30, W / 2 + 6, H - 36, W / 2 - 2, H - 44).stroke({ width: 3, color: 0x6b4430 });
      g.ellipse(W / 2 - 8, H - 44, 10, 6).fill(0x4f8f4f);
      g.ellipse(W / 2 + 7, H - 38, 8, 5).fill(0x5fa35a);
      g.ellipse(W / 2 - 1, H - 50, 9, 5).fill(0x6db466);
      break;
    }
    case 'zen_corner': {
      shadow(g, 4, 6, W - 8, H - 8, 0.1);
      g.roundRect(4, 6, W - 8, H - 10, 10).fill({ color: 0xd9cfb8, alpha: 0.9 }); // tatami
      for (let i = 1; i < 4; i++) g.rect(4 + ((W - 8) * i) / 4, 8, 1, H - 14).fill({ color: 0xb8ab8c, alpha: 0.7 });
      // cushions
      for (const [cx, cy] of [[W * 0.3, H * 0.62], [W * 0.62, H * 0.66]] as const) {
        g.ellipse(cx, cy, 9, 5).fill(0x8a6bb0);
        g.ellipse(cx, cy - 1.5, 7, 3.5).fill(0xa98bd0);
      }
      // water feature: a little stone bowl
      g.ellipse(W * 0.78, H * 0.32, 9, 5).fill(0x8f9499);
      g.ellipse(W * 0.78, H * 0.31, 6.5, 3.2).fill(0x7cc4ef);
      // a candle and a plant
      g.rect(W * 0.18, H * 0.22, 3, 6).fill(0xf4efe7);
      g.circle(W * 0.18 + 1.5, H * 0.2, 1.6).fill(0xf2c450);
      g.ellipse(W * 0.42, H * 0.25, 6, 4).fill(0x5f9e6e);
      break;
    }
    case 'screening_room': {
      shadow(g, 3, 4, W - 6, H - 4);
      g.roundRect(4, 4, W - 8, H - 8, 6).fill({ color: 0x2a2433, alpha: 0.95 });
      // the screen on its stand
      g.rect(W * 0.12, -26, W * 0.76, 34).fill(0x111111);
      g.rect(W * 0.14, -24, W * 0.72, 30).fill(0x3d85c6);
      g.circle(W * 0.5, -9, 7).fill({ color: 0xf2c450, alpha: 0.85 });
      g.moveTo(W * 0.14, 6).lineTo(W * 0.3, -6).lineTo(W * 0.45, 2).lineTo(W * 0.62, -10).lineTo(W * 0.86, 6).fill({ color: 0x2f8a63, alpha: 0.9 });
      // two rows of seats
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < 4; i++) {
          const x = W * 0.16 + i * (W * 0.19);
          const y = H * 0.48 + r * H * 0.24;
          g.roundRect(x, y, W * 0.15, 9, 3).fill(0xb8323c);
          g.roundRect(x, y - 4, W * 0.15, 5, 2).fill(0x8f2430);
        }
      break;
    }
    case 'gym': {
      shadow(g, 3, 4, W - 6, H - 4);
      g.roundRect(4, 4, W - 8, H - 8, 6).fill({ color: 0x3b3f48, alpha: 0.9 });
      // treadmill
      g.roundRect(10, H * 0.25, W * 0.28, H * 0.55, 3).fill(0x22262e);
      g.rect(12, H * 0.3, W * 0.28 - 4, H * 0.45).fill(0x4a4f58);
      g.roundRect(10, H * 0.18, W * 0.28, 5, 2).fill(0x6d7685);
      // rowing machine
      g.roundRect(W * 0.42, H * 0.55, W * 0.3, 6, 3).fill(0x9aa4b2);
      g.circle(W * 0.44, H * 0.58, 6).fill(0x2a2622);
      // dumbbell rack
      g.roundRect(W * 0.78, H * 0.2, W * 0.14, H * 0.6, 2).fill(0x6b4a2e);
      for (let i = 0; i < 4; i++) g.roundRect(W * 0.79, H * 0.24 + i * 11, W * 0.12, 4, 2).fill(i % 2 ? P.accentDesign : P.accentTech);
      g.roundRect(W * 0.42, H * 0.2, W * 0.3, H * 0.22, 4).fill(P.accentAudio);
      break;
    }
    case 'foosball': {
      shadow(g, 4, 6, W - 8, H - 8);
      box(g, { x: 6, y: 6, w: W - 12, h: H - 14, height: 14, top: 0x2f8a63, front: 0x6b4a2e, r: 4 });
      g.rect(W / 2 - 0.8, 7, 1.6, H - 16).fill({ color: 0xffffff, alpha: 0.7 });
      for (let i = 0; i < 4; i++) {
        const x = 12 + i * ((W - 24) / 3);
        g.rect(x - 0.8, 1, 1.6, H - 6).fill(0xc9ccd1);
        g.circle(x, 6 + (i % 2) * 8, 2.2).fill(i < 2 ? P.accentDesign : P.accentTech);
      }
      g.circle(W / 2 + 4, H / 2 - 4, 1.8).fill(0xffffff);
      break;
    }
    case 'claw_machine': {
      shadow(g, 5, 4, W - 10, H - 4);
      box(g, { x: 6, y: 8, w: W - 12, h: H - 12, height: 18, top: 0xf28fb0, front: 0xd1495b, r: 4 });
      g.roundRect(8, -26, W - 16, 30, 3).fill({ color: 0xbfe6ff, alpha: 0.75 });
      g.roundRect(8, -30, W - 16, 6, 2).fill(0xd1495b);
      g.rect(W / 2 - 0.5, -24, 1, 10).fill(0x6d7685);
      g.moveTo(W / 2 - 4, -12).lineTo(W / 2, -14).lineTo(W / 2 + 4, -12).stroke({ width: 1.2, color: 0x6d7685 });
      for (let i = 0; i < 4; i++) g.circle(12 + i * ((W - 24) / 3), 0, 3).fill([P.accentArt, P.accentBiz, P.accentAudio, P.accentTech][i]!);
      break;
    }
    case 'guitar_corner': {
      shadow(g, 8, 6, W - 16, H - 8);
      g.roundRect(W / 2 - 9, H - 16, 18, 6, 2).fill(0x3a3f4a);
      g.ellipse(W / 2, H - 20, 7, 8).fill(0xb98957);
      g.ellipse(W / 2, H - 30, 5, 6).fill(0xb98957);
      g.circle(W / 2, H - 22, 2.2).fill(0x2a2018);
      g.rect(W / 2 - 1, -12, 2, H - 14).fill(0x6b4a2e);
      g.roundRect(W / 2 - 2.5, -16, 5, 6, 1.5).fill(0x4a3426);
      break;
    }
    case 'globe': {
      shadow(g, 8, 6, W - 16, H - 8);
      g.roundRect(W / 2 - 7, H - 12, 14, 4, 2).fill(P.woodDark);
      g.rect(W / 2 - 1, H - 22, 2, 10).fill(P.woodDark);
      g.circle(W / 2, H - 30, 10).fill(0x5fb4e0);
      g.ellipse(W / 2 - 3, H - 33, 4, 3).fill(0x5f9e6e);
      g.ellipse(W / 2 + 4, H - 27, 3, 4).fill(0x5f9e6e);
      g.arc(W / 2, H - 30, 12, Math.PI * 0.7, Math.PI * 2.3).stroke({ width: 1.4, color: 0xe3b23c });
      break;
    }
    case 'mascot_statue': {
      shadow(g, 6, 4, W - 12, H - 4);
      box(g, { x: 8, y: 10, w: W - 16, h: H - 14, height: 12, top: 0xe9e4dc, front: 0xb8b0a4, r: 3 });
      const m = o.mascot ?? { kind: 'bear', color: P.accentDesign, acc: 'star' };
      const c = m.color;
      const cx = W / 2;
      g.ellipse(cx, -2, 9, 11).fill(c);
      // ears / horns / antenna by species
      if (m.kind === 'bear') {
        g.circle(cx - 6, -22, 3).fill(c);
        g.circle(cx + 6, -22, 3).fill(c);
      } else if (m.kind === 'cat') {
        g.poly([cx - 7, -19, cx - 6, -27, cx - 2, -22]).fill(c);
        g.poly([cx + 7, -19, cx + 6, -27, cx + 2, -22]).fill(c);
      } else if (m.kind === 'dragon') {
        g.poly([cx - 5, -21, cx - 8, -28, cx - 2, -23]).fill(0xf2e2b8);
        g.poly([cx + 5, -21, cx + 8, -28, cx + 2, -23]).fill(0xf2e2b8);
      } else if (m.kind === 'robot') {
        g.rect(cx - 0.6, -29, 1.2, 6).fill(0x2a2622);
        g.circle(cx, -29, 1.6).fill(0xf2c450);
      } else if (m.kind === 'bird') g.poly([cx - 2, -22, cx, -28, cx + 2, -22]).fill(c);
      if (m.kind === 'robot') g.roundRect(cx - 7, -23, 14, 13, 3).fill(c);
      else g.circle(cx, -16, 7).fill(c);
      g.circle(cx - 2.5, -17, 1.4).fill(0xffffff);
      g.circle(cx + 2.5, -17, 1.4).fill(0xffffff);
      if (m.kind === 'bird') g.poly([cx - 1.5, -14, cx + 1.5, -14, cx, -11]).fill(0xf2c450);
      if (m.acc === 'star') {
        g.moveTo(cx - 9, -4).lineTo(cx - 15, -14).stroke({ width: 3, color: c, cap: 'round' });
        g.star(cx - 15, -16, 5, 3, 1.4).fill(0xe3b23c);
      } else if (m.acc === 'crown') g.poly([cx - 5, -22, cx - 4, -27, cx - 1.5, -24, cx, -28, cx + 1.5, -24, cx + 4, -27, cx + 5, -22]).fill(0xe3b23c);
      else if (m.acc === 'cap') g.ellipse(cx, -22, 7, 2.6).fill(0x3d85c6);
      else if (m.acc === 'headphones') {
        g.rect(cx - 9, -19, 3, 5).fill(0xd8323c);
        g.rect(cx + 6, -19, 3, 5).fill(0xd8323c);
      }
      break;
    }
    case 'pet_cat':
    case 'pet_dog': {
      const dog = id === 'pet_dog';
      const c = dog ? P.accentTech : P.accentArt;
      shadow(g, 5, 8, W - 10, H - 12);
      if (dog) {
        g.roundRect(6, H * 0.34, W - 12, H * 0.5, 8).fill(shade(c, 0.75));
        g.roundRect(10, H * 0.4, W - 20, H * 0.36, 6).fill(shade(c, 1.15));
        g.roundRect(W * 0.62, H * 0.82, 10, 3.5, 1.5).fill(0xf4efe7);
        g.circle(W * 0.62, H * 0.82 + 1.7, 2.2).fill(0xf4efe7);
        g.circle(W * 0.62 + 10, H * 0.82 + 1.7, 2.2).fill(0xf4efe7);
      } else {
        g.ellipse(W / 2, H * 0.62, W * 0.36, H * 0.26).fill(shade(c, 0.75));
        g.ellipse(W / 2, H * 0.64, W * 0.27, H * 0.18).fill(shade(c, 1.2));
        g.circle(W * 0.2, H * 0.86, 3).fill(0xf2c450);
        g.moveTo(W * 0.2, H * 0.86).quadraticCurveTo(W * 0.1, H * 0.95, W * 0.06, H * 0.84).stroke({ width: 0.8, color: 0xf2c450 });
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
    case 'game_library': {
      shadow(g, 3, 4, W - 6, H - 4);
      box(g, { x: 4, y: 4, w: W - 8, h: H - 8, height: 36, top: P.woodDark, front: shade(P.woodDark, 0.8), r: 3 });
      const boxes = [P.accentDesign, P.accentTech, P.accentArt, P.accentBiz, P.accentAudio, 0x2a2622];
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 6; i++) {
          const bw = (W - 16) / 6;
          const c = boxes[(i * 2 + row) % boxes.length]!;
          g.roundRect(8 + i * bw, -28 + row * 12, bw - 2, 10, 1.5).fill(c);
          g.rect(8 + i * bw + 2, -26 + row * 12, bw - 6, 2).fill({ color: 0xffffff, alpha: 0.55 });
        }
      break;
    }
    case 'console_museum':
      shadow(g, 3, 4, W - 6, H - 4);
      box(g, { x: 4, y: 8, w: W - 8, h: H - 12, height: 12, top: P.woodDark, front: shade(P.woodDark, 0.8), r: 3 });
      g.roundRect(5, -22, W - 10, H + 4, 4).fill({ color: 0xdff1ff, alpha: 0.35 });
      g.roundRect(5, -22, W - 10, H + 4, 4).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
      // three little consoles on display
      g.roundRect(10, 0, 16, 8, 2).fill(0x3a3442);
      g.rect(12, 2, 6, 2).fill(P.accentDesign);
      g.roundRect(W / 2 - 7, -2, 14, 10, 2).fill(0xe8e2d6);
      g.circle(W / 2 + 3, 3, 1.6).fill(P.accentBiz);
      g.roundRect(W - 26, 1, 16, 7, 3).fill(0x1c1830);
      g.rect(W - 22, 3, 8, 1.5).fill(P.accentTech);
      if (P.night) g.circle(W / 2, -4, 26).fill({ color: 0xbfe4ff, alpha: 0.1 });
      break;
    case 'nap_pod':
      shadow(g, 3, 4, W - 6, H - 4);
      g.roundRect(4, 2, W - 8, H - 6, (W - 8) / 2).fill(shade(P.metal, 0.85));
      g.roundRect(7, 6, W - 14, H - 14, (W - 14) / 2).fill(0xf4f1ea);
      g.roundRect(9, 8, W - 18, (H - 18) * 0.45, (W - 18) / 2).fill({ color: 0x8fb8d8, alpha: 0.7 });
      g.circle(W / 2, H - 16, 2.5).fill(P.accentAudio);
      break;
    case 'neon_sign':
      shadow(g, 10, 4, W - 20, H - 4, 0.12);
      g.roundRect(6, -10, W - 12, 22, 6).fill(0x1e1b26);
      g.roundRect(9, -7, W - 18, 16, 5).stroke({ width: 2.5, color: P.accentDesign });
      if (P.night) g.circle(W / 2, 0, 30).fill({ color: P.accentDesign, alpha: 0.12 });
      g.rect(W / 2 - 1, 12, 2, H - 16).fill(P.metalDark);
      break;
    case 'trophy_shelf': {
      shadow(g, 3, 4, W - 6, H - 4);
      box(g, { x: 4, y: 6, w: W - 8, h: H - 10, height: 22, top: P.wood, front: P.woodDark, r: 3 });
      // Your real awards: up to four on the shelf, more on a second tier behind.
      const n = Math.max(0, Math.min(8, Math.floor(o.trophies ?? 0)));
      if (n === 0) {
        g.roundRect(W / 2 - 9, -6, 18, 6, 1.5).fill(shade(P.woodDark, 0.85)); // an empty plaque, waiting
        break;
      }
      if (n > 4) box(g, { x: 8, y: -2, w: W - 16, h: 6, height: 10, top: shade(P.wood, 1.05), front: P.woodDark, r: 2 });
      const row = (count: number, y: number, scale: number) => {
        for (let i = 0; i < count; i++) {
          const cx = count === 1 ? W / 2 : 12 + i * ((W - 24) / (count - 1));
          const gold = i % 3 !== 2 ? P.accentBiz : 0xc9ced6; // mostly gold, the odd silver
          g.roundRect(cx - 5 * scale, y - 14 * scale, 10 * scale, 9 * scale, 3 * scale).fill(gold);
          g.rect(cx - 1.5 * scale, y - 5 * scale, 3 * scale, 5 * scale).fill(shade(gold, 0.8));
          g.rect(cx - 4 * scale, y, 8 * scale, 2.5 * scale).fill(shade(gold, 0.7));
        }
      };
      if (n > 4) row(n - 4, -12, 0.8);
      row(Math.min(4, n), 0, 1);
      if (P.night) g.circle(W / 2, -8, 22).fill({ color: P.accentBiz, alpha: 0.08 });
      break;
    }
    case 'fan_wall': {
      shadow(g, 4, 4, W - 8, H - 4, 0.12);
      g.rect(8, 4, 2, H - 8).fill(P.woodDark);
      g.rect(W - 10, 4, 2, H - 8).fill(P.woodDark);
      g.roundRect(4, -22, W - 8, H - 2, 3).fill(0xc79a63); // cork
      g.roundRect(4, -22, W - 8, H - 2, 3).stroke({ width: 2.4, color: P.woodDark });
      for (let i = 0; i < 14; i++) g.circle(10 + ((i * 37) % (W - 20)), -16 + ((i * 23) % (H - 10)), 0.6).fill({ color: 0x7a5530, alpha: 0.5 });
      const wide = W >= H;
      const cols = wide ? 4 : 1;
      const rows = wide ? 2 : 4;
      const art = (o.fanArt ?? []).slice(0, cols * rows);
      const pw = (W - 16) / cols - 3;
      const ph = Math.min(wide ? pw * 1.25 : pw * 0.8, (H - 8) / rows - 3);
      art.forEach((a, i) => {
        const cx = 9 + (i % cols) * (pw + 3);
        const cy = -19 + Math.floor(i / cols) * (ph + 3);
        let r = a.seed;
        const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
        g.rect(cx, cy, pw, ph).fill(0xfffdf6);
        // crayon scribbles: a sun or a creature, and a ground line
        g.circle(cx + pw * (0.25 + rnd() * 0.5), cy + ph * (0.3 + rnd() * 0.2), pw * 0.18).fill({ color: a.color, alpha: 0.85 });
        g.moveTo(cx + 1.5, cy + ph - 2.5).lineTo(cx + pw - 1.5, cy + ph - 2 - rnd() * 1.5).stroke({ width: 1, color: 0x5f9e6e });
        g.moveTo(cx + pw * 0.2, cy + ph * 0.75).lineTo(cx + pw * 0.5, cy + ph * (0.45 + rnd() * 0.2)).lineTo(cx + pw * 0.8, cy + ph * 0.75).stroke({ width: 0.8, color: 0x2a2622, alpha: 0.7 });
        g.circle(cx + pw / 2, cy + 0.8, 0.9).fill(0xd8323c); // pin
      });
      break;
    }
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
    case 'fan_wall':
    case 'sound_booth':
    case 'trophy_shelf':
    case 'marketing_board':
    case 'game_library':
    case 'console_museum':
    case 'mocap_rig':
      return 34;
    case 'rug':
      return 0;
    case 'pet_cat':
    case 'pet_dog':
      return 8;
    case 'gym':
      return 6;
    case 'zen_corner':
      return 4;
    case 'screening_room':
      return 34;
    case 'bonsai':
      return 52;
    case 'parrot_perch':
      return 66;
    case 'hammock':
      return 4;
    case 'robot_vacuum':
      return 4;
    case 'pet_tortoise':
      return 6;
    case 'karaoke':
      return 30;
    case 'claw_machine':
    case 'mascot_statue':
      return 38;
    case 'globe':
    case 'guitar_corner':
      return 30;
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
