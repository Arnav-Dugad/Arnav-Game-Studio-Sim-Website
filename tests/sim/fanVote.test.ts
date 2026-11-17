import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { availablePlatforms } from '../../src/sim/systems/market';
import { fireEvent } from '../../src/sim/systems/events';
import type { Franchise, GameProject } from '../../src/sim/types';

describe('fan vote', () => {
  it('the winning series gets fans, and its sequel starts with extra hype (once)', () => {
    const s = createGame({ seed: 47, companyName: 'Poll Co', founderName: 'Ada Founder', startYear: 2010, autopause: false });
    s.company.cash = 1e8;
    const mk = (id: string, fans: number) => ({ id, name: id === 'f1' ? 'Star Saga' : 'Mud Racers', genre: 'action', topic: 'space', fans, entries: ['x', 'y'], fatigue: 0, lastDay: s.day, bestScore: 80 }) as Franchise;
    s.franchises = { f1: mk('f1', 500_000), f2: mk('f2', 400_000) };
    expect(fireEvent({ s, rng: new Rng(s.rng), out: [] }, 'fan_vote')).toBe(true);
    const ev = s.pendingEvents.find((e) => e.defId === 'fan_vote')!;
    dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: 'poll' });
    const win = Object.values(s.franchises).find((f) => f.votedUntil !== undefined)!;
    expect(win).toBeDefined();
    const pl = availablePlatforms(s)[0]!;
    const plain = (fid: string) => {
      dispatch(s, { type: 'startGame', game: { name: `Next ${fid}`, genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'], franchiseId: fid } });
      const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
      const h = p.hype;
      dispatch(s, { type: 'cancelProject', projectId: p.id });
      return h;
    };
    const loser = win.id === 'f1' ? 'f2' : 'f1';
    const voted = plain(win.id);
    expect(win.votedUntil).toBeUndefined(); // used up
    const again = plain(win.id);
    expect(voted).toBeGreaterThan(again);
    expect(plain(loser)).toBeLessThan(voted);
  });
});
