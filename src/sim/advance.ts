/**
 * The fixed-step simulation loop: 1 tick = 1 day. Subsystems run at their own cadence.
 */
import { BALANCE } from '../data/balance';
import { fromDay, toDay, weekday } from './calendar';
import type { Ctx, SimEvent } from './ctx';
import { Rng } from './rng';
import { checkAchievements } from './systems/achievements';
import { updateProjectsDaily } from './systems/dev';
import { expireEvents, rollRandomEvent } from './systems/events';
import { financeMonthly, quarterlyEarnings, solvencyCheck, stockWeekly, valuation, yearlyTaxes } from './systems/finance';
import { processHistory, updateFuturePlatforms, updateMarketMonthly } from './systems/market';
import { refreshOffers } from './systems/offers';
import { updateLiveMonthly, updateSalesWeekly, yearlyAwards } from './systems/release';
import { updateResearchDaily } from './systems/research';
import { rivalScheduledReleases, rivalsHistory, rivalsMonthly } from './systems/rivals';
import { refreshCandidates, updateStaffDaily, updateStaffMonthly } from './systems/staff';
import { subsidiariesMonthly } from './systems/subsidiaries';
import type { GameState } from './types';
import { clamp } from './breakdown';
import { pushNews } from './util';

export const STORY_END_DAY = toDay(2027, 1, 1);

function trainingDaily(s: GameState): void {
  for (const st of Object.values(s.staff)) {
    if (st.assignment.kind !== 'training' || !st.trainingSkill) continue;
    if (weekday(s.day) >= 5) continue;
    st.trainingDaysLeft = (st.trainingDaysLeft ?? 0) - 1;
    if (st.trainingDaysLeft <= 0) {
      const k = st.trainingSkill;
      const cap = Math.min(100, st.potential + 5);
      st.skills[k] = Math.min(cap, st.skills[k] + 8 * (1 - st.skills[k] / 110));
      st.potential = Math.max(st.potential, Math.min(100, st.potential + 1));
      st.assignment = { kind: 'idle' };
      delete st.trainingSkill;
      delete st.trainingDaysLeft;
      pushNews(s, { category: 'staff', headline: `${st.name} completed ${k} training`, tone: 'good' });
    }
  }
}

function hypeWeekly(s: GameState): void {
  for (const p of Object.values(s.projects)) {
    if (p.kind !== 'game') continue;
    p.hype = Math.max(0, p.hype * (1 - BALANCE.HYPE_DECAY_WEEKLY));
  }
}

/** Advance one day. */
export function tick(c: Ctx): void {
  const { s } = c;
  if (s.status !== 'running') return;
  s.day += 1;
  const d = fromDay(s.day);
  processHistory(c);
  const cursor = { i: s.market.scheduleIndex };
  rivalScheduledReleases(c, cursor);
  s.market.scheduleIndex = cursor.i;

  if (d.day === 1) {
    if (d.month === 1) {
      yearlyTaxes(c);
      updateFuturePlatforms(c);
      c.out.push({ type: 'year', year: d.year });
    }
    financeMonthly(c);
    if (s.status !== 'running') return;
    rivalsHistory(c);
    updateMarketMonthly(c);
    rivalsMonthly(c);
    subsidiariesMonthly(c);
    updateLiveMonthly(c);
    updateStaffMonthly(c);
    refreshCandidates(c);
    refreshOffers(c);
    if (d.month % 3 === 1) quarterlyEarnings(c);
    s.progress.stats.peakCash = Math.max(s.progress.stats.peakCash, s.company.cash);
    const v = valuation(s);
    if (v > s.progress.stats.peakValuation) s.progress.stats.peakValuation = v;
    // reputation slowly decays toward a floor without new releases (attention economy)
    const lastRel = s.releaseOrder.length ? s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]!.day : -1e9;
    if (s.day - lastRel > 270) s.company.reputation = clamp(s.company.reputation - 0.15, 0, 100);
    checkAchievements(c);
    c.out.push({ type: 'month', day: s.day });
  }
  if (d.month === 12 && d.day === 15) yearlyAwards(c);

  updateStaffDaily(c);
  trainingDaily(s);
  updateProjectsDaily(c);
  updateResearchDaily(c);

  if (weekday(s.day) === 0) {
    updateSalesWeekly(c);
    stockWeekly(c);
    hypeWeekly(s);
    expireEvents(c);
    rollRandomEvent(c);
  }
  if (s.company.cash < 0 || s.company.insolventSince !== undefined) solvencyCheck(c);

  if (!s.settings.endless && s.day >= STORY_END_DAY && s.status === 'running') {
    s.status = 'retired';
    s.endReason = 'The story reaches the present day. Continue in endless mode or retire to the Hall of Fame.';
    c.out.push({ type: 'gameOver', reason: s.endReason });
  }
}

/** Advance `days` days. Returns the UI events emitted. Stops early if the game ends. */
export function advance(s: GameState, days: number): SimEvent[] {
  const rng = new Rng(s.rng);
  const c: Ctx = { s, rng, out: [] };
  for (let i = 0; i < days && s.status === 'running'; i++) tick(c);
  s.rng = rng.state;
  return c.out;
}
