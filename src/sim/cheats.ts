/**
 * Cheats. Every cheat is an ordinary action (so it stays deterministic, saves cleanly and is fuzz-tested);
 * using any of them marks the run (`cheatsUsed`) so the Hall of Fame can tell. Persistent switches live in
 * `s.cheats` and are read by the systems each day.
 */
import { RESEARCH, RESEARCH_BY_ID } from '../data/research';
import { GENRE_BY_ID } from '../data/genres';
import { TOPIC_BY_ID } from '../data/topics';
import { TRAIT_BY_ID, type TraitId } from '../data/traits';
import { ACHIEVEMENTS } from './systems/achievements';
import { SKILLS } from '../data/types';
import { clamp } from './breakdown';
import { fromDay } from './calendar';
import type { Ctx } from './ctx';
import type { CheatSettings, GameProject, GameState, Role } from './types';
import { earn, newId, pushNews } from './util';
import { candidateToStaff, generateCandidate, HIREABLE_ROLES } from './systems/staff';
import { benchmarkPoints, workShare } from './systems/dev';
import { tierDef } from './systems/office';

/** Record that this run used cheats (once). */
export function markCheated(s: GameState): void {
  if (s.cheatsUsed) return;
  s.cheatsUsed = true;
  pushNews(s, { category: 'studio', headline: 'Cheats enabled', body: 'This run is marked as cheated in the Hall of Fame.', tone: 'neutral' });
}

export type CheatOp =
  | { op: 'setCash'; amount: number }
  | { op: 'addCash'; amount: number }
  | { op: 'setReputation'; value: number }
  | { op: 'setFans'; value: number }
  | { op: 'clearLoans' }
  /** Edit one person (or everyone when staffId is omitted). Omitted fields are left alone. */
  | { op: 'staff'; staffId?: string; skills?: number; morale?: number; energy?: number; burnout?: number; potential?: number }
  | { op: 'spawnStaff'; role: Role; skill: number; salary: number; name?: string }
  /** Finish every game in development now. `polish` also tops the effort up to a strong level and clears bugs. */
  | { op: 'finishProjects'; polish: boolean }
  | { op: 'setHype'; value: number }
  /** Complete research: `now` = everything available in the current year; `all` = everything, era be damned. */
  | { op: 'unlockResearch'; scope: 'now' | 'all' }
  | { op: 'franchiseFans'; franchiseId?: string; fans: number }
  /** Edit a released game: review score, user score and/or extra copies sold. */
  | { op: 'editRelease'; releaseId: string; score?: number; userScore?: number; addUnits?: number }
  | { op: 'officeTier'; tier: number }
  /** Edit a rival studio; `close` shuts down an indie (real companies follow history and can only be weakened). */
  | { op: 'rival'; rivalId: string; cash?: number; reputation?: number; quality?: number; staff?: number; close?: boolean }
  /** Push a genre or topic trend (−0.5 cold … +0.8 red-hot), or reset every trend to neutral. */
  | { op: 'trend'; kind: 'genre' | 'topic'; id: string; value: number }
  | { op: 'resetTrends' }
  | { op: 'franchiseFatigue'; franchiseId?: string; value: number }
  | { op: 'staffTraits'; staffId: string; traits: TraitId[] }
  | { op: 'unlockAchievements' }
  | { op: 'settings'; settings: CheatSettings };

export const CHEAT_LIMITS = {
  cash: 1e13,
  fans: 1e10,
  salesMul: [0.1, 20],
  workMul: [0.25, 10],
  researchMul: [0.25, 50],
  scoreBonus: [-40, 40],
  units: 1e9,
} as const;

const finite = (...xs: unknown[]) => xs.every((x) => x === undefined || (typeof x === 'number' && Number.isFinite(x)));
const inRange = (v: number | undefined, [lo, hi]: readonly [number, number]) => v === undefined || (v >= lo && v <= hi);

export function applyCheat(c: Ctx, op: CheatOp): string | null {
  const { s } = c;
  // Mark first: some cheats change several things before they can fail.
  markCheated(s);
  return run(c, op);
}

