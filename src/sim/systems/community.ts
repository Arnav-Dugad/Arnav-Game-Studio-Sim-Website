/**
 * Player community (2005+): found an official community hub — forums, later a chat server — and keep it healthy.
 * Members come from your fans; health (0..100) follows how players feel about you: great games, patches and live
 * events help, crunch scandals and disappointing launches hurt, and moderators (a monthly budget) keep it civil.
 * A healthy community lifts user scores and crowdfunding and shrugs off review bombs; a toxic one does the opposite.
 */
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState } from '../types';
import { money, pushNews, spend } from '../util';

export const COMMUNITY_YEAR = 2005;
export const MOD_BUDGET = [0, 1_500, 5_000] as const; // 1980 dollars per month
export type ModLevel = 0 | 1 | 2;

export function hubName(s: GameState): string {
  return fromDay(s.day).year >= 2016 ? 'community server' : 'community forums';
}

export function communityCost(s: GameState): number {
  return money(4_000, s.day);
}

export function communityBlocked(s: GameState): string | null {
  if (fromDay(s.day).year < COMMUNITY_YEAR) return `Online communities take off around ${COMMUNITY_YEAR}`;
  if (s.community) return 'You already run a community';
  if (!s.releaseOrder.length) return 'Ship a game first — there’s nobody to talk about yet';
  if (s.company.cash < communityCost(s)) return 'Not enough cash';
  return null;
}

export function foundCommunity(s: GameState): string | null {
  const why = communityBlocked(s);
  if (why) return why;
  spend(s, 'marketing', communityCost(s));
  s.community = { founded: s.day, members: Math.round(s.company.fans * 0.01), health: 60, mods: 1, mood: 0 };
  pushNews(s, { category: 'studio', headline: `${s.company.name} opens official ${hubName(s)}`, body: 'Fans finally have a place to gather — and to tell you exactly what they think.', tone: 'good' });
  return null;
}

/** A one-off swing in community mood (a scandal, a beloved patch…); fades over a couple of months. */
export function communityNudge(s: GameState, v: number): void {
  if (!s.community) return;
  s.community.mood = clamp((s.community.mood ?? 0) + v, -40, 40);
}

/** Weekly: members follow fans; health drifts toward a target set by recent games, mood and moderation. */
export function communityWeekly(c: Ctx): void {
  const { s } = c;
  const cm = s.community;
  if (!cm) return;
  const target = Math.round(s.company.fans * (0.02 + 0.015 * cm.mods));
  cm.members = Math.max(0, Math.round(cm.members + (target - cm.members) * 0.05));
  const recent = s.releaseOrder.slice(-3).map((id) => s.releases[id]!).filter((r) => r && s.day - r.day < 540);
  const avgUser = recent.length ? recent.reduce((t, r) => t + r.userScore, 0) / recent.length : 65;
  const goal = clamp(45 + (avgUser - 65) * 0.8 + cm.mods * 8 + (cm.mood ?? 0), 5, 98);
  cm.health = Math.round((cm.health + (goal - cm.health) * 0.08) * 10) / 10;
  cm.mood = Math.round((cm.mood ?? 0) * 0.9 * 10) / 10;
  if (cm.health < 30 && !cm.toxicWarned) {
    cm.toxicWarned = true;
    pushNews(s, { category: 'studio', headline: `Your ${hubName(s)} has turned toxic`, body: 'Threads full of anger. More moderators and better games would help — and expect review bombs.', tone: 'bad' });
  } else if (cm.health > 45) cm.toxicWarned = false;
}

/** Monthly: pay the moderators. */
export function communityMonthly(s: GameState): void {
  const cm = s.community;
  if (!cm || !cm.mods) return;
  spend(s, 'marketing', money(MOD_BUDGET[cm.mods], s.day));
}

export function setModeration(s: GameState, level: ModLevel): string | null {
  if (!s.community) return 'Found a community first';
  if (level !== 0 && level !== 1 && level !== 2) return 'Pick a moderation level';
  s.community.mods = level;
  return null;
}

/** User-score effect of community health at launch (−2..+2). */
export function communityUserBonus(s: GameState): number {
  const cm = s.community;
  if (!cm || cm.members < 100) return 0;
  return clamp(Math.round(((cm.health - 55) / 20) * 10) / 10, -2, 2);
}

/** Crowdfunding pull from the community (×0.85..×1.25). */
export function communityPledgeMul(s: GameState): number {
  const cm = s.community;
  if (!cm) return 1;
  return clamp(0.85 + cm.health / 250 + Math.min(0.05, cm.members / 2_000_000), 0.85, 1.25);
}
