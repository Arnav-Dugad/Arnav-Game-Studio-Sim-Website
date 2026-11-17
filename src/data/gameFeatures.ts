/**
 * Signature features: up to three per game. Each adds scope (work), suits some genres (a quality boost)
 * and drags a little elsewhere, and some change sales or how players feel. Unlocked by era and research.
 */
import type { GenreId, Monetization } from './types';

export interface GameFeatureDef {
  id: string;
  name: string;
  year: number;
  research?: string;
  /** Extra share of work (0.15 = 15% more days and effort needed); negative saves work. */
  work: number;
  /** Quality multiplier in genres it suits. */
  fits: Partial<Record<GenreId, number>>;
  /** Quality multiplier everywhere else. */
  misfit: number;
  /** Sales multiplier and user-score change, if any. */
  sales?: number;
  user?: number;
  /** Up-front cost in 1980 dollars (licences etc.). */
  cost?: number;
  /** Only for these business models. */
  monet?: Monetization[];
  desc: string;
}

export const GAME_FEATURES: GameFeatureDef[] = [
  { id: 'branching', name: 'Branching story', year: 1985, work: 0.12, fits: { rpg: 1.036, adventure: 1.042 }, misfit: 0.98, desc: 'Choices that change the ending. Story-driven players love it.' },
  { id: 'procedural', name: 'Procedural worlds', year: 1984, work: -0.08, fits: { rpg: 1.018, strategy: 1.018, sandbox: 1.03, simulation: 1.018 }, misfit: 0.96, desc: 'Generated levels: cheaper to build and endlessly replayable, but bland in hand-crafted genres.' },
  { id: 'splitscreen', name: 'Split-screen multiplayer', year: 1985, work: 0.06, fits: { racing: 1.03, sports: 1.03, fighting: 1.03, platformer: 1.024, casual: 1.024 }, misfit: 0.99, desc: 'Couch play with friends.' },
  { id: 'level_editor', name: 'Level editor', year: 1988, work: 0.1, fits: { strategy: 1.024, puzzle: 1.024, platformer: 1.024, sandbox: 1.036, racing: 1.012 }, misfit: 0.99, user: 2, desc: 'Players build and share their own levels.' },
  { id: 'licensed_music', name: 'Licensed soundtrack', year: 1995, work: 0, cost: 60_000, fits: { racing: 1.03, sports: 1.03, rhythm: 1.036, action: 1.012 }, misfit: 1, sales: 1.03, desc: 'Real hits on the soundtrack. Costs a licence up front.' },
  { id: 'online_mp', name: 'Online multiplayer', year: 1996, research: 'online_basic', work: 0.15, fits: { shooter: 1.042, sports: 1.03, racing: 1.03, strategy: 1.03, fighting: 1.03, mmo: 1.024 }, misfit: 0.98, sales: 1.05, desc: 'Play against the world. A must for competitive genres.' },
  { id: 'open_world', name: 'Open world', year: 1999, research: 'gfx_3d_1', work: 0.3, fits: { rpg: 1.048, action: 1.036, adventure: 1.036, sandbox: 1.042, racing: 1.018 }, misfit: 0.96, sales: 1.05, desc: 'A huge world to explore. Lots of work; transformative in the right genre.' },
  { id: 'coop', name: 'Online co-op', year: 2002, research: 'online_basic', work: 0.1, fits: { action: 1.03, shooter: 1.03, rpg: 1.024, platformer: 1.024, adventure: 1.018 }, misfit: 0.99, user: 1, desc: 'Play the campaign together.' },
  { id: 'crafting', name: 'Crafting', year: 2009, work: 0.1, fits: { sandbox: 1.042, rpg: 1.024, simulation: 1.024, mmo: 1.024 }, misfit: 0.98, desc: 'Gather, build, survive.' },
  { id: 'accessibility', name: 'Accessibility options', year: 2015, work: 0.05, fits: {}, misfit: 1, user: 2, sales: 1.03, desc: 'Remappable controls, subtitles, colour-blind modes. More people can play, and they notice.' },
  { id: 'photo_mode', name: 'Photo mode', year: 2016, work: 0.03, fits: { adventure: 1.012, racing: 1.012, rpg: 1.006 }, misfit: 1, sales: 1.02, desc: 'Players share screenshots: free marketing.' },
  { id: 'roguelite', name: 'Roguelite runs', year: 2008, work: 0.06, fits: { action: 1.03, rpg: 1.024, platformer: 1.03, shooter: 1.018, strategy: 1.012 }, misfit: 0.98, user: 1, desc: 'Permadeath runs with unlocks that carry over. One more run…' },
  { id: 'cross_save', name: 'Cross-save', year: 2015, research: 'online_basic', work: 0.04, fits: {}, misfit: 1, sales: 1.02, user: 1, desc: 'Progress follows players between platforms. Small effort, appreciated.' },
  { id: 'voice_acting', name: 'Full voice acting', year: 1996, work: 0.08, cost: 40_000, fits: { rpg: 1.03, adventure: 1.036, action: 1.012 }, misfit: 0.99, user: 1, desc: 'Every line performed by real actors. Brings characters to life; costs studio time and money.' },
  { id: 'dynamic_music', name: 'Dynamic music', year: 2001, work: 0.04, fits: { action: 1.018, adventure: 1.018, rpg: 1.012, rhythm: 1.03, shooter: 1.012 }, misfit: 0.99, user: 1, desc: 'The score shifts with what happens on screen. Players feel it even if they never notice.' },
  { id: 'motion_controls', name: 'Motion controls', year: 2006, work: 0.06, fits: { sports: 1.036, casual: 1.042, rhythm: 1.03 }, misfit: 0.96, sales: 1.03, desc: 'Swing, wave and dance. A hit with families; a gimmick anywhere else.' },
  { id: 'speedrun_mode', name: 'Speedrun mode', year: 2010, work: 0.03, fits: { platformer: 1.03, action: 1.012, racing: 1.018, puzzle: 1.012 }, misfit: 0.985, user: 1, desc: 'A timer, splits and leaderboards. The speedrunning community will adopt you.' },
  { id: 'cliffhanger', name: 'Cliffhanger ending', year: 1988, work: 0.02, fits: { rpg: 1.006, adventure: 1.012, action: 1.006 }, misfit: 0.99, user: -2, desc: 'End on a shock. Players grumble now — but the sequel starts with built-in hype, and paying it off delights them.' },
  { id: 'battle_pass', name: 'Battle pass', year: 2017, work: 0.05, fits: {}, misfit: 1, sales: 1.12, user: -3, monet: ['f2p', 'live_service'], desc: 'Seasonal rewards that keep players paying. Effective, and a little resented.' },
];

export const FEATURE_BY_ID: Record<string, GameFeatureDef> = Object.fromEntries(GAME_FEATURES.map((f) => [f.id, f]));
export const MAX_FEATURES = 3;