function run(c: Ctx, op: CheatOp): string | null {
  const { s } = c;
  switch (op.op) {
    case 'setCash':
    case 'addCash': {
      if (!finite(op.amount)) return 'Invalid amount';
      const target = op.op === 'setCash' ? op.amount : s.company.cash + op.amount;
      if (Math.abs(target) > CHEAT_LIMITS.cash) return 'That’s more money than exists';
      // conjured money isn't revenue or a cost: it mustn't inflate trailing revenue, valuation or the IPO
      s.company.cash = Math.round(target);
      if (s.company.cash >= 0) delete s.company.insolventSince;
      return null;
    }
    case 'setReputation':
      if (!finite(op.value)) return 'Invalid value';
      s.company.reputation = clamp(op.value, 0, 100);
      return null;
    case 'setFans':
      if (!finite(op.value) || op.value < 0 || op.value > CHEAT_LIMITS.fans) return 'Invalid fan count';
      s.company.fans = Math.round(op.value);
      return null;
    case 'clearLoans':
      s.finance.loans = [];
      return null;
    case 'staff': {
      if (!finite(op.skills, op.morale, op.energy, op.burnout, op.potential)) return 'Invalid value';
      const people = op.staffId ? [s.staff[op.staffId]].filter((x) => !!x) : Object.values(s.staff);
      if (!people.length) return 'No such person';
      for (const st of people) {
        if (op.skills !== undefined) for (const k of SKILLS) st.skills[k] = clamp(op.skills, 0, 100);
        if (op.potential !== undefined) st.potential = clamp(op.potential, 0, 100);
        if (op.morale !== undefined) st.morale = clamp(op.morale, 0, 100);
        if (op.energy !== undefined) st.energy = clamp(op.energy, 0, 100);
        if (op.burnout !== undefined) st.burnout = clamp(op.burnout, 0, 100);
      }
      return null;
    }
    case 'spawnStaff': {
      if (!HIREABLE_ROLES.includes(op.role)) return 'Unknown role';
      if (!finite(op.skill, op.salary) || op.salary < 0 || op.salary > 1e8) return 'Invalid value';
      if (Object.keys(s.staff).length >= tierDef(s.office.tier).staffCap) return 'Office is at capacity — move to a bigger office first';
      const cand = generateCandidate(s, c.rng, { role: op.role, quality: 100 });
      for (const k of SKILLS) cand.skills[k] = clamp(op.skill, 0, 100);
      cand.potential = Math.max(cand.potential, clamp(op.skill, 0, 100));
      if (op.name?.trim()) cand.name = op.name.trim().slice(0, 40);
      cand.level = op.skill >= 85 ? 'lead' : op.skill >= 65 ? 'senior' : op.skill >= 40 ? 'mid' : 'junior';
      const id = newId(s, 's');
      s.staff[id] = candidateToStaff(s, cand, id, Math.round(op.salary));
      s.staff[id]!.morale = 90;
      return null;
    }
    case 'finishProjects': {
      const todo = Object.values(s.projects).filter((p): p is GameProject => p.kind === 'game' && p.phase < 3);
      const idle = todo.find((p) => p.design + p.tech <= 0);
      if (idle) return `Nobody has worked on ${idle.concept.name} yet — let the team start first`;
      let n = 0;
      for (const p of todo) {
        const total = p.design + p.tech;
        // Extrapolate the work to the end at the current pace; polishing tops effort up to a strong level.
        const prog = Math.max(0.05, (p.phase + p.phaseDay / Math.max(1, p.phaseDays[Math.min(2, p.phase) as 0 | 1 | 2])) / 3);
        const bench = benchmarkPoints(p.concept.size, s.day) * workShare(p.concept);
        let m = 1 / prog;
        if (op.polish) m = Math.max(m, (1.4 * bench) / total);
        m = Math.min(m, 50);
        scale(p, m);
        p.bugs = op.polish ? 0 : p.bugs * m;
        p.phase = 3;
        p.phaseDay = 0;
        p.extraDays = 0;
        p.awaitingGate = false;
        n += 1;
      }
      return n ? null : 'No game is in development';
    }
    case 'setHype': {
      if (!finite(op.value)) return 'Invalid value';
      let n = 0;
      for (const p of Object.values(s.projects))
        if (p.kind === 'game') {
          p.hype = clamp(op.value, 0, 3);
          n += 1;
        }
      return n ? null : 'No game is in development';
    }
    case 'unlockResearch': {
      const yr = fromDay(s.day).year;
      for (const r of RESEARCH) if ((op.scope === 'all' || r.year <= yr) && !s.research.done.includes(r.id)) s.research.done.push(r.id);
      if (s.research.active && s.research.done.includes(s.research.active)) {
        s.research.active = null;
        s.research.progress = 0;
      }
      s.research.queue = s.research.queue.filter((id) => !s.research.done.includes(id) && RESEARCH_BY_ID[id]);
      return null;
    }
    case 'franchiseFans': {
      if (!finite(op.fans) || op.fans < 0 || op.fans > CHEAT_LIMITS.fans) return 'Invalid fan count';
      const frs = op.franchiseId ? [s.franchises[op.franchiseId]].filter((x) => !!x) : Object.values(s.franchises);
      if (!frs.length) return 'No franchise yet';
      for (const f of frs) f.fans = Math.round(op.fans);
      return null;
    }
    case 'editRelease': {
      const r = s.releases[op.releaseId];
      if (!r) return 'No such game';
      if (!finite(op.score, op.userScore, op.addUnits)) return 'Invalid value';
      if (op.score !== undefined) r.score = clamp(Math.round(op.score), 1, 100);
      if (op.userScore !== undefined) r.userScore = clamp(Math.round(op.userScore), 1, 100);
      if (op.addUnits !== undefined && op.addUnits > 0) {
        const add = Math.min(CHEAT_LIMITS.units, Math.round(op.addUnits));
        const ps = r.platforms[0];
        if (!ps) return 'This game has no platforms';
        ps.units += add;
        ps.extraPotential = (ps.extraPotential ?? 0) + add;
        r.units += add;
        const money = add * r.price * 0.5;
        r.gross += add * r.price;
        r.net += money;
        earn(s, 'sales', money);
        s.progress.stats.totalUnits += add;
        s.progress.stats.totalRevenue += money;
      }
      if (r.score > s.progress.stats.bestScore) {
        s.progress.stats.bestScore = r.score;
        s.progress.stats.bestGame = r.name;
      }
      return null;
    }
    case 'rival': {
      const r = s.rivals[op.rivalId];
      if (!r || !r.alive || r.ownedByPlayer) return 'No such rival';
      if (!finite(op.cash, op.reputation, op.quality, op.staff)) return 'Invalid value';
      if (op.close) {
        if (!r.procedural) return `${r.name} is a real company — you can weaken it, but history decides when it closes`;
        r.alive = false;
        pushNews(s, { category: 'rival', headline: `${r.name} closes its doors`, tone: 'neutral' });
        return null;
      }
      if (op.cash !== undefined) r.cash = clamp(op.cash, -CHEAT_LIMITS.cash, CHEAT_LIMITS.cash);
      if (op.reputation !== undefined) r.reputation = clamp(op.reputation, 0, 100);
      if (op.quality !== undefined) r.quality = clamp(op.quality, 0.1, 1);
      if (op.staff !== undefined) r.staff = Math.round(clamp(op.staff, 3, 8_000));
      return null;
    }
    case 'trend': {
      if (!finite(op.value)) return 'Invalid value';
      const v = clamp(op.value, -0.5, 0.8);
      if (op.kind === 'genre') {
        if (!GENRE_BY_ID[op.id as keyof typeof GENRE_BY_ID]) return 'Unknown genre';
        s.market.genreTrend[op.id as keyof typeof s.market.genreTrend] = v;
      } else if (op.kind === 'topic') {
        if (!TOPIC_BY_ID[op.id]) return 'Unknown topic';
        s.market.topicTrend[op.id] = v;
      } else return 'Unknown trend';
      return null;
    }
    case 'resetTrends':
      for (const k of Object.keys(s.market.genreTrend)) s.market.genreTrend[k as keyof typeof s.market.genreTrend] = 0;
      for (const k of Object.keys(s.market.topicTrend)) s.market.topicTrend[k] = 0;
      return null;
    case 'franchiseFatigue': {
      if (!finite(op.value)) return 'Invalid value';
      const frs = op.franchiseId ? [s.franchises[op.franchiseId]].filter((x) => !!x) : Object.values(s.franchises);
      if (!frs.length) return 'No franchise yet';
      for (const f of frs) f.fatigue = clamp(op.value, 0, 0.9);
      return null;
    }
    case 'staffTraits': {
      const st = s.staff[op.staffId];
      if (!st) return 'No such person';
      if (!Array.isArray(op.traits) || op.traits.length > 4) return 'Pick up to 4 traits';
      const uniq = [...new Set(op.traits)];
      for (const id of uniq) {
        const def = TRAIT_BY_ID[id];
        if (!def) return 'Unknown trait';
        const clash = def.excludes?.find((x) => uniq.includes(x));
        if (clash) return `${def.name} and ${TRAIT_BY_ID[clash].name} can’t go together`;
      }
      st.traits = uniq;
      return null;
    }
    case 'unlockAchievements':
      for (const a of ACHIEVEMENTS) if (s.progress.achievements[a.id] === undefined) s.progress.achievements[a.id] = s.day;
      return null;
    case 'officeTier':
      return 'Handled by the action layer';
    case 'settings': {
      const st = op.settings ?? {};
      if (!finite(st.moneyFloor, st.salesMul, st.workMul, st.researchMul, st.scoreBonus)) return 'Invalid value';
      if (!inRange(st.salesMul, CHEAT_LIMITS.salesMul)) return 'Sales multiplier out of range';
      if (!inRange(st.workMul, CHEAT_LIMITS.workMul)) return 'Work multiplier out of range';
      if (!inRange(st.researchMul, CHEAT_LIMITS.researchMul)) return 'Research multiplier out of range';
      if (!inRange(st.scoreBonus, CHEAT_LIMITS.scoreBonus)) return 'Score bonus out of range';
      if (st.moneyFloor !== undefined && (st.moneyFloor < 0 || st.moneyFloor > CHEAT_LIMITS.cash)) return 'Invalid money floor';
      const BOOLS = ['infiniteMoney', 'noBankruptcy', 'noBurnout', 'alwaysHappy', 'noBugs', 'noEvents', 'freeBuild'] as const;
      const next: CheatSettings = { ...s.cheats };
      for (const k of BOOLS) if (k in st) next[k] = !!st[k];
      for (const k of ['moneyFloor', 'salesMul', 'workMul', 'researchMul', 'scoreBonus'] as const) if (k in st) next[k] = st[k];
      s.cheats = next;
      if (next.noBankruptcy) delete s.company.insolventSince;
      return null;
    }
    default:
      return 'Unknown cheat';
  }
}

