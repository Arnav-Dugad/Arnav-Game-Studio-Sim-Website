/**
 * Market: platforms (install bases, availability, shares), genre/topic trends, demand modifiers,
 * historical events, and procedural future platforms for endless mode.
 */
import { PLATFORMS, PLATFORM_BY_ID } from '../../data/platforms';
import { GENRES, GENRE_BY_ID } from '../../data/genres';
import { TOPICS, TOPIC_BY_ID } from '../../data/topics';
import { HISTORICAL_EVENTS } from '../../data/events';
import { BALANCE } from '../../data/balance';
import type { Audience, GenreId, PlatformDef, PlatformKind } from '../../data/types';
import { fromDay, interp, parseYM, toDay, yearFrac } from '../calendar';
import { clamp } from '../breakdown';
import type { Ctx } from '../ctx';
import type { FuturePlatform, GameState, Id, PlayerConsole } from '../types';
import { pushNews } from '../util';

const YEAR = 365.2425;

/** Uniform view over historical + procedural platforms. */
export interface PlatformInfo extends PlatformDef {
  launchDay: number;
  endDay: number | null;
  future?: boolean;
  /** Player-made hardware: install base comes from sim state, not a curve. */
  own?: boolean;
  fixedInstalledM?: number;
}

const staticInfo: Record<string, PlatformInfo> = {};
for (const p of PLATFORMS) {
  staticInfo[p.id] = {
    ...p,
    launchDay: parseYM(p.launch),
    endDay: p.discontinued ? parseYM(p.discontinued) : null,
  };
}

function futureToInfo(f: FuturePlatform): PlatformInfo {
  return {
    id: f.id,
    name: f.name,
    maker: f.maker,
    kind: f.kind,
    generation: 10,
    launch: '2030-01',
    unitsM: f.unitsM,
    peakYears: 3,
    curve: 'normal',
    devKit: 60_000,
    royalty: 0.3,
    tech: f.tech,
    media: 'digital',
    audience: { kids: 1, everyone: 1, teen: 1, mature: 1 },
    gamePrice: f.price,
    launchDay: f.launchDay,
    endDay: f.endDay,
    future: true,
  };
}

function ownToInfo(c: PlayerConsole): PlatformInfo {
  return {
    id: c.id,
    name: c.name,
    maker: 'player',
    kind: c.kind,
    generation: 0,
    launch: '1980-01',
    unitsM: c.potentialM,
    peakYears: 3,
    curve: 'normal',
    devKit: 0,
    royalty: 0, // your own platform: no platform-holder cut on your games
    tech: c.tech,
    media: c.media,
    audience: { kids: 1, everyone: 1, teen: 1, mature: 1 },
    gamePrice: Math.round(22 * Math.pow(1 + BALANCE.INFLATION, fromDay(c.launchDay).year - 1980)),
    launchDay: c.launchDay,
    endDay: c.endDay,
    own: true,
    fixedInstalledM: c.installedM,
  };
}

/** Player consoles that have reached the market. */
function ownLaunched(s: GameState): PlayerConsole[] {
  return (s.hardware ?? []).filter((c) => c.status !== 'dev');
}

export function platformInfo(s: GameState, id: Id): PlatformInfo | undefined {
  const st = staticInfo[id];
  if (st) return st;
  const f = s.market.futurePlatforms.find((p) => p.id === id);
  if (f) return futureToInfo(f);
  const o = ownLaunched(s).find((c) => c.id === id);
  return o ? ownToInfo(o) : undefined;
}

export function allPlatforms(s: GameState): PlatformInfo[] {
  return [...Object.values(staticInfo), ...s.market.futurePlatforms.map(futureToInfo), ...ownLaunched(s).map(ownToInfo)];
}

const cumCache = new Map<string, number>();
/** ∫0^T annualShape — numerical, memoised. */
function cumShape(T: number, pk: number): number {
  const key = `${T.toFixed(3)}|${pk}`;
  const hit = cumCache.get(key);
  if (hit !== undefined) return hit;
  // closed form: ∫ (y/pk) e^{1-y/pk} dy = e·pk·[1 - e^{-T/pk}(1 + T/pk)]
  const v = Math.E * pk * (1 - Math.exp(-T / pk) * (1 + T / pk));
  if (cumCache.size > 5000) cumCache.clear();
  cumCache.set(key, v);
  return v;
}

