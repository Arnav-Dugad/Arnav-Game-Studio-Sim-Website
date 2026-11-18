/**
 * Easter eggs: someone on the team hides a secret in a game — a hidden room, their name in the credits of a fake
 * game, a dancing developer. Leave it in and, some months after launch, players find it: a little burst of buzz
 * for the game and a proud developer. (Take it out and they're a bit deflated.)
 */
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameProject, GameState, Release } from '../types';
import { pushNews } from '../util';

export const EGGS = ['a hidden room full of the team’s pets', 'a secret level made of the office floor plan', 'a dancing developer behind a waterfall', 'the credits of a fake game', 'a cow level', 'a message from the team to whoever finds it'] as const;

/** At launch: the egg goes out with the game. */
export function eggOnRelease(p: GameProject, rel: Release): void {
  if (p.easterEgg) rel.easterEgg = { ...p.easterEgg, found: false };
}

/** Monthly: players may stumble on a hidden secret (from about six weeks after launch). */
export function easterEggsMonthly(c: Ctx): void {
  const { s, rng } = c;
  for (const id of s.releaseOrder.slice(-12)) {
    const r = s.releases[id];
    const egg = r?.easterEgg;
    if (!r || !egg || egg.found || s.day - r.day < 45 || !rng.chance(0.3)) continue;
    egg.found = true;
    found(s, r);
  }
}

function found(s: GameState, r: Release): void {
  const egg = r.easterEgg!;
  const st = s.staff[egg.by];
  r.userScore = Math.min(100, r.userScore + 1);
  if (!r.delisted) {
    for (const ps of r.platforms) ps.potential *= 1.03;
    r.active = true;
  }
  const fr = r.concept.franchiseId ? s.franchises[r.concept.franchiseId] : undefined;
  if (fr) fr.fans *= 1.03;
  if (st && (!st.mood || st.mood.until <= s.day || (st.mood.v >= 0 && st.mood.v < 4))) {
    st.mood = { v: 4, until: s.day + 60, label: 'They found my easter egg!' };
    st.moraleWhy = undefined;
  }
  pushNews(s, { category: 'studio', headline: `Players discover a secret in ${r.name}`, body: `Hidden away in ${r.name}: ${egg.what}. ${egg.name.split(' ')[0]} put it there, and ${fromDay(s.day).year >= 1996 ? 'the internet is delighted' : 'kids are swapping the secret in playgrounds and letters pages'}.`, tone: 'good' });
}
