/** Fictional critic outlets. Biases shift scores for genres they love (+) or dislike (−). */
import type { GenreId } from './types';

export interface OutletDef {
  id: string;
  name: string;
  from: number;
  to?: number;
  /** Systematic offset (points out of 100): harsh < 0 < generous. */
  bias: number;
  bugHate: number; // 0..1 extra penalty per bug density
  genreBias: Partial<Record<GenreId, number>>;
  scale: 10 | 100 | 5; // display scale
  voice: 'formal' | 'hype' | 'snark' | 'warm' | 'technical';
  weight: number;
}

export const OUTLETS: readonly OutletDef[] = [
  { id: 'joystick_weekly', name: 'Joystick Weekly', from: 1980, to: 2004, bias: 2, bugHate: 0.3, genreBias: { action: 3, platformer: 3, sports: 2 }, scale: 100, voice: 'hype', weight: 1.1 },
  { id: 'pixelpress', name: 'PixelPress', from: 1980, bias: 0, bugHate: 0.5, genreBias: { rpg: 2, adventure: 2 }, scale: 10, voice: 'formal', weight: 1.3 },
  { id: 'byte_quarterly', name: 'Byte Quarterly', from: 1980, to: 1999, bias: -2, bugHate: 0.8, genreBias: { simulation: 4, strategy: 4, action: -2 }, scale: 100, voice: 'technical', weight: 1 },
  { id: 'cartridge_kids', name: 'Cartridge Kids', from: 1983, to: 2001, bias: 4, bugHate: 0.2, genreBias: { platformer: 4, casual: 3, shooter: -3 }, scale: 5, voice: 'warm', weight: 0.8 },
  { id: 'the_save_point', name: 'The Save Point', from: 1986, bias: -1, bugHate: 0.6, genreBias: { rpg: 3, adventure: 3, puzzle: 2 }, scale: 10, voice: 'warm', weight: 1.2 },
  { id: 'polygon_monthly', name: 'Polygon Monthly', from: 1994, to: 2012, bias: 0, bugHate: 0.7, genreBias: { shooter: 3, racing: 3, fighting: 2 }, scale: 10, voice: 'technical', weight: 1.2 },
  { id: 'respawn_review', name: 'Respawn Review', from: 1998, bias: -3, bugHate: 0.9, genreBias: { shooter: 2, strategy: 2, casual: -4 }, scale: 100, voice: 'snark', weight: 1.3 },
  { id: 'gg_daily', name: 'GG Daily', from: 2004, bias: 1, bugHate: 0.5, genreBias: { mmo: 2, action: 2 }, scale: 10, voice: 'hype', weight: 1.2 },
  { id: 'cozy_corner', name: 'Cozy Corner', from: 2010, bias: 3, bugHate: 0.3, genreBias: { casual: 5, simulation: 4, puzzle: 3, shooter: -3 }, scale: 5, voice: 'warm', weight: 0.9 },
  { id: 'frame_data', name: 'Frame Data', from: 2008, bias: -2, bugHate: 1, genreBias: { fighting: 5, racing: 2, shooter: 2 }, scale: 10, voice: 'technical', weight: 1 },
  { id: 'indie_lantern', name: 'Indie Lantern', from: 2009, bias: 1, bugHate: 0.4, genreBias: { puzzle: 4, adventure: 3, platformer: 3 }, scale: 10, voice: 'warm', weight: 0.9 },
  { id: 'loot_drop', name: 'Loot Drop', from: 2014, bias: 0, bugHate: 0.7, genreBias: { rpg: 3, sandbox: 3, mmo: 2 }, scale: 100, voice: 'snark', weight: 1.1 },
  { id: 'the_verdict', name: 'The Verdict', from: 2000, bias: -1, bugHate: 0.6, genreBias: {}, scale: 10, voice: 'formal', weight: 1.4 },
];