function isOpenPlatform(p: PlatformInfo): boolean {
  return !p.own && p.endDay === null && (p.kind === 'computer' || p.kind === 'mobile');
}

/** Installed base / active users in millions at `day`. */
export function installedM(p: PlatformInfo, day: number): number {
  if (p.fixedInstalledM !== undefined) return day < p.launchDay ? 0 : p.fixedInstalledM;
  const y = (day - p.launchDay) / YEAR;
  if (y <= 0) return 0;
  if (isOpenPlatform(p)) {
    const mid = p.peakYears * 0.6;
    const w = Math.max(0.8, p.peakYears / 10);
    const ramp = Math.min(1, y / 3);
    return (ramp * p.unitsM) / (1 + Math.exp(-(y - mid) / w));
  }
  let pk = Math.max(0.6, p.peakYears);
  if (p.curve === 'fast') pk *= 0.85;
  if (p.curve === 'slow') pk *= 1.25;
  const T = p.endDay !== null ? (p.endDay - p.launchDay) / YEAR : 30;
  const total = cumShape(T, pk);
  const now = cumShape(Math.min(y, T), pk);
  return total > 0 ? (p.unitsM * now) / total : 0;
}

/** Users likely to buy NEW games (millions). Decays after discontinuation. */
/** Share of an open platform's users who actually buy games like a console owner does. */
const ENGAGEMENT: Partial<Record<PlatformKind, number>> = { computer: 0.15, mobile: 0.1, cloud: 0.5 };

export function activeUsersM(p: PlatformInfo, day: number): number {
  const inst = installedM(p, day) * (isOpenPlatform(p) ? (ENGAGEMENT[p.kind] ?? 1) : 1);
  if (p.endDay !== null && day > p.endDay) {
    const yearsAfter = (day - p.endDay) / YEAR;
    return inst * Math.exp(-yearsAfter / 0.7);
  }
  // Old consoles still on sale lose engaged buyers once they're > 7 years old
  const age = (day - p.launchDay) / YEAR;
  if (!isOpenPlatform(p) && age > 7) return inst * Math.exp(-(age - 7) / 2);
  return inst;
}

export function isPlatformAvailable(s: GameState, p: PlatformInfo, day = s.day): boolean {
  if (day < p.launchDay) return false;
  if (p.endDay !== null && day >= p.endDay) return false;
  if (p.research && !s.research.done.includes(p.research)) return false;
  return true;
}

export function availablePlatforms(s: GameState): PlatformInfo[] {
  return allPlatforms(s).filter((p) => isPlatformAvailable(s, p));
}

/** All platforms on sale (regardless of research gating). */
export function livePlatforms(s: GameState, day = s.day): PlatformInfo[] {
  return allPlatforms(s).filter((p) => day >= p.launchDay && (p.endDay === null || day < p.endDay));
}

/** Demand multiplier from history modifiers for a platform. */
export function demandMul(s: GameState, p: PlatformInfo, day = s.day): number {
  let m = 1;
  for (const mod of s.market.modifiers) {
    if (day < mod.startDay || day >= mod.untilDay) continue;
    const t = mod.target;
    const hit = t === 'all' || t === p.kind || t === `platform:${p.id}`;
    if (!hit) continue;
    const span = mod.untilDay - mod.startDay;
    const into = (day - mod.startDay) / Math.max(1, span);
    const strength = into < 0.6 ? 1 : 1 - (into - 0.6) / 0.4;
    m *= 1 + (mod.mul - 1) * strength;
  }
  return m;
}

export function genrePopularity(s: GameState, genre: GenreId, day = s.day): number {
  const g = GENRE_BY_ID[genre];
  const base = interp(g.popularity, yearFrac(day));
  return Math.max(0.15, base * (1 + (s.market.genreTrend[genre] ?? 0)));
}

export function topicPopularity(s: GameState, topic: string, day = s.day): number {
  const t = TOPIC_BY_ID[topic];
  const base = t?.popularity ? interp(t.popularity, yearFrac(day)) : 1;
  return Math.max(0.3, base * (1 + (s.market.topicTrend[topic] ?? 0)));
}

