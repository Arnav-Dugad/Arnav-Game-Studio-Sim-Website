/** Staff personality traits. Effects are interpreted by sim/systems/staff.ts. */
export type TraitId =
  | 'perfectionist'
  | 'night_owl'
  | 'team_player'
  | 'hothead'
  | 'fast_learner'
  | 'loyal'
  | 'mercenary'
  | 'coffee_fiend'
  | 'introvert'
  | 'mentor'
  | 'burnout_prone'
  | 'visionary'
  | 'workaholic'
  | 'chill'
  | 'bug_magnet'
  | 'meticulous'
  | 'ambitious'
  | 'social_butterfly';

export interface TraitDef {
  id: TraitId;
  name: string;
  desc: string;
  good: boolean | null; // null = mixed
  /** Mutually exclusive traits. */
  excludes?: TraitId[];
}

export const TRAITS: readonly TraitDef[] = [
  { id: 'perfectionist', name: 'Perfectionist', desc: '+12% quality contribution, −10% speed.', good: null },
  { id: 'night_owl', name: 'Night Owl', desc: '+8% output while crunching; dislikes early meetings.', good: null },
  { id: 'team_player', name: 'Team Player', desc: 'Boosts synergy of teammates seated nearby.', good: true, excludes: ['hothead'] },
  { id: 'hothead', name: 'Hothead', desc: 'Occasional conflicts; morale swings harder.', good: false, excludes: ['team_player', 'chill'] },
  { id: 'fast_learner', name: 'Fast Learner', desc: 'Skills grow 60% faster.', good: true },
  { id: 'loyal', name: 'Loyal', desc: 'Very hard to poach; loyalty grows faster.', good: true, excludes: ['mercenary'] },
  { id: 'mercenary', name: 'Mercenary', desc: 'Follows the money. Easy to poach unless well paid.', good: false, excludes: ['loyal'] },
  { id: 'coffee_fiend', name: 'Coffee Fiend', desc: 'Breaks restore more energy, but needs them more often.', good: null },
  { id: 'introvert', name: 'Introvert', desc: 'Crowded desks hurt morale twice as much.', good: null, excludes: ['social_butterfly'] },
  { id: 'mentor', name: 'Mentor', desc: 'Colleagues seated nearby learn 30% faster.', good: true },
  { id: 'burnout_prone', name: 'Burnout-prone', desc: 'Burnout builds 50% faster.', good: false, excludes: ['chill'] },
  { id: 'visionary', name: 'Visionary', desc: 'Adds a novelty bonus to games they work on.', good: true },
  { id: 'workaholic', name: 'Workaholic', desc: '+10% output, energy drains faster.', good: null, excludes: ['chill'] },
  { id: 'chill', name: 'Chill', desc: 'Morale and burnout are steadier.', good: true, excludes: ['hothead', 'workaholic', 'burnout_prone'] },
  { id: 'bug_magnet', name: 'Bug Magnet', desc: 'Writes 35% more bugs.', good: false, excludes: ['meticulous'] },
  { id: 'meticulous', name: 'Meticulous', desc: 'Writes 30% fewer bugs and is great at QA.', good: true, excludes: ['bug_magnet'] },
  { id: 'ambitious', name: 'Ambitious', desc: 'Grows fast, but expects raises and promotions.', good: null },
  { id: 'social_butterfly', name: 'Social Butterfly', desc: 'Loves busy offices and lifts nearby morale a little.', good: true, excludes: ['introvert'] },
];

export const TRAIT_BY_ID: Record<TraitId, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t])) as Record<TraitId, TraitDef>;
