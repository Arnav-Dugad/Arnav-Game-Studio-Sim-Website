/** UI-side helpers that derive presentation data from the sim (pure functions). */
import { TITLE_NOUN } from '@/data/names';
import { genrePopularity, topicPopularity } from '@/sim/systems/market';
import { GENRES, GENRE_BY_ID } from '@/data/genres';
import { TOPICS, TOPIC_BY_ID } from '@/data/topics';
import { BALANCE } from '@/data/balance';
import { PHASE_AREAS, type Area, type GenreId } from '@/data/types';
import { fromDay } from '@/sim/calendar';
import type { Focus3, GameState, Size, Staff } from '@/sim/types';
import { sizeDailyCost } from '@/sim/systems/dev';
import { RESEARCH_BY_ID } from '@/data/research';

export const AREA_LABEL: Record<Area, string> = {
  engine: 'Engine',
  gameplay: 'Gameplay',
  story: 'Story',
  level: 'Level Design',
  dialogue: 'Dialogue',
  ai: 'AI',
  world: 'World Design',
  graphics: 'Graphics',
  sound: 'Sound',
};

export const PHASE_NAMES = ['Pre-production', 'Production', 'Polish'] as const;
export const SIZE_LABEL: Record<Size, string> = { small: 'Small', medium: 'Medium', large: 'Large', aaa: 'AAA' };

export function availableGenres(s: GameState) {
  const yr = fromDay(s.day).year;
  return GENRES.map((g) => {
    let why = '';
    if (yr < g.year) why = `Appears in ${g.year}`;
    else if (g.research && !s.research.done.includes(g.research)) why = `Research ${RESEARCH_BY_ID[g.research]?.name}`;
    return { g, ok: !why, why };
  });
}

export function availableTopics(s: GameState) {
  const yr = fromDay(s.day).year;
  return TOPICS.map((t) => {
    let why = '';
    if (yr < t.year) why = `Appears in ${t.year}`;
    else if (t.research && !s.research.done.includes(t.research)) why = `Research ${RESEARCH_BY_ID[t.research]?.name}`;
    return { t, ok: !why, why };
  });
}

/** Has the player shipped this genre or this topic? (Fit hints unlock with experience.) */
export function knowsCombo(s: GameState, genre: GenreId, topic: string): boolean {
  if (s.progress.researchedCombos?.includes(`${genre}|${topic}`)) return true;
  return Object.values(s.releases).some((r) => r.concept.genre === genre || r.concept.topic === topic);
}

export function fitLabel(fit: number): { label: string; tone: 'good' | 'neutral' | 'bad' | 'gold' } {
  if (fit >= 3) return { label: 'Great', tone: 'gold' };
  if (fit >= 2) return { label: 'Good', tone: 'good' };
  if (fit >= 1) return { label: 'Okay', tone: 'neutral' };
  return { label: 'Poor', tone: 'bad' };
}

export function comboFitValue(genre: GenreId, topic: string): number {
  return TOPIC_BY_ID[topic]?.genreFit[genre] ?? 1;
}

/** Ideal focus for a genre (only revealed once the player has learned it). */
export function idealFocus(genre: GenreId): [Focus3, Focus3, Focus3] {
  const g = GENRE_BY_ID[genre];
  return PHASE_AREAS.map((areas) => {
    const v = areas.map((a) => g.ideal[a]);
    const t = v[0]! + v[1]! + v[2]!;
    const a = Math.round((v[0]! / t) * 100);
    const b = Math.round((v[1]! / t) * 100);
    return [a, b, 100 - a - b] as Focus3;
  }) as [Focus3, Focus3, Focus3];
}

/** How a genre's popularity moved over the last ~6 months (e.g. +0.12 = 12% more popular). 0 without history. */
export function genreMomentum(s: GameState, genre: GenreId): number {
  const h = s.market.trendHistory;
  if (h.length < 2) return 0;
  const now = genrePopularity(s, genre);
  const then = h[Math.max(0, h.length - 7)]!.trend[genre];
  return then ? now / then - 1 : 0;
}

export function genreExperience(s: GameState, genre: GenreId): number {
  return Object.values(s.releases).filter((r) => r.concept.genre === genre).length;
}

const EXPANSION_SUBTITLES = [
  'Beyond the Rift', 'Ashes of Dawn', 'The Sunken Realm', 'Iron Tide', 'Second Wind', 'Into the Deep', 'The Long Night', 'Lost Signals',
  'Heart of Embers', 'New Horizons', 'The Outer Reach', 'Shattered Crown', 'Northern Lights', 'Undertow', 'The Last Harbor', 'Wildlands',
];

/** A suggested subtitle for an expansion pack (stable for a given seed). */
export function expansionSubtitle(seed: number): string {
  return EXPANSION_SUBTITLES[Math.abs(Math.floor(seed)) % EXPANSION_SUBTITLES.length]!;
}

