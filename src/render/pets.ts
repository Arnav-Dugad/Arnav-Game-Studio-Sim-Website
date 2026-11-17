/**
 * Office pets: a studio cat or dog for each pet bed. They nap in their bed, roam, follow people, sit on
 * keyboards and get fussed over. Cosmetic (the morale comes from the bed's aura in the sim).
 */
import { Container, Graphics, Text } from 'pixi.js';
import { findPath, footprint, occupancy, tierDef } from '@/sim/systems/office';
import type { GameState, PlacedItem } from '@/sim/types';
import { T } from './sprites';

export type PetKind = 'cat' | 'dog' | 'robot' | 'tortoise';

const CAT_NAMES = ['Pixel', 'Byte', 'Mochi', 'Sprite', 'Glitch', 'Biscuit', 'Luna', 'Nugget', 'Cheddar', 'Miso', 'Tofu', 'Widget'];
const DOG_NAMES = ['Turbo', 'Buster', 'Patch', 'Joystick', 'Rex', 'Waffles', 'Bailey', 'Ziggy', 'Pretzel', 'Scout', 'Noodle', 'Bit'];
const CAT_FUR = [0xf29e4c, 0x3a3a3a, 0xd9d4cc, 0x8a6a4a, 0xf4efe7, 0x9a9a9a];
const DOG_FUR = [0xc68a4a, 0x4a3426, 0x2a2622, 0xe9dcc4, 0xd9b27a];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function petName(it: Pick<PlacedItem, 'id' | 'item'>): string {
  const names = it.item === 'pet_tortoise' ? ['Speedy', 'Sheldon', 'Turbo', 'Tank', 'Methuselah', 'Shelly', 'Zoom', 'Pebble'] : it.item === 'pet_dog' ? DOG_NAMES : it.item === 'robot_vacuum' ? ['Roomby', 'Dustin', 'Sir Sucks-a-Lot', 'Zippy', 'R2-Clean', 'Mopsy', 'Hoover Dam', 'Bolt'] : CAT_NAMES;
  return names[hash(it.id) % names.length]!;
}

/** What a pet's neighbours can do: the renderer's people, seen through a narrow window. */
export interface PetPerson {
  id: string;
  x: number;
  y: number;
  mode: string;
  /** Desk centre (world) if they sit at a desk on this floor and are working there. */
  desk?: [number, number];
  working: boolean;
}

export interface PetHost {
  people(): PetPerson[];
  /** A person reacts: says something and plays a gesture. */
  react(personId: string, text: string, gesture: 'laugh' | 'palm' | 'wave'): void;
}

type PetMode = 'sleep' | 'walk' | 'sit' | 'desk' | 'follow';

interface Pet {
  id: string;
  kind: PetKind;
  name: string;
  fur: number;
  c: Container;
  body: Graphics;
  tail: Graphics;
  heart: Text;
  heartT: number;
  pose: string;
  x: number;
  y: number;
  path: [number, number][];
  mode: PetMode;
  next: PetMode;
  wait: number;
  t: number;
  face: number;
  bed: [number, number];
  bedZ: number;
  follow?: string;
  deskOf?: string;
  fussT: number;
  speed: number;
  tailBase: [number, number];
  label: Text | null;
}

const CAT_LINES = (n: string) => [`Hi ${n}!`, `Aww, ${n}.`, 'Here, kitty kitty!', `${n}! 😻`, 'Who’s a fluffy cat?'];
const DOG_LINES = (n: string) => [`Who’s a good dog?`, `Hi ${n}!`, `${n}! 🐶`, 'Good boy!', 'Want a treat?'];

export class PetSystem {
  private pets = new Map<string, Pet>();
  private key = '';
  /** Reduced motion: no following or zoomies. */
  private calm = false;

  constructor(private layer: Container) {}

  /** How many cats and dogs are on the visible floor (for ambience). */
  counts(): { cats: number; dogs: number } {
    let cats = 0;
    let dogs = 0;
    for (const p of this.pets.values()) if (p.kind === 'cat') cats++;
    else if (p.kind === 'dog') dogs++;
    return { cats, dogs };
  }

  destroy(): void {
    for (const p of this.pets.values()) p.c.destroy({ children: true });
    this.pets.clear();
  }

  private tileCenter(x: number, y: number): [number, number] {
    return [x * T + T / 2, y * T + T * 0.72];
  }

