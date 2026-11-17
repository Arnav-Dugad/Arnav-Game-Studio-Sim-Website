/**
 * The office parrot: it sits on its perch, bobs, and every so often repeats something it has overheard —
 * office classics, the studio's name, the game in development, last week's review score. Cosmetic.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { GameState } from '@/sim/types';
import { T } from './sprites';

interface Bird {
  c: Container;
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
  if (game && game.kind === 'game') out.push(`${game.concept.name.slice(0, 16)}!`, `When’s ${game.concept.name.split(' ')[0]} out?`);
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
        c.position.set(p.x * T + T / 2 + 4, p.y * T - 38);
        c.zIndex = (p.y + 1) * T + 2;
        const bubble = new Container();
        const bg = new Graphics();
        const text = new Text({ text: '', style: { fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: '700', fill: 0x2a2622 } });
        text.anchor.set(0.5);
        bubble.addChild(bg, text);
        bubble.visible = false;
        c.addChild(bubble);
        this.layer.addChild(c);
        this.birds.set(p.id, { c, bubble, bg, text, wait: 4 + Math.random() * 8, show: 0 });
      }
    }
    if (reducedMotion) return;
    for (const b of this.birds.values()) {
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
