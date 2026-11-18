/**
 * Breakout mods: a PC game that shipped with mod tools grows a scene, and now and then one mod becomes a phenomenon
 * of its own — a whole new way to play, built on your game. The studio can hire the modder who made it (they arrive
 * with a pitch to turn it into a full game), buy it and ship it as official content, or simply feature it. Whatever
 * you choose, players come back to the original to try it.
 */
import { GENRE_BY_ID } from '../../data/genres';
import { TOPICS, TOPIC_BY_ID } from '../../data/topics';
import type { GenreId } from '../../data/types';
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Rng } from '../rng';
import type { GameState, Release } from '../types';
import { platformInfo } from './market';

/** The kinds of mod that take off, and the genre a full game of it would be. */
export const MOD_STYLES: { style: string; genre: GenreId; year: number }[] = [
  { style: 'team-based tactical shooter', genre: 'shooter', year: 1997 },
  { style: 'zombie survival', genre: 'action', year: 1997 },
  { style: 'co-op dungeon crawler', genre: 'rpg', year: 1997 },
  { style: 'kart racing', genre: 'racing', year: 1997 },
  { style: 'city-building', genre: 'simulation', year: 1997 },
  { style: 'tower-defence', genre: 'strategy', year: 2002 },
  { style: 'five-a-side arena battle', genre: 'strategy', year: 2003 },
  { style: 'open-world roleplay', genre: 'rpg', year: 2005 },
  { style: 'survival crafting', genre: 'sandbox', year: 2009 },
  { style: 'last-player-standing', genre: 'shooter', year: 2012 },
];

const FIRST = ['Frontline', 'Siege', 'Last', 'Iron', 'Ancient', 'Rogue', 'Shadow', 'Deep', 'Final', 'Hollow', 'Red', 'Wild'];
const SECOND = ['Ops', 'Defence', 'Stand', 'Legion', 'Conquest', 'Exodus', 'Outpost', 'Uprising', 'Frontier', 'Harvest', 'Rush', 'Reign'];

const genreOpen = (s: GameState, g: GenreId) => {
  const def = GENRE_BY_ID[g];
  return !!def && fromDay(s.day).year >= def.year && (!def.research || s.research.done.includes(def.research));
};

/** A modded PC game, loved and still alive on a computer platform, that hasn't had its breakout mod yet. */
export function breakoutCandidate(s: GameState): Release | undefined {
  return Object.values(s.releases)
    .filter((r) => r.modded && !r.delisted && !r.breakoutMod && r.score >= 72 && s.day - r.day >= 180 && s.day - r.day <= 365 * 5 && pcAlive(s, r))
    .sort((a, b) => b.score - a.score || a.day - b.day)[0];
}

export function pcAlive(s: GameState, r: Release): boolean {
  return r.platforms.some((ps) => {
    const pl = platformInfo(s, ps.platform);
    return !!pl && pl.kind === 'computer' && (pl.endDay === null || s.day <= pl.endDay);
  });
}

/** What the mod is: its name, style and the genre a full game of it would be. */
export function rollMod(s: GameState, rng: Rng, r: Release): { name: string; style: string; genre: GenreId } | null {
  const yr = fromDay(s.day).year;
  const styles = MOD_STYLES.filter((m) => yr >= m.year && genreOpen(s, m.genre));
  if (!styles.length) return null;
  const m = rng.pick(styles);
  let name = `${rng.pick(FIRST)} ${rng.pick(SECOND)}`;
  if (name === r.name) name = `${name} Reborn`;
  return { name, style: m.style, genre: m.genre };
}

/** Players come back to the original to play the mod: a second wave on its living computer versions. */
export function modRevival(s: GameState, r: Release, frac: number): boolean {
  let revived = false;
  for (const ps of r.platforms) {
    const pl = platformInfo(s, ps.platform);
    if (!pl || pl.kind !== 'computer' || (pl.endDay !== null && s.day > pl.endDay)) continue;
    const add = ps.potential * frac;
    if (add < 1) continue;
    // like a new sale, it replaces an unfinished wave — a discounted one's leftover buyers fold in at half (as applySale does)
    const prev = ps.revival;
    const left = prev ? Math.max(0, prev.potential - prev.units) * (prev.priceMul !== undefined ? 0.5 : 1) : 0;
    ps.revival = { week: r.week, potential: left + add, units: 0 };
    ps.extraPotential = (ps.extraPotential ?? 0) + add;
    revived = true;
  }
  if (revived) r.active = true;
  return revived;
}

/** The topic for a full game of the mod: the original's, if it suits the new genre — otherwise one that does. */
export function modTopic(s: GameState, rng: Rng, genre: GenreId, base: string): string {
  if ((TOPIC_BY_ID[base]?.genreFit[genre] ?? 1) >= 2) return base;
  const yr = fromDay(s.day).year;
  const fits = TOPICS.filter((t) => yr >= t.year && (!t.research || s.research.done.includes(t.research)) && (t.genreFit[genre] ?? 1) >= 3);
  return fits.length ? rng.pick(fits).id : base;
}

export const MOD_FEATURE = 0.05;
export const MOD_HIRE = 0.05;
export const MOD_BUY = 0.12;
export const modBuyScore = (r: Release) => clamp(r.userScore + 2, 1, 100);