  /** Keep one pet per bed on the visible floor. */
  sync(s: GameState, floor: number): void {
    const beds = s.office.items.filter((i) => i.floor === floor && (i.item === 'pet_cat' || i.item === 'pet_dog' || i.item === 'robot_vacuum' || i.item === 'pet_tortoise'));
    const key = `${floor}|${s.office.rev ?? 0}|${beds.map((b) => `${b.id}@${b.x},${b.y}`).join(';')}`;
    if (key === this.key) return;
    this.key = key;
    const keep = new Set(beds.map((b) => b.id));
    for (const [id, p] of this.pets)
      if (!keep.has(id)) {
        p.c.destroy({ children: true });
        this.pets.delete(id);
      }
    for (const b of beds) {
      const fp = footprint(b);
      const bed = this.tileCenter(b.x, b.y);
      const bedZ = (b.y + fp.h) * T;
      const existing = this.pets.get(b.id);
      if (existing) {
        existing.bed = bed;
        existing.bedZ = bedZ;
        existing.path = [];
        existing.mode = 'sleep';
        existing.x = bed[0];
        existing.y = bed[1];
        continue;
      }
      const kind: PetKind = b.item === 'pet_dog' ? 'dog' : b.item === 'robot_vacuum' ? 'robot' : b.item === 'pet_tortoise' ? 'tortoise' : 'cat';
      const furs = kind === 'dog' ? DOG_FUR : CAT_FUR;
      const c = new Container();
      const body = new Graphics();
      const tail = new Graphics();
      const heart = new Text({ text: '♥', style: { fontSize: 11, fill: 0xe0475b, fontWeight: '700' } });
      heart.anchor.set(0.5);
      heart.visible = false;
      c.addChild(tail, body, heart);
      this.layer.addChild(c);
      this.pets.set(b.id, {
        id: b.id,
        kind,
        name: petName(b),
        fur: furs[hash(b.id + 'f') % furs.length]!,
        c,
        body,
        tail,
        heart,
        heartT: 0,
        pose: '',
        x: bed[0],
        y: bed[1],
        path: [],
        mode: 'sleep',
        next: 'sleep',
        wait: 4 + Math.random() * 10,
        t: Math.random() * 10,
        face: 1,
        bed,
        bedZ,
        fussT: 0,
        tailBase: [0, 0],
        label: null,
        speed: kind === 'dog' ? 2.6 : kind === 'tortoise' ? 0.45 : 1.9,
      });
    }
  }

  /** Show the name of the pet under a world point (null clears). Returns true if one is hovered. */
  hover(wx: number | null, wy: number | null, night: boolean): boolean {
    let hit = false;
    for (const p of this.pets.values()) {
      const on = wx !== null && wy !== null && !hit && Math.abs(p.x - wx) < 13 && wy < p.y + 5 && wy > p.y - 24;
      if (on) {
        hit = true;
        if (!p.label) {
          p.label = new Text({ text: '', style: { fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: '600', align: 'center', fill: night ? 0xf1ede6 : 0x2a2622, stroke: { color: night ? 0x15130f : 0xffffff, width: 3 } } });
          p.label.anchor.set(0.5, 1);
          p.c.addChild(p.label);
        }
        p.label.style.fill = night ? 0xf1ede6 : 0x2a2622;
        p.label.style.stroke = { color: night ? 0x15130f : 0xffffff, width: 3 };
        p.label.text = `${p.name}
${p.kind === 'cat' ? 'studio cat' : p.kind === 'robot' ? 'robot vacuum' : p.kind === 'tortoise' ? 'office tortoise' : 'office dog'} · ${p.mode === 'sleep' ? (p.kind === 'robot' ? 'charging' : p.kind === 'tortoise' ? 'napping in its shell' : 'napping') : p.mode === 'desk' ? 'on a keyboard' : p.mode === 'follow' ? 'following someone' : p.mode === 'walk' ? 'exploring' : 'hanging out'}`;
        p.label.visible = true;
      } else if (p.label) p.label.visible = false;
    }
    return hit;
  }

