/**
 * Publishing label: fund games by independent studios (the procedural indie rivals) in exchange for a share
 * of their revenue. You pay the advance up front; months later the indie ships, critics score it, and your
 * share arrives over the following six months. Talented studios and bigger budgets make better games — but
 * nothing is guaranteed.
 */
import { BALANCE } from '../../data/balance';
import { GENRE_BY_ID } from '../../data/genres';
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState, PublishedDeal, Rival } from '../types';
import { addRep, earn, inflation, money, pushNews, spend } from '../util';
import { addRivalGame, genTitle, spawnIndie } from './rivals';
import { livePlatforms } from './market';
import { TOPICS } from '../../data/topics';

export type DealTier = PublishedDeal['tier'];

export const LABEL_TIERS: Record<DealTier, { label: string; advance: number; days: [number, number]; scale: number; bonus: number }> = {
  small: { label: 'Small', advance: 60_000, days: [150, 240], scale: 0.6, bonus: 0 },
  medium: { label: 'Medium', advance: 180_000, days: [240, 360], scale: 1.5, bonus: 3 },
  large: { label: 'Large', advance: 500_000, days: [300, 480], scale: 3.5, bonus: 6 },
};
/** Your share of the indie game's net revenue. */
export const LABEL_SHARE = 0.35;
export const LABEL_MAX_ACTIVE = 3;
export const LABEL_MIN_REP = 30;
const PAYOUT_MONTHS = 6;

export function labelBlocked(s: GameState): string | null {
  if (!s.research.done.includes('biz_self_publishing')) return 'Research Self-Publishing first';
  if (s.company.reputation < LABEL_MIN_REP) return `Indies only sign with publishers of ${LABEL_MIN_REP}+ reputation`;
  if ((s.publishingDeals ?? []).filter((d) => d.status === 'dev').length >= LABEL_MAX_ACTIVE) return `You can fund at most ${LABEL_MAX_ACTIVE} games at once`;
  return null;
}

/** Indies open to a deal right now. */
export function signableIndies(s: GameState): Rival[] {
  const busy = new Set((s.publishingDeals ?? []).filter((d) => d.status === 'dev').map((d) => d.rivalId));
  return Object.values(s.rivals)
    .filter((r) => r.procedural && r.alive && !r.ownedByPlayer && !busy.has(r.id))
    .sort((a, b) => b.quality - a.quality);
}

export function dealAdvance(s: GameState, tier: DealTier): number {
  return money(LABEL_TIERS[tier].advance, s.day);
}

/** Rough talent rating shown to the player (1–5 stars), deliberately coarse. */
export function talentStars(r: Rival): number {
  return clamp(Math.round(r.quality * 6 - 0.5), 1, 5);
}

export function signIndie(c: Ctx, rival: Rival, tier: DealTier): void {
  const { s, rng } = c;
  const t = LABEL_TIERS[tier];
  const advance = dealAdvance(s, tier);
  spend(s, 'advances_paid', advance);
  rival.cash += advance;
  // A studio you fund is no longer an acquisition target.
  s.offers.acquisitions = s.offers.acquisitions.filter((a) => a.id !== rival.id);
  const genre = rival.genres.length ? rng.pick(rival.genres) : 'action';
  s.publishingDeals = [
    ...(s.publishingDeals ?? []),
    {
      id: `pub_${s.nextId++}`,
      rivalId: rival.id,
      studio: rival.name,
      tier,
      advance,
      genre,
      signedDay: s.day,
      releaseDay: s.day + rng.int(t.days[0], t.days[1]),
      status: 'dev',
      payoutsLeft: 0,
      monthlyPayout: 0,
      earned: 0,
    },
  ];
  pushNews(s, { category: 'studio', headline: `${s.company.name} signs ${rival.name} to a publishing deal`, body: `A ${t.label.toLowerCase()}-budget ${GENRE_BY_ID[genre].name} game is in the works.`, tone: 'good' });
}

/** Monthly: ship finished games and pay out revenue shares. */
export function publishingMonthly(c: Ctx): void {
  const { s, rng } = c;
  // Once you can sign them, indie studios come looking for a publisher.
  if (!labelBlocked(s) && signableIndies(s).length < 4 && rng.chance(0.3)) spawnIndie(c);
  if (!s.publishingDeals?.length) return;
  const yr = fromDay(s.day).year;
  for (const d of s.publishingDeals) {
    if (d.status === 'dev' && s.rivals[d.rivalId] && !s.rivals[d.rivalId]!.alive) {
      // The studio went under before shipping: the game is lost with it.
      d.status = 'done';
      d.score = 0;
      pushNews(s, { category: 'studio', headline: `${d.studio} closes before finishing its game — your advance is lost`, tone: 'bad' });
      continue;
    }
    if (d.status === 'dev' && s.day >= d.releaseDay) {
      const rv = s.rivals[d.rivalId];
      const t = LABEL_TIERS[d.tier];
      const quality = rv?.quality ?? 0.4;
      const score = clamp(Math.round(rng.normal(BALANCE.RIVAL_SCORE_BASE + quality * BALANCE.RIVAL_SCORE_QUALITY - 6 + t.bonus + s.company.reputation / 20, BALANCE.RIVAL_SCORE_SD)), 20, 95);
      const units = Math.round(Math.pow(score / 100, 4) * 180_000 * t.scale * rng.range(0.6, 1.4));
      const net = units * 20 * inflation(s.day) * 0.6;
      const topics = TOPICS.filter((x) => x.year <= yr);
      const topic = topics.length ? rng.pick(topics).id : 'fantasy';
      const name = genTitle(rng, topic);
      d.status = 'released';
      d.gameName = name;
      d.score = score;
      d.units = units;
      d.payoutsLeft = PAYOUT_MONTHS;
      d.monthlyPayout = (net * LABEL_SHARE) / PAYOUT_MONTHS;
      if (rv) {
        const plats = livePlatforms(s)
          .filter((p) => !p.own)
          .sort((a, b) => (s.market.users[b.id] ?? 0) - (s.market.users[a.id] ?? 0))
          .slice(0, 2)
          .map((p) => p.id);
        addRivalGame(s, { name, company: rv.id, genre: d.genre, topic, platforms: plats, day: s.day, score, units, publishedByPlayer: true });
        rv.cash += net * (1 - LABEL_SHARE);
        rv.reputation = clamp(rv.reputation + (score - 65) / 10, 0, 100);
        rv.lastRelease = s.day;
      }
      if (score >= 80) addRep(s, 1, `Published hit: ${name}`);
      const n = pushNews(s, {
        category: 'studio',
        headline: `${name} by ${d.studio} is out — published by ${s.company.name}`,
        body: `Critics give it ${score}. Your ${Math.round(LABEL_SHARE * 100)}% share arrives over the next ${PAYOUT_MONTHS} months.`,
        tone: score >= 70 ? 'good' : score < 50 ? 'bad' : 'neutral',
      });
      c.out.push({ type: 'news', newsId: n.id, major: false });
    }
    if (d.status === 'released' && d.payoutsLeft > 0) {
      earn(s, 'publishing', d.monthlyPayout);
      d.earned += Math.round(d.monthlyPayout);
      d.payoutsLeft -= 1;
      if (d.payoutsLeft === 0) d.status = 'done';
    }
  }
  // keep the list bounded
  if (s.publishingDeals.length > 40) s.publishingDeals = s.publishingDeals.filter((d, i, arr) => d.status !== 'done' || i >= arr.length - 30);
}
