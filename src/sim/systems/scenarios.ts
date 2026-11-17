/**
 * Scenarios: curated challenges with a starting setup, goals and a deadline. Goals are checked monthly and
 * stay met once reached; meet them all and you win, reach the deadline without them and you fail. Either
 * way you can keep playing.
 */
import type { GenreId } from '../../data/types';
import type { RegionId } from '../../data/regions';
import type { CultureId } from '../../data/culture';
import { fromDay, toDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState, Release, Size } from '../types';
import { fmtMoney, fmtUnits, money, pushNews } from '../util';
import { ownerValue } from './finance';
import { checkAchievements } from './achievements';

export type GoalDef =
  | { kind: 'releases'; n: number }
  | { kind: 'cash'; amount: number }
  | { kind: 'valuation'; amount: number }
  | { kind: 'score'; score: number; genre?: GenreId; sizes?: Size[] }
  | { kind: 'genreHits'; genre: GenreId; score: number; n: number }
  | { kind: 'units'; units: number }
  | { kind: 'totalUnits'; units: number }
  | { kind: 'goty'; n: number; sizes?: Size[] }
  | { kind: 'staff'; n: number }
  | { kind: 'crowdfunded'; amount: number }
  | { kind: 'eaHit'; score: number }
  | { kind: 'seriesFans'; fans: number }
  | { kind: 'mediaHits'; n: number }
  | { kind: 'classics'; n: number };

export interface ScenarioDef {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Legendary';
  year: number;
  /** Deadline (start of this year). */
  until: number;
  home?: RegionId;
  /** Starting cash in 1980 dollars, reputation, office tier, extra hires (and their quality), research. */
  cash?: number;
  reputation?: number;
  tier?: number;
  hires?: number;
  hireQuality?: number;
  research?: string[];
  values?: CultureId[];
  goals: GoalDef[];
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'garage',
    name: 'Garage Days',
    tagline: 'Ship three games and bank a quarter million.',
    blurb: 'Just you, a beige computer and a dream. Learn the ropes: ship games, take contracts, grow carefully.',
    difficulty: 'Easy',
    year: 1980,
    until: 1986,
    goals: [{ kind: 'releases', n: 3 }, { kind: 'cash', amount: 250_000 }],
  },
  {
    id: 'crash',
    name: 'Crash Survivor',
    tagline: 'The market is about to collapse. Come out stronger.',
    blurb: 'It’s 1982, the shelves are full of junk and the crash is coming. Keep the lights on, then prove quality still sells.',
    difficulty: 'Medium',
    year: 1982,
    until: 1988,
    cash: 45_000,
    reputation: 8,
    tier: 2,
    hires: 3,
    goals: [{ kind: 'cash', amount: 1_000_000 }, { kind: 'score', score: 80 }],
  },
  {
    id: 'rising_sun',
    name: 'Rising Sun',
    tagline: 'Build Japan’s greatest RPG house.',
    blurb: 'A Tokyo studio in 1988, with a small team that lives and breathes role-playing games. Make the RPGs a generation will remember.',
    difficulty: 'Hard',
    year: 1988,
    until: 1999,
    home: 'jp',
    cash: 220_000,
    reputation: 15,
    tier: 2,
    hires: 5,
    hireQuality: 0.2,
    goals: [{ kind: 'genreHits', genre: 'rpg', score: 85, n: 3 }, { kind: 'units', units: 2_000_000 }],
  },
  {
    id: 'third_dimension',
    name: 'The 3D Gamble',
    tagline: 'Bet everything on polygons.',
    blurb: '1994: the industry is about to go 3D and you have a war chest and a big team. Ship a masterpiece and become a giant before the decade turns.',
    difficulty: 'Hard',
    year: 1994,
    until: 2003,
    cash: 1_200_000,
    reputation: 30,
    tier: 3,
    hires: 12,
    hireQuality: 0.3,
    goals: [{ kind: 'score', score: 90 }, { kind: 'valuation', amount: 100_000_000 }],
  },
  {
    id: 'indie',
    name: 'Indie Darling',
    tagline: 'Two people, one Game of the Year.',
    blurb: '2008: digital stores are open to everyone. With a tiny team and a love for players, win Game of the Year with a small or medium game.',
    difficulty: 'Hard',
    year: 2008,
    until: 2019,
    cash: 40_000,
    reputation: 12,
    hires: 1,
    hireQuality: 0.35,
    values: ['players'],
    goals: [{ kind: 'goty', n: 1, sizes: ['small', 'medium'] }],
  },
  {
    id: 'gold_rush',
    name: 'Mobile Gold Rush',
    tagline: 'Everyone has a game machine in their pocket now.',
    blurb: '2009: phones are the new frontier. Sell 25 million copies across your games and build a half-billion-dollar company.',
    difficulty: 'Medium',
    year: 2009,
    until: 2017,
    cash: 120_000,
    reputation: 18,
    tier: 2,
    hires: 4,
    goals: [{ kind: 'totalUnits', units: 25_000_000 }, { kind: 'valuation', amount: 500_000_000 }],
  },
  {
    id: 'kickstarter',
    name: 'Kickstarter Kid',
    tagline: 'Let the fans fund your dream.',
    blurb: '2012: crowdfunding has arrived. A two-person studio with more ideas than money — pitch your games to players, raise three-quarters of a million dollars and ship an 80+ game.',
    difficulty: 'Medium',
    year: 2012,
    until: 2020,
    cash: 12_000,
    reputation: 14,
    hires: 1,
    hireQuality: 0.3,
    research: ['biz_self_publishing'],
    goals: [{ kind: 'crowdfunded', amount: 750_000 }, { kind: 'score', score: 80 }],
  },
  {
    id: 'early_access',
    name: 'Early Access Odyssey',
    tagline: 'Build it with the players.',
    blurb: '2013: sell your game while you make it. Grow an Early Access game into an 85+ hit and sell two million copies along the way.',
    difficulty: 'Medium',
    year: 2013,
    until: 2022,
    cash: 60_000,
    reputation: 16,
    hires: 3,
    hireQuality: 0.25,
    research: ['biz_self_publishing'],
    goals: [{ kind: 'eaHit', score: 85 }, { kind: 'totalUnits', units: 2_000_000 }],
  },
  {
    id: 'mogul',
    name: 'Media Mogul',
    tagline: 'Games are just the beginning.',
    blurb: '1995: build a series the world adores — two million fans — then take it everywhere: toys, cartoons, films. Land three licensing hits.',
    difficulty: 'Hard',
    year: 1995,
    until: 2012,
    cash: 500_000,
    reputation: 28,
    tier: 3,
    hires: 9,
    hireQuality: 0.3,
    goals: [{ kind: 'seriesFans', fans: 2_000_000 }, { kind: 'mediaHits', n: 3 }],
  },
  {
    id: 'timeless',
    name: 'Timeless',
    tagline: 'Make games that outlive you.',
    blurb: '1984: forget the quick buck. Make two games so good they’re inducted into the Golden Pixel Hall of Classics — ten years after release — before 2012.',
    difficulty: 'Legendary',
    year: 1984,
    until: 2012,
    cash: 30_000,
    reputation: 10,
    hires: 2,
    goals: [{ kind: 'classics', n: 2 }],
  },
  {
    id: 'empire',
    name: 'Empire',
    tagline: 'From the garage to the biggest studio on Earth.',
    blurb: 'The whole story, with the bar set at legend: three Games of the Year, 300 people and a ten-billion-dollar valuation by 2027.',
    difficulty: 'Legendary',
    year: 1980,
    until: 2027,
    goals: [{ kind: 'goty', n: 3 }, { kind: 'staff', n: 300 }, { kind: 'valuation', amount: 10_000_000_000 }],
  },
];

