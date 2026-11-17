/** Trailer-cut scoring (the mini-game in TrailerCut.tsx). */
import type { GenreId } from '../../data/types';

export type ShotId = 'explosion' | 'hero' | 'vista' | 'quiet' | 'montage' | 'joke' | 'villain' | 'title';
export const SHOTS: Record<ShotId, { emoji: string; name: string; bg: string }> = {
  explosion: { emoji: '💥', name: 'Big set-piece', bg: '#5a2a22' },
  hero: { emoji: '🦸', name: 'Hero close-up', bg: '#2a3d5a' },
  vista: { emoji: '🏔️', name: 'Sweeping vista', bg: '#24485a' },
  quiet: { emoji: '🌙', name: 'Quiet moment', bg: '#232a40' },
  montage: { emoji: '🎞️', name: 'Gameplay montage', bg: '#3b2f50' },
  joke: { emoji: '😂', name: 'Funny moment', bg: '#4a4220' },
  villain: { emoji: '😈', name: 'The villain', bg: '#3a1f2f' },
  title: { emoji: '🎬', name: 'Title card', bg: '#1e1e1e' },
};
const AFFINITY: Partial<Record<GenreId, ShotId[]>> = {
  action: ['explosion', 'montage'],
  shooter: ['explosion', 'montage'],
  fighting: ['villain', 'explosion'],
  racing: ['montage', 'vista'],
  sports: ['montage', 'joke'],
  rpg: ['hero', 'villain', 'vista'],
  adventure: ['hero', 'vista', 'villain'],
  strategy: ['vista', 'montage'],
  simulation: ['vista', 'montage'],
  sandbox: ['vista', 'montage'],
  mmo: ['vista', 'hero'],
  casual: ['joke', 'montage'],
  puzzle: ['joke', 'quiet'],
  platformer: ['joke', 'hero'],
  rhythm: ['montage', 'joke'],
};

export interface CutScore {
  points: number;
  why: string[];
}

/** Score a four-shot trailer: a hook, a breath, a build-up, the title last, and shots that suit the genre. */
export function scoreCut(cut: ShotId[], genre: GenreId): CutScore {
  const why: string[] = [];
  let points = 0;
  const [a, b, c, d] = cut;
  if (a === 'explosion' || a === 'montage' || a === 'villain') {
    points += 2;
    why.push('+2 opens with a hook');
  } else if (a === 'vista') {
    points += 1;
    why.push('+1 opens on a striking vista');
  } else if (a === 'title') {
    points -= 1;
    why.push('−1 the title too early');
  }
  if (b === 'quiet' || c === 'quiet') {
    points += 1;
    why.push('+1 a moment to breathe');
  }
  if (c === 'montage' || c === 'explosion') {
    points += 1;
    why.push('+1 builds to a climax');
  }
  if (d === 'title') {
    points += 2;
    why.push('+2 ends on the title');
  } else why.push('ends without the title card');
  const fit = cut.filter((x) => (AFFINITY[genre] ?? []).includes(x)).length;
  if (fit) {
    points += Math.min(2, fit);
    why.push(`+${Math.min(2, fit)} shots that suit the genre`);
  }
  return { points: Math.max(0, Math.min(8, points)), why };
}

