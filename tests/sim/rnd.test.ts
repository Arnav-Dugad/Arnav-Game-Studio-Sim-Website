import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { advance } from '../../src/sim/advance';
import { RESEARCH } from '../../src/data/research';
import { RND_MAX, RND_UNLOCK, rndBugs, rndCost, rndLevel, rndPoints } from '../../src/sim/systems/rnd';

function studio() {
  const s = createGame({ seed: 9, companyName: 'Lab Co', founderName: 'Ada Founder', startYear: 2005, autopause: false });
  s.company.cash = 1e9;
  s.cheats = { ...(s.cheats ?? {}), noEvents: true } as typeof s.cheats;
  return s;
}

describe('R&D programmes', () => {
  it('open only after enough research, and one project at a time', () => {
    const s = studio();
    s.research.done = RESEARCH.slice(0, RND_UNLOCK - 1).map((r) => r.id);
    expect(dispatch(s, { type: 'startRnd', id: 'rd_qa' }).ok).toBe(false);
    s.research.done = RESEARCH.slice(0, RND_UNLOCK).map((r) => r.id);
    s.research.active = null;
    expect(dispatch(s, { type: 'startRnd', id: 'rd_bogus' }).ok).toBe(false);
    expect(dispatch(s, { type: 'startRnd', id: 'rd_qa' }).ok).toBe(true);
    expect(dispatch(s, { type: 'startRnd', id: 'rd_engine' }).ok).toBe(false); // busy
  });

  it('a finished level makes the next one dearer and applies its effect', () => {
    const s = studio();
    s.research.done = RESEARCH.slice(0, RND_UNLOCK).map((r) => r.id);
    s.research.active = null;
    dispatch(s, { type: 'assign', staffId: 'founder', to: 'research' });
    const cost0 = rndCost(s, 'rd_qa');
    const pts0 = rndPoints(s, 'rd_qa');
    expect(dispatch(s, { type: 'startRnd', id: 'rd_qa' }).ok).toBe(true);
    s.research.progress = pts0 - 0.01;
    for (let i = 0; i < 10 && rndLevel(s, 'rd_qa') === 0; i++) advance(s, 1);
    expect(rndLevel(s, 'rd_qa')).toBe(1);
    expect(s.research.active).not.toBe('rd_qa');
    expect(rndCost(s, 'rd_qa')).toBeGreaterThan(cost0);
    expect(rndPoints(s, 'rd_qa')).toBeGreaterThan(pts0);
    expect(rndBugs(s)).toBeCloseTo(0.96);
  });

  it('stops at the top level, and stopping refunds half', () => {
    const s = studio();
    s.research.done = RESEARCH.slice(0, RND_UNLOCK).map((r) => r.id);
    s.research.active = null;
    s.research.levels = { rd_market: RND_MAX };
    expect(dispatch(s, { type: 'startRnd', id: 'rd_market' }).ok).toBe(false);
    const cash = s.company.cash;
    dispatch(s, { type: 'startRnd', id: 'rd_liveops' });
    const paid = cash - s.company.cash;
    dispatch(s, { type: 'cancelResearch' });
    expect(cash - s.company.cash).toBeCloseTo(paid / 2, -1);
    expect(s.research.active).toBeNull();
  });
});
