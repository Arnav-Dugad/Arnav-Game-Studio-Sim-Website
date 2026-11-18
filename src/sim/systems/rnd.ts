/**
 * R&D programmes: once a studio has worked through most of the tech tree, its researchers can keep pushing on
 * five long-running lines — each level a little better than the last, each costing more. They give researchers
 * something worth doing for decades, and give a rich studio something worth spending on. Ten levels each.
 */
import type { GameState } from '../types';
import { money, payResearch } from '../util';

export interface RndDef {
  id: string;
  name: string;
  desc: string;
  /** What `level` levels give, in words. */
  effect: (level: number) => string;
  points: number;
  cost: number; // 1980 dollars, level 0
}

export const RND: RndDef[] = [
  { id: 'rd_pipeline', name: 'Production pipeline', desc: 'Build farms, asset tools and automation: every team gets more done each day.', effect: (l) => `+${l * 2}% development speed`, points: 600, cost: 80_000 },
  { id: 'rd_engine', name: 'Engine R&D', desc: 'A dedicated engine group keeps your tech a step ahead: every game is a little better.', effect: (l) => `+${(l * 0.5).toFixed(1)}% game quality`, points: 700, cost: 100_000 },
  { id: 'rd_qa', name: 'Test automation', desc: 'Automated test suites catch bugs the moment they’re written.', effect: (l) => `−${l * 4}% bugs`, points: 500, cost: 60_000 },
  { id: 'rd_liveops', name: 'Player analytics', desc: 'Know what players do, and keep them playing: more from every live game.', effect: (l) => `+${l * 3}% live income`, points: 550, cost: 70_000 },
  { id: 'rd_market', name: 'Market research', desc: 'Panels, data and timing: every launch finds a few more buyers.', effect: (l) => `+${(l * 1.5).toFixed(1)}% launch sales`, points: 550, cost: 70_000 },
];
export const RND_BY_ID: Record<string, RndDef> = Object.fromEntries(RND.map((r) => [r.id, r]));
export const RND_MAX = 10;
/** Research projects finished before R&D programmes open up. */
export const RND_UNLOCK = 25;

export function rndLevel(s: GameState, id: string): number {
  return s.research.levels?.[id] ?? 0;
}

export function rndPoints(s: GameState, id: string): number {
  const d = RND_BY_ID[id];
  return d ? Math.round(d.points * Math.pow(1.45, rndLevel(s, id))) : 0;
}

export function rndCost(s: GameState, id: string): number {
  const d = RND_BY_ID[id];
  return d ? Math.round(money(d.cost, s.day) * Math.pow(1.5, rndLevel(s, id))) : 0;
}

export function rndUnlocked(s: GameState): boolean {
  return s.research.done.length >= RND_UNLOCK;
}

export function rndBlocked(s: GameState, id: string): string | null {
  if (!RND_BY_ID[id]) return 'Unknown programme';
  if (!rndUnlocked(s)) return `Opens after ${RND_UNLOCK} research projects`;
  if (rndLevel(s, id) >= RND_MAX) return 'Fully developed';
  if (s.research.active) return 'Your researchers are busy — finish or stop the current project first';
  if (s.company.cash < rndCost(s, id)) return 'Not enough cash';
  return null;
}

export function startRnd(s: GameState, id: string): string | null {
  const why = rndBlocked(s, id);
  if (why) return why;
  payResearch(s, id, rndCost(s, id));
  s.research.active = id;
  s.research.progress = 0;
  return null;
}

/** Any programme that could start now (ignoring cash and whether research is busy)? */
export function rndOpen(s: GameState): boolean {
  return rndUnlocked(s) && RND.some((r) => rndLevel(s, r.id) < RND_MAX);
}

// effects
export const rndSpeed = (s: GameState) => 1 + 0.02 * rndLevel(s, 'rd_pipeline');
export const rndQuality = (s: GameState) => 1 + 0.005 * rndLevel(s, 'rd_engine');
export const rndBugs = (s: GameState) => 1 - 0.04 * rndLevel(s, 'rd_qa');
export const rndLive = (s: GameState) => 1 + 0.03 * rndLevel(s, 'rd_liveops');
export const rndSales = (s: GameState) => 1 + 0.015 * rndLevel(s, 'rd_market');
