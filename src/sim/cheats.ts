/**
 * Cheats. Every cheat is an ordinary action (so it stays deterministic, saves cleanly and is fuzz-tested);
 * using any of them marks the run (`cheatsUsed`) so the Hall of Fame can tell. Persistent switches live in
 * `s.cheats` and are read by the systems each day.
 */
import { RESEARCH, RESEARCH_BY_ID } from '../data/research';
import { SKILLS } from '../data/types';
import { clamp } from './breakdown';
import { fromDay } from './calendar';
import type { Ctx } from './ctx';
import type { CheatSettings, GameState, Role } from './types';
import { earn, newId, pushNews, spend } from './util';
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
  const err = run(c, op);
  if (err) return err;
  markCheated(s);
  return null;
}

function run(c: Ctx, op: CheatOp): string | null {
  const { s } = c;
  switch (op.op) {
    case 'setCash':
    case 'addCash': {
      if (!finite(op.amount)) return 'Invalid amount';
      const target = op.op === 'setCash' ? op.amount : s.company.cash + op.amount;
      if (Math.abs(target) > CHEAT_LIMITS.cash) return 'That’s more money than exists';
      const delta = target - s.company.cash;
      if (delta > 0) earn(s, 'other_income', delta);
      else if (delta < 0) spend(s, 'other_expense', -delta);
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
      let n = 0;
      for (const p of Object.values(s.projects)) {
        if (p.kind !== 'game' || p.phase >= 3) continue;
        const total = p.design + p.tech;
        if (total <= 0) return `Nobody has worked on ${p.concept.name} yet — let the team start first`;
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
    if (s.company.cash < floor) earn(s, 'other_income', floor - s.company.cash);
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
