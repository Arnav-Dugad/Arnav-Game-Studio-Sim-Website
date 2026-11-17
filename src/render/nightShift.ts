/**
 * Late nights: while a project crunches, the office dims to evening blue and desk lamps glow over the
 * people still working. Fades in and out; skipped in the dark theme (it's already night) and with
 * reduced motion it just switches.
 */
import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { tierDef } from '@/sim/systems/office';
import type { GameState } from '@/sim/types';
import { T } from './sprites';

export class NightShift {
  private shade = new Graphics();
  private lamps = new Graphics();
  private level = 0;
  private key = '';
  private acc = 0;

  constructor(below: Container, items: Container) {
    // the shade sits under furniture and people; lamp glows go among them
    this.lamps.zIndex = 9_999_001;
    this.lamps.blendMode = 'add';
    below.addChild(this.shade);
    items.addChild(this.lamps);
  }

  update(s: GameState, floor: number, dt: number, crunchers: { x: number; y: number }[], night: boolean, reducedMotion: boolean): void {
    const target = !night && crunchers.length > 0 ? 1 : 0;
    this.level = reducedMotion ? target : this.level + (target - this.level) * Math.min(1, dt * 1.5);
    const t = tierDef(s.office.tier);
    const key = `${s.office.tier}|${floor}`;
    if (key !== this.key) {
      this.key = key;
      this.shade.clear();
      this.shade.rect(-20, -1.6 * T, t.w * T + 40, (t.h + 1.6) * T + 30).fill(0x1b2440);
    }
    this.shade.alpha = this.level * 0.3;
    this.shade.visible = this.level > 0.01;
    this.lamps.visible = this.level > 0.01;
    this.acc += dt;
    if (this.acc < 0.25 || !this.lamps.visible) return;
    this.acc = 0;
    this.lamps.clear();
    for (const c of crunchers.slice(0, 120)) {
      this.lamps.circle(c.x, c.y - 26, 22).fill({ color: 0xffb347, alpha: 0.07 * this.level });
      this.lamps.circle(c.x, c.y - 30, 11).fill({ color: 0xffd27a, alpha: 0.1 * this.level });
    }
  }
}
