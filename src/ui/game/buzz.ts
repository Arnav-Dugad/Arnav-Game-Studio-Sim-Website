/**
 * Player buzz: what players are saying about your games, in the medium of the era (magazine mailbags,
 * bulletin boards, forums, microblogs, streams). Generated deterministically from the release and the
 * week, so it is stable between renders and costs nothing in the save. Purely presentational.
 */
import { GENRE_BY_ID } from '@/data/genres';
import { FEATURE_BY_ID } from '@/data/gameFeatures';
import { fromDay } from '@/sim/calendar';
import { platformName } from '@/sim/systems/market';
import type { GameState, Release } from '@/sim/types';

export type Medium = 'letter' | 'bbs' | 'forum' | 'micro' | 'stream';
export type Tone = 'good' | 'bad' | 'neutral';

export interface BuzzPost {
  id: string;
  releaseId: string;
  game: string;
  day: number;
  medium: Medium;
  author: string;
  text: string;
  tone: Tone;
  likes: number;
}

export function mediumFor(year: number): Medium {
  return year < 1990 ? 'letter' : year < 1997 ? 'bbs' : year < 2007 ? 'forum' : year < 2013 ? 'micro' : 'stream';
}

export const MEDIUM_LABEL: Record<Medium, string> = {
  letter: 'Magazine mailbag',
  bbs: 'Bulletin board',
  forum: 'Forums',
  micro: 'Social',
  stream: 'Social & streams',
};

function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = (h << 13) | (h >>> 19);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const A = ['pixel', 'retro', 'noob', 'speedy', 'dragon', 'byte', 'laser', 'turbo', 'cosmic', 'ninja', 'couch', 'glitch', 'boss', 'quest', 'loot', 'mega', 'hyper', 'neon', 'cheese', 'moon', 'frog', 'tofu', 'combo', 'crit'];
const B = ['gamer', 'fan', 'master', 'kid', 'lord', 'queen', 'runner', 'player', 'wizard', 'hunter', 'cat', 'dad', 'mom', 'goblin', 'knight', 'pilot', 'bard', 'main'];
const FIRST = ['Sam', 'Alex', 'Jo', 'Chris', 'Pat', 'Robin', 'Dana', 'Lee', 'Max', 'Kim', 'Terry', 'Jamie', 'Casey', 'Morgan', 'Jesse', 'Riley'];
const PLACES = ['Ohio', 'Leeds', 'Osaka', 'Perth', 'Lyon', 'Texas', 'Ontario', 'Hamburg', 'Bristol', 'Oregon', 'Turin', 'Malmö', 'Dublin', 'Utah'];

function author(r: () => number, medium: Medium, year: number): string {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  if (medium === 'letter') return `${pick(FIRST)} ${String.fromCharCode(65 + Math.floor(r() * 26))}., ${pick(PLACES)}`;
  const born = String(Math.max(50, Math.min(99, year - 1900 - 12 - Math.floor(r() * 25))) % 100).padStart(2, '0');
  const base = `${pick(A)}${r() < 0.5 ? '_' : ''}${pick(B)}`;
  if (medium === 'bbs') return base.toUpperCase().slice(0, 12);
  return r() < 0.6 ? `${base}${born}` : base;
}

type Line = { w: number; tone: Tone; text: string };

