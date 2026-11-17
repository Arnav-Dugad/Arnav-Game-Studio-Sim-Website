/**
 * Public demos (1990+): let players try an announced game during polish. A demo tells the truth — a great game
 * wins people over (hype and a wave of interest), a mediocre one is shrugged at, and a weak one puts people off.
 * Once per game, and the demo is what it is: the estimate you see is what players play.
 */
import { fromDay } from '../calendar';
import type { GameProject, GameState } from '../types';
import { money, pushNews, spend } from '../util';
import { qualityToScore } from './dev';

export const DEMO_YEAR = 1990;

export function demoCost(s: GameState): number {
  return money(3_000, s.day);
}

export function demoBlocked(s: GameState, p: GameProject): string | null {
  if (fromDay(s.day).year < DEMO_YEAR) return `Playable demos catch on around ${DEMO_YEAR}`;
  if (p.demo) return 'Already released a demo';
  if (p.announcedDay === undefined) return 'Announce it first — nobody downloads a demo of a game they’ve never heard of';
  if (p.phase < 2) return 'Wait until polish: there has to be something to play';
  if (s.company.cash < demoCost(s)) return 'Not enough cash';
  return null;
}

/** How players take the demo, from the game as it is today. */
export function demoReception(score: number): { hype: number; tone: 'good' | 'neutral' | 'bad'; text: string } {
  if (score >= 75) return { hype: 0.35, tone: 'good', text: 'Players love it — wishlists are pouring in.' };
  if (score >= 60) return { hype: 0.08, tone: 'neutral', text: 'A decent response: some interest, no fireworks.' };
  return { hype: -0.25, tone: 'bad', text: 'Players found it rough. Some have quietly lost interest.' };
}

export function releaseDemo(s: GameState, projectId: string): string | null {
  const p = s.projects[projectId];
  if (!p || p.kind !== 'game') return 'No such game';
  const why = demoBlocked(s, p);
  if (why) return why;
  spend(s, 'marketing', demoCost(s));
  const score = p.qualityPreview ? Math.round(qualityToScore(p.qualityPreview.total)) : 50;
  const r = demoReception(score);
  p.demo = { day: s.day, score };
  p.hype = Math.max(0, Math.min(3, p.hype + r.hype));
  pushNews(s, { category: 'studio', headline: `${p.concept.name} demo released`, body: r.text, tone: r.tone });
  return null;
}
