/**
 * Live monitors: while someone works at a desk, their screen shows what they're doing — code scrolling for
 * programmers, a painting for artists, flowcharts for designers, a waveform for audio, prose for writers,
 * a game with a bug for QA, charts for producers and marketers, and molecules for research. Cosmetic.
 */
import type { Container} from 'pixi.js';
import { Graphics } from 'pixi.js';
import { footprint } from '@/sim/systems/office';
import type { GameState, PlacedItem } from '@/sim/types';
import { T } from './sprites';

export interface ScreenUser {
  deskId: string;
  role: string;
  research: boolean;
  phase: number;
}

interface Screen {
  g: Graphics;
  x: number;
  y: number;
  w: number;
  h: number;
  used: boolean;
}

const DESK_TIER: Record<string, number> = { desk_basic: 0, desk_pro: 1, desk_studio: 2, desk_workstation: 3 };
const CODE = [0x9cdcfe, 0xc586c0, 0xdcdcaa, 0x6a9955, 0xce9178, 0xd4d4d4];
const PAINT = [0xe07a5f, 0xf2c450, 0x5f9e6e, 0x3d85c6, 0x9b6bd3, 0xf28fb0];

/** Where the (first) monitor's glass is on a desk, in world coordinates. */
function glass(it: PlacedItem, era: number): { x: number; y: number; w: number; h: number } | null {
  const tier = DESK_TIER[it.item];
  if (tier === undefined) return null;
  const fp = footprint(it);
  const W = fp.w * T;
  const mw = tier === 2 ? W * 0.34 : tier >= 3 ? W * 0.62 : W * 0.38;
  const mx = tier === 2 ? W * 0.12 : (W - mw) / 2;
  const my = tier === 2 ? -4 : -6;
  const crt = era < 2003;
  const x = crt ? mx + 3 : mx + 2;
  const y = crt ? my + 3 : my + 2;
  const w = crt ? mw - 6 : mw - 4;
  const h = crt ? mw * 0.8 - 9 : mw * 0.62 - 4;
  return { x: it.x * T + x, y: it.y * T + y, w, h };
}

export class ScreenSystem {
  private screens = new Map<string, Screen>();
  private key = '';
  private t = 0;
  private acc = 0;

  constructor(private layer: Container) {}

  private reset(): void {
    for (const sc of this.screens.values()) sc.g.destroy();
    this.screens.clear();
  }