function linesFor(s: GameState, rel: Release, week: number, r: () => number): Line[] {
  const L: Line[] = [];
  const g = GENRE_BY_ID[rel.concept.genre]?.name ?? 'game';
  const yr = fromDay(rel.day).year;
  const name = rel.name;
  const score = rel.score;
  const user = rel.userScore;
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const plat = rel.platforms.length ? platformName(s, pick(rel.platforms).platform) : '';
  // Quality
  if (score >= 85) L.push({ w: 4, tone: 'good', text: pick([`${name} is the best ${g.toLowerCase()} I’ve ever played.`, `Can’t stop playing ${name}. Send help.`, `Game of the year. Not even close.`, `Stayed up till 3am with ${name} again.`, `Everyone needs to play ${name}.`]) });
  else if (score >= 70) L.push({ w: 3, tone: 'good', text: pick([`${name} is really solid fun.`, `Enjoying ${name} a lot so far.`, `Good game, a few rough edges.`, `Pleasant surprise, ${name}.`]) });
  else if (score >= 50) L.push({ w: 3, tone: 'neutral', text: pick([`${name} is… fine? I wanted more.`, `Mixed feelings about ${name}.`, `It’s okay. Wait for a sale.`, `Some good ideas, shaky execution.`]) });
  else L.push({ w: 4, tone: 'bad', text: pick([`${name} is a mess. Refund requested.`, `How did ${name} ship like this?`, `Expected better from this studio.`, `I want my money back.`]) });
  // Players vs critics
  if (user - score >= 10) L.push({ w: 3, tone: 'good', text: pick(['Critics got this one wrong. It’s great.', `Ignore the reviews, ${name} is a blast.`, 'Underrated gem.']) });
  if (score - user >= 10) L.push({ w: 3, tone: 'bad', text: pick(['Did the critics play the same game?', 'Reviews were way too generous.', 'Overrated, honestly.']) });
  // Hype
  if (rel.hypeAtLaunch > 70 && score < 70) L.push({ w: 3, tone: 'bad', text: pick(['So much hype for this?', 'The trailers lied to me.', 'Overhyped and underbaked.']) });
  if (rel.hypeAtLaunch < 25 && score >= 80) L.push({ w: 3, tone: 'good', text: pick(['Came out of nowhere. Wow.', `Why is nobody talking about ${name}?`, 'Hidden gem alert.']) });
  // Bugs and patches
  const buggy = rel.bugs > 40;
  if (buggy && week < 8 && !(rel.patches ?? 0)) L.push({ w: 4, tone: 'bad', text: pick(['Crashed three times in an hour.', 'Fell through the floor. Again.', 'Save file corrupted. Great.', 'The bugs are… a lot.']) });
  if ((rel.patches ?? 0) > 0) L.push({ w: 2, tone: 'good', text: pick(['The patch fixed everything!', 'Love that the devs keep patching.', 'Post-patch it runs great.']) });
  // Price
  const prices = s.releaseOrder.slice(-20).map((id) => s.releases[id]?.price ?? 0).filter((p) => p > 0).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)] ?? rel.price;
  const cheap = rel.price < median * 0.7;
  if (cheap && score >= 65) L.push({ w: 2, tone: 'good', text: pick(['Worth every penny.', 'Insane value for the price.', 'Best money I spent this month.']) });
  if (rel.price > median * 1.3 && score < 72) L.push({ w: 2, tone: 'bad', text: pick(['Way too expensive for what it is.', 'Not worth full price.']) });
  if ((rel.saleCount ?? 0) > 0) L.push({ w: 2, tone: 'good', text: pick(['Grabbed it on sale. No regrets.', 'Sale price was a steal.', 'Finally picked it up on sale!']) });
  // Features
  for (const f of rel.concept.features ?? []) {
    const def = FEATURE_BY_ID[f];
    if (!def) continue;
    const t: Record<string, Line> = {
      open_world: { w: 2, tone: 'good', text: 'Got lost in that world for hours.' },
      online_mp: { w: 2, tone: score >= 65 ? 'good' : 'bad', text: score >= 65 ? 'Online matches are so tense!' : 'The lag is unbearable.' },
      splitscreen: { w: 2, tone: 'good', text: 'Couch co-op night was legendary.' },
      branching: { w: 2, tone: 'good', text: 'Wait, there are other endings?!' },
      level_editor: { w: 2, tone: 'good', text: 'People are building incredible levels.' },
      battle_pass: { w: 3, tone: 'bad', text: 'Another battle pass. Sigh.' },
      accessibility: { w: 2, tone: 'good', text: 'Thank you for the accessibility options ❤' },
      photo_mode: { w: 2, tone: 'good', text: 'Photo mode is my new hobby.' },
      coop: { w: 2, tone: 'good', text: 'Co-op with my best friend = perfect.' },
      crafting: { w: 2, tone: 'neutral', text: 'Spent 6 hours crafting a chair. Worth it.' },
      procedural: { w: 2, tone: score >= 70 ? 'good' : 'neutral', text: score >= 70 ? 'Every run feels new!' : 'The levels all blur together.' },
      licensed_music: { w: 2, tone: 'good', text: 'That soundtrack though 🎵' },
      roguelite: { w: 2, tone: 'good', text: 'Just one more run… it’s 4am.' },
      cross_save: { w: 1.5, tone: 'good', text: 'Cross-save is a lifesaver.' },
    };
    if (t[f]) L.push(t[f]!);
  }
  // Series
  const fr = rel.concept.franchiseId ? s.franchises[rel.concept.franchiseId] : undefined;
  if (fr && fr.entries.length > 1 && fr.entries[0] !== rel.id) {
    if (score >= fr.bestScore - 2) L.push({ w: 3, tone: 'good', text: pick([`Best ${fr.name} yet!`, 'The sequel tops the original.', `${fr.name} keeps getting better.`]) });
    else if (score < fr.bestScore - 10) L.push({ w: 3, tone: 'bad', text: pick([`Not as good as the last ${fr.name}.`, 'The series has lost its way.', 'Miss the old games.']) });
  }
  if (rel.concept.remasterOf) L.push({ w: 2, tone: score >= 70 ? 'good' : 'bad', text: score >= 70 ? 'The remaster brings back memories.' : 'They ruined a classic.' });
  if (rel.concept.expansionOf) L.push({ w: 2, tone: 'good', text: 'More content? Yes please.' });
  // Awards, mods, beta, platform, era
  if (rel.awards.length) L.push({ w: 3, tone: 'good', text: pick(['Deserved every award.', `${rel.awards[0]}! Well earned.`]) });
  if ((rel.copycats ?? 0) > 0 && week > 6) L.push({ w: 2, tone: 'good', text: pick([`Everyone’s copying ${name} now.`, 'Played the knock-off. The original is better.', 'Accept no imitations.']) });
  if (rel.modded && week > 4) L.push({ w: 2, tone: 'good', text: pick(['The mod scene is wild.', 'Installed 40 mods. No regrets.']) });
  if (rel.crowdfund && week < 8) L.push({ w: 2, tone: rel.crowdfund.late > 0 ? 'bad' : 'good', text: rel.crowdfund.late > 0 ? pick(['Backed this years ago. Finally.', 'Took them long enough. Still, it’s here.']) : pick(['Proud backer! My name’s in the credits.', 'Backed it on day one — worth every cent.', 'The stretch goals were worth it.']) });
  if (rel.earlyAccess && week < 8) L.push({ w: 2, tone: rel.earlyAccess.weeks >= 78 ? 'bad' : 'good', text: rel.earlyAccess.weeks >= 78 ? pick(['Finally out of Early Access. Only took forever.', 'Bought it in Early Access years ago. It’s… done?']) : pick(['Backed it in Early Access — so proud of how it turned out.', 'Watched this grow from a buggy alpha. 1.0 is great.', `My bug report made it into ${name}!`]) });
  if (rel.betaTested && week < 6) L.push({ w: 1, tone: 'good', text: 'Played the beta — launch is so much smoother.' });
  if (plat) L.push({ w: 0.7, tone: 'neutral', text: pick([`Playing it on ${plat}.`, `Runs well on my ${plat}.`, `Picked it up for ${plat}.`]) });
  if (yr < 1990) L.push({ w: 1, tone: 'good', text: 'Please print a map of level 3!' });
  if (yr >= 2013) L.push({ w: 1.5, tone: score >= 60 ? 'good' : 'bad', text: score >= 60 ? 'Clip of my best moment 👇' : 'Watched a stream, glad I skipped it.' });
  if (week > 30) L.push({ w: 2, tone: 'good', text: pick([`Still playing ${name} after all this time.`, `${name} holds up.`, 'Replaying this, still great.']) });
  return L;
}

