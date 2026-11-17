/**
 * Crowdfunding campaigns (2012+): pitch a self-published game to your fans for 30 days, all or nothing. Pledges
 * pour in on day one, sag through the middle and spike at the end; the goal you pick trades certainty for buzz.
 * Funded campaigns pay out (minus fees), turn backers into fans and unlock stretch goals — more content that also
 * means more polish time. Backers are promised a delivery date, and they remember whether you kept it.
 */
import { clamp } from '../breakdown';
import type { Ctx } from '../ctx';
import type { GameProject, GameState } from '../types';
import { addRep, earn, fmtMoney, hasFlag, money, pushNews, spend } from '../util';
import { formatDate } from '../calendar';
import { gameQuality, qualityToScore } from './dev';

export const CAMPAIGN_DAYS = 30;
export type CampaignTier = 'modest' | 'ambitious' | 'moonshot';
export const TIERS: Record<CampaignTier, { goal: number; pull: number; hype: number; label: string }> = {
  modest: { goal: 0.55, pull: 0.9, hype: 0.2, label: 'Modest' },
  ambitious: { goal: 0.95, pull: 1, hype: 0.35, label: 'Ambitious' },
  moonshot: { goal: 1.6, pull: 1.15, hype: 0.6, label: 'Moonshot' },
};
/** Funding multiples that unlock each stretch goal. */
export const STRETCH = [1.5, 2, 3];
export const STRETCH_NAMES = ['Orchestral soundtrack', 'Extra chapter', 'Mod tools & level editor'];
/** Each stretch goal: a little more quality, and the polish time to deliver it. */
export const STRETCH_QUALITY = 0.015;
export const STRETCH_DAYS = 10;
const FEES = 0.9;
/** Grace beyond the planned date when backers are promised delivery. */
const PROMISE_GRACE = 45;

// share of the pledges on each day: a big launch, a long sag, a final rush
const CURVE = (() => {
  const w = Array.from({ length: CAMPAIGN_DAYS }, (_, d) => (d === 0 ? 0.14 : d === 1 ? 0.08 : d === 2 ? 0.05 : d === CAMPAIGN_DAYS - 1 ? 0.1 : d === CAMPAIGN_DAYS - 2 ? 0.06 : 0.022));
  const t = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / t);
})();

export function pledgeSize(s: GameState): number {
  return money(14, s.day); // about $35 in 2012
}

/** Calendar days left on the plan (phases, then polish). */
export function scheduledDaysLeft(p: GameProject): number {
  if (p.phase >= 3) return p.extraDays;
  let d = p.phaseDays[p.phase as 0 | 1 | 2] - p.phaseDay;
  for (let i = p.phase + 1; i < 3; i++) d += p.phaseDays[i as 0 | 1 | 2];
  return d + p.extraDays;
}

/** What the campaign should raise on a typical run (before the goal's pull and luck). */
export function expectedPledges(s: GameState, p: GameProject): number {
  const fr = p.concept.franchiseId ? s.franchises[p.concept.franchiseId] : undefined;
  const pitch = clamp((qualityToScore(gameQuality(s, p, true).total) - 45) / 30, 0.3, 1.4);
  const backers = (300 + s.company.fans * 0.012 + (fr?.fans ?? 0) * 0.03) * (0.5 + 0.5 * Math.min(2, p.hype)) * (0.6 + s.company.reputation / 100) * pitch;
  return Math.round(backers * pledgeSize(s));
}

export function campaignGoal(s: GameState, p: GameProject, tier: CampaignTier): number {
  const g = expectedPledges(s, p) * TIERS[tier].goal;
  const step = g > 1_000_000 ? 50_000 : g > 100_000 ? 5_000 : 1_000;
  return Math.max(step, Math.round(g / step) * step);
}

export function campaignCost(s: GameState): number {
  return money(1_500, s.day); // the pitch video
}

export function crowdfundBlocked(s: GameState, p: GameProject): string | null {
  if (!hasFlag(s, 'crowdfunding')) return 'Crowdfunding takes off in 2012';
  if (p.crowdfund) return p.crowdfund.end === undefined ? 'The campaign is running' : 'Already crowdfunded';
  if (p.concept.deal) return 'It’s already funded by a publisher';
  if (p.concept.remasterOf || p.concept.expansionOf) return 'Backers want brand-new games';
  if (p.phase > 1) return 'Pitch it before polish';
  if (scheduledDaysLeft(p) < CAMPAIGN_DAYS + 15) return 'Too close to launch for a 30-day campaign';
  if (s.company.cash < campaignCost(s)) return `Needs ${fmtMoney(campaignCost(s))} for the pitch video`;
  return null;
}

