/**
 * Post-mortem: turns a release's explainable numbers (quality, user score and sales breakdowns, money)
 * into a short human write-up — what went right, what went wrong, and what to try next time.
 * Pure and deterministic; reads only what the release already recorded.
 */
import { GENRE_BY_ID } from '@/data/genres';
import { SIZE_LABEL } from './lib';
import type { Release } from '@/sim/types';

export interface PMPoint {
  text: string;
  /** What to try next time (only for things that went wrong). */
  lesson?: string;
  /** Rough size of the effect, for ranking. */
  weight: number;
}

export interface PostMortem {
  verdict: string;
  tone: 'good' | 'neutral' | 'bad';
  right: PMPoint[];
  wrong: PMPoint[];
}

const W = (m: number) => Math.abs(Math.log(Math.max(0.01, m)));

/** Explain one multiplier from the quality breakdown (null = not worth mentioning). */
function qualityPoint(label: string, m: number, genre: string): { good: boolean; p: PMPoint } | null {
  const up = m >= 1.035;
  const down = m <= 0.95;
  if (!up && !down) return null;
  const w = W(m);
  const say = (good: boolean, text: string, lesson?: string) => ({ good, p: { text, lesson: good ? undefined : lesson, weight: w } });
  if (label.startsWith('Design/tech balance')) return down ? say(false, `The design/tech balance was off for ${genre}`, `Keep each phase’s sliders near the ideal ${genre} mix — the Guide lists it`) : null;
  if (label === 'Focus matches genre') return say(up, up ? `The team focused on exactly what ${genre} players care about` : `Effort went into areas ${genre} players don’t value`, 'Match each phase’s focus to the genre’s priorities');
  if (label.endsWith(' fit') && label.includes(' × ')) return say(up, up ? `${label.replace(/ fit$/, '')} was an inspired pairing` : `${label.replace(/ fit$/, '')} was an awkward pairing`, 'Pick a genre and topic that suit each other — “Inspire me” can suggest one');
  if (label === 'Audience fit') return say(up, up ? 'It was pitched at the right audience' : 'It was pitched at the wrong audience', 'Choose an audience that suits the genre and topic');
  if (label === 'Platform fit') return say(up, up ? 'The platforms suited it perfectly' : 'Its platforms’ players weren’t into this kind of game', 'Check each platform’s genre fit before choosing');
  if (label.startsWith('Engine tech')) return say(up, up ? 'The engine was cutting-edge for its platforms' : 'The engine looked dated on these platforms', 'Build a new engine with your latest research');
  if (label === 'Engine features') return up ? say(true, 'Engine features gave it a real edge') : null;
  if (label === 'Genre trend') return say(up, up ? `${genre} was riding high in the market` : `${genre} was out of fashion`, 'Watch the Market trends — or wait for the genre to come back');
  if (label === 'Topic trend') return say(up, up ? 'The topic was in vogue' : 'The topic felt passé', 'Topics drift in and out of fashion; check the trends');
  if (label === 'Repetitive combo') return say(false, 'Players had seen this combination from you before', 'Try something new between games in the same mould');
  if (label === 'Fresh idea') return say(true, 'A combination the studio had never tried felt fresh');
  if (label === 'Visionary ideas') return say(true, 'A visionary on the team brought standout ideas');
  if (label === 'Cut features') return say(false, 'Features were cut to make the date', 'Plan scope and time so you don’t have to cut');
  if (label.includes('(great for ')) return say(true, `${label.split(' (')[0]} was a great fit`);
  if (label.includes('(an odd fit')) return say(false, `${label.split(' (')[0]} felt out of place`, 'Choose features that suit the genre');
  if (label.startsWith('Remaster of') || label.startsWith('Builds on')) return say(up, up ? 'It built on a much-loved original' : 'The original wasn’t loved enough to build on', 'Remaster and expand your best-received games');
  if (label.startsWith('Early Access')) return up ? say(true, 'Early Access players helped polish it') : null;
  if (label.startsWith('Stretch goals')) return up ? say(true, 'Crowdfunding stretch goals added depth') : null;
  if (label.startsWith('Culture:')) return say(up, up ? `Studio culture helped (${label.slice(9)})` : `Studio culture worked against it (${label.slice(9)})`, 'Culture values cut both ways — revisit them in the Company panel');
  return null;
}

