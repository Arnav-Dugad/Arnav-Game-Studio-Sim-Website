/**
 * Character animation rig: a container around the body drawing with separate arms, eyes, mouth and a held
 * prop, plus a small state machine of gestures (blink, breathe, talk, nod, wave, sip, type, stretch, yawn,
 * phone, play, cheer, sulk). Purely cosmetic: the renderer feeds it what the person is doing.
 */
import { Container, Graphics } from 'pixi.js';
import type { Look } from './sprites';

export type Prop = 'none' | 'cup' | 'phone' | 'book' | 'paddle';

export interface Rig {
  root: Container;
  armL: Graphics;
  armR: Graphics;
  eyesOpen: Graphics;
  eyesClosed: Graphics;
  mouth: Graphics;
  prop: Graphics;
  propKind: Prop;
  mouthKey: string;
}

export interface Anim {
  phase: number;
  blink: number; // seconds until the next blink (negative = eyes shut)
  joy: number; // seconds of cheering left
  sad: number;
  wave: number;
  stretch: number;
  yawn: number;
  look: number; // desk head-turn timer
  lookDir: number;
  fidget: number; // timer for the next idle fidget (stretch/yawn/phone)
  phone: number;
}

export function newAnim(): Anim {
  return { phase: Math.random() * 10, blink: 1 + Math.random() * 4, joy: 0, sad: 0, wave: 0, stretch: 0, yawn: 0, look: 4 + Math.random() * 8, lookDir: 1, fidget: 6 + Math.random() * 20, phone: 0 };
}

function drawArm(g: Graphics, look: Look): void {
  g.clear();
  g.roundRect(-1.7, -0.5, 3.4, 8.5, 1.7).fill(look.top);
  g.circle(0, 8.8, 1.9).fill(look.skin);
}

export function createRig(fig: Graphics, look: Look): Rig {
  const root = new Container();
  const armL = new Graphics();
  const armR = new Graphics();
  drawArm(armL, look);
  drawArm(armR, look);
  const eyesOpen = new Graphics();
  eyesOpen.ellipse(-2.7, 0, 1.05, 1.35).fill(0x2a2018);
  eyesOpen.ellipse(2.7, 0, 1.05, 1.35).fill(0x2a2018);
  eyesOpen.circle(-2.4, -0.4, 0.35).fill(0xffffff);
  eyesOpen.circle(3, -0.4, 0.35).fill(0xffffff);
  const eyesClosed = new Graphics();
  eyesClosed.moveTo(-3.8, 0.3).lineTo(-1.6, 0.3).stroke({ width: 0.9, color: 0x2a2018 });
  eyesClosed.moveTo(1.6, 0.3).lineTo(3.8, 0.3).stroke({ width: 0.9, color: 0x2a2018 });
  eyesClosed.visible = false;
  const mouth = new Graphics();
  const prop = new Graphics();
  armR.addChild(prop);
  prop.position.set(0, 9);
  root.addChild(fig, eyesOpen, eyesClosed, mouth, armL, armR);
  return { root, armL, armR, eyesOpen, eyesClosed, mouth, prop, propKind: 'none', mouthKey: '' };
}

/** Redraw arms in a new outfit colour (identity editor). */
export function reskinRig(r: Rig, look: Look): void {
  drawArm(r.armL, look);
  drawArm(r.armR, look);
}

function setProp(r: Rig, kind: Prop): void {
  if (r.propKind === kind) return;
  r.propKind = kind;
  const g = r.prop;
  g.clear();
  if (kind === 'cup') {
    g.roundRect(-2.2, -1, 4.4, 4.6, 1).fill(0xf4efe7);
    g.roundRect(-2.2, -1, 4.4, 1.4, 0.6).fill(0x6b4a2e);
    g.circle(2.8, 1.2, 1.2).stroke({ width: 0.8, color: 0xf4efe7 });
  } else if (kind === 'phone') {
    g.roundRect(-1.8, -1.5, 3.6, 5.6, 0.9).fill(0x1d1f26);
    g.roundRect(-1.3, -1, 2.6, 4.4, 0.6).fill(0x7cc4ef);
  } else if (kind === 'book') {
    g.roundRect(-3.2, -1.5, 6.4, 4.6, 0.8).fill(0xc2563a);
    g.rect(-0.2, -1.5, 0.4, 4.6).fill(0xf4efe7);
  } else if (kind === 'paddle') {
    g.circle(0, 3.6, 2.8).fill(0xd1495b);
    g.rect(-0.6, 0, 1.2, 2).fill(0x8a5a3b);
  }
}

