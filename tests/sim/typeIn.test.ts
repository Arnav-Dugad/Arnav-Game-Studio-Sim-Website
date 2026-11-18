import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng, seedRng } from '../../src/sim/rng';
import { toDay } from '../../src/sim/calendar';
import { EVENT_DEFS, fireEvent } from '../../src/sim/systems/events';
import { availablePlatforms, platformInfo } from '../../src/sim/systems/market';
import type { Release } from '../../src/sim/types';

describe('type-in listings', () => {
  it('a printed listing comes back years later as a loyal developer', () => {
    const s = createGame({ seed: 11, companyName: 'Listing Co', founderName: 'Ada Founder', startYear: 1982, autopause: false });
    const pc = availablePlatforms(s).find((p) => platformInfo(s, p.id)?.kind === 'computer')!;
    s.releases.r1 = { id: 'r1', name: 'Cave Crawler', concept: { name: 'Cave Crawler', size: 'small', platforms: [pc.id] }, platforms: [], score: 70 } as unknown as Release;
    s.releaseOrder.push('r1');
    const def = (id: string) => EVENT_DEFS.find((d) => d.id === id)!;
    expect(def('type_in').weight(s)).toBeGreaterThan(0);
    expect(def('type_in_grown_up').weight(s)).toBe(0);

    const cash = s.company.cash;
    expect(fireEvent({ s, rng: new Rng(seedRng(1)), out: [] }, 'type_in')).toBe(true);
    const ev = s.pendingEvents.find((e) => e.defId === 'type_in')!;
    dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: 'print' });
    expect(s.company.cash).toBeGreaterThan(cash);
    expect(s.company.typeIn?.game).toBe('Cave Crawler');
    expect(def('type_in').weight(s)).toBe(0); // once

    expect(def('type_in_grown_up').weight(s)).toBe(0); // not yet: the kids are still kids
    s.day = toDay(1996, 6, 1);
    expect(def('type_in_grown_up').weight(s)).toBeGreaterThan(0);
    const staff = Object.keys(s.staff).length;
    expect(fireEvent({ s, rng: new Rng(seedRng(2)), out: [] }, 'type_in_grown_up')).toBe(true);
    const ev2 = s.pendingEvents.find((e) => e.defId === 'type_in_grown_up')!;
    expect(ev2.body).toContain('Cave Crawler');
    dispatch(s, { type: 'resolveEvent', uid: ev2.uid, option: 'hire' });
    expect(Object.keys(s.staff).length).toBe(staff + 1);
    expect(def('type_in_grown_up').weight(s)).toBe(0); // only one
  });
});
