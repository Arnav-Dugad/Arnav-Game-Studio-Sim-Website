/**
 * The office parrot: it sits on its perch, bobs, and every so often repeats something it has overheard —
 * office classics, the studio's name, the game in development, last week's review score. Cosmetic.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { GameState } from '@/sim/types';
import { T } from './sprites';
import { shortTitle } from './shortTitle';

interface Bird {
  c: Container;
  body: Graphics;
  wing: Graphics;
  t: number;
  bubble: Container;
  bg: Graphics;
  text: Text;
  wait: number;
  show: number;
}

const CLASSICS = ['Ship it! Squawk!', 'Who broke the build?', 'Crunch time! Rawk!', 'Coffee! Coffee!', 'It’s a feature!', 'Pretty bird!', 'Works on my machine!', 'Meeting at three!', 'Polish! Polish!'];

function phrases(s: GameState): string[] {
  const out = [...CLASSICS, `${s.company.name.split(' ')[0]}! Rawk!`];
  const game = Object.values(s.projects).find((p) => p.kind === 'game');
  if (game && game.kind === 'game') out.push(`${shortTitle(game.concept.name, 16)}!`, `When’s ${game.concept.name.split(' ')[0]} out?`);
  const last = s.releaseOrder.length ? s.releases[s.releaseOrder[s.releaseOrder.length - 1]!] : undefined;
  if (last && s.day - last.day < 120) out.push(last.score >= 80 ? `${Math.round(last.score)}! ${Math.round(last.score)}!` : 'Reviews! Squawk…');
  return out;
}

export class ParrotSystem {
  private birds = new Map<string, Bird>();
  private key = '';

  constructor(private layer: Container) {}

  private reset(): void {
    for (const b of this.birds.values()) b.c.destroy({ children: true });
    this.birds.clear();
  }

  update(s: GameState, floor: number, dt: number, reducedMotion: boolean): void {
    const perches = s.office.items.filter((i) => i.item === 'parrot_perch' && i.floor === floor);
    const key = `${floor}|${perches.map((p) => `${p.id}@${p.x},${p.y}`).join(';')}`;
    if (key !== this.key) {
      this.key = key;
      this.reset();
      for (const p of perches) {
        const c = new Container();
        c.position.set(p.x * T + T / 2 + 4, p.y * T - 32);
        // the bird, sitting on the bar (perch top is ~46px above the tile's bottom edge)
        const body = new Graphics();
        body.ellipse(-2, 26, 6, 8).fill(0x2f9e57);
        body.circle(0, 18, 4.5).fill(0x2f9e57);
        body.poly([3, 17, 7, 19, 3, 21]).fill(0xf2c450);
        body.circle(1, 17, 1).fill(0x111111);
        body.poly([-6, 30, -8, 40, -3, 33]).fill(0xd8323c);
        const wing = new Graphics();
        wing.ellipse(0, 0, 3, 5).fill(0x3d85c6);
        wing.position.set(-4, 27);
        c.addChild(body, wing);
        c.zIndex = (p.y + 1) * T + 2;
        const bubble = new Container();
        const bg = new Graphics();
        const text = new Text({ text: '', style: { fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: '700', fill: 0x2a2622 } });
        text.anchor.set(0.5);
        bubble.addChild(bg, text);
        bubble.visible = false;
        c.addChild(bubble);
        this.layer.addChild(c);
        this.birds.set(p.id, { c, body, wing, t: Math.random() * 10, bubble, bg, text, wait: 4 + Math.random() * 8, show: 0 });
      }
    }
    if (reducedMotion) return;
    for (const b of this.birds.values()) {
      // bob, and flap while talking
      b.t += dt;
      const talking = b.show > 0;
      b.body.position.y = Math.sin(b.t * (talking ? 9 : 2.2)) * (talking ? 1.2 : 0.6);
      b.wing.position.y = 27 + b.body.position.y;
      b.wing.rotation = talking ? Math.sin(b.t * 18) * 0.6 : Math.sin(b.t * 1.3) * 0.08;
      if (b.show > 0) {
        b.show -= dt;
        if (b.show <= 0) b.bubble.visible = false;
        continue;
      }
      b.wait -= dt;
      if (b.wait > 0) continue;
      const list = phrases(s);
      const line = list[Math.floor(Math.random() * list.length)]!;
      const w = Math.min(150, Math.max(34, 10 + line.length * 5.2));
      b.bg.clear();
      b.bg.roundRect(-w / 2, -22, w, 18, 7).fill({ color: 0xfff7d6, alpha: 0.97 });
      b.bg.roundRect(-w / 2, -22, w, 18, 7).stroke({ width: 1, color: 0x2a2622, alpha: 0.15 });
      b.bg.poly([-2, -4, 4, -4, 0, 2]).fill({ color: 0xfff7d6, alpha: 0.97 });
      b.text.text = line;
      b.text.position.set(0, -13);
      b.bubble.visible = true;
      b.show = 2.6;
      b.wait = 9 + Math.random() * 14;
    }
  }

  destroy(): void {
    this.reset();
  }
}
