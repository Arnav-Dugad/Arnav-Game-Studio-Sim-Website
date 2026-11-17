/**
 * Tiny WebAudio synth for UI feedback — no audio files.
 *
 * - The AudioContext is created lazily on the first `unlock()` / `play()` (call `unlock()` from a
 *   user gesture such as the first click so browsers allow audio).
 * - Every sound is a few oscillators / filtered noise bursts with soft gain envelopes, routed through
 *   a master gain and a gentle compressor so overlapping sounds never clip.
 * - Rapid repeats are throttled (≈12 sounds/sec globally, plus a per-sound minimum gap).
 * - Volume / mute persist in localStorage under `ase:sound`.
 * - Safe to import during SSR / tests: nothing touches `window` until it is used.
 */

export type SoundName =
  | 'click'
  | 'hover'
  | 'coin'
  | 'bigCoin'
  | 'success'
  | 'fanfare'
  | 'fail'
  | 'notify'
  | 'error'
  | 'levelUp'
  | 'type'
  | 'whoosh'
  | 'review'
  | 'cash'
  | 'place'
  | 'sell'
  | 'mail';

interface Prefs {
  volume: number;
  muted: boolean;
}

const STORAGE_KEY = 'ase:sound';
const isBrowser = typeof window !== 'undefined';
const MAX_PER_SECOND = 12;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function loadPrefs(): Prefs {
  const fallback: Prefs = { volume: 0.6, muted: false };
  if (!isBrowser) return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs> | null;
    return {
      volume: typeof parsed?.volume === 'number' ? clamp01(parsed.volume) : fallback.volume,
      muted: typeof parsed?.muted === 'boolean' ? parsed.muted : fallback.muted,
    };
  } catch {
    return fallback;
  }
}

const prefs: Prefs = loadPrefs();

function savePrefs(): void {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable (private mode, quota) — ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Audio graph                                                         */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Perceptual volume curve; overall level kept deliberately soft. */
const masterLevel = () => (prefs.muted ? 0 : Math.pow(prefs.volume, 1.6) * 0.8);

function getContext(): AudioContext | null {
  if (!isBrowser) return null;
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    const c = new AC({ latencyHint: 'interactive' });
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    const g = c.createGain();
    g.gain.value = masterLevel();
    g.connect(comp);
    comp.connect(c.destination);
    ctx = c;
    master = g;
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const len = Math.floor(c.sampleRate * 1);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

interface ToneOpts {
  freq: number;
  /** Glide target frequency. */
  to?: number;
  /** Glide duration (defaults to `dur`). */
  glide?: number;
  type?: OscillatorType;
  /** Start offset (s) from the sound's start. */
  at?: number;
  /** Total length (s) including release. */
  dur: number;
  attack?: number;
  gain?: number;
  /** Lowpass cutoff (Hz). */
  lp?: number;
  detune?: number;
}

function tone(c: AudioContext, out: AudioNode, t0: number, o: ToneOpts): void {
  const t = t0 + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.glide ?? o.dur));
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);

  const g = c.createGain();
  const attack = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain ?? 0.1), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

  let filter: BiquadFilterNode | null = null;
  if (o.lp) {
    filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(o.lp, t);
    filter.Q.value = 0.6;
    osc.connect(filter);
    filter.connect(g);
  } else osc.connect(g);
  g.connect(out);

  osc.start(t);
  osc.stop(t + o.dur + 0.03);
  osc.onended = () => {
    osc.disconnect();
    filter?.disconnect();
    g.disconnect();
  };
}

interface NoiseOpts {
  at?: number;
  dur: number;
  gain?: number;
  attack?: number;
  filter?: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
}

function noise(c: AudioContext, out: AudioNode, t0: number, o: NoiseOpts): void {
  const t = t0 + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const f = c.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain ?? 0.05), t + (o.attack ?? 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.03);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

/** Soft bell: sine fundamental + inharmonic partial. */
function bell(c: AudioContext, out: AudioNode, t0: number, freq: number, at: number, dur: number, gain: number): void {
  tone(c, out, t0, { freq, at, dur, gain, attack: 0.003 });
  tone(c, out, t0, { freq: freq * 2.76, at, dur: dur * 0.45, gain: gain * 0.22, attack: 0.002 });
}

/* ------------------------------------------------------------------ */
/* Sound designs                                                       */
/* ------------------------------------------------------------------ */

let coinStreak = 0;
let lastCoinAt = -Infinity;

