/** Acquired studios run as subsidiaries that ship games on their own, guided by budget and focus. */
import { GENRE_BY_ID } from '../../data/genres';
import { clamp } from '../breakdown';
import type { Ctx } from '../ctx';
import { earn, fmtMoney, inflation, pushNews, spend } from '../util';
import { genTitle, addRivalGame } from './rivals';
import { TOPICS } from '../../data/topics';
import { fromDay } from '../calendar';
import { livePlatforms } from './market';

const BUDGET = { low: { cost: 0.7, q: -6, rev: 0.75 }, normal: { cost: 1, q: 0, rev: 1 }, high: { cost: 1.5, q: 7, rev: 1.3 } } as const;

export function subsidiariesMonthly(c: Ctx): void {
  const { s, rng } = c;
  for (const sub of Object.values(s.subsidiaries)) {
    const b = BUDGET[sub.budget];
    // running costs
    spend(s, 'salaries', sub.staff * 2_300 * inflation(s.day) * 0.3 * b.cost);
    if (s.day < sub.nextReleaseDay) continue;
    const genre = sub.focusGenre ?? rng.pick(sub.genres);
    const yr = fromDay(s.day).year;
    const topic = rng.pick(TOPICS.filter((t) => t.year <= yr)).id;
    const score = clamp(Math.round(rng.normal(55 + sub.quality * 30 + b.q + s.company.reputation / 15, 8)), 20, 97);
    const revenue = Math.round(Math.pow(score / 100, 4) * sub.staff * 110_000 * b.rev * inflation(s.day) * rng.range(0.5, 1.6));
    earn(s, 'subsidiaries', revenue);
    sub.revenue += revenue;
    sub.releases += 1;
    sub.quality = clamp(sub.quality + (score - 70) / 500, 0.2, 0.95);
    const plats = livePlatforms(s).slice(0, 3).map((p) => p.id);
    addRivalGame(s, { name: genTitle(rng, topic), company: sub.origin, genre, topic, platforms: plats, day: s.day, score, units: Math.round(revenue / 20) });
    s.company.reputation = clamp(s.company.reputation + (score - 70) / 25, 0, 100);
    pushNews(s, {
      category: 'studio',
      headline: `${sub.name} ships a new ${GENRE_BY_ID[genre].name} game (${score})`,
      body: `Your subsidiary earned ${fmtMoney(revenue)} from it.`,
      tone: score >= 70 ? 'good' : 'neutral',
    });
    sub.nextReleaseDay = s.day + Math.round(rng.range(240, 480) / Math.max(0.5, Math.sqrt(sub.staff / 20)));
  }
}
