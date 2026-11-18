/**
 * Fan mail: players write in about the games they love — thank-you letters, funny stories, sequel requests,
 * gentle complaints — and kids send crayon drawings. Good games get more mail (great ones a lot). Each piece
 * lifts the morale of the people who made that game; drawings can be pinned to a Fan Art Wall in the office.
 */
import { FIRST_NAMES } from '../../data/names';
import { GENRE_BY_ID } from '../../data/genres';
import { TOPIC_BY_ID } from '../../data/topics';
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { FanMail, GameState, Release } from '../types';
import type { Rng } from '../rng';

export const FAN_MAIL_KEEP = 40;
export const MAX_PINNED = 8;
const MAX_PER_MONTH = 2;

function firstName(rng: Rng): string {
  return rng.pick(FIRST_NAMES as readonly string[]);
}

function letterText(s: GameState, rng: Rng, rel: Release): string {
  const g = rel.name;
  const genre = GENRE_BY_ID[rel.concept.genre]?.name.toLowerCase() ?? 'game';
  const topic = TOPIC_BY_ID[rel.concept.topic]?.name.toLowerCase() ?? 'world';
  const yr = fromDay(s.day).year;
  const fr = rel.concept.franchiseId ? s.franchises[rel.concept.franchiseId] : undefined;
  const isLatest = !fr || fr.entries[fr.entries.length - 1] === rel.id;
  const pool: string[] = [
    `I played ${g} every day after school. Thank you for making it!`,
    `${g} got me through a really hard year. I just wanted you to know.`,
    `My dad and I finished ${g} together. Best weekend ever.`,
    `I’ve played a lot of ${genre} games and ${g} is my favourite. Please never stop.`,
    `My cat sits on the keyboard whenever I play ${g}. She has beaten the first level.`,
    `I named my goldfish after a character in ${g}. He is doing well.`,
    `I want to make games like ${g} when I grow up. How do I start?`,
    `My grandma plays ${g} now. She is better than me. Please help.`,
    `I love the ${topic} in ${g}. I read three books about it afterwards!`,
    `Me and my best friend play ${g} on Saturdays. We made up our own rules too.`,
  ];
  if (isLatest && rel.score >= 80) pool.push(`PLEASE make ${g} 2!!! I will buy it on day one.`, `Is there going to be a sequel to ${g}? Asking for my whole class.`);
  if (rel.score < 85) pool.push(`I love ${g}, but the ending was too short. Make it longer next time?`, `${g} is great but level 3 is SO hard. I have been stuck for a month.`);
  if (rel.bugs > 20) pool.push(`I found a bug in ${g} where you can walk through a wall. I think it’s a secret. Is it a secret?`);
  if (rel.awards.length) pool.push(`I saw ${g} win ${rel.awards[0]}. I knew it would!`);
  if (yr < 1995) pool.push(`I am sending this by post with a real stamp. ${g} is the best game I own.`);
  else if (yr < 2008) pool.push(`I printed this email to send it. ${g} is awesome and my mum says I play it too much.`);
  else pool.push(`I posted this on the forums too, but I wanted you to have it. ${g} means a lot to me.`, `I’ve watched every speedrun of ${g}. The community loves you.`);
  return rng.pick(pool);
}

function artCaption(rng: Rng, rel: Release): string {
  const g = rel.name;
  return rng.pick([`I ♥ ${g}!`, `${g} is the BEST`, `This is me playing ${g}`, `My favourite part of ${g}`, `${g}!!!`, `For the ${g} team`]);
}

/** Monthly: mail arrives for well-loved games from the last five years. */
export function fanMailMonthly(c: Ctx): void {
  const { s, rng } = c;
  let sent = 0;
  const recent = s.releaseOrder
    .slice(-30)
    .map((id) => s.releases[id]!)
    .filter((r) => r && r.score >= 72 && s.day - r.day < 365 * 5 && !r.concept.expansionOf);
  for (const rel of rng.shuffle([...recent])) {
    if (sent >= MAX_PER_MONTH) break;
    const reach = Math.log10(1 + rel.units) / 60; // more players, more letters
    const p = clamp(0.04 + (rel.score - 72) / 90 + reach, 0, 0.45) * (s.day - rel.day < 365 ? 1 : 0.5);
    if (!rng.chance(p)) continue;
    sent++;
    const art = rng.chance(0.4);
    const mail: FanMail = {
      id: `m${s.day}_${sent}`,
      day: s.day,
      releaseId: rel.id,
      game: rel.name,
      topic: rel.concept.topic,
      genre: rel.concept.genre,
      from: firstName(rng),
      ...(art ? { age: 5 + Math.floor(rng.next() * 8) } : rng.chance(0.5) ? { age: 9 + Math.floor(rng.next() * 50) } : {}),
      kind: art ? 'art' : 'letter',
      text: art ? artCaption(rng, rel) : letterText(s, rng, rel),
      seed: Math.floor(rng.next() * 1e9),
    };
    const box = (s.fanMail ??= []);
    box.push(mail);
    // keep the newest (and everything pinned)
    while (box.length > FAN_MAIL_KEEP) {
      const i = box.findIndex((m) => !m.pinned);
      if (i < 0) break;
      box.splice(i, 1);
    }
    s.progress.stats.fanMail = (s.progress.stats.fanMail ?? 0) + 1;
    // the people who made it get a lift
    for (const cr of rel.credits ?? []) {
      const st = s.staff[cr.id];
      if (st) st.morale = clamp(st.morale + 2, 0, 100);
    }
    c.out.push({ type: 'toast', text: art ? `📬 ${mail.from} sent a drawing of ${rel.name}` : `📬 Fan mail about ${rel.name}`, tone: 'good' });
  }
}

export function pinnedArt(s: GameState): FanMail[] {
  return (s.fanMail ?? []).filter((m) => m.pinned && m.kind === 'art');
}

export function pinFanArt(s: GameState, id: string, on: boolean): string | null {
  const m = (s.fanMail ?? []).find((x) => x.id === id);
  if (!m) return 'No such letter';
  if (m.kind !== 'art') return 'Only drawings go on the wall';
  if (on && !m.pinned && pinnedArt(s).length >= MAX_PINNED) return `The wall holds ${MAX_PINNED} drawings — unpin one first`;
  if (on && !s.office.items.some((i) => i.item === 'fan_wall')) return 'Build a Fan Art Wall first (Office → Edit layout → Decor)';
  m.pinned = on || undefined;
  return null;
}

export function unreadFanMail(s: GameState): number {
  return (s.fanMail ?? []).filter((m) => !m.read).length;
}
