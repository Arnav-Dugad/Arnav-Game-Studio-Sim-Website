/**
 * Seasons and holidays in the office (cosmetic): snow on the windows in winter, string lights and a tree in
 * December, pumpkins at Halloween, autumn leaves and spring flowers on the sills, balloons and bunting after
 * a party, and staff birthdays. Everything is derived from the date and the studio, so it needs no state.
 */
import { Container, Graphics } from 'pixi.js';
import { fromDay } from '@/sim/calendar';
import { occupancy, tierDef } from '@/sim/systems/office';
import type { GameState } from '@/sim/types';
import type { ScenePalette } from './palette';
import { T } from './sprites';
import { isRainy } from './weather';

export { isRainy } from './weather';

export type Hat = 'none' | 'santa' | 'witch' | 'party';

export interface Season {
  month: number;
  dom: number;
  snow: boolean;
  lights: boolean;
  tree: boolean;
  pumpkins: boolean;
  leaves: boolean;
  flowers: boolean;
  party: boolean;
  newYear: boolean;
  hat: Hat;
  rain: boolean;
}

export function seasonOf(s: GameState): Season {
  const { month, day: dom } = fromDay(s.day);
  const party = s.company.moraleMods.some((m) => /party/i.test(m.label) && m.until - s.day > 50);
  const newYear = month === 1 && dom <= 4;
  const halloween = month === 10 && dom >= 18;
  return {
    rain: isRainy(s.day, month),
    month,
    dom,
    snow: month === 12 || month <= 2,
    lights: month === 12 || newYear,
    tree: month === 12,
    pumpkins: halloween || (month === 11 && dom <= 2),
    leaves: (month === 10 && !halloween) || month === 11 || (month === 9 && dom >= 15),
    flowers: month >= 3 && month <= 5,
    party,
    newYear,
    hat: halloween && dom >= 28 ? 'witch' : month === 12 && dom >= 15 ? 'santa' : party || newYear ? 'party' : 'none',
  };
}


/** Day of year a staff member celebrates their birthday (stable per person). */
export function birthdayOf(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return h % 365;
}

export function dayOfYear(s: GameState): number {
  const { month, day } = fromDay(s.day);
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return (cum[month - 1] ?? 0) + day - 1;
}

const BULB = [0xe0475b, 0xf2c450, 0x5f9e6e, 0x3d85c6, 0xd17be0];

interface Flake {
  g: Graphics;
  x0: number;
  y0: number;
  w: number;
  h: number;
  phase: number;
  speed: number;
}

export class SeasonDecor {
  private root = new Container();
  private key = '';
  private bulbs: Graphics[] = [];
  private flakes: Flake[] = [];
  private drops: Flake[] = [];
  private bobbers: { g: Graphics; y: number; phase: number }[] = [];
  private glows: Graphics[] = [];
  private t = 0;
  /** Floor decorations live in the item layer so people walk in front of and behind them. */
  private placed: Container[] = [];

  constructor(private layer: Container) {
    this.root.sortableChildren = true;
    this.root.zIndex = -20_000;
    layer.addChild(this.root);
  }

  private clear(): void {
    for (const c of [...this.root.children]) c.destroy({ children: true });
    for (const c of this.placed) c.destroy({ children: true });
    this.placed = [];
    this.bulbs = [];
    this.flakes = [];
    this.drops = [];
    this.bobbers = [];
    this.glows = [];
  }

  update(s: GameState, floor: number, dt: number, se: Season, P: ScenePalette, reducedMotion: boolean): void {
    const key = [floor, s.office.tier, s.office.rev ?? 0, s.office.items.length, P.night, se.snow, se.lights, se.tree, se.pumpkins, se.leaves, se.flowers, se.party, se.newYear, se.rain].join('|');
    if (key !== this.key) {
      this.key = key;
      this.build(s, floor, se, P);
    }
    this.t += dt;
    if (reducedMotion) return;
    // twinkle
    const step = Math.floor(this.t * 2.5);
    this.bulbs.forEach((b, i) => (b.alpha = (i + step) % 3 === 0 ? 0.45 : 1));
    for (const f of this.flakes) {
      const y = (f.phase + this.t * f.speed) % f.h;
      f.g.position.set(f.x0 + ((f.phase * 7.3) % f.w) + Math.sin(this.t * 1.7 + f.phase) * 2, f.y0 + y);
    }
    for (const f of this.drops) {
      const y = (f.phase + this.t * f.speed) % f.h;
      f.g.position.set(f.x0 + ((f.phase * 13.7) % f.w) - y * 0.15, f.y0 + y);
    }
    for (const b of this.bobbers) b.g.position.y = b.y + Math.sin(this.t * 1.6 + b.phase) * 2.2;
    this.glows.forEach((g, i) => (g.alpha = 0.75 + Math.sin(this.t * 6 + i * 2.1) * 0.25));
  }