function draw(lines: Line[], r: () => number): Line {
  const total = lines.reduce((t, l) => t + l.w, 0);
  let x = r() * total;
  for (const l of lines) {
    x -= l.w;
    if (x <= 0) return l;
  }
  return lines[0]!;
}

/** Posts about one release (newest first), up to `max`. */
export function releaseBuzz(s: GameState, rel: Release, max = 12): BuzzPost[] {
  const out: BuzzPost[] = [];
  const weeksSince = Math.floor((s.day - rel.day) / 7);
  if (weeksSince < 0) return out;
  const pop = Math.max(0.6, Math.min(3.5, Math.log10(rel.units + 100) - 2.4));
  for (let w = Math.min(weeksSince, 160); w >= 0 && out.length < max; w--) {
    // most talk is at launch; a trickle after
    const r = rng(`${rel.id}|${w}`);
    const expected = pop * (w < 2 ? 2.2 : w < 8 ? 1 : w < 26 ? 0.35 : 0.12);
    const n = Math.floor(expected) + (r() < expected % 1 ? 1 : 0);
    for (let k = n - 1; k >= 0 && out.length < max; k--) {
      // each post has its own seed, so earlier posts appearing never reshuffle later ones
      const r = rng(`${rel.id}|${w}|${k}`);
      const day = rel.day + w * 7 + Math.floor(r() * 7);
      if (day > s.day) continue;
      const year = fromDay(day).year;
      const medium = mediumFor(year);
      const line = draw(linesFor(s, rel, w, r), r);
      const reach = Math.pow(10, pop) * (0.3 + r() * 1.7) * (medium === 'letter' ? 0 : medium === 'bbs' ? 0.05 : medium === 'forum' ? 0.4 : 3);
      out.push({ id: `${rel.id}|${w}|${k}`, releaseId: rel.id, game: rel.name, day, medium, author: author(r, medium, year), text: line.text, tone: line.tone, likes: Math.round(reach) });
    }
  }
  return out.sort((a, b) => b.day - a.day);
}

/** The studio-wide feed: recent posts across your recent games. */
export function studioBuzz(s: GameState, max = 40): BuzzPost[] {
  const recent = s.releaseOrder.slice(-12).map((id) => s.releases[id]!).filter(Boolean);
  return recent
    .flatMap((r) => releaseBuzz(s, r, 10))
    .sort((a, b) => b.day - a.day)
    .slice(0, max);
}

/** Share of positive posts about a release (0..1), or null with too little talk. */
export function sentiment(posts: BuzzPost[]): number | null {
  const rated = posts.filter((p) => p.tone !== 'neutral');
  if (rated.length < 3) return null;
  return rated.filter((p) => p.tone === 'good').length / rated.length;
}
