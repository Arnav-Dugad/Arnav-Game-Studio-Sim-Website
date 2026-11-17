/**
 * The fixed-step simulation loop: 1 tick = 1 day. Subsystems run at their own cadence.
 */
import { charityMonthly } from './systems/giving';
import { partnersMonthly } from './systems/partners';
import { internsArrive, internsLeave } from './systems/interns';
import { hallOfClassics } from './systems/classics';
import { mediaMonthly } from './systems/media';
import { takeYearbookPhoto } from './systems/yearbook';
import { fanMailMonthly } from './systems/fanMail';
import { crowdfundDaily } from './systems/crowdfunding';
import { lifeEventsMonthly } from './systems/lifeEvents';
import { earlyAccessWeekly } from './systems/earlyAccess';
import { objectivesDaily, objectivesQuarterly } from './systems/objectives';
import { scenarioMonthly } from './systems/scenarios';
import { employeeOfTheMonth } from './systems/studioLife';
import { relationsWeekly } from './systems/relations';
import { ambitionsDaily, ambitionsWeekly } from './systems/ambitions';
import { BALANCE } from '../data/balance';
import { fromDay, toDay, weekday } from './calendar';
import type { Ctx, SimEvent } from './ctx';
import { Rng } from './rng';
import { checkAchievements } from './systems/achievements';
import { updateProjectsDaily } from './systems/dev';
import { expireEvents, fireEvent, rollRandomEvent } from './systems/events';
import { hardwareMonthly } from './systems/hardware';
import { subscriptionMonthly } from './systems/subscription';
import { cheatsDaily } from './cheats';
import { decadeReview } from './systems/decade';
import { esportsMonthly } from './systems/esports';
import { publishingMonthly } from './systems/publishing';
import { financeMonthly, ownerValue, quarterlyEarnings, solvencyCheck, stockWeekly, yearlyTaxes } from './systems/finance';
import { processHistory, updateFuturePlatforms, updateMarketMonthly } from './systems/market';
import { refreshOffers } from './systems/offers';
import { updateLiveMonthly, updateSalesWeekly, yearlyAwards } from './systems/release';
import { autoQueueResearch, updateResearchDaily } from './systems/research';
import { rivalScheduledReleases, rivalsHistory, rivalsMonthly } from './systems/rivals';
import { refreshCandidates, staffAutomationWeekly, updateStaffDaily, updateStaffMonthly } from './systems/staff';
import { subsidiariesMonthly } from './systems/subsidiaries';
import type { GameState } from './types';
import { addRep, pushNews } from './util';

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
    financeMonthly(c); // closes the previous month first
    if (s.status !== 'running') return;
    if (d.month === 1) {
      yearlyTaxes(c);
      yearlyAwards(c, d.year - 1); // the ceremony covers every release of last year, December included
      takeYearbookPhoto(s, d.year - 1);
      hallOfClassics(c, d.year);
      if (d.year % 10 === 0) decadeReview(c, d.year - 10);
      updateFuturePlatforms(c);
      // studio anniversaries every five years
      const age = d.year - s.settings.startYear;
      if (age > 0 && age % 5 === 0) {
        s.company.moraleMods.push({ v: 4, until: s.day + 60, label: `${age}th anniversary` });
        const n = pushNews(s, { category: 'studio', headline: `${s.company.name} turns ${age}`, body: `${s.releaseOrder.length} games and ${Object.keys(s.staff).length} people later, the studio celebrates ${age} years.`, tone: 'good' });
        c.out.push({ type: 'news', newsId: n.id, major: age % 25 === 0 });
      }
      c.out.push({ type: 'year', year: d.year });
    }
    // franchise fatigue fades over time
    const fade = Math.exp(-1 / (BALANCE.FATIGUE_DECAY_YEARS * 12));
    for (const f of Object.values(s.franchises)) f.fatigue *= fade;
    rivalsHistory(c);
    hardwareMonthly(c);
    updateMarketMonthly(c);
    rivalsMonthly(c);
    subsidiariesMonthly(c);
    updateLiveMonthly(c);
    subscriptionMonthly(c);
    esportsMonthly(c);
    publishingMonthly(c);
    updateStaffMonthly(c);
    employeeOfTheMonth(c);
    lifeEventsMonthly(c);
    fanMailMonthly(c);
    mediaMonthly(c);
    partnersMonthly(s);
    charityMonthly(c);
    if (d.month === 6) internsArrive(c);
    if (d.month === 9) internsLeave(c, () => fireEvent(c, 'intern_offer'));
    refreshCandidates(c);
    refreshOffers(c);
    if (d.month % 3 === 1) quarterlyEarnings(c);
    if (d.month % 3 === 1) objectivesQuarterly(c);
    if (d.month === 5 && s.finance.stock && s.day - s.finance.stock.ipoDay > 300) fireEvent(c, 'agm');
    s.progress.stats.peakCash = Math.max(s.progress.stats.peakCash, s.company.cash);
    const v = ownerValue(s);
    if (v > s.progress.stats.peakValuation) s.progress.stats.peakValuation = v;
    // reputation slowly decays toward a floor without new releases (attention economy)
    const lastRel = s.releaseOrder.length ? s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]!.day : -1e9;
    if (s.day - lastRel > 270) addRep(s, -(0.15), 'Quiet spell (no recent releases)');
    checkAchievements(c);
    c.out.push({ type: 'month', day: s.day });
    scenarioMonthly(c);
  }

  updateStaffDaily(c);
  objectivesDaily(c);
  if (s.progress.stats.crunchRecent) s.progress.stats.crunchRecent *= 0.985; // ~two-month memory
  ambitionsDaily(s);
  trainingDaily(s);
  crowdfundDaily(c); // before projects: a campaign settles before its game can ship that day
  updateProjectsDaily(c);
  updateResearchDaily(c);
  cheatsDaily(s);

  if (weekday(s.day) === 0) {
    staffAutomationWeekly(s);
    ambitionsWeekly(c);
    if (relationsWeekly(c) && !s.cheats?.noEvents) fireEvent(c, 'feud');
    autoQueueResearch(s);
    updateSalesWeekly(c);
    earlyAccessWeekly(c);
    stockWeekly(c);
    hypeWeekly(s);
    expireEvents(c);
    if (!s.cheats?.noEvents) rollRandomEvent(c);
  }
  if ((s.company.cash < 0 || s.company.insolventSince !== undefined) && !s.cheats?.noBankruptcy && !s.cheats?.infiniteMoney) solvencyCheck(c);

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
