/**
 * Conference talks (1988+): once a year the studio gets a speaking slot at the Developers Summit. A senior
 * person (or the founder) talks about a game they worked on — a tech deep-dive, an art retrospective, or an
 * honest post-mortem of a flop. A good talk builds reputation, puts the studio on job-seekers' radar for a few
 * months and makes the speaker's year; it also puts them in front of every rival's headhunter.
 */
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState, Release, Staff } from '../types';
import { addRep, money, pushNews, spend } from '../util';
import { ROLE_SKILLS } from './staff';
import { TOPIC_BY_ID } from '../../data/topics';

export const TALK_YEAR = 1988;
export const TALK_AWAY_DAYS = 3;
/** How long a good talk keeps job-seekers interested (and headhunters too). */
export const TALK_BUZZ_DAYS = 90;

export function talkCost(s: GameState): number {
  return money(300, s.day);
}

/** Games this person can talk about: ones they're credited on. */
export function talkableGames(s: GameState, st: Staff): Release[] {
  return s.releaseOrder
    .map((id) => s.releases[id]!)
    .filter((r) => r && (r.credits ?? []).some((c) => c.id === st.id))
    .reverse();
}

export function talkBlocked(s: GameState, st: Staff): string | null {
  const yr = fromDay(s.day).year;
  if (yr < TALK_YEAR) return `The Developers Summit starts in ${TALK_YEAR}`;
  if (st.role !== 'founder' && st.level !== 'senior' && st.level !== 'lead') return 'Speakers are seniors and leads';
  if (s.company.lastTalkYear === yr) return 'The studio has already had its talk this year';
  if (!talkableGames(s, st).length) return 'They need a shipped game to talk about';
  if (st.sickDays > 0 || (st.vacationDays ?? 0) > 0) return `${st.name} is away`;
  if (s.company.cash < talkCost(s)) return 'Not enough cash for the trip';
  return null;
}

export function talkTitle(st: Staff, rel: Release): string {
  const g = rel.name;
  if (rel.score < 55) return `Post-mortem: what went wrong with ${g}`;
  const topic = TOPIC_BY_ID[rel.concept.topic]?.name ?? 'world';
  switch (st.role) {
    case 'programmer':
      return `Under the hood of ${g}`;
    case 'artist':
      return `The art of ${g}`;
    case 'designer':
      return `Designing the ${topic.toLowerCase()} of ${g}`;
    case 'writer':
      return `Writing ${g}: story in a ${topic.toLowerCase()} world`;
    case 'audio':
      return `The sound of ${g}`;
    case 'qa':
      return `Ten thousand bugs: testing ${g}`;
    case 'producer':
      return `Shipping ${g} on time (almost)`;
    case 'marketer':
      return `How the world heard about ${g}`;
    default:
      return `From a garage to ${g}`;
  }
}

export function giveTalk(c: Ctx, staffId: string, releaseId: string): string | null {
  const { s, rng } = c;
  const st = s.staff[staffId];
  if (!st) return 'Unknown staff member';
  const why = talkBlocked(s, st);
  if (why) return why;
  const rel = talkableGames(s, st).find((r) => r.id === releaseId);
  if (!rel) return 'Pick a game they worked on';
  spend(s, 'other_expense', talkCost(s));
  s.company.lastTalkYear = fromDay(s.day).year;
  const [primary] = ROLE_SKILLS[st.role];
  const skill = st.skills[primary];
  // honest post-mortems of flops are crowd favourites too
  const story = rel.score < 55 ? 70 : rel.score;
  const reception = clamp(rng.normal((skill + story) / 2 + (st.level === 'lead' ? 5 : 0), 10), 0, 100);
  const tier = reception >= 80 ? 'ovation' : reception >= 55 ? 'good' : 'mixed';
  const title = talkTitle(st, rel);
  addRep(s, (tier === 'ovation' ? 2 : tier === 'good' ? 1 : 0.3) * (1 - s.company.reputation / 115), 'Conference talk');
  if (tier !== 'mixed') s.company.talkBuzzUntil = s.day + TALK_BUZZ_DAYS;
  st.vacationDays = TALK_AWAY_DAYS;
  st.leave = 'conference';
  st.loyalty = clamp(st.loyalty + 4, 0, 100);
  st.mood = { v: tier === 'mixed' ? 1 : 6, until: s.day + 60, label: tier === 'mixed' ? 'Gave a talk' : 'Gave a great talk' };
  st.skills[primary] = clamp(st.skills[primary] + 1, 0, Math.max(st.skills[primary], st.potential));
  if (tier === 'ovation') st.spotlightUntil = s.day + TALK_BUZZ_DAYS;
  s.progress.stats.talks = (s.progress.stats.talks ?? 0) + 1;
  if (tier === 'ovation') s.progress.stats.ovations = (s.progress.stats.ovations ?? 0) + 1;
  pushNews(s, {
    category: 'studio',
    headline: tier === 'ovation' ? `Standing ovation for ${st.name} at the Developers Summit` : `${st.name} speaks at the Developers Summit`,
    body: `“${title}” — ${tier === 'ovation' ? 'the talk of the conference. Job applications are pouring in (and rival recruiters took notes).' : tier === 'good' ? 'well received; more people want to work with you.' : 'a quiet room, but a few good questions.'}`,
    tone: tier === 'mixed' ? 'neutral' : 'good',
  });
  return null;
}
