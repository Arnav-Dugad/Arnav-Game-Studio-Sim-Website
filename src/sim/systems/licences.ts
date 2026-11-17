/**
 * Licences expire. A game built on someone else's property — a real league, a licensed soundtrack — can only be
 * sold while the licence lasts (seven years at a time). When it runs out on a game that still sells, you choose:
 * renew (half the original fees, at today's prices) or let it be delisted for good — no more sales, storefront
 * deals or re-releases, and fans grumble. Games nobody buys any more are delisted quietly.
 */
import { FEATURE_BY_ID } from '../../data/gameFeatures';
import type { Ctx } from '../ctx';
import type { GameState, Release } from '../types';
import { money, pushNews } from '../util';
import { fireEvent } from './events';

export const LICENCE_YEARS = 7;
export const LICENSED_FEATURES = ['official_license', 'licensed_music'] as const;

export function licensedParts(r: Release): string[] {
  return (r.concept.features ?? []).filter((f) => (LICENSED_FEATURES as readonly string[]).includes(f));
}

export function licenceDue(r: Release): number | null {
  if (r.delisted || !licensedParts(r).length) return null;
  return r.licenceUntil ?? r.day + Math.round(LICENCE_YEARS * 365.25);
}

export function renewalCost(s: GameState, r: Release): number {
  return licensedParts(r).reduce((t, id) => t + money((FEATURE_BY_ID[id]?.cost ?? 0) * 0.5, s.day), 0);
}

/** Still worth a decision: it sold something recently — or it's loved enough to re-release one day. */
function stillSelling(r: Release): boolean {
  return (r.active && ((r.lastWeekUnits ?? 0) >= 20 || r.liveIncome > 0)) || r.score >= 70;
}

export function delist(s: GameState, r: Release, loud: boolean): void {
  r.delisted = true;
  r.active = false;
  r.liveIncome = 0;
  pushNews(s, {
    category: 'studio',
    headline: loud ? `${r.name} is delisted as its licences expire` : `${r.name} quietly leaves digital stores`,
    body: loud ? 'Players who wanted it will have to hunt down a second-hand copy. Some fans aren’t happy.' : 'Its licences expired years after its heyday. Few noticed.',
    tone: loud ? 'bad' : 'neutral',
  });
}

/** The release whose licence decision is waiting (oldest first). */
export function licenceDecisionDue(s: GameState): Release | undefined {
  return s.releaseOrder
    .map((id) => s.releases[id]!)
    .find((r) => r && (licenceDue(r) ?? Infinity) <= s.day && stillSelling(r));
}

/** Monthly: quiet delistings, and one renew-or-lapse decision at a time. */
export function licencesMonthly(c: Ctx): void {
  const { s } = c;
  for (const id of s.releaseOrder) {
    const r = s.releases[id];
    if (!r) continue;
    const due = licenceDue(r);
    if (due !== null && due <= s.day && !stillSelling(r)) delist(s, r, false);
  }
  if (licenceDecisionDue(s)) fireEvent(c, 'licence_expiry');
}
