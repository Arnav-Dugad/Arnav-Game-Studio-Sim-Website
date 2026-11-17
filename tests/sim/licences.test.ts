import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { canRunSale, rereleaseBlocked } from '../../src/sim/systems/release';
import { LICENCE_YEARS, licenceDue, licencesMonthly } from '../../src/sim/systems/licences';
import type { GameState, Release } from '../../src/sim/types';

function withLicensedGame(selling: boolean): { s: GameState; r: Release } {
  const s = createGame({ seed: 5, companyName: 'Lic Co', founderName: 'Ada Founder', startYear: 1995, autopause: false });
  s.company.cash = 1e8;
  const r = {
    id: 'r1', name: 'Pro League 96', day: s.day, score: 80, userScore: 78, active: selling, lastWeekUnits: selling ? 500 : 0, liveIncome: 0,
    concept: { genre: 'sports', topic: 'sports_topic', monetization: 'premium', features: ['official_license'], platforms: [], size: 'medium' },
    platforms: [], units: 1e6, net: 1e6, devCost: 1e5, awards: [], weekly: [], monthly: [], week: 50, why: {},
  } as unknown as Release;
  s.releases[r.id] = r;
  s.releaseOrder.push(r.id);
  s.day += Math.round(LICENCE_YEARS * 365.25) + 1;
  return { s, r };
}
const ctx = (s: GameState) => ({ s, rng: new Rng(s.rng), out: [] });

describe('licences', () => {
  it('a selling game asks: renew to keep it on sale', () => {
    const { s, r } = withLicensedGame(true);
    licencesMonthly(ctx(s));
    const ev = s.pendingEvents.find((e) => e.defId === 'licence_expiry')!;
    expect(ev).toBeDefined();
    const cash = s.company.cash;
    expect(dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: 'renew' }).ok).toBe(true);
    expect(s.company.cash).toBeLessThan(cash);
    expect(r.delisted).toBeUndefined();
    expect(licenceDue(r)! - s.day).toBeGreaterThan(365 * 6);
    licencesMonthly(ctx(s));
    expect(s.pendingEvents.some((e) => e.defId === 'licence_expiry')).toBe(false);
  });

  it('letting it lapse delists it for good', () => {
    const { s, r } = withLicensedGame(true);
    licencesMonthly(ctx(s));
    const ev = s.pendingEvents.find((e) => e.defId === 'licence_expiry')!;
    const rep = s.company.reputation;
    dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: 'lapse' });
    expect(r.delisted).toBe(true);
    expect(r.active).toBe(false);
    expect(s.company.reputation).toBeLessThanOrEqual(rep);
    expect(canRunSale(s, r)).toMatch(/Delisted/);
    expect(rereleaseBlocked(s, r)).toMatch(/Delisted/);
    expect(licenceDue(r)).toBeNull();
  });

  it('a game nobody buys is delisted quietly, without a decision', () => {
    const { s, r } = withLicensedGame(false);
    licencesMonthly(ctx(s));
    expect(s.pendingEvents.some((e) => e.defId === 'licence_expiry')).toBe(false);
    expect(r.delisted).toBe(true);
  });
});
