import { RESEARCH, RESEARCH_BY_ID, type ResearchDef } from '../../data/research';
import { RND, RND_BY_ID, RND_MAX, rndCost, rndLevel, rndOpen, rndPoints, rndUnlocked } from './rnd';
import { CULTURE_FX } from '../../data/culture';
import { hasValue } from './culture';
import { fromDay, weekday } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState } from '../types';
import { money, payResearch, pushNews, researchPaid } from '../util';
import { layout } from './office';
import { growSkill, productivity } from './staff';

export function researchAvailable(s: GameState, r: ResearchDef): { ok: boolean; why?: string } {
  if (s.research.done.includes(r.id)) return { ok: false, why: 'Done' };
  if (fromDay(s.day).year < r.year) return { ok: false, why: `Available from ${r.year}` };
  const missing = r.requires.filter((q) => !s.research.done.includes(q));
  if (missing.length) return { ok: false, why: `Requires ${missing.map((m) => RESEARCH_BY_ID[m]?.name ?? m).join(', ')}` };
  return { ok: true };
}

/** Is there anything for researchers to do — something active, queued, or ready to start? */
/** What's being researched — a tree project or the next level of an R&D programme. */
export function activeResearch(s: GameState): { id: string; name: string; desc: string; points: number; cost: number; rnd: boolean } | undefined {
  const id = s.research.active;
  if (!id) return undefined;
  const def = RESEARCH_BY_ID[id];
  if (def) return { id, name: def.name, desc: def.desc, points: def.points, cost: researchCost(s, def), rnd: false };
  const r = RND_BY_ID[id];
  if (r) return { id, name: `${r.name} (level ${rndLevel(s, id) + 1})`, desc: r.desc, points: rndPoints(s, id), cost: rndCost(s, id), rnd: true };
  return undefined;
}

export function researchLeft(s: GameState): boolean {
  return !!s.research.active || RESEARCH.some((r) => researchAvailable(s, r).ok) || rndOpen(s); // (a queued item only matters once it can start — and then it's available)
}

export function researchCost(s: GameState, r: ResearchDef): number {
  return money(r.cost, s.day);
}

/** Research with real downsides is always the player's call. */
const NO_AUTO = new Set(['ai_genai']);

/** "Keep research going" policy: when nothing is active or queued, start the cheapest available project. */
export function autoQueueResearch(s: GameState): void {
  // a queue only holds things up if something in it can start now
  if (!s.company.policies.autoQueue || s.research.active || s.research.queue.some((id) => RESEARCH_BY_ID[id] && researchAvailable(s, RESEARCH_BY_ID[id]!).ok) || !researchers(s).length) return;
  const pick = RESEARCH.filter((r) => researchAvailable(s, r).ok && !NO_AUTO.has(r.id))
    .map((r) => ({ r, cost: researchCost(s, r) }))
    .filter((x) => x.cost <= s.company.cash * 0.1)
    .sort((a, b) => a.r.points - b.r.points || a.cost - b.cost)[0];
  if (!pick) {
    // the tree is done for now: keep going with the cheapest R&D programme level
    const rd = RND.filter((r) => rndUnlocked(s) && rndLevel(s, r.id) < RND_MAX && rndCost(s, r.id) <= s.company.cash * 0.1).sort((a, b) => rndCost(s, a.id) - rndCost(s, b.id))[0];
    if (!rd) return;
    payResearch(s, rd.id, rndCost(s, rd.id));
    s.research.active = rd.id;
    s.research.progress = 0;
    pushNews(s, { category: 'tech', headline: `R&D team starts on ${rd.name}`, body: 'Picked automatically (Staff → Policies → Keep research going).', tone: 'neutral' });
    return;
  }
  payResearch(s, pick.r.id, pick.cost);
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
    pts += ((st.skills.programming + st.skills.design) / 200) * productivity(s, st).total * ((st.traits as string[]).includes('tinkerer') ? 1.2 : 1);
  }
  return pts * (1 + L.research) * (s.cheats?.researchMul ?? 1) * (hasValue(s, 'innovation') ? CULTURE_FX.innovationResearch : 1);
}

export function updateResearchDaily(c: Ctx): void {
  const { s } = c;
  const active = s.research.active;
  if (!active) {
    // a queued item whose prerequisite can no longer come (it was cancelled) would wait forever: drop it, refunded
    const memo = new Map<string, boolean>();
    const reachable = (id: string): boolean => {
      const known = memo.get(id);
      if (known !== undefined) return known;
      const d = RESEARCH_BY_ID[id];
      memo.set(id, false); // guards against cycles while we look
      const ok = !!d && d.requires.every((q) => s.research.done.includes(q) || (s.research.queue.includes(q) && reachable(q)));
      memo.set(id, ok);
      return ok;
    };
    for (const id of [...s.research.queue]) {
      if (reachable(id)) continue;
      s.research.queue = s.research.queue.filter((x) => x !== id);
      const d = RESEARCH_BY_ID[id];
      if (d) {
        const back = researchPaid(s, id, researchCost(s, d));
        delete s.research.paid?.[id];
        s.company.cash += back;
        const led = s.finance.ledger[s.finance.ledger.length - 1];
        if (led) led.expense.research = Math.max(0, (led.expense.research ?? 0) - back);
        pushNews(s, { category: 'tech', headline: `${d.name} taken off the research queue`, body: 'What it builds on was never finished. The budget is back in the bank.', tone: 'neutral' });
      }
    }
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
  const def = activeResearch(s);
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
    if (def.rnd) {
      const lv = (s.research.levels ??= {});
      lv[def.id] = (lv[def.id] ?? 0) + 1;
      pushNews(s, { category: 'tech', headline: `R&D: ${def.name} complete`, body: `${RND_BY_ID[def.id]!.effect(lv[def.id]!)} in total.`, tone: 'good' });
    } else {
      s.research.done.push(def.id);
      s.progress.stats.researchDone += 1;
      pushNews(s, { category: 'tech', headline: `Research complete: ${def.name}`, body: def.desc, tone: 'good' });
    }
    delete s.research.paid?.[def.id];
    s.research.active = null;
    s.research.progress = 0;
    c.out.push({ type: 'researchDone', id: def.id });
  }
}

export function starterResearch(startYear: number): string[] {
  // Starting later grants everything that would plausibly be standard by then.
  return RESEARCH.filter((r) => r.starter || (startYear > 1980 && r.year <= startYear - 4 && r.branch !== 'business' && r.branch !== 'ai')).map((r) => r.id);
}