  update(s: GameState, floor: number, era: number, users: ScreenUser[], dt: number, reducedMotion: boolean): void {
    const key = `${floor}|${s.office.rev ?? 0}|${s.office.items.length}|${era < 2003}`;
    if (key !== this.key) {
      this.key = key;
      this.reset();
    }
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / 8) return; // eight frames a second is plenty for a tiny screen
    this.acc = 0;
    for (const sc of this.screens.values()) sc.used = false;
    if (!reducedMotion) {
      const byId = new Map(s.office.items.map((i) => [i.id, i]));
      for (const u of users) {
        const it = byId.get(u.deskId);
        if (!it || it.floor !== floor) continue;
        let sc = this.screens.get(u.deskId);
        if (!sc) {
          const gl = glass(it, era);
          if (!gl || gl.w < 5 || gl.h < 2.5) continue;
          const g = new Graphics();
          const fp = footprint(it);
          g.zIndex = (it.y + fp.h) * T - 1.5;
          this.layer.addChild(g);
          sc = { g, ...gl, used: true };
          this.screens.set(u.deskId, sc);
        }
        sc.used = true;
        this.draw(sc, u);
      }
    }
    for (const sc of this.screens.values()) sc.g.visible = sc.used;
  }

  private draw(sc: Screen, u: ScreenUser): void {
    const { g, x, y, w, h } = sc;
    const t = this.t + u.phase;
    g.clear();
    const bg = u.research ? 0x1d2b3a : u.role === 'programmer' ? 0x1e1e1e : u.role === 'artist' ? 0xf4efe7 : u.role === 'qa' ? 0x7cc4ef : 0x23303d;
    g.rect(x, y, w, h).fill(bg);
    if (u.research) {
      // molecules orbiting
      for (let i = 0; i < 3; i++) {
        const a = t * 1.5 + (i * Math.PI * 2) / 3;
        g.circle(x + w / 2 + Math.cos(a) * w * 0.28, y + h / 2 + Math.sin(a) * h * 0.3, 1.3).fill(PAINT[i]!);
      }
      g.circle(x + w / 2, y + h / 2, 1.6).fill(0xffffff);
      return;
    }
    switch (u.role) {
      case 'programmer': {
        const scroll = Math.floor(t * 3);
        for (let r = 0; r < Math.floor(h / 2.6); r++) {
          const line = (r + scroll) * 7;
          const indent = (line % 3) * 2;
          const len = 4 + ((line * 13) % Math.max(4, w - 8));
          g.rect(x + 1.5 + indent, y + 1.2 + r * 2.6, Math.min(len, w - 3 - indent), 1.1).fill(CODE[line % CODE.length]!);
        }
        if (Math.floor(t * 3) % 2) g.rect(x + w - 3, y + h - 2.5, 1.2, 1.6).fill(0xffffff);
        break;
      }
      case 'artist': {
        for (let i = 0; i < 5; i++) g.circle(x + ((i * 17 + 5) % w), y + ((i * 11 + 3) % h), 2 + (i % 2)).fill({ color: PAINT[i]!, alpha: 0.8 });
        g.circle(x + w / 2 + Math.sin(t * 2) * w * 0.35, y + h / 2 + Math.cos(t * 3) * h * 0.3, 1.2).fill(0x2a2622);
        break;
      }
      case 'audio': {
        g.moveTo(x, y + h / 2);
        for (let i = 0; i <= 12; i++) g.lineTo(x + (i / 12) * w, y + h / 2 + Math.sin(t * 8 + i * 0.9) * h * 0.35 * Math.sin(i * 0.4 + t));
        g.stroke({ width: 0.9, color: 0x6be3a0 });
        break;
      }
      case 'qa': {
        g.rect(x, y + h - 2, w, 2).fill(0x5f9e6e);
        const jump = Math.abs(Math.sin(t * 3)) * (h - 5);
        g.rect(x + 3 + ((t * 6) % Math.max(1, w - 6)), y + h - 4 - jump, 2, 2).fill(0xe07a5f);
        if (Math.floor(t * 2) % 3 === 0) g.circle(x + w - 4, y + 3, 1.5).fill(0xd8323c);
        break;
      }
      case 'writer': {
        const shown = Math.floor(t * 4) % 12;
        for (let r = 0; r < Math.min(3, Math.floor(h / 3)); r++) g.rect(x + 1.5, y + 1.5 + r * 3, Math.min(w - 3, r < Math.floor(shown / 4) ? w - 3 : ((shown % 4) / 4) * (w - 3)), 1).fill(0xd4d4d4);
        break;
      }
      case 'producer':
      case 'marketer': {
        for (let i = 0; i < 4; i++) {
          const v = 0.3 + 0.6 * Math.abs(Math.sin(t * 0.8 + i));
          g.rect(x + 2 + i * ((w - 4) / 4), y + h - 1 - v * (h - 3), (w - 4) / 4 - 1, v * (h - 3)).fill(PAINT[i]!);
        }
        break;
      }
      default: {
        // designers (and founders): boxes and arrows, a blinking cursor
        g.rect(x + 2, y + 2, w * 0.3, h * 0.35).stroke({ width: 0.8, color: 0xf2c450 });
        g.rect(x + w * 0.55, y + h * 0.5, w * 0.3, h * 0.35).stroke({ width: 0.8, color: 0x7cc4ef });
        g.moveTo(x + 2 + w * 0.3, y + 2 + h * 0.17).lineTo(x + w * 0.55, y + h * 0.67).stroke({ width: 0.7, color: 0xffffff, alpha: 0.7 });
        if (Math.floor(t * 2) % 2) g.rect(x + w * 0.7, y + 3, 1, 3).fill(0xffffff);
      }
    }
  }

  destroy(): void {
    this.reset();
  }
}
