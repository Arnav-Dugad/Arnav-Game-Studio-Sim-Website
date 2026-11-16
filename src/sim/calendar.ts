/**
 * Calendar maths. Day 0 = 1980-01-01 (a Tuesday). Pure integer arithmetic on the proleptic Gregorian calendar.
 */
import type { YearMonth } from '../data/types';

export const EPOCH_YEAR = 1980;

function daysFromCivil(y: number, m: number, d: number): number {
  // Howard Hinnant's algorithm
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const EPOCH_OFFSET = daysFromCivil(EPOCH_YEAR, 1, 1);

export interface CalDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

export function toDay(year: number, month = 1, day = 1): number {
  return daysFromCivil(year, month, day) - EPOCH_OFFSET;
}

export function fromDay(dayIndex: number): CalDate {
  const z = dayIndex + EPOCH_OFFSET + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: y + (m <= 2 ? 1 : 0), month: m, day: d };
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(dayIndex: number): number {
  // 1980-01-01 was a Tuesday → index 1
  return (((dayIndex + 1) % 7) + 7) % 7;
}

export function parseYM(ym: YearMonth | string): number {
  const [y, m] = String(ym).split('-');
  return toDay(Number(y), m ? Number(m) : 1, 1);
}

/** Fractional year, e.g. 1985.5 — handy for interpolating keyframes. */
export function yearFrac(dayIndex: number): number {
  return EPOCH_YEAR + dayIndex / 365.2425;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function formatDate(dayIndex: number, withDay = true): string {
  const d = fromDay(dayIndex);
  return withDay ? `${MONTHS[d.month - 1]} ${d.day}, ${d.year}` : `${MONTHS[d.month - 1]} ${d.year}`;
}

/** Linear interpolation over [x, y] keyframes, clamped at the ends. */
export function interp(keys: readonly (readonly [number, number])[], x: number): number {
  if (keys.length === 0) return 1;
  const first = keys[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (x <= b[0]) {
      const t = (x - a[0]) / (b[0] - a[0] || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return keys[keys.length - 1]![1];
}
