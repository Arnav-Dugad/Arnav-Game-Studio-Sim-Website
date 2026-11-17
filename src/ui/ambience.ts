/**
 * Office ambience — WebAudio only, no audio files. A quiet room tone, keyboard clatter that follows how
 * many people are working (clacky mechanical keys in the 80s, softer later), a murmur when people chat,
 * the coffee machine now and then, an old desk phone in the 80s/90s, and the office pets.
 *
 * - Separate on/off and volume, persisted under `ase:ambience`.
 * - Fed by a snapshot callback (counts from the renderer), polled ten times a second.
 * - Safe to import in tests: nothing touches `window` until `start()` is called.
 */

import { sound } from './sound';

export interface AmbienceSnapshot {
  working: number;
  chatting: number;
  onBreak: number;
  cats: number;
  dogs: number;
  year: number;
  /** Game running (not paused). */
  active: boolean;
  /** It's raining outside. */
  rain?: boolean;
}

interface Prefs {
  on: boolean;
  volume: number;
}

const KEY = 'ase:ambience';
const isBrowser = typeof window !== 'undefined';
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function loadPrefs(): Prefs {
  const fallback: Prefs = { on: true, volume: 0.4 };
  if (!isBrowser) return fallback;
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<Prefs> | null;
    return { on: typeof p?.on === 'boolean' ? p.on : fallback.on, volume: typeof p?.volume === 'number' ? clamp01(p.volume) : fallback.volume };
  } catch {
    return fallback;
  }
}
const prefs = loadPrefs();
function savePrefs(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let murmurGain: GainNode | null = null;
let rainGain: GainNode | null = null;
let roomGain: GainNode | null = null;
let loops: AudioBufferSourceNode[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let snap: () => AmbienceSnapshot | null = () => null;
let gestureHooked = false;
let phoneT = 30 + Math.random() * 60;
let coffeeT = 8;
let petT = 25;

const level = () => (prefs.on ? Math.pow(prefs.volume, 1.6) * 0.9 : 0);

function ensure(): AudioContext | null {
  if (!isBrowser) return null;
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    const c = new AC();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 4;
    const g = c.createGain();
    g.gain.value = level();
    g.connect(comp);
    comp.connect(c.destination);
    // two seconds of white noise, shared by every noisy sound
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ctx = c;
    master = g;
    noise = buf;
  } catch {
    ctx = null;
  }
  return ctx;
}

function hookGesture(): void {
  if (gestureHooked || !isBrowser) return;
  gestureHooked = true;
  const wake = () => {
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => undefined);
  };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
}

/** A looping filtered-noise bed (room tone, murmur). */
function bed(type: BiquadFilterType, freq: number, q: number): GainNode | null {
  if (!ctx || !master || !noise) return null;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start();
  loops.push(src);
  return g;
}

function burst(t: number, freq: number, q: number, dur: number, gain: number): void {
  if (!ctx || !master || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 1.5, dur + 0.02);
}

function tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: number): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function meow(t: number): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(620, t);
  o.frequency.linearRampToValueAtTime(980, t + 0.18);
  o.frequency.linearRampToValueAtTime(560, t + 0.55);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1400;
  f.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(f);
  f.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.65);
}

function woof(t: number): void {
  for (const dt of [0, 0.22]) {
    tone(t + dt, 'square', 260, 150, 0.14, 0.035);
    burst(t + dt, 500, 1.5, 0.12, 0.05);
  }
}

function phone(t: number, year: number): void {
  if (year < 2000) {
    // the classic two-tone desk phone bell
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 10; k++) {
        tone(t + r * 1.6 + k * 0.05, 'square', 440 + (k % 2) * 40, 440 + (k % 2) * 40, 0.045, 0.012);
      }
  } else {
    for (let k = 0; k < 3; k++) tone(t + k * 0.25, 'sine', 1320, 1320, 0.16, 0.02);
  }
}

function tick(): void {
  const c = ctx;
  const s = snap();
  if (!c || !s || !master) return;
  const silent = sound.muted || (typeof document !== 'undefined' && document.hidden);
  master.gain.setTargetAtTime(silent ? 0 : level(), c.currentTime, 0.2);
  if (silent) return;
  const quiet = s.active ? 1 : 0.5;
  const t = c.currentTime + 0.02;
  const people = s.working + s.chatting + s.onBreak;
  roomGain?.gain.setTargetAtTime(people > 0 ? 0.012 * quiet : 0.006, t, 0.8);
  murmurGain?.gain.setTargetAtTime(Math.min(1, s.chatting / 5) * 0.06 * quiet * (0.7 + Math.random() * 0.6), t, 0.4);
  // keyboards: more typists, more clicks; mechanical keys in the 80s and 90s
  const mech = s.year < 1998;
  const rate = Math.min(1.6, s.working / 6) * quiet;
  let n = Math.floor(rate * 3 + Math.random() * rate * 2);
  while (n-- > 0) burst(t + Math.random() * 0.1, mech ? 2200 + Math.random() * 900 : 3400 + Math.random() * 1500, mech ? 4 : 6, mech ? 0.035 : 0.02, (mech ? 0.05 : 0.025) * (0.6 + Math.random() * 0.6));
  // rain on the windows: a soft hiss and the odd fat drop
  rainGain?.gain.setTargetAtTime(s.rain ? 0.018 : 0, t, 1.5);
  if (s.rain && Math.random() < 0.35) burst(t + Math.random() * 0.1, 900 + Math.random() * 1600, 8, 0.03, 0.012 * (0.5 + Math.random()));
  // the coffee machine
  coffeeT -= 0.1;
  if (coffeeT <= 0) {
    coffeeT = 10 + Math.random() * 20;
    if (s.onBreak > 0 && Math.random() < 0.6) for (let k = 0; k < 14; k++) burst(t + k * 0.09 + Math.random() * 0.04, 700 + Math.random() * 300, 3, 0.08, 0.03);
  }
  // phones
  phoneT -= 0.1;
  if (phoneT <= 0) {
    phoneT = 40 + Math.random() * 80;
    if (people >= 3 && s.active) phone(t, s.year);
  }
  // pets
  petT -= 0.1;
  if (petT <= 0) {
    petT = 20 + Math.random() * 40;
    if (s.cats && Math.random() < 0.5) meow(t);
    else if (s.dogs && Math.random() < 0.5) woof(t);
  }
}

export const ambience = {
  start(source: () => AmbienceSnapshot | null): void {
    snap = source;
    if (!prefs.on || timer) return;
    const c = ensure();
    if (!c) return;
    hookGesture();
    if (c.state !== 'running') c.resume().catch(() => undefined);
    if (!loops.length) {
      roomGain = bed('lowpass', 220, 0.5);
      murmurGain = bed('bandpass', 420, 0.9);
      rainGain = bed('highpass', 1800, 0.4);
    }
    timer = setInterval(tick, 100);
  },
  stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    for (const l of loops) {
      try {
        l.stop();
      } catch {
        /* already stopped */
      }
    }
    loops = [];
    roomGain = murmurGain = rainGain = null;
  },
  isOn: () => prefs.on,
  volume: () => prefs.volume,
  setOn(on: boolean): void {
    prefs.on = on;
    savePrefs();
    if (master && ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.1);
    if (on) this.start(snap);
    else this.stop();
  },
  setVolume(v: number): void {
    prefs.volume = clamp01(v);
    savePrefs();
    if (master && ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.1);
  },
};
