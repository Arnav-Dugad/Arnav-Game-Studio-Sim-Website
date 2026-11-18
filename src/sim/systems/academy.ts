/**
 * The studio academy (1990+, for a famous studio): found a games school that teaches the next generation one craft.
 * It costs a monthly budget; every June a graduating class enters your hiring pool — well taught, high potential,
 * a little cheaper than the market and loyal to the studio that trained them. The better funded and the older the
 * school, the bigger and stronger its classes, and each graduation adds to the studio's name.
 */
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState, Role } from '../types';
import { SKILLS } from '../../data/types';
import { addRep, fmtMoney, money, pushNews, spend } from '../util';
import { HIREABLE_ROLES, ROLE_NAMES, ROLE_SKILLS, generateCandidate, levelFor, marketSalary } from './staff';

export const ACADEMY_YEAR = 1990;
export const ACADEMY_REP = 60;
/** Founding cost (1980 dollars, inflated). */
export const ACADEMY_FOUND = 1_500_000;
export type AcademyFunding = 1 | 2 | 3;
export type AcademyTrack = Role | 'mixed';
/** Monthly budget by funding level (1980 dollars). */
export const ACADEMY_BUDGET: Record<AcademyFunding, number> = { 1: 25_000, 2: 60_000, 3: 140_000 };
export const ACADEMY_FUNDING_NAMES: Record<AcademyFunding, string> = { 1: 'Modest', 2: 'Well funded', 3: 'World class' };
/** Graduates stay in the hiring pool this long. */
export const GRAD_DAYS = 75;
/** Graduates ask this share of the market rate (they'd love to work where they trained). */
export const GRAD_DISCOUNT = 0.9;

export function academyName(s: GameState): string {
  return `${s.company.name.split(' ')[0]} Academy`;
}

export const academyFoundCost = (s: GameState) => money(ACADEMY_FOUND, s.day);
export const academyBudget = (s: GameState, f: AcademyFunding) => money(ACADEMY_BUDGET[f], s.day);

export function academyBlocked(s: GameState): string | null {
  if (s.company.academy) return 'You already run an academy';
  if (fromDay(s.day).year < ACADEMY_YEAR) return `Games schools open from ${ACADEMY_YEAR}`;
  if (s.company.reputation < ACADEMY_REP) return `Needs reputation ${ACADEMY_REP} (students apply to famous studios)`;
  if (s.company.cash < academyFoundCost(s)) return `Founding it costs ${fmtMoney(academyFoundCost(s))}`;
  return null;
}

export const validTrack = (t: string): t is AcademyTrack => t === 'mixed' || (HIREABLE_ROLES as string[]).includes(t);

/** Whole years the school has been teaching (classes get stronger as it matures). */
export function academyYears(s: GameState): number {
  const a = s.company.academy;
  return a ? Math.max(0, Math.floor((s.day - a.since) / 365)) : 0;
}

/** Graduates in June's class. */
export function classSize(s: GameState): number {
  const a = s.company.academy;
  if (!a) return 0;
  return clamp(1 + a.funding * 2 + Math.floor(academyYears(s) / 4), 3, 9);
}

/** How much better than a typical junior the graduates are (skill points on their craft). */
export function gradBoost(s: GameState): number {
  const a = s.company.academy;
  if (!a) return 0;
  return 6 + a.funding * 5 + Math.min(10, academyYears(s) * 1.5);
}

export function foundAcademy(c: Ctx, track: AcademyTrack, funding: AcademyFunding): void {
  const { s } = c;
  spend(s, 'training', academyFoundCost(s));
  s.company.academy = { since: s.day, track, funding, grads: 0, hired: 0 };
  addRep(s, 1 * (1 - s.company.reputation / 130), 'Founded a games academy');
  pushNews(s, {
    category: 'studio',
    headline: `${s.company.name} opens the ${academyName(s)}`,
    body: `A school for the next generation of ${track === 'mixed' ? 'game makers' : `${ROLE_NAMES[track].toLowerCase()}s`}. The first class graduates next June${fromDay(s.day).month >= 6 ? ' (well, the June after)' : ''}.`,
    tone: 'good',
  });
}

export function closeAcademy(s: GameState): void {
  if (!s.company.academy) return;
  const name = academyName(s);
  const grads = s.company.academy.grads;
  delete s.company.academy;
  addRep(s, -(0.5), 'Closed the academy');
  pushNews(s, { category: 'studio', headline: `${s.company.name} closes the ${name}`, body: grads ? `${grads} students graduated while it was open.` : 'It never saw a graduation.', tone: 'bad' });
}

/** Monthly: pay the budget; in June, graduate this year's class into the hiring pool. */
export function academyMonthly(c: Ctx): void {
  const { s, rng } = c;
  const a = s.company.academy;
  if (!a) return;
  spend(s, 'training', academyBudget(s, a.funding));
  // a class needs a full school year: no graduation in the June right after opening
  if (fromDay(s.day).month !== 6 || s.day - a.since < 240) return;
  const n = classSize(s);
  const boost = gradBoost(s);
  const yr = fromDay(s.day).year;
  for (let i = 0; i < n; i++) {
    const role: Role = a.track === 'mixed' || rng.chance(0.2) ? rng.pick(HIREABLE_ROLES) : a.track;
    const cand = generateCandidate(s, rng, { role, quality: 0 });
    const [primary, secondary] = ROLE_SKILLS[role];
    // fresh graduates: taught well, not yet seasoned
    cand.skills[primary] = clamp(Math.round(Math.min(cand.skills[primary], 50) + boost), 20, 78);
    cand.skills[secondary] = clamp(Math.round(cand.skills[secondary] + boost * 0.5), 5, 65);
    for (const k of SKILLS) if (k !== primary && k !== secondary) cand.skills[k] = clamp(cand.skills[k] + Math.round(boost * 0.15), 1, 55);
    cand.level = levelFor(cand.skills[primary]);
    cand.potential = clamp(Math.round(cand.skills[primary] + 18 + a.funding * 3 + rng.range(0, 12)), cand.skills[primary], 100);
    cand.askSalary = Math.round((marketSalary(s, cand.skills) * GRAD_DISCOUNT) / 100) * 100;
    cand.salary = cand.askSalary;
    cand.expiresDay = s.day + GRAD_DAYS;
    cand.academy = yr;
    s.candidates.unshift(cand);
  }
  a.grads += n;
  s.progress.stats.academyGrads = (s.progress.stats.academyGrads ?? 0) + n;
  addRep(s, (0.3 + a.funding * 0.15) * (1 - s.company.reputation / 120), 'Academy graduation');
  pushNews(s, {
    category: 'staff',
    headline: `The ${academyName(s)} class of ${yr} graduates`,
    body: `${n} graduates are in your hiring pool for the next ${Math.round(GRAD_DAYS / 30)} months — high potential, asking a little under market rate, and loyal to the studio that trained them.`,
    tone: 'good',
  });
}