export function startCrowdfund(c: Ctx, p: GameProject, tier: CampaignTier): string | null {
  const { s, rng } = c;
  if (!TIERS[tier]) return 'Pick a goal';
  const why = crowdfundBlocked(s, p);
  if (why) return why;
  spend(s, 'marketing', campaignCost(s));
  if (p.announcedDay === undefined) p.announcedDay = s.day;
  const goal = campaignGoal(s, p, tier);
  // how the pitch lands is luck: a lognormal around the expectation
  const luck = Math.exp(rng.normal(0, 0.35));
  p.crowdfund = { day: s.day, tier, goal, raised: 0, backers: 0, target: Math.round(expectedPledges(s, p) * TIERS[tier].pull * luck), stretch: 0 };
  pushNews(s, { category: 'studio', headline: `${p.concept.name} launches a crowdfunding campaign`, body: `${s.company.name} asks fans for ${fmtMoney(goal)} in ${CAMPAIGN_DAYS} days — all or nothing.`, tone: 'neutral' });
  return null;
}

/** Daily: pledges come in; on day 30 the campaign settles. */
export function crowdfundDaily(c: Ctx): void {
  const { s, rng } = c;
  for (const p of Object.values(s.projects)) {
    if (p.kind !== 'game' || !p.crowdfund || p.crowdfund.end !== undefined) continue;
    const cf = p.crowdfund;
    const d = s.day - cf.day - 1;
    if (d < 0) continue;
    if (d < CAMPAIGN_DAYS) {
      let today = cf.target * CURVE[d]! * (0.85 + rng.next() * 0.3);
      if (cf.raised >= cf.goal) today *= 1.2; // "Funded!" brings in the fence-sitters
      const before = cf.raised;
      cf.raised = Math.round(cf.raised + today);
      cf.backers += Math.max(0, Math.round(today / pledgeSize(s)));
      if (before < cf.goal && cf.raised >= cf.goal) pushNews(s, { category: 'studio', headline: `${p.concept.name} is funded!`, body: `${cf.backers.toLocaleString('en-US')} backers hit the ${fmtMoney(cf.goal)} goal with ${CAMPAIGN_DAYS - d - 1} days to go.`, tone: 'good' });
      while (cf.stretch < STRETCH.length && cf.raised >= cf.goal * STRETCH[cf.stretch]!) {
        p.extraDays += STRETCH_DAYS;
        pushNews(s, { category: 'studio', headline: `Stretch goal unlocked: ${STRETCH_NAMES[cf.stretch]}`, body: `${p.concept.name} passes ${Math.round(STRETCH[cf.stretch]! * 100)}% of its goal. Delivering it means ${STRETCH_DAYS} more days of polish.`, tone: 'good' });
        cf.stretch++;
      }
    }
    if (d >= CAMPAIGN_DAYS - 1) settle(c, p);
  }
}

function settle(c: Ctx, p: GameProject): void {
  const { s } = c;
  const cf = p.crowdfund!;
  cf.end = s.day;
  if (cf.raised >= cf.goal) {
    cf.success = true;
    earn(s, 'other_income', cf.raised * FEES);
    c.out.push({ type: 'income', amount: cf.raised * FEES, source: 'other' });
    p.hype = Math.min(3, p.hype + TIERS[cf.tier].hype);
    s.company.fans += Math.round(cf.backers * 0.8);
    cf.promised = s.day + scheduledDaysLeft(p) + PROMISE_GRACE;
    addRep(s, cf.tier === 'moonshot' ? 2 : 1, 'Crowdfunding success');
    s.progress.stats.crowdfunded = (s.progress.stats.crowdfunded ?? 0) + Math.round(cf.raised);
    const n = pushNews(s, { category: 'studio', headline: `${p.concept.name} raises ${fmtMoney(cf.raised)} from ${cf.backers.toLocaleString('en-US')} backers`, body: `${Math.round((cf.raised / cf.goal) * 100)}% funded. Backers are promised the game by ${formatDate(cf.promised)}.`, tone: 'good' });
    if (cf.tier === 'moonshot' || cf.raised >= cf.goal * 3) c.out.push({ type: 'news', newsId: n.id, major: true });
  } else {
    cf.success = false;
    addRep(s, -1.5, 'Crowdfunding fell short');
    p.hype = Math.max(0, p.hype - 0.1);
    s.company.moraleMods.push({ v: -2, until: s.day + 30, label: 'Campaign fell short' });
    pushNews(s, { category: 'studio', headline: `${p.concept.name}’s campaign falls short`, body: `${fmtMoney(cf.raised)} of ${fmtMoney(cf.goal)} (${Math.round((cf.raised / cf.goal) * 100)}%). Nobody is charged; the team is gutted.`, tone: 'bad' });
  }
}

