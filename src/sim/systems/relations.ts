/**
 * Relationships between colleagues. People who work on the same project grow closer week by week —
 * faster for social butterflies, team players and mentor/junior pairs, slower for introverts — while
 * hotheads and crunch strain things. Best friends lift each other's morale and a team's chemistry; a feud
 * drags both down and asks for a decision.
 */
import { clamp } from '../breakdown';
import type { Ctx } from '../ctx';
import type { GameState, Staff } from '../types';
import { pushNews } from '../util';

const hasTrait = (st: Staff, t: string) => (st.traits as string[]).includes(t);

export const BEST_FRIENDS = 60;
export const FEUD = -40;
/** In big teams, people bond with the colleagues next to them in the team, not all sixty. */
const NEIGHBOURS = 3;

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function relation(s: GameState, a: string, b: string): number {
  return s.relations?.[pairKey(a, b)] ?? 0;
}

function bump(s: GameState, a: Staff, b: Staff, crunch: boolean, rnd: () => number): { before: number; after: number } {
  const rel = (s.relations ??= {});
  const k = pairKey(a.id, b.id);
  const before = rel[k] ?? 0;
  // some weeks go better than others
  let d = 0.8 + (rnd() - 0.5) * 3;
  for (const x of [a, b]) {
    if (hasTrait(x, 'social_butterfly')) d += 0.5;
    if (hasTrait(x, 'team_player')) d += 0.4;
    if (hasTrait(x, 'introvert')) d -= 0.3;
    if (hasTrait(x, 'hothead')) d += rnd() < 0.3 ? -7 : 0.3;
    if (hasTrait(x, 'perfectionist') && crunch) d -= 0.6;
  }
  if ((hasTrait(a, 'mentor') && b.level === 'junior') || (hasTrait(b, 'mentor') && a.level === 'junior')) d += 0.8;
  if (crunch) d -= 1;
  const after = clamp(before + d, -100, 100);
  rel[k] = Math.round(after * 10) / 10;
  return { before, after };
}

/** Weekly: teams bond (or clash); apart, relationships fade a little. */
export function relationsWeekly(c: Ctx): boolean {
  let feud = false;
  const { s, rng } = c;
  const rel = (s.relations ??= {});
  const touched = new Set<string>();
  for (const p of Object.values(s.projects)) {
    const team = p.team.map((id) => s.staff[id]).filter((x): x is Staff => !!x && x.role !== 'founder' && (x.sickDays ?? 0) <= 0);
    if (team.length < 2) continue;
    const crunch = p.kind === 'game' && p.crunch;
    for (let i = 0; i < team.length; i++)
      for (let j = i + 1; j <= Math.min(team.length - 1, i + NEIGHBOURS); j++) {
        const a = team[i]!;
        const b = team[j]!;
        const k = pairKey(a.id, b.id);
        if (touched.has(k)) continue;
        touched.add(k);
        const { before, after } = bump(s, a, b, crunch, () => rng.next());
        if (before < BEST_FRIENDS && after >= BEST_FRIENDS && Object.keys(s.staff).length <= 30) pushNews(s, { category: 'staff', headline: `${a.name} and ${b.name} are best friends now`, body: 'They work better together — and they’re happier when they do.', tone: 'good' });
        if (before > FEUD && after <= FEUD) feud = true;
      }
  }
  // mentors and mentees grow close
  for (const st of Object.values(s.staff)) {
    const m = st.mentorId ? s.staff[st.mentorId] : undefined;
    if (!m) continue;
    const k = pairKey(st.id, m.id);
    rel[k] = clamp((rel[k] ?? 0) + 1.5, -100, 100);
    touched.add(k);
  }
  // fade and prune
  for (const k of Object.keys(rel)) {
    const [a, b] = k.split('|') as [string, string];
    if (!s.staff[a] || !s.staff[b]) {
      delete rel[k];
      continue;
    }
    if (touched.has(k)) continue;
    const v = rel[k]! * 0.985;
    if (Math.abs(v) < 2) delete rel[k];
    else rel[k] = Math.round(v * 10) / 10;
  }
  return feud;
}

/** Average relationship across a team (0 for strangers), and its feuding pairs. */
export function teamChemistry(s: GameState, team: Staff[]): { avg: number; feuds: [Staff, Staff][] } {
  if (team.length < 2 || !s.relations) return { avg: 0, feuds: [] };
  let sum = 0;
  let n = 0;
  const feuds: [Staff, Staff][] = [];
  for (let i = 0; i < team.length; i++)
    for (let j = i + 1; j <= Math.min(team.length - 1, i + NEIGHBOURS); j++) {
      const v = relation(s, team[i]!.id, team[j]!.id);
      sum += v;
      n++;
      if (v <= FEUD) feuds.push([team[i]!, team[j]!]);
    }
  return { avg: n ? sum / n : 0, feuds };
}

/** The worst current feud between two people who still work here. */
export function worstFeud(s: GameState): { a: Staff; b: Staff; v: number } | null {
  let best: { a: Staff; b: Staff; v: number } | null = null;
  for (const [k, v] of Object.entries(s.relations ?? {})) {
    if (v > FEUD || (best && v >= best.v)) continue;
    const [x, y] = k.split('|') as [string, string];
    const a = s.staff[x];
    const b = s.staff[y];
    if (a && b) best = { a, b, v };
  }
  return best;
}

/** This person's closest friends and worst rivals (by relationship), strongest first. */
export function relationsOf(s: GameState, id: string): { other: Staff; v: number }[] {
  const out: { other: Staff; v: number }[] = [];
  for (const [k, v] of Object.entries(s.relations ?? {})) {
    const [a, b] = k.split('|') as [string, string];
    if (a !== id && b !== id) continue;
    const other = s.staff[a === id ? b : a];
    if (other) out.push({ other, v });
  }
  return out.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
}

/** Morale from who's on your team: a best friend helps, a feud hurts. */
export function relationMorale(s: GameState, st: Staff): { label: string; v: number }[] {
  if (st.assignment.kind !== 'project' || !s.relations) return [];
  const p = s.projects[st.assignment.id];
  if (!p) return [];
  let friend: Staff | undefined;
  let foe: Staff | undefined;
  for (const id of p.team) {
    if (id === st.id) continue;
    const v = relation(s, st.id, id);
    if (v >= BEST_FRIENDS && !friend) friend = s.staff[id];
    if (v <= FEUD && !foe) foe = s.staff[id];
  }
  const out: { label: string; v: number }[] = [];
  if (friend) out.push({ label: `Best friend on the team (${friend.name.split(' ')[0]})`, v: 3 });
  if (foe) out.push({ label: `Feud with ${foe.name.split(' ')[0]}`, v: -6 });
  return out;
}
