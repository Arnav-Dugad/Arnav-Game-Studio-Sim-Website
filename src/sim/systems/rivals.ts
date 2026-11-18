/**
 * Rival companies: historical entry/exit, real flagship franchise releases on real dates, procedural
 * releases, finances, procedural indie studios, and acquisition targets.
 */
import { generateCandidate } from './staff';
import { COMPANIES, COMPANY_BY_ID } from '../../data/companies';
import { FRANCHISES } from '../../data/franchises';
import { BALANCE } from '../../data/balance';
import { GENRES } from '../../data/genres';
import { TOPICS } from '../../data/topics';
import { STUDIO_NAME_A, STUDIO_NAME_B, TITLE_ADJ, TITLE_NOUN } from '../../data/names';
import type { GenreId } from '../../data/types';
import { clamp } from '../breakdown';
import { fromDay, parseYM } from '../calendar';
import type { Ctx } from '../ctx';
import type { Rng } from '../rng';
import type { GameState, Rival, RivalGame } from '../types';
import { addRep, inflation, money, pushNews } from '../util';
import { livePlatforms } from './market';

/** Flattened schedule of real franchise releases, sorted by day. */
interface Scheduled {
  day: number;
  franchise: string;
  company: string;
  title: string;
  genre: GenreId;
  topic: string;
  platforms: string[];
  score: number;
  unitsM: number;
}

const SCHEDULE: Scheduled[] = [];
for (const f of FRANCHISES) {
  for (const r of f.releases) {
    const day = parseYM(r.date);
    let company = f.company;
    for (const [cid, yr] of f.transfers ?? []) if (fromDay(day).year >= yr) company = cid;
    SCHEDULE.push({ day, franchise: f.id, company, title: r.title, genre: f.genre, topic: f.topic, platforms: r.platforms, score: r.score, unitsM: r.unitsM });
  }
}
SCHEDULE.sort((a, b) => a.day - b.day);

/** A rival's name follows its games: each release pulls its reputation toward what that game earned (a 65 holds
 *  steady around 50, an 85 lifts it toward 90) — so studios rise and fall instead of all drifting up to 100. */
export function rivalRepAfter(rep: number, score: number): number {
  const target = clamp((score - 40) * 2, 0, 100);
  return clamp(rep + (target - rep) * 0.08, 0, 100);
}

export function franchiseOwner(s: GameState, franchiseId: string): string | undefined {
  // the player may own a real franchise after acquiring its company
  for (const f of Object.values(s.franchises)) if (f.origin === franchiseId) return '__player';
  return undefined;
}

function makeRival(s: GameState, id: string): Rival {
  const d = COMPANY_BY_ID[id]!;
  return {
    id,
    name: d.name,
    color: d.color,
    procedural: false,
    alive: true,
    ownedByPlayer: false,
    cash: money(d.staff * 40_000, s.day),
    reputation: d.reputation,
    staff: d.staff,
    quality: d.strategy.quality,
    genres: [...d.strategy.genres],
    aggression: d.strategy.aggression,
    output: d.strategy.output,
    lastRelease: s.day,
    revenue12m: 0,
    enteredDay: s.day,
  };
}

/** Bring in/out rivals according to history (daily cheap check at month start). */
export function rivalsHistory(c: Ctx): void {
  const { s } = c;
  const yr = fromDay(s.day).year;
  for (const d of COMPANIES) {
    const r = s.rivals[d.id];
    if (!r && d.enters <= yr && (d.exits === undefined || d.exits > yr)) {
      s.rivals[d.id] = makeRival(s, d.id);
      if (s.day > 40 && d.enters === yr) {
        pushNews(s, { category: 'rival', headline: `${d.name} enters the games business`, body: d.notes, tone: 'neutral' });
      }
    } else if (r && r.alive && !r.ownedByPlayer && d.exits !== undefined && d.exits <= yr) {
      r.alive = false;
      const into = d.mergedInto ? COMPANY_BY_ID[d.mergedInto]?.name : undefined;
      const why =
        d.exitReason === 'bankrupt'
          ? `${d.name} has filed for bankruptcy.`
          : into
            ? `${d.name} is now part of ${into}.`
            : `${d.name} has left the games business.`;
      if (s.day > 40) pushNews(s, { category: 'rival', headline: why, tone: 'neutral' });
      if (d.mergedInto && s.rivals[d.mergedInto]) {
        const parent = s.rivals[d.mergedInto]!;
        parent.staff += Math.round(r.staff * 0.7);
        parent.cash += Math.max(0, r.cash) * 0.5;
      }
    }
  }
}

