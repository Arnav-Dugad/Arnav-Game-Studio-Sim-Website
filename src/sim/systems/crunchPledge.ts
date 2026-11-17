/**
 * The no-crunch pledge (2005+): promise publicly that your studio will never crunch. People believe it — a lasting
 * morale lift, and goodwill the first time — but crunching anyway breaks it in public: a scandal, a team that
 * feels lied to, and nobody believes a new pledge for three years. Quietly withdrawing it costs a little face.
 */
import { fromDay } from '../calendar';
import type { GameState } from '../types';
import { addRep, pushNews } from '../util';

export const PLEDGE_YEAR = 2005;
export const PLEDGE_MORALE = 3;
const RETRY_DAYS = 365 * 3;

export function pledged(s: GameState): boolean {
  return s.company.crunchPledge?.since !== undefined;
}

export function pledgeBlocked(s: GameState): string | null {
  if (fromDay(s.day).year < PLEDGE_YEAR) return `Crunch only becomes a public issue around ${PLEDGE_YEAR}`;
  if (pledged(s)) return 'You’ve already pledged';
  const broken = s.company.crunchPledge?.brokenDay;
  if (broken !== undefined && s.day - broken < RETRY_DAYS) return 'Nobody would believe you yet — wait three years after breaking a pledge';
  if (Object.values(s.projects).some((p) => p.kind === 'game' && p.crunch)) return 'Stop crunching first';
  return null;
}

export function takePledge(s: GameState): string | null {
  const why = pledgeBlocked(s);
  if (why) return why;
  const first = !s.company.crunchPledge?.ever;
  s.company.crunchPledge = { since: s.day, ever: true, brokenDay: s.company.crunchPledge?.brokenDay };
  if (first) addRep(s, 1.5 * (1 - s.company.reputation / 130), 'No-crunch pledge');
  pushNews(s, { category: 'studio', headline: `${s.company.name} pledges: no more crunch`, body: 'A public promise that nobody at the studio will be asked to work through nights and weekends again.', tone: 'good' });
  return null;
}

export function withdrawPledge(s: GameState): string | null {
  if (!pledged(s)) return 'There’s no pledge to withdraw';
  s.company.crunchPledge = { ...s.company.crunchPledge!, since: undefined };
  addRep(s, -1, 'Withdrew the no-crunch pledge');
  pushNews(s, { category: 'studio', headline: `${s.company.name} quietly drops its no-crunch pledge`, body: 'Staff noticed.', tone: 'bad' });
  return null;
}

/** Crunching while pledged: the promise is broken, publicly. */
export function breakPledge(s: GameState): void {
  if (!pledged(s)) return;
  s.company.crunchPledge = { ...s.company.crunchPledge!, since: undefined, brokenDay: s.day };
  addRep(s, -5, 'Broke the no-crunch pledge');
  s.company.moraleMods.push({ v: -8, until: s.day + 120, label: 'Pledge broken' });
  pushNews(s, { category: 'studio', headline: `${s.company.name} breaks its no-crunch pledge`, body: 'Leaked messages show the team back on nights and weekends. Former staff are not surprised.', tone: 'bad' });
}
