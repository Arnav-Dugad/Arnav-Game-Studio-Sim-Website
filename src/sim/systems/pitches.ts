/**
 * Staff pitches: now and then a senior creative pitches the game they've always wanted to make — their favourite
 * genre, with a topic that suits it. Greenlight it and the pitch waits in the new-game screen for six months; make
 * it with them on the team and it becomes their passion project (fresh ideas, and one very happy person).
 */
import { possessive } from '../util';
import { GENRE_BY_ID, GENRES } from '../../data/genres';
import type { GenreId } from '../../data/types';
import { TOPICS, TOPIC_BY_ID } from '../../data/topics';
import { fromDay } from '../calendar';
import type { Rng } from '../rng';
import type { GameProject, GameState, Staff } from '../types';
import { aOrAn, pushNews } from '../util';
import { favouriteGenre, isAway } from './staff';

export const PITCH_DAYS = 180;
export const PASSION_NOVELTY = 0.03;
const PITCHERS = new Set(['designer', 'producer', 'writer']);

function genreOpen(s: GameState, g: GenreId): boolean {
  const def = GENRE_BY_ID[g];
  return !!def && fromDay(s.day).year >= def.year && (!def.research || s.research.done.includes(def.research));
}

export function pitchers(s: GameState): Staff[] {
  return Object.values(s.staff).filter((st) => st.role !== 'founder' && PITCHERS.has(st.role) && (st.level === 'senior' || st.level === 'lead') && !isAway(st));
}

/** What this person would pitch: their favourite genre (or one they can make) and a topic made for it. */
export function makePitch(s: GameState, rng: Rng, st: Staff): { genre: GenreId; topic: string } | null {
  const yr = fromDay(s.day).year;
  let genre = favouriteGenre(st.id);
  if (!genreOpen(s, genre)) {
    const open = GENRES.filter((g) => genreOpen(s, g.id));
    if (!open.length) return null;
    genre = rng.pick(open).id;
  }
  const topics = TOPICS.filter((t) => yr >= t.year && (!t.research || s.research.done.includes(t.research)) && (t.genreFit[genre] ?? 1) >= 3);
  if (!topics.length) return null;
  return { genre, topic: rng.pick(topics).id };
}

/** "an Insects strategy game" (with `article`), or "Insects strategy game". */
/** A genre name for running text: "strategy", but "RPG" and "MMO" stay as they are. */
export function genreWord(name: string): string {
  return /^[A-Z]{2,}$/.test(name) ? name : name.toLowerCase();
}

export function pitchText(p: { genre: GenreId; topic: string }, article = false): string {
  const text = `${TOPIC_BY_ID[p.topic]?.name ?? p.topic} ${genreWord(GENRE_BY_ID[p.genre].name)} game`;
  return article ? aOrAn(text) : text;
}

/** At the start of a game: if it's the greenlit pitch and the pitcher is on the team, it's their passion project. */
export function claimPitch(s: GameState, p: GameProject): void {
  const pitch = s.company.pitch;
  if (!pitch) return;
  if (s.day > pitch.until) {
    s.company.pitch = undefined;
    return;
  }
  if (p.concept.genre !== pitch.genre || p.concept.topic !== pitch.topic || !p.team.includes(pitch.staffId) || p.concept.expansionOf || p.concept.remasterOf) return;
  const st = s.staff[pitch.staffId];
  s.company.pitch = undefined;
  if (!st) return;
  p.passion = st.id;
  p.novelty += PASSION_NOVELTY;
  if (!st.mood || st.mood.until <= s.day || st.mood.v < 6) st.mood = { v: 6, until: s.day + 240, label: 'Making my dream game' };
  st.moraleWhy = undefined;
  pushNews(s, { category: 'staff', headline: `${possessive(st.name)} passion project begins`, body: `${p.concept.name} — the ${pitchText(pitch)} ${st.name.split(' ')[0]} has pitched for years — is finally in development.`, tone: 'good' });
}

/** Monthly: a greenlit pitch nobody made fades. */
export function pitchesMonthly(s: GameState): void {
  const pitch = s.company.pitch;
  if (pitch && (s.day > pitch.until || !s.staff[pitch.staffId])) s.company.pitch = undefined;
}
