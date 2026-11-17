/**
 * The making-of documentary (1995+): a film crew asks to follow one of your games from early development to launch.
 * Saying yes is a bet on yourself — the cameras bring hype now, and six months after launch the film premieres:
 * a great game becomes a celebrated documentary (fans, reputation, applicants), a flop becomes a cautionary tale,
 * and crunch caught on camera always makes the cut. Cancelling the game gives the film a very different ending.
 */
import { fromDay, toDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameProject, GameState, Release } from '../types';
import { addRep, pushNews } from '../util';

export const DOC_YEAR = 1995;
export const DOC_PREMIERE_DAYS = 180;
/** Crunch days on camera that become "the crunch scenes". */
export const DOC_CRUNCH_SCENE = 20;

export type DocOutcome = 'acclaimed' | 'warm' | 'mixed' | 'cautionary';

export function docTitle(name: string): string {
  return `Making ${name}`;
}

/** Which way the film goes, from the game's reception and what the cameras saw. */
export function docOutcome(score: number, crunchDays: number): DocOutcome {
  const crunchy = crunchDays >= DOC_CRUNCH_SCENE;
  if (score >= 82 && !crunchy) return 'acclaimed';
  if (score >= 72) return crunchy ? 'mixed' : 'warm';
  if (score >= 60) return 'mixed';
  return 'cautionary';
}

/** Daily, during development: the crew notices crunch. */
export function docDaily(p: GameProject): void {
  if (p.documentary && p.crunch) p.documentary.crunchDays++;
}

/** At launch: the film is in the edit; it premieres six months later. */
export function docOnRelease(s: GameState, p: GameProject, rel: Release): void {
  if (!p.documentary) return;
  // premieres on the first of the month, about six months on
  const d = fromDay(s.day + DOC_PREMIERE_DAYS);
  const premiere = d.day === 1 ? s.day + DOC_PREMIERE_DAYS : d.month === 12 ? toDay(d.year + 1, 1, 1) : toDay(d.year, d.month + 1, 1);
  rel.documentary = { premiere, crunchDays: p.documentary.crunchDays };
}

/** Monthly: premiere any finished documentaries. */
export function documentaryMonthly(c: Ctx): void {
  const { s } = c;
  for (const id of s.releaseOrder) {
    const r = s.releases[id];
    const d = r?.documentary;
    if (!r || !d || d.outcome || s.day < d.premiere) continue;
    const outcome = docOutcome(r.score, d.crunchDays);
    d.outcome = outcome;
    const title = docTitle(r.name);
    const room = 1 - s.company.reputation / 130; // a famous studio gains less from one film
    if (outcome === 'acclaimed') {
      addRep(s, 3 * room, `${title} wins over audiences`);
      s.company.fans = Math.round(s.company.fans * 1.06);
      s.company.talkBuzzUntil = Math.max(s.company.talkBuzzUntil ?? 0, s.day + 120);
      for (const st of Object.values(s.staff)) if (r.credits?.some((cr) => cr.id === st.id)) st.morale = Math.min(100, st.morale + 6);
      pushNews(s, { category: 'studio', headline: `“${title}” premieres to rave reviews`, body: `The documentary following ${s.company.name} through the making of ${r.name} is a festival favourite — and job applications are pouring in.`, tone: 'good' });
    } else if (outcome === 'warm') {
      addRep(s, 1.2 * room, `${title} premieres`);
      s.company.fans = Math.round(s.company.fans * 1.02);
      pushNews(s, { category: 'studio', headline: `“${title}” finds an audience`, body: `A warm, funny look at how ${r.name} came together. Fans love the behind-the-scenes moments.`, tone: 'good' });
    } else if (outcome === 'mixed') {
      const crunchy = d.crunchDays >= DOC_CRUNCH_SCENE;
      if (crunchy) addRep(s, -1, `${title}: the crunch scenes`);
      pushNews(s, {
        category: 'studio',
        headline: `“${title}” premieres`,
        body: crunchy ? `Critics praise the honesty — but the late nights and exhausted faces are what everyone talks about.` : `An honest film about a game that was good, not great. Some fans enjoy it; most don’t notice.`,
        tone: crunchy ? 'bad' : 'neutral',
      });
    } else {
      addRep(s, -2, `${title}: a cautionary tale`);
      pushNews(s, { category: 'studio', headline: `“${title}”: a cautionary tale`, body: `The documentary about ${r.name} has become required viewing in game-design classes — as an example of what not to do.`, tone: 'bad' });
    }
  }
}

/** The game was cancelled with the cameras rolling. */
export function docOnCancel(s: GameState, p: GameProject): void {
  if (!p.documentary) return;
  addRep(s, -1.5, `Cancelled ${p.concept.name} on camera`);
  pushNews(s, { category: 'studio', headline: `Documentary crew films the end of ${p.concept.name}`, body: `“${docTitle(p.concept.name)}” will now be a film about a game that never was.`, tone: 'bad' });
}

export function docEligible(s: GameState, p: GameProject): boolean {
  return fromDay(s.day).year >= DOC_YEAR && !p.documentary && p.phase === 0 && p.concept.size !== 'small' && !p.concept.expansionOf && !p.concept.remasterOf;
}
