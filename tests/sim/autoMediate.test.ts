import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng, seedRng } from '../../src/sim/rng';
import { fireEvent } from '../../src/sim/systems/events';
import { pairKey } from '../../src/sim/systems/relations';

function feudingStudio(policy: boolean) {
  const s = createGame({ seed: 3, companyName: 'Calm Co', founderName: 'Ada Founder', startYear: 2000, autopause: false });
  s.company.cash = 1e7;
  const f = s.staff['founder']!;
  s.staff['x1'] = { ...structuredClone(f), id: 'x1', name: 'Pat One', role: 'designer', assignment: { kind: 'idle' }, deskId: undefined };
  s.staff['x2'] = { ...structuredClone(f), id: 'x2', name: 'Sam Two', role: 'programmer', assignment: { kind: 'idle' }, deskId: undefined };
  s.relations = { [pairKey('x1', 'x2')]: -90 };
  if (policy) dispatch(s, { type: 'setPolicy', autoMediate: true });
  return s;
}

describe('always mediate feuds', () => {
  it('without the policy, a feud asks the player', () => {
    const s = feudingStudio(false);
    expect(fireEvent({ s, rng: new Rng(seedRng(1)), out: [] }, 'feud')).toBe(true);
    expect(s.pendingEvents.some((e) => e.defId === 'feud')).toBe(true);
  });
  it('with it, a mediator is brought in straight away — no popup, a small fee', () => {
    const s = feudingStudio(true);
    const cash = s.company.cash;
    const out: never[] = [];
    expect(fireEvent({ s, rng: new Rng(seedRng(1)), out }, 'feud')).toBe(true);
    expect(s.pendingEvents.some((e) => e.defId === 'feud')).toBe(false);
    expect(out.length).toBe(0);
    expect(s.company.cash).toBeLessThan(cash);
    expect(s.relations![pairKey('x1', 'x2')]).toBeGreaterThan(-90);
  });
});
