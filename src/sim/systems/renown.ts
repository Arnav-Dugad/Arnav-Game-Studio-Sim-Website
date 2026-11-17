/**
 * Genre renown: a studio that keeps making great games in one genre becomes known for it. Players of that genre
 * trust the name (more of them buy the next one), but they also hold it to its own standard — a weak entry from
 * "the RPG people" disappoints more than it would from anyone else. Derived from releases, so nothing to save.
 */
import { clamp } from '../breakdown';
import type { GenreId } from '../../data/types';
import type { GameState } from '../types';

export const RENOWN_MIN_GAMES = 2;
export const RENOWN_MIN_AVG = 75;
const WINDOW = 6;

/** The studio's recent record in a genre (expansions and remasters don't count). */
export function genreRecord(s: GameState, genre: GenreId): { n: number; avg: number } {
  const xs: number[] = [];
  for (let i = s.releaseOrder.length - 1; i >= 0 && xs.length < WINDOW; i--) {
    const r = s.releases[s.releaseOrder[i]!];
    if (!r || r.concept.genre !== genre || r.concept.expansionOf || r.concept.remasterOf) continue;
    xs.push(r.score);
  }
  return { n: xs.length, avg: xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : 0 };
}

export function isKnownFor(rec: { n: number; avg: number }): boolean {
  return rec.n >= RENOWN_MIN_GAMES && rec.avg >= RENOWN_MIN_AVG;
}

/** Up to two genres the studio is famous for, strongest first. */
export function knownFor(s: GameState): { genre: GenreId; n: number; avg: number }[] {
  const seen = new Set<GenreId>();
  for (const id of s.releaseOrder) {
    const g = s.releases[id]?.concept.genre;
    if (g) seen.add(g);
  }
  return [...seen]
    .map((genre) => ({ genre, ...genreRecord(s, genre) }))
    .filter(isKnownFor)
    .sort((a, b) => b.avg * Math.sqrt(b.n) - a.avg * Math.sqrt(a.n))
    .slice(0, 2);
}

/** Sales lift for a new game in a genre the studio is known for (1 = none). */
export function renownSalesMul(s: GameState, genre: GenreId): number {
  if (!knownFor(s).some((k) => k.genre === genre)) return 1;
  const rec = genreRecord(s, genre);
  return 1 + clamp((rec.avg - RENOWN_MIN_AVG) / 100 + 0.02 * Math.min(rec.n, 5), 0.03, 0.12);
}

/** Fans of a studio's speciality expect its usual standard. */
export function renownUserEffect(s: GameState, genre: GenreId, score: number): number {
  if (!knownFor(s).some((k) => k.genre === genre)) return 0;
  return score < genreRecord(s, genre).avg - 10 ? -2 : 0;
}
