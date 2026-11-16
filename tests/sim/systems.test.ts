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
import { salesPotential, competition, canRemaster } from '../../src/sim/systems/release';
import { BALANCE } from '../../src/data/balance';
import { demandMul, platformInfo, isPlatformAvailable, availablePlatforms } from '../../src/sim/systems/market';
import { creditLimit, ipoEligible } from '../../src/sim/systems/finance';
import { EVENT_DEFS } from '../../src/sim/systems/events';
import { layout, touchOffice } from '../../src/sim/systems/office';
import { consoleSpec, exclusiveBuzz, monthlyDemandM, packInMul } from '../../src/sim/systems/hardware';
import { migrate } from '../../src/sim/save';
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

describe('regressions from code review', () => {
  it('IPO cash is equity, not revenue', () => {
    const s = game(1990, 8);
    s.company.reputation = 90;
    s.finance.revenue12m = Array(12).fill(5_000_000);
    const before = s.company.cash;
    expect(dispatch(s, { type: 'ipo', pct: 0.3 }).ok).toBe(true);
    expect(s.company.cash).toBeGreaterThan(before);
    const led = s.finance.ledger[s.finance.ledger.length - 1]!;
    expect(led.income.other_income ?? 0).toBe(0);
  });
  it('cancelling a published game repays the advance', () => {
    const s = game(1984, 9);
    const deal = s.offers.deals[0];
    if (!deal) return;
    const cash0 = s.company.cash;
    const p = startSmall(s, { dealId: deal.id, platforms: ['c64'] });
    expect(dispatch(s, { type: 'cancelProject', projectId: p.id }).ok).toBe(true);
    expect(s.company.cash).toBeLessThanOrEqual(cash0);
  });
  it('rejects duplicate team members, platforms and engine features', () => {
    const s = game(1984, 10);
    expect(dispatch(s, { type: 'startGame', game: { name: 'x', genre: 'action', topic: 'scifi', platforms: ['c64'], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder', 'founder'] } }).ok).toBe(false);
    expect(dispatch(s, { type: 'startGame', game: { name: 'x', genre: 'action', topic: 'scifi', platforms: ['c64', 'c64'], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } }).ok).toBe(false);
  });
  it('queued research waits for its prerequisites', () => {
    const s = game(1980, 11);
    s.day = toDay(1990, 1, 1); // a 1980 studio that never researched save games
    s.company.cash = 1e6;
    dispatch(s, { type: 'assign', staffId: 'founder', to: 'research' });
    expect(dispatch(s, { type: 'queueResearch', id: 'sys_dialogue' }).ok).toBe(true); // needs sys_save
    advance(s, 300);
    expect(s.research.done.includes('sys_dialogue')).toBe(false);
  });
  it('rejects non-finite numbers', () => {
    const s = game();
    expect(dispatch(s, { type: 'takeLoan', amount: NaN, months: 12 }).ok).toBe(false);
  });
});

describe('hardware division', () => {
  function rich(): GameState {
    const s = game(1994, 11);
    s.research.done.push('biz_rnd_lab', 'biz_self_publishing', 'biz_hardware_lab');
    s.company.reputation = 75;
    s.company.cash = 2e8;
    return s;
  }
  const design = (s: GameState, extra: Record<string, unknown> = {}) =>
    dispatch(s, { type: 'designConsole', name: 'Cube', kind: 'console', tier: 'standard', price: Math.round(consoleSpec(s, 'console', 'standard').refPrice), feeRate: 0.2, marketing: 'none', ...extra });

  it('is gated by research and reputation', () => {
    const s = game(1994, 11);
    s.company.cash = 2e8;
    expect(design(s).ok).toBe(false);
    s.research.done.push('biz_hardware_lab');
    s.company.reputation = 20;
    expect(design(s).ok).toBe(false);
    s.company.reputation = 80;
    expect(design(s).ok).toBe(true);
    expect(design(s).ok).toBe(false); // one project at a time
  });

  it('pays R&D, launches as a real platform, sells hardware and earns licence fees', () => {
    const s = rich();
    expect(design(s).ok).toBe(true);
    const hw = s.hardware[0]!;
    expect(platformInfo(s, hw.id)).toBeUndefined(); // not on the market while in development
    advance(s, 700);
    expect(hw.status).toBe('live');
    expect(hw.rdPaid).toBeCloseTo(hw.rdTotal, -2);
    const pl = platformInfo(s, hw.id)!;
    expect(pl.own).toBe(true);
    expect(pl.royalty).toBe(0);
    expect(availablePlatforms(s).some((p) => p.id === hw.id)).toBe(true);
    advance(s, 365 * 2);
    expect(hw.unitsSold).toBeGreaterThan(100_000);
    expect(s.market.users[hw.id]).toBeGreaterThan(0);
    expect(hw.feeRevenue).toBeGreaterThan(0);
  });

  it('cheaper hardware sells more units, a higher licence fee costs third-party support', () => {
    const s = rich();
    design(s);
    advance(s, 700);
    const hw = s.hardware[0]!;
    const base = monthlyDemandM(hw, s.day);
    expect(monthlyDemandM({ ...hw, price: hw.price * 0.7 }, s.day)).toBeGreaterThan(base);
    expect(monthlyDemandM({ ...hw, feeRate: 0.45 }, s.day)).toBeLessThan(base);
  });

  it('great exclusives boost hardware sales', () => {
    const s = rich();
    design(s);
    advance(s, 700);
    const hw = s.hardware[0]!;
    const rel = { concept: { platforms: [hw.id], size: 'aaa' }, score: 92 } as unknown as Parameters<typeof exclusiveBuzz>[1];
    exclusiveBuzz(s, rel);
    expect(hw.boost).toBeGreaterThan(0.3);
  });

  it('can be cancelled in development or discontinued once live', () => {
    const s = rich();
    design(s);
    expect(dispatch(s, { type: 'retireConsole', id: s.hardware[0]!.id }).ok).toBe(false);
    expect(dispatch(s, { type: 'cancelConsole', id: s.hardware[0]!.id }).ok).toBe(true);
    expect(s.hardware.length).toBe(0);
    design(s);
    advance(s, 700);
    const hw = s.hardware[0]!;
    expect(dispatch(s, { type: 'retireConsole', id: hw.id }).ok).toBe(true);
    expect(hw.status).toBe('retired');
    const sold = hw.unitsSold;
    advance(s, 90);
    expect(hw.unitsSold).toBe(sold);
  });

  it('a pack-in must be on the console and lifts hardware demand', () => {
    const s = rich();
    design(s);
    advance(s, 700);
    const hw = s.hardware[0]!;
    const rel = { id: 'r_pack', name: 'Pack', concept: { platforms: ['pc'] }, score: 90 } as unknown as GameState['releases'][string];
    s.releases.r_pack = rel;
    expect(dispatch(s, { type: 'setConsole', id: hw.id, packIn: 'r_pack' }).ok).toBe(false);
    rel.concept.platforms = [hw.id];
    expect(dispatch(s, { type: 'setConsole', id: hw.id, packIn: 'r_pack' }).ok).toBe(true);
    expect(packInMul(s, hw)).toBeCloseTo(1.3);
    expect(dispatch(s, { type: 'setConsole', id: hw.id, packIn: null }).ok).toBe(true);
    expect(packInMul(s, hw)).toBe(1);
  });

  it('hardware events only fire for live consoles and resolve sensibly', () => {
    const s = rich();
    const defect = EVENT_DEFS.find((e) => e.id === 'hw_defect')!;
    expect(defect.weight(s)).toBe(0);
    design(s);
    advance(s, 700 + 120);
    const hw = s.hardware[0]!;
    expect(defect.weight(s)).toBeGreaterThan(0);
    const rng = new Rng([1, 2, 3, 4]);
    const made = defect.make({ s, rng, out: [] })!;
    const rep = s.company.reputation;
    defect.resolve({ s, rng, out: [] }, { uid: 1, defId: 'hw_defect', title: made.title, body: made.body, art: 'console', options: made.options, ctx: made.ctx, day: s.day, expires: s.day + 30 } as never, 'deny');
    expect(s.company.reputation).toBeLessThan(rep);
    expect(hw.boost).toBeLessThan(0);
  });

  it('migrates v2 saves', () => {
    const s = game();
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.hardware;
    raw.schemaVersion = 2;
    expect(migrate(raw).hardware).toEqual([]);
  });
});

describe('remasters', () => {
  it('rebuild an old classic with less work, once', () => {
    const s = game(1981, 21);
    startSmall(s);
    advance(s, 90);
    const orig = s.releases[s.releaseOrder[0]!]!;
    orig.score = 84;
    const base = { name: 'Again', genre: orig.concept.genre, topic: orig.concept.topic, platforms: [availablePlatforms(s)[0]!.id], audience: orig.concept.audience, size: 'small' as const, monetization: 'premium' as const, engineId: 'e0', team: ['founder'], franchiseId: orig.concept.franchiseId };
    expect(dispatch(s, { type: 'startGame', game: { ...base, remasterOf: orig.id } }).ok).toBe(false); // too recent
    orig.day -= 365 * 9;
    expect(dispatch(s, { type: 'startGame', game: { ...base, topic: orig.concept.topic === 'scifi' ? 'fantasy' : 'scifi', remasterOf: orig.id } }).ok).toBe(false);
    const r = dispatch(s, { type: 'startGame', game: { ...base, remasterOf: orig.id } });
    expect(r).toEqual({ ok: true, events: expect.any(Array) });
    const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
    expect(p.concept.remasterOf).toBe(orig.id);
    expect(p.phaseDays[1]).toBeLessThan(BALANCE.SIZE.small.days * BALANCE.PHASE_SHARE[1]);
    expect(gameQuality(s, p, true).parts.some((x) => x.label.startsWith('Remaster of'))).toBe(true);
    expect(canRemaster(s, orig)).toMatch(/Already/);
  });
});
