/**
 * Post-mortem: turns a release's explainable numbers (quality, user score and sales breakdowns, money)
 * into a short human write-up — what went right, what went wrong, and what to try next time.
 * Pure and deterministic; reads only what the release already recorded.
 */
import { GENRE_BY_ID } from '@/data/genres';
import { AUDIENCES, type Audience } from '@/data/types';
import { comboFit } from '@/sim/systems/dev';
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
  // small-but-certain bonuses (a fresh idea, Early Access polish) count even though they're modest
  const modest = label === 'Fresh idea' || label.startsWith('Early Access') || label.startsWith('Stretch goals');
  const up = m >= (modest ? 1.01 : 1.035);
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
    if (part.label === 'Audience fit' && part.value < 1) {
      // only a mistake if another audience would have suited this genre and topic better
      const fit = (a: Audience) => Math.min(1.08, Math.max(0.7, 0.85 + (comboFit(r.concept.genre, r.concept.topic, a).aud - 1) * 0.6));
      const best = AUDIENCES.reduce((b, a) => (fit(a) > fit(b) ? a : b), r.concept.audience);
      if (fit(best) > part.value + 0.02) push(false, { text: 'It was pitched at the wrong audience', lesson: `${GENRE_BY_ID[r.concept.genre]?.name ?? 'This genre'} with this topic suits ${best === 'everyone' ? 'everyone' : `${best}s`} better — the planner stars the best audience`, weight: W(part.value / fit(best)) });
      continue;
    }
    if (part.label.startsWith('Critics’ high bar')) {
      // a small game that maxed out: the next step is a bigger one
      if (part.value < 0.95 && (r.concept.size === 'small' || r.concept.size === 'medium')) push(false, { text: `A ${r.concept.size} game can only impress critics so much`, lesson: r.concept.size === 'small' ? 'For 90+, make a medium or large game' : 'The very top scores go to large games', weight: W(part.value) });
      continue;
    }
    if (part.label.startsWith('Bugs')) {
      if (part.value <= 0.9) push(false, { text: `It shipped buggy (${r.bugs.toLocaleString('en-US')} known bugs)`, lesson: 'Give QA more time, hire testers, or run an open beta', weight: W(part.value) });
      else if (part.value >= 0.985 && r.bugs < 50) push(true, { text: 'It launched remarkably polished', weight: 0.05 });
      continue;
    }
    const q = qualityPoint(part.label, part.value, genre);
    if (q) push(q.good, q.p);
  }

  for (const part of r.why.user?.parts ?? []) {
    if (part.kind !== 'add' || part.label === 'Players vary' || part.label === 'Bugs' || part.label.startsWith('Backers waited')) continue;
    const w = Math.abs(part.value) / 25;
    if (part.label === 'Worth the wait') push(true, { text: 'Players forgave the delay — it was worth the wait', weight: 0.05 });
    else if (part.label.startsWith('Delayed')) push(false, { text: 'A long public delay, and it still disappointed', lesson: 'If you delay, use the time to fix what matters', weight: 0.09 });
    else if (part.label === 'Feels overpriced') push(false, { text: 'Players felt it was overpriced', lesson: 'Save premium prices for games you know are great', weight: 0.1 });
    else if (part.label === 'Great value') push(true, { text: 'Players loved the budget price', weight: 0.06 });
    else if (part.label === 'Below the studio’s usual standard') push(false, { text: `Fans of your ${genre} games expected better`, lesson: 'Your speciality sets the bar — give it the time it needs', weight: 0.12 });
    else if (part.label.startsWith('Didn’t live up')) push(false, { text: 'Players felt it didn’t live up to the hype', lesson: 'Only build big hype for games that can deliver', weight: w });
    else if (part.label === 'Franchise fatigue' && part.value <= -2) push(false, { text: 'The series is wearing thin', lesson: 'Rest the series, or reinvent it', weight: w });
    else if (part.label === 'Monetization' && part.value <= -3) push(false, { text: 'Players resented the monetization', lesson: 'Lighter monetization keeps players on side', weight: w });
    else if (part.value >= 2 && !part.label.startsWith('Culture:')) push(true, { text: part.label, weight: w });
    else if (part.value <= -3 && !part.label.startsWith('Culture:')) push(false, { text: part.label, weight: w });
  }

  for (const part of r.why.sales?.parts ?? []) {
    if (part.label.startsWith('Known for')) push(true, { text: `Players who love your ${genre} games turned up`, weight: Math.log(part.value) + 0.05 });
    else if (part.label.startsWith('Budget price')) push(true, { text: 'The budget price brought in extra buyers', weight: 0.08 });
  }

  // business
  const profit = r.net - r.devCost;
  // money is only judged once sales have settled (or the game has already paid its way)
  const settled = !r.active || r.week >= 26 || profit >= 0;
  if (r.devCost > 0 && profit >= r.devCost * 2) push(true, { text: `Paid for itself ${Math.floor(r.net / r.devCost)} times over`, weight: 0.3 });
  else if (profit >= 0 && r.devCost > 0 && r.active && r.week < 26) push(true, { text: 'Already earned back its budget', weight: 0.15 });
  else if (profit < 0 && settled) push(false, { text: 'It lost money', lesson: r.hypeAtLaunch < 0.3 ? 'Market it before launch so people know it’s coming' : 'Keep the budget in line with what the game can earn', weight: 0.25 });
  if (r.hypeAtLaunch >= 1) push(true, { text: 'Launch hype was huge', weight: 0.12 });
  else if (r.hypeAtLaunch < 0.15 && !r.shadowDrop && !r.concept.expansionOf) push(false, { text: 'Few people knew it was coming', lesson: 'Announce it and run some marketing before launch', weight: 0.1 });
  if (r.crowdfund && r.crowdfund.late > 0) push(false, { text: `Backers waited ${Math.ceil(r.crowdfund.late / 30)} month(s) longer than promised`, lesson: 'Promise backers a date you can keep', weight: 0.1 });
  if (r.numberOne) push(true, { text: 'It topped the sales chart', weight: 0.2 });
  if (r.demo && r.demo.score >= 75) push(true, { text: 'The demo won players over before launch', weight: 0.06 });
  else if (r.demo && r.demo.score < 60) push(false, { text: 'The demo put players off', lesson: 'Only release a demo when the game is ready to show', weight: 0.06 });
  const passion = r.passion ? r.credits?.find((c) => c.id === r.passion) : undefined;
  if (passion) push(true, { text: `It was ${passion.name.split(' ')[0]}’s passion project`, weight: 0.07 });
  if (r.awards.length) push(true, { text: `It won ${r.awards.length === 1 ? 'an award' : `${r.awards.length} awards`}`, weight: 0.2 });

  right.sort((a, b) => b.weight - a.weight);
  wrong.sort((a, b) => b.weight - a.weight);
  const score = r.score;
  const ok = profit >= 0;
  const [verdict, tone]: [string, PostMortem['tone']] = !settled
    ? score >= 85 ? ['Acclaimed — and still selling', 'good']
    : score >= 75 ? ['Well received so far', 'good']
    : score >= 60 ? ['A solid start', 'neutral']
    : ['A rough launch', 'bad']
    :
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
