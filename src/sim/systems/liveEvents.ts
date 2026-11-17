/**
 * Live events for live games (subscription, free-to-play, live service): a seasonal in-game event costs
 * about a month's live income and lifts it for three months — more for a well-loved game, a little less
 * each time players have seen one recently.
 */
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { GameState, Release } from '../types';
import { fmtMoney, money, pushNews, spend } from '../util';

export const LIVE_EVENT_COOLDOWN = 90;
export const LIVE_EVENT_DAYS = 90;
const LIVE_MODELS = new Set(['subscription', 'f2p', 'live_service']);

export function liveEventName(day: number): string {
  const m = fromDay(day).month;
  return m === 10 ? 'Halloween Spooktacular' : m === 12 || m === 1 ? 'Winter Festival' : m >= 6 && m <= 8 ? 'Summer Games' : m >= 3 && m <= 5 ? 'Spring Bloom' : 'Season of Legends';
}

export function liveEventCost(s: GameState, r: Release): number {
  return Math.round(Math.max(money(15_000, s.day), r.liveIncome * 1.1));
}

/** How much the event multiplies live income while it runs. */
export function liveEventBoost(s: GameState, r: Release): number {
  const recent = (r.liveEvents ?? 0) > 0 && r.lastLiveEventDay !== undefined && s.day - r.lastLiveEventDay < 365 ? Math.min(3, r.liveEvents ?? 0) : 0;
  const love = clamp(0.5 + (r.userScore - 70) / 80, 0.2, 0.9);
  return 1 + love * Math.pow(0.88, recent);
}

export function liveEventBlocked(s: GameState, r: Release): string | null {
  if (!LIVE_MODELS.has(r.concept.monetization)) return 'Only live games (subscription, free-to-play, live service) run events';
  if (s.day - r.day < 60) return 'Let it settle in first (two months after launch)';
  if (!r.liveIncome) return 'Nobody is playing it any more';
  if (r.lastLiveEventDay !== undefined && s.day - r.lastLiveEventDay < LIVE_EVENT_COOLDOWN) return `Next event in ${LIVE_EVENT_COOLDOWN - (s.day - r.lastLiveEventDay)} days`;
  if (s.company.cash < liveEventCost(s, r)) return `Need ${fmtMoney(liveEventCost(s, r))}`;
  return null;
}

export function runLiveEvent(s: GameState, releaseId: string): string | null {
  const r = s.releases[releaseId];
  if (!r) return 'No such game';
  const why = liveEventBlocked(s, r);
  if (why) return why;
  const cost = liveEventCost(s, r);
  spend(s, 'marketing', cost);
  const mul = liveEventBoost(s, r);
  r.liveEvent = { until: s.day + LIVE_EVENT_DAYS, mul, name: liveEventName(s.day) };
  if (r.lastLiveEventDay !== undefined && s.day - r.lastLiveEventDay >= 365) r.liveEvents = 0; // players have forgotten
  r.liveEvents = (r.liveEvents ?? 0) + 1;
  r.lastLiveEventDay = s.day;
  if ((r.liveEvents ?? 0) <= 2 && !r.liveScoreBumps) r.userScore = clamp(r.userScore + 1, 0, 100);
  if ((r.liveEvents ?? 0) >= 2) r.liveScoreBumps = true;
  pushNews(s, { category: 'studio', headline: `${r.name}: the ${r.liveEvent.name} is live`, body: `Players flock back for limited-time content (+${Math.round((mul - 1) * 100)}% live income for three months).`, tone: 'good' });
  return null;
}
