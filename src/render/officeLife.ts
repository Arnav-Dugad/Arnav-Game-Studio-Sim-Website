/**
 * Office life: what staff talk about and do in their free time. Cosmetic only (the renderer may use
 * Math.random freely) but grounded in the real game state, so the chatter reflects your studio: the
 * game you're making, last week's reviews, a rival's new hit, crunch, awards, the new office, the era.
 */
import { fromDay } from '@/sim/calendar';
import { GENRE_BY_ID } from '@/data/genres';
import { hasTrait } from '@/sim/systems/staff';
import { isRainy } from './seasons';
import { hobbyOf } from '@/data/hobbies';
import type { GameState, Staff } from '@/sim/types';

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const first = (name: string) => name.split(' ')[0] ?? name;

/** A short exchange: an opener and a reply (both under ~30 characters so they fit a bubble). */
export type Exchange = [string, string];

const REPLIES_POS = ['Totally!', 'Right?!', 'Ha, yes!', 'Love it.', 'So true.', 'Can’t wait!', 'Same!', '😄'];
const REPLIES_NEG = ['Ugh, I know.', 'Tell me about it.', 'Hang in there.', 'Coffee helps.', '😩', 'One day at a time.'];
const REPLIES_Q = ['Good, actually!', 'Getting there.', 'Ask me Friday.', 'Not bad!', 'Busy busy.', 'Pretty well!'];