export const SCENARIO_BY_ID: Record<string, ScenarioDef> = Object.fromEntries(SCENARIOS.map((x) => [x.id, x]));

const rels = (s: GameState): Release[] => s.releaseOrder.map((id) => s.releases[id]!).filter(Boolean);
const sizeOk = (r: Release, sizes?: Size[]) => !sizes || sizes.includes(r.concept.size);
const isGoty = (r: Release) => r.awards.includes('Game of the Year');

/** Progress toward a goal (0..1) and how to describe it. Money goals are in nominal dollars. */
export function goalProgress(s: GameState, g: GoalDef): { p: number; text: string; now: string } {
  switch (g.kind) {
    case 'releases': {
      const n = s.releaseOrder.length;
      return { p: n / g.n, text: `Release ${g.n} games`, now: `${n}/${g.n}` };
    }
    case 'cash': {
      const net = s.company.cash - s.finance.loans.reduce((t, l) => t + l.remaining, 0);
      return { p: net / g.amount, text: `Have ${fmtMoney(g.amount)} in the bank (net of loans)`, now: fmtMoney(net) };
    }
    case 'valuation': {
      const v = ownerValue(s);
      return { p: v / g.amount, text: `Reach a ${fmtMoney(g.amount)} valuation`, now: fmtMoney(v) };
    }
    case 'score': {
      const best = Math.max(0, ...rels(s).filter((r) => (!g.genre || r.concept.genre === g.genre) && sizeOk(r, g.sizes)).map((r) => r.score));
      return { p: best / g.score, text: `Release a ${g.score}+ game${g.genre ? ` (${g.genre})` : ''}`, now: best ? `best ${best}` : 'none yet' };
    }
    case 'genreHits': {
      const n = rels(s).filter((r) => r.concept.genre === g.genre && r.score >= g.score).length;
      return { p: n / g.n, text: `Release ${g.n} ${g.genre.toUpperCase()}s scoring ${g.score}+`, now: `${n}/${g.n}` };
    }
    case 'units': {
      const best = Math.max(0, ...rels(s).map((r) => r.units));
      return { p: best / g.units, text: `Sell ${fmtUnits(g.units)} copies of one game`, now: fmtUnits(best) };
    }
    case 'totalUnits': {
      const n = s.progress.stats.totalUnits;
      return { p: n / g.units, text: `Sell ${fmtUnits(g.units)} copies in total`, now: fmtUnits(n) };
    }
    case 'goty': {
      const n = rels(s).filter((r) => isGoty(r) && sizeOk(r, g.sizes)).length;
      return { p: n / g.n, text: `Win Game of the Year${g.n > 1 ? ` ${g.n} times` : ''}${g.sizes ? ' with a small or medium game' : ''}`, now: `${n}/${g.n}` };
    }
    case 'staff': {
      const n = Object.values(s.staff).filter((x) => !x.intern).length;
      return { p: n / g.n, text: `Employ ${g.n} people`, now: `${n}/${g.n}` };
    }
    case 'crowdfunded': {
      const n = s.progress.stats.crowdfunded ?? 0;
      return { p: n / g.amount, text: `Raise ${fmtMoney(g.amount)} from backers (crowdfunding)`, now: fmtMoney(n) };
    }
    case 'eaHit': {
      const best = Math.max(0, ...rels(s).filter((r) => (r.earlyAccess?.weeks ?? 0) >= 12).map((r) => r.score));
      return { p: best / g.score, text: `Ship a game out of Early Access (12+ weeks) scoring ${g.score}+`, now: best ? `best ${best}` : 'none yet' };
    }
    case 'seriesFans': {
      const best = Math.max(0, ...Object.values(s.franchises).map((f) => f.fans));
      return { p: best / g.fans, text: `Grow one series to ${fmtUnits(g.fans)} fans`, now: fmtUnits(best) };
    }
    case 'mediaHits': {
      const n = (s.mediaDeals ?? []).filter((d) => d.outcome === 'hit').length;
      return { p: n / g.n, text: `Land ${g.n} licensing hits (Company → IP)`, now: `${n}/${g.n}` };
    }
    case 'classics': {
      const n = s.progress.stats.classics ?? 0;
      return { p: n / g.n, text: `Get ${g.n} game${g.n > 1 ? 's' : ''} into the Hall of Classics`, now: `${n}/${g.n}` };
    }
  }
}

