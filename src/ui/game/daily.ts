/**
 * The daily challenge: one scenario and one world seed per calendar day, the same for every player. Picked from
 * the date (in the UI — the simulation itself never looks at the clock), so today's run can be compared with a
 * friend's.
 */
import { SCENARIOS } from '@/sim/systems/scenarios';

/** Today's key, e.g. "2026-11-18" (local date). */
export function todayKey(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The scenario and world seed for a day. */
export function dailyPick(key: string): { scenario: string; seed: number } {
  const h = hash(`daily:${key}`);
  return { scenario: SCENARIOS[h % SCENARIOS.length]!.id, seed: hash(`seed:${key}`) % 2 ** 31 };
}

/** "18 Nov" for a key. */
export function dailyLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