/** Share (0..1) of a platform's users interested in a genre. */
export function genreInterest(s: GameState, genre: GenreId, day = s.day): number {
  let total = 0;
  for (const g of GENRES) if (yearFrac(day) >= g.year) total += genrePopularity(s, g.id, day);
  const n = GENRES.filter((g) => yearFrac(day) >= g.year).length || 1;
  const rel = genrePopularity(s, genre, day) / (total / n);
  return clamp(BALANCE.GENRE_INTEREST * rel, 0.03, 0.6);
}

export function platformAudienceFit(p: PlatformInfo, a: Audience): number {
  return p.audience[a] ?? 1;
}

export function platformGenreFit(p: PlatformInfo, g: GenreId): number {
  const gk = GENRE_BY_ID[g].kinds[p.kind as PlatformKind] ?? 1;
  const pf = p.genreFit?.[g] ?? 1;
  return gk * pf;
}

/** Expected engine tech for a platform at a given day (rises through a platform's life). */
export function expectedTech(s: GameState, p: PlatformInfo, day = s.day): number {
  const age = Math.max(0, (day - p.launchDay) / YEAR);
  return p.tech + Math.min(1.5, age * 0.18) + s.market.techBonus * 0.5;
}

// ── Monthly / daily updates ──────────────────────────────────────────────────

export function updateMarketMonthly(c: Ctx): void {
  const { s, rng } = c;
  // trends random walk with mean reversion
  for (const g of GENRES) {
    const v = s.market.genreTrend[g.id] ?? 0;
    s.market.genreTrend[g.id] = clamp(v + rng.normal(0, 0.035) - 0.05 * v, -0.5, 0.6);
  }
  // football World Cup summers (1982, 1986, …): everyone wants a sports game
  const d = fromDay(s.day);
  if (d.year >= 1982 && (d.year - 1982) % 4 === 0 && d.month === 5) {
    s.market.genreTrend.sports = clamp((s.market.genreTrend.sports ?? 0) + 0.15, -0.5, 0.6);
    s.market.topicTrend.sports_topic = clamp((s.market.topicTrend.sports_topic ?? 0) + 0.12, -0.5, 0.6);
    pushNews(s, { category: 'industry', headline: `World Cup fever, ${d.year}`, body: 'The football World Cup kicks off next month, and players everywhere are hungry for sports games.', tone: 'neutral' });
  }
  for (const t of TOPICS) {
    const v = s.market.topicTrend[t.id] ?? 0;
    s.market.topicTrend[t.id] = clamp(v + rng.normal(0, 0.03) - 0.05 * v, -0.5, 0.7);
  }
  // users & shares
  const live = livePlatforms(s);
  const users: Record<string, number> = {};
  let total = 0;
  for (const p of live) {
    const u = activeUsersM(p, s.day) * demandMul(s, p);
    users[p.id] = u;
    total += u;
  }
  const share: Record<string, number> = {};
  for (const p of live) share[p.id] = total > 0 ? (users[p.id] ?? 0) / total : 0;
  s.market.users = users;
  s.market.share = share;
  s.market.shareHistory.push({ day: s.day, share: roundShare(share) });
  if (s.market.shareHistory.length > 600) s.market.shareHistory.shift();
  const tr: Record<string, number> = {};
  for (const g of GENRES) tr[g.id] = Math.round(genrePopularity(s, g.id) * 100) / 100;
  s.market.trendHistory.push({ day: s.day, trend: tr });
  if (s.market.trendHistory.length > 600) s.market.trendHistory.shift();
  // expire modifiers
  s.market.modifiers = s.market.modifiers.filter((m) => m.untilDay > s.day);
  s.market.talentMul = s.market.talentMul.filter((m) => m.untilDay > s.day);
}

function roundShare(sh: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(sh)) if (v > 0.002) o[k] = Math.round(v * 1000) / 1000;
  return o;
}

export function talentMultiplier(s: GameState): number {
  let m = 1;
  for (const t of s.market.talentMul) if (t.untilDay > s.day) m *= t.mul;
  return m;
}