/** What two colleagues chat about right now. */
export function chatExchange(s: GameState, a: Staff, b: Staff): Exchange {
  const yr = fromDay(s.day).year;
  const topics: { w: number; make: () => Exchange }[] = [];
  const myProject = a.assignment.kind === 'project' ? s.projects[a.assignment.id] : undefined;
  const theirProject = b.assignment.kind === 'project' ? s.projects[b.assignment.id] : undefined;
  const game = myProject?.kind === 'game' ? myProject : theirProject?.kind === 'game' ? theirProject : undefined;
  const lastRel = s.releaseOrder.length ? s.releases[s.releaseOrder[s.releaseOrder.length - 1]!] : undefined;
  const recent = lastRel && s.day - lastRel.day < 120 ? lastRel : undefined;
  const rivalHit = s.rivalGames.filter((g) => s.day - g.day < 90 && g.score >= 80).sort((x, y) => y.score - x.score)[0];

  // Work
  if (game) {
    const name = game.concept.name;
    topics.push({ w: 3, make: () => [`How’s ${name} going?`, pick(REPLIES_Q)] });
    if (game.crunch) topics.push({ w: 4, make: () => [pick(['Crunch again…', 'Another late night.', 'When does crunch end?']), pick(REPLIES_NEG)] });
    if (game.phase >= 2) topics.push({ w: 2, make: () => [pick(['Polish phase!', `${name} feels great now.`, 'Squashing bugs all day.']), pick(REPLIES_POS)] });
    if (game.bugs > (game.design + game.tech) * 0.08) topics.push({ w: 2, make: () => [pick(['So many bugs…', 'Who broke the build?', 'Found another crash.']), pick(REPLIES_NEG)] });
    topics.push({ w: 1, make: () => [`${GENRE_BY_ID[game.concept.genre].name}s are my thing.`, pick(REPLIES_POS)] });
  }
  // Reviews and the industry
  if (recent) {
    if (recent.score >= 80) topics.push({ w: 4, make: () => [pick([`${recent.score} for ${recent.name}!`, 'Did you see the reviews?!', 'We nailed it!']), pick(REPLIES_POS)] });
    else if (recent.score < 55) topics.push({ w: 3, make: () => [pick([`Ouch, a ${recent.score}…`, 'Those reviews stung.', 'Next one will be better.']), pick(REPLIES_NEG)] });
  }
  if (rivalHit) topics.push({ w: 2, make: () => [`Played ${rivalHit.name.slice(0, 18)}?`, pick(['Not yet!', 'It’s so good.', 'Ours will be better.', 'All weekend!'])] });
  if ((s.awardHistory ?? []).some((y) => y.year === yr - 1 && y.winners.some((w) => w.mine))) topics.push({ w: 3, make: () => ['We won at the Gala!', pick(REPLIES_POS)] });
  // The era
  const era: Exchange[] =
    yr < 1985
      ? [['Arcades are packed.', 'Lines out the door!'], ['8 KB is plenty, right?', 'Ha, barely.']]
      : yr < 1993
        ? [['16-bit is beautiful.', 'Those colours!'], ['Seen the new consoles?', 'Mode 7, wow.']]
        : yr < 2001
          ? [['3D changes everything.', 'Polygons for days.'], ['CD-ROMs hold so much!', 'Full motion video!']]
          : yr < 2008
            ? [['Online play is the future.', 'Lag permitting.'], ['HD is coming.', 'Our art team is ready.']]
            : yr < 2016
              ? [['Phones are game machines now.', 'Everyone plays.'], ['Streamers love our stuff.', 'Free marketing!']]
              : [['VR is wild.', 'Made me dizzy.'], ['Cloud saves saved me.', 'Ha!']];
  topics.push({ w: 1.5, make: () => pick(era) });
  // The season
  const month = fromDay(s.day).month;
  if (month === 12) topics.push({ w: 3, make: () => pick<Exchange>([['Holiday plans?', 'Family. Lots of it.'], ['Love the lights!', 'So festive!'], ['Secret Santa?', 'I got you socks.'], ['Ship before the holidays?', 'Fingers crossed.']]) });
  if (month === 10) topics.push({ w: 3, make: () => pick<Exchange>([['Costume ideas?', 'Going as a bug report.'], ['Pumpkin spice?', 'Always.'], ['Scary game night?', 'I’m in! 👻']]) });
  if (month >= 6 && month <= 8) topics.push({ w: 2, make: () => pick<Exchange>([['So hot today.', 'Bless the AC.'], ['Beach this weekend?', 'Yes please!'], ['Summer sale soon!', 'My wallet weeps.']]) });
  if (month <= 2) topics.push({ w: 2, make: () => pick<Exchange>([['It’s snowing!', 'Snow day?!'], ['New year’s resolution?', 'Fewer bugs.'], ['So cold out.', 'Cocoa time.']]) });
  if (isRainy(s.day, month)) topics.push({ w: 3, make: () => pick<Exchange>([['It’s pouring out there.', 'Forgot my umbrella…'], ['Rainy day = crunch day?', 'Don’t jinx it.'], ['Listen to that rain.', 'So cosy.']]) });
  if (month >= 3 && month <= 5) topics.push({ w: 1.5, make: () => pick<Exchange>([['Spring at last!', 'Finally!'], ['Allergies…', 'Achoo!']]) });
  // Studio life
  if (s.office.tier >= 3) topics.push({ w: 1, make: () => ['This office is so nice.', pick(REPLIES_POS)] });
  topics.push({ w: 2, make: () => pick<Exchange>([['Coffee?', 'Always.'], ['Lunch at the usual?', 'Yes please.'], ['Weekend plans?', 'Sleeping in.'], ['Seen my stapler?', 'Nope!'], ['Nice shirt!', 'Thanks!'], [`Morning, ${first(b.name)}!`, 'Morning!']]) });
  // Personalities and mood
  if (a.morale < 40) topics.push({ w: 3, make: () => [pick(['I need a vacation.', 'Rough week.', 'So tired…']), pick(REPLIES_NEG)] });
  if (a.morale > 80) topics.push({ w: 2, make: () => [pick(['Best job ever.', 'Love this team!', 'Great day today.']), pick(REPLIES_POS)] });
  if (hasTrait(a, 'workaholic')) topics.push({ w: 2, make: () => ['Just one more bug…', 'Go home already!'] });
  if (hasTrait(a, 'hothead')) topics.push({ w: 2, make: () => ['Who keeps moving my chair?!', 'Deep breaths…'] });
  if (hasTrait(a, 'social_butterfly')) topics.push({ w: 2, make: () => ['Drinks on Friday?', 'I’m in!'] });
  if (hasTrait(a, 'introvert')) topics.push({ w: 2, make: () => ['…hi.', 'Hi! 😊'] });
  if (hasTrait(a, 'coffee_fiend')) topics.push({ w: 2, make: () => ['Third coffee today.', 'Only third?'] });
  if (hasTrait(a, 'visionary')) topics.push({ w: 2, make: () => ['I had an idea…', 'Tell me more!'] });
  if (hasTrait(a, 'mentor') && b.level === 'junior') topics.push({ w: 3, make: () => ['Want a tip?', 'Yes please!'] });
  if (a.personId) topics.push({ w: 2, make: () => ['Back in my day…', 'Here we go 😄'] });
  // hobbies (and the odd shared one)
  const ha = hobbyOf(a.id);
  topics.push({ w: 2.2, make: () => pick(ha.chat) });
  if (hobbyOf(b.id).id === ha.id) topics.push({ w: 2, make: () => [`You’re into ${ha.name.toLowerCase()} too?`, `Since forever! ${ha.emoji}`] });
  const total = topics.reduce((t, x) => t + x.w, 0);
  let r = Math.random() * total;
  for (const tp of topics) {
    r -= tp.w;
    if (r <= 0) return tp.make();
  }
  return topics[0]!.make();
}

