import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { advance } from '../../src/sim/advance';
import { gameQuality } from '../../src/sim/systems/dev';
import { productionExtraDaily } from '../../src/sim/systems/production';
import type { GameProject } from '../../src/sim/types';

function start(production?: string) {
  const s = createGame({ seed: 8, companyName: 'Prod Co', founderName: 'T', startYear: 1985, autopause: false });
  s.company.cash = 1e8;
  const r = dispatch(s, { type: 'startGame', game: { name: 'Budget Test', genre: 'action', topic: 'scifi', platforms: [Object.keys(s.market.users)[0]!], audience: 'everyone', size: 'small', monetization: 'premium', engineId: 'e0', team: Object.keys(s.staff), production } });
  expect(r.ok).toBe(true);
  const p = Object.values(s.projects).find((x): x is GameProject => x.kind === 'game')!;
  return { s, p };
}

describe('production values', () => {
  it('stores only valid, non-standard tiers', () => {
    expect(start('lavish').p.concept.production).toBe('lavish');
    expect(start('standard').p.concept.production).toBeUndefined();
    expect(start('bogus').p.concept.production).toBeUndefined();
  });

  it('lavish costs more and scores higher; lean saves money and scores lower', () => {
    const spend = (tier?: string) => {
      const { s, p } = start(tier);
      const cash0 = s.company.cash;
      advance(s, 20);
      return { spent: cash0 - s.company.cash, q: gameQuality(s, p, true).total };
    };
    const lean = spend('lean');
    const std = spend();
    const lav = spend('lavish');
    expect(lav.spent).toBeGreaterThan(std.spent);
    expect(lean.spent).toBeLessThanOrEqual(std.spent);
    expect(lav.q).toBeGreaterThan(std.q);
    expect(lean.q).toBeLessThan(std.q);
    expect(productionExtraDaily('aaa', 'lavish', 0)).toBeGreaterThan(productionExtraDaily('small', 'lavish', 0));
    expect(productionExtraDaily('medium', 'standard', 0)).toBe(0);
  });
});
