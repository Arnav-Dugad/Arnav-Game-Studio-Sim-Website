import type { Rng } from './rng';
import type { GameState, Id } from './types';

/** Events emitted by the sim for the UI layer (toasts, sounds, number pops, modals). */
export type SimEvent =
  | { type: 'income'; amount: number; source: 'sales' | 'contract' | 'other'; releaseId?: Id }
  | { type: 'release'; releaseId: Id }
  | { type: 'reviews'; releaseId: Id }
  | { type: 'news'; newsId: number; major: boolean }
  | { type: 'event'; uid: number }
  | { type: 'achievement'; id: string }
  | { type: 'gate'; projectId: Id; phase: number }
  | { type: 'projectDone'; projectId: Id; kind: 'game' | 'contract' | 'engine' }
  | { type: 'researchDone'; id: string }
  | { type: 'staffQuit'; name: string; reason: string }
  | { type: 'staffSick'; staffId: Id }
  | { type: 'hired'; staffId: Id }
  | { type: 'insolvent'; graceDays: number }
  | { type: 'gameOver'; reason: string }
  | { type: 'month'; day: number }
  | { type: 'year'; year: number }
  | { type: 'award'; releaseId: Id; award: string }
  | { type: 'milestone'; id: string }
  | { type: 'toast'; text: string; tone: 'good' | 'bad' | 'neutral' };

export interface Ctx {
  s: GameState;
  rng: Rng;
  out: SimEvent[];
}
