/**
 * Launch bonuses: after a game ships, thank the people who made it — a cheque each. It costs real money (more for
 * a bigger hit), and buys a lasting lift in mood and loyalty for everyone credited who's still here. Once per game,
 * within two months of launch.
 */
import { clamp } from '../breakdown';
import type { GameState, Release, Staff } from '../types';
import { money, pushNews, spend } from '../util';

export const BONUS_WINDOW_DAYS = 60;

export function bonusTeam(s: GameState, r: Release): Staff[] {
  return (r.credits ?? []).map((c) => s.staff[c.id]).filter((x): x is Staff => !!x && x.role !== 'founder');
}

export function bonusCost(s: GameState, r: Release): number {
  const per = money(1_200, s.day) * (r.score >= 85 ? 2 : r.score >= 70 ? 1.5 : 1);
  return Math.round(per * bonusTeam(s, r).length);
}

export function bonusBlocked(s: GameState, r: Release): string | null {
  if (r.bonusPaid) return 'Bonuses already paid for this game';
  if (s.day - r.day > BONUS_WINDOW_DAYS) return 'It’s been too long since launch';
  if (!bonusTeam(s, r).length) return 'Nobody who made it is still here';
  if (s.company.cash < bonusCost(s, r)) return 'Not enough cash';
  return null;
}

export function payLaunchBonus(s: GameState, releaseId: string): string | null {
  const r = s.releases[releaseId];
  if (!r) return 'No such game';
  const why = bonusBlocked(s, r);
  if (why) return why;
  const team = bonusTeam(s, r);
  spend(s, 'salaries', bonusCost(s, r));
  r.bonusPaid = true;
  r.bonusDay = s.day;
  for (const st of team) {
    st.loyalty = clamp(st.loyalty + 4, 0, 100);
    if (st.mood && st.mood.until > s.day && st.mood.v < 0) st.mood = { ...st.mood, v: Math.min(0, st.mood.v + 3) };
    else if (!st.mood || st.mood.until <= s.day || st.mood.v < 6) st.mood = { v: 6, until: s.day + 90, label: 'Launch bonus' };
    st.moraleWhy = undefined;
  }
  pushNews(s, { category: 'staff', headline: `Launch bonuses for the ${r.name} team`, body: `${team.length} people who made ${r.name} find a cheque on their desk.`, tone: 'good' });
  return null;
}
