import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng, seedRng } from '../../src/sim/rng';
import { toDay } from '../../src/sim/calendar';
import { fireEvent } from '../../src/sim/systems/events';

describe('April Fools', () => {
  it('a joke game delights players, and sometimes becomes a real pitch', () => {
    let pitched = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame({ seed, companyName: 'Joke Co', founderName: 'Ada Founder', startYear: 2000, autopause: false });
      s.day = toDay(2001, 3, 28);
      s.releaseOrder.push('a', 'b');
      const f = s.staff['founder']!;
      s.staff['d1'] = { ...structuredClone(f), id: 'd1', name: 'Dee Designer', role: 'designer', assignment: { kind: 'idle' }, deskId: undefined };
      const c = { s, rng: new Rng(seedRng(seed)), out: [] };
      expect(fireEvent(c, 'april_fools')).toBe(true);
      const ev = s.pendingEvents.find((e) => e.defId === 'april_fools')!;
      const fans = s.company.fans;
      expect(dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: 'go' }).ok).toBe(true);
      expect(s.company.fans).toBeGreaterThanOrEqual(fans);
      if (s.company.pitch) {
        pitched++;
        expect(s.company.pitch.staffId).toBe('d1');
      }
    }
    expect(pitched).toBeGreaterThan(0);
    expect(pitched).toBeLessThan(12);
  });
});
