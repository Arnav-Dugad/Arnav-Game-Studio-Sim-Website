/**
 * Price tiers for full-price games: launch cheap to sell more copies (and win fans), or charge a premium and
 * earn more from each — which players only forgive if the game is great. Publishers set their own prices,
 * and expansions are priced against their base game, so neither offers a choice.
 */
import { clamp } from '../breakdown';
import type { Concept, PriceTier } from '../types';

export const PRICE_MUL: Record<PriceTier, number> = { budget: 0.7, standard: 1, premium: 1.3 };

export function priceTierAllowed(c: Pick<Concept, 'monetization' | 'expansionOf' | 'deal'>): boolean {
  return (c.monetization === 'premium' || c.monetization === 'premium_dlc') && !c.expansionOf && !c.deal;
}

export function priceTierOf(c: Pick<Concept, 'monetization' | 'expansionOf' | 'deal' | 'priceTier'>): PriceTier {
  return c.priceTier && priceTierAllowed(c) ? c.priceTier : 'standard';
}

/** How many more (or fewer) people buy at this price. A premium price bites less on a great game. */
export function priceDemandMul(tier: PriceTier, effScore: number): number {
  if (tier === 'budget') return 1.3;
  if (tier === 'premium') return 0.72 + 0.12 * clamp((effScore - 75) / 15, 0, 1);
  return 1;
}

/** User-score effect: value for money matters to players. */
export function priceUserEffect(tier: PriceTier, score: number): number {
  if (tier === 'budget') return 1;
  if (tier === 'premium') return score >= 85 ? 0 : -2;
  return 0;
}
