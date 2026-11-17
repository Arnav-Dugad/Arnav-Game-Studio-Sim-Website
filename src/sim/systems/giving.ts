/**
 * Giving back: a charity pledge (a share of each month's profit to good causes) gives people a sense of purpose
 * and slowly builds goodwill; open-sourcing an old in-house engine makes the community love you (and ends any
 * licensing income from it).
 */
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState } from '../types';
import { addRep, fmtMoney, pushNews, spend } from '../util';

export type CharityPledge = 0 | 1 | 5;
export const CHARITY_MORALE: Record<CharityPledge, number> = { 0: 0, 1: 1, 5: 3 };
export const OPEN_SOURCE_AGE_YEARS = 8;

/** Monthly (after the month closes): donate the pledged share of last month's profit. */
export function charityMonthly(c: Ctx): void {
  const { s } = c;
  const pct = Math.max(s.company.policies.charity ?? 0, s.company.charityOwed ?? 0);
  s.company.charityOwed = s.company.policies.charity ?? 0;
  if (!pct) return;
  const prev = s.finance.ledger[s.finance.ledger.length - 2];
  if (!prev) return;
  const income = Object.values(prev.income).reduce((t: number, v) => t + (v ?? 0), 0);
  const expense = Object.values(prev.expense).reduce((t: number, v) => t + (v ?? 0), 0);
  const profit = income - expense;
  if (profit <= 0) return;
  const gift = Math.round(profit * (pct / 100));
  if (gift <= 0) return;
  spend(s, 'other_expense', gift);
  s.progress.stats.donated = (s.progress.stats.donated ?? 0) + gift;
  // goodwill grows with how much it really is, relative to the studio's size
  addRep(s, Math.min(0.15, (gift / Math.max(1, income)) * 3) * (1 - s.company.reputation / 115), 'Charity giving');
  // a yearly note so the player sees it adding up
  if (fromDay(s.day).month === 1) pushNews(s, { category: 'studio', headline: `${s.company.name} has given ${fmtMoney(s.progress.stats.donated)} to charity`, body: 'Staff say it makes the work feel more meaningful.', tone: 'good' });
}

export function openSourceBlocked(s: GameState, engineId: string): string | null {
  const e = s.engines[engineId];
  if (!e || e.licensedFrom) return 'Only engines you built yourself';
  if (e.builtDay <= 0) return 'The starter engine isn’t yours to give away';
  if (e.openSourced) return 'Already open source';
  if (s.day - e.builtDay < OPEN_SOURCE_AGE_YEARS * 365) return `Engines can be open-sourced ${OPEN_SOURCE_AGE_YEARS} years after they’re built`;
  if (Object.values(s.projects).some((p) => p.kind === 'game' && p.concept.engineId === engineId)) return 'A game in development still uses it';
  return null;
}

export function openSourceEngine(s: GameState, engineId: string): string | null {
  const why = openSourceBlocked(s, engineId);
  if (why) return why;
  const e = s.engines[engineId]!;
  e.openSourced = true;
  e.licensees = 0; // nobody pays for what's free
  addRep(s, 2 * (1 - s.company.reputation / 130), `Open-sourced the ${e.name} engine`);
  for (const st of Object.values(s.staff)) if (st.role === 'programmer') st.morale = clamp(st.morale + 4, 0, 100);
  pushNews(s, { category: 'studio', headline: `${s.company.name} open-sources the ${e.name} engine`, body: 'Students, modders and indie developers are already digging into the code. The programmers are proud.', tone: 'good' });
  return null;
}
