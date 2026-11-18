/**
 * Your own showcase: once a famous studio, skip the trade-show booths and host a yearly presentation of
 * everything you've announced. Stronger hype than any booth, but only for your games, once a year.
 */
import { BALANCE } from '../../data/balance';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameProject, GameState } from '../types';
import { addRep, money, pushNews, spend } from '../util';

export const SHOWCASE_MIN_REP = 60;
export const SHOWCASE_MIN_YEAR = 1990;
export const SHOWCASE_COOLDOWN = 365;

export function showcaseCost(s: GameState): number {
  return money(120_000, s.day);
}

function announcedGames(s: GameState): GameProject[] {
  return Object.values(s.projects).filter((p): p is GameProject => p.kind === 'game' && p.announcedDay !== undefined);
}

/** A digital stream after 2005, a press event before. */
export function showcaseName(s: GameState): string {
  return `${s.company.name.split(' ')[0]} ${fromDay(s.day).year >= 2005 ? 'Direct' : 'Press Event'}`;
}

export function showcaseBlocked(s: GameState): string | null {
  if (fromDay(s.day).year < SHOWCASE_MIN_YEAR) return `Studio showcases catch on around ${SHOWCASE_MIN_YEAR}`;
  if (s.company.reputation < SHOWCASE_MIN_REP) return `Needs ${SHOWCASE_MIN_REP}+ reputation to draw a crowd`;
  const last = s.eventCooldowns.own_showcase;
  if (last !== undefined && s.day - last < SHOWCASE_COOLDOWN) return `Next showcase in ${SHOWCASE_COOLDOWN - (s.day - last)} days`;
  if (!announcedGames(s).length) return 'Announce at least one game first';
  if (s.company.cash < showcaseCost(s)) return 'Not enough cash';
  return null;
}

/** Hype each announced game would gain right now. */
export function showcaseHype(s: GameState): number {
  const n = announcedGames(s).length;
  return (1.3 * (s.company.reputation / 100)) / Math.max(1, Math.sqrt(n));
}

export function hostShowcase(c: Ctx): void {
  const { s } = c;
  spend(s, 'marketing', showcaseCost(s));
  s.eventCooldowns.own_showcase = s.day;
  const gain = showcaseHype(s);
  const games = announcedGames(s);
  for (const p of games) {
    p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + gain);
    const fr = p.concept.franchiseId ? s.franchises[p.concept.franchiseId] : undefined;
    if (fr) fr.fans = Math.round(fr.fans * 1.03);
  }
  for (const hw of s.hardware ?? []) if (hw.status === 'live') hw.boost = Math.min(1.5, hw.boost + 0.08);
  addRep(s, 2, 'Hosted your own showcase');
  const n = pushNews(s, {
    category: 'studio',
    headline: `${showcaseName(s)}: ${s.company.name} reveals ${games.length === 1 ? games[0]!.concept.name : `${games.length} upcoming games`}`,
    tone: 'good',
  });
  c.out.push({ type: 'news', newsId: n.id, major: false });
}