  private route(s: GameState, floor: number, p: Pet, wx: number, wy: number): [number, number][] {
    const t = tierDef(s.office.tier);
    const from: [number, number] = [Math.min(t.w - 1, Math.max(0, Math.floor(p.x / T))), Math.min(t.h - 1, Math.max(0, Math.floor((p.y + 6) / T)))];
    const to: [number, number] = [Math.floor(wx / T), Math.floor(wy / T)];
    let path = findPath(s, floor, from, to);
    // an occupied target (a bed, a desk): path to a free neighbour, then hop on
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      if (path) break;
      const n: [number, number] = [to[0] + dx, to[1] + dy];
      if (n[0] >= 0 && n[1] >= 0 && n[0] < t.w && n[1] < t.h) path = findPath(s, floor, from, n);
    }
    if (!path || path.length === 0) return [[wx, wy]];
    const pts = path.slice(1).map(([x, y]) => this.tileCenter(x, y));
    pts.push([wx, wy]);
    return pts;
  }

  private randomFree(s: GameState, floor: number): [number, number] | null {
    const t = tierDef(s.office.tier);
    const occ = occupancy(s, floor);
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(Math.random() * t.w);
      const y = Math.floor(Math.random() * t.h);
      if (!occ.has(y * t.w + x)) return this.tileCenter(x, y);
    }
    return null;
  }

  private go(s: GameState, floor: number, p: Pet, to: [number, number] | null, next: PetMode): boolean {
    if (!to) return false;
    p.path = this.route(s, floor, p, to[0], to[1]);
    p.mode = 'walk';
    p.next = next;
    return true;
  }

  private decide(s: GameState, floor: number, p: Pet, host: PetHost): void {
    const people = host.people();
    const r = Math.random();
    if (p.kind === 'tortoise') {
      // a long nap, or a very slow stroll to somewhere nearby
      if (r < 0.45) {
        this.go(s, floor, p, p.bed, 'sleep');
        p.wait = 20 + Math.random() * 25;
      } else {
        this.go(s, floor, p, this.randomFree(s, floor), 'sit');
        p.wait = 6 + Math.random() * 8;
      }
      return;
    }
    if (p.kind === 'robot') {
      // clean somewhere, then go home to charge
      if (r < 0.3) {
        this.go(s, floor, p, p.bed, 'sleep');
        p.wait = 10 + Math.random() * 15;
      } else {
        this.go(s, floor, p, this.randomFree(s, floor), 'sit');
        p.wait = 0.5 + Math.random() * 1.5;
      }
      return;
    }
    if (p.kind === 'cat') {
      if (r < 0.35) {
        this.go(s, floor, p, p.bed, 'sleep');
        p.wait = 12 + Math.random() * 20;
        return;
      }
      if (r < 0.55) {
        const workers = people.filter((x) => x.desk && x.working);
        const w = workers[Math.floor(Math.random() * workers.length)];
        if (w?.desk) {
          p.deskOf = w.id;
          this.go(s, floor, p, [w.desk[0], w.desk[1] - 2], 'desk');
          p.wait = 6 + Math.random() * 8;
          return;
        }
      }
      if (r < 0.75 && people.length) {
        const q = people[Math.floor(Math.random() * people.length)]!;
        this.go(s, floor, p, [q.x + (Math.random() < 0.5 ? -14 : 14), q.y + 2], 'sit');
        p.wait = 4 + Math.random() * 5;
        return;
      }
      this.go(s, floor, p, this.randomFree(s, floor), 'sit');
      p.wait = 3 + Math.random() * 6;
      return;
    }
    // dog
    if (r < 0.25) {
      this.go(s, floor, p, p.bed, 'sleep');
      p.wait = 10 + Math.random() * 16;
      return;
    }
    const walkers = people.filter((x) => x.mode === 'walk');
    if (r < 0.55 && walkers.length && !this.calm) {
      const w = walkers[Math.floor(Math.random() * walkers.length)]!;
      p.follow = w.id;
      p.mode = 'follow';
      p.wait = 8 + Math.random() * 8;
      return;
    }
    if (r < 0.7 && !this.calm) {
      // zoomies: a quick dash through a few spots
      const pts: [number, number][] = [];
      for (let i = 0; i < 3; i++) {
        const f = this.randomFree(s, floor);
        if (f) pts.push(...this.route(s, floor, { ...p, x: pts.at(-1)?.[0] ?? p.x, y: pts.at(-1)?.[1] ?? p.y }, f[0], f[1]));
      }
      if (pts.length) {
        p.path = pts;
        p.mode = 'walk';
        p.next = 'sit';
        p.speed = 5;
        p.wait = 2 + Math.random() * 3;
        return;
      }
    }
    if (people.length) {
      const q = people[Math.floor(Math.random() * people.length)]!;
      this.go(s, floor, p, [q.x + (Math.random() < 0.5 ? -16 : 16), q.y + 3], 'sit');
      p.wait = 4 + Math.random() * 6;
      return;
    }
    this.go(s, floor, p, this.randomFree(s, floor), 'sit');
    p.wait = 3 + Math.random() * 4;
  }

  update(s: GameState, floor: number, dt: number, host: PetHost, reducedMotion: boolean): void {
    this.sync(s, floor);
    this.calm = reducedMotion;
    if (!this.pets.size) return;
    let people: PetPerson[] | null = null;
    const peopleNow = () => (people ??= host.people());
    for (const p of this.pets.values()) {
      p.t += dt;
      p.fussT -= dt;
      if (p.mode === 'walk') {
        const target = p.path[0];
        if (!target) {
          p.mode = p.next;
          p.speed = p.kind === 'dog' ? 2.6 : p.kind === 'tortoise' ? 0.45 : 1.9;
          if (p.mode === 'desk' && p.deskOf) {
            const n = p.name;
            host.react(p.deskOf, Math.random() < 0.5 ? `${n}, that’s my keyboard!` : `${n}, I’m working!`, Math.random() < 0.5 ? 'palm' : 'laugh');
          }
        } else {
          const sp = p.speed * T * dt;
          const dx = target[0] - p.x;
          const dy = target[1] - p.y;
          const d = Math.hypot(dx, dy);
          if (Math.abs(dx) > 0.5) p.face = dx > 0 ? 1 : -1;
          if (d <= sp) {
            p.x = target[0];
            p.y = target[1];
            p.path.shift();
          } else {
            p.x += (dx / d) * sp;
            p.y += (dy / d) * sp;
          }
        }
      } else if (p.mode === 'follow') {
        const q = peopleNow().find((x) => x.id === p.follow);
        p.wait -= dt;
        if (!q || p.wait <= 0) {
          p.mode = 'sit';
          p.wait = 2;
        } else {
          const tx = q.x - (q.x > p.x ? 16 : -16);
          const dx = tx - p.x;
          const dy = q.y + 3 - p.y;
          const d = Math.hypot(dx, dy);
          if (d > 6) {
            const sp = Math.min(d, 3 * T * dt);
            p.x += (dx / d) * sp;
            p.y += (dy / d) * sp;
            if (Math.abs(dx) > 0.5) p.face = dx > 0 ? 1 : -1;
          }
        }
      } else {
        p.wait -= dt;
        if (p.wait <= 0 && !reducedMotion) this.decide(s, floor, p, host);
      }
      // people fuss over a pet that comes close
      if (p.mode !== 'walk' && p.mode !== 'sleep' && p.fussT <= 0) {
        const near = peopleNow().find((x) => x.id !== p.deskOf && Math.hypot(x.x - p.x, x.y - p.y) < 34 && x.mode !== 'walk');
        if (!near) p.fussT = 0.4; // look again in a moment, not every frame
        else if (Math.random() < dt * 3) {
          const lines = p.kind === 'tortoise' ? [`Hi ${p.name}! Take your time.`, `${p.name} made it to the kitchen!`, 'Slow and steady 🐢', `Look, ${p.name} is moving!`] : p.kind === 'robot' ? [`Hi ${p.name}!`, 'It ate my cable again!', `Good job, ${p.name}.`, 'Mind my feet!'] : p.kind === 'cat' ? CAT_LINES(p.name) : DOG_LINES(p.name);
          host.react(near.id, lines[Math.floor(Math.random() * lines.length)]!, Math.random() < 0.5 ? 'laugh' : 'wave');
          p.heartT = 1.6;
          p.fussT = 12 + Math.random() * 10;
          p.face = near.x > p.x ? 1 : -1;
        }
      }
      this.draw(p, reducedMotion);
    }
  }

  private draw(p: Pet, reducedMotion: boolean): void {
    const moving = p.mode === 'walk' || (p.mode === 'follow' && p.wait > 0);
    const pose = p.mode === 'sleep' && p.path.length === 0 ? 'sleep' : moving ? 'walk' : 'sit';
    if (pose !== p.pose) {
      p.pose = pose;
      p.tailBase = p.kind === 'tortoise' ? drawTortoise(p.body, p.tail, pose) : p.kind === 'robot' ? drawRobot(p.body, p.tail, pose) : p.kind === 'cat' ? drawCat(p.body, p.tail, p.fur, pose) : drawDog(p.body, p.tail, p.fur, pose);
    }
    const bob = p.kind === 'robot' || p.kind === 'tortoise' ? 0 : pose === 'walk' && !reducedMotion ? Math.abs(Math.sin(p.t * (p.speed > 3 ? 22 : 14))) * 1.6 : pose === 'sleep' ? Math.sin(p.t * 1.6) * 0.4 : 0;
    p.body.position.set(0, -bob);
    p.body.scale.y = pose === 'sleep' ? 1 + Math.sin(p.t * 1.6) * 0.04 : 1;
    if (p.kind === 'dog') p.tail.rotation = pose === 'sleep' ? 0 : Math.sin(p.t * (p.heartT > 0 || p.mode === 'follow' ? 26 : 9)) * 0.45;
    else p.tail.rotation = pose === 'sleep' ? 0 : Math.sin(p.t * 2.2) * 0.3;
    p.tail.position.set(p.tailBase[0], p.tailBase[1] - bob);
    p.c.scale.x = p.face;
    const onDesk = p.mode === 'desk';
    p.c.position.set(p.x, p.y);
    p.c.zIndex = p.mode === 'sleep' ? p.bedZ + 1 : onDesk ? p.y + T : p.y + 1;
    p.heartT -= 1 / 60;
    p.heart.visible = p.heartT > 0 || (pose === 'sleep' && Math.sin(p.t * 0.7) > 0.4);
    p.heart.text = p.heartT > 0 ? '♥' : 'z';
    p.heart.style.fill = p.heartT > 0 ? 0xe0475b : 0x7c9cc4;
    p.heart.scale.x = p.face;
    if (p.label) {
      p.label.scale.x = p.face;
      p.label.position.set(0, -30);
    }
    p.heart.position.set(4, -26 - (p.heartT > 0 ? (1.6 - p.heartT) * 6 : Math.sin(p.t) * 2));
  }
}

