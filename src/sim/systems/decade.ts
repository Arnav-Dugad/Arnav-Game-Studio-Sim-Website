/**
 * Decade in review: each new decade, the press looks back at the last ten years — the Games of the Year
 * and how your studio did — as a headline story.
 */
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import { fmtMoney, fmtUnits, pushNews } from '../util';

export function decadeReview(c: Ctx, decadeStart: number): void {
  const { s } = c;
  const end = decadeStart + 9;
  if (s.settings.startYear > decadeStart + 4) return; // you weren't around for most of it
  const goty = (s.awardHistory ?? [])
    .filter((y) => y.year >= decadeStart && y.year <= end)
    .map((y) => y.winners.find((w) => w.category === 'Game of the Year'))
    .filter((w): w is NonNullable<typeof w> => !!w);
  const inDecade = (day: number) => fromDay(day).year >= decadeStart && fromDay(day).year <= end;
  const mine = s.releaseOrder.map((id) => s.releases[id]!).filter((r) => r && inDecade(r.day));
  const best = [...mine].sort((a, b) => b.score - a.score)[0];
  const revenue = s.finance.ledger
    .filter((m) => inDecade(m.day))
    .reduce((t, m) => t + Object.entries(m.income).reduce((u, [k, v]) => u + (k === 'asset_sales' || k === 'other_income' ? 0 : (v ?? 0)), 0), 0);
  const yourGoty = goty.filter((w) => w.mine).length;
  const label = `${String(decadeStart).slice(2)}s`;
  const lines: string[] = [];
  if (goty.length) lines.push(`Games of the Year: ${goty.map((w) => `${w.name} (${w.company})`).join(', ')}.`);
  if (mine.length) {
    lines.push(`${s.company.name} shipped ${mine.length} game${mine.length === 1 ? '' : 's'} (${fmtUnits(mine.reduce((t, r) => t + r.units, 0))} copies so far) and earned ${fmtMoney(revenue)}.`);
    if (best) lines.push(`Your best: ${best.name} (${best.score}).`);
  } else lines.push(`${s.company.name} didn't ship a game this decade.`);
  if (yourGoty) lines.push(`You took Game of the Year ${yourGoty === 1 ? 'once' : `${yourGoty} times`}.`);
  const n = pushNews(s, {
    category: 'industry',
    headline: yourGoty ? `The ’${label} belonged to ${s.company.name}` : `The ’${label} in games: a look back`,
    body: lines.join(' '),
    tone: yourGoty || (best && best.score >= 85) ? 'good' : 'neutral',
  });
  c.out.push({ type: 'news', newsId: n.id, major: true });
}
