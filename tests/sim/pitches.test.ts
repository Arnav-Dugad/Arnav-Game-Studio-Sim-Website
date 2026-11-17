import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { availablePlatforms } from '../../src/sim/systems/market';
import { fireEvent } from '../../src/sim/systems/events';
import { PITCH_DAYS } from '../../src/sim/systems/pitches';
import type { GameProject, GameState } from '../../src/sim/types';

function studio() {
  const s = createGame({ seed: 31, companyName: 'Pitch Co', founderName: 'Ada Founder', startYear: 1995, autopause: false });
  s.company.cash = 1e8;
  s.releaseOrder.push('fake');
  const f = s.staff['founder']!;
  s.staff['d1'] = { ...structuredClone(f), id: 'd1', name: 'Dana Pitcher', role: 'designer', level: 'senior', assignment: { kind: 'idle' }, deskId: undefined, mood: undefined };
  return s;
}
const ctx = (s: GameState) => ({ s, rng: new Rng(s.rng), out: [] });

describe('staff pitches', () => {
  it('a greenlit pitch made with its pitcher becomes their passion project', () => {
    const s = studio();
    expect(fireEvent(ctx(s), 'staff_pitch')).toBe(true);
    const ev = s.pendingEvents.find((e) => e.defId === 'staff_pitch')!;
    expect(dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: 'yes' }).ok).toBe(true);
    const pitch = s.company.pitch!;
    expect(pitch.staffId).toBe('d1');
    const pl = availablePlatforms(s)[0]!;
    s.releaseOrder = s.releaseOrder.filter((x) => x !== 'fake');
    const r = dispatch(s, { type: 'startGame', game: { name: 'Dream', genre: pitch.genre, topic: pitch.topic, platforms: [pl.id], audience: 'everyone', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder', 'd1'] } });
    expect(r.ok).toBe(true);
    const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
    expect(p.passion).toBe('d1');
    expect(p.novelty).toBeGreaterThan(0);
    expect(s.staff['d1']!.mood?.label).toBe('Making my dream game');
    expect(s.company.pitch).toBeUndefined();
  });

  it('without the pitcher (or after six months) it is just a game', () => {
    const s = studio();
    fireEvent(ctx(s), 'staff_pitch');
    const ev = s.pendingEvents.find((e) => e.defId === 'staff_pitch')!;
    dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: 'yes' });
    const pitch = s.company.pitch!;
    const pl = availablePlatforms(s)[0]!;
    dispatch(s, { type: 'startGame', game: { name: 'Not Hers', genre: pitch.genre, topic: pitch.topic, platforms: [pl.id], audience: 'everyone', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
    const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
    expect(p.passion).toBeUndefined();
    expect(s.company.pitch).toBeDefined(); // still waiting for its pitcher
    s.day += PITCH_DAYS + 1;
    dispatch(s, { type: 'cancelProject', projectId: p.id });
    dispatch(s, { type: 'startGame', game: { name: 'Too Late', genre: pitch.genre, topic: pitch.topic, platforms: [pl.id], audience: 'everyone', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder', 'd1'] } });
    const q = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
    expect(q.passion).toBeUndefined();
  });
});
