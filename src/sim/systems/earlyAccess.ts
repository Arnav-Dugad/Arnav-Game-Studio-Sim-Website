/**
 * Early Access (2012+): put a self-published PC game on sale while it's still in production. Players pay a
 * discounted price, report bugs and shape the design (a quality bonus that grows with time in Early Access), and
 * a strong rating spreads the word. The catch: the 1.0 launch sells to fewer new buyers on PC (many already own
 * it), a weak build hurts hype, and a game that lingers in Early Access for years wears out its welcome.
 */
import { codevShareVoid } from './codev';
import { BALANCE } from '../../data/balance';
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameProject, GameState } from '../types';
import { addRep, earn, money, pushNews, spend } from '../util';
import { devProgress, gameQuality, qualityToScore } from './dev';
import { platformInfo } from './market';
import { gamePrice, netPerUnit, salesPotential } from './release';

export const EA_YEAR = 2012;
/** After this long, players start asking whether it'll ever be finished. */
export const EA_STALE_WEEKS = 78;
/** Early Access copies sell at a discount. */
export const EA_PRICE = 0.75;
/** Share of the PC market's potential that buys each week (before appeal and fade). */
const EA_WEEKLY = 0.01;
/** Early Access can't sell more than this share of the game's PC potential. */
const EA_CAP = 0.45;

export function earlyAccessCost(s: GameState, p: GameProject): number {
  return money({ small: 800, medium: 3_000, large: 10_000, aaa: 25_000 }[p.concept.size], s.day);
}

export function eaPcPlatforms(s: GameState, p: GameProject): string[] {
  return p.concept.platforms.filter((pid) => platformInfo(s, pid)?.kind === 'computer');
}

export function earlyAccessBlocked(s: GameState, p: GameProject): string | null {
  if (fromDay(s.day).year < EA_YEAR) return `Early Access takes off on digital storefronts in ${EA_YEAR}`;
  if (p.earlyAccess) return 'Already in Early Access';
  if (p.concept.deal) return 'Your publisher won’t sell an unfinished game';
  if (p.concept.remasterOf || p.concept.expansionOf) return 'Only new games go into Early Access';
  if (p.concept.monetization !== 'premium') return 'Early Access is for games people buy up front';
  if (!eaPcPlatforms(s, p).length) return 'Early Access needs a PC version';
  if (!s.research.done.includes('biz_self_publishing')) return 'Research Self-Publishing first';
  if (p.beta) return 'You already ran a public beta';
  if (p.phase < 1) return 'Players need something to play: wait for production';
  if (p.phase > 2) return 'Too late: it’s about to launch';
  if (s.company.cash < earlyAccessCost(s, p)) return 'Not enough cash for the storefront launch';
  return null;
}

/** What Early Access players think of the build right now: the projected score, minus what's still missing. */
export function earlyAccessRating(s: GameState, p: GameProject): number {
  const projected = qualityToScore(gameQuality(s, p, true).total);
  return clamp(Math.round(projected - 14 * (1 - devProgress(p))), 1, 100);
}

export function startEarlyAccess(s: GameState, p: GameProject): string | null {
  const why = earlyAccessBlocked(s, p);
  if (why) return why;
  spend(s, 'marketing', earlyAccessCost(s, p));
  if (p.announcedDay === undefined) p.announcedDay = s.day;
  const rating = earlyAccessRating(s, p);
  p.earlyAccess = { day: s.day, rating, units: 0, gross: 0, net: 0 };
  pushNews(s, {
    category: 'studio',
    headline: `${p.concept.name} launches in Early Access`,
    body: `Players can buy it now at ${Math.round((1 - EA_PRICE) * 100)}% off while development continues. First impressions: ${rating >= 70 ? 'very promising' : rating >= 55 ? 'rough but promising' : 'unfinished and buggy'} (${rating}).`,
    tone: rating >= 55 ? 'good' : 'neutral',
  });
  return null;
}

/** Weekly: sales, the community's rating, word of mouth, and the patience clock. */
export function earlyAccessWeekly(c: Ctx): void {
  const { s, rng } = c;
  for (const p of Object.values(s.projects)) {
    if (p.kind !== 'game' || !p.earlyAccess) continue;
    const ea = p.earlyAccess;
    const weeks = Math.floor((s.day - ea.day) / 7);
    ea.rating = clamp(Math.round(earlyAccessRating(s, p) + rng.normal(0, 1.5)), 1, 100);
    const pcs = eaPcPlatforms(s, p);
    if (pcs.length) {
      const pot = salesPotential(s, { ...p.concept, platforms: pcs, priceTier: undefined }, ea.rating, p.hype); // EA has its own price
      const pcPot = pot.platforms.reduce((t, x) => t + x.potential, 0);
      const appeal = ea.rating >= 75 ? 1.3 : ea.rating >= 60 ? 1 : ea.rating >= 50 ? 0.6 : 0.3;
      const fade = 0.35 + 0.65 * Math.exp(-weeks / 26);
      const want = pcPot * EA_WEEKLY * appeal * fade * (s.cheats?.salesMul ?? 1);
      const units = Math.floor(Math.min(want, Math.max(0, pcPot * EA_CAP - ea.units)) + rng.next());
      if (units > 0 && pcPot > 0) {
        let net = 0;
        let gross = 0;
        for (const x of pot.platforms) {
          const u = units * (x.potential / pcPot);
          const price = gamePrice(s, x.pl, p.concept.size, p.concept.monetization) * EA_PRICE;
          gross += u * price;
          net += u * netPerUnit(s, x.pl, price, true);
        }
        if (p.coDev && !codevShareVoid(s, p.coDev.rivalId)) net *= 1 - p.coDev.share; // the partner's cut
        earn(s, 'sales', net);
        const eng = s.engines[p.concept.engineId];
        if (eng && eng.royalty > 0) spend(s, 'royalties', net * eng.royalty);
        c.out.push({ type: 'income', amount: net, source: 'sales' });
        ea.units += units;
        s.progress.stats.totalUnits += units;
        s.progress.stats.totalRevenue += net;
        ea.gross += gross;
        ea.net += net;
        if (ea.rating >= 65) s.company.fans += Math.round(units * 0.05);
      }
    }
    // word of mouth
    if (ea.rating >= 75) p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + 0.02);
    else if (ea.rating < 50) p.hype *= 0.95;
    // the patience clock
    if (weeks >= EA_STALE_WEEKS) {
      p.hype *= 0.97;
      addRep(s, -0.15, `${p.concept.name} stuck in Early Access`);
      if (!ea.stale) {
        ea.stale = true;
        pushNews(s, { category: 'studio', headline: `Players ask if ${p.concept.name} will ever leave Early Access`, body: 'A year and a half in, the forums are getting restless. Every week from here costs a little goodwill.', tone: 'bad' });
      }
    }
  }
}

