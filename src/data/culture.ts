/**
 * Studio culture: up to two values that define how the studio works. Each is a real trade-off, and some
 * pairs contradict each other. Changing course unsettles the team and can't be done every month.
 */
export type CultureId = 'craft' | 'speed' | 'players' | 'profit' | 'innovation' | 'balance';

export interface CultureDef {
  id: CultureId;
  name: string;
  motto: string;
  pros: string;
  cons: string;
  icon: string;
}

export const CULTURES: CultureDef[] = [
  { id: 'craft', name: 'Quality First', motto: 'It ships when it’s ready.', pros: '+4% game quality', cons: '−7% team output', icon: 'star' },
  { id: 'speed', name: 'Ship Fast', motto: 'Done is better than perfect.', pros: '+10% team output', cons: '+25% bugs', icon: 'fast' },
  { id: 'players', name: 'Player Obsessed', motto: 'Every decision starts with the player.', pros: '+3 user score, +20% fans won', cons: '−5% price', icon: 'heart' },
  { id: 'profit', name: 'Profit Driven', motto: 'Hits pay the bills.', pros: '+8% price', cons: '−4 morale, −1 user score', icon: 'coin' },
  { id: 'innovation', name: 'Innovation', motto: 'Never make the same game twice.', pros: '+15% research, +4% quality on new IP', cons: '−3% quality on sequels, remasters and expansions', icon: 'sparkle' },
  { id: 'balance', name: 'Work-Life Balance', motto: 'Rested people make better games.', pros: '+5 morale, −30% burnout build-up', cons: '−5% output, crunch is half as effective', icon: 'leaf' },
];

export const CULTURE_BY_ID: Record<CultureId, CultureDef> = Object.fromEntries(CULTURES.map((c) => [c.id, c])) as Record<CultureId, CultureDef>;

/** Values that can't be held together. */
export const CULTURE_CONFLICTS: [CultureId, CultureId][] = [
  ['craft', 'speed'],
  ['players', 'profit'],
  ['balance', 'speed'],
];

export const MAX_VALUES = 2;
export const CULTURE_COOLDOWN_DAYS = 365;
export const CULTURE_CHANGE_MORALE = { v: -6, days: 60 };

export const CULTURE_FX = {
  craftQuality: 1.04,
  craftOutput: 0.93,
  speedOutput: 1.1,
  speedBugs: 1.25,
  playersUser: 3,
  playersFans: 1.2,
  playersPrice: 0.95,
  profitPrice: 1.08,
  profitMorale: -4,
  profitUser: -1,
  innovationResearch: 1.15,
  innovationNewIp: 1.04,
  innovationSequel: 0.97,
  balanceMorale: 5,
  balanceBurnout: 0.7,
  balanceOutput: 0.95,
  balanceCrunch: 0.5,
};