/** Fire due historical events. */
export function processHistory(c: Ctx): void {
  const { s } = c;
  while (s.market.historicalIndex < HISTORICAL_EVENTS.length) {
    const ev = HISTORICAL_EVENTS[s.market.historicalIndex]!;
    const evDay = parseYM(ev.date);
    if (evDay > s.day) break;
    s.market.historicalIndex += 1;
    // Skip events that predate a later start year silently (but apply lasting effects).
    const stale = s.day - evDay > 40;
    for (const e of ev.effects) {
      switch (e.kind) {
        case 'demand':
          if (!stale || evDay + e.months * 30 > s.day)
            s.market.modifiers.push({ target: e.target, mul: e.mul, startDay: evDay, untilDay: evDay + Math.round(e.months * 30.44) });
          break;
        case 'genreTrend':
          s.market.genreTrend[e.genre] = clamp((s.market.genreTrend[e.genre] ?? 0) + e.delta, -0.5, 0.8);
          break;
        case 'topicTrend':
          s.market.topicTrend[e.topic] = clamp((s.market.topicTrend[e.topic] ?? 0) + e.delta, -0.5, 0.9);
          break;
        case 'flag':
          if (s.market.flags[e.flag] === undefined) s.market.flags[e.flag] = evDay;
          break;
        case 'techJump':
          s.market.techBonus += e.delta;
          break;
        case 'talentPool':
          s.market.talentMul.push({ mul: e.mul, untilDay: evDay + Math.round(e.months * 30.44) });
          break;
        case 'salaryShock':
          s.market.salaryMul *= e.mul;
          break;
        case 'storeCut':
          s.market.storeCut[e.target] = e.cut;
          break;
      }
    }
    if (!stale) {
      const n = pushNews(s, { category: ev.category, headline: ev.headline, body: ev.body, tone: 'neutral' });
      c.out.push({ type: 'news', newsId: n.id, major: !!ev.major });
    }
  }
}

// ── Endless mode: procedural future hardware ────────────────────────────────

const FUTURE_LINES: { maker: string; names: string[]; kind: FuturePlatform['kind']; cycle: number; units: number }[] = [
  { maker: 'sony', names: ['PlayStation 6', 'PlayStation 7', 'PlayStation 8', 'PlayStation 9'], kind: 'console', cycle: 7, units: 110 },
  { maker: 'microsoft', names: ['Xbox Nova', 'Xbox Prism', 'Xbox Zenith', 'Xbox Aurora'], kind: 'console', cycle: 7, units: 45 },
  { maker: 'nintendo', names: ['Nintendo Orbit', 'Nintendo Bloom', 'Nintendo Kite', 'Nintendo Lumen'], kind: 'handheld', cycle: 7, units: 120 },
  { maker: 'meta', names: ['Horizon Lens', 'Horizon Lens 2', 'Horizon Lens 3', 'Horizon Lens 4'], kind: 'vr', cycle: 4, units: 30 },
];

export function updateFuturePlatforms(c: Ctx): void {
  const { s, rng } = c;
  const yr = fromDay(s.day).year;
  if (yr < 2027) return;
  for (const line of FUTURE_LINES) {
    const mine = s.market.futurePlatforms.filter((f) => f.maker === line.maker);
    const lastLaunch = mine.length ? Math.max(...mine.map((m) => m.launchDay)) : toDay(line.maker === 'nintendo' ? 2025 : line.maker === 'meta' ? 2023 : 2020, 6);
    if ((s.day - lastLaunch) / YEAR < line.cycle + rng.range(-0.6, 0.6)) continue;
    const name = line.names[mine.length] ?? `${line.names[line.names.length - 1]} ${mine.length - line.names.length + 2}`;
    const launchDay = s.day + Math.round(rng.range(120, 300));
    const fp: FuturePlatform = {
      id: `future_${line.maker}_${mine.length + 1}`,
      name,
      maker: line.maker,
      kind: line.kind,
      launchDay,
      endDay: launchDay + Math.round((line.cycle + 2) * YEAR),
      unitsM: Math.round(line.units * rng.range(0.6, 1.4)),
      tech: 11 + mine.length + 1,
      price: 80 + mine.length * 5,
    };
    s.market.futurePlatforms.push(fp);
    const n = pushNews(s, {
      category: 'platform',
      headline: `${name} announced for launch next year`,
      body: `The next-generation ${line.kind} promises a leap in power. Studios scramble for dev kits.`,
      tone: 'neutral',
    });
    c.out.push({ type: 'news', newsId: n.id, major: false });
  }
}

export function platformName(s: GameState, id: Id): string {
  return platformInfo(s, id)?.name ?? PLATFORM_BY_ID[id]?.name ?? id;
}
