import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { fromDay } from '../../src/sim/calendar';
import { availablePlatforms } from '../../src/sim/systems/market';
import { fireEvent } from '../../src/sim/systems/events';
import { docOutcome } from '../../src/sim/systems/documentary';
import type { GameProject } from '../../src/sim/types';

function setup(scoreBonus: number) {
  const s = createGame({ seed: 4, companyName: 'Doc Co', founderName: 'Ada Founder', startYear: 1998, autopause: false });
  s.company.cash = 1e8;
  s.company.reputation = 40;
  s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus } as never;
  s.releaseOrder.push('fake'); // allow a medium game
  const pl = availablePlatforms(s)[0]!;
  const r = dispatch(s, { type: 'startGame', game: { name: 'Lens', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'medium', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  expect(r.ok).toBe(true);
  s.releaseOrder = s.releaseOrder.filter((x) => x !== 'fake');
  const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
  return { s, p };
}

describe('making-of documentary', () => {
  it('maps reception and crunch to the film’s outcome', () => {
    expect(docOutcome(90, 0)).toBe('acclaimed');
    expect(docOutcome(90, 40)).toBe('mixed');
    expect(docOutcome(75, 0)).toBe('warm');
    expect(docOutcome(65, 0)).toBe('mixed');
    expect(docOutcome(40, 0)).toBe('cautionary');
  });

  it('the crew follows the game to launch, and the film premieres on the first of a month', () => {
    const { s, p } = setup(40);
    const c = { s, rng: new Rng(s.rng), out: [] };
    expect(fireEvent(c, 'documentary')).toBe(true);
    const ev = s.pendingEvents.find((e) => e.defId === 'documentary')!;
    const hype = p.hype;
    expect(dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: 'yes' }).ok).toBe(true);
    expect(p.documentary).toBeDefined();
    expect(p.hype).toBeGreaterThan(hype);
    for (let i = 0; i < 40 && Object.keys(s.projects).length; i++) advance(s, 30);
    const rel = Object.values(s.releases)[0]!;
    expect(rel.documentary).toBeDefined();
    expect(fromDay(rel.documentary!.premiere).day).toBe(1);
    expect(rel.documentary!.premiere - rel.day).toBeGreaterThanOrEqual(180);
    expect(rel.documentary!.outcome).toBeUndefined();
    advance(s, rel.documentary!.premiere - s.day + 1);
    expect(rel.documentary!.outcome).toBeDefined();
    expect(s.news.some((n) => n.headline.includes('Making Lens'))).toBe(true);
  });

  it('cancelling on camera is news', () => {
    const { s, p } = setup(0);
    p.documentary = { day: s.day, crunchDays: 0 };
    const rep = s.company.reputation;
    expect(dispatch(s, { type: 'cancelProject', projectId: p.id }).ok).toBe(true);
    expect(s.company.reputation).toBeLessThan(rep);
    expect(s.news.some((n) => n.headline.includes('Documentary crew films the end'))).toBe(true);
  });
});
