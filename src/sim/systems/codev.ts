/**
 * Co-development (1985+): partner with another studio on a game. Their team adds work every day alongside yours
 * (a little buggier — coordination is hard); in return they take a share of the game's net revenue for its whole
 * life. Better partners bring more and ask more; they only sign with studios they take seriously.
 */
import { BALANCE } from '../../data/balance';
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { GameProject, GameState, Rival } from '../types';
import { pushNews } from '../util';

export const CODEV_YEAR = 1985;

export interface CodevTerms {
  /** Virtual people-at-full-skill they contribute. */
  power: number;
  /** Share of net revenue they take. */
  share: number;
}

export function codevPartners(s: GameState): Rival[] {
  return Object.values(s.rivals)
    .filter((r) => r.alive && !r.ownedByPlayer && r.staff >= 15)
    .sort((a, b) => b.quality - a.quality)
    .slice(0, 8);
}

export function codevBlocked(s: GameState, p: GameProject): string | null {
  if (fromDay(s.day).year < CODEV_YEAR) return `Co-development deals start around ${CODEV_YEAR}`;
  if (p.coDev) return 'Already co-developed';
  if (p.concept.deal) return 'Your publisher won’t allow it';
  if (p.concept.size === 'small') return 'Partners only join medium-sized games and up';
  if (p.phase > 1) return 'Too late — bring a partner in before polish';
  return null;
}

export function codevTerms(s: GameState, p: GameProject, rival: Rival): CodevTerms | string {
  if (s.company.reputation < rival.reputation * 0.5) return `${rival.name} doesn’t think you’re big enough yet`;
  const sz = BALANCE.SIZE[p.concept.size];
  const people = clamp(rival.staff * 0.05, 1.5, sz.teamCap * 0.4);
  // what their people actually produce (skill × productivity, like your own staff)
  const power = Math.round(clamp(rival.quality, 0.4, 0.95) * people * 0.6 * 100) / 100;
  // the share follows what they bring, against a typical team for a game this size (in the same units)
  const share = Math.round(clamp((power / (sz.typicalTeam * BALANCE.BENCHMARK_SKILL * BALANCE.BENCHMARK_PROD)) * 0.5, 0.15, 0.55) * 20) / 20;
  return { power, share };
}

/** The partner's share lapses if you bought them (it's your money now) or they closed down. */
export function codevShareVoid(s: GameState, rivalId: string | undefined): boolean {
  const r = rivalId ? s.rivals[rivalId] : undefined;
  return !!r && (r.ownedByPlayer || !r.alive);
}

export function signCodev(s: GameState, projectId: string, rivalId: string): string | null {
  const p = s.projects[projectId];
  if (!p || p.kind !== 'game') return 'No such game';
  const why = codevBlocked(s, p);
  if (why) return why;
  const rival = s.rivals[rivalId];
  if (!rival || !codevPartners(s).some((r) => r.id === rivalId)) return 'They’re not available';
  const terms = codevTerms(s, p, rival);
  if (typeof terms === 'string') return terms;
  p.coDev = { rivalId, name: rival.name, power: terms.power, share: terms.share };
  pushNews(s, { category: 'studio', headline: `${s.company.name} and ${rival.name} team up on ${p.concept.name}`, body: `${rival.name} brings a team to the project for ${Math.round(terms.share * 100)}% of the game’s revenue.`, tone: 'good' });
  return null;
}