function render(name: SoundName, c: AudioContext, out: AudioNode): void {
  const t = c.currentTime + 0.005;
  const jitter = (amt: number) => 1 + (Math.random() - 0.5) * amt;

  switch (name) {
    case 'hover':
      tone(c, out, t, { freq: 1760 * jitter(0.02), dur: 0.05, gain: 0.03, attack: 0.003, lp: 4000 });
      break;

    case 'click':
      tone(c, out, t, { type: 'triangle', freq: 1150, to: 720, dur: 0.07, gain: 0.11, lp: 3200 });
      noise(c, out, t, { dur: 0.018, gain: 0.025, filter: 'highpass', freq: 4500 });
      break;

    case 'type':
      noise(c, out, t, { dur: 0.03, gain: 0.05, filter: 'bandpass', freq: 2600 * jitter(0.4), q: 1.6 });
      tone(c, out, t, { freq: 1300 * jitter(0.2), dur: 0.025, gain: 0.015 });
      break;

    case 'coin': {
      const ms = nowMs();
      coinStreak = ms - lastCoinAt < 450 ? Math.min(coinStreak + 1, 6) : 0;
      lastCoinAt = ms;
      const p = jitter(0.08) * (1 + coinStreak * 0.015);
      tone(c, out, t, { type: 'square', freq: 988 * p, dur: 0.075, gain: 0.04, lp: 3400 });
      tone(c, out, t, { type: 'square', freq: 1319 * p, at: 0.055, dur: 0.22, gain: 0.045, lp: 3400 });
      break;
    }

    case 'bigCoin':
      [1047, 1319, 1568, 2093].forEach((f, i) => bell(c, out, t, f, i * 0.06, 0.34, 0.085));
      noise(c, out, t, { at: 0.12, dur: 0.32, gain: 0.018, filter: 'highpass', freq: 6500, attack: 0.04 });
      break;

    case 'cash':
      noise(c, out, t, { dur: 0.05, gain: 0.07, filter: 'bandpass', freq: 1800, q: 2 });
      noise(c, out, t, { at: 0.055, dur: 0.07, gain: 0.045, filter: 'bandpass', freq: 3600, q: 2 });
      bell(c, out, t, 2093, 0.09, 0.45, 0.09);
      bell(c, out, t, 2637, 0.1, 0.4, 0.055);
      break;

    case 'success':
      [523.25, 659.25, 783.99].forEach((f, i) => tone(c, out, t, { type: 'triangle', freq: f, at: i * 0.07, dur: 0.34, gain: 0.09, lp: 2600 }));
      bell(c, out, t, 1046.5, 0.21, 0.36, 0.06);
      break;

    case 'fanfare': {
      const lead: [number, number, number][] = [
        [392, 0, 0.15],
        [523.25, 0.13, 0.15],
        [659.25, 0.26, 0.15],
        [783.99, 0.39, 0.28],
      ];
      for (const [f, at, dur] of lead) {
        tone(c, out, t, { type: 'sawtooth', freq: f, at, dur, gain: 0.05, lp: 1900, attack: 0.012 });
        tone(c, out, t, { type: 'sawtooth', freq: f, at, dur, gain: 0.03, lp: 1900, attack: 0.012, detune: 9 });
      }
      for (const f of [523.25, 659.25, 783.99, 1046.5]) {
        tone(c, out, t, { type: 'sawtooth', freq: f, at: 0.6, dur: 0.6, gain: 0.032, lp: 2200, attack: 0.03 });
        tone(c, out, t, { type: 'triangle', freq: f, at: 0.6, dur: 0.6, gain: 0.03, attack: 0.03, detune: -7 });
      }
      bell(c, out, t, 2093, 0.6, 0.6, 0.05);
      noise(c, out, t, { at: 0.6, dur: 0.5, gain: 0.015, filter: 'highpass', freq: 7000, attack: 0.05 });
      break;
    }

    case 'fail':
      tone(c, out, t, { type: 'triangle', freq: 392, dur: 0.2, gain: 0.09, lp: 1400 });
      tone(c, out, t, { type: 'triangle', freq: 329.63, at: 0.16, dur: 0.2, gain: 0.09, lp: 1300 });
      tone(c, out, t, { type: 'triangle', freq: 261.63, to: 246.94, at: 0.32, dur: 0.26, gain: 0.1, lp: 1200 });
      break;

    case 'error':
      tone(c, out, t, { type: 'square', freq: 196, dur: 0.09, gain: 0.045, lp: 900 });
      tone(c, out, t, { type: 'square', freq: 185, at: 0.12, dur: 0.11, gain: 0.045, lp: 900 });
      break;

    case 'mail':
      // an envelope opening, then a little two-note chime
      noise(c, out, t, { dur: 0.16, gain: 0.05, filter: 'bandpass', freq: 3200, to: 5200, q: 1.2, attack: 0.02 });
      bell(c, out, t, 987.77, 0.12, 0.35, 0.06);
      bell(c, out, t, 1318.5, 0.24, 0.45, 0.055);
      break;

    case 'notify':
      bell(c, out, t, 1318.5, 0, 0.3, 0.075);
      bell(c, out, t, 1760, 0.1, 0.4, 0.065);
      break;

    case 'levelUp':
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, out, t, { type: 'triangle', freq: f, at: i * 0.055, dur: 0.18, gain: 0.075, lp: 3000 }));
      tone(c, out, t, { freq: 400, to: 1600, glide: 0.28, dur: 0.3, gain: 0.025 });
      bell(c, out, t, 2093, 0.28, 0.3, 0.05);
      break;

    case 'whoosh':
      noise(c, out, t, { dur: 0.34, gain: 0.1, filter: 'bandpass', freq: 380, to: 2600, q: 0.9, attack: 0.12 });
      break;

    case 'review':
      tone(c, out, t, { freq: 150, to: 60, dur: 0.15, gain: 0.2, attack: 0.002 });
      noise(c, out, t, { dur: 0.05, gain: 0.05, filter: 'lowpass', freq: 900 });
      bell(c, out, t, 880, 0.08, 0.4, 0.055);
      bell(c, out, t, 1318.5, 0.08, 0.36, 0.035);
      break;

    case 'place':
      tone(c, out, t, { freq: 260, to: 120, dur: 0.11, gain: 0.17, attack: 0.002 });
      noise(c, out, t, { dur: 0.04, gain: 0.05, filter: 'bandpass', freq: 1200, q: 1.2 });
      break;

    case 'sell':
      tone(c, out, t, { type: 'triangle', freq: 660, to: 990, glide: 0.1, dur: 0.14, gain: 0.075, lp: 3000 });
      tone(c, out, t, { type: 'square', freq: 1318.5, at: 0.12, dur: 0.2, gain: 0.035, lp: 3500 });
      bell(c, out, t, 1760, 0.12, 0.3, 0.045);
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Throttling                                                          */
/* ------------------------------------------------------------------ */

