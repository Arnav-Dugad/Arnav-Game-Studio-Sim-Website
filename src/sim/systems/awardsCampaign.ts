/**
 * Awards season: from September, pay for one "for your consideration" campaign a year — screenings for the jury,
 * ads in the trade press — behind one of this year's games. It nudges the jury (+2 when judging that game at the
 * Golden Pixel Gala), which can tip a close race, but it can't make a weak game win.
 */
import { fromDay } from '../calendar';
import type { GameState, Release } from '../types';
import { money, pushNews, spend } from '../util';

export const CAMPAIGN_BOOST = 2;
export const CAMPAIGN_MIN_SCORE = 78;
const CAMPAIGN_MONTH = 9;

export function campaignCost(s: GameState): number {
  return money(25_000, s.day);
}

/** This year's campaigned game, if any. */
export function campaignFor(s: GameState, year = fromDay(s.day).year): string | undefined {
  const c = s.company.awardsCampaign;
  return c && c.year === year ? c.releaseId : undefined;
}

export function campaignBlocked(s: GameState, r: Release): string | null {
  const d = fromDay(s.day);
  if (fromDay(r.day).year !== d.year) return 'Only this year’s games are up for this year’s awards';
  if (r.concept.remasterOf || r.concept.expansionOf) return 'Remasters and expansions aren’t eligible';
  if (r.score < CAMPAIGN_MIN_SCORE) return `Juries only take ${CAMPAIGN_MIN_SCORE}+ games seriously`;
  if (d.month < CAMPAIGN_MONTH) return 'Awards season starts in September';
  if (campaignFor(s)) return campaignFor(s) === r.id ? 'Already campaigning for it' : 'One campaign a year — you’re already backing another game';
  if (s.company.cash < campaignCost(s)) return 'Not enough cash';
  return null;
}

export function runCampaign(s: GameState, releaseId: string): string | null {
  const r = s.releases[releaseId];
  if (!r) return 'No such game';
  const why = campaignBlocked(s, r);
  if (why) return why;
  spend(s, 'marketing', campaignCost(s));
  s.company.awardsCampaign = { year: fromDay(s.day).year, releaseId };
  pushNews(s, { category: 'studio', headline: `${s.company.name} launches an awards campaign for ${r.name}`, body: 'Jury screenings, trade-press ads and a very nice gift basket. The Golden Pixel Gala is on New Year’s Day.', tone: 'neutral' });
  return null;
}

/** Extra weight with the jury for a game (0 unless campaigned for in its year). */
export function campaignBoost(s: GameState, releaseId: string, year: number): number {
  return campaignFor(s, year) === releaseId ? CAMPAIGN_BOOST : 0;
}
