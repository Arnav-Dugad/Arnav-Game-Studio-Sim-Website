/**
 * Staff ambitions: now and then someone forms a personal goal — make a game in a genre they love, ship a
 * hit, get a raise, do research, master their craft, get a better desk, take a proper holiday, ship their
 * first game. Each has a deadline. Fulfil it and they're happier and far more loyal; let it lapse and
 * they feel ignored.
 */
import { GENRES, GENRE_BY_ID } from '../../data/genres';
import type { GenreId } from '../../data/types';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { Ambition, GameState, Staff } from '../types';

export type { Ambition, AmbitionKind } from '../types';
import { clamp } from '../breakdown';
import { pushNews } from '../util';
import { ROLE_SKILLS, hasTrait, marketSalary } from './staff';


export const AMBITION_REWARD = { loyalty: 15, morale: 7, moraleDays: 120 };
export const AMBITION_PENALTY = { loyalty: -10, morale: -5, moraleDays: 75 };
const RESEARCH_DAYS = 30;

/** Short description of what they want. */
export function ambitionText(st: Staff, a: Ambition): string {
  switch (a.kind) {
    case 'genre':
      return `Ship a ${GENRE_BY_ID[a.genre!]?.name ?? 'new'} game`;
    case 'hit':
      return 'Ship a game that scores 80+';
    case 'first':
      return 'Ship their first game';
    case 'raise':
      return `A raise to ${Math.round(a.target! / 1000)}k a year`;
    case 'research':
      return `Spend a month on research (${Math.min(RESEARCH_DAYS, Math.round(a.progress ?? 0))}/${RESEARCH_DAYS} days)`;
    case 'skill':
      return `Reach ${a.target} ${a.skill} (now ${Math.round(st.skills[a.skill!])})`;
    case 'desk':
      return 'A better desk';
    case 'holiday':
      return 'Take a proper holiday';
  }
}

/** The ambition as a verb phrase ("…wanted to ship a racing game"), without progress numbers. */
export function ambitionGoal(a: Ambition): string {
  switch (a.kind) {
    case 'genre':
      return `ship a ${GENRE_BY_ID[a.genre!]?.name ?? 'new'} game`;
    case 'hit':
      return 'ship a game that scores 80+';
    case 'first':
      return 'ship their first game';
    case 'raise':
      return `get a raise to ${Math.round(a.target! / 1000)}k a year`;
    case 'research':
      return 'spend a month on research';
    case 'skill':
      return `reach ${a.target} ${a.skill}`;
    case 'desk':
      return 'get a better desk';
    case 'holiday':
      return 'take a proper holiday';
  }
}

/** How the player can help, for the UI. */
export function ambitionHint(a: Ambition): string {
  switch (a.kind) {
    case 'genre':
      return `Put them on a ${GENRE_BY_ID[a.genre!]?.name ?? ''} game that ships before the deadline.`;
    case 'hit':
      return 'Put them on your strongest project.';
    case 'first':
      return 'Put them on a project that ships soon.';
    case 'raise':
      return 'Raise their salary on their staff card.';
    case 'research':
      return 'Assign them to research.';
    case 'skill':
      return 'Send them on training, or keep them working in their craft.';
    case 'desk':
      return 'No longer needed.';
    case 'holiday':
      return 'Send them on vacation.';
  }
}



function setMood(s: GameState, st: Staff, v: number, days: number, label: string): void {
  st.mood = { v, until: s.day + days, label };
  st.moraleWhy = undefined;
}

function fulfil(c: Ctx, st: Staff, why: string): void {
  const { s } = c;
  if (st.ambition?.kind === 'raise') st.promise = { salary: st.ambition.target ?? st.salary, until: s.day + 365 };
  st.ambition = undefined;
  st.loyalty = clamp(st.loyalty + AMBITION_REWARD.loyalty, 0, 100);
  setMood(s, st, AMBITION_REWARD.morale, AMBITION_REWARD.moraleDays, 'Dream come true');
  st.dreamsMet = (st.dreamsMet ?? 0) + 1;
  s.progress.stats.dreamsMet = (s.progress.stats.dreamsMet ?? 0) + 1;
  c.out.push({ type: 'toast', text: `${st.name} achieved an ambition: ${why}`, tone: 'good' });
}

function lapse(c: Ctx, st: Staff, a: Ambition): void {
  const { s } = c;
  st.ambition = undefined;
  st.loyalty = clamp(st.loyalty + AMBITION_PENALTY.loyalty, 0, 100);
  setMood(s, st, AMBITION_PENALTY.morale, AMBITION_PENALTY.moraleDays, 'Ambition ignored');
  pushNews(s, { category: 'staff', headline: `${st.name} feels overlooked`, body: `They wanted to ${ambitionGoal(a)}, and it never happened.`, tone: 'bad' });
}

/** Called for each team member when a game ships. */
export function ambitionOnShip(c: Ctx, st: Staff, score: number, genre: GenreId): void {
  const a = st.ambition;
  if (!a) return;
  if (a.kind === 'first') fulfil(c, st, 'shipped their first game');
  else if (a.kind === 'genre' && a.genre === genre) fulfil(c, st, `made a ${GENRE_BY_ID[genre].name} game`);
  else if (a.kind === 'hit' && score >= 80) fulfil(c, st, `shipped a ${score}`);
}

