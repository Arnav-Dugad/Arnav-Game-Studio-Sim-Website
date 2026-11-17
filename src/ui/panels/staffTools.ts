/** Shared staff helpers for the Staff panel and the team pickers: status, risk, and fit for a genre. */
import { favouriteGenre } from '@/sim/systems/staff';
import { PHASE_AREAS, SKILLS, type GenreId } from '@/data/types';
import { areaSkill } from '@/sim/systems/dev';
import { isAway, ROLE_NAMES } from '@/sim/systems/staff';
import type { GameState, Role, Staff } from '@/sim/types';
import { idealFocus } from '../game/lib';

export type StaffStatus = 'idle' | 'project' | 'research' | 'training' | 'away';

export function statusOf(st: Staff): StaffStatus {
  if (isAway(st)) return 'away';
  if (st.assignment.kind === 'project') return 'project';
  if (st.assignment.kind === 'research') return 'research';
  if (st.assignment.kind === 'training') return 'training';
  return 'idle';
}

export const STATUS_LABEL: Record<StaffStatus, string> = { idle: 'Idle', project: 'On a project', research: 'Researching', training: 'Training', away: 'Away' };

/** Someone who needs attention: burning out, miserable or exhausted. */
export function atRisk(st: Staff): boolean {
  return st.burnout >= 60 || st.morale < 35 || st.energy < 20;
}

export function topSkill(st: Staff): number {
  let v = 0;
  for (const k of SKILLS) v = Math.max(v, st.skills[k]);
  return v;
}

/**
 * How well someone suits a genre (0–100): their skill in each development area, weighted by how much that
 * genre's ideal focus leans on it across the three phases — the same model the simulation uses.
 */
export function genreFit(st: Staff, genre: GenreId): number {
  const focus = idealFocus(genre);
  let v = 0;
  for (let ph = 0; ph < 3; ph++) {
    const areas = PHASE_AREAS[ph]!;
    for (let i = 0; i < 3; i++) v += (focus[ph]![i]! / 100) * areaSkill(st, areas[i]!);
  }
  return (v / 3) * (favouriteGenre(st.id) === genre ? 1.05 : 1); // people do their best work on what they love
}

/** Best available team for a genre: fit, nudged by morale and energy (tired people produce less). */
export function autoPickTeam(pool: Staff[], genre: GenreId, cap: number): string[] {
  const score = (st: Staff) => genreFit(st, genre) * (0.7 + 0.3 * (st.morale / 100)) * (0.8 + 0.2 * (st.energy / 100));
  return pool
    .filter((st) => !isAway(st))
    .sort((a, b) => score(b) - score(a))
    .slice(0, cap)
    .map((st) => st.id);
}

/** Who can join a project right now (idle or researching, not away). */
export function freeStaff(s: GameState): Staff[] {
  return Object.values(s.staff).filter((x) => (x.assignment.kind === 'idle' || x.assignment.kind === 'research') && !isAway(x));
}

export const roleName = (r: Role) => ROLE_NAMES[r];

/** Case-insensitive search over name, role, level and traits. */
export function matchesQuery(st: Staff, q: string): boolean {
  if (!q) return true;
  const hay = `${st.name} ${ROLE_NAMES[st.role]} ${st.level} ${st.traits.join(' ')} ${st.spec ?? ''}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}
