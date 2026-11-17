import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { FAN_MAIL_KEEP, MAX_PINNED, unreadFanMail } from '../../src/sim/systems/fanMail';
import type { GameState } from '../../src/sim/types';

function withHit(): GameState {
  const s = createGame({ seed: 4, companyName: 'Test', founderName: 'T', startYear: 1995, autopause: false });
  s.company.cash = 1e8;
  s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 25 } as never;
  const pl = availablePlatforms(s)[0]!;
  const r = dispatch(s, { type: 'startGame', game: { name: 'Beloved', genre: 'action', topic: 'fantasy', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  if (!r.ok) throw new Error(r.error);
  for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
  return s;
}

describe('fan mail', () => {
  it('a well-loved game gets letters and drawings', () => {
    const s = withHit();
    const rel = Object.values(s.releases)[0]!;
    expect(rel.score).toBeGreaterThanOrEqual(80);
    advance(s, 365 * 4); // ~2 letters a year for an 80: look over a few years so one seed can't make it flaky
    const box = s.fanMail ?? [];
    expect(box.length).toBeGreaterThanOrEqual(3);
    expect(box.every((m) => m.releaseId === rel.id && m.text.length > 5)).toBe(true);
    expect(unreadFanMail(s)).toBe(box.length);
    dispatch(s, { type: 'readFanMail' });
    expect(unreadFanMail(s)).toBe(0);
  });

  it('drawings go on a Fan Art Wall, up to its limit, and pinned ones are kept', () => {
    const s = withHit();
    s.fanMail = Array.from({ length: FAN_MAIL_KEEP }, (_, i) => ({ id: `a${i}`, day: s.day, releaseId: 'r', game: 'Beloved', topic: 'fantasy', genre: 'action', from: 'Mia', kind: 'art' as const, text: 'I ♥ it', seed: i }));
    expect(dispatch(s, { type: 'pinFanArt', id: 'a0', on: true }).ok).toBe(false); // no wall yet
    s.office.items.push({ id: 'w1', item: 'fan_wall', floor: 0, x: 1, y: 1, rot: 0 });
    for (let i = 0; i < MAX_PINNED; i++) expect(dispatch(s, { type: 'pinFanArt', id: `a${i}`, on: true }).ok).toBe(true);
    expect(dispatch(s, { type: 'pinFanArt', id: `a${MAX_PINNED}`, on: true }).ok).toBe(false);
    advance(s, 365 * 2);
    for (let i = 0; i < MAX_PINNED; i++) expect(s.fanMail!.some((m) => m.id === `a${i}` && m.pinned)).toBe(true);
    expect(s.fanMail!.length).toBeLessThanOrEqual(FAN_MAIL_KEEP);
  });
});