function setMouth(r: Rig, kind: 'smile' | 'flat' | 'frown' | 'talk1' | 'talk2' | 'yawn' | 'grin'): void {
  if (r.mouthKey === kind) return;
  r.mouthKey = kind;
  const g = r.mouth;
  g.clear();
  const ink = 0x5a2a22;
  if (kind === 'smile') g.moveTo(-1.8, 0).quadraticCurveTo(0, 1.6, 1.8, 0).stroke({ width: 0.9, color: ink });
  else if (kind === 'grin') g.moveTo(-2.2, -0.2).quadraticCurveTo(0, 2.6, 2.2, -0.2).closePath().fill(ink);
  else if (kind === 'frown') g.moveTo(-1.6, 1).quadraticCurveTo(0, -0.4, 1.6, 1).stroke({ width: 0.9, color: ink });
  else if (kind === 'talk1') g.ellipse(0, 0.6, 1.3, 0.8).fill(ink);
  else if (kind === 'talk2') g.ellipse(0, 0.7, 1.4, 1.5).fill(ink);
  else if (kind === 'yawn') g.ellipse(0, 1, 1.8, 2.4).fill(ink);
  else g.moveTo(-1.4, 0.4).lineTo(1.4, 0.4).stroke({ width: 0.9, color: ink });
}

export interface AnimInput {
  dt: number;
  t: number;
  pose: 'stand' | 'sit' | 'slump';
  mode: string;
  face: number;
  bob: number;
  /** This person is saying something right now / their partner is. */
  speaking: boolean;
  listening: boolean;
  morale: number;
  energy: number;
  working: boolean;
  sleepy: boolean;
  /** Leisure glyph or station: what they're doing on a break. */
  leisure?: string;
  era: number;
  reducedMotion: boolean;
}

