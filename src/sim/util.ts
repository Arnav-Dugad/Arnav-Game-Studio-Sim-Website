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

/** “Atari’s”, but “Midway Games’” — a possessive that reads right for names ending in s. */
export function possessive(name: string): string {
  const n = name.trim();
  return /s\.?$/i.test(n) ? `${n}’` : `${n}’s`;
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

/** Pay for a research project and remember the price: a refund gives back what was paid, never today's inflated price. */
export function payResearch(s: GameState, id: string, cost: number): void {
  spend(s, 'research', cost);
  (s.research.paid ??= {})[id] = cost;
}

/** What was paid for a started or queued research project (older saves: today's price). */
export const researchPaid = (s: GameState, id: string, fallback: number): number => s.research.paid?.[id] ?? fallback;

/** Money to (negative) or from (positive) investors and lenders: moves cash and shows in the month's books, but is never revenue or a cost. */
export function financing(s: GameState, amount: number): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  const a = Math.round(amount);
  s.company.cash += a;
  const l = currentLedger(s);
  l.financing = (l.financing ?? 0) + a;
}

export function spend(s: GameState, cat: LedgerCat, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const a = Math.round(amount);
  s.company.cash -= a;
  const l = currentLedger(s);
  l.expense[cat] = (l.expense[cat] ?? 0) + a;
}

/**
 * Give money back that came in as income (an advance, crowdfunding): it un-books that income instead of looking like
 * a new cost, so cancelling never leaves the studio's revenue looking bigger than it was.
 */
export function refund(s: GameState, cat: LedgerCat, amount: number, bookedDay?: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  let a = Math.round(amount);
  s.company.cash -= a;
  const l = currentLedger(s);
  const here = Math.min(l.income[cat] ?? 0, a);
  if (here > 0) l.income[cat] = (l.income[cat] ?? 0) - here;
  a -= here;
  if (a <= 0) return;
  // booked in an earlier month: this month shows the refund as a cost (so the books balance), and the trailing
  // revenue those months reported no longer counts it
  l.expense.other_expense = (l.expense.other_expense ?? 0) + a;
  if (bookedDay === undefined) return;
  // the month it came in, if it's still in the trailing year: that month reported it, so it un-reports it
  const ledger = s.finance.ledger;
  let idx = -1;
  for (let i = ledger.length - 1; i >= 0; i--)
    if (ledger[i]!.day <= bookedDay) {
      idx = i;
      break;
    }
  const back = ledger.length - 1 - idx; // closed months since then
  const slot = s.finance.revenue12m.length - back;
  if (idx < 0 || back < 1 || slot < 0) return;
  s.finance.revenue12m[slot] = Math.max(0, s.finance.revenue12m[slot]! - a);
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
  // thresholds sit just below each unit so rounding never shows “$1000k” or “$1000.0M”
  if (a >= 999_950_000) return `${sign}$${(a / 1e9).toFixed(a >= 9_995_000_000 ? 1 : 2)}B`;
  if (a >= 999_500) return `${sign}$${(a / 1e6).toFixed(a >= 9_995_000 ? 1 : 2)}M`;
  if (a >= 9_950) return `${sign}$${Math.round(a / 1e3)}k`;
  if (a >= 999.5) return `${sign}$${(a / 1e3).toFixed(1)}k`;
  return `${sign}$${Math.round(a)}`;
}

export function fmtUnits(n: number): string {
  if (n >= 999_500) return `${(n / 1e6).toFixed(n >= 9_995_000 ? 1 : 2)}M`;
  if (n >= 999.5) return `${(n / 1e3).toFixed(n >= 9_950 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}

/** Change reputation (clamped 0..100) and remember why. */
/** "1 game", "3 games" (the count and the word, with the right ending). */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`;
}

/** Above this reputation, every gain is smaller. */
export const REP_TAPER_FROM = 50;

/**
 * What a reputation change really comes to for this studio: the last stretch to legend status takes many years of
 * good work, whatever the source (losses are never softened). Previews use it so the numbers shown are the real ones.
 */
export function repGain(s: GameState, delta: number): number {
  const rep = s.company.reputation;
  return delta > 0 && rep > REP_TAPER_FROM ? delta * Math.max(0.08, 1 - (rep - REP_TAPER_FROM) / 40) : delta;
}

/** A reputation gain for display: "+2", "+0.4", or "+a little" when it rounds to nothing. */
export function fmtRepGain(v: number): string {
  if (v < 0) return `−${Math.abs(v) >= 0.95 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(1)}`;
  return v >= 0.95 ? `+${Math.round(v)}` : v >= 0.1 ? `+${v.toFixed(1)}` : '+a little';
}

/** "Reputation +2" in a preview → the gain this studio would actually get ("Reputation +0.5"). */
export function realRepText(s: GameState, text: string): string {
  return text.replace(/([Rr]eputation) \+(\d+(?:\.\d+)?)/g, (_m, word: string, n: string) => {
    return `${word} ${fmtRepGain(repGain(s, Number(n)))}`;
  });
}

export function addRep(s: GameState, delta: number, reason: string): void {
  if (!Number.isFinite(delta) || delta === 0) return;
  const before = s.company.reputation;
  delta = repGain(s, delta);
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