/** A quick work chat when someone visits a teammate's desk. */
export function workExchange(a: Staff, b: Staff): Exchange {
  if ((a.level === 'senior' || a.level === 'lead') && (b.level === 'junior' || b.level === 'mid')) return pick<Exchange>([['Try it this way…', 'Oh, nice!'], ['Looking good!', 'Thanks!'], ['Need a hand?', 'Yes please.'], ['Ship it!', '🎉']]);
  return pick<Exchange>([['Got a sec?', 'Sure!'], ['Can you review this?', 'On it.'], ['Is this a bug?', 'Feature!'], ['Sync later?', 'Sounds good.'], ['Love that level.', 'Thank you!']]);
}

/** Thought glyphs while working at a desk, by role. */
export function workThought(st: Staff, buggy: boolean): string {
  if (hasTrait(st, 'hothead') && buggy && Math.random() < 0.5) return pick(['😤', '💢']);
  if (hasTrait(st, 'visionary') && Math.random() < 0.35) return pick(['💡', '✨', '🌟']);
  if (hasTrait(st, 'perfectionist') && Math.random() < 0.3) return pick(['🔍', '📐', '🧐']);
  switch (st.role) {
    case 'designer':
      return pick(['💡', '✏️', '🎲']);
    case 'programmer':
      return buggy && Math.random() < 0.5 ? '🐛' : pick(['⌨️', '💡', '{ }']);
    case 'artist':
      return pick(['🎨', '🖌️', '✨']);
    case 'audio':
      return pick(['🎵', '🎧', '🎶']);
    case 'writer':
      return pick(['✍️', '📖', '💬']);
    case 'qa':
      return pick(['🔍', '🐛', '✅']);
    case 'producer':
      return pick(['📋', '📅', '📈']);
    case 'marketer':
      return pick(['📣', '📈', '💬']);
    default:
      return pick(['💡', '📋', '☕']);
  }
}

/** Things to do on a break, by item; the glyph shows while they're there. */
export const LEISURE: Record<string, { glyph: string; secs: [number, number] }> = {
  arcade_cabinet: { glyph: '🎮', secs: [5, 9] },
  pinball: { glyph: '🕹️', secs: [4, 8] },
  ping_pong: { glyph: '🏓', secs: [5, 9] },
  lounge_sofa: { glyph: '😌', secs: [5, 10] },
  bean_bag: { glyph: '😴', secs: [5, 10] },
  bookshelf: { glyph: '📖', secs: [4, 8] },
  aquarium: { glyph: '🐠', secs: [3, 6] },
  game_library: { glyph: '🎮', secs: [4, 8] },
  console_museum: { glyph: '👀', secs: [3, 6] },
  bonsai: { glyph: '✂️', secs: [3, 5] },
  zen_corner: { glyph: '🧘', secs: [5, 9] },
  screening_room: { glyph: '🍿', secs: [6, 10] },
  fan_wall: { glyph: '🖍️', secs: [3, 5] },
  plant_large: { glyph: '🌿', secs: [2, 4] },
  foosball: { glyph: '⚽', secs: [5, 9] },
  gym: { glyph: '🏋️', secs: [6, 10] },
  hammock: { glyph: '😴', secs: [6, 11] },
  karaoke: { glyph: '🎤', secs: [5, 9] },
  claw_machine: { glyph: '🧸', secs: [3, 6] },
  guitar_corner: { glyph: '🎸', secs: [5, 9] },
  globe: { glyph: '🌍', secs: [2, 4] },
  mascot_statue: { glyph: '📸', secs: [2, 4] },
};

/** Places researchers think at. */
export const RESEARCH_SPOTS = new Set(['whiteboard', 'rnd_bench', 'bookshelf']);
