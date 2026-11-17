import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { toDay } from '../../src/sim/calendar';
import { availablePlatforms } from '../../src/sim/systems/market';
import { fireEvent } from '../../src/sim/systems/events';

describe('loot boxes', () => {
  it('only on free-to-play / live games; regulators come for them from 2018', () => {
    const s = createGame({ seed: 6, companyName: 'Test', founderName: 'T', startYear: 2016, autopause: false });
    s.company.cash = 1e8;
    s.cheats = { ...(s.cheats ?? {}), workMul: 5 } as never;
    const pl = availablePlatforms(s).find((p) => p.kind === 'mobile') ?? availablePlatforms(s)[0]!;
    const base = { name: 'Gacha', genre: 'rpg' as const, topic: 'fantasy', platforms: [pl.id], audience: 'teen' as const, size: 'small' as const, engineId: 'e0', team: ['founder'], features: ['loot_boxes'] };
    expect(dispatch(s, { type: 'startGame', game: { ...base, monetization: 'premium' } }).ok).toBe(false);
    expect(dispatch(s, { type: 'startGame', game: { ...base, monetization: 'f2p' } }).ok).toBe(true);
    for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
    const rel = Object.values(s.releases)[0]!;
    expect(rel.why.user!.parts.some((x) => x.label === 'Loot boxes')).toBe(true);
    s.day = Math.max(s.day, toDay(2018, 3, 1));
    rel.active = true;
    for (const opt of ['remove', 'odds', 'fight']) {
      const s2 = structuredClone(s);
      const c = { s: s2, rng: new Rng(s2.rng), out: [] };
      s2.eventCooldowns = {};
      expect(fireEvent(c, 'lootbox_regulation')).toBe(true);
      const ev = s2.pendingEvents.find((e) => e.defId === 'lootbox_regulation')!;
      expect(dispatch(s2, { type: 'resolveEvent', uid: ev.uid, option: opt }).ok).toBe(true);
      if (opt === 'remove') expect(Object.values(s2.releases)[0]!.concept.features).not.toContain('loot_boxes');
    }
  });
});