/** Pick a new ambition that suits this person (or nothing). */
function newAmbition(c: Ctx, st: Staff): Ambition | null {
  const { s, rng } = c;
  const yr = fromDay(s.day).year;
  const until = s.day + rng.int(200, 330);
  const opts: { w: number; make: () => Ambition | null }[] = [];
  const genres = GENRES.filter((g) => g.year <= yr && (!g.research || s.research.done.includes(g.research)));
  if (genres.length) opts.push({ w: hasTrait(st, 'visionary') ? 4 : 2.5, make: () => ({ kind: 'genre', since: s.day, until, genre: genres[Math.floor(rng.next() * genres.length)]!.id }) });
  if (st.gamesShipped === 0) opts.push({ w: 4, make: () => ({ kind: 'first', since: s.day, until }) });
  if (st.level !== 'junior' && s.releaseOrder.length > 0) opts.push({ w: hasTrait(st, 'perfectionist') ? 3 : 1.5, make: () => ({ kind: 'hit', since: s.day, until: until + 120 }) });
  const market = marketSalary(s, st.skills);
  if (st.salary < market * 1.1) opts.push({ w: hasTrait(st, 'ambitious') ? 4 : 1.5, make: () => ({ kind: 'raise', since: s.day, until: s.day + rng.int(90, 160), target: Math.round(Math.max(st.salary * 1.08, market * 1.02) / 1000) * 1000 }) });
  if (st.assignment.kind !== 'research') opts.push({ w: hasTrait(st, 'visionary') ? 2 : 1, make: () => ({ kind: 'research', since: s.day, until, progress: 0 }) });
  const [primary] = ROLE_SKILLS[st.role] ?? [];
  if (primary && st.skills[primary] < Math.min(98, st.potential - 3)) opts.push({ w: 2, make: () => ({ kind: 'skill', since: s.day, until, skill: primary, target: Math.min(100, Math.round(st.skills[primary] + 6)) }) });
  if (st.burnout > 35 && (st.lastVacationDay === undefined || s.day - st.lastVacationDay > 200)) opts.push({ w: 3, make: () => ({ kind: 'holiday', since: s.day, until: s.day + rng.int(60, 120) }) });
  const total = opts.reduce((t, o) => t + o.w, 0);
  let r = rng.next() * total;
  for (const o of opts) {
    r -= o.w;
    if (r <= 0) return o.make();
  }
  return null;
}

/** Daily: research days count only while actually on research. */
export function ambitionsDaily(s: GameState): void {
  for (const st of Object.values(s.staff)) if (st.ambition?.kind === 'research' && st.assignment.kind === 'research') st.ambition.progress = (st.ambition.progress ?? 0) + 1;
}

/** Weekly: progress, fulfil, lapse, broken promises, and new ambitions. */
export function ambitionsWeekly(c: Ctx): void {
  const { s, rng } = c;
  const staff = Object.values(s.staff).filter((st) => st.role !== 'founder');
  for (const st of staff) {
    const pr = st.promise;
    if (!pr) continue;
    if (s.day > pr.until) st.promise = undefined;
    else if (st.salary < pr.salary - 1) {
      st.promise = undefined;
      st.loyalty = clamp(st.loyalty - 20, 0, 100);
      setMood(s, st, -8, 120, 'Raise taken back');
      pushNews(s, { category: 'staff', headline: `${st.name} feels betrayed`, body: 'Their promised raise was quietly reversed.', tone: 'bad' });
    }
  }
  for (const st of staff) {
    const a = st.ambition;
    if (!a) continue;
    // Desk ambitions are retired (staff can't be moved to a chosen desk): drop them quietly.
    if (a.kind === 'desk') {
      st.ambition = undefined;
      continue;
    }
    const met =
      (a.kind === 'raise' && st.salary >= (a.target ?? Infinity)) ||
      (a.kind === 'research' && (a.progress ?? 0) >= RESEARCH_DAYS) ||
      (a.kind === 'skill' && st.skills[a.skill!] >= (a.target ?? Infinity)) ||
      (a.kind === 'holiday' && st.lastVacationDay !== undefined && st.lastVacationDay >= a.since);
    if (met) fulfil(c, st, ambitionText(st, a).replace(/ \(.*\)$/, '').replace(/^./, (x) => x.toLowerCase()));
    else if (s.day > a.until) lapse(c, st, a);
  }
  // New ambitions: a few at a time, so even a big studio can keep up.
  const active = staff.filter((st) => st.ambition).length;
  const cap = Math.max(2, Math.round(staff.length * 0.15));
  if (active >= cap) return;
  for (const st of staff) {
    if (st.ambition || s.day - st.hiredDay < 60 || (st.ambitionCooldown ?? 0) > s.day) continue;
    if (!rng.chance(1 / 45)) continue;
    const a = newAmbition(c, st);
    if (!a) continue;
    st.ambition = a;
    st.ambitionCooldown = a.until + 90;
    if (staff.filter((x) => x.ambition).length >= cap) break;
  }
}
