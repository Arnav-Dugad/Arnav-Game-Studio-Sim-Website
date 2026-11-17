import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { CAMPAIGN_DAYS, campaignGoal, crowdfundBlocked, STRETCH_DAYS } from '../../src/sim/systems/crowdfunding';
import { gameQuality } from '../../src/sim/systems/dev';
import type { GameProject, GameState } from '../../src/sim/types';

function setup(year = 2014): { s: GameState; p: GameProject } {
  const s = createGame({ seed: 21, companyName: 'Test', founderName: 'T', startYear: year, autopause: false });
  s.company.cash = 5_000_000;
  s.company.fans = 300_000;
  s.company.reputation = 40;
  const pl = availablePlatforms(s)[0]!;
  const r = dispatch(s, { type: 'startGame', game: { name: 'Pledge', genre: 'action', topic: 'scifi', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  if (!r.ok) throw new Error(r.error);
  const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
  p.extraDays = 90; // room for a campaign
  return { s, p };
}

describe('crowdfunding', () => {
  it('needs the crowdfunding era and a game far enough from launch', () => {
    expect(crowdfundBlocked(setup(2005).s, setup(2005).p)).toMatch(/2012/);
    const { s, p } = setup();
    expect(crowdfundBlocked(s, p)).toBeNull();
    expect(campaignGoal(s, p, 'moonshot')).toBeGreaterThan(campaignGoal(s, p, 'modest'));
    p.extraDays = 0;
    p.phase = 1;
    p.phaseDay = p.phaseDays[1] - 5;
    expect(crowdfundBlocked(s, p)).toMatch(/launch/);
  });

  it('a campaign that beats its goal pays out, unlocks stretch goals and promises a date', () => {
    const { s, p } = setup();
    expect(dispatch(s, { type: 'crowdfund', projectId: p.id, tier: 'modest' }).ok).toBe(true);
    p.crowdfund!.target = p.crowdfund!.goal * 2.4; // a hit
    const extra = p.extraDays;
    const cash = s.company.cash;
    advance(s, CAMPAIGN_DAYS + 2);
    const cf = p.crowdfund!;
    expect(cf.success).toBe(true);
    expect(cf.stretch).toBeGreaterThanOrEqual(2);
    expect(p.extraDays).toBeGreaterThanOrEqual(extra - CAMPAIGN_DAYS + 2 * STRETCH_DAYS - 2);
    expect(cf.promised).toBeGreaterThan(s.day);
    expect(s.company.cash).toBeGreaterThan(cash - 100_000 + cf.raised * 0.85);
    expect(gameQuality(s, p).parts.some((x) => x.label.startsWith('Stretch goals'))).toBe(true);
    // ship it: delivered on time
    for (let i = 0; i < 20 && s.projects[p.id]; i++) advance(s, 30);
    const rel = Object.values(s.releases).find((r) => r.name === 'Pledge')!;
    expect(rel.crowdfund?.late).toBe(0);
    expect(rel.why.user!.parts.some((x) => x.label.includes('on time'))).toBe(true);
  });

  it('missing the goal pays nothing and costs a little reputation', () => {
    const { s, p } = setup();
    dispatch(s, { type: 'crowdfund', projectId: p.id, tier: 'moonshot' });
    p.crowdfund!.target = p.crowdfund!.goal * 0.5;
    const rep = s.company.reputation;
    advance(s, CAMPAIGN_DAYS + 2);
    expect(p.crowdfund!.success).toBe(false);
    expect(s.company.reputation).toBeLessThan(rep);
    expect(dispatch(s, { type: 'crowdfund', projectId: p.id, tier: 'modest' }).ok).toBe(false);
  });

  it('no feature cuts mid-campaign, and cancelling a funded game refunds the backers', () => {
    const { s, p } = setup();
    dispatch(s, { type: 'crowdfund', projectId: p.id, tier: 'modest' });
    expect(dispatch(s, { type: 'cutFeatures', projectId: p.id }).ok).toBe(false);
    p.crowdfund!.target = p.crowdfund!.goal * 1.3;
    advance(s, CAMPAIGN_DAYS + 2);
    expect(p.crowdfund!.success).toBe(true);
    const cash = s.company.cash;
    dispatch(s, { type: 'cancelProject', projectId: p.id });
    expect(s.company.cash).toBeLessThan(cash - p.crowdfund!.raised * 0.85);
  });
});
