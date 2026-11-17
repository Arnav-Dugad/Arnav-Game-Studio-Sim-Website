/** Studio culture (data/culture.ts): which values the studio holds, and changing them. */
import { CULTURE_BY_ID, CULTURE_CHANGE_MORALE, CULTURE_CONFLICTS, CULTURE_COOLDOWN_DAYS, MAX_VALUES, type CultureId } from '../../data/culture';
import type { GameState } from '../types';
import { pushNews } from '../util';

export function hasValue(s: GameState, id: CultureId): boolean {
  return (s.company.values ?? []).includes(id);
}

/** Why these values can't be adopted now (or null). */
export function valuesBlocked(s: GameState, values: readonly CultureId[]): string | null {
  const v = [...new Set(values)];
  if (v.length > MAX_VALUES) return `Pick at most ${MAX_VALUES} values`;
  if (v.some((id) => !CULTURE_BY_ID[id])) return 'Unknown value';
  for (const [a, b] of CULTURE_CONFLICTS) if (v.includes(a) && v.includes(b)) return `${CULTURE_BY_ID[a].name} and ${CULTURE_BY_ID[b].name} pull in opposite directions`;
  const cur = s.company.values ?? [];
  const same = cur.length === v.length && cur.every((x) => v.includes(x));
  if (same) return 'Those are already your values';
  if (cur.length && s.company.valuesDay !== undefined && s.day - s.company.valuesDay < CULTURE_COOLDOWN_DAYS) return `Culture can change again in ${CULTURE_COOLDOWN_DAYS - (s.day - s.company.valuesDay)} days`;
  return null;
}

/** Adopt new values. The first choice is free; changing course later unsettles the team. */
export function setValues(s: GameState, values: readonly CultureId[]): string | null {
  const why = valuesBlocked(s, values);
  if (why) return why;
  const v = [...new Set(values)];
  const had = (s.company.values ?? []).length > 0;
  s.company.values = v;
  s.company.valuesDay = s.day;
  if (had) s.company.moraleMods.push({ v: CULTURE_CHANGE_MORALE.v, until: s.day + CULTURE_CHANGE_MORALE.days, label: 'Culture shake-up' });
  for (const st of Object.values(s.staff)) st.moraleWhy = undefined;
  pushNews(s, { category: 'studio', headline: v.length ? `${s.company.name} commits to ${v.map((id) => CULTURE_BY_ID[id].name).join(' and ')}` : `${s.company.name} drops its stated values`, tone: 'neutral' });
  return null;
}
