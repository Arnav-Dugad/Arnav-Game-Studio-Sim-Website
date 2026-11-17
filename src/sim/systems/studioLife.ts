/**
 * Studio life: Employee of the Month (whoever contributed most last month) and the yearly team retreat.
 */
import { clamp } from '../breakdown';
import type { Ctx } from '../ctx';
import type { GameState } from '../types';
import { fmtMoney, money, pushNews, spend } from '../util';

export const RETREAT_COOLDOWN = 365;
export const RETREAT_COST_PER_HEAD = 400; // 1980 dollars
export const RETREAT_MORALE = { v: 7, days: 90 };
export const EOTM_MORALE = { v: 4, days: 30 };

/** Monthly: crown whoever contributed the most points since last month (needs 4+ staff). */
export function employeeOfTheMonth(c: Ctx): void {
  const { s } = c;
  const staff = Object.values(s.staff).filter((x) => x.role !== 'founder');
  let best: { id: string; pts: number } | null = null;
  for (const st of staff) {
    const pts = st.contributed - (st.contribMark ?? st.contributed);
    st.contribMark = st.contributed;
    if (pts > 0 && (!best || pts > best.pts)) best = { id: st.id, pts };
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