  /** Free tiles hugging the back and side walls, best first. */
  private wallSpots(s: GameState, floor: number, n: number, offset: number): [number, number][] {
    const t = tierDef(s.office.tier);
    const occ = occupancy(s, floor);
    const out: [number, number][] = [];
    const cand: [number, number][] = [];
    for (let x = t.w - 1; x >= 0; x--) cand.push([x, 0]);
    for (let y = 1; y < t.h - 1; y++) cand.push([t.w - 1, y], [0, y]);
    const stride = Math.max(1, Math.floor(cand.length / (n * 2)));
    for (let i = offset % stride; i < cand.length && out.length < n; i += stride) {
      const [x, y] = cand[i]!;
      if (!occ.has(y * t.w + x)) out.push([x, y]);
    }
    return out;
  }

  private build(s: GameState, floor: number, se: Season, P: ScenePalette): void {
    this.clear();
    const t = tierDef(s.office.tier);
    const W = t.w * T;
    const garage = s.office.tier === 1;
    const panes: [number, number, number, number][] = [];
    if (!garage) for (let x = 1; x < t.w - 1; x += 3) panes.push([x * T + 7, -1.1 * T + 3, 2 * T - 14, 0.75 * T - 6]);

    if (se.snow) {
      for (const [x, y, w, h] of panes) {
        const g = new Graphics();
        g.roundRect(x, y + h - 5, w, 5, 2).fill({ color: 0xffffff, alpha: 0.95 });
        g.ellipse(x + w * 0.3, y + h - 5, w * 0.22, 3).fill({ color: 0xffffff, alpha: 0.95 });
        g.ellipse(x + w * 0.75, y + h - 4.5, w * 0.18, 2.5).fill({ color: 0xffffff, alpha: 0.95 });
        // frost in the corners
        g.circle(x + 2, y + 2, 5).fill({ color: 0xffffff, alpha: 0.35 });
        g.circle(x + w - 2, y + 2, 4).fill({ color: 0xffffff, alpha: 0.3 });
        this.root.addChild(g);
        for (let i = 0; i < 4; i++) {
          const f = new Graphics().circle(0, 0, 1.1).fill({ color: 0xffffff, alpha: 0.9 });
          this.root.addChild(f);
          this.flakes.push({ g: f, x0: x + 2, y0: y + 1, w: w - 4, h: h - 7, phase: Math.random() * 40, speed: 5 + Math.random() * 5 });
        }
      }
    }
    if (se.rain) {
      for (const [x, y, w, h] of panes) {
        const tint = new Graphics().roundRect(x, y, w, h, 3).fill({ color: 0x5a6b80, alpha: 0.22 });
        this.root.addChild(tint);
        for (let i = 0; i < 7; i++) {
          const d = new Graphics().moveTo(0, 0).lineTo(-1.2, 6).stroke({ width: 1, color: 0xdfeaf5, alpha: 0.75 });
          this.root.addChild(d);
          this.drops.push({ g: d, x0: x + 3, y0: y + 1, w: w - 6, h: h - 8, phase: Math.random() * 40, speed: 70 + Math.random() * 40 });
        }
      }
    }
    if (se.leaves || se.flowers) {
      for (const [x, y, w, h] of panes) {
        const g = new Graphics();
        g.rect(x - 3, y + h + 1, w + 6, 3).fill(P.windowFrame);
        if (se.leaves) {
          const cols = [0xd96c2c, 0xe0a03a, 0xb5452b, 0xc98a2e];
          for (let i = 0; i < 6; i++) g.ellipse(x + 4 + ((i * 37) % (w - 8)), y + h - 1 + (i % 2), 2.6, 1.5).fill(cols[i % cols.length]!);
        } else {
          g.roundRect(x + w / 2 - 5, y + h - 6, 10, 7, 2).fill(0xc2563a);
          for (const [dx, c] of [[-3, 0xf28fb0], [0, 0xf2c450], [3, 0xd17be0]] as const) {
            g.rect(x + w / 2 + dx - 0.4, y + h - 11, 0.8, 6).fill(P.plant);
            g.circle(x + w / 2 + dx, y + h - 12, 2).fill(c);
          }
        }
        this.root.addChild(g);
      }
    }
    if (se.lights || se.party || se.newYear) {
      // a sagging string along the back wall: bulbs for the holidays, bunting for parties
      const wire = new Graphics();
      const y0 = -1.32 * T + 10;
      const seg = T * 1.5;
      for (let x = 0; x < W; x += seg) wire.moveTo(x, y0).quadraticCurveTo(x + seg / 2, y0 + 9, x + seg, y0);
      wire.stroke({ width: 1.2, color: 0x3a3a3a, alpha: 0.7 });
      this.root.addChild(wire);
      let i = 0;
      for (let x = 0; x < W; x += seg)
        for (const u of [0.2, 0.5, 0.8]) {
          const px = x + seg * u;
          const py = y0 + 2 * (1 - u) * u * 9;
          const g = new Graphics();
          if (se.lights && !se.party) g.ellipse(px, py + 3, 2.2, 3).fill(BULB[i % BULB.length]!);
          else g.poly([px - 4, py, px + 4, py, px, py + 8]).fill(BULB[i % BULB.length]!);
          this.root.addChild(g);
          if (se.lights && !se.party) this.bulbs.push(g);
          i++;
        }
    }
    if (se.tree) {
      const [spot] = this.wallSpots(s, floor, 1, 3);
      if (spot) {
        const [tx, ty] = spot;
        const g = new Graphics();
        const cx = tx * T + T / 2;
        const by = ty * T + T * 0.85;
        g.ellipse(cx, by, 15, 5).fill({ color: 0x000000, alpha: 0.15 });
        g.rect(cx - 2.5, by - 8, 5, 8).fill(0x6b4a2e);
        for (const [w, y] of [[16, 0], [13, -11], [9, -21]] as const) g.poly([cx - w, by - 6 + y, cx + w, by - 6 + y, cx, by - 22 + y]).fill(y === 0 ? 0x2f7d4a : y === -11 ? 0x37905a : 0x3fa066);
        g.star(cx, by - 45, 5, 4, 2).fill(0xf2c450);
        g.roundRect(cx - 18, by - 6, 9, 7, 1.5).fill(0xe0475b);
        g.rect(cx - 14, by - 6, 1.5, 7).fill(0xf2c450);
        g.roundRect(cx + 9, by - 5, 8, 6, 1.5).fill(0x3d85c6);
        g.rect(cx + 12.5, by - 5, 1.5, 6).fill(0xffffff);
        g.zIndex = (ty + 1) * T;
        this.put(g);
        for (let k = 0; k < 9; k++) {
          const level = k % 3;
          const half = [11, 8, 5][level]!;
          const b = new Graphics().circle(cx - half + ((k * 5) % (half * 2 + 1)), by - 9 + [0, -11, -21][level]! - (k % 2) * 2, 1.5).fill(BULB[k % BULB.length]!);
          b.zIndex = (ty + 1) * T + 1;
          this.put(b);
          this.bulbs.push(b);
        }
      }
    }
    if (se.pumpkins) {
      for (const [px, py] of this.wallSpots(s, floor, 3, 1)) {
        const g = new Graphics();
        const cx = px * T + T / 2 + ((px * 13) % 9) - 4;
        const by = py * T + T * 0.8;
        g.ellipse(cx, by, 9, 3).fill({ color: 0x000000, alpha: 0.15 });
        g.ellipse(cx - 4, by - 6, 5, 6).fill(0xd9732c);
        g.ellipse(cx + 4, by - 6, 5, 6).fill(0xd9732c);
        g.ellipse(cx, by - 6.5, 5.5, 6.5).fill(0xe8853a);
        g.rect(cx - 1, by - 15, 2, 4).fill(0x5f7a3a);
        g.zIndex = (py + 1) * T;
        this.put(g);
        const face = new Graphics();
        face.poly([cx - 4, by - 8, cx - 1.5, by - 8, cx - 2.75, by - 10.5]).fill(0xffd27a);
        face.poly([cx + 1.5, by - 8, cx + 4, by - 8, cx + 2.75, by - 10.5]).fill(0xffd27a);
        face.poly([cx - 4, by - 5, cx + 4, by - 5, cx + 2, by - 2.5, cx, by - 4, cx - 2, by - 2.5]).fill(0xffd27a);
        face.zIndex = (py + 1) * T + 1;
        this.put(face);
        this.glows.push(face);
      }
    }
    if (se.party || se.newYear) {
      for (const [px, py] of this.wallSpots(s, floor, 4, 2)) {
        const cx = px * T + T / 2;
        const by = py * T + T * 0.8;
        const string = new Graphics();
        const g = new Graphics();
        const cols = [BULB[(px + py) % 5]!, BULB[(px + py + 2) % 5]!, BULB[(px + py + 4) % 5]!];
        const tops: [number, number][] = [[-6, -40], [0, -46], [6, -39]];
        tops.forEach(([dx, dy]) => string.moveTo(cx, by).lineTo(cx + dx, by + dy + 6));
        string.stroke({ width: 0.7, color: 0x6b6b6b });
        string.circle(cx, by, 2).fill(0x6b6b6b);
        tops.forEach(([dx, dy], k) => {
          g.ellipse(cx + dx, by + dy, 5, 6).fill(cols[k]!);
          g.ellipse(cx + dx - 1.6, by + dy - 2, 1.4, 2).fill({ color: 0xffffff, alpha: 0.45 });
        });
        string.zIndex = g.zIndex = (py + 1) * T;
        this.put(string, g);
        this.bobbers.push({ g, y: 0, phase: px + py });
      }
    }
  }

  private put(...cs: Container[]): void {
    for (const c of cs) {
      this.layer.addChild(c);
      this.placed.push(c);
    }
  }

  destroy(): void {
    this.clear();
    this.root.destroy({ children: true });
  }
}