const MIN_GAP_MS: Partial<Record<SoundName, number>> = { hover: 70, type: 30, coin: 45, click: 35 };
const DEFAULT_GAP_MS = 60;
const recent: number[] = [];
const lastPlayed = new Map<SoundName, number>();

function allow(name: SoundName, ms: number): boolean {
  const last = lastPlayed.get(name);
  if (last !== undefined && ms - last < (MIN_GAP_MS[name] ?? DEFAULT_GAP_MS)) return false;
  while (recent.length > 0 && ms - recent[0]! > 1000) recent.shift();
  if (recent.length >= MAX_PER_SECOND) return false;
  recent.push(ms);
  lastPlayed.set(name, ms);
  return true;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

function play(name: SoundName): void {
  if (!isBrowser || prefs.muted || prefs.volume <= 0) return;
  const ms = nowMs();
  if (!allow(name, ms)) return;
  const c = getContext();
  const out = master;
  if (!c || !out) return;
  try {
    if (c.state === 'running') render(name, c, out);
    else {
      // Only play if the context wakes up promptly — avoids a burst of queued sounds later.
      c.resume()
        .then(() => {
          if (c.state === 'running' && nowMs() - ms < 200) render(name, c, out);
        })
        .catch(() => {
          /* autoplay blocked until a user gesture */
        });
    }
  } catch {
    /* never let audio break the UI */
  }
}

function unlock(): void {
  const c = getContext();
  if (!c) return;
  try {
    if (c.state !== 'running') {
      c.resume().catch(() => {
        /* will retry on next gesture */
      });
    }
    // iOS: play a one-sample silent buffer inside the gesture to fully unlock output.
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
    src.onended = () => src.disconnect();
  } catch {
    /* ignore */
  }
}

function applyLevel(): void {
  if (!ctx || !master) return;
  try {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02);
  } catch {
    /* ignore */
  }
}

function setVolume(v: number): void {
  prefs.volume = clamp01(v);
  savePrefs();
  applyLevel();
}

function setMuted(m: boolean): void {
  prefs.muted = m;
  savePrefs();
  applyLevel();
}

export const sound = {
  play,
  setVolume,
  setMuted,
  unlock,
  get muted(): boolean {
    return prefs.muted;
  },
  get volume(): number {
    return prefs.volume;
  },
};