/** Fire real franchise releases due up to today. */
export function rivalScheduledReleases(c: Ctx, cursor: { i: number }): void {
  const { s, rng } = c;
  while (cursor.i < SCHEDULE.length && SCHEDULE[cursor.i]!.day <= s.day) {
    const ev = SCHEDULE[cursor.i]!;
    cursor.i++;
    if (s.day - ev.day > 31) continue; // started later than this release
    if (franchiseOwner(s, ev.franchise) === '__player') continue;
    const r = s.rivals[ev.company];
    if (r && (!r.alive || r.ownedByPlayer)) continue;
    const g: RivalGame = {
      name: ev.title,
      company: ev.company,
      genre: ev.genre,
      topic: ev.topic,
      platforms: ev.platforms,
      day: s.day,
      score: clamp(Math.round(ev.score + rng.normal(0, 1.5)), 1, 100),
      units: Math.round(ev.unitsM * 1e6),
      franchise: ev.franchise,
    };
    addRivalGame(s, g);
    if (r) {
      r.lastRelease = s.day;
      r.cash += g.units * 15 * inflation(s.day) * 0.3;
      r.reputation = rivalRepAfter(r.reputation, g.score);
    }
    const cname = COMPANY_BY_ID[ev.company]?.name ?? ev.company;
    pushNews(s, {
      category: 'rival',
      headline: `${cname} releases ${ev.title}`,
      body: `Critics score it ${g.score}. ${g.score >= 90 ? 'An instant classic.' : g.score >= 80 ? 'A strong showing.' : ''}`.trim(),
      tone: 'neutral',
    });
  }
}

export function addRivalGame(s: GameState, g: RivalGame): void {
  s.rivalGames.push(g);
  // keep ~4 years of rival history for competition/awards/market charts
  const cutoff = s.day - 365 * 4;
  if (s.rivalGames.length > 1200 || (s.rivalGames[0] && s.rivalGames[0].day < cutoff)) s.rivalGames = s.rivalGames.filter((x) => x.day >= cutoff).slice(-1200);
}

/** Generic title words that only make sense for some genres ("Tycoon" isn't a shooter). */
const GENRE_ONLY: Record<string, readonly string[]> = {
  Tycoon: ['simulation', 'strategy', 'casual'],
  Tactics: ['strategy', 'rpg', 'simulation'],
  Story: ['adventure', 'visual_novel', 'rpg', 'casual'],
};

export function genTitle(rng: Rng, topic: string, genre?: string): string {
  const fits = (w: string) => !genre || !GENRE_ONLY[w] || GENRE_ONLY[w]!.includes(genre);
  const generic = TITLE_NOUN.default!.filter(fits);
  const nouns = TITLE_NOUN[topic] ?? generic;
  const n = rng.pick(rng.chance(0.6) ? nouns : generic);
  const r = rng.next();
  const other = generic.filter((x) => x !== n); // never "Legends of the Broken Legends"
  const adj = TITLE_ADJ.filter((x) => x !== n); // nor "Eternal Eternal"
  if (r < 0.35) return `${rng.pick(adj)} ${n}`;
  if (r < 0.6) return `${n} of the ${rng.pick(adj)} ${rng.pick(other)}`;
  if (r < 0.8) return `${rng.pick(adj)} ${n}${rng.chance(0.3) ? ' II' : ''}`;
  return `${n}: ${rng.pick(adj)} ${rng.pick(other)}`;
}

