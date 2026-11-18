/**
 * Production values: what a game spends beyond its own team — outside artists and animators, a composer, licensed
 * music, a voice cast, cinematics. A lean budget saves money and it shows; a lavish one lifts quality (with
 * diminishing returns near the top: the critics' high bar still applies). The money goes out day by day during
 * development, so a cancelled game stops spending.
 */
import { BALANCE } from '../../data/balance';
import { fromDay } from '../calendar';
import type { ProductionTier, Size } from '../types';
import { inflation } from '../util';

export type { ProductionTier };
export const PRODUCTION_TIERS: readonly ProductionTier[] = ['lean', 'standard', 'polished', 'lavish'];

export const PRODUCTION: Record<ProductionTier, { name: string; quality: number; base: number; extra: number }> = {
  // base: share of the size's usual production costs; extra: × the size's outside budget (below)
  lean: { name: 'Lean', quality: 0.96, base: 0.6, extra: 0 },
  standard: { name: 'Standard', quality: 1, base: 1, extra: 0 },
  polished: { name: 'Polished', quality: 1.04, base: 1, extra: 1 },
  lavish: { name: 'Lavish', quality: 1.08, base: 1, extra: 3 },
};

/** A size's outside budget over a whole game, in 1980 dollars (grows with the era, like other production costs). */
export const OUTSIDE_BUDGET: Record<Size, number> = { small: 15_000, medium: 80_000, large: 400_000, aaa: 2_500_000 };

export const validProduction = (t: unknown): t is ProductionTier => typeof t === 'string' && (PRODUCTION_TIERS as readonly string[]).includes(t);

/** Extra spending per day for this tier (on top of the size's usual production costs). */
export function productionExtraDaily(size: Size, tier: ProductionTier | undefined, day: number): number {
  const p = PRODUCTION[tier ?? 'standard'];
  if (!p.extra) return 0;
  const yrs = fromDay(day).year - 1980;
  return ((OUTSIDE_BUDGET[size] * p.extra) / BALANCE.SIZE[size].days) * inflation(day) * Math.pow(1.065, Math.max(0, yrs));
}

/** What the money buys, in the words of the era. */
export function productionBlurb(tier: ProductionTier, year: number): string {
  if (tier === 'lean') return 'Placeholder art stays in, no outside help. Cheaper — and critics notice.';
  if (tier === 'standard') return 'The usual: your team makes everything.';
  const era =
    year < 1988
      ? tier === 'lavish'
        ? 'a famous illustrator for the box, a composer and a professional sound chip arranger'
        : 'outside pixel artists and a proper composer'
      : year < 1998
        ? tier === 'lavish'
          ? 'full-motion video, a voice cast and a CD-quality score'
          : 'a voice cast and outsourced animation'
        : year < 2010
          ? tier === 'lavish'
            ? 'an orchestral score, motion capture and celebrity voices'
            : 'outsourced art, licensed music and a voice cast'
          : tier === 'lavish'
            ? 'an orchestral score, performance capture, a star cast and a cinematic studio'
            : 'outsourced art, a licensed soundtrack and a full voice cast';
  return `Pays for ${era}.`;
}
