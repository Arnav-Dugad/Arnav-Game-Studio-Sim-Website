/**
 * Quarterly objectives: three bite-sized goals each quarter, picked to fit the studio right now (ship a
 * game, lift morale, grow the team, build cash, finish research, release something good, win fans…).
 * Meeting one pays a small reward on the spot; whatever's left lapses when the quarter ends.
 */
import { tierDef } from './office';
import { RESEARCH, RESEARCH_BY_ID } from '../../data/research';
import { researchAvailable } from './research';
import { clamp } from '../breakdown';
import type { Ctx } from '../ctx';
import type { GameState, Objective, ObjectiveKind } from '../types';

export type { Objective, ObjectiveKind } from '../types';
import { addRep, fmtMoney, fmtRepGain, money, pushNews, repGain } from '../util';

export interface ObjectiveReward {
  rep: number;
  morale: number;
  cash: number;
}

const avgMorale = (s: GameState) => {
  const l = Object.values(s.staff);
  return l.length ? l.reduce((t, x) => t + x.morale, 0) / l.length : 0;
};

/** Current value a goal is measured by. */
export function objectiveValue(s: GameState, kind: ObjectiveKind): number {
  switch (kind) {
    case 'ship':
      return s.releaseOrder.length;
    case 'score':
      return Math.max(0, ...s.releaseOrder.slice(-3).map((id) => s.releases[id]?.score ?? 0));
    case 'morale':
      return avgMorale(s);
    case 'hire':
      return s.progress.stats.staffHired;
    case 'cash':
      return s.company.cash - s.finance.loans.reduce((t, l) => t + l.remaining, 0); // borrowing doesn't count
    case 'research':
      return s.progress.stats.researchDone;
    case 'fans':
      return s.company.fans;
    case 'contract':
      return s.progress.stats.contractsDone;
  }
}

export function objectiveText(o: Objective): string {
  switch (o.kind) {
    case 'ship':
      return 'Ship a game';
    case 'score':
      return `Release a game scoring ${o.target}+`;
    case 'morale':
      return `Get average morale to ${o.target}%`;
    case 'hire':
      return `Hire ${o.target - o.base} ${o.target - o.base === 1 ? 'person' : 'people'}`;
    case 'cash':
      return `Grow cash (net of loans) to ${fmtMoney(o.target)}`;
    case 'research':
      return `Finish ${o.target - o.base} research project${o.target - o.base === 1 ? '' : 's'}`;
    case 'fans':
      return `Win ${Math.round((o.target - o.base) / 1000)}k new fans`;
    case 'contract':
      return 'Complete a contract';
  }
}

/** Progress 0..1. */
export function objectiveProgress(s: GameState, o: Objective): number {
  if (o.done !== undefined) return 1;
  const v = objectiveValue(s, o.kind);
  if (o.kind === 'score' || o.kind === 'morale' || o.kind === 'cash') return clamp(v / o.target, 0, 1);
  return clamp((v - o.base) / Math.max(1, o.target - o.base), 0, 1);
}

export function objectiveReward(s: GameState): ObjectiveReward {
  // goals help a young studio find its feet; they matter less to an established name
  return { rep: Math.round(Math.max(0.2, 1 - s.company.reputation / 70) * 10) / 10, morale: 2, cash: Math.round(money(4_000, s.day) * (1 + s.company.reputation / 25)) };
}

/** Start of each quarter: lapse the old goals and set three new ones that fit the studio. */
export function objectivesQuarterly(c: Ctx): void {
  const { s, rng } = c;
  const until = s.day + 90;
  const staffN = Object.keys(s.staff).length;
  const pool: { w: number; make: () => Objective }[] = [];
  const shipping = Object.values(s.projects).some((p) => p.kind === 'game' && p.phase >= 1);
  if (shipping) pool.push({ w: 3, make: () => ({ kind: 'ship', base: s.releaseOrder.length, target: s.releaseOrder.length + 1, until }) });
  if (s.releaseOrder.length) {
    const best = Math.max(0, ...s.releaseOrder.slice(-3).map((id) => s.releases[id]?.score ?? 0));
    pool.push({ w: shipping ? 2 : 0.5, make: () => ({ kind: 'score', base: 0, target: clamp(Math.round(best / 5) * 5 + 5, 60, 90), until }) });
  }
  const m = avgMorale(s);
  if (staffN >= 3 && m < 80) pool.push({ w: m < 55 ? 3 : 1.5, make: () => ({ kind: 'morale', base: m, target: clamp(Math.round(m / 5) * 5 + 10, 50, 90), until }) });
  if (staffN < Math.min(400, tierDef(s.office.tier).staffCap)) pool.push({ w: 1.5, make: () => { const n = Math.min(clamp(Math.round(staffN * 0.15), 1, 12), tierDef(s.office.tier).staffCap - staffN); return { kind: 'hire', base: s.progress.stats.staffHired, target: s.progress.stats.staffHired + n, until }; } });
  const net = objectiveValue(s, 'cash');
  if (net > 0) pool.push({ w: 1.5, make: () => ({ kind: 'cash', base: net, target: Math.round(net * 1.25 + money(20_000, s.day)), until }) });
  const treeWork = (!!s.research.active && !!RESEARCH_BY_ID[s.research.active]) || RESEARCH.some((r) => researchAvailable(s, r).ok);
  if (treeWork && Object.values(s.staff).some((x) => x.assignment.kind === 'research')) pool.push({ w: 1.5, make: () => ({ kind: 'research', base: s.progress.stats.researchDone, target: s.progress.stats.researchDone + 1, until }) });
  if (s.releaseOrder.length >= 2) pool.push({ w: 1, make: () => ({ kind: 'fans', base: s.company.fans, target: s.company.fans + Math.max(5_000, Math.round(s.company.fans * 0.1 / 1000) * 1000), until }) });
  if (s.offers.contracts.length && staffN <= 25) pool.push({ w: 1, make: () => ({ kind: 'contract', base: s.progress.stats.contractsDone, target: s.progress.stats.contractsDone + 1, until }) });
  const picked: Objective[] = [];
  const left = [...pool];
  while (picked.length < 3 && left.length) {
    const total = left.reduce((t, x) => t + x.w, 0);
    if (total <= 0) break;
    let r = rng.next() * total;
    const i = left.findIndex((x) => (r -= x.w) <= 0);
    const [opt] = left.splice(i < 0 ? 0 : i, 1);
    picked.push(opt!.make());
  }
  s.objectives = picked;
}

/** Daily: pay out goals as they're met. */
export function objectivesDaily(c: Ctx): void {
  const { s } = c;
  for (const o of s.objectives ?? []) {
    if (o.done !== undefined || s.day > o.until) continue;
    if (objectiveProgress(s, o) >= 1) {
      o.done = s.day;
      const r = objectiveReward(s);
      const repText = fmtRepGain(Math.min(repGain(s, r.rep), 100 - s.company.reputation)); // before it's added (the taper depends on where you were)
      addRep(s, r.rep, 'Quarterly objective');
      s.company.cash += r.cash;
      s.company.moraleMods.push({ v: r.morale, until: s.day + 30, label: 'Hit a goal' });
      s.progress.stats.objectivesDone = (s.progress.stats.objectivesDone ?? 0) + 1;
      pushNews(s, { category: 'studio', headline: `Objective complete: ${objectiveText(o)}`, body: `+${fmtMoney(r.cash)}, reputation ${repText}, a morale lift.`, tone: 'good' });
    }
  }
}