export function postMortem(r: Release): PostMortem {
  const genre = GENRE_BY_ID[r.concept.genre]?.name ?? r.concept.genre;
  const right: PMPoint[] = [];
  const wrong: PMPoint[] = [];
  const push = (good: boolean, p: PMPoint) => (good ? right : wrong).push(p);

  for (const part of r.quality.parts) {
    if (part.kind === 'base') {
      // how much work went in, relative to what this size of game needs
      if (part.value < 0.62) push(false, { text: `Not enough work went into ${r.concept.size === 'aaa' ? 'an AAA' : `a ${SIZE_LABEL[r.concept.size].toLowerCase()}`} game`, lesson: 'A bigger team, more time, or a smaller scope', weight: W(part.value / 0.7) });
      else if (part.value > 0.78) push(true, { text: 'The team poured in more work than most games get', weight: W(part.value / 0.7) });
      continue;
    }
    if (part.kind !== 'mul') continue;
    if (part.label.startsWith('Bugs')) {
      if (part.value <= 0.9) push(false, { text: `It shipped buggy (${r.bugs.toLocaleString('en-US')} known bugs)`, lesson: 'Give QA more time, hire testers, or run an open beta', weight: W(part.value) });
      else if (part.value >= 0.985 && r.bugs < 50) push(true, { text: 'It launched remarkably polished', weight: 0.05 });
      continue;
    }
    const q = qualityPoint(part.label, part.value, genre);
    if (q) push(q.good, q.p);
  }

  for (const part of r.why.user?.parts ?? []) {
    if (part.kind !== 'add' || part.label === 'Players vary' || part.label === 'Bugs') continue;
    const w = Math.abs(part.value) / 25;
    if (part.label.startsWith('Didn’t live up')) push(false, { text: 'Players felt it didn’t live up to the hype', lesson: 'Only build big hype for games that can deliver', weight: w });
    else if (part.label === 'Franchise fatigue' && part.value <= -2) push(false, { text: 'The series is wearing thin', lesson: 'Rest the series, or reinvent it', weight: w });
    else if (part.label === 'Monetization' && part.value <= -3) push(false, { text: 'Players resented the monetization', lesson: 'Lighter monetization keeps players on side', weight: w });
    else if (part.value >= 2 && !part.label.startsWith('Culture:')) push(true, { text: part.label, weight: w });
    else if (part.value <= -3 && !part.label.startsWith('Culture:')) push(false, { text: part.label, weight: w });
  }

  // business
  const profit = r.net - r.devCost;
  if (r.devCost > 0 && profit >= r.devCost * 2) push(true, { text: `Paid for itself ${Math.floor(r.net / r.devCost)} times over`, weight: 0.3 });
  else if (profit < 0) push(false, { text: 'It lost money', lesson: r.hypeAtLaunch < 0.3 ? 'Market it before launch so people know it’s coming' : 'Keep the budget in line with what the game can earn', weight: 0.25 });
  if (r.hypeAtLaunch >= 1) push(true, { text: 'Launch hype was huge', weight: 0.12 });
  else if (r.hypeAtLaunch < 0.15 && !r.shadowDrop && !r.concept.expansionOf) push(false, { text: 'Few people knew it was coming', lesson: 'Announce it and run some marketing before launch', weight: 0.1 });
  if (r.crowdfund && r.crowdfund.late > 0) push(false, { text: `Backers waited ${Math.ceil(r.crowdfund.late / 30)} month(s) longer than promised`, lesson: 'Promise backers a date you can keep', weight: 0.1 });
  if (r.numberOne) push(true, { text: 'It topped the sales chart', weight: 0.2 });
  if (r.awards.length) push(true, { text: `It won ${r.awards.length === 1 ? 'an award' : `${r.awards.length} awards`}`, weight: 0.2 });

  right.sort((a, b) => b.weight - a.weight);
  wrong.sort((a, b) => b.weight - a.weight);
  const score = r.score;
  const ok = profit >= 0;
  const [verdict, tone]: [string, PostMortem['tone']] =
    score >= 85 && ok ? ['A triumph — the kind of game studios are remembered for', 'good']
    : score >= 75 && ok ? ['A real success', 'good']
    : score >= 75 ? ['Loved by critics, but it didn’t pay its way', 'neutral']
    : score >= 60 && ok ? ['A solid outing', 'neutral']
    : score >= 60 ? ['Decent, but a money-loser', 'neutral']
    : ok ? ['Critics shrugged, but it made money', 'neutral']
    : ['A hard lesson', 'bad'];
  // drop near-duplicates (same opening words)
  const dedupe = (xs: PMPoint[]) => xs.filter((x, i) => xs.findIndex((y) => y.text === x.text) === i).slice(0, 4);
  return { verdict, tone, right: dedupe(right), wrong: dedupe(wrong) };
}
