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
import { salesPotential, competition, canExpand, canRemaster, canRunSale, launchTitleMul, saleForecast, yearlyAwards } from '../../src/sim/systems/release';
import { BALANCE } from '../../src/data/balance';
import { demandMul, platformInfo, isPlatformAvailable, availablePlatforms } from '../../src/sim/systems/market';
import { creditLimit, ipoEligible } from '../../src/sim/systems/finance';
import { EVENT_DEFS } from '../../src/sim/systems/events';
import { layout, touchOffice } from '../../src/sim/systems/office';
import { consoleSpec, exclusiveBuzz, monthlyDemandM, packInMul, priceFactor, refPrice, unitCost } from '../../src/sim/systems/hardware';
import { migrate } from '../../src/sim/save';
import { signableIndies } from '../../src/sim/systems/publishing';
import { catalogSalesMul, subRefPrice, subTarget } from '../../src/sim/systems/subscription';
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

  it('overpricing kills demand and absurd prices are rejected (review fix)', () => {
    const s = rich();
    design(s);
    advance(s, 700);
    const hw = s.hardware[0]!;
    const ref = refPrice(hw, s.day);
    expect(priceFactor({ ...hw, price: ref * 4 }, s.day)).toBeLessThan(0.001 + 0.01);
    // hardware margin per month must not grow without bound with price
    const margin = (mul: number) => monthlyDemandM({ ...hw, price: ref * mul }, s.day) * (ref * mul * 0.8 - unitCost(hw, s.day));
    expect(margin(4)).toBeLessThan(margin(1.5));
    expect(dispatch(s, { type: 'setConsole', id: hw.id, price: ref * 10 }).ok).toBe(false);
    expect(dispatch(s, { type: 'setConsole', id: hw.id, price: ref * 10, feeRate: 0.1 }).ok).toBe(false);
    expect(hw.feeRate).toBe(0.2); // rejected change applies nothing
  });

  it('cannot retire a console while games are being made for it', () => {
    const s = rich();
    design(s);
    advance(s, 700);
    const hw = s.hardware[0]!;
    s.staff.founder!.assignment = { kind: 'idle' };
    const r = dispatch(s, { type: 'startGame', game: { name: 'Launch title', genre: 'action', topic: 'scifi', platforms: [hw.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
    expect(r.ok).toBe(true);
    expect(dispatch(s, { type: 'retireConsole', id: hw.id }).ok).toBe(false);
  });

  it('a big enough console triggers a price war that lowers the expected price', () => {
    const s = rich();
    design(s);
    advance(s, 700);
    const hw = s.hardware[0]!;
    const before = refPrice(hw, s.day);
    advance(s, 400);
    s.market.share[hw.id] = 0.2;
    advance(s, 40);
    expect(hw.priceWarDay).toBeDefined();
    expect(refPrice(hw, s.day)).toBeLessThan(before);
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

describe('expansion packs', () => {
  it('extend a recent hit for less work, sell to its owners and bring players back', () => {
    const s = game(1988, 11);
    startSmall(s, { genre: 'rpg', topic: 'fantasy', platforms: [availablePlatforms(s).find((p) => p.media !== 'cartridge')!.id] });
    advance(s, 90);
    const orig = s.releases[s.releaseOrder[0]!]!;
    orig.score = 82;
    for (const ps of orig.platforms) ps.units = 200_000;
    orig.units = 200_000 * orig.platforms.length;
    const plats = orig.concept.platforms;
    const base = { name: 'More', genre: orig.concept.genre, topic: orig.concept.topic, platforms: plats, audience: orig.concept.audience, size: 'small' as const, monetization: 'premium' as const, engineId: 'e0', team: ['founder'], franchiseId: orig.concept.franchiseId };
    s.research.done.push('biz_self_publishing');
    s.company.cash = 5_000_000;
    expect(canExpand(s, orig)).toBeNull();
    expect(dispatch(s, { type: 'startGame', game: { ...base, size: 'medium', expansionOf: orig.id } }).ok).toBe(false); // bigger than the base
    expect(dispatch(s, { type: 'startGame', game: { ...base, monetization: 'f2p', expansionOf: orig.id } }).ok).toBe(false);
    expect(dispatch(s, { type: "startGame", game: { ...base, expansionOf: orig.id } })).toEqual({ ok: true, events: expect.any(Array) });
    const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
    expect(p.phaseDays[1]).toBeLessThan(BALANCE.SIZE.small.days * BALANCE.PHASE_SHARE[1] * 0.5);
    expect(canExpand(s, orig)).toMatch(/already in development/);
    expect(gameQuality(s, p, true).parts.some((x) => x.label.startsWith('Builds on'))).toBe(true);
    // the owner base caps the market
    const pot = salesPotential(s, p.concept, 90, 0.5).platforms.reduce((t, x) => t + x.potential, 0);
    expect(pot).toBeLessThan(orig.units * 0.75);
    const fans = s.franchises[orig.concept.franchiseId!]!;
    const entries = fans.entries.length;
    const fatigue = fans.fatigue;
    for (let i = 0; i < 200 && Object.keys(s.projects).length; i++) {
      advance(s, 1);
      for (const pr of Object.values(s.projects)) if (pr.kind === 'game' && pr.awaitingGate) dispatch(s, { type: 'continueGate', projectId: pr.id });
      s.pendingEvents = [];
    }
    const exp = Object.values(s.releases).find((r) => r.concept.expansionOf === orig.id)!;
    expect(exp).toBeTruthy();
    expect(exp.price).toBeLessThan(orig.price);
    expect(fans.entries.length).toBe(entries); // not a sequel
    expect(fans.fatigue).toBe(fatigue);
    if (exp.score >= 55) expect(orig.platforms.some((x) => x.revival)).toBe(true);
    const before = orig.units;
    advance(s, 120);
    if (exp.score >= 55) expect(orig.units).toBeGreaterThan(before);
    orig.day -= 365 * 6;
    expect(canExpand(s, orig)).toMatch(/Too old/);
  });
});

describe('expansion fairness (review fixes)', () => {
  it('a tiny add-on for a big game sells to fewer owners, and never to more than 90% of them', () => {
    const s = game(2005, 3);
    s.research.done.push('biz_self_publishing');
    startSmall(s, { platforms: [availablePlatforms(s).find((p) => p.kind === 'computer')!.id] });
    for (let i = 0; i < 200 && !s.releaseOrder.length; i++) {
      advance(s, 1);
      for (const pr of Object.values(s.projects)) if (pr.kind === 'game' && pr.awaitingGate) dispatch(s, { type: 'continueGate', projectId: pr.id });
      s.pendingEvents = [];
    }
    const base = s.releases[s.releaseOrder[0]!]!;
    base.concept = { ...base.concept, size: 'aaa' };
    for (const ps of base.platforms) ps.units = 1_000_000;
    const exp = (size: 'small' | 'large') => ({ ...base.concept, size, expansionOf: base.id });
    const units = (size: 'small' | 'large', score: number, hype: number) => salesPotential(s, exp(size), score, hype).platforms.reduce((t, x) => t + x.potential, 0);
    expect(units('small', 80, 0)).toBeLessThan(units('large', 80, 0) * 0.6);
    const owners = base.platforms.reduce((t, x) => t + x.units, 0);
    // owners' share is capped at 90%; newcomers come on top
    const pot = salesPotential(s, { ...exp('large'), size: 'aaa' }, 100, 3);
    const newcomers = pot.salesWhy.parts.find((x) => x.label === 'Newcomers who buy both')?.value ?? 0;
    const total = pot.platforms.reduce((t, x) => t + x.potential, 0);
    expect(total - newcomers).toBeLessThanOrEqual(owners * 0.9 + 1);
    expect(total - newcomers).toBeGreaterThan(owners * 0.85);
  });
});

describe('publisher advances', () => {
  it('scale down when the game is smaller than the deal was offered for', () => {
    const s = game(1995, 7);
    s.company.reputation = 80;
    s.offers.deals = [];
    s.offers.deals.push({ id: 'dlx', publisherId: Object.keys(s.rivals)[0]!, advance: 1_000_000, royalty: 0.4, minScore: 60, deadlineDay: s.day + 400, reach: 1.5, marketingBudget: 10_000, size: 'aaa', expiresDay: s.day + 60 });
    const cash = s.company.cash;
    const p = startSmall(s, { dealId: 'dlx', platforms: [availablePlatforms(s).find((x) => x.kind === 'computer')!.id] });
    expect(p.concept.deal!.advance).toBeLessThan(200_000);
    expect(p.concept.deal!.advance).toBeGreaterThan(0);
    expect(s.company.cash - cash).toBeLessThanOrEqual(p.concept.deal!.advance);
  });
});

describe('rivalries', () => {
  it('a release near a rival game of the same genre is a showdown with a record', async () => {
    const { showdownOnRelease, nemesis } = await import('../../src/sim/systems/rivalry');
    const s = game(1995, 2);
    const foe = Object.values(s.rivals).find((r) => r.alive && !r.procedural)!;
    const mk = (score: number, day: number) => ({ id: `r${day}`, name: `Mine ${day}`, concept: { genre: 'rpg', topic: 'fantasy' }, day, score } as never);
    const rival = (score: number, day: number) => s.rivalGames.push({ name: `Theirs ${day}`, company: foe.id, genre: 'rpg', topic: 'fantasy', platforms: [], day, score, units: 1 });
    rival(80, s.day - 10);
    const rep = s.company.reputation;
    showdownOnRelease(s, { ...(mk(88, s.day) as object), day: s.day } as never);
    expect(s.rivalry![foe.id]!.wins).toBe(1);
    expect(s.company.reputation).toBeGreaterThan(rep);
    rival(90, s.day - 5);
    showdownOnRelease(s, mk(70, s.day));
    expect(s.rivalry![foe.id]!.losses).toBe(1);
    // too far apart, different genre, or a weak game: no showdown
    showdownOnRelease(s, { ...(mk(90, s.day + 200) as object), day: s.day + 200 } as never);
    showdownOnRelease(s, { id: 'x', name: 'X', concept: { genre: 'racing', topic: 'cars' }, day: s.day, score: 90 } as never);
    showdownOnRelease(s, mk(50, s.day));
    expect(s.rivalry![foe.id]!.wins + s.rivalry![foe.id]!.losses + s.rivalry![foe.id]!.draws).toBe(2);
    expect(nemesis(s)).toBeNull();
    // the same rival games can't be beaten again (no stacking releases against one game)
    showdownOnRelease(s, mk(95, s.day));
    expect(s.rivalry![foe.id]!.wins).toBe(1);
    rival(70, s.day - 3);
    showdownOnRelease(s, mk(89, s.day));
    expect(nemesis(s)?.id).toBe(foe.id);
  });
});

describe('open betas', () => {
  it('in polish, once, after announcing: fewer bugs, more hype, a score read and two more weeks', () => {
    const s = game(2008, 9);
    s.company.cash = 1e7;
    const p = startSmall(s, { platforms: [availablePlatforms(s).find((x) => x.kind === 'computer')!.id] });
    expect(dispatch(s, { type: 'openBeta', projectId: p.id }).ok).toBe(false); // not in polish
    for (let i = 0; i < 200 && p.phase < 2; i++) {
      advance(s, 1);
      if (p.awaitingGate) dispatch(s, { type: 'continueGate', projectId: p.id });
      s.pendingEvents = [];
    }
    expect(dispatch(s, { type: 'openBeta', projectId: p.id }).ok).toBe(false); // not announced
    dispatch(s, { type: 'announce', projectId: p.id });
    p.bugs = 40;
    const hype = p.hype;
    const extra = p.extraDays;
    expect(dispatch(s, { type: 'openBeta', projectId: p.id }).ok).toBe(true);
    expect(p.bugs).toBe(30);
    expect(p.hype).toBeGreaterThan(hype);
    expect(p.extraDays).toBe(extra + 14);
    expect(p.beta!.predicted).toBeGreaterThan(0);
    expect(dispatch(s, { type: 'openBeta', projectId: p.id }).ok).toBe(false); // once
    const old = game(1995, 9);
    const q = startSmall(old);
    q.phase = 2;
    q.announcedDay = old.day;
    expect(dispatch(old, { type: 'openBeta', projectId: q.id }).ok).toBe(false); // too early in history
  });
});

describe('launch titles and series expectations', () => {
  it('games in a platform’s first months get an early-adopter boost that fades', () => {
    const s = game(1995, 3);
    const pl = availablePlatforms(s)[0]!;
    s.day = pl.launchDay;
    expect(launchTitleMul(s, pl)).toBeCloseTo(1.35);
    s.day = pl.launchDay + 60;
    expect(launchTitleMul(s, pl)).toBeGreaterThan(1.1);
    expect(launchTitleMul(s, pl)).toBeLessThan(1.35);
    s.day = pl.launchDay + 200;
    expect(launchTitleMul(s, pl)).toBe(1);
  });
  it('a launch title sells to the base the platform grows into', async () => {
    const s = game(1994, 3);
    const pl = availablePlatforms(s).find((p) => p.id === 'ps1') ?? availablePlatforms(s)[0]!;
    const concept = { name: 'L', genre: 'action' as const, topic: 'scifi', platforms: [pl.id], audience: 'teen' as const, size: 'medium' as const, monetization: 'premium' as const, engineId: 'e0' };
    const { activeUsersM } = await import('../../src/sim/systems/market');
    s.day = pl.launchDay + 10;
    s.market.users[pl.id] = activeUsersM(pl, s.day); // a handful of early owners
    const early = salesPotential(s, concept, 80, 0.5).platforms[0]!.potential;
    s.day = pl.launchDay + 180;
    s.market.users[pl.id] = activeUsersM(pl, s.day);
    const mid = salesPotential(s, concept, 80, 0.5).platforms[0]!.potential;
    expect(early).toBeGreaterThan(mid * 0.5); // no longer ~1% of a later release
  });
  it('a sequel far below the series’ best disappoints players and loses fans', () => {
    const s = game(1990, 5);
    const p = startSmall(s);
    for (let i = 0; i < 200 && !s.releaseOrder.length; i++) {
      advance(s, 1);
      if (p.awaitingGate) dispatch(s, { type: 'continueGate', projectId: p.id });
      s.pendingEvents = [];
    }
    const first = s.releases[s.releaseOrder[0]!]!;
    const fr = s.franchises[first.concept.franchiseId!]!;
    first.score = 99; // your own legendary original
    fr.bestScore = 99;
    fr.fans = 100_000;
    s.research.done.push('biz_self_publishing');
    const q = startSmall(s, { franchiseId: fr.id, name: 'G 2' });
    for (let i = 0; i < 200 && s.releaseOrder.length < 2; i++) {
      advance(s, 1);
      if (q.awaitingGate) dispatch(s, { type: 'continueGate', projectId: q.id });
      s.pendingEvents = [];
    }
    const seq = s.releases[s.releaseOrder[1]!]!;
    expect(seq.why.user!.parts.some((x) => x.label.startsWith('Not as good as the series'))).toBe(true);
    expect(fr.fans).toBeLessThan(100_000 + seq.units); // lost some before new buyers came in
  });
});

describe('retirement', () => {
  it('veterans retire after 30–40 years with a send-off; the founder never does', async () => {
    const { retirementDay, retirementYears } = await import('../../src/sim/systems/staff');
    const s = game(1980, 4);
    const cand = generateCandidate(s, new Rng([5, 6, 7, 8]), { role: 'artist' });
    const { candidateToStaff } = await import('../../src/sim/systems/staff');
    s.staff.vet = candidateToStaff(s, cand, 'vet', 30_000);
    const vet = s.staff.vet!;
    expect(retirementYears(vet)).toBeGreaterThanOrEqual(30);
    expect(retirementYears(vet)).toBeLessThanOrEqual(40);
    expect(retirementDay(s.staff.founder!)).toBeNull();
    vet.hiredDay = s.day - Math.ceil(retirementYears(vet) * 365.25) - 5;
    s.retirementSince = s.day - 4 * 365;
    vet.morale = 100;
    vet.loyalty = 100;
    vet.skills.art = 95;
    const junior = candidateToStaff(s, generateCandidate(s, new Rng([9, 9, 9, 9]), { role: 'artist' }), 'jr', 20_000);
    junior.skills.art = 20;
    junior.potential = 90;
    junior.morale = 100;
    junior.loyalty = 100;
    s.staff.jr = junior;
    advance(s, 35);
    expect(s.staff.jr!.skills.art).toBeGreaterThan(21); // learned from the veteran
    expect(s.staff.vet).toBeUndefined();
    expect(s.alumni?.[0]?.name).toBe(vet.name);
    expect(s.company.moraleMods.some((m) => /farewell/i.test(m.label))).toBe(true);
    expect(s.staff.founder).toBeDefined();
  });
  it('a save from before retirement existed loses its veterans gradually, not all at once', async () => {
    const { candidateToStaff } = await import('../../src/sim/systems/staff');
    const s = game(1980, 8);
    s.day = toDay(2015, 1, 5);
    for (let i = 0; i < 8; i++) {
      const c = generateCandidate(s, new Rng([i + 1, 2, 3, 4]), {});
      s.staff[`old${i}`] = candidateToStaff(s, c, `old${i}`, 30_000);
      s.staff[`old${i}`]!.hiredDay = toDay(1972, 2, 1); // all overdue (30–40 years)
      s.staff[`old${i}`]!.morale = 100;
      s.staff[`old${i}`]!.loyalty = 100;
    }
    delete s.retirementSince;
    s.company.cash = 1e9;
    advance(s, 40);
    const left = Object.keys(s.staff).filter((k) => k.startsWith('old')).length;
    expect(left).toBe(8); // nobody leaves in the first month
    advance(s, 365 * 3 + 40);
    expect(Object.keys(s.staff).filter((k) => k.startsWith('old')).length).toBe(0); // all gone within ~3 years
    expect(s.company.moraleMods.filter((m) => m.label === 'Farewell parties').length).toBeLessThanOrEqual(1);
  });
});

describe('decade in review', () => {
  it('each new decade brings a headline look back, featuring your studio', () => {
    const s = game(1982, 6);
    s.day = toDay(1989, 12, 30);
    const ev = advance(s, 5);
    const n = s.news.find((x) => x.headline.includes('’80s'));
    expect(n).toBeTruthy();
    expect(n!.body).toContain(s.company.name);
    expect(ev.some((e) => e.type === 'news' && e.major && e.newsId === n!.id)).toBe(true);
  });
});

describe('studio identity', () => {
  it('renames and restyles the studio with validation', () => {
    const s = game(1990, 1);
    expect(dispatch(s, { type: 'setIdentity', name: '  New Name  ', color: '#3d85c6', emblem: 'phoenix', shape: 'shield' }).ok).toBe(true);
    expect(s.company.name).toBe('New Name');
    expect(s.company.logo).toEqual({ emblem: 'phoenix', shape: 'shield' });
    expect(dispatch(s, { type: 'setIdentity', name: '   ' }).ok).toBe(false);
    expect(dispatch(s, { type: 'setIdentity', color: 'red' }).ok).toBe(false);
    expect(dispatch(s, { type: 'setIdentity', shape: 'star' as never }).ok).toBe(false);
    expect(dispatch(s, { type: 'setIdentity', emblem: '<script>' }).ok).toBe(false);
    expect(dispatch(s, { type: 'setIdentity', emblem: null }).ok).toBe(true);
    expect(s.company.logo?.emblem).toBeUndefined();
  });
});

describe('achievement catalogue', () => {
  it('has unique ids and every check runs on a fresh and a late game', async () => {
    const { ACHIEVEMENTS, MILESTONES } = await import('../../src/sim/systems/achievements');
    const ids = [...ACHIEVEMENTS.map((a) => a.id), ...MILESTONES.map((m) => m.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const s = game(1990, 3);
    for (const a of ACHIEVEMENTS) expect(typeof a.check(s)).toBe('boolean');
  });
});

describe('mod tools', () => {
  it('PC games in moddable genres ship with mod support: slower decay and happier players', () => {
    const run = (mods: boolean) => {
      const s = game(1999, 4);
      if (mods) s.research.done.push('online_mod_tools');
      const p = startSmall(s, { genre: 'strategy', topic: 'military', platforms: [availablePlatforms(s).find((x) => x.kind === 'computer')!.id] });
      for (let i = 0; i < 200 && !s.releaseOrder.length; i++) {
        advance(s, 1);
        if (p.awaitingGate) dispatch(s, { type: 'continueGate', projectId: p.id });
        s.pendingEvents = [];
      }
      return s.releases[s.releaseOrder[0]!]!;
    };
    const plain = run(false);
    const modded = run(true);
    expect(plain.modded).toBeFalsy();
    expect(modded.modded).toBe(true);
    expect(modded.decay).toBeGreaterThan(plain.decay);
    expect(modded.why.user!.parts.some((x) => x.label === 'Mod support')).toBe(true);
  });
});

describe('staff automation', () => {
  it('idle people join research and burnt-out people take time off, only when switched on', async () => {
    const { candidateToStaff } = await import('../../src/sim/systems/staff');
    const s = game(1995, 5);
    s.company.cash = 1e8;
    const mk = (id: string) => {
      s.staff[id] = candidateToStaff(s, generateCandidate(s, new Rng([id.length, 2, 3, 4]), {}), id, 30_000);
      s.staff[id]!.morale = 90;
      s.staff[id]!.loyalty = 100;
      return s.staff[id]!;
    };
    const idler = mk('idler');
    const tired = mk('tired');
    tired.burnout = 85;
    advance(s, 8);
    expect(idler.assignment.kind).toBe('idle'); // policies off by default
    expect(dispatch(s, { type: 'setPolicy', autoResearch: true, autoVacation: true }).ok).toBe(true);
    tired.burnout = 85;
    advance(s, 8);
    expect(idler.assignment.kind).toBe('research');
    expect(tired.lastVacationDay).toBeDefined();
  });
});

describe('storefront sales', () => {
  it('need digital storefronts, sell discounted copies, fade with repeats and have a cooldown', () => {
    const boxed = game(1990, 4);
    startSmall(boxed);
    advance(boxed, 300);
    expect(canRunSale(boxed, boxed.releases[boxed.releaseOrder[0]!]!)).toMatch(/digital/);

    const s = game(2012, 8);
    s.research.done.push('biz_self_publishing');
    startSmall(s, { platforms: [availablePlatforms(s).find((p) => p.kind === 'computer')!.id] });
    for (let i = 0; i < 200 && !s.releaseOrder.length; i++) {
      advance(s, 1);
      for (const pr of Object.values(s.projects)) if (pr.kind === 'game' && pr.awaitingGate) dispatch(s, { type: 'continueGate', projectId: pr.id });
      s.pendingEvents = [];
    }
    const r = s.releases[s.releaseOrder[0]!]!;
    expect(canRunSale(s, r)).toMatch(/Too new/);
    advance(s, 200);
    r.score = 80;
    r.userScore = 80;
    for (const ps of r.platforms) ps.potential = 200_000;
    expect(canRunSale(s, r)).toBeNull();
    expect(saleForecast(s, r, 0.75)).toBeGreaterThan(saleForecast(s, r, 0.25));
    const first = saleForecast(s, r, 0.5);
    const units = r.units;
    const net = r.net;
    expect(dispatch(s, { type: 'runSale', releaseId: r.id, discount: 0.5 }).ok).toBe(true);
    expect(dispatch(s, { type: 'runSale', releaseId: r.id, discount: 0.5 }).ok).toBe(false); // cooldown
    expect(dispatch(s, { type: 'runSale', releaseId: r.id, discount: 0.3 as never }).ok).toBe(false);
    advance(s, 28);
    expect(r.units - units).toBeGreaterThan(first * 0.5);
    expect(r.net).toBeGreaterThan(net);
    expect(saleForecast(s, r, 0.5)).toBeLessThan(first); // repeat sales draw less
    advance(s, 160);
    expect(canRunSale(s, r)).toBeNull();
  });
});

describe('esports leagues', () => {
  it('need research and a strong competitive game, earn per viewer, hold finals and follow sequels', () => {
    const s = game(2012, 5);
    s.research.done.push('biz_self_publishing');
    s.company.cash = 1e9;
    s.company.reputation = 70;
    const plat = availablePlatforms(s).find((p) => p.kind === 'computer')!.id;
    startSmall(s, { genre: 'shooter', topic: 'scifi', platforms: [plat] });
    for (let i = 0; i < 300 && !s.releaseOrder.length; i++) {
      advance(s, 1);
      for (const pr of Object.values(s.projects)) if (pr.kind === 'game' && pr.awaitingGate) dispatch(s, { type: 'continueGate', projectId: pr.id });
      s.pendingEvents = [];
    }
    const r = s.releases[s.releaseOrder[0]!]!;
    r.score = 85;
    r.platforms[0]!.units = 20e6;
    r.units = 20e6;
    const found = (extra = {}) => dispatch(s, { type: 'foundLeague', releaseId: r.id, tier: 'pro', name: 'Arena League', ...extra });
    expect(found().ok).toBe(false); // no research yet
    s.research.done.push('biz_esports');
    expect(found({ name: '  ' }).ok).toBe(false);
    expect(found({ tier: 'galactic' }).ok).toBe(false);
    const cash = s.company.cash;
    expect(found().ok).toBe(true);
    expect(s.company.cash).toBeLessThan(cash);
    expect(found().ok).toBe(false); // one league per franchise
    const lg = s.leagues![0]!;
    const fans = s.franchises[r.concept.franchiseId!]!.fans;
    advance(s, 400);
    s.pendingEvents = [];
    expect(lg.viewers).toBeGreaterThan(100_000);
    expect(lg.revenue).toBeGreaterThan(0);
    expect(lg.seasons).toBe(1);
    expect(lg.prestige).toBeGreaterThan(8);
    expect(s.franchises[r.concept.franchiseId!]!.fans).toBeGreaterThan(fans);
    // a strong sequel takes the league over
    startSmall(s, { genre: 'shooter', topic: 'scifi', platforms: [plat], franchiseId: r.concept.franchiseId, name: 'Arena 2' });
    for (let i = 0; i < 300 && s.releaseOrder.length < 2; i++) {
      s.cheats = { scoreBonus: 40 };
      advance(s, 1);
      for (const pr of Object.values(s.projects)) if (pr.kind === 'game' && pr.awaitingGate) dispatch(s, { type: 'continueGate', projectId: pr.id });
      s.pendingEvents = [];
    }
    const sequel = s.releases[s.releaseOrder[1]!]!;
    expect(sequel.score).toBeGreaterThanOrEqual(70);
    expect(lg.releaseId).toBe(sequel.id);
    expect(dispatch(s, { type: 'closeLeague', id: lg.id }).ok).toBe(true);
    expect(lg.status).toBe('closed');
    expect(dispatch(s, { type: 'closeLeague', id: lg.id }).ok).toBe(false);
  });
});

describe('event catalogue', () => {
  it('has unique ids, so every option resolves through its own event', async () => {
    const { EVENT_DEFS } = await import('../../src/sim/systems/events');
    const ids = EVENT_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('new modern-scene events resolve without breaking state', async () => {
    const { EVENT_DEFS } = await import('../../src/sim/systems/events');
    const s = game(2016, 12);
    s.research.done.push('biz_self_publishing');
    s.company.cash = 1e8;
    startSmall(s, { size: 'small' });
    for (let i = 0; i < 300 && !s.releaseOrder.length; i++) {
      advance(s, 1);
      for (const pr of Object.values(s.projects)) if (pr.kind === 'game' && pr.awaitingGate) dispatch(s, { type: 'continueGate', projectId: pr.id });
      s.pendingEvents = [];
    }
    const r = s.releases[s.releaseOrder[0]!]!;
    r.score = 85;
    const before = r.platforms[0]!.potential;
    const c = { s, rng: new Rng([1, 2, 3, 4]), out: [] };
    const def = EVENT_DEFS.find((d) => d.id === 'streamer_spotlight')!;
    expect(def.weight(s)).toBeGreaterThan(0);
    const made = def.make(c)!;
    def.resolve(c, { uid: 1, defId: def.id, day: s.day, expires: s.day + 30, title: made.title, body: made.body, options: made.options, ctx: made.ctx, art: def.art } as never, 'sponsor');
    expect(r.platforms[0]!.potential).toBeGreaterThan(before * 1.1);
    const loc = EVENT_DEFS.find((d) => d.id === 'localization_offer')!;
    const m2 = loc.make(c)!;
    const p0 = r.platforms[0]!.potential;
    loc.resolve(c, { ctx: m2.ctx } as never, 'yes');
    expect(r.platforms[0]!.potential).toBeGreaterThan(p0);
  });
});

describe('vacations', () => {
  it('take people out of work, cut burnout, and have a cooldown', () => {
    const s = game(1985, 3);
    const f = s.staff.founder!;
    f.burnout = 70;
    f.energy = 20;
    expect(dispatch(s, { type: 'vacation', staffId: 'founder', days: 14 }).ok).toBe(true);
    advance(s, 3);
    expect(f.activity).toBe('vacation');
    advance(s, 12);
    expect(f.vacationDays).toBe(0);
    expect(f.burnout).toBeLessThan(30);
    expect(f.energy).toBeGreaterThan(80);
    expect(dispatch(s, { type: 'vacation', staffId: 'founder', days: 7 }).ok).toBe(false);
    advance(s, 120);
    expect(dispatch(s, { type: 'vacation', staffId: 'founder', days: 7 }).ok).toBe(true);
  });
});

describe('subscription pass', () => {
  it('needs research and a catalogue, then grows recurring revenue', () => {
    const s = game(2015, 8);
    s.company.cash = 1e8;
    s.company.reputation = 80;
    expect(dispatch(s, { type: 'launchSubscription', name: 'P', price: subRefPrice(s) }).ok).toBe(false);
    s.research.done.push('biz_subscription');
    expect(dispatch(s, { type: 'launchSubscription', name: 'P', price: subRefPrice(s) }).ok).toBe(false); // no catalogue
    for (let i = 0; i < 10; i++) {
      startSmall(s);
      advance(s, 70);
      const rel = s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]!;
      rel.score = 85;
      for (const st of Object.values(s.staff)) st.assignment = { kind: 'idle' };
      for (const id of Object.keys(s.projects)) delete s.projects[id];
    }
    s.company.reputation = 80;
    expect(dispatch(s, { type: 'launchSubscription', name: 'P', price: subRefPrice(s) * 10 }).ok).toBe(false);
    expect(dispatch(s, { type: 'launchSubscription', name: 'P', price: subRefPrice(s) }).ok).toBe(true);
    advance(s, 200);
    expect(s.subscription!.subscribers).toBeGreaterThan(0);
    expect(s.subscription!.revenue).toBeGreaterThan(0);
    expect(catalogSalesMul(s, s.day - 400)).toBeLessThan(1);
    expect(catalogSalesMul(s, s.day - 100)).toBe(1);
    // pricier pass → fewer subscribers
    expect(subTarget(s, subRefPrice(s) * 2).subsM).toBeLessThan(subTarget(s, subRefPrice(s)).subsM);
    expect(dispatch(s, { type: 'closeSubscription' }).ok).toBe(true);
    expect(catalogSalesMul(s, s.day - 400)).toBe(1);
  });
});

describe('cross-play research', () => {
  it('boosts multi-platform online games only', () => {
    const s = game(2019, 4);
    const plats = availablePlatforms(s).slice(0, 2).map((p) => p.id);
    const concept = { name: 'X', genre: 'shooter' as const, topic: 'scifi', platforms: plats, audience: 'teen' as const, size: 'medium' as const, monetization: 'premium' as const, engineId: 'e0' };
    const before = salesPotential(s, concept, 80, 0.5).platforms.reduce((t, p) => t + p.potential, 0);
    s.research.done.push('online_crossplay');
    const after = salesPotential(s, concept, 80, 0.5).platforms.reduce((t, p) => t + p.potential, 0);
    expect(after / before).toBeCloseTo(BALANCE.CROSSPLAY_SALES, 5);
    const puzzle = { ...concept, genre: 'puzzle' as const };
    const p1 = salesPotential(s, puzzle, 80, 0.5).salesWhy.parts.some((x) => x.label === 'Cross-play');
    expect(p1).toBe(false);
  });
});

describe('Golden Pixel Gala', () => {
  it('records industry winners every year and lets a great player game win', () => {
    const s = game(1984, 12);
    startSmall(s);
    advance(s, 120);
    const rel = s.releases[s.releaseOrder[0]!]!;
    rel.score = 99;
    s.company.cash = 1e7;
    advance(s, 366);
    const y = s.awardHistory!.find((h) => h.year === 1984)!;
    expect(y).toBeDefined();
    const goty = y.winners.find((w) => w.category === 'Game of the Year')!;
    expect(goty.mine).toBe(true);
    expect(rel.awards).toContain('Game of the Year');
    s.company.cash = 1e7;
    advance(s, 366);
    const y2 = s.awardHistory!.find((h) => h.year === 1985)!;
    expect(y2.winners.length).toBeGreaterThan(0);
    expect(y2.winners.every((w) => !w.mine)).toBe(true);
  });
});

describe('studio showcase', () => {
  it('needs fame and an announced game, hypes it, then cools down for a year', () => {
    const s = game(1995, 14);
    s.company.cash = 1e7;
    const p = startSmall(s);
    expect(dispatch(s, { type: 'hostShowcase' }).ok).toBe(false); // not famous
    s.company.reputation = 90;
    expect(dispatch(s, { type: 'hostShowcase' }).ok).toBe(false); // nothing announced
    expect(dispatch(s, { type: 'announce', projectId: p.id }).ok).toBe(true);
    const before = p.hype;
    expect(dispatch(s, { type: 'hostShowcase' }).ok).toBe(true);
    expect(p.hype).toBeGreaterThan(before + 0.5);
    expect(dispatch(s, { type: 'hostShowcase' }).ok).toBe(false); // cooldown
  });
});

describe('gala fairness (review regressions)', () => {
  const setup = (mine: number, rival: number, classic: boolean, genre: 'rpg' | 'action' = 'rpg') => {
    const s = game(1990, 2);
    s.rivalGames = [];
    const day = toDay(1990, 6, 1);
    s.releases.r1 = { id: 'r1', name: 'Mine', day, score: mine, concept: { genre: 'rpg', platforms: [] }, awards: [] } as unknown as GameState['releases'][string];
    s.releaseOrder = ['r1'];
    s.rivalGames.push({ name: 'Theirs', company: 'nintendo', genre, topic: 'fantasy', platforms: [], day, score: rival, units: 1, franchise: classic ? 'x' : undefined });
    yearlyAwards({ s, rng: new Rng([1, 2, 3, 4]), out: [] }, 1990);
    const w = s.awardHistory!.at(-1)!.winners;
    return { goty: w.find((x) => x.category === 'Game of the Year'), rpg: w.find((x) => x.category === 'Best RPG') };
  };
  it('never lets a rival beat a better player game, or the player beat a better rival', () => {
    expect(setup(85, 87, false).goty?.mine).toBe(false);
    expect(setup(85, 87, false).rpg?.name).toBe('Theirs');
    expect(setup(88, 86, true).goty?.mine).toBe(true);
    expect(setup(82, 80, true).rpg?.mine).toBe(true);
    expect(setup(80, 76, false).goty).toBeUndefined();
    expect(setup(60, 79, false, 'action').goty?.name).toBe('Theirs');
  });
});

describe('legacy events', () => {
  it('a movie deal appears for a big franchise and changes its fans', () => {
    const s = game(2000, 6);
    const ev = EVENT_DEFS.find((e) => e.id === 'movie_deal')!;
    expect(ev.weight(s)).toBe(0);
    s.franchises.f1 = { id: 'f1', name: 'Star Hopper', genre: 'action', topic: 'scifi', fans: 3_000_000, entries: [], fatigue: 0, lastDay: s.day, bestScore: 90 };
    expect(ev.weight(s)).toBeGreaterThan(0);
    const rng = new Rng([5, 6, 7, 8]);
    const made = ev.make({ s, rng, out: [] })!;
    const cash = s.company.cash;
    ev.resolve({ s, rng, out: [] }, { uid: 1, defId: 'movie_deal', title: made.title, body: made.body, art: 'press', options: made.options, ctx: made.ctx, day: s.day, expires: s.day + 30 } as never, 'license');
    expect(s.company.cash).toBeGreaterThan(cash);
    expect(s.franchises.f1!.fans).not.toBe(3_000_000);
  });
});

describe('publishing label', () => {
  it('funds an indie game, ships it, and pays a revenue share over six months', () => {
    const s = game(2000, 21);
    s.company.cash = 1e8;
    s.company.reputation = 60;
    expect(dispatch(s, { type: 'signIndie', rivalId: 'x', tier: 'small' }).ok).toBe(false); // no self-publishing
    s.research.done.push('biz_self_publishing');
    for (let i = 0; i < 6 && !signableIndies(s).length; i++) advance(s, 31);
    const indie = signableIndies(s)[0]!;
    expect(indie).toBeDefined();
    const cash = s.company.cash;
    expect(dispatch(s, { type: 'signIndie', rivalId: indie.id, tier: 'medium' }).ok).toBe(true);
    expect(s.company.cash).toBeLessThan(cash);
    expect(signableIndies(s).some((r) => r.id === indie.id)).toBe(false); // busy
    for (let m = 0; m < 22; m++) {
      advance(s, 31);
      s.pendingEvents = [];
      s.company.cash = Math.max(s.company.cash, 1e6);
    }
    const d = s.publishingDeals![0]!;
    expect(d.status).toBe('done');
    expect(d.score).toBeGreaterThan(0);
    expect(d.earned).toBeGreaterThan(0);
    expect(s.rivalGames.some((g) => g.name === d.gameName)).toBe(true);
  });
});

describe('publishing label (review regressions)', () => {
  const signed = () => {
    const s = game(2000, 21);
    s.company.cash = 1e8;
    s.company.reputation = 60;
    s.research.done.push('biz_self_publishing');
    for (let i = 0; i < 6 && !signableIndies(s).length; i++) advance(s, 31);
    const indie = signableIndies(s)[0]!;
    s.offers.acquisitions.push({ id: indie.id, price: 1, expiresDay: s.day + 90 });
    expect(dispatch(s, { type: 'signIndie', rivalId: indie.id, tier: 'small' }).ok).toBe(true);
    return { s, indie };
  };
  it('a funded studio is not for sale', () => {
    const { s, indie } = signed();
    expect(s.offers.acquisitions.some((a) => a.id === indie.id)).toBe(false);
  });
  it('a studio that dies before shipping loses the game', () => {
    const { s, indie } = signed();
    indie.alive = false;
    advance(s, 40);
    const d = s.publishingDeals![0]!;
    expect(d.status).toBe('done');
    expect(d.earned).toBe(0);
  });
  it('published games carry platforms and are not award rivals', () => {
    const { s } = signed();
    for (let m = 0; m < 12; m++) {
      advance(s, 31);
      s.pendingEvents = [];
    }
    const d = s.publishingDeals![0]!;
    const g = s.rivalGames.find((x) => x.name === d.gameName)!;
    expect(g.publishedByPlayer).toBe(true);
    expect(g.platforms.length).toBeGreaterThan(0);
  });
});
