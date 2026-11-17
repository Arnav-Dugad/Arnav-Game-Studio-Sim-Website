import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms, platformInfo } from '../../src/sim/systems/market';
import { earlyAccessBlocked } from '../../src/sim/systems/earlyAccess';
import { gameQuality } from '../../src/sim/systems/dev';
import type { GameProject, GameState } from '../../src/sim/types';

function setup(): { s: GameState; p: GameProject } {
  const s = createGame({ seed: 11, companyName: 'Test', founderName: 'T', startYear: 2014, autopause: false });
  s.company.cash = 5_000_000;
  s.research.done.push('biz_self_publishing');
  const pc = availablePlatforms(s).find((pl) => pl.kind === 'computer')!;
  const r = dispatch(s, { type: 'startGame', game: { name: 'Dig', genre: 'action', topic: 'scifi', platforms: [pc.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  if (!r.ok) throw new Error(r.error);
  const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
  return { s, p };
}

describe('early access', () => {
  it('opens in production for self-published premium PC games only', () => {
    const { s, p } = setup();
    expect(earlyAccessBlocked(s, p)).toMatch(/production/);
    p.phase = 1;
    expect(earlyAccessBlocked(s, p)).toBeNull();
    p.concept.monetization = 'f2p';
    expect(earlyAccessBlocked(s, p)).toMatch(/up front/);
    p.concept.monetization = 'premium';
    const consolePl = availablePlatforms(s).find((pl) => pl.kind !== 'computer')!;
    const plats = p.concept.platforms;
    p.concept.platforms = [consolePl.id];
    expect(earlyAccessBlocked(s, p)).toMatch(/PC/);
    p.concept.platforms = plats;
    expect(dispatch(s, { type: 'earlyAccess', projectId: p.id }).ok).toBe(true);
    expect(p.earlyAccess).toBeDefined();
    expect(p.announcedDay).toBe(s.day);
    expect(dispatch(s, { type: 'earlyAccess', projectId: p.id }).ok).toBe(false);
    expect(dispatch(s, { type: 'openBeta', projectId: p.id }).ok).toBe(false);
  });

  it('sells weekly, improves quality with feedback, and graduates with its sales counted', () => {
    const { s, p } = setup();
    s.cheats = { ...(s.cheats ?? {}), workMul: 4 } as never; // a real team's output
    p.hype = 0.8;
    p.extraDays = 60;
    while (p.phase < 1) advance(s, 1);
    const before = gameQuality(s, p).parts.find((w) => w.label.startsWith('Early Access'));
    expect(before).toBeUndefined();
    expect(dispatch(s, { type: 'earlyAccess', projectId: p.id }).ok).toBe(true);
    advance(s, 70);
    const ea = s.projects[p.id] ? (s.projects[p.id] as GameProject).earlyAccess! : undefined;
    if (ea) {
      expect(ea.units).toBeGreaterThan(0);
      expect(ea.net).toBeGreaterThan(0);
      const bonus = gameQuality(s, s.projects[p.id] as GameProject).parts.find((w) => w.label.startsWith('Early Access'));
      expect(bonus).toBeDefined();
    }
    // run to launch
    for (let i = 0; i < 40 && s.projects[p.id]; i++) advance(s, 30);
    const rel = Object.values(s.releases).find((r) => r.name === 'Dig')!;
    expect(rel).toBeDefined();
    expect(rel.earlyAccess).toBeDefined();
    expect(rel.earlyAccess!.units).toBeGreaterThan(0);
    expect(rel.units).toBeGreaterThanOrEqual(rel.earlyAccess!.units);
    expect(platformInfo(s, rel.platforms[0]!.platform)?.kind).toBe('computer');
  });

  it('abandoning an Early Access game costs reputation', () => {
    const { s, p } = setup();
    p.phase = 1;
    dispatch(s, { type: 'earlyAccess', projectId: p.id });
    advance(s, 14);
    const rep = s.company.reputation;
    expect(dispatch(s, { type: 'cancelProject', projectId: p.id }).ok).toBe(true);
    expect(s.company.reputation).toBeLessThan(rep - 5);
  });
});
