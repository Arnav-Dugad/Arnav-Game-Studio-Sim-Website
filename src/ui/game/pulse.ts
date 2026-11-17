/**
 * Team pulse: what's lifting and what's dragging morale across the whole studio. Adds up everyone's morale
 * breakdown (the same numbers their cards show) into the few things that matter most, with a hint at a fix.
 */
import { moraleTarget } from '@/sim/systems/staff';
import type { GameState } from '@/sim/types';

export interface PulseItem {
  label: string;
  /** Average effect on the people it touches. */
  avg: number;
  /** How many people it touches. */
  people: number;
  hint?: string;
}

const HINTS: Record<string, string> = {
  'Pay vs market': 'Raises (or Generous benefits in Policies)',
  'No desk': 'Build more desks',
  Crowding: 'Spread desks out or move to a bigger office',
  Noise: 'Keep loud things away from desks',
  'No break area': 'Build a break area near the desks',
  Crunch: 'Stop crunching',
  'Crunch (union overtime)': 'Stop crunching',
  'Nothing to do': 'Put idle people on a project or research',
  'Recent layoffs': 'Time heals this one',
  'Recent reviews': 'Make a better game',
  Burnout: 'Vacations, a gym or a meditation corner',
  'Wants a raise': 'Pay ambitious people what they’re worth',
  'Lean benefits': 'Switch benefits back to market or generous',
  'Board pressure': 'Meet the shareholders’ expectations (Company → Stock)',
  'Pledge broken': 'Time — and keeping your word next time',
};

/** A cheap fingerprint of what feeds the pulse, for caching. */
export function pulseKey(s: GameState): string {
  const crunch = Object.values(s.projects).filter((p) => p.kind === 'game' && p.crunch).length;
  const payroll = Math.round(Object.values(s.staff).reduce((t, x) => t + x.salary, 0) / 1000);
  return `${s.company.name}|${Math.floor(s.day / 30)}|${Object.keys(s.staff).length}|${s.office.rev ?? 0}|${crunch}|${payroll}|${JSON.stringify(s.company.policies)}`;
}

/** Everything that moves morale by 2+ points for someone, folded studio-wide. Personal moods are left out. */
export function teamPulse(s: GameState): { drags: PulseItem[]; boosts: PulseItem[] } {
  const acc = new Map<string, { sum: number; n: number }>();
  const staff = Object.values(s.staff).filter((x) => x.role !== 'founder');
  for (const st of staff) {
    for (const p of moraleTarget(s, st).parts) {
      if (p.kind !== 'add' || Math.abs(p.value) < 2 || p.label === 'Baseline') continue;
      if (st.mood && p.label === st.mood.label) continue; // a personal mood, not a studio thing
      // a factor can lift some people and drag others (pay vs market): keep the two apart
      const key = (p.label.startsWith('Crunch') ? 'Crunch' : p.label) + (p.value > 0 ? '\u0000+' : '');
      const a = acc.get(key) ?? { sum: 0, n: 0 };
      a.sum += p.value;
      a.n += 1;
      acc.set(key, a);
    }
  }
  const items = [...acc.entries()].map(([key, a]) => {
    const label = key.replace('\u0000+', '');
    return { label, avg: a.sum / a.n, people: a.n, hint: HINTS[label] };
  });
  const weight = (i: PulseItem) => Math.abs(i.avg) * i.people;
  return {
    drags: items.filter((i) => i.avg < 0).sort((a, b) => weight(b) - weight(a)).slice(0, 3),
    boosts: items.filter((i) => i.avg > 0).sort((a, b) => weight(b) - weight(a)).slice(0, 3),
  };
}
