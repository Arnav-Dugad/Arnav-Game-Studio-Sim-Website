import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { availablePlatforms } from '../../src/sim/systems/market';
import { fireEvent } from '../../src/sim/systems/events';
import type { GameProject } from '../../src/sim/types';

describe('easter eggs', () => {
  it('a secret left in is found by players after launch', () => {
    const s = createGame({ seed: 33, companyName: 'Egg Co', founderName: 'Ada Founder', startYear: 1995, autopause: false });
    s.company.cash = 1e8;
    s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 10 } as never;
    const f = s.staff['founder']!;
    s.staff['e1'] = { ...structuredClone(f), id: 'e1', name: 'Eli Egg', role: 'programmer', assignment: { kind: 'idle' }, deskId: undefined, mood: undefined };
    const pl = availablePlatforms(s)[0]!;
    dispatch(s, { type: 'startGame', game: { name: 'Secrets', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder', 'e1'] } });
    const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
    p.phase = 1;
    expect(fireEvent({ s, rng: new Rng(s.rng), out: [] }, 'easter_egg')).toBe(true);
    const ev = s.pendingEvents.find((e) => e.defId === 'easter_egg')!;
    dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: 'keep' });
    expect(p.easterEgg?.by).toBe('e1');
    for (let i = 0; i < 40 && Object.keys(s.projects).length; i++) advance(s, 30);
    const r = Object.values(s.releases)[0]!;
    expect(r.easterEgg).toBeDefined();
    advance(s, 365 * 2);
    expect(r.easterEgg!.found).toBe(true);
    expect(s.news.some((n) => n.headline.includes('Players discover a secret in Secrets'))).toBe(true);
  });
});
