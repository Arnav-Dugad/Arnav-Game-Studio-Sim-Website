import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { codevBlocked, codevPartners } from '../../src/sim/systems/codev';
import type { GameProject, GameState } from '../../src/sim/types';

function setup(withPartner: boolean): { s: GameState; p: GameProject } {
  const s = createGame({ seed: 8, companyName: 'Test', founderName: 'T', startYear: 1998, autopause: false });
  s.company.cash = 1e8;
  s.company.reputation = 60;
  s.releaseOrder.push('fake'); // allow a medium game
  const pl = availablePlatforms(s)[0]!;
  dispatch(s, { type: 'startGame', game: { name: 'Duo', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'medium', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  s.releaseOrder = [];
  const p = Object.values(s.projects)[0] as GameProject;
  if (withPartner) {
    expect(codevBlocked(s, p)).toBeNull();
    const partner = codevPartners(s)[0]!;
    expect(dispatch(s, { type: 'coDevelop', projectId: p.id, rivalId: partner.id }).ok).toBe(true);
    expect(p.coDev!.share).toBeGreaterThanOrEqual(0.15);
    expect(dispatch(s, { type: 'coDevelop', projectId: p.id, rivalId: partner.id }).ok).toBe(false);
  }
  return { s, p };
}

describe('co-development', () => {
  it('a partner adds work every day and takes a share of the revenue', () => {
    const a = setup(false);
    const b = setup(true);
    advance(a.s, 40);
    advance(b.s, 40);
    expect(b.p.design + b.p.tech).toBeGreaterThan((a.p.design + a.p.tech) * 1.3);
    for (let i = 0; i < 20 && Object.keys(b.s.projects).length; i++) advance(b.s, 30);
    const rel = Object.values(b.s.releases)[0]!;
    expect(rel.coDev?.share).toBe(b.p.coDev!.share);
  });
});
