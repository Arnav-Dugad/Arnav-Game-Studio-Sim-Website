import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { communityBlocked, communityNudge, communityUserBonus } from '../../src/sim/systems/community';

describe('player community', () => {
  it('opens after a first game, grows from fans and its health follows the mood', () => {
    const s = createGame({ seed: 3, companyName: 'Test', founderName: 'T', startYear: 2008, autopause: false });
    s.company.cash = 1e7;
    expect(communityBlocked(s)).toMatch(/Ship a game/);
    s.releaseOrder.push('fake');
    s.company.fans = 500_000;
    expect(dispatch(s, { type: 'foundCommunity' }).ok).toBe(true);
    expect(dispatch(s, { type: 'foundCommunity' }).ok).toBe(false);
    s.releaseOrder = [];
    advance(s, 120);
    const cm = s.community!;
    expect(cm.members).toBeGreaterThan(5_000);
    expect(dispatch(s, { type: 'setModeration', level: 2 }).ok).toBe(true);
    advance(s, 200);
    const healthy = cm.health;
    expect(healthy).toBeGreaterThan(55);
    expect(communityUserBonus(s)).toBeGreaterThan(0);
    dispatch(s, { type: 'setModeration', level: 0 });
    for (let i = 0; i < 10; i++) {
      communityNudge(s, -40);
      advance(s, 7);
    }
    expect(cm.health).toBeLessThan(healthy - 15);
  });
});
