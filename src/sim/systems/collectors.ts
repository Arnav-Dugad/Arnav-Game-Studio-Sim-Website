/**
 * Collector's Editions (1984+): before launch, order a limited run of deluxe boxes — a map, a statue, a soundtrack,
 * the works — at two and a half times the price. Superfans snap them up at launch: how many depends on your fans,
 * the series' fans, the hype and the reviews. You pay for the whole run up front, so a sell-out is pure profit and
 * a warehouse of unsold statues is a write-off. Once per game; publishers make their own.
 */
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Rng } from '../rng';
import type { CeRun, GameProject, GameState, Release } from '../types';
import { earn, fmtUnits, pushNews, spend } from '../util';

export const CE_YEAR = 1984;
export const CE_RUN: Record<CeRun, number> = { small: 5_000, medium: 20_000, large: 75_000 };
export const CE_RUNS: CeRun[] = ['small', 'medium', 'large'];
/** Shelf price, and the cost of making each box, against the standard edition's price. */
export const CE_PRICE_MUL = 2.5;
export const CE_COST_MUL = 0.9;
/** What the studio keeps of each box sold (the shop's cut comes out). */
export const CE_KEEP = 0.7;
const SIZE_MUL = { small: 0.5, medium: 0.8, large: 1, aaa: 1.3 } as const;

export function ceAllowed(c: GameProject['concept']): boolean {
  return (c.monetization === 'premium' || c.monetization === 'premium_dlc') && !c.expansionOf && !c.deal;
}

export function ceCost(run: CeRun, stdPrice: number): number {
  return Math.round(CE_RUN[run] * stdPrice * CE_COST_MUL);
}

export function ceBlocked(s: GameState, p: GameProject, run: CeRun | undefined, stdPrice: number): string | null {
  if (fromDay(s.day).year < CE_YEAR) return `Collector’s editions catch on around ${CE_YEAR}`;
  if (!ceAllowed(p.concept)) return p.concept.deal ? 'Your publisher makes its own editions' : 'Only full-price games get a collector’s edition';
  if (p.collectors) return 'Already ordered';
  if (p.announcedDay === undefined) return 'Announce it first — fans can’t pre-order a game they’ve never heard of';
  if (run && s.company.cash < ceCost(run, stdPrice)) return 'Not enough cash';
  return null;
}

/** Superfans who would buy one, for a given review score (before luck). */
export function ceDemand(s: GameState, p: Pick<GameProject, 'concept' | 'hype'>, score: number): number {
  const fr = p.concept.franchiseId ? s.franchises[p.concept.franchiseId] : undefined;
  const superfans = s.company.fans * 0.015 + (fr ? fr.fans * 0.05 : 0);
  const hypeMul = 0.4 + clamp(p.hype, 0, 3) * 0.6;
  const scoreMul = clamp((score - 55) / 25, 0.25, 1.4);
  return Math.max(0, superfans * hypeMul * scoreMul * SIZE_MUL[p.concept.size]);
}

export function orderCollectors(s: GameState, projectId: string, run: CeRun, stdPrice: number): string | null {
  const p = s.projects[projectId];
  if (!p || p.kind !== 'game') return 'No such game';
  if (!CE_RUNS.includes(run)) return 'Pick a print run';
  const why = ceBlocked(s, p, run, stdPrice);
  if (why) return why;
  const cost = ceCost(run, stdPrice);
  spend(s, 'manufacturing', cost);
  p.collectors = { run, cost };
  pushNews(s, { category: 'studio', headline: `${p.concept.name} Collector’s Edition announced`, body: `${fmtUnits(CE_RUN[run])} numbered boxes, made to order. Pre-orders are open.`, tone: 'neutral' });
  return null;
}

/** Launch day: the boxes go on sale. */
export function collectorsOnRelease(s: GameState, rng: Rng, p: GameProject, rel: Release): void {
  const ce = p.collectors;
  if (!ce) return;
  const run = CE_RUN[ce.run];
  const demand = ceDemand(s, { concept: p.concept, hype: rel.hypeAtLaunch }, rel.score) * rng.range(0.85, 1.15);
  const sold = Math.min(run, Math.round(demand));
  const price = Math.round(rel.price * CE_PRICE_MUL * 100) / 100;
  const net = sold * price * CE_KEEP;
  rel.collectors = { run, sold, price, cost: ce.cost };
  if (net > 0) {
    earn(s, 'sales', net);
    rel.net += net;
    rel.gross += sold * price;
    rel.units += sold;
    s.progress.stats.totalRevenue += net;
  }
  if (demand >= run * 1.5) {
    s.company.fans = Math.round(s.company.fans * 1.01);
    pushNews(s, { category: 'studio', headline: `${rel.name} Collector’s Edition sells out in hours`, body: `All ${fmtUnits(run)} boxes gone — and fans are asking for a second printing.`, tone: 'good' });
  } else if (sold >= run) {
    pushNews(s, { category: 'studio', headline: `${rel.name} Collector’s Edition sells out`, body: `Every one of the ${fmtUnits(run)} boxes found a home.`, tone: 'good' });
  } else if (sold < run * 0.5) {
    pushNews(s, { category: 'studio', headline: `Unsold ${rel.name} collector’s boxes pile up`, body: `Only ${fmtUnits(sold)} of ${fmtUnits(run)} sold. The rest are stacked in the warehouse.`, tone: 'bad' });
  } else {
    pushNews(s, { category: 'studio', headline: `${rel.name} Collector’s Edition: ${Math.round((sold / run) * 100)}% sold`, body: `${fmtUnits(sold)} of ${fmtUnits(run)} boxes sold at launch.`, tone: 'neutral' });
  }
}
