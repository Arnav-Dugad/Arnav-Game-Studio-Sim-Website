import { RESEARCH, RESEARCH_BY_ID, type ResearchDef } from '../../data/research';
import { fromDay, weekday } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState } from '../types';
import { money, pushNews, spend } from '../util';
import { layout } from './office';
import { growSkill, productivity } from './staff';

export function researchAvailable(s: GameState, r: ResearchDef): { ok: boolean; why?: string } {
  if (s.research.done.includes(r.id)) return { ok: false, why: 'Done' };
  if (fromDay(s.day).year < r.year) return { ok: false, why: `Available from ${r.year}` };
  const missing = r.requires.filter((q) => !s.research.done.includes(q));
  if (missing.length) return { ok: false, why: `Requires ${missing.map((m) => RESEARCH_BY_ID[m]?.name ?? m).join(', ')}` };
  return { ok: true };
}

export function researchCost(s: GameState, r: ResearchDef): number {
  return money(r.cost, s.day);
}

/** Research with real downsides is always the player's call. */
const NO_AUTO = new Set(['ai_genai']);

/** "Keep research going" policy: when nothing is active or queued, start the cheapest available project. */
export function autoQueueResearch(s: GameState): void {
  if (!s.company.policies.autoQueue || s.research.active || s.research.queue.length || !researchers(s).length) return;
  const pick = RESEARCH.filter((r) => researchAvailable(s, r).ok && !NO_AUTO.has(r.id))
    .map((r) => ({ r, cost: researchCost(s, r) }))
    .filter((x) => x.cost <= s.company.cash * 0.1)
    .sort((a, b) => a.r.points - b.r.points || a.cost - b.cost)[0];
  if (!pick) return;
  spend(s, 'research', pick.cost);
  s.research.active = pick.r.id;
  s.research.progress = 0;
  pushNews(s, { category: 'tech', headline: `Research team starts on ${pick.r.name}`, body: 'Picked automatically (Staff → Policies → Keep research going).', tone: 'neutral' });
}

export function researchers(s: GameState) {
  return Object.values(s.staff).filter((st) => st.assignment.kind === 'research' && st.sickDays <= 0 && !(st.vacationDays ?? 0));
}

export function researchRate(s: GameState): number {
  const L = layout(s);
  let pts = 0;
  for (const st of researchers(s)) {
    pts += ((st.skills.programming + st.skills.design) / 200) * productivity(s, st).total;
  }
  return pts * (1 + L.research) * (s.cheats?.researchMul ?? 1);
}

export function updateResearchDaily(c: Ctx): void {
  const { s } = c;
  const active = s.research.active;
  if (!active) {
    // auto-advance to the first queued item whose prerequisites are now met
    const idx = s.research.queue.findIndex((id) => {
      const d = RESEARCH_BY_ID[id];
      return d && researchAvailable(s, d).ok;
    });
    if (idx >= 0) {
      s.research.active = s.research.queue.splice(idx, 1)[0]!;
      s.research.progress = 0;
    }
    return;
  }
  const def = RESEARCH_BY_ID[active];
  if (!def) {
    s.research.active = null;
    return;
  }
  if (weekday(s.day) >= 5) return;
  s.research.progress += researchRate(s);
  for (const st of researchers(s)) {
    growSkill(s, st, 'programming', 0.4, 0);
    growSkill(s, st, 'design', 0.4, 0);
  }
  if (s.research.progress >= def.points) {
    s.research.done.push(def.id);
    s.research.active = null;
    s.research.progress = 0;
    s.progress.stats.researchDone += 1;
    pushNews(s, { category: 'tech', headline: `Research complete: ${def.name}`, body: def.desc, tone: 'good' });
    c.out.push({ type: 'researchDone', id: def.id });
  }
}

export function starterResearch(startYear: number): string[] {
  // Starting later grants everything that would plausibly be standard by then.
  return RESEARCH.filter((r) => r.starter || (startYear > 1980 && r.year <= startYear - 4 && r.branch !== 'business' && r.branch !== 'ai')).map((r) => r.id);
}
