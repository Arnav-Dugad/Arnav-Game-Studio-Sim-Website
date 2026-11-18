/**
 * Visitors: people who walk in from the street because of what's happening at the studio — a courier, the
 * pizza run during crunch, a journalist previewing a hyped game, an investor calling on the founder, a job
 * candidate while you're recruiting. They find who they came for, chat, and leave. Cosmetic.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { entrance, findPath, tierDef } from '@/sim/systems/office';
import type { GameState } from '@/sim/types';
import { animate, createRig, newAnim, setHat, type Anim, type Prop, type Rig } from './animation';
import type { ScenePalette } from './palette';
import { T, drawPerson, lookFor, type Look } from './sprites';
import { shortTitle } from './shortTitle';

export type VisitorKind = 'courier' | 'pizza' | 'journalist' | 'investor' | 'candidate' | 'leaver' | 'headhunter' | 'guide' | 'kid' | 'fan' | 'filmcrew';

export interface VisitorPerson {
  id: string;
  name: string;
  x: number;
  y: number;
  role: string;
  level: string;
  project?: string;
  projectName?: string;
  crunching: boolean;
}

export interface VisitorHost {
  people(): VisitorPerson[];
  reply(staffId: string, text: string, gesture?: 'wave' | 'laugh' | 'joy'): void;
}

interface Visitor {
  kind: VisitorKind;
  c: Container;
  rig: Rig;
  anim: Anim;
  legL: Graphics;
  legR: Graphics;
  x: number;
  y: number;
  t: number;
  face: number;
  path: [number, number][];
  phase: 'in' | 'visit' | 'out';
  wait: number;
  target: string;
  lines: [string, string];
  replied: boolean;
  speech: Container | null;
  speechT: number;
  carry: Prop;
}

const TOPS: Record<VisitorKind, number> = { courier: 0x8a5a3b, pizza: 0xd8323c, journalist: 0x5b6b7a, investor: 0x2f3542, candidate: 0x7a9cc6, leaver: 0x888888, headhunter: 0x1f2328, guide: 0x2eb5a8, kid: 0xf2c450, fan: 0xd1495b, filmcrew: 0x4a4f3a };
const CARRY: Record<VisitorKind, Prop> = { courier: 'box', pizza: 'pizza', journalist: 'notepad', investor: 'briefcase', candidate: 'none', leaver: 'box', headhunter: 'briefcase', guide: 'notepad', kid: 'none', fan: 'none', filmcrew: 'camera' };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const first = (n: string) => n.split(' ')[0] ?? n;

export class VisitorSystem {
  private list: Visitor[] = [];
  /** Office width in pixels (speech bubbles stay inside it). */
  private officeW = 0;
  private nextT = 25 + Math.random() * 25;
  private floor = -1;
  /** Poach offers a headhunter has already visited for. */
  private poachSeen = new Set<number>();
  /** The last launch a fan queue turned up for. */
  private queuedFor = '';
  private P: ScenePalette | null = null;

  constructor(private layer: Container) {}

  private tileCenter(x: number, y: number): [number, number] {
    return [x * T + T / 2, y * T + T * 0.72];
  }

  private route(s: GameState, floor: number, fx: number, fy: number, wx: number, wy: number): [number, number][] {
    const t = tierDef(s.office.tier);
    const from: [number, number] = [Math.min(t.w - 1, Math.max(0, Math.floor(fx / T))), Math.min(t.h - 1, Math.max(0, Math.floor((fy + 6) / T)))];
    const to: [number, number] = [Math.min(t.w - 1, Math.max(0, Math.floor(wx / T))), Math.min(t.h - 1, Math.max(0, Math.floor(wy / T)))];
    let path = findPath(s, floor, from, to);
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
      if (path) break;
      const n: [number, number] = [to[0] + dx, to[1] + dy];
      if (n[0] >= 0 && n[1] >= 0 && n[0] < t.w && n[1] < t.h) path = findPath(s, floor, from, n);
    }
    if (!path || !path.length) return [[wx, wy]];
    const pts = path.slice(1).map(([x, y]) => this.tileCenter(x, y));
    pts.push([wx, wy]);
    return pts;
  }

  private spawn(s: GameState, floor: number, kind: VisitorKind, target: VisitorPerson, lines: [string, string], offset = 0): Visitor {
    const c = new Container();
    const fig = new Graphics();
    const look = { ...lookFor(Math.floor(Math.random() * 1e6), 'visitor'), top: kind === 'kid' || kind === 'fan' ? [0xf2c450, 0xe07a5f, 0x3d85c6, 0x5f9e6e][Math.floor(Math.random() * 4)]! : TOPS[kind] };
    if (kind === 'investor' || kind === 'headhunter') look.glasses = Math.random() < 0.5;
    look.headphones = false;
    drawPerson(fig, look, 'stand', this.P!);
    const suit = kind === 'investor' || kind === 'headhunter';
    const legL = new Graphics().roundRect(-5, -8, 4, 8, 2).fill(suit ? 0x22262e : 0x3a3f4a);
    const legR = new Graphics().roundRect(1, -8, 4, 8, 2).fill(suit ? 0x22262e : 0x3a3f4a);
    const rig = createRig(fig, look);
    if (kind === 'courier' || kind === 'pizza') setHat(rig, 'cap', kind === 'pizza' ? 0xf2f2f2 : 0x5a3b26);
    if (kind === 'filmcrew') setHat(rig, 'cap', 0x2a2d34);
    c.addChild(legL, legR, rig.root);
    this.layer.addChild(c);
    const ent = entrance(s);
    const [ex, ey] = this.tileCenter(ent.x, ent.y);
    const side = target.x > ex ? -1 : 1;
    const v: Visitor = { kind, c, rig, anim: newAnim(), legL, legR, x: ex, y: ey + T * 0.6, t: Math.random() * 10, face: 1, path: [], phase: 'in', wait: 0, target: target.id, lines, replied: false, speech: null, speechT: 0, carry: CARRY[kind] };
    v.path = [[ex, ey], ...this.route(s, floor, ex, ey, target.x + side * (20 + Math.abs(offset)), target.y + 4 + offset * 0.6)];
    if (kind === 'kid') {
      c.scale.set(0.72);
      v.t += offset;
    }
    this.list.push(v);
    return v;
  }

  private choose(s: GameState, floor: number, host: VisitorHost): void {
    if (this.list.filter((v) => v.kind !== 'fan').length >= 2) return;
    const people = host.people();
    if (!people.length) return;
    const projects = Object.values(s.projects);
    // a rival's headhunter calls on whoever they're trying to poach
    const poach = s.pendingEvents.find((e) => e.defId === 'poach_offer' && !this.poachSeen.has(e.uid));
    const target = poach ? people.find((p) => p.id === String(poach.ctx.staff)) : undefined;
    if (poach && !target) return; // the person they want isn't here: no random visitors in the meantime
    if (poach && target && !this.list.some((v) => v.kind === 'headhunter')) {
      this.poachSeen.add(poach.uid);
      this.spawn(s, floor, 'headhunter', target, [pick(['Ever thought about moving on?', 'Got a minute? Off the record.', 'They’d double your salary…']), pick(['I’m happy here… I think.', 'Let me think about it.', 'Not in front of my boss!'])]);
      return;
    }
    const opts: { w: number; go: () => void }[] = [];
    const crunchers = people.filter((p) => p.crunching);
    if (crunchers.length) opts.push({ w: 3, go: () => this.spawn(s, floor, 'pizza', pick(crunchers), [pick(['Pizza for the night shift!', 'Large pepperoni ×12?', 'Delivery! 🍕']), pick(['Pizza!! 🍕', 'You’re a lifesaver.', 'Finally, food!'])]) });
    const hyped = projects.find((p) => p.kind === 'game' && p.phase >= 2 && p.hype > 35);
    if (hyped && hyped.kind === 'game') {
      const team = people.filter((p) => p.project === hyped.id);
      if (team.length) opts.push({ w: 2, go: () => this.spawn(s, floor, 'journalist', pick(team), [pick([`Can I get a quote on ${shortTitle(hyped.concept.name, 16)}?`, 'Exclusive preview?', 'Any release date?']), pick(['It’s going to be huge!', 'No comment! 😄', 'You’ll love it.', 'Soon™'])]) });
    }
    // the first collector's edition boxes arrive for the team to admire
    const boxed = projects.find((p) => p.kind === 'game' && p.collectors && p.phase >= 2);
    if (boxed && boxed.kind === 'game') {
      const team = people.filter((p) => p.project === boxed.id);
      if (team.length) opts.push({ w: 1.5, go: () => this.spawn(s, floor, 'courier', pick(team), [pick(['Collector’s edition samples!', 'Careful — there’s a statue in here.', `The ${shortTitle(boxed.concept.name, 16)} boxes are in!`]), pick(['Look at the statue! 😍', 'It’s real now. It’s really real.', 'Can I keep one?', 'The map is gorgeous!'])]) });
    }
    // a documentary crew filming the team behind the game
    const filmed = projects.find((p) => p.kind === 'game' && p.documentary);
    if (filmed && filmed.kind === 'game' && !this.list.some((v) => v.kind === 'filmcrew')) {
      const team = people.filter((p) => p.project === filmed.id);
      const crunch = filmed.documentary!.crunchDays >= 20;
      if (team.length)
        opts.push({
          w: 2.5,
          go: () =>
            this.spawn(s, floor, 'filmcrew', pick(team), [
              pick(crunch ? ['How long since you slept?', 'Tell us about the late nights.', 'Is this normal?'] : ['Just act natural.', 'Pretend we’re not here.', 'What are you working on?', 'Talk us through it.']),
              pick(crunch ? ['…Can we not film this?', 'It’s fine. Everything’s fine.', 'Don’t put this in the film!'] : ['Uh… hi, Mum? 👋', 'Is it rolling?', 'Do I look okay?', 'So, this is the boss fight…']),
            ]),
        });
    }
    const founder = people.find((p) => p.role === 'founder');
    if (founder && (s.finance.stock || s.company.cash > 5_000_000)) opts.push({ w: 1, go: () => this.spawn(s, floor, 'investor', founder, [pick(['The numbers look great.', 'Shall we talk growth?', 'Impressive quarter.']), pick(['Wait till you see what’s next.', 'Coffee first?', 'We’re just warming up.'])]) });
    if (s.company.recruiting > 0) {
      const leads = people.filter((p) => p.level === 'lead' || p.level === 'senior' || p.role === 'founder');
      if (leads.length) opts.push({ w: 1.5, go: () => this.spawn(s, floor, 'candidate', pick(leads), [pick(['Here for the interview!', 'Hi! I applied last week.', 'Is this the studio?']), pick(['Welcome! Coffee?', 'Come on in!', 'Great to meet you!'])]) });
    }
    if (s.company.reputation >= 50 && !this.list.length) {
      opts.push({
        w: 0.6,
        go: () => {
          const p = pick(people);
          this.spawn(s, floor, 'guide', p, [pick(['And this is where the magic happens!', 'Say hello to a real game developer!', 'Everyone wave!']), pick(['Hi kids! 👋', 'Welcome, everyone!', 'Want to see something cool?'])]);
          [-14, 0, 14].forEach((off, i) => {
            const k = this.spawn(s, floor, 'kid', p, [pick(['Whoa!', 'Is that a real arcade?', 'Can I play?', 'So cool!']), ''], off);
            k.wait = 0;
            k.replied = true;
            k.speechT = -1 - i;
          });
        },
      });
    }
    opts.push({ w: 1, go: () => { const p = pick(people); this.spawn(s, floor, 'courier', p, [pick([`Parcel for ${first(p.name)}!`, 'Sign here, please.', 'Delivery!']), pick(['Thanks!', 'Ooh, dev kits!', 'Is it the new monitor?'])]); } });
    const total = opts.reduce((t, o) => t + o.w, 0);
    let r = Math.random() * total;
    for (const o of opts) {
      r -= o.w;
      if (r <= 0) return o.go();
    }
  }

  /** A queue of fans outside the door on launch day: they cheer, then head home with their copies. */
  private fanQueue(s: GameState, game: string): void {
    if (!this.P) return;
    const ent = entrance(s);
    const [ex, ey] = this.tileCenter(ent.x, ent.y);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const c = new Container();
      const fig = new Graphics();
      const look = { ...lookFor(Math.floor(Math.random() * 1e6), 'visitor'), top: [0xd1495b, 0x3d85c6, 0xf2c450, 0x5f9e6e, 0x9b6bd3][i % 5]!, headphones: false };
      drawPerson(fig, look, 'stand', this.P);
      const legL = new Graphics().roundRect(-5, -8, 4, 8, 2).fill(0x3a3f4a);
      const legR = new Graphics().roundRect(1, -8, 4, 8, 2).fill(0x3a3f4a);
      const rig = createRig(fig, look);
      c.addChild(legL, legR, rig.root);
      this.layer.addChild(c);
      const x = ex + (i - (n - 1) / 2) * 16;
      const y = ey + T * 1.35 + (i % 2) * 6;
      const v: Visitor = { kind: 'fan', c, rig, anim: newAnim(), legL, legR, x, y, t: Math.random() * 10, face: i < n / 2 ? 1 : -1, path: [], phase: 'visit', wait: 7 + Math.random() * 3, target: '', lines: ['', ''], replied: true, speech: null, speechT: 0, carry: 'none' };
      v.anim.joy = 3 + Math.random() * 2;
      v.anim.party = i % 3;
      this.list.push(v);
      if (i === 1 || i === 4) this.say(v, i === 1 ? `${shortTitle(game, 18)}! 🎉` : pick(['Day one!', 'Been waiting all year!', 'Take my money!']), 3);
    }
    // someone in the studio mascot costume comes out to greet the queue
    const m = s.company.mascot;
    if (m) {
      const c = new Container();
      const col = parseInt(m.color.slice(1), 16);
      const body = new Graphics().ellipse(0, -14, 11, 13).fill(col);
      const legL = new Graphics().roundRect(-6, -4, 5, 6, 2).fill(col);
      const legR = new Graphics().roundRect(1, -4, 5, 6, 2).fill(col);
      const head = new Graphics();
      if (m.kind === 'robot') head.roundRect(-11, -46, 22, 20, 5).fill(col);
      else head.circle(0, -36, 12).fill(col);
      if (m.kind === 'bear') head.circle(-9, -46, 4).fill(col).circle(9, -46, 4).fill(col);
      else if (m.kind === 'cat') head.poly([-10, -40, -8, -52, -2, -45]).fill(col).poly([10, -40, 8, -52, 2, -45]).fill(col);
      else if (m.kind === 'dragon') head.poly([-7, -44, -11, -54, -3, -46]).fill(0xf2e2b8).poly([7, -44, 11, -54, 3, -46]).fill(0xf2e2b8);
      else if (m.kind === 'robot') head.rect(-0.8, -54, 1.6, 8).fill(0x2a2622).circle(0, -54, 2).fill(0xf2c450);
      else if (m.kind === 'bird') head.poly([-2, -26, 2, -26, 0, -21]).fill(0xf2c450);
      head.circle(-4, -37, 2.4).fill(0xffffff).circle(4, -37, 2.4).fill(0xffffff).circle(-4, -36.5, 1.1).fill(0x2a2622).circle(4, -36.5, 1.1).fill(0x2a2622);
      if (m.acc === 'crown') head.poly([-7, -46, -5, -53, -2, -49, 0, -55, 2, -49, 5, -53, 7, -46]).fill(0xe3b23c);
      const rig = createRig(new Graphics(), lookFor(1, 'visitor'));
      rig.root.visible = false;
      c.addChild(legL, legR, body, head, rig.root);
      this.layer.addChild(c);
      const v: Visitor = { kind: 'fan', c, rig, anim: newAnim(), legL, legR, x: ex - ((n - 1) / 2) * 16 - 26, y: ey + T * 1.5, t: 0, face: 1, path: [], phase: 'visit', wait: 9, target: '', lines: ['', ''], replied: true, speech: null, speechT: 0, carry: 'none' };
      this.list.push(v);
      this.say(v, pick(['Welcome, everyone! 🎉', 'Thanks for coming!', 'Who wants a high five?']), 3.2);
    }
  }

  /** Someone is leaving the studio: they pack a box, say goodbye and walk out. */
  farewell(s: GameState, floor: number, at: { x: number; y: number }, look: Look, P: ScenePalette, host: VisitorHost): void {
    if (floor !== this.floor || this.list.filter((x) => x.kind === 'leaver').length >= 12) return;
    this.P = P;
    const c = new Container();
    const fig = new Graphics();
    drawPerson(fig, look, 'stand', P);
    const legL = new Graphics().roundRect(-5, -8, 4, 8, 2).fill(0x3a3f4a);
    const legR = new Graphics().roundRect(1, -8, 4, 8, 2).fill(0x3a3f4a);
    const rig = createRig(fig, look);
    c.addChild(legL, legR, rig.root);
    this.layer.addChild(c);
    const ent = entrance(s);
    const [ex, ey] = this.tileCenter(ent.x, ent.y);
    const v: Visitor = { kind: 'leaver', c, rig, anim: newAnim(), legL, legR, x: at.x, y: at.y, t: 0, face: 1, path: [...this.route(s, floor, at.x, at.y, ex, ey), [ex, ey + T * 0.6]], phase: 'out', wait: 0, target: '', lines: ['', ''], replied: true, speech: null, speechT: 0, carry: 'box' };
    v.anim.wave = 1.6;
    this.list.push(v);
    this.say(v, pick(['Goodbye, everyone! 👋', 'It’s been an honour.', 'I’ll miss you all!', 'Keep making great games!']), 2.6);
    const near = host.people().filter((p) => Math.hypot(p.x - at.x, p.y - at.y) < 160).slice(0, 3);
    for (const p of near) host.reply(p.id, pick(['We’ll miss you!', 'Good luck! 👋', 'Stay in touch!', 'Bye! 😢']), 'wave');
  }

  private say(v: Visitor, text: string, secs: number): void {
    const w = Math.min(170, Math.max(34, 10 + text.length * 5.4));
    if (!v.speech) {
      const c = new Container();
      c.addChild(new Graphics(), new Text({ text: '', style: { fontFamily: 'Inter, sans-serif', fontSize: 9.5, fontWeight: '600', fill: 0x2a2622 } }));
      v.c.addChild(c);
      v.speech = c;
    }
    const bg = v.speech.children[0] as Graphics;
    const tx = v.speech.children[1] as Text;
    bg.clear();
    bg.roundRect(-w / 2, -11, w, 20, 8).fill({ color: 0xffffff, alpha: 0.97 });
    bg.roundRect(-w / 2, -11, w, 20, 8).stroke({ width: 1, color: 0x2a2622, alpha: 0.12 });
    bg.poly([-3, 9, 4, 9, -1, 15]).fill({ color: 0xffffff, alpha: 0.97 });
    tx.text = text;
    tx.anchor.set(0.5);
    tx.position.set(0, -1);
    v.speechT = secs;
    v.speech.position.set(0, -62);
    v.speech.visible = true;
  }

  private remove(v: Visitor): void {
    v.c.destroy({ children: true });
    this.list = this.list.filter((x) => x !== v);
  }

  update(s: GameState, floor: number, dt: number, host: VisitorHost, reducedMotion: boolean, P: ScenePalette): void {
    this.P = P;
    this.officeW = tierDef(s.office.tier).w * T;
    if (floor !== this.floor) {
      for (const v of [...this.list]) this.remove(v);
      this.floor = floor;
    }
    const waiting = s.pendingEvents.find((e) => e.defId === 'poach_offer' && !this.poachSeen.has(e.uid));
    if (waiting && host.people().some((p) => p.id === String(waiting.ctx.staff))) this.nextT = Math.min(this.nextT, 2);
    // launch day for a hyped game: fans queue outside the door
    const last = s.releaseOrder
      .slice(-4)
      .map((id) => s.releases[id]!)
      .filter((r) => r && s.day - r.day <= 1 && r.hypeAtLaunch >= 0.8)
      .sort((a, b) => b.hypeAtLaunch - a.hypeAtLaunch)[0];
    if (last && last.id !== this.queuedFor && floor === 0 && !reducedMotion) {
      this.queuedFor = last.id;
      this.fanQueue(s, last.name);
    }
    this.nextT -= dt;
    if (this.nextT <= 0 && !reducedMotion) {
      this.nextT = 35 + Math.random() * 45;
      this.choose(s, floor, host);
    }
    for (const v of [...this.list]) {
      v.t += dt;
      v.speechT -= dt;
      if (v.speech) {
        v.speech.visible = v.speechT > 0;
        // keep the bubble inside the office walls (fans crowd the doorway near the edges)
        const half = v.speech.width / 2;
        if (this.officeW > half * 2) v.speech.x = Math.min(this.officeW - 4 - half - v.x, Math.max(4 + half - v.x, 0));
      }
      const target = v.path[0];
      let walking = false;
      if (target) {
        walking = true;
        const sp = 2.1 * T * dt;
        const dx = target[0] - v.x;
        const dy = target[1] - v.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.5) v.face = dx > 0 ? 1 : -1;
        if (d <= sp) {
          v.x = target[0];
          v.y = target[1];
          v.path.shift();
        } else {
          v.x += (dx / d) * sp;
          v.y += (dy / d) * sp;
        }
      } else if (v.phase === 'in') {
        v.phase = 'visit';
        v.wait = v.kind === 'filmcrew' ? 11 : 6;
        const p = host.people().find((x) => x.id === v.target);
        if (p) v.face = p.x >= v.x ? 1 : -1;
        this.say(v, v.lines[0], 2.4);
        v.anim.wave = v.kind === 'candidate' ? 1.4 : 0;
      } else if (v.phase === 'visit') {
        v.wait -= dt;
        if (!v.replied && v.wait < 3.4) {
          v.replied = true;
          host.reply(v.target, v.lines[1], v.kind === 'pizza' ? 'joy' : v.kind === 'journalist' ? 'laugh' : 'wave');
          if (v.kind === 'courier' || v.kind === 'pizza') v.carry = 'none'; // handed over
        }
        if (v.wait <= 0) {
          v.phase = 'out';
          const ent = entrance(s);
          const [ex, ey] = this.tileCenter(ent.x, ent.y);
          v.path = v.kind === 'fan' ? [[ex + Math.sign(v.x - ex || 1) * (360 + Math.abs(v.x - ex)), v.y]] : [...this.route(s, floor, v.x, v.y, ex, ey), [ex, ey + T * 0.6]];
          if (Math.random() < 0.5) this.say(v, pick(['Bye!', 'See you!', 'Thanks!', 'Have a good one!']), 1.6);
        }
      } else {
        this.remove(v);
        continue;
      }
      const bob = walking ? Math.abs(Math.sin(v.t * 12)) * 2.2 : 0;
      animate(v.rig, v.anim, { dt, t: v.t, pose: 'stand', mode: walking ? 'walk' : 'talk', face: v.face, bob, speaking: v.speechT > 0, listening: !walking && v.speechT <= 0, morale: 70, energy: 80, working: false, sleepy: false, idle: false, era: 2000, reducedMotion, carry: v.carry });
      const swing = walking ? Math.sin(v.t * 12) * 2 : 0;
      v.legL.position.set(0, -bob * 0.3 + Math.max(0, swing));
      v.legR.position.set(0, -bob * 0.3 + Math.max(0, -swing));
      v.c.position.set(v.x, v.y);
      v.c.zIndex = v.y + 1;
      // fade in/out at the door
      const ent = entrance(s);
      const doorY = (ent.y + 1) * T;
      v.c.alpha = v.kind === 'fan' ? Math.max(0, Math.min(1, 1 - (Math.abs(v.x - this.tileCenter(ent.x, ent.y)[0]) - 200) / 120)) : Math.max(0, Math.min(1, (doorY + T * 0.4 - v.y) / (T * 0.5)));
      if (v.kind === 'fan' && v.phase === 'out' && v.c.alpha <= 0.01) {
        this.remove(v);
        continue;
      }
    }
  }
}
