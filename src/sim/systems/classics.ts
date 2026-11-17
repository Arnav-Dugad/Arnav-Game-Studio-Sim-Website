/**
 * The Golden Pixel Hall of Classics: each New Year, the jury may induct one of your games released at least ten
 * years ago that has stood the test of time — a near-perfect score, huge sales or Game of the Year. Induction is
 * front-page news, lifts the studio's reputation and the series' fans, and sends a new generation to the game.
 */
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState, Release } from '../types';
import { addRep, fmtUnits, pushNews } from '../util';

export const CLASSIC_AGE_YEARS = 10;

function legacy(r: Release): number {
  return r.score + Math.log10(1 + r.units) * 3 + r.awards.length * 2 + (r.awards.includes('Game of the Year') ? 6 : 0);
}

export function classicCandidates(s: GameState, year: number): Release[] {
  return Object.values(s.releases).filter(
    (r) => !r.classic && !r.concept.expansionOf && !r.concept.remasterOf && year - fromDay(r.day).year >= CLASSIC_AGE_YEARS && (r.score >= 88 || r.units >= 5_000_000 || r.awards.includes('Game of the Year')),
  );
}

/** January: maybe induct one classic from the year ten-plus years back. */
export function hallOfClassics(c: Ctx, year: number): void {
  const { s, rng } = c;
  const pool = classicCandidates(s, year).sort((a, b) => legacy(b) - legacy(a));
  const pick = pool[0];
  if (!pick || !rng.chance(0.6)) return;
  pick.classic = year;
  s.progress.stats.classics = (s.progress.stats.classics ?? 0) + 1;
  addRep(s, 2 * (1 - s.company.reputation / 130), `${pick.name} inducted into the Hall of Classics`);
  const fr = pick.concept.franchiseId ? s.franchises[pick.concept.franchiseId] : undefined;
  if (fr) fr.fans = Math.round(fr.fans * 1.05);
  // a new generation discovers it
  for (const ps of pick.platforms) {
    const add = ps.potential * 0.04;
    if (add < 1) continue;
    const prev = ps.revival;
    ps.revival = { week: pick.week, potential: (prev ? prev.potential - prev.units : 0) + add, units: 0 };
    ps.extraPotential = (ps.extraPotential ?? 0) + add;
  }
  pick.active = true;
  pick.userScore = clamp(pick.userScore + 1, 1, 100);
  const n = pushNews(s, {
    category: 'studio',
    headline: `${pick.name} enters the Golden Pixel Hall of Classics`,
    body: `${fromDay(pick.day).year}’s ${Math.round(pick.score)}-scoring hit (${fmtUnits(pick.units)} sold) joins the all-time greats. A new generation is discovering it.`,
    tone: 'good',
  });
  c.out.push({ type: 'news', newsId: n.id, major: true });
}
