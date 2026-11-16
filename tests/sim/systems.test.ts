/**
 * One test per edge of the system dependency map (docs/DESIGN.md §5).
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch, type StartGamePayload } from '../../src/sim/actions';
import { toDay } from '../../src/sim/calendar';
import { Rng } from '../../src/sim/rng';
import { productivity, moraleTarget, generateCandidate, topSkill } from '../../src/sim/systems/staff';
import { gameQuality, engineTechFor, comboFit } from '../../src/sim/systems/dev';
import { salesPotential, competition } from '../../src/sim/systems/release';
import { demandMul, platformInfo, isPlatformAvailable, availablePlatforms } from '../../src/sim/systems/market';
import { creditLimit, ipoEligible } from '../../src/sim/systems/finance';
import { EVENT_DEFS } from '../../src/sim/systems/events';
import { layout, touchOffice } from '../../src/sim/systems/office';
import type { GameProject, GameState } from '../../src/sim/types';

function game(startYear = 1980, seed = 5): GameState {
  return createGame({ seed, companyName: 'Test', founderName: 'T', startYear, autopause: false });
}

function startSmall(s: GameState, extra: Partial<StartGamePayload> = {}): GameProject {
  const plats = availablePlatforms(s).slice(0, 1).map((p) => p.id);
  const r = dispatch(s, {
    type: 'startGame',
    game: { name: 'G', genre: 'action', topic: 'scifi', platforms: plats, audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'], ...extra },
  });
  if (!r.ok) throw new Error(r.error);
  return Object.values(s.projects).find((p) => p.kind === 'game') as GameProject;
}

describe('people loop: morale → productivity → bugs → reviews → sales', () => {
  it('higher morale raises productivity', () => {
    const s = game();
    const f = s.staff.founder!;
    f.morale = 30;
    const low = productivity(s, f).total;
    f.morale = 90;
    expect(productivity(s, f).total).toBeGreaterThan(low);
  });
  it('crunch increases bug density', () => {
    const run = (crunch: boolean) => {
      const s = game(1980, 11);
      const p = startSmall(s);
      dispatch(s, { type: 'setCrunch', projectId: p.id, on: crunch });
      advance(s, 30);
      const q = s.projects[p.id] as GameProject;
      return q.bugs / (q.design + q.tech);
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });
  it('bugs reduce quality', () => {
    const s = game();
    const p = startSmall(s);
    p.design = 30;
    p.tech = 20;
    p.bugs = 0;
    const clean = gameQuality(s, p).total;
    p.bugs = 12;
    expect(gameQuality(s, p).total).toBeLessThan(clean);
  });
  it('better reviews sell more', () => {
    const s = game(1990);
    const p = startSmall(s);
    const lo = salesPotential(s, p.concept, 55, 0).platforms.reduce((t, x) => t + x.potential, 0);
    const hi = salesPotential(s, p.concept, 88, 0).platforms.reduce((t, x) => t + x.potential, 0);
    expect(hi).toBeGreaterThan(lo * 3);
  });
});

describe('layout loop: office → energy/morale → productivity', () => {
  it('décor near a desk raises target morale; crowding lowers it', () => {
    const s = game();
    const f = s.staff.founder!;
    const base = moraleTarget(s, f).total;
    const desk = s.office.items.find((i) => i.id === f.deskId)!;
    s.office.items.push({ id: 'aq', item: 'aquarium', floor: 0, x: desk.x + 1, y: desk.y + 1, rot: 0 });
    touchOffice(s);
    expect(moraleTarget(s, f).total).toBeGreaterThan(base);
  });
  it('removing the break area hurts productivity', () => {
    const s = game();
    const f = s.staff.founder!;
    const withCoffee = productivity(s, f).total;
    s.office.items = s.office.items.filter((i) => i.item !== 'coffee_machine');
    touchOffice(s);
    expect(layout(s).desks[f.deskId!]!.energyDist).toBe(Infinity);
    expect(productivity(s, f).total).toBeLessThan(withCoffee);
  });
});

describe('fame loop: reputation → hiring pool / reach', () => {
  it('reputation improves candidate quality', () => {
    const s = game();
    const rng = new Rng([1, 2, 3, 4]);
    const avg = (q: number) => {
      let t = 0;
      for (let i = 0; i < 300; i++) t += topSkill(generateCandidate(s, rng, { quality: q }).skills);
      return t / 300;
    };
    expect(avg(80)).toBeGreaterThan(avg(0) + 3);
  });
  it('reputation increases sales reach', () => {
    const s = game(1995);
    const p = startSmall(s);
    s.company.reputation = 5;
    const lo = salesPotential(s, p.concept, 75, 0).platforms.reduce((t, x) => t + x.potential, 0);
    s.company.reputation = 80;
    expect(salesPotential(s, p.concept, 75, 0).platforms.reduce((t, x) => t + x.potential, 0)).toBeGreaterThan(lo);
  });
  it('hype increases sales', () => {
    const s = game(1995);
    const p = startSmall(s);
    const a = salesPotential(s, p.concept, 75, 0).platforms[0]!.potential;
    const b = salesPotential(s, p.concept, 75, 1.5).platforms[0]!.potential;
    expect(b).toBeGreaterThan(a);
  });
  it('franchise fans buy sequels', () => {
    const s = game(1995);
    const p = startSmall(s);
    s.franchises.fx = { id: 'fx', name: 'X', genre: 'action', topic: 'scifi', fans: 500_000, entries: [], fatigue: 0, lastDay: 0, bestScore: 80 };
    const base = salesPotential(s, p.concept, 75, 0).platforms[0]!.potential;
    const seq = salesPotential(s, { ...p.concept, franchiseId: 'fx' }, 75, 0).platforms[0]!.potential;
    expect(seq).toBeGreaterThan(base);
  });
});

describe('design choices → quality', () => {
  it('genre × topic fit matters', () => {
    expect(comboFit('rpg', 'fantasy', 'teen').gtMul).toBeGreaterThan(comboFit('racing', 'fantasy', 'teen').gtMul);
  });
  it('focus sliders matching the genre score better', () => {
    const s = game();
    const p = startSmall(s, { genre: 'rpg', topic: 'fantasy' });
    p.design = 40;
    p.tech = 20;
    p.focus = [[10, 20, 70], [20, 60, 20], [60, 20, 20]]; // story/dialogue/world heavy
    const good = gameQuality(s, p).total;
    p.focus = [[80, 10, 10], [10, 10, 80], [10, 10, 80]];
    expect(gameQuality(s, p).total).toBeLessThan(good);
  });
});

describe('tech treadmill: research → engines → quality', () => {
  it('more engine features → higher tech', () => {
    expect(engineTechFor(['gfx_2d_1', 'gfx_3d_1', 'gfx_3d_2'])).toBeGreaterThan(engineTechFor(['gfx_2d_1']));
  });
  it('an outdated engine hurts quality on modern hardware', () => {
    const s = game(2005);
    const p = startSmall(s);
    p.design = 200;
    p.tech = 200;
    s.engines.e0!.tech = 1;
    const old = gameQuality(s, p).total;
    s.engines.e0!.tech = 10;
    expect(gameQuality(s, p).total).toBeGreaterThan(old);
  });
});

describe('history → market → platforms', () => {
  it('the 1983 crash suppresses console demand but not computers', () => {
    const s = game(1980);
    advance(s, toDay(1984, 3, 1) - s.day);
    expect(demandMul(s, platformInfo(s, 'atari_2600')!)).toBeLessThan(0.6);
    expect(demandMul(s, platformInfo(s, 'c64')!)).toBeGreaterThanOrEqual(1);
  });
  it('platforms launch and retire on schedule', () => {
    const s = game(1980);
    expect(isPlatformAvailable(s, platformInfo(s, 'nes')!)).toBe(false);
    expect(isPlatformAvailable(s, platformInfo(s, 'nes')!, toDay(1987, 1, 1))).toBe(true);
    expect(isPlatformAvailable(s, platformInfo(s, 'nes')!, toDay(1999, 1, 1))).toBe(false);
  });
  it('market shares always sum to 1', () => {
    const s = game(1980);
    advance(s, 365 * 3);
    const sum = Object.values(s.market.share).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe('rival pressure', () => {
  it('rival releases in the window increase competition', () => {
    const s = game(1990);
    const p = startSmall(s);
    s.rivalGames.push({ name: 'Rival Hit', company: 'nintendo', genre: 'action', topic: 'fantasy', platforms: p.concept.platforms, day: s.day, score: 92, units: 1e6 });
    const rel = { id: 'r', day: s.day, week: 1, concept: p.concept, score: 70 } as never;
    expect(competition(s, rel)).toBeGreaterThan(1);
  });
});

describe('finance loop & fail state', () => {
  it('bankruptcy is real: deep insolvency with no credit ends the game', () => {
    const s = game(1980);
    s.company.cash = -5_000_000;
    s.company.creditScore = 300;
    advance(s, 200);
    expect(s.status).toBe('bankrupt');
  });
  it('loans are bounded by the credit limit', () => {
    const s = game(1980);
    const lim = creditLimit(s);
    expect(dispatch(s, { type: 'takeLoan', amount: lim * 3, months: 24 }).ok).toBe(false);
    expect(dispatch(s, { type: 'takeLoan', amount: Math.floor(lim / 2), months: 24 }).ok).toBe(true);
  });
  it('IPO requires revenue and reputation', () => {
    expect(ipoEligible(game()).ok).toBe(false);
  });
});

describe('events react to state', () => {
  it('crunch-related events only weigh in while crunching', () => {
    const s = game();
    const def = EVENT_DEFS.find((d) => d.id === 'crunch_pizza')!;
    expect(def.weight(s)).toBe(0);
    const p = startSmall(s);
    dispatch(s, { type: 'setCrunch', projectId: p.id, on: true });
    expect(def.weight(s)).toBeGreaterThan(0);
  });
});

describe('a full first game', () => {
  it('can be developed and released, producing reviews and sales', () => {
    const s = game(1981, 21);
    startSmall(s);
    advance(s, 90);
    expect(s.releaseOrder.length).toBe(1);
    const r = s.releases[s.releaseOrder[0]!]!;
    expect(r.reviews.length).toBeGreaterThan(1);
    expect(r.reviews.every((x) => x.blurb.length > 5)).toBe(true);
    advance(s, 120);
    expect(r.units).toBeGreaterThan(0);
    expect(r.net).toBeGreaterThan(0);
  });
});

describe('post-launch support', () => {
  it('patching lifts user score and porting adds a platform with its own sales curve', () => {
    const s = game(1985, 33);
    s.company.cash = 1_000_000;
    startSmall(s, { platforms: ['c64'] });
    advance(s, 120);
    const rel = s.releases[s.releaseOrder[0]!]!;
    rel.bugs = 12;
    const before = rel.userScore;
    expect(dispatch(s, { type: 'patchGame', releaseId: rel.id }).ok).toBe(true);
    expect(rel.userScore).toBeGreaterThan(before);
    expect(rel.bugs).toBeLessThan(12);
    rel.score = 88; // a hit is worth porting
    rel.userScore = 88;
    const r = dispatch(s, { type: 'portGame', releaseId: rel.id, platform: 'zx_spectrum' });
    expect(r.ok).toBe(true);
    const port = rel.platforms.find((p) => p.platform === 'zx_spectrum')!;
    expect(port.startWeek).toBeGreaterThan(0);
    advance(s, 60);
    expect(port.units).toBeGreaterThan(0);
  });
});
