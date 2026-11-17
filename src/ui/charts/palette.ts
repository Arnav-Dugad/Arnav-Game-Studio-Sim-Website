import type { CSSProperties } from 'react';

/**
 * Chart palette + small pure helpers shared by the hand-built SVG charts.
 *
 * SERIES_COLORS is an Okabe–Ito–inspired categorical palette, nudged toward the warm
 * "Soft Diorama" art direction. Every swatch sits in a mid-lightness band so it keeps
 * roughly 3:1 contrast against both the light (#f4efe7) and dark (#15130f) backgrounds,
 * and neighbouring entries alternate hue *and* lightness so they stay distinguishable
 * under the common colour-vision deficiencies.
 */
export const SERIES_COLORS: string[] = [
  '#3b82c4', // blue
  '#e08a1e', // orange
  '#17a08c', // bluish green / teal
  '#d65a3a', // vermillion
  '#9168cf', // reddish purple
  '#4fb0e0', // sky blue
  '#c95f97', // pink
  '#7d9a35', // olive
  '#b07d48', // warm brown
  '#7f8a99', // slate
];

/** Categorical colour for series index `i` (wraps around). */
export function seriesColor(i: number): string {
  const n = SERIES_COLORS.length;
  const idx = ((Math.trunc(i) % n) + n) % n;
  return SERIES_COLORS[idx] ?? '#7f8a99';
}

/* ------------------------------------------------------------------ */
/* Internal helpers (exported for the chart components in this folder) */
/* ------------------------------------------------------------------ */

/** Axis label font size (px) used by every chart. */
export const AXIS_FONT_SIZE = 10.5;

/** Inline style for SVG axis labels (theme-aware via CSS variables). */
export const AXIS_TEXT_STYLE: CSSProperties = {
  fill: 'var(--ink3)',
  fontSize: AXIS_FONT_SIZE,
  fontVariantNumeric: 'tabular-nums',
};

/** Rough text width estimate for axis labels (no DOM measuring → no layout thrash). */
export function estimateTextWidth(text: string, fontSize = AXIS_FONT_SIZE): number {
  return text.length * fontSize * 0.6;
}

/** A "nice" step (1, 2, 2.5, 5 × 10^n) that splits `span` into about `count` intervals. */
export function niceStep(span: number, count: number): number {
  const s = Math.abs(span);
  if (!Number.isFinite(s) || s === 0) return 1;
  const raw = s / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function clean(v: number): number {
  const r = Number.parseFloat(v.toPrecision(12));
  return r === 0 ? 0 : r; // also normalises -0
}

/**
 * Nice, rounded axis ticks covering [min, max] with about `count` ticks (4–5 by default).
 * The returned domain is extended outward to the first/last tick.
 */
export function niceTicks(min: number, max: number, count = 5): { min: number; max: number; step: number; ticks: number[] } {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 1;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    if (lo === 0) hi = 1;
    else {
      const pad = Math.abs(lo) * 0.1;
      const wasNonNeg = lo >= 0;
      lo -= pad;
      hi += pad;
      if (wasNonNeg && lo < 0) lo = 0;
    }
  }
  // Try a few interval counts and keep the one that wastes the least space while landing near `count` ticks.
  const target = Math.max(2, count);
  let best: { step: number; start: number; end: number; score: number } | null = null;
  for (const intervals of [target - 1, target - 2, target]) {
    if (intervals < 1) continue;
    const st = niceStep(hi - lo, intervals);
    const s0 = Math.floor(lo / st + 1e-9) * st;
    const e0 = Math.ceil(hi / st - 1e-9) * st;
    const nTicks = Math.round((e0 - s0) / st) + 1;
    const diff = Math.abs(nTicks - target);
    const score = (e0 - s0) / (hi - lo) + (diff === 0 ? 0 : diff === 1 ? 0.12 : 1);
    if (!best || score < best.score - 1e-9) best = { step: st, start: s0, end: e0, score };
  }
  const { step, start, end } = best ?? { step: 1, start: lo, end: hi };
  const ticks: number[] = [];
  for (let i = 0, v = start; v <= end + step * 1e-6 && i < 50; i++, v = start + i * step) ticks.push(clean(v));
  return { min: clean(start), max: clean(end), step, ticks };
}

