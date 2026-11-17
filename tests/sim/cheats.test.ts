import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { RESEARCH } from '../../src/data/research';
import { OFFICE_TIERS } from '../../src/data/facilities';
import { availablePlatforms } from '../../src/sim/systems/market';
import type { CheatOp } from '../../src/sim/cheats';
import type { GameProject, GameState } from '../../src/sim/types';
import { checkInvariants } from '../bots/invariants';

const game = (year = 1990, seed = 3): GameState => createGame({ seed, companyName: 'Cheat Co', founderName: 'C', startYear: year, autopause: false });
const cheat = (s: GameState, c: CheatOp) => dispatch(s, { type: 'cheat', cheat: c });

function startGame(s: GameState): GameProject {
  const plat = availablePlatforms(s).find((p) => p.kind === 'computer')!.id;
  const r = dispatch(s, { type: 'startGame', game: { name: 'G', genre: 'rpg', topic: 'fantasy', platforms: [plat], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  if (!r.ok) throw new Error(r.error);
  return Object.values(s.projects).find((p) => p.kind === 'game') as GameProject;
}

describe('cheats', () => {
  it('sandbox mode starts with infinite money, free building and the run marked', () => {
    const s = createGame({ seed: 1, companyName: 'Sand', founderName: 'S', sandbox: true, autopause: false });
    expect(s.cheatsUsed).toBe(true);
    expect(s.cheats?.infiniteMoney && s.cheats.noBankruptcy && s.cheats.freeBuild).toBe(true);
    s.company.cash = -1e6;
    advance(s, 2);
    expect(s.company.cash).toBeGreaterThanOrEqual(s.cheats!.moneyFloor!);
    const plain = createGame({ seed: 1, companyName: 'Plain', founderName: 'P', autopause: false });
    expect(plain.cheatsUsed).toBeFalsy();
    expect(plain.cheats).toBeUndefined();
  });

  it('edit money, reputation, fans and loans, and mark the run', () => {
    const s = game();
    expect(s.cheatsUsed).toBeFalsy();
    expect(cheat(s, { op: 'setCash', amount: 5e6 }).ok).toBe(true);
    expect(s.company.cash).toBe(5e6);
    expect(s.cheatsUsed).toBe(true);
    cheat(s, { op: 'addCash', amount: -1e6 });
    expect(s.company.cash).toBe(4e6);
    cheat(s, { op: 'setReputation', value: 250 });
    expect(s.company.reputation).toBe(100);
    cheat(s, { op: 'setFans', value: 1234 });
    expect(s.company.fans).toBe(1234);
    s.finance.loans.push({ id: 'l', principal: 1, balance: 1, rate: 0.1, monthly: 1, monthsLeft: 1 } as never);
    cheat(s, { op: 'clearLoans' });
    expect(s.finance.loans).toEqual([]);
    expect(cheat(s, { op: 'setCash', amount: NaN }).ok).toBe(false);
    expect(cheat(s, { op: 'setCash', amount: 1e20 }).ok).toBe(false);
    expect(cheat(s, { op: 'nope' } as never).ok).toBe(false);
  });

  it('edit staff and summon hires', () => {
    const s = game();
    cheat(s, { op: 'staff', skills: 100, morale: 10 });
    expect(Object.values(s.staff.founder!.skills).every((v) => v === 100)).toBe(true);
    expect(s.staff.founder!.morale).toBe(10);
    const n = Object.keys(s.staff).length;
    expect(cheat(s, { op: 'spawnStaff', role: 'artist', skill: 77, salary: 50_000, name: 'Ada' }).ok).toBe(true);
    const hire = Object.values(s.staff).find((x) => x.name === 'Ada')!;
    expect(Object.keys(s.staff).length).toBe(n + 1);
    expect(hire.role).toBe('artist');
    expect(hire.skills.art).toBe(77);
    expect(cheat(s, { op: 'spawnStaff', role: 'founder', skill: 50, salary: 1 }).ok).toBe(false);
    expect(cheat(s, { op: 'staff', staffId: 'ghost', skills: 5 }).ok).toBe(false);
  });

  it('finish games now, with a polished option that beats the plain one', () => {
    const plain = game(1995, 4);
    const polished = game(1995, 4);
    for (const s of [plain, polished]) {
      startGame(s);
      expect(cheat(s, { op: 'finishProjects', polish: false }).ok).toBe(false); // nobody has worked yet
      advance(s, 5);
    }
    expect(cheat(plain, { op: 'finishProjects', polish: false }).ok).toBe(true);
    expect(cheat(polished, { op: 'finishProjects', polish: true }).ok).toBe(true);
    advance(plain, 2);
    advance(polished, 2);
    expect(plain.releaseOrder.length).toBe(1);
    expect(polished.releaseOrder.length).toBe(1);
    expect(polished.releases[polished.releaseOrder[0]!]!.score).toBeGreaterThanOrEqual(plain.releases[plain.releaseOrder[0]!]!.score);
  });

  it('a cheat that fails part-way changes nothing and still marks the run', () => {
    const s = game(1995, 4);
    const p1 = startGame(s);
    advance(s, 5);
    s.staff.x = { ...s.staff.founder!, id: 'x', name: 'X', assignment: { kind: 'idle' } };
    const plat = availablePlatforms(s).find((p) => p.kind === 'computer')!.id;
    const r = dispatch(s, { type: 'startGame', game: { name: 'H', genre: 'action', topic: 'scifi', platforms: [plat], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['x'] } });
    expect(r.ok).toBe(true);
    const phase = p1.phase;
    expect(cheat(s, { op: 'finishProjects', polish: true }).ok).toBe(false); // H has no work yet
    expect(p1.phase).toBe(phase);
    expect(s.cheatsUsed).toBe(true);
    const tier = s.office.tier;
    expect(cheat(s, { op: 'officeTier', tier: 99 }).ok).toBe(false);
    expect(s.office.tier).toBe(tier);
  });

  it('persistent switches change how the world runs', () => {
    const s = game(1990, 9);
    s.company.cash = -5e6;
    cheat(s, { op: 'settings', settings: { noBankruptcy: true, noBurnout: true, alwaysHappy: true, noEvents: true, scoreBonus: 40, salesMul: 5 } });
    advance(s, 400);
    expect(s.status).toBe('running');
    expect(s.staff.founder!.morale).toBe(100);
    expect(s.staff.founder!.burnout).toBe(0);
    expect(s.pendingEvents.length).toBe(0);
    cheat(s, { op: 'settings', settings: { noBankruptcy: false, infiniteMoney: true, moneyFloor: 2e6 } });
    advance(s, 1);
    expect(s.company.cash).toBeGreaterThanOrEqual(2e6);
    // review bonus applies at release
    startGame(s);
    advance(s, 5);
    cheat(s, { op: 'finishProjects', polish: true });
    advance(s, 2);
    expect(s.releases[s.releaseOrder[0]!]!.score).toBeGreaterThanOrEqual(80);
    expect(cheat(s, { op: 'settings', settings: { salesMul: 999 } }).ok).toBe(false);
    expect(cheat(s, { op: 'settings', settings: { scoreBonus: -99 } }).ok).toBe(false);
  });

  it('unlock research, move offices for free and edit releases', () => {
    const s = game(1985, 2);
    cheat(s, { op: 'unlockResearch', scope: 'now' });
    expect(RESEARCH.filter((r) => r.year <= 1985).every((r) => s.research.done.includes(r.id))).toBe(true);
    expect(s.research.done.length).toBeLessThan(RESEARCH.length);
    cheat(s, { op: 'unlockResearch', scope: 'all' });
    expect(s.research.done.length).toBe(RESEARCH.length);
    const cash = s.company.cash;
    const top = OFFICE_TIERS[OFFICE_TIERS.length - 1]!.tier;
    expect(cheat(s, { op: 'officeTier', tier: top }).ok).toBe(true);
    expect(s.office.tier).toBe(top);
    expect(s.company.cash).toBe(cash);
    expect(s.cheats?.freeBuild).toBeFalsy(); // the move doesn't leave free building on
    startGame(s);
    advance(s, 5);
    cheat(s, { op: 'finishProjects', polish: false });
    advance(s, 2);
    const r = s.releases[s.releaseOrder[0]!]!;
    const units = r.units;
    expect(cheat(s, { op: 'editRelease', releaseId: r.id, score: 99, userScore: 98, addUnits: 1e6 }).ok).toBe(true);
    expect(r.score).toBe(99);
    expect(r.units).toBe(units + 1e6);
    expect(s.progress.stats.bestScore).toBe(99);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('edit rivals, trends, fatigue, traits and achievements', () => {
    const s = game(1995, 6);
    const real = Object.values(s.rivals).find((r) => r.alive && !r.procedural)!;
    expect(cheat(s, { op: 'rival', rivalId: real.id, close: true }).ok).toBe(false);
    expect(cheat(s, { op: 'rival', rivalId: real.id, reputation: 5, quality: 0, staff: 1e9 }).ok).toBe(true);
    expect(real.reputation).toBe(5);
    expect(real.quality).toBe(0.1);
    expect(real.staff).toBe(8000);
    const indie = Object.values(s.rivals).find((r) => r.alive && r.procedural);
    if (indie) {
      expect(cheat(s, { op: 'rival', rivalId: indie.id, close: true }).ok).toBe(true);
      expect(indie.alive).toBe(false);
    }
    expect(cheat(s, { op: 'trend', kind: 'genre', id: 'rpg', value: 5 }).ok).toBe(true);
    expect(s.market.genreTrend.rpg).toBe(0.8);
    expect(cheat(s, { op: 'trend', kind: 'genre', id: 'nope', value: 0 }).ok).toBe(false);
    cheat(s, { op: 'resetTrends' });
    expect(s.market.genreTrend.rpg).toBe(0);
    expect(cheat(s, { op: 'staffTraits', staffId: 'founder', traits: ['loyal', 'mercenary'] }).ok).toBe(false);
    expect(cheat(s, { op: 'staffTraits', staffId: 'founder', traits: ['visionary', 'mentor', 'meticulous'] }).ok).toBe(true);
    expect(s.staff.founder!.traits).toEqual(['visionary', 'mentor', 'meticulous']);
    expect(cheat(s, { op: 'staffTraits', staffId: 'founder', traits: ['visionary', 'mentor', 'meticulous', 'loyal', 'chill'] }).ok).toBe(false);
    cheat(s, { op: 'unlockAchievements' });
    expect(Object.keys(s.progress.achievements).length).toBeGreaterThan(30);
    expect(cheat(s, { op: 'franchiseFatigue', value: 0 }).ok).toBe(false); // no franchise yet
  });

  it('random cheating never breaks the simulation', () => {
    const s = game(1985, 77);
    const rng = new Rng([9, 8, 7, 6]);
    const num = () => (rng.chance(0.1) ? rng.pick([NaN, Infinity, -1e30, 1e30]) : rng.range(-50, 200));
    const ops: (() => CheatOp)[] = [
      () => ({ op: 'setCash', amount: rng.range(-1e7, 1e9) }),
      () => ({ op: 'addCash', amount: num() * 1e5 }),
      () => ({ op: 'setReputation', value: num() }),
      () => ({ op: 'setFans', value: num() * 1e4 }),
      () => ({ op: 'clearLoans' }),
      () => ({ op: 'staff', skills: num(), morale: num(), energy: num(), burnout: num(), potential: num() }),
      () => ({ op: 'spawnStaff', role: rng.pick(['designer', 'programmer', 'artist', 'qa', 'founder'] as const), skill: num(), salary: num() * 1000 }),
      () => ({ op: 'finishProjects', polish: rng.chance(0.5) }),
      () => ({ op: 'setHype', value: num() }),
      () => ({ op: 'unlockResearch', scope: rng.chance(0.5) ? 'now' : 'all' }),
      () => ({ op: 'franchiseFans', fans: num() * 1e4 }),
      () => ({ op: 'editRelease', releaseId: rng.pick(Object.keys(s.releases).concat('none')), score: num(), userScore: num(), addUnits: num() * 1e3 }),
      () => ({ op: 'officeTier', tier: rng.int(0, 8) }),
      () => ({ op: 'rival', rivalId: rng.pick(Object.keys(s.rivals)), cash: num() * 1e5, reputation: num(), quality: num() / 100, staff: num() * 10, close: rng.chance(0.2) }),
      () => ({ op: 'trend', kind: rng.pick(['genre', 'topic', 'other'] as never[]), id: rng.pick(['rpg', 'action', 'fantasy', 'scifi', 'nope']), value: num() / 100 }),
      () => ({ op: 'resetTrends' }),
      () => ({ op: 'franchiseFatigue', value: num() / 100 }),
      () => ({ op: 'staffTraits', staffId: rng.pick(Object.keys(s.staff)), traits: rng.shuffle(['loyal', 'mercenary', 'visionary', 'chill', 'hothead', 'mentor'] as const).slice(0, rng.int(0, 5)) }),
      () => ({ op: 'unlockAchievements' }),
      () => ({ op: 'settings', settings: { infiniteMoney: rng.chance(0.5), noBankruptcy: rng.chance(0.5), noBugs: rng.chance(0.5), noEvents: rng.chance(0.5), freeBuild: rng.chance(0.5), salesMul: rng.range(0.1, 20), workMul: rng.range(0.25, 10), researchMul: rng.range(0.25, 50), scoreBonus: rng.int(-40, 40) } }),
    ];
    for (let d = 0; d < 365 * 30 && s.status === 'running'; d += 7) {
      for (let i = 0; i < 2; i++) dispatch(s, { type: 'cheat', cheat: rng.pick(ops)() });
      if (!Object.keys(s.projects).length) {
        try {
          startGame(s);
        } catch {
          /* no free team or platform this week */
        }
      }
      for (const p of Object.values(s.projects)) if (p.kind === 'game' && p.awaitingGate) dispatch(s, { type: 'continueGate', projectId: p.id });
      s.pendingEvents = [];
      advance(s, 7);
      const errs = checkInvariants(s);
      if (errs.length) throw new Error(`day ${s.day}: ${errs.slice(0, 3).join('; ')}`);
    }
  });
});