/** Monthly: tick goals; win when all are met, fail at the deadline. */
export function scenarioMonthly(c: Ctx): void {
  const { s } = c;
  const sc = s.scenario;
  if (!sc || sc.result) return;
  const def = SCENARIO_BY_ID[sc.id];
  if (!def) return;
  def.goals.forEach((g, i) => {
    // money and headcount have to last: three monthly checks in a row
    const sustained = g.kind === 'cash' || g.kind === 'valuation' || g.kind === 'staff';
    if (sc.met[i] !== undefined) return;
    const ok = goalProgress(s, g).p >= 1;
    const hold = (sc.hold ??= {});
    hold[i] = ok ? (hold[i] ?? 0) + 1 : 0;
    if (ok && (!sustained || hold[i]! >= 3)) {
      sc.met[i] = s.day;
      pushNews(s, { category: 'studio', headline: `Scenario goal met: ${goalProgress(s, g).text}`, tone: 'good' });
    }
  });
  const all = def.goals.every((_, i) => sc.met[i] !== undefined);
  if (all) {
    sc.result = 'won';
    checkAchievements(c);
    s.status = 'retired';
    s.endReason = `Scenario complete: ${def.name}, with ${Math.max(0, Math.round((sc.deadlineDay - s.day) / 365))} years to spare.`;
    c.out.push({ type: 'gameOver', reason: s.endReason });
  } else if (s.day >= sc.deadlineDay) {
    sc.result = 'failed';
    s.status = 'retired';
    s.endReason = `Scenario failed: ${def.name} — the deadline passed with ${def.goals.length - Object.keys(sc.met).length} goal${def.goals.length - Object.keys(sc.met).length === 1 ? '' : 's'} left.`;
    c.out.push({ type: 'gameOver', reason: s.endReason });
  }
}

export function scenarioDeadline(def: ScenarioDef): number {
  return toDay(def.until, 1, 1);
}

export function yearsLeft(s: GameState): number {
  return s.scenario ? Math.max(0, fromDay(s.scenario.deadlineDay).year - fromDay(s.day).year) : 0;
}

export const scenarioCash = (def: ScenarioDef, day: number) => (def.cash !== undefined ? money(def.cash, day) : undefined);