/** Monthly procedural releases + finances. */
export function rivalsMonthly(c: Ctx): void {
  const { s, rng } = c;
  const yr = fromDay(s.day).year;
  const live = livePlatforms(s).filter((p) => !p.research || p.research === 'platform_touch' || yr >= 2010);
  const topics = TOPICS.filter((t) => t.year <= yr);
  for (const r of Object.values(s.rivals)) {
    if (!r.alive || r.ownedByPlayer) continue;
    const sizeF = clamp(r.staff / 80, 0.15, 3);
    const p = (r.output / 12) * Math.min(1, 0.5 + sizeF / 2) * 0.55; // real franchises cover the rest
    if (rng.chance(p) && live.length) {
      const genres = r.genres.filter((g) => GENRES.find((x) => x.id === g && x.year <= yr));
      const genre = genres.length ? rng.pick(genres) : rng.pick(GENRES.filter((g) => g.year <= yr)).id;
      // studios pick topics that suit the genre (mostly): no fairy-tale shooters by the dozen
      const topic = rng.weighted(topics, (t) => [0.15, 1, 2.5, 4][t.genreFit[genre] ?? 1]!).id;
      const compDef = COMPANY_BY_ID[r.id];
      const pref = compDef?.strategy.platforms?.filter((pid) => live.some((l) => l.id === pid));
      const own = live.filter((l) => l.maker === r.id).map((l) => l.id);
      const pool = own.length ? own : pref && pref.length ? pref : live.map((l) => l.id);
      const plats = rng.shuffle([...pool]).slice(0, rng.int(1, Math.min(3, pool.length)));
      const score = clamp(Math.round(rng.normal(BALANCE.RIVAL_SCORE_BASE + r.quality * BALANCE.RIVAL_SCORE_QUALITY - 8 + r.reputation / 12, BALANCE.RIVAL_SCORE_SD)), 15, 93);
      const units = Math.round(Math.pow(score / 100, 4) * sizeF * 400_000 * rng.range(0.4, 1.6) * Math.pow(1.04, yr - 1980));
      addRivalGame(s, { name: genTitle(rng, topic, genre), company: r.id, genre, topic, platforms: plats, day: s.day, score, units });
      r.lastRelease = s.day;
      const revenue = units * 20 * inflation(s.day) * 0.35;
      r.cash += revenue;
      r.revenue12m = r.revenue12m * 0.9 + revenue;
      r.reputation = rivalRepAfter(r.reputation, score);
    }
    // costs
    r.cash -= r.staff * 2_800 * inflation(s.day) * 0.25;
    r.revenue12m *= 0.97;
    // procedural studios can fail
    if (r.procedural && r.cash < -money(400_000, s.day)) {
      r.alive = false;
      pushNews(s, { category: 'rival', headline: `${r.name} closes its doors`, body: 'Some of its developers are looking for work (Staff → Hire).', tone: 'neutral' });
      // a few of their people come looking for jobs
      const n = s.candidates.length < 18 ? rng.int(2, 3) : 0;
      for (let i = 0; i < n; i++) {
        const cand = generateCandidate(s, rng, { quality: clamp(r.quality * 100, 10, 90) });
        s.candidates.push({ ...cand, formerly: r.name, expiresDay: s.day + 40 });
      }
    }
    // grow/shrink
    if (r.cash > money(r.staff * 120_000, s.day)) r.staff = Math.min(8_000, Math.round(r.staff * 1.008 + 1));
    if (r.cash < 0) r.staff = Math.max(3, Math.round(r.staff * 0.97));
    // real companies never go fully bankrupt off-script
    if (!r.procedural && r.cash < 0) r.cash = money(50_000, s.day);
  }
  // Copycats: a big hit of yours inspires knock-offs from rivals (two at most)
  const rivals = Object.values(s.rivals).filter((r) => r.alive && !r.ownedByPlayer);
  for (const id of s.releaseOrder.slice(-6)) {
    const rel = s.releases[id];
    if (!rel || rel.score < 85 || s.day - rel.day > 240 || s.day - rel.day < 45 || (rel.copycats ?? 0) >= 2 || !rivals.length || !live.length) continue;
    if (!rng.chance(0.3)) continue;
    const r = rng.pick(rivals);
    const score = clamp(Math.round(rng.normal(62, 9)), 30, 84);
    const units = Math.round(rel.units * rng.range(0.05, 0.25));
    const plats = rel.concept.platforms.filter((p) => live.some((l) => l.id === p));
    const name = rng.chance(0.5) ? `${genTitle(rng, rel.concept.topic)}` : `${rel.name.split(/[:\s]/)[0]} ${rng.pick(['Rush', 'Legends', 'Mania', 'Heroes', 'World', 'Saga', 'Blitz'])}`;
    addRivalGame(s, { name, company: r.id, genre: rel.concept.genre, topic: rel.concept.topic, platforms: plats.length ? plats : [live[0]!.id], day: s.day, score, units, copycatOf: rel.id, contested: true });
    rel.copycats = (rel.copycats ?? 0) + 1;
    addRep(s, 0.5, 'Imitated by rivals');
    pushNews(s, { category: 'rival', headline: `${r.name} rushes out ${name}`, body: `It’s… very inspired by ${rel.name}. Critics give it ${score}.`, tone: 'neutral' });
  }
  // Spawn procedural indie studios occasionally
  const indies = Object.values(s.rivals).filter((r) => r.procedural && r.alive).length;
  if (indies < 10 && rng.chance(0.08)) spawnIndie(c);
}

