/**
 * Media & licensing: turn a popular franchise into comics, board games, toys, cartoons, TV, films and theme-park
 * rides. Each deal pays a fee up front and comes out a while later — a hit grows the fan base (and, for screen
 * adaptations, sends people back to the games), a flop embarrasses the series. Hands-off licensing pays the most;
 * keeping creative control pays half but makes a hit much likelier.
 */
import { clamp } from '../breakdown';
import { formatDate, fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { Franchise, GameState, MediaDeal, MediaKind } from '../types';
import { addRep, earn, fmtMoney, inflation, money, pushNews } from '../util';

export interface MediaDef {
  name: string;
  /** "the X comic" */
  noun: string;
  year: number;
  fans: number;
  months: number;
  /** Fee per fan, in 1980 dollars. */
  perFan: number;
  /** Fan growth on a hit (loss on a flop is a third). */
  boost: number;
  /** Screen adaptations send viewers back to the games. */
  revival: boolean;
  /** How hard it is to do well (adaptations of games used to be cursed). */
  bias: (year: number) => number;
}

export const MEDIA: Record<MediaKind, MediaDef> = {
  comic: { name: 'Comic series', noun: 'comic', year: 1980, fans: 20_000, months: 6, perFan: 0.04, boost: 0.04, revival: false, bias: () => 5 },
  board: { name: 'Board game', noun: 'board game', year: 1980, fans: 40_000, months: 8, perFan: 0.05, boost: 0.04, revival: false, bias: () => 5 },
  toys: { name: 'Toy line', noun: 'toy line', year: 1982, fans: 100_000, months: 9, perFan: 0.15, boost: 0.06, revival: false, bias: () => 0 },
  animated: { name: 'Animated series', noun: 'cartoon', year: 1988, fans: 250_000, months: 18, perFan: 0.3, boost: 0.12, revival: true, bias: () => 0 },
  tv: { name: 'TV series', noun: 'TV series', year: 1998, fans: 600_000, months: 24, perFan: 0.4, boost: 0.15, revival: true, bias: (y) => (y < 2018 ? -6 : 3) },
  movie: { name: 'Feature film', noun: 'movie', year: 1993, fans: 1_000_000, months: 30, perFan: 0.5, boost: 0.2, revival: true, bias: (y) => (y < 2016 ? -10 : 0) },
  ride: { name: 'Theme-park ride', noun: 'theme-park ride', year: 1996, fans: 2_500_000, months: 24, perFan: 0.35, boost: 0.1, revival: false, bias: () => 4 },
};
export const MEDIA_KINDS = Object.keys(MEDIA) as MediaKind[];
export type MediaControl = 'licensed' | 'involved';
const MAX_ACTIVE = 3;
const SAME_KIND_GAP = 365 * 3;

export function mediaFee(s: GameState, f: Franchise, kind: MediaKind, control: MediaControl): number {
  const d = MEDIA[kind];
  const fee = Math.max(money(2_000, s.day), Math.min(f.fans, 20_000_000) * d.perFan * inflation(s.day) * (f.bestScore / 85));
  return Math.round(control === 'involved' ? fee * 0.5 : fee);
}

export function mediaBlocked(s: GameState, f: Franchise, kind: MediaKind): string | null {
  const d = MEDIA[kind];
  if (fromDay(s.day).year < d.year) return `${d.name}s of games aren’t a thing until ${d.year}`;
  if (f.fans < d.fans) return `Needs ${Math.round(d.fans / 1000)}k fans`;
  const deals = s.mediaDeals ?? [];
  if (deals.some((x) => x.franchiseId === f.id && x.kind === kind && x.outcome === undefined)) return 'Already in production';
  const last = deals.filter((x) => x.franchiseId === f.id && x.kind === kind).sort((a, b) => b.startDay - a.startDay)[0];
  if (last && s.day - last.startDay < SAME_KIND_GAP) return 'Too soon for another one';
  if (deals.filter((x) => x.outcome === undefined).length >= MAX_ACTIVE) return `At most ${MAX_ACTIVE} deals in production at once`;
  return null;
}

export function signMediaDeal(s: GameState, franchiseId: string, kind: MediaKind, control: MediaControl): string | null {
  const f = s.franchises[franchiseId];
  if (!f) return 'No such series';
  if (!MEDIA[kind]) return 'Unknown kind of deal';
  if (control !== 'licensed' && control !== 'involved') return 'Choose how involved to be';
  const why = mediaBlocked(s, f, kind);
  if (why) return why;
  const d = MEDIA[kind];
  const fee = mediaFee(s, f, kind, control);
  earn(s, 'licensing', fee);
  const deal: MediaDeal = { id: `md${s.day}_${kind}_${f.id}`, franchiseId: f.id, name: f.name, kind, control, startDay: s.day, releaseDay: s.day + Math.round(d.months * 30.4), fee };
  (s.mediaDeals ??= []).push(deal);
  if (s.mediaDeals.length > 60) s.mediaDeals.splice(0, s.mediaDeals.length - 60);
  pushNews(s, { category: 'studio', headline: `${f.name} is getting ${d.noun === 'animated series' ? 'an' : 'a'} ${d.noun}`, body: `${fmtMoney(fee)} up front${control === 'involved' ? ', and the studio keeps creative control' : ''}. Coming ${formatDate(deal.releaseDay, false)}.`, tone: 'good' });
  return null;
}

/** Monthly: finished productions come out. */
export function mediaMonthly(c: Ctx): void {
  const { s, rng } = c;
  for (const deal of s.mediaDeals ?? []) {
    if (deal.outcome !== undefined || s.day < deal.releaseDay) continue;
    const d = MEDIA[deal.kind];
    const f = s.franchises[deal.franchiseId];
    const best = f?.bestScore ?? 70;
    const q = clamp(rng.normal(52 + (best - 70) * 0.6 + (deal.control === 'involved' ? 15 : 0) + d.bias(fromDay(s.day).year), 16), 0, 100);
    deal.quality = Math.round(q);
    deal.outcome = q >= 65 ? 'hit' : q < 40 ? 'flop' : 'fine';
    const big = deal.kind === 'movie' || deal.kind === 'tv' || deal.kind === 'ride';
    if (!f) continue; // the series was sold: someone else's problem now
    if (deal.outcome === 'hit') {
      f.fans = Math.round(f.fans * (1 + d.boost));
      addRep(s, (big ? 2 : 0.7) * (1 - s.company.reputation / 115), `The ${f.name} ${d.noun} was a hit`);
      const bonus = Math.round(deal.fee * (deal.control === 'involved' ? 0.8 : 0.4)); // royalties / box-office share
      earn(s, 'licensing', bonus);
      deal.bonus = bonus;
      if (d.revival) revive(s, f, d.boost);
      s.progress.stats.mediaHits = (s.progress.stats.mediaHits ?? 0) + 1;
    } else if (deal.outcome === 'flop') {
      f.fans = Math.round(f.fans * (1 - d.boost / 3));
      addRep(s, big ? -2 : -0.5, `The ${f.name} ${d.noun} flopped`);
    } else f.fans = Math.round(f.fans * 1.01);
    const n = pushNews(s, {
      category: 'industry',
      headline:
        deal.outcome === 'hit'
          ? pick(rng, [`The ${f.name} ${d.noun} is a smash hit`, `Everyone’s talking about the ${f.name} ${d.noun}`, `${f.name} conquers a new audience`])
          : deal.outcome === 'flop'
            ? pick(rng, [`Critics savage the ${f.name} ${d.noun}`, `The ${f.name} ${d.noun} is a flop`, `Fans disown the ${f.name} ${d.noun}`])
            : `The ${f.name} ${d.noun} is out — fans call it “fine”`,
      ...(deal.outcome === 'fine' ? {} : { body: deal.outcome === 'hit' ? `${deal.bonus ? `${fmtMoney(deal.bonus)} in royalties. ` : ''}New fans are discovering the games.` : 'Some fans are embarrassed to be associated with the series.' }),
      tone: deal.outcome === 'hit' ? 'good' : deal.outcome === 'flop' ? 'bad' : 'neutral',
    });
    if (big && deal.outcome !== 'fine') c.out.push({ type: 'news', newsId: n.id, major: true });
  }
}

function pick<T>(rng: Ctx['rng'], arr: readonly T[]): T {
  return rng.pick(arr);
}

/** New viewers buy the latest game in the series. */
function revive(s: GameState, f: Franchise, boost: number): void {
  const latest = [...f.entries].reverse().map((id) => s.releases[id]).find((r) => r);
  if (!latest) return;
  for (const ps of latest.platforms) {
    const add = ps.potential * boost * 0.4;
    if (add < 1) continue;
    const prev = ps.revival;
    ps.revival = { week: latest.week, potential: (prev ? prev.potential - prev.units : 0) + add, units: 0 };
    ps.extraPotential = (ps.extraPotential ?? 0) + add;
  }
  latest.active = true;
}
