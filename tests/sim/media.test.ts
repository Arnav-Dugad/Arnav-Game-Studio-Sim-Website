import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { MEDIA, mediaBlocked } from '../../src/sim/systems/media';
import type { GameState } from '../../src/sim/types';

function withSeries(fans: number): GameState {
  const s = createGame({ seed: 12, companyName: 'Test', founderName: 'T', startYear: 2005, autopause: false });
  s.franchises['f1'] = { id: 'f1', name: 'Star Hop', genre: 'action', topic: 'space', fans, entries: [], fatigue: 0, lastDay: s.day, bestScore: 88 };
  return s;
}

describe('media & licensing', () => {
  it('bigger media need bigger fan bases and the right era', () => {
    const s = withSeries(50_000);
    const f = s.franchises['f1']!;
    expect(mediaBlocked(s, f, 'comic')).toBeNull();
    expect(mediaBlocked(s, f, 'movie')).toMatch(/fans/);
    const old = createGame({ seed: 1, companyName: 'T', founderName: 'T', startYear: 1985, autopause: false });
    old.franchises['f1'] = { ...f, fans: 5_000_000 };
    expect(mediaBlocked(old, old.franchises['f1']!, 'movie')).toMatch(/1993/);
  });

  it('a deal pays up front, comes out later and changes the fan base', () => {
    const s = withSeries(3_000_000);
    const cash = s.company.cash;
    expect(dispatch(s, { type: 'mediaDeal', franchiseId: 'f1', kind: 'movie', control: 'involved' }).ok).toBe(true);
    expect(s.company.cash).toBeGreaterThan(cash);
    expect(dispatch(s, { type: 'mediaDeal', franchiseId: 'f1', kind: 'movie', control: 'licensed' }).ok).toBe(false);
    expect(dispatch(s, { type: 'mediaDeal', franchiseId: 'f1', kind: 'comic', control: 'licensed' }).ok).toBe(true);
    expect(dispatch(s, { type: 'mediaDeal', franchiseId: 'f1', kind: 'toys', control: 'licensed' }).ok).toBe(true);
    expect(dispatch(s, { type: 'mediaDeal', franchiseId: 'f1', kind: 'board', control: 'licensed' }).ok).toBe(false); // three at once
    const fans = s.franchises['f1']!.fans;
    advance(s, Math.round(MEDIA.movie.months * 30.4) + 40);
    const deals = s.mediaDeals!;
    expect(deals.every((d) => d.outcome !== undefined)).toBe(true);
    expect(s.franchises['f1']!.fans).not.toBe(fans);
  });
});