function drawTortoise(g: Graphics, tail: Graphics, pose: string): [number, number] {
  g.clear();
  tail.clear();
  g.ellipse(0, 0, 8, 2.4).fill({ color: 0x000000, alpha: 0.18 });
  if (pose !== 'sleep') {
    // head and feet poke out
    g.circle(8, -3, 2.2).fill(0x9bbf6a);
    g.circle(9, -3.6, 0.5).fill(0x111111);
    for (const fx of [-5, 5]) g.ellipse(fx, -0.6, 1.8, 1.2).fill(0x9bbf6a);
  }
  g.ellipse(0, -3.2, 7.5, 4.6).fill(0x6b7f3a);
  g.ellipse(0, -3.8, 6, 3.4).fill(0x8a9f4a);
  for (const [hx, hy] of [[-2.6, -4.2], [2.6, -4.2], [0, -2.6], [0, -5.6]] as const) g.circle(hx, hy, 1.3).fill({ color: 0x5a6a2e, alpha: 0.8 });
  return [0, 0];
}

function drawRobot(g: Graphics, tail: Graphics, pose: string): [number, number] {
  g.clear();
  tail.clear();
  g.ellipse(0, 0, 8, 2.6).fill({ color: 0x000000, alpha: 0.18 });
  g.ellipse(0, -2.5, 8, 4.2).fill(0x3b3f48);
  g.ellipse(0, -3.6, 7, 3.2).fill(0x4a4f58);
  g.circle(2.5, -4, 1).fill(pose === 'sleep' ? 0xf2c450 : 0x5fd38a);
  g.rect(-5, -2.2, 10, 0.8).fill({ color: 0xffffff, alpha: 0.2 });
  return [0, 0];
}

