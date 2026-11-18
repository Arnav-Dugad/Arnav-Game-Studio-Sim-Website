/**
 * Studio life: Employee of the Month (whoever contributed most last month) and the yearly team retreat.
 */
import { clamp } from '../breakdown';
import type { Ctx } from '../ctx';
import type { GameState, Staff } from '../types';
import { fromDay, toDay } from '../calendar';
import { menteeCounts } from './staff';
import { BEST_FRIENDS, relationsOf } from './relations';
import { fmtMoney, money, pushNews, spend } from '../util';

export const RETREAT_COOLDOWN = 365;
export const RETREAT_COST_PER_HEAD = 400; // 1980 dollars
export const RETREAT_MORALE = { v: 7, days: 90 };
export const EOTM_MORALE = { v: 4, days: 30 };

/** Monthly: crown whoever contributed the most points since last month (needs 4+ staff). */
export function employeeOfTheMonth(c: Ctx): void {
  const { s } = c;
  const staff = Object.values(s.staff).filter((x) => x.role !== 'founder' && !x.intern);
  let best: { id: string; pts: number } | null = null;
  const last = s.eotm?.id;
  for (const st of staff) {
    const raw = st.contributed - (st.contribMark ?? st.contributed);
    st.contribMark = st.contributed;
    // never twice in a row, and past wins weigh a little: the plaque goes around
    if (st.id === last) continue;
    const pts = raw / (1 + 0.15 * (st.eotmCount ?? 0));
    if (raw > 0 && (!best || pts > best.pts)) best = { id: st.id, pts };
  }
  if (!best || staff.length < 4) {
    s.eotm = undefined;
    return;
  }
  const st = s.staff[best.id]!;
  st.eotmCount = (st.eotmCount ?? 0) + 1;
  s.eotm = { id: st.id, day: s.day };
  st.loyalty = clamp(st.loyalty + 3, 0, 100);
  // a small glow, unless a bigger personal moment is already playing out
  if (!st.mood || st.mood.until <= s.day) st.mood = { v: EOTM_MORALE.v, until: s.day + EOTM_MORALE.days, label: 'Employee of the Month' };
  st.moraleWhy = undefined;
  if (staff.length <= 60) pushNews(s, { category: 'staff', headline: `Employee of the Month: ${st.name}`, body: st.eotmCount > 1 ? `Their ${st.eotmCount}${st.eotmCount === 2 ? 'nd' : st.eotmCount === 3 ? 'rd' : 'th'} time.` : undefined, tone: 'good' });
}

export function retreatCost(s: GameState): number {
  return money(RETREAT_COST_PER_HEAD, s.day) * Object.keys(s.staff).length;
}

export function retreatBlocked(s: GameState): string | null {
  const n = Object.keys(s.staff).length;
  if (n < 3) return 'Hire a few people first';
  if (s.company.lastRetreatDay !== undefined && s.day - s.company.lastRetreatDay < RETREAT_COOLDOWN) return `Next retreat in ${RETREAT_COOLDOWN - (s.day - s.company.lastRetreatDay)} days`;
  if (s.company.cash < retreatCost(s)) return `Need ${fmtMoney(retreatCost(s))}`;
  return null;
}

/** A few days away together: morale, rested people, and closer bonds. */
export function teamRetreat(s: GameState): string | null {
  const why = retreatBlocked(s);
  if (why) return why;
  spend(s, 'other_expense', retreatCost(s));
  s.company.lastRetreatDay = s.day;
  s.company.moraleMods.push({ v: RETREAT_MORALE.v, until: s.day + RETREAT_MORALE.days, label: 'Team retreat' });
  for (const st of Object.values(s.staff)) {
    st.energy = 100;
    st.burnout = clamp(st.burnout - 15, 0, 100);
    st.moraleWhy = undefined;
  }
  for (const k of Object.keys(s.relations ?? {})) s.relations![k] = clamp(s.relations![k]! + 8, -100, 100);
  pushNews(s, { category: 'studio', headline: `${s.company.name} takes the team on a retreat`, body: 'Workshops by day, campfire stories by night.', tone: 'good' });
  return null;
}

/** The in-house Studio Awards (December): MVP, Rookie of the Year, Mentor of the Year, Heart of the Studio. */
export function studioAwards(c: Ctx): void {
  const { s } = c;
  const year = fromDay(s.day).year;
  const staff = Object.values(s.staff).filter((x) => !x.intern);
  if (staff.length < 5) {
    for (const st of staff) st.yearMark = st.contributed;
    return;
  }
  const startOfYear = toDay(year, 1, 1);
  const contrib = (st: Staff) => st.contributed - (st.yearMark ?? st.contribMark ?? st.contributed); // older saves: no mark yet
  const winners: { category: string; id: string; name: string }[] = [];
  const crown = (category: string, st: Staff | undefined) => {
    if (!st) return;
    winners.push({ category, id: st.id, name: st.name });
    st.honours = [...(st.honours ?? []), `${category} ${year}`].slice(-8);
    st.loyalty = clamp(st.loyalty + 8, 0, 100);
    if (!st.mood || st.mood.until <= s.day || (st.mood.v >= 0 && st.mood.v < 6)) st.mood = { v: 6, until: s.day + 60, label: `Won ${category}` };
  };
  const pool = staff.filter((x) => x.role !== 'founder');
  crown('MVP', [...pool].sort((a, b) => contrib(b) - contrib(a))[0]);
  crown('Rookie of the Year', pool.filter((x) => x.hiredDay >= startOfYear && !winners.some((w) => w.id === x.id)).sort((a, b) => contrib(b) - contrib(a))[0]);
  const mentees = menteeCounts(s);
  const mentor = [...staff].filter((x) => (mentees.get(x.id) ?? 0) > 0).sort((a, b) => (mentees.get(b.id) ?? 0) - (mentees.get(a.id) ?? 0))[0];
  crown('Mentor of the Year', mentor);
  const friends = (st: Staff) => relationsOf(s, st.id).filter((r) => r.v >= BEST_FRIENDS).length;
  const heart = [...pool].filter((x) => friends(x) > 0 && !winners.some((w) => w.id === x.id)).sort((a, b) => friends(b) - friends(a))[0];
  crown('Heart of the Studio', heart);
  for (const st of staff) st.yearMark = st.contributed;
  if (!winners.length) return;
  s.company.moraleMods.push({ v: 2, until: s.day + 14, label: 'Studio Awards night' });
  s.studioAwards = [...(s.studioAwards ?? []), { year, day: s.day, winners }].slice(-20);
  pushNews(s, { category: 'staff', headline: `${s.company.name} Studio Awards ${year}`, body: winners.map((w) => `${w.category}: ${w.name}`).join(' · '), tone: 'good' });
}
