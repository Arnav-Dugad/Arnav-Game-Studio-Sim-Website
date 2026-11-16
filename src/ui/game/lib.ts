/** UI-side helpers that derive presentation data from the sim (pure functions). */
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

export function genreExperience(s: GameState, genre: GenreId): number {
  return Object.values(s.releases).filter((r) => r.concept.genre === genre).length;
}

export function estimateCost(s: GameState, size: Size, team: Staff[], remaster = false): { salaries: number; production: number; total: number; days: number } {
  const days = Math.round(BALANCE.SIZE[size].days * (remaster ? BALANCE.REMASTER_WORK : 1));
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
  const nouns = B[topic] ?? ['Legends', 'Odyssey', 'Heroes', 'Saga', 'Rush', 'Tactics', 'Island', 'Empire'];
  const r = (n: number) => Math.abs(Math.sin(seed * 9301 + n * 49297)) % 1;
  return `${A[Math.floor(r(1) * A.length)]} ${nouns[Math.floor(r(2) * nouns.length)]}`;
}
