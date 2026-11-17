import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { talkBlocked, talkableGames, TALK_AWAY_DAYS } from '../../src/sim/systems/talks';
import type { GameState } from '../../src/sim/types';

function shipped(year: number): GameState {
  const s = createGame({ seed: 8, companyName: 'Test', founderName: 'T', startYear: year, autopause: false });
  s.company.cash = 1e8;
  s.cheats = { ...(s.cheats ?? {}), workMul: 4 } as never;
  const pl = availablePlatforms(s)[0]!;
  const r = dispatch(s, { type: 'startGame', game: { name: 'Talky', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  if (!r.ok) throw new Error(r.error);
  for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
  return s;
}

describe('conference talks', () => {
  it('waits for the Summit era', () => {
    const s = shipped(1982);
    expect(talkBlocked(s, s.staff['founder']!)).toMatch(/1988/);
  });

  it('one talk per studio per year; the speaker is away briefly and job-seekers notice', () => {
    const s = shipped(1995);
    const f = s.staff['founder']!;
    const games = talkableGames(s, f);
    expect(games.length).toBe(1);
    expect(dispatch(s, { type: 'giveTalk', staffId: 'founder', releaseId: games[0]!.id }).ok).toBe(true);
    expect(f.leave).toBe('conference');
    expect(f.vacationDays).toBe(TALK_AWAY_DAYS);
    expect(s.progress.stats.talks).toBe(1);
    advance(s, TALK_AWAY_DAYS + 1);
    expect(f.leave).toBeUndefined();
    expect(dispatch(s, { type: 'giveTalk', staffId: 'founder', releaseId: games[0]!.id }).ok).toBe(false);
    expect(dispatch(s, { type: 'giveTalk', staffId: 'founder', releaseId: 'nope' }).ok).toBe(false);
  });
});