export function spawnIndie(c: Ctx): Rival {
  const { s, rng } = c;
  const name = `${rng.pick(STUDIO_NAME_A)} ${rng.pick(STUDIO_NAME_B)}`;
  const id = `proc_${s.nextId++}`;
  const yr = fromDay(s.day).year;
  const genres = rng.shuffle(GENRES.filter((g) => g.year <= yr).map((g) => g.id)).slice(0, 2);
  const r: Rival = {
    id,
    name,
    color: `#${Math.floor(rng.range(0x303030, 0xd0d0d0)).toString(16).padStart(6, '0')}`,
    procedural: true,
    alive: true,
    ownedByPlayer: false,
    cash: money(rng.range(60_000, 300_000), s.day),
    reputation: rng.range(5, 35),
    staff: rng.int(3, 18),
    quality: rng.range(0.3, 0.85),
    genres,
    aggression: rng.range(0.1, 0.5),
    output: rng.range(0.6, 2),
    lastRelease: s.day,
    revenue12m: 0,
    enteredDay: s.day,
  };
  s.rivals[id] = r;
  return r;
}

/** Price to acquire a rival (nominal $). */
export function acquisitionPrice(s: GameState, r: Rival): number {
  const base = Math.max(r.revenue12m * 2.5, r.staff * 60_000 * inflation(s.day)) + Math.max(0, r.cash);
  const rep = 1 + r.reputation / 60;
  // a famous studio's series come with it, so the price includes what they're worth
  return Math.round(base * rep * (r.procedural ? 1 : 2.2) + adoptableIpValue(s, r.id));
}

/** The real-world series a studio would bring with it today (owned by it now, with games already out). */
export function adoptableFranchises(s: GameState, companyId: string) {
  const yr = fromDay(s.day).year;
  const owned = new Set(Object.values(s.franchises).map((f) => f.origin).filter(Boolean));
  return FRANCHISES.filter((f) => {
    let owner = f.company;
    for (const [cid, y] of f.transfers ?? []) if (yr >= y) owner = cid;
    return owner === companyId && !owned.has(f.id) && f.releases.some((x) => parseYM(x.date) <= s.day);
  });
}

/** Fans a series brings: 12% of everyone who bought its games so far. */
export function adoptedFans(s: GameState, f: (typeof FRANCHISES)[number]): number {
  return Math.round(f.releases.filter((x) => parseYM(x.date) <= s.day).reduce((t, x) => t + x.unitsM * 1e6, 0) * 0.12);
}

/** What those series would sell for (the same formula as selling a franchise). */
export function adoptableIpValue(s: GameState, companyId: string): number {
  let v = 0;
  for (const f of adoptableFranchises(s, companyId)) {
    const best = Math.max(...f.releases.filter((x) => parseYM(x.date) <= s.day).map((x) => x.score));
    v += franchiseSalePrice(s, adoptedFans(s, f), best);
  }
  return Math.round(v);
}

/** What selling a series' rights brings in. */
export function franchiseSalePrice(s: GameState, fans: number, bestScore: number): number {
  return Math.max(money(5_000, s.day), fans * 4 * (bestScore / 100) * inflation(s.day) * 0.8);
}

export function rivalSummary(s: GameState) {
  return Object.values(s.rivals)
    .filter((r) => r.alive)
    .sort((a, b) => b.reputation - a.reputation);
}

/** Real franchise releases expected between `from` and `to` (industry release calendar). */
export function upcomingReleases(s: GameState, from: number, to: number) {
  const out: { day: number; title: string; company: string; genre: GenreId; platforms: string[]; franchise: string }[] = [];
  // binary search to the first scheduled release on or after `from`
  let lo = 0;
  let hi = SCHEDULE.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (SCHEDULE[mid]!.day < from) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < SCHEDULE.length; i++) {
    const ev = SCHEDULE[i]!;
    if (ev.day > to) break;
    if (franchiseOwner(s, ev.franchise) === '__player') continue;
    const r = s.rivals[ev.company];
    if (r && (!r.alive || r.ownedByPlayer)) continue;
    out.push({ day: ev.day, title: ev.title, company: ev.company, genre: ev.genre, platforms: ev.platforms, franchise: ev.franchise });
  }
  return out;
}