function drawCat(g: Graphics, tail: Graphics, fur: number, pose: string): [number, number] {
  g.clear();
  tail.clear();
  const dark = shadeNum(fur, 0.78);
  g.ellipse(0, 0, 8, 2.6).fill({ color: 0x000000, alpha: 0.16 });
  if (pose === 'sleep') {
    g.ellipse(0, -4, 8, 4.6).fill(fur);
    g.circle(5, -5, 3.8).fill(fur);
    g.poly([3, -7.5, 3.8, -10.5, 5.6, -8]).fill(dark);
    g.poly([6.2, -8, 8, -10.2, 8.4, -6.8]).fill(dark);
    g.moveTo(4, -5).lineTo(5.4, -5).stroke({ width: 0.7, color: 0x2a2018 });
    g.moveTo(-7, -2).quadraticCurveTo(-2, 2, 6, -1).stroke({ width: 2.2, color: dark });
    return [0, 0];
  }
  const sit = pose === 'sit';
  if (sit) {
    g.ellipse(0, -6, 6, 6.5).fill(fur);
    g.roundRect(-1, -2.5, 2, 3, 1).fill(dark);
    g.roundRect(2.5, -2.5, 2, 3, 1).fill(dark);
  } else {
    for (const lx of [-5, -2, 3, 5.6]) g.roundRect(lx - 0.9, -4, 1.8, 4, 0.9).fill(dark);
    g.ellipse(0, -6.5, 8, 4.2).fill(fur);
  }
  const hx = sit ? 3 : 7;
  const hy = sit ? -14 : -10.5;
  g.circle(hx, hy, 4.4).fill(fur);
  g.poly([hx - 3.4, hy - 2, hx - 2.4, hy - 6.6, hx - 0.6, hy - 3.4]).fill(fur);
  g.poly([hx + 0.6, hy - 3.4, hx + 2.6, hy - 6.6, hx + 3.6, hy - 1.8]).fill(fur);
  g.poly([hx - 2.8, hy - 2.6, hx - 2.3, hy - 5.2, hx - 1.2, hy - 3.4]).fill(0xf2a7b0);
  g.circle(hx - 1.4, hy - 0.3, 0.75).fill(0x2a2018);
  g.circle(hx + 1.8, hy - 0.3, 0.75).fill(0x2a2018);
  g.circle(hx + 0.2, hy + 1.3, 0.55).fill(0xe07a8a);
  if (sit) {
    tail.moveTo(0, 0).quadraticCurveTo(-7, 1, -5, -7).stroke({ width: 2.2, color: dark, cap: 'round' });
    return [-4, -2];
  }
  tail.moveTo(0, 0).quadraticCurveTo(-6, -2, -5, -9).stroke({ width: 2.2, color: dark, cap: 'round' });
  return [-7, -7];
}

