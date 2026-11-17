/**
 * Generative soundtrack — WebAudio only, no audio files.
 *
 * A gentle, endlessly varied loop: chord progressions in a rotating key, a bass line, a soft pad and a
 * sparse pentatonic melody, plus light percussion while the game is running. The instrument palette
 * follows the in-game era: square-wave chiptune in the 1980s, FM-ish bells in the 1990s and warm
 * filtered pads from the 2000s on. Notes are scheduled slightly ahead of time with a lookahead timer
 * (the usual WebAudio pattern), so the music keeps steady time even when the main thread is busy.
 *
 * - Separate on/off and volume from sound effects, persisted under `ase:music`.
 * - The AudioContext is created lazily and resumed on the first user gesture (autoplay rules).
 * - Safe to import in tests: nothing touches `window` until `start()` is called.
 */

interface Prefs {
  on: boolean;
  volume: number;
}

const KEY = 'ase:music';
const isBrowser = typeof window !== 'undefined';
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function loadPrefs(): Prefs {
  const fallback: Prefs = { on: true, volume: 0.35 };
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

type Era = 'chip' | 'fm' | 'modern' | 'lofi';
export function eraFor(year: number): Era {
  return year < 1990 ? 'chip' : year < 2002 ? 'fm' : year < 2012 ? 'modern' : 'lofi';
}

// Scales as semitone offsets from the key root.
const MAJOR_PENTA = [0, 2, 4, 7, 9];
const MINOR_PENTA = [0, 3, 5, 7, 10];
// Progressions as scale-degree chord roots (semitones) + quality.
type Chord = { root: number; minor: boolean };
const PROGRESSIONS: { minor: boolean; chords: Chord[] }[] = [
  { minor: false, chords: [{ root: 0, minor: false }, { root: 7, minor: false }, { root: 9, minor: true }, { root: 5, minor: false }] }, // I V vi IV
  { minor: false, chords: [{ root: 0, minor: false }, { root: 9, minor: true }, { root: 5, minor: false }, { root: 7, minor: false }] }, // I vi IV V
  { minor: false, chords: [{ root: 2, minor: true }, { root: 7, minor: false }, { root: 0, minor: false }, { root: 9, minor: true }] }, // ii V I vi
  { minor: true, chords: [{ root: 0, minor: true }, { root: 8, minor: false }, { root: 3, minor: false }, { root: 10, minor: false }] }, // i VI III VII
  { minor: true, chords: [{ root: 0, minor: true }, { root: 5, minor: true }, { root: 10, minor: false }, { root: 3, minor: false }] }, // i iv VII III
];
const KEYS = [48, 50, 53, 55, 45, 47]; // MIDI roots: C, D, F, G, A, B (bass octave)

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Rand {
  constructor(private s: number) {}
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
}

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let duck: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let gestureHooked = false;
let getYear: () => number = () => 1980;
let getActive: () => boolean = () => true;

// Sequencer state
const rand = new Rand(Date.now() >>> 0);
let nextTime = 0;
let step = 0; // eighth notes
let bpm = 88;
let key = 48;
let prog = PROGRESSIONS[0]!;
let melodyIdx = 2;

const level = () => (prefs.on ? Math.pow(prefs.volume, 1.5) * 0.55 : 0);

function ensureContext(): AudioContext | null {
  if (!isBrowser) return null;
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    const c = new AC();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    const g = c.createGain();
    g.gain.value = level();
    const d = c.createGain();
    d.gain.value = 1;
    d.connect(g);
    g.connect(comp);
    comp.connect(c.destination);
    ctx = c;
    out = d;
    duck = g;
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

/* ── Instruments ─────────────────────────────────────────────────────── */

function voice(t: number, freq: number, dur: number, gain: number, era: Era, kind: 'lead' | 'pad' | 'bass'): void {
  if (!ctx || !out) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  if (era === 'chip') {
    o.type = kind === 'bass' ? 'triangle' : 'square';
    f.frequency.value = kind === 'pad' ? 1800 : 3200;
    gain *= kind === 'bass' ? 1 : 0.45;
  } else if (era === 'fm') {
    o.type = kind === 'bass' ? 'sawtooth' : kind === 'pad' ? 'triangle' : 'sine';
    f.frequency.value = kind === 'bass' ? 700 : 4000;
    if (kind === 'lead') {
      // simple FM bell: a modulator on the lead's frequency
      const m = ctx.createOscillator();
      const mg = ctx.createGain();
      m.frequency.value = freq * 3.5;
      mg.gain.setValueAtTime(freq * 1.2, t);
      mg.gain.exponentialRampToValueAtTime(1, t + dur);
      m.connect(mg);
      mg.connect(o.frequency);
      m.start(t);
      m.stop(t + dur + 0.05);
      m.onended = () => {
        m.disconnect();
        mg.disconnect();
      };
    }
  } else if (era === 'lofi') {
    // muffled keys, a little out of tune, like a worn cassette
    o.type = kind === 'bass' ? 'sine' : 'triangle';
    o.detune.value = (rand.next() - 0.5) * 14;
    f.frequency.value = kind === 'pad' ? 700 : kind === 'bass' ? 300 : 1500;
    if (kind === 'pad') gain *= 0.55;
  } else {
    o.type = kind === 'bass' ? 'sine' : kind === 'pad' ? 'sawtooth' : 'triangle';
    f.frequency.value = kind === 'pad' ? 900 : kind === 'bass' ? 400 : 2600;
    f.Q.value = kind === 'pad' ? 0.7 : 0.3;
    if (kind === 'pad') gain *= 0.5;
  }
  o.frequency.value = freq;
  const attack = kind === 'pad' ? Math.min(0.6, dur * 0.4) : 0.012;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.setTargetAtTime(0.0001, t + Math.max(attack, dur - (kind === 'pad' ? 0.5 : 0.08)), kind === 'pad' ? 0.35 : 0.06);
  o.connect(f);
  f.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 1.2);
  o.onended = () => {
    o.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

let noise: AudioBuffer | null = null;
function hat(t: number, gain: number, era: Era): void {
  if (!ctx || !out) return;
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = era === 'chip' ? 6000 : 8000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + 0.08);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

function kick(t: number, gain: number): void {
  if (!ctx || !out) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.2);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

/* ── Sequencer ───────────────────────────────────────────────────────── */

const STEPS_PER_BAR = 8; // eighth notes in 4/4
const BARS_PER_SECTION = 8;

function newSection(): void {
  key = rand.pick(KEYS);
  prog = rand.pick(PROGRESSIONS);
  bpm = eraFor(getYear()) === 'lofi' ? 70 + Math.floor(rand.next() * 14) : 80 + Math.floor(rand.next() * 18);
}

/** A soft snare (lo-fi backbeat) or a speck of vinyl crackle. */
function snare(t: number, gain: number, freq = 1700, dur = 0.09): void {
  if (!ctx || !out) return;
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, Math.random() * 0.1, dur + 0.02);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

function scheduleStep(t0: number): void {
  const era = eraFor(getYear());
  const active = getActive();
  const eighth = 60 / bpm / 2;
  const bar = Math.floor(step / STEPS_PER_BAR);
  const inBar = step % STEPS_PER_BAR;
  // lo-fi swings the off-beats
  const t = t0 + (era === 'lofi' && inBar % 2 === 1 ? (60 / bpm / 2) * 0.18 : 0);
  if (step % (STEPS_PER_BAR * BARS_PER_SECTION) === 0) newSection();
  const chord = prog.chords[bar % prog.chords.length]!;
  const root = key + chord.root;
  const third = chord.minor ? 3 : 4;
  // Pad: the chord, held for the bar
  if (inBar === 0) {
    for (const iv of [0, third, 7]) voice(t, midiHz(root + 12 + iv), eighth * STEPS_PER_BAR, 0.05, era, 'pad');
  }
  // Bass: root on 1, fifth on 3 (and a pickup now and then)
  if (inBar === 0 || inBar === 4) voice(t, midiHz(root + (inBar === 4 && rand.next() < 0.5 ? 7 : 0)), eighth * 3, 0.14, era, 'bass');
  else if (inBar === 7 && rand.next() < 0.3) voice(t, midiHz(root + 12), eighth * 0.9, 0.08, era, 'bass');
  // Melody: a sparse pentatonic random walk that leans on chord tones on strong beats
  const scale = prog.minor ? MINOR_PENTA : MAJOR_PENTA;
  const density = active ? 0.42 : 0.22;
  if (rand.next() < (inBar % 2 === 0 ? density + 0.12 : density - 0.1)) {
    melodyIdx = Math.max(0, Math.min(scale.length * 2 - 1, melodyIdx + rand.pick([-2, -1, -1, 0, 1, 1, 2])));
    const oct = Math.floor(melodyIdx / scale.length);
    let note = key + 24 + oct * 12 + scale[melodyIdx % scale.length]!;
    if (inBar === 0) note = key + 24 + chord.root + (rand.next() < 0.5 ? 0 : 7);
    const len = rand.next() < 0.25 ? eighth * 2 : eighth * 0.95;
    voice(t, midiHz(note), len, era === 'chip' ? 0.07 : 0.09, era, 'lead');
  }
  // Percussion only while time is running
  if (active) {
    if (inBar % 2 === 1) hat(t, era === 'modern' ? 0.025 : era === 'lofi' ? 0.018 : 0.035, era);
    if (era === 'chip' || era === 'fm') {
      if (inBar === 0 || inBar === 4) kick(t, 0.12);
    } else if (era === 'modern') {
      if (inBar === 0) kick(t, 0.09);
    } else {
      if (inBar === 0 || inBar === 5) kick(t, 0.08);
      if (inBar === 2 || inBar === 6) snare(t, 0.035);
    }
  }
  if (era === 'lofi' && rand.next() < 0.25) snare(t + rand.next() * 0.1, 0.006, 3000, 0.012);
  step += 1;
  nextTime = t0 + eighth;
}

function tick(): void {
  if (!ctx || ctx.state !== 'running' || !prefs.on) return;
  const ahead = ctx.currentTime + 0.25;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05; // after a stall, don't rush to catch up
  while (nextTime < ahead) scheduleStep(nextTime);
}

function applyLevel(): void {
  if (!ctx || !duck) return;
  duck.gain.cancelScheduledValues(ctx.currentTime);
  duck.gain.setTargetAtTime(level(), ctx.currentTime, 0.3);
}

/** Start the soundtrack (idempotent). `year` and `active` are read on every step. */
function start(opts: { year: () => number; active: () => boolean }): void {
  getYear = opts.year;
  getActive = opts.active;
  if (!isBrowser) return;
  hookGesture();
  if (!prefs.on) return;
  const c = ensureContext();
  if (!c) return;
  c.resume().catch(() => undefined);
  applyLevel();
  if (!timer) timer = setInterval(tick, 90);
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (ctx && duck) duck.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}

function setOn(on: boolean): void {
  prefs.on = on;
  savePrefs();
  if (on) {
    const c = ensureContext();
    c?.resume().catch(() => undefined);
    applyLevel();
    if (!timer) timer = setInterval(tick, 90);
  } else applyLevel();
}

function setVolume(v: number): void {
  prefs.volume = clamp01(v);
  savePrefs();
  applyLevel();
}

export const music = {
  start,
  stop,
  setOn,
  setVolume,
  get on(): boolean {
    return prefs.on;
  },
  get volume(): number {
    return prefs.volume;
  },
};
