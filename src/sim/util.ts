import { BALANCE } from '../data/balance';
import { fromDay, yearFrac } from './calendar';
import { Rng } from './rng';
import type { GameState, LedgerCat, MonthLedger, NewsItem } from './types';

/** Inflation multiplier from 1980 dollars to the given day's dollars. */
export function inflation(day: number): number {
  return Math.pow(1 + BALANCE.INFLATION, yearFrac(day) - 1980);
}

/** "a" or "an" for a word (handles acronyms like RPG, MMO, FPS that start with a vowel sound). */
export function aOrAn(word: string): string {
  return /^([aeiou]|RPG|MMO|FPS|RTS|MOBA|SNES|NES|X)/i.test(word) && !/^(uni|use|one)/i.test(word) ? `an ${word}` : `a ${word}`;
}

/** Convert a 1980-dollar amount to nominal dollars on `day`. */
export function money(amount1980: number, day: number): number {
  return Math.round(amount1980 * inflation(day));
}

export function year(s: GameState): number {
  return fromDay(s.day).year;
}

export function newId(s: GameState, prefix: string): string {
  s.nextId += 1;
  return `${prefix}${s.nextId.toString(36)}`;
}

/** Run fn with an Rng bound to the state's RNG words (mutates s.rng in place). */
export function rngOf(s: GameState): Rng {
  return new Rng(s.rng);
}

export function currentLedger(s: GameState): MonthLedger {
  let l = s.finance.ledger[s.finance.ledger.length - 1];
  if (!l) {
    l = { day: s.day, income: {}, expense: {}, cashEnd: s.company.cash };
    s.finance.ledger.push(l);
  }
  return l;
}

export function earn(s: GameState, cat: LedgerCat, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const a = Math.round(amount);
  s.company.cash += a;
  const l = currentLedger(s);
  l.income[cat] = (l.income[cat] ?? 0) + a;
}

export function spend(s: GameState, cat: LedgerCat, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const a = Math.round(amount);
  s.company.cash -= a;
  const l = currentLedger(s);
  l.expense[cat] = (l.expense[cat] ?? 0) + a;
}

export function pushNews(s: GameState, n: Omit<NewsItem, 'id' | 'day'> & { day?: number }): NewsItem {
  s.nextNewsId += 1;
  const item: NewsItem = { id: s.nextNewsId, day: n.day ?? s.day, ...n } as NewsItem;
  s.news.push(item);
  if (s.news.length > 400) s.news.splice(0, s.news.length - 400);
  return item;
}

export function sum(xs: readonly number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t;
}

export function avg(xs: readonly number[]): number {
  return xs.length ? sum(xs) / xs.length : 0;
}

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '$—';
  if (Math.abs(n) < 0.5) return '$0';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}k`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}k`;
  return `${sign}$${Math.round(a)}`;
}

export function fmtUnits(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}

/** Change reputation (clamped 0..100) and remember why. */
export function addRep(s: GameState, delta: number, reason: string): void {
  if (!Number.isFinite(delta) || delta === 0) return;
  const before = s.company.reputation;
  s.company.reputation = Math.min(100, Math.max(0, before + delta));
  const applied = s.company.reputation - before;
  if (Math.abs(applied) < 0.005) return;
  const log = (s.company.repLog ??= []);
  const last = log[log.length - 1];
  // merge repeated small drifts (e.g. the monthly quiet-spell decay) into one entry
  if (last && last.reason === reason && s.day - last.day < 400) {
    last.delta += applied;
    last.day = s.day;
  } else log.push({ day: s.day, delta: applied, reason });
  if (log.length > 30) log.splice(0, log.length - 30);
}

export function hasFlag(s: GameState, flag: keyof GameState['market']['flags']): boolean {
  return s.market.flags[flag] !== undefined;
}