/** Advance one frame. Returns the extra vertical bob (jumps). */
export function animate(r: Rig, a: Anim, i: AnimInput): number {
  const { dt, t } = i;
  const ph = a.phase;
  // timers
  a.blink -= dt;
  if (a.blink < -0.13) a.blink = 2 + Math.random() * 4;
  for (const k of ['joy', 'sad', 'wave', 'stretch', 'yawn', 'phone'] as const) if (a[k] > 0) a[k] -= dt;
  // idle fidgets
  a.fidget -= dt;
  if (a.fidget <= 0 && !i.reducedMotion) {
    a.fidget = 8 + Math.random() * 22;
    if (i.pose === 'sit' && i.working && Math.random() < 0.45) a.stretch = 1.4;
    else if (i.energy < 40 && Math.random() < 0.6) a.yawn = 1.6;
    else if (i.pose === 'stand' && i.era >= 2008 && (i.mode === 'wander' || i.mode === 'station' || i.mode === 'fun') && Math.random() < 0.5) a.phone = 3 + Math.random() * 3;
  }
  // head geometry for this pose (matches drawPerson)
  const bodyY = i.pose === 'sit' ? -12 : i.pose === 'slump' ? -12 : -14;
  const headX = i.pose === 'slump' ? 3 : 0;
  const headY = i.pose === 'slump' ? bodyY - 8 : bodyY - 17;
  r.eyesOpen.position.set(headX, headY + 0.8);
  r.eyesClosed.position.set(headX, headY + 0.8);
  r.mouth.position.set(headX, headY + 4.4);
  r.armL.position.set(-8.6, bodyY - 8.5);
  r.armR.position.set(8.6, bodyY - 8.5);

  // eyes
  const shut = a.blink < 0 || i.sleepy || a.sad > 0 || a.yawn > 0.4;
  r.eyesOpen.visible = !shut;
  r.eyesClosed.visible = shut;

  // mouth
  if (a.yawn > 0) setMouth(r, 'yawn');
  else if (i.speaking) setMouth(r, Math.sin(t * 22 + ph) > 0 ? 'talk2' : 'talk1');
  else if (a.joy > 0) setMouth(r, 'grin');
  else if (a.sad > 0 || i.morale < 35) setMouth(r, 'frown');
  else if (i.morale > 68) setMouth(r, 'smile');
  else setMouth(r, 'flat');

  // arms & props (angles: 0 = hanging; + swings the left arm out / the right arm in)
  let l = 0.08;
  let rr = -0.08;
  let prop: Prop = 'none';
  let lean = 0;
  let jump = 0;
  const walking = i.mode === 'walk';
  if (a.joy > 0) {
    l = 2.7 + Math.sin(t * 14) * 0.25;
    rr = -2.7 - Math.sin(t * 14) * 0.25;
    jump = Math.abs(Math.sin(t * 9)) * 6;
  } else if (a.wave > 0) {
    rr = -2.6 + Math.sin(t * 14) * 0.4;
  } else if (a.stretch > 0) {
    l = 2.8;
    rr = -2.8;
  } else if (a.yawn > 0) {
    l = -2.3;
  } else if (walking) {
    const sw = Math.sin(t * 12);
    l = sw * 0.5;
    rr = sw * 0.5;
    lean = i.face * 0.05;
  } else if (i.pose === 'sit' && i.working) {
    // typing: hands forward and busy
    l = -0.45 + Math.sin(t * 15 + ph) * 0.12;
    rr = 0.45 + Math.sin(t * 15 + ph + 1.6) * 0.12;
  } else if (i.speaking) {
    rr = -0.7 - Math.abs(Math.sin(t * 4.5 + ph)) * 0.7;
    l = 0.25 + Math.abs(Math.sin(t * 3 + ph)) * 0.25;
  } else if (i.leisure === '☕') {
    const sip = (t + ph) % 3.4 < 1.1;
    rr = sip ? 2.35 : 0.65;
    prop = 'cup';
  } else if (i.leisure === '🎮' || i.leisure === '🕹️') {
    l = -0.5 + Math.sin(t * 18) * 0.15;
    rr = 0.5 + Math.sin(t * 17 + 1) * 0.15;
  } else if (i.leisure === '🏓') {
    rr = -0.4 - Math.abs(Math.sin(t * 6)) * 1.3;
    prop = 'paddle';
  } else if (i.leisure === '📖') {
    l = -0.9;
    rr = 0.9;
    prop = 'book';
  } else if (i.leisure === '😌' || i.leisure === '😴') {
    l = 0.35;
    rr = -0.35;
    lean = -i.face * 0.07;
  } else if (a.phone > 0) {
    rr = 0.95;
    prop = 'phone';
    lean = i.face * 0.04;
  } else if (i.pose === 'slump') {
    l = 0.02;
    rr = -0.02;
  } else {
    // idle: a gentle sway
    l = 0.1 + Math.sin(t * 1.3 + ph) * 0.06;
    rr = -0.1 - Math.sin(t * 1.3 + ph + 0.8) * 0.06;
  }
  if (i.reducedMotion) {
    l = Math.max(-0.5, Math.min(0.5, l));
    rr = Math.max(-0.5, Math.min(0.5, rr));
    jump = 0;
  }
  r.armL.rotation = l;
  r.armR.rotation = rr;
  setProp(r, prop);
  // keep held things roughly upright (a cup tips a little when sipping)
  r.prop.rotation = prop === 'paddle' ? 0 : -rr * 0.85;

  // whole-body: breathing, leaning, nodding while listening, sulking droop, desk head-turns
  const breathe = i.reducedMotion ? 0 : Math.sin(t * 2.4 + ph) * 0.018;
  r.root.scale.y = 1 + breathe;
  let tilt = lean;
  if (i.listening) tilt += Math.sin(t * 5 + ph) * 0.035;
  if (a.sad > 0) tilt += i.face * 0.08;
  r.root.rotation = i.reducedMotion ? 0 : tilt;
  let face = i.face;
  if (i.pose === 'sit' && !walking) {
    a.look -= dt;
    if (a.look <= 0) {
      a.look = a.lookDir === 1 ? 1.2 + Math.random() * 1.5 : 5 + Math.random() * 9;
      a.lookDir = a.lookDir === 1 ? -1 : 1;
    }
    face *= a.lookDir;
  }
  r.root.scale.x = face;
  r.root.position.set(0, -(i.bob + jump));
  return jump;
}