function drawDog(g: Graphics, tail: Graphics, fur: number, pose: string): [number, number] {
  g.clear();
  tail.clear();
  const dark = shadeNum(fur, 0.72);
  g.ellipse(0, 0, 10, 3).fill({ color: 0x000000, alpha: 0.16 });
  if (pose === 'sleep') {
    g.ellipse(0, -5, 10, 5.4).fill(fur);
    g.circle(7, -5.5, 4.6).fill(fur);
    g.ellipse(10.5, -4.4, 2.6, 1.9).fill(shadeNum(fur, 1.1));
    g.circle(12.6, -4.8, 0.9).fill(0x1a1a1a);
    g.ellipse(5.5, -6, 1.8, 3.4).fill(dark);
    g.moveTo(6.4, -6.4).lineTo(8, -6.4).stroke({ width: 0.7, color: 0x2a2018 });
    return [0, 0];
  }
  const sit = pose === 'sit';
  if (sit) {
    g.ellipse(-1, -8, 7.5, 7.5).fill(fur);
    g.roundRect(1.5, -6, 2.2, 6, 1).fill(dark);
    g.roundRect(4.6, -6, 2.2, 6, 1).fill(dark);
  } else {
    for (const lx of [-7, -4, 4, 7]) g.roundRect(lx - 1.1, -6, 2.2, 6, 1).fill(dark);
    g.ellipse(0, -9, 10, 5.4).fill(fur);
  }
  const hx = sit ? 5 : 10;
  const hy = sit ? -17 : -14.5;
  g.circle(hx, hy, 5.2).fill(fur);
  g.ellipse(hx + 4, hy + 1.6, 3.2, 2.4).fill(shadeNum(fur, 1.12));
  g.circle(hx + 6.6, hy + 0.8, 1.1).fill(0x1a1a1a);
  g.ellipse(hx - 3.2, hy + 1, 2, 4.2).fill(dark);
  g.circle(hx + 1.2, hy - 1.2, 0.85).fill(0x2a2018);
  g.moveTo(hx + 3.4, hy + 3.6).quadraticCurveTo(hx + 4.6, hy + 4.8, hx + 5.8, hy + 3.6).stroke({ width: 0.7, color: 0x5a2a22 });
  const tx = sit ? -7 : -9.5;
  const ty = sit ? -5 : -11;
  tail.moveTo(0, 0).quadraticCurveTo(-4, -3, -3, -9).stroke({ width: 2.4, color: fur, cap: 'round' });
  return [tx, ty];
}

function shadeNum(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}
