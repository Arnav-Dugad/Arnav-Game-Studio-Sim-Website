/**
 * One-on-ones: take someone aside and ask how they're really doing. What they say comes from their actual
 * situation — burnout, pay against the market, a cramped desk, a dream they're chasing — and being heard helps
 * a little (a lift in mood, a bit more loyalty, some relief from burnout). The founder's calendar only fits so
 * many a month, and talking to the same person every week stops meaning much, so it's a choice: who needs you?
 */
import { clamp } from '../breakdown';
import { formatDate } from '../calendar';
import { GENRE_BY_ID } from '../../data/genres';
import type { GameState, Staff } from '../types';
import { favouriteGenre, isAway, marketSalary, moraleTarget, onFavouriteGenre } from './staff';
import { fmtMoney } from '../util';

/** Days before the same person gets much out of another one-on-one. */
export const CHECKIN_COOLDOWN = 90;
const WINDOW = 30;

export type CheckInTopic = 'burnout' | 'pay' | 'space' | 'crunch' | 'idle' | 'morale' | 'ambition' | 'genre' | 'happy';

/** One-on-ones the founder can fit in a month: producers take some of the load. */
export function checkInLimit(s: GameState): number {
  const producers = Object.values(s.staff).filter((x) => x.role === 'producer').length;
  return 6 + Math.min(10, producers * 2);
}

export function checkInsUsed(s: GameState): number {
  return (s.company.checkInLog ?? []).filter((d) => s.day - d < WINDOW).length;
}

export function checkInBlocked(s: GameState, st: Staff | undefined): string | null {
  if (!st) return 'No such person';
  if (st.role === 'founder') return 'That’s you';
  if (isAway(st)) return `${st.name.split(' ')[0]} is away`;
  if (st.checkIn && s.day - st.checkIn.day < CHECKIN_COOLDOWN) return `You talked recently — next one-on-one from ${formatDate(st.checkIn.day + CHECKIN_COOLDOWN)}`;
  if (checkInsUsed(s) >= checkInLimit(s)) return 'Your calendar is full this month (hire producers to share the load)';
  return null;
}

/** What's really on their mind, most pressing first. */
export function checkInTopic(s: GameState, st: Staff): { topic: CheckInTopic; line: string } {
  const first = (n: string) => n.split(' ')[0] ?? n;
  if (st.burnout >= 60) return { topic: 'burnout', line: 'I’m running on empty. Honestly, I need a proper break.' };
  const parts = moraleTarget(s, st).parts.filter((p) => p.kind === 'add' && p.value <= -5).sort((a, b) => a.value - b.value);
  const worst = parts[0];
  if (worst) {
    const l = worst.label;
    if (l === 'Pay vs market') return { topic: 'pay', line: `I could earn ${fmtMoney(marketSalary(s, st.skills))} somewhere else. I’d rather stay — but it’s on my mind.` };
    if (l === 'No desk') return { topic: 'space', line: 'I don’t even have a desk. I’ve been working off my lap.' };
    if (l === 'Crowding') return { topic: 'space', line: 'It’s so cramped in here I can’t think.' };
    if (l === 'Noise') return { topic: 'space', line: 'It’s really loud where I sit. Headphones only go so far.' };
    if (l === 'No break area') return { topic: 'space', line: 'There’s nowhere to step away for five minutes.' };
    if (l.startsWith('Crunch')) return { topic: 'crunch', line: 'This crunch is wearing everyone down. How much longer?' };
    if (l === 'Nothing to do') return { topic: 'idle', line: 'I’d love something real to work on.' };
    if (l === 'Recent layoffs') return { topic: 'morale', line: 'After the layoffs, everyone’s quietly updating their CV.' };
    if (l === 'Recent reviews') return { topic: 'morale', line: 'Those reviews stung. We can do better than that.' };
    if (l === 'Wants a raise') return { topic: 'pay', line: 'I think I’ve earned a raise. I’d like to talk about it.' };
    if (l.startsWith('Burnout')) return { topic: 'burnout', line: 'I’m more tired than I’ve been in a long time.' };
    return { topic: 'morale', line: 'A few things have been getting to me lately. Thanks for asking.' };
  }
  if (st.ambition) return { topic: 'ambition', line: ambitionLine(st.ambition) };
  if (!onFavouriteGenre(s, st)) return { topic: 'genre', line: `Someday I’d love to make a ${GENRE_BY_ID[favouriteGenre(st.id)].name.toLowerCase()} game here.` };
  return { topic: 'happy', line: `Honestly, things are great. Thanks for checking in${st.role === 'qa' ? ' — and for the bug database' : ''}, ${first(s.company.founderName)}.` };
}

function ambitionLine(a: NonNullable<Staff['ambition']>): string {
  switch (a.kind) {
    case 'genre':
      return `I’d really love to make a ${GENRE_BY_ID[a.genre!]?.name.toLowerCase() ?? 'new kind of'} game.`;
    case 'hit':
      return 'I want to make something great — an 80+ game. I think we can.';
    case 'first':
      return 'I can’t wait to see my name in the credits of a game we ship.';
    case 'raise':
      return `I’ve been hoping for a raise — ${Math.round((a.target ?? 0) / 1000)}k would make a real difference.`;
    case 'research':
      return 'I’d love a month to dig into research.';
    case 'skill':
      return `I’m working hard on my ${a.skill ?? 'craft'}. I want to get really good.`;
    case 'holiday':
      return 'I could really use a proper holiday.';
    case 'desk':
      return 'Honestly, I’d love a better desk.';
    default:
      return 'There’s something I’ve been wanting to do here. Thanks for asking.';
  }
}

/** Sit down with someone: they tell you what's on their mind and feel heard. */
export function checkIn(s: GameState, staffId: string): string | null {
  const st = s.staff[staffId];
  const why = checkInBlocked(s, st);
  if (why || !st) return why;
  const { topic, line } = checkInTopic(s, st);
  st.checkIn = { day: s.day, line, topic };
  s.progress.stats.checkIns = (s.progress.stats.checkIns ?? 0) + 1;
  s.company.checkInLog = [...(s.company.checkInLog ?? []).filter((d) => s.day - d < WINDOW), s.day];
  st.loyalty = clamp(st.loyalty + 2, 0, 100);
  if (topic === 'burnout') st.burnout = Math.max(0, st.burnout - 8);
  // feeling heard: lifts a bad mood a little, or adds a small good one
  const lift = topic === 'happy' ? 2 : 4;
  if (st.mood && st.mood.until > s.day && st.mood.v < 0) st.mood = { ...st.mood, v: Math.min(0, st.mood.v + lift) };
  else if (!st.mood || st.mood.until <= s.day || st.mood.v < lift) st.mood = { v: lift, until: s.day + 45, label: topic === 'happy' ? 'Good chat with the boss' : 'Felt heard' };
  st.moraleWhy = undefined;
  return null;
}