/**
 * Ticks strictly inside [min, max] (no domain extension) — used for x axes.
 * When `integer` is set the step is never fractional.
 */
export function innerTicks(min: number, max: number, count: number, integer: boolean): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return Number.isFinite(min) ? [min] : [];
  let step = niceStep(max - min, Math.max(1, count));
  if (integer) step = Math.max(1, Math.ceil(step));
  const out: number[] = [];
  const first = Math.ceil(min / step - 1e-9) * step;
  for (let i = 0, v = first; v <= max + step * 1e-6 && i < 60; i++, v = first + i * step) out.push(clean(v));
  return out;
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

const UNITS: [number, string][] = [
  [1e15, 'Q'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** Compact human number: 950, 1.2K, 34.5M, 7B, 1.2e+21. Handles negatives and non-finite values. */
export function formatCompact(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e18) return v.toExponential(1);
  for (const [div, suffix] of UNITS) {
    if (abs >= div) {
      const n = v / div;
      const a = Math.abs(n);
      return trimZeros(n.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2)) + suffix;
    }
  }
  if (Number.isInteger(v)) return String(v);
  return trimZeros(v.toFixed(abs >= 10 ? 1 : 2));
}

/** Default x formatter: integers as-is, otherwise compact. */
export function formatX(v: number): string {
  return Number.isInteger(v) && Math.abs(v) < 1e6 ? String(v) : formatCompact(v);
}

/** Percentage from a 0..1 share. */
export function formatPct(share: number, digits = 1): string {
  if (!Number.isFinite(share)) return '—';
  return trimZeros((share * 100).toFixed(digits)) + '%';
}

/**
 * Keyboard navigation for a roving chart cursor over `n` positions.
 * Returns the new index, `null` to clear, or `undefined` when the key isn't handled.
 */
export function cursorStep(key: string, current: number | null, n: number): number | null | undefined {
  if (n <= 0) return undefined;
  const big = Math.max(1, Math.round(n / 10));
  const clamp = (i: number) => Math.min(n - 1, Math.max(0, i));
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return current === null ? n - 1 : clamp(current - 1);
    case 'ArrowRight':
    case 'ArrowUp':
      return current === null ? n - 1 : clamp(current + 1);
    case 'PageDown':
      return current === null ? n - 1 : clamp(current - big);
    case 'PageUp':
      return current === null ? n - 1 : clamp(current + big);
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
    case 'Escape':
      return null;
    default:
      return undefined;
  }
}

/** React `useId()` values contain characters that are awkward inside `url(#…)` references. */
export function svgSafeId(id: string): string {
  return 'c' + id.replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Index of the value in a sorted ascending array closest to `target` (binary search). */
export function nearestIndex(sorted: readonly number[], target: number): number {
  const n = sorted.length;
  if (n === 0) return -1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < target) lo = mid;
    else hi = mid;
  }
  return Math.abs(sorted[lo]! - target) <= Math.abs(sorted[hi]! - target) ? lo : hi;
}

/** Nice ticks whose formatted labels are all different (small ranges can otherwise read "0 1 1 2 2"). */
export function distinctTicks(min: number, max: number, fmt: (v: number) => string, count = 5): { min: number; max: number; step: number; ticks: number[] } {
  let yt = niceTicks(min, max, count);
  for (let c = count - 1; c >= 2; c--) {
    const labels = yt.ticks.map(fmt);
    if (new Set(labels).size === labels.length) break;
    yt = niceTicks(min, max, c);
  }
  return yt;
}