function scale(p: { design: number; tech: number; points: Record<string, number> }, m: number): void {
  p.design *= m;
  p.tech *= m;
  for (const k of Object.keys(p.points)) p.points[k] = (p.points[k] ?? 0) * m;
}

// ── Hooks read by the systems ──────────────────────────────────────────────

export const cheatSalesMul = (s: GameState) => s.cheats?.salesMul ?? 1;
export const cheatWorkMul = (s: GameState) => s.cheats?.workMul ?? 1;
export const cheatResearchMul = (s: GameState) => s.cheats?.researchMul ?? 1;
export const cheatScoreBonus = (s: GameState) => s.cheats?.scoreBonus ?? 0;

/** Daily upkeep for persistent cheats (after the day's simulation). */
export function cheatsDaily(s: GameState): void {
  const ch = s.cheats;
  if (!ch) return;
  if (ch.infiniteMoney) {
    const floor = ch.moneyFloor ?? 1_000_000;
    if (s.company.cash < floor) s.company.cash = floor; // topped up off the books (not revenue)
    delete s.company.insolventSince;
  }
  if (ch.noBankruptcy) delete s.company.insolventSince;
  if (ch.noBurnout || ch.alwaysHappy)
    for (const st of Object.values(s.staff)) {
      if (ch.noBurnout) {
        st.burnout = 0;
        st.energy = 100;
      }
      if (ch.alwaysHappy) st.morale = 100;
    }
  if (ch.noBugs) for (const p of Object.values(s.projects)) if (p.kind === 'game') p.bugs = 0;
}