export function estimateCost(s: GameState, size: Size, team: Staff[], workShare = 1): { salaries: number; production: number; total: number; days: number } {
  const days = Math.round(BALANCE.SIZE[size].days * workShare);
  const salaries = team.reduce((t, st) => t + st.salary, 0) * (days / 365);
  const production = sizeDailyCost(size, s.day) * days;
  return { salaries, production, total: salaries + production, days };
}

export function bestSkill(st: Staff): [string, number] {
  let k = 'design';
  let v = -1;
  for (const [kk, vv] of Object.entries(st.skills)) if (vv > v) [k, v] = [kk, vv];
  return [k === 'qa' ? 'QA' : k, Math.round(v)];
}

export function suggestName(seed: number, topic: string): string {
  const A = ['Neon', 'Lost', 'Iron', 'Silent', 'Wild', 'Super', 'Star', 'Shadow', 'Pixel', 'Crystal', 'Thunder', 'Hidden', 'Final', 'Brave', 'Cosmic'];
  const B: Record<string, string[]> = {
    fantasy: ['Kingdom', 'Dragons', 'Runes', 'Quest'],
    scifi: ['Frontier', 'Protocol', 'Colony', 'Signal'],
    space: ['Orbit', 'Galaxy', 'Starfall', 'Voyager'],
    cars: ['Turbo', 'Circuit', 'Drift', 'Velocity'],
    horror: ['Hollow', 'Asylum', 'Whispers', 'Night'],
  };
  // the topic's own words first (every topic has some), then a few generic ones
  const nouns = [...(B[topic] ?? []), ...(TITLE_NOUN[topic] ?? [])];
  const pool = nouns.length ? nouns : ['Legends', 'Odyssey', 'Heroes', 'Saga', 'Rush', 'Tactics', 'Island', 'Empire'];
  const r = (n: number) => {
    // an integer hash: independent values per slot, even for neighbouring seeds
    let h = (Math.imul(seed | 0, 374761393) + Math.imul(n, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noun = pool[Math.floor(r(2) * pool.length)]!;
  const adj = A.filter((x) => x !== noun); // never "Shadow Shadow"
  if (r(3) < 0.25) {
    const others = TITLE_NOUN.default!.filter((x) => x !== noun);
    return `${noun} of the ${adj[Math.floor(r(1) * adj.length)]} ${others[Math.floor(r(4) * others.length)]}`;
  }
  return `${adj[Math.floor(r(1) * adj.length)]} ${noun}`;
}

/**
 * "Inspire me": a promising genre × topic from what the player can already see — trends, combos they've
 * learned, a fresh idea rather than a repeat, and genres the studio knows. Never reveals hidden fits.
 */
export function suggestConcept(s: GameState, rand: () => number = Math.random): { genre: GenreId; topic: string; why: string } | null {
  const genres = availableGenres(s).filter((x) => x.ok).map((x) => x.g);
  const topics = availableTopics(s).filter((x) => x.ok).map((x) => x.t);
  if (!genres.length || !topics.length) return null;
  const recent = s.releaseOrder.slice(-6).map((id) => s.releases[id]!).filter(Boolean);
  const scored: { genre: GenreId; topic: string; score: number; why: string[] }[] = [];
  for (const g of genres)
    for (const t of topics) {
      const why: string[] = [];
      const gp = genrePopularity(s, g.id);
      const tp = topicPopularity(s, t.id);
      let score = gp * Math.sqrt(tp);
      if (gp > 1.15) why.push(`${g.name}s are hot right now`);
      if (tp > 1.15) why.push(`${t.name} is trending`);
      if (knowsCombo(s, g.id, t.id)) {
        const fit = comboFitValue(g.id, t.id);
        if (fit <= 0) continue; // you know this one doesn't work
        score *= [0.5, 0.9, 1.15, 1.35][fit] ?? 1;
        if (fit >= 2) why.push('you’ve seen this pairing work');
      }
      if (recent.some((r) => r.concept.genre === g.id && r.concept.topic === t.id)) score *= 0.5;
      else if (!Object.values(s.releases).some((r) => r.concept.genre === g.id && r.concept.topic === t.id) && s.releaseOrder.length) {
        score *= 1.08;
        why.push('a fresh idea for you');
      }
      const exp = genreExperience(s, g.id);
      if (exp) {
        score *= 1 + Math.min(0.15, exp * 0.05);
        why.push(`your team knows ${g.name}s`);
      }
      scored.push({ genre: g.id, topic: t.id, score, why });
    }
  scored.sort((a, b) => b.score - a.score);
  const pick = scored[Math.floor(rand() * Math.min(6, scored.length))]!;
  return { genre: pick.genre, topic: pick.topic, why: pick.why.slice(0, 2).join(', ') || 'a solid, balanced pick' };
}
