/**
 * Rival companies: historical entry/exit, real flagship franchise releases on real dates, procedural
 * releases, finances, procedural indie studios, and acquisition targets.
 */
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
import { inflation, money, pushNews } from '../util';
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
      r.reputation = clamp(r.reputation + (g.score - 70) / 10, 0, 100);
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

export function genTitle(rng: Rng, topic: string): string {
  const nouns = TITLE_NOUN[topic] ?? TITLE_NOUN.default!;
  const n = rng.pick(rng.chance(0.6) ? nouns : TITLE_NOUN.default!);
  const r = rng.next();
  if (r < 0.35) return `${rng.pick(TITLE_ADJ)} ${n}`;
  if (r < 0.6) return `${n} of the ${rng.pick(TITLE_ADJ)} ${rng.pick(TITLE_NOUN.default!)}`;
  if (r < 0.8) return `${rng.pick(TITLE_ADJ)} ${n}${rng.chance(0.3) ? ' II' : ''}`;
  return `${n}: ${rng.pick(TITLE_ADJ)} ${rng.pick(TITLE_NOUN.default!)}`;
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
      const topic = rng.pick(topics).id;
      const compDef = COMPANY_BY_ID[r.id];
      const pref = compDef?.strategy.platforms?.filter((pid) => live.some((l) => l.id === pid));
      const own = live.filter((l) => l.maker === r.id).map((l) => l.id);
      const pool = own.length ? own : pref && pref.length ? pref : live.map((l) => l.id);
      const plats = rng.shuffle([...pool]).slice(0, rng.int(1, Math.min(3, pool.length)));
      const score = clamp(Math.round(rng.normal(BALANCE.RIVAL_SCORE_BASE + r.quality * BALANCE.RIVAL_SCORE_QUALITY - 8 + r.reputation / 12, BALANCE.RIVAL_SCORE_SD)), 15, 93);
      const units = Math.round(Math.pow(score / 100, 4) * sizeF * 400_000 * rng.range(0.4, 1.6) * Math.pow(1.04, yr - 1980));
      addRivalGame(s, { name: genTitle(rng, topic), company: r.id, genre, topic, platforms: plats, day: s.day, score, units });
      r.lastRelease = s.day;
      const revenue = units * 20 * inflation(s.day) * 0.35;
      r.cash += revenue;
      r.revenue12m = r.revenue12m * 0.9 + revenue;
      r.reputation = clamp(r.reputation + (score - 65) / 15, 0, 100);
    }
    // costs
    r.cash -= r.staff * 2_800 * inflation(s.day) * 0.25;
    r.revenue12m *= 0.97;
    // procedural studios can fail
    if (r.procedural && r.cash < -money(400_000, s.day)) {
      r.alive = false;
      pushNews(s, { category: 'rival', headline: `${r.name} closes its doors`, tone: 'neutral' });
    }
    // grow/shrink
    if (r.cash > money(r.staff * 120_000, s.day)) r.staff = Math.round(r.staff * 1.02 + 1);
    if (r.cash < 0) r.staff = Math.max(3, Math.round(r.staff * 0.97));
    // real companies never go fully bankrupt off-script
    if (!r.procedural && r.cash < 0) r.cash = money(50_000, s.day);
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
  return Math.round(base * rep * (r.procedural ? 1 : 2.2));
}

export function rivalSummary(s: GameState) {
  return Object.values(s.rivals)
    .filter((r) => r.alive)
    .sort((a, b) => b.reputation - a.reputation);
}
