/**
 * Subscription service: an all-you-can-play pass for your back catalogue.
 *
 * Subscribers drift toward a target driven by the size and quality of your catalogue, how fresh it is,
 * reputation and price. Revenue is recurring, but every subscriber costs server time and a pass makes
 * players less likely to buy your older games outright (back-catalogue sales are trimmed).
 */
import { BD, clamp } from '../breakdown';
import type { Ctx } from '../ctx';
import type { GameState } from '../types';
import { earn, money, pushNews, spend } from '../util';

export const SUB_RESEARCH = 'biz_subscription';
export const SUB_MIN_GAMES = 8;
export const SUB_MIN_REP = 50;
/** Share of older-game sales lost to the pass while it runs. */
export const SUB_CANNIBALIZE = 0.15;
const SIZE_W = { small: 0.4, medium: 0.7, large: 1, aaa: 1.4 } as const;

export function subLaunchCost(s: GameState): number {
  return money(150_000, s.day);
}

/** Expected monthly price (nominal) players consider fair. */
export function subRefPrice(s: GameState): number {
  return money(3.5, s.day);
}

export function canLaunchSub(s: GameState): string | null {
  if (s.subscription?.active) return 'Your pass is already running';
  if (!s.research.done.includes(SUB_RESEARCH)) return 'Research Subscription Service first (Business branch)';
  if (s.releaseOrder.length < SUB_MIN_GAMES) return `You need at least ${SUB_MIN_GAMES} released games for a worthwhile catalogue`;
  if (s.company.reputation < SUB_MIN_REP) return `Players won't subscribe to a studio under ${SUB_MIN_REP} reputation`;
  return null;
}

/** Catalogue appeal: quality-weighted games, newer ones count more. */
export function catalogValue(s: GameState): number {
  let v = 0;
  for (const id of s.releaseOrder) {
    const r = s.releases[id];
    if (!r) continue;
    const age = (s.day - r.day) / 365.25;
    const q = Math.max(0, r.score - 50) / 40;
    v += q * SIZE_W[r.concept.size] * Math.pow(0.85, age);
  }
  return v;
}

/** Subscribers the pass would settle at (and why). */
export function subTarget(s: GameState, price = s.subscription?.price ?? subRefPrice(s)) {
  const usersM = Object.values(s.market.users).reduce((t, u) => t + u, 0);
  const cat = catalogValue(s);
  const b = new BD('Players on platforms you ship to (M)', usersM * 0.005);
  b.mul(`Catalogue strength (${cat.toFixed(1)})`, cat / (cat + 12));
  b.mul(`Reputation ${Math.round(s.company.reputation)}`, clamp(s.company.reputation / 80, 0.3, 1.25));
  const rel = Math.max(0.01, price) / subRefPrice(s);
  b.mul('Price vs. expectations', rel <= 1 ? Math.min(2, Math.pow(1 / rel, 1.2)) : Math.max(0.02, Math.exp(-1.8 * (rel - 1))));
  const done = b.done();
  return { subsM: Math.max(0, done.total), why: done };
}

export function subscriptionMonthly(c: Ctx): void {
  const { s } = c;
  const sub = s.subscription;
  if (!sub?.active) return;
  const target = subTarget(s).subsM * 1e6;
  sub.subscribers = Math.max(0, Math.round(sub.subscribers + (target - sub.subscribers) * 0.18));
  sub.peak = Math.max(sub.peak, sub.subscribers);
  const revenue = sub.subscribers * sub.price * 0.7; // stores keep ~30%
  const servers = sub.subscribers * money(0.12, s.day);
  earn(s, 'subscriptions', revenue);
  spend(s, 'servers', servers);
  sub.revenue += Math.round(revenue);
  sub.history.push(sub.subscribers);
  if (sub.history.length > 240) sub.history.shift();
}

/** Back-catalogue sales multiplier while the pass runs (new releases are unaffected for a year). */
export function catalogSalesMul(s: GameState, releaseDay: number): number {
  return s.subscription?.active && s.day - releaseDay > 365 ? 1 - SUB_CANNIBALIZE : 1;
}

export function launchSub(c: Ctx, name: string, price: number): void {
  const { s } = c;
  spend(s, 'marketing', subLaunchCost(s));
  s.subscription = { name, price, launchedDay: s.day, subscribers: 0, peak: s.subscription?.peak ?? 0, revenue: s.subscription?.revenue ?? 0, history: s.subscription?.history ?? [], active: true };
  const n = pushNews(s, { category: 'studio', headline: `${s.company.name} launches ${name}`, body: `Your whole catalogue, one monthly fee.`, tone: 'good' });
  c.out.push({ type: 'news', newsId: n.id, major: false });
}
