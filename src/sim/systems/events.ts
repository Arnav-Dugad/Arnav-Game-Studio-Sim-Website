/**
 * Random choice events. Each event's weight depends on game state, so events react to the systems
 * (crunch → incidents, fame → journalists, low cash → predatory loans…).
 */
import { MOD_BUY, MOD_FEATURE, MOD_HIRE, breakoutCandidate, modBuyScore, modRevival, modTopic, rollMod } from './mods';
import { TOPIC_BY_ID } from '../../data/topics';
import { GENRE_BY_ID } from '../../data/genres';
import { EGGS } from './easterEggs';
import { platformInfo } from './market';
import { gameRegions } from '../../data/regions';
import type { GenreId } from '../../data/types';
import { PITCH_DAYS, makePitch, pitchers, pitchText } from './pitches';
import { LICENCE_YEARS, delist, licenceDecisionDue, licensedParts, renewalCost } from './licences';
import { docEligible } from './documentary';
import { communityNudge } from './community';
import { hireIntern, starIntern } from './interns';
import { campaignGoal, crowdfundBlocked, startCrowdfund } from './crowdfunding';
import { BALANCE } from '../../data/balance';
import { pairKey, worstFeud } from './relations';
import { COMPANY_BY_ID } from '../../data/companies';
import { clamp } from '../breakdown';
import { fromDay, toDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { EventInstance, EventOption, Franchise, GameProject, GameState, Staff } from '../types';
import { addRep, aOrAn, earn, fmtMoney, hasFlag, money, newId, pushNews, spend } from '../util';
import { ownerValue } from './finance';
import { ROLE_NAMES, ROLE_SKILLS, candidateToStaff, generateCandidate, marketSalary, maybeSpinOff, rememberLeaver, removeStaff } from './staff';
import { assignDesks, freeDesks, tierDef } from './office';

interface EventDef {
  id: string;
  art: string;
  cooldown: number; // days
  weight: (s: GameState) => number;
  make: (c: Ctx) => { title: string; body: string; options: EventOption[]; ctx: Record<string, string | number> } | null;
  resolve: (c: Ctx, e: EventInstance, option: string) => void;
}

const staffList = (s: GameState) => Object.values(s.staff).filter((x) => x.role !== 'founder');
const activeGames = (s: GameState) => Object.values(s.projects).filter((p): p is GameProject => p.kind === 'game');
const anyCrunch = (s: GameState) => activeGames(s).some((p) => p.crunch);
const yr = (s: GameState) => fromDay(s.day).year;
const liveHw = (s: GameState) => (s.hardware ?? []).filter((h) => h.status === 'live');
const bigFranchise = (s: GameState) =>
  Object.values(s.franchises)
    .filter((f) => f.fans >= 1_000_000 && f.bestScore >= 80)
    .sort((a, b) => b.fans - a.fans)[0];
const retroClassics = (s: GameState) =>
  s.releaseOrder
    .map((id) => s.releases[id]!)
    .filter((r) => r && s.day - r.day > 20 * 365 && r.score >= 75 && !r.concept.remasterOf)
    .sort((a, b) => b.score - a.score);
/** Your best release from the last `days` days scoring at least `min` (not expansions or remasters). */
const recentHit = (s: GameState, days: number, min: number) =>
  Object.values(s.releases)
    .filter((r) => s.day - r.day <= days && r.score >= min && !r.concept.expansionOf && !r.concept.remasterOf)
    .sort((a, b) => b.score - a.score)[0];
/** A beloved game at least three years old. */
const oldClassic = (s: GameState) =>
  Object.values(s.releases)
    .filter((r) => !r.delisted && s.day - r.day >= 3 * 365 && r.score >= 75)
    .sort((a, b) => b.units - a.units)[0];
/** A warning for delays when a publisher or backers are waiting on a date. */
/** Your best recent game in a genre (within `years`), if it scored at least `min`. */
const genreHit = (s: GameState, genre: string, min: number, years: number) =>
  Object.values(s.releases)
    .filter((r) => !r.delisted && r.concept.genre === genre && r.score >= min && s.day - r.day < 365 * years && !r.concept.expansionOf)
    .sort((a, b) => b.score - a.score)[0];
/** A loved visual novel that was never translated for players in North America or Europe. */
const untranslatedNovel = (s: GameState) =>
  Object.values(s.releases).find((r) => {
    if (r.delisted || r.concept.genre !== 'visual_novel' || r.score < 70 || r.fanTranslated || s.day - r.day >= 365 * 6) return false;
    const reached = new Set([s.company.homeRegion ?? 'na', ...gameRegions(r.concept, s.company.branches ?? [])]);
    return !reached.has('na') && !reached.has('eu');
  });
/** A buggy console game in polish that hasn't been through certification yet. */
const certRisk = (s: GameState) =>
  activeGames(s).find((p) => p.phase >= 2 && !p.certified && p.bugs > 0.08 * (p.design + p.tech) && p.concept.platforms.some((id) => { const pl = platformInfo(s, id); return !!pl && pl.maker !== 'player' && (pl.kind === 'console' || pl.kind === 'handheld'); }));
/** A recent, loved game whose players haven't asked for accessibility options yet (and that didn't ship with them). */
const accessibilityCandidate = (s: GameState) =>
  Object.values(s.releases).find((r) => !r.delisted && !r.accessibilityAsked && r.score >= 70 && s.day - r.day < 365 * 2 && !(r.concept.features ?? []).includes('accessibility'));
const isAwayStaff = (x: Staff) => x.sickDays > 0 || (x.vacationDays ?? 0) > 0;
/** Series with at least two games, most-loved first. */
const votableSeries = (s: GameState) =>
  Object.values(s.franchises)
    .filter((f) => f.entries.length >= 2 && f.fans > 1000 && !Object.values(s.projects).some((p) => p.kind === 'game' && p.concept.franchiseId === f.id))
    .sort((a, b) => b.fans - a.fans);
const lateNote = (p: GameProject) => (p.concept.deal ? ' — may miss the publisher’s deadline' : p.crowdfund?.promised !== undefined ? ' — backers were promised a date' : '');
const mod = (s: GameState, v: number, days: number, label: string) => s.company.moraleMods.push({ v, until: s.day + days, label });

function staffById(s: GameState, id: string | number | undefined): Staff | undefined {
  return id === undefined ? undefined : s.staff[String(id)];
}

/** Loyalty below which a rival's offer tempts someone (higher right after a standing ovation). */
const poachLoyalty = (s: GameState, x: Staff) => (x.spotlightUntil !== undefined && s.day < x.spotlightUntil ? 80 : 60);

export const EVENT_DEFS: EventDef[] = [
  {
    id: 'union_drive',
    art: 'crowd',
    cooldown: 365,
    weight: (s) => {
      const l = staffList(s);
      if (s.company.union || yr(s) < 2005 || l.length < 15) return 0;
      const avg = l.reduce((t, x) => t + x.morale, 0) / l.length;
      const crunching = s.day - s.progress.stats.noCrunchSince < 30 && (s.progress.stats.crunchRecent ?? 0) >= 35;
      return crunching && avg < 52 ? (yr(s) >= 2018 ? 1.2 : 0.6) : 0;
    },
    make: ({ s }) => {
      const payroll = staffList(s).reduce((t, x) => t + x.salary, 0) / 12;
      return {
        title: 'The team wants a union',
        body: 'After months of crunch, a majority of your staff have signed union cards. They’re asking you to recognise the union voluntarily.',
        options: [
          { id: 'fight', label: 'Fight it', preview: 'Reputation −3, morale −8 for 4 months, and maybe a walkout' },
          { id: 'recognise', label: 'Recognise the union', preview: 'Everyone +5% pay; morale +4 for good; crunch hurts morale half as much' },
          { id: 'bonus', label: `Offer a retention bonus instead (${fmtMoney(payroll / 2)})`, preview: 'Morale +6 for 3 months; they may try again next year', cost: payroll / 2 },
          { id: 'stall', label: 'Ask for time to think', preview: 'Morale −3 for a month; they’ll ask again' },
        ],
        ctx: { payroll },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      if (opt === 'recognise') {
        s.company.union = true;
        for (const st of staffList(s)) st.salary = Math.round(st.salary * 1.05);
        for (const st of Object.values(s.staff)) st.moraleWhy = undefined;
        pushNews(s, { category: 'studio', headline: `${s.company.name} recognises its workers’ union`, tone: 'good' });
      } else if (opt === 'bonus' && s.company.cash >= Number(e.ctx.payroll) / 2) {
        spend(s, 'salaries', Number(e.ctx.payroll) / 2);
        mod(s, 6, 90, 'Retention bonus');
      } else if (opt === 'bonus' || opt === 'stall') {
        mod(s, -3, 30, 'Union talks stalled');
      } else if (opt === 'fight') {
        addRep(s, -3, 'Fought a union drive');
        mod(s, -8, 120, 'Union busting');
        if (rng.chance(0.35)) {
          mod(s, -10, 30, 'Walkout');
          for (const st of staffList(s)) st.energy = clamp(st.energy - 30, 0, 100);
          pushNews(s, { category: 'studio', headline: `${s.company.name} staff stage a walkout`, tone: 'bad' });
        }
      }
    },
  },
  {
    id: 'heat_wave',
    art: 'smoke',
    cooldown: 300,
    weight: (s) => {
      const m = fromDay(s.day).month;
      return m >= 6 && m <= 8 && staffList(s).length >= 3 ? 0.5 : 0;
    },
    make: ({ s }) => {
      const cost = money(250, s.day) * Math.max(4, Object.keys(s.staff).length) ** 0.8;
      return {
        title: 'Heat wave!',
        body: 'It’s 38°C outside and the old air conditioning has given up. Keyboards are sticky, tempers are short.',
        options: [
          { id: 'ac', label: `Install proper air conditioning (${fmtMoney(cost)})`, preview: 'Problem solved; morale +2 for a month', cost: cost },
          { id: 'icecream', label: `Ice cream for everyone (${fmtMoney(cost / 6)})`, preview: 'Morale holds; energy dips this week' },
          { id: 'tough', label: 'Tough it out', preview: 'Morale −6 for a month' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const cost = Number(e.ctx.cost);
      if (opt === 'ac' && s.company.cash >= cost) {
        spend(s, 'office', cost);
        mod(s, 2, 30, 'New air conditioning');
        s.eventCooldowns.heat_wave = s.day + 365 * 200; // proper AC: no more heat waves
      } else if (opt === 'icecream' || opt === 'ac') {
        spend(s, 'other_expense', cost / 6);
        for (const st of Object.values(s.staff)) st.energy = clamp(st.energy - 10, 0, 100);
      } else mod(s, -6, 30, 'Heat wave');
    },
  },
  {
    id: 'power_outage',
    art: 'smoke',
    cooldown: 400,
    weight: (s) => (staffList(s).length >= 2 ? 0.25 + Math.min(0.5, s.office.items.filter((i) => i.item === 'server_rack').length * 0.1) : 0),
    make: ({ s }) => {
      const ups = money(4_000, s.day);
      return {
        title: 'Power cut',
        body: 'The whole block has lost power. Unsaved work is gone, and anything online is down until it’s back.',
        options: [
          { id: 'ups', label: `Buy backup power for next time (${fmtMoney(ups)})`, preview: 'Lose today; never again', cost: ups },
          { id: 'wait', label: 'Send everyone home early', preview: 'Energy +10, a little progress lost' },
        ],
        ctx: { ups },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt === 'ups' && s.company.cash >= Number(e.ctx.ups)) {
        spend(s, 'office', Number(e.ctx.ups));
        s.eventCooldowns.power_outage = s.day + 365 * 200; // backup power: no more blackouts
      }
      for (const p of activeGames(s)) p.bugs += 2;
      if (opt === 'wait') for (const st of Object.values(s.staff)) st.energy = clamp(st.energy + 10, 0, 100);
      if (opt !== 'ups' && s.office.items.some((i) => i.item === 'server_rack')) addRep(s, -1, 'Servers went down in a power cut');
    },
  },
  {
    id: 'charity_marathon',
    art: 'heart',
    cooldown: 600,
    weight: (s) => (yr(s) >= 2010 && s.releaseOrder.length >= 3 ? 0.4 : 0),
    make: ({ s }) => {
      const gift = money(20_000, s.day);
      return {
        title: 'Charity gaming marathon',
        body: 'A big charity speedrun marathon wants to feature your games for a week — and asks if you’ll match donations.',
        options: [
          { id: 'match', label: `Match donations (${fmtMoney(gift)})`, preview: 'Reputation +3, fans +, morale +3', cost: gift },
          { id: 'feature', label: 'Let them feature the games', preview: 'Fans + (a little)' },
          { id: 'no', label: 'Not this year', preview: 'Nothing happens' },
        ],
        ctx: { gift },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt === 'match' && s.company.cash >= Number(e.ctx.gift)) {
        spend(s, 'other_expense', Number(e.ctx.gift));
        addRep(s, 3, 'Charity marathon');
        s.company.fans += 20_000;
        mod(s, 3, 45, 'Proud of the charity marathon');
        pushNews(s, { category: 'studio', headline: `${s.company.name} matches charity marathon donations`, tone: 'good' });
      } else if (opt === 'feature') s.company.fans += 6_000;
    },
  },
  {
    id: 'celebrity_fan',
    art: 'megaphone',
    cooldown: 500,
    weight: (s) => (s.releaseOrder.some((id) => (s.releases[id]?.score ?? 0) >= 85) ? 0.35 : 0),
    make: ({ s, rng }) => {
      const hits = s.releaseOrder.map((id) => s.releases[id]!).filter((r) => r.score >= 85);
      if (!hits.length) return null;
      const r = rng.pick(hits);
      const who = rng.pick(['a chart-topping pop star', 'an Oscar-winning actor', 'a star footballer', 'a famous chef', 'a late-night talk-show host']);
      return {
        title: 'A celebrity superfan',
        body: `${who[0]!.toUpperCase()}${who.slice(1)} just told millions of people that ${r.name} is their favourite game of all time.`,
        options: [
          { id: 'invite', label: 'Invite them to the studio', preview: 'Hype for your next game, morale +4' },
          { id: 'thanks', label: 'Send a signed copy and a thank-you', preview: 'Fans + for the series' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (opt === 'invite') {
        for (const p of activeGames(s)) p.hype = Math.max(p.hype, Math.min(BALANCE.HYPE_MAX, p.hype + 0.25));
        mod(s, 4, 30, 'A celebrity visited');
      } else if (r?.concept.franchiseId && s.franchises[r.concept.franchiseId]) s.franchises[r.concept.franchiseId]!.fans += Math.round(r.units * 0.05);
      else s.company.fans += 10_000;
    },
  },
  {
    id: 'cat_vs_server',
    art: 'smoke',
    cooldown: 400,
    weight: (s) => (s.office.items.some((i) => i.item === 'pet_cat') && s.office.items.some((i) => i.item === 'server_rack') ? 0.5 : 0),
    make: ({ s }) => {
      const cost = money(3_000, s.day);
      return {
        title: 'The cat vs. the server rack',
        body: 'The studio cat discovered that the server rack is warm, and knocked a coffee into it on the way up. The online games are flickering.',
        options: [
          { id: 'fix', label: `Emergency repair (${fmtMoney(cost)})`, preview: 'Back online today', cost: cost },
          { id: 'shelf', label: 'Build the cat its own warm shelf', preview: `${fmtMoney(cost / 2)}; morale +3 (everyone loves it)` },
          { id: 'wait', label: 'Let it dry out', preview: 'Players grumble: reputation −2' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const cost = Number(e.ctx.cost);
      if (opt === 'fix') spend(s, 'other_expense', cost);
      else if (opt === 'shelf') {
        spend(s, 'other_expense', cost / 2);
        mod(s, 3, 45, 'The cat shelf');
      } else addRep(s, -2, 'Servers down (cat-related)');
    },
  },
  {
    id: 'translation_slip',
    art: 'letters',
    cooldown: 500,
    weight: (s) => (s.releaseOrder.slice(-3).some((id) => (s.releases[id]?.concept.localized?.length ?? 0) > 0 && s.day - s.releases[id]!.day < 120) ? 0.7 : 0),
    make: ({ s }) => {
      const rel = s.releaseOrder.slice(-3).map((id) => s.releases[id]!).find((r) => (r.concept.localized?.length ?? 0) > 0);
      if (!rel) return null;
      return {
        title: 'A translation slip goes viral',
        body: `A wonderfully garbled line in the translated version of ${rel.name} has become a meme. Players are quoting it everywhere.`,
        options: [
          { id: 'embrace', label: 'Embrace it: print it on T-shirts', preview: 'Fans and hype up; a little less serious' },
          { id: 'patch', label: `Patch the translation (${fmtMoney(money(4_000, s.day))})`, preview: 'User score +1, the moment passes', cost: money(4_000, s.day) },
        ],
        ctx: { rel: rel.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const rel = s.releases[String(e.ctx.rel)];
      if (!rel) return;
      if (opt === 'embrace') {
        s.company.fans += Math.round(rel.units * 0.02);
        const fr = rel.concept.franchiseId ? s.franchises[rel.concept.franchiseId] : undefined;
        if (fr) fr.fans += Math.round(rel.units * 0.03);
        pushNews(s, { category: 'studio', headline: `${s.company.name} sells T-shirts of its own typo`, tone: 'good' });
      } else {
        spend(s, 'other_expense', money(4_000, e.day));
        rel.userScore = clamp(rel.userScore + 1, 0, 100);
      }
    },
  },
  {
    id: 'dream_offer',
    art: 'briefcase',
    cooldown: 200,
    weight: (s) => (staffList(s).some((x) => x.ambition && x.ambition.kind !== 'holiday') ? 0.6 : 0),
    make: ({ s, rng }) => {
      const who = staffList(s).filter((x) => x.ambition && x.ambition.kind !== 'holiday');
      if (!who.length) return null;
      const st = rng.pick(who);
      const rivals = Object.values(s.rivals).filter((x) => x.alive && !x.ownedByPlayer);
      if (!rivals.length) return null;
      const r = rng.pick(rivals);
      const raise = Math.round(st.salary * 0.15);
      return {
        title: 'A rival offers a dream',
        body: `${r.name} has offered ${st.name} exactly what they’ve been wanting — and a bigger salary.`,
        options: [
          { id: 'match', label: `Match it: +${fmtMoney(raise)}/yr and a promise`, preview: 'They stay, loyalty +10' },
          { id: 'talk', label: 'Remind them why they’re here', preview: 'Depends on their loyalty' },
          { id: 'let', label: 'Wish them well', preview: 'They leave for the rival' },
        ],
        ctx: { st: st.id, rival: r.id, raise },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const st = staffById(s, e.ctx.st);
      if (!st) return;
      const leave = () => {
        removeStaff(s, st.id);
        s.progress.stats.staffLost += 1;
        pushNews(s, { category: 'staff', headline: `${st.name} joins ${s.rivals[String(e.ctx.rival)]?.name ?? 'a rival'}`, tone: 'bad' });
      };
      if (opt === 'match') {
        st.salary += Number(e.ctx.raise);
        st.loyalty = clamp(st.loyalty + 10, 0, 100);
        st.promise = { salary: st.salary, until: s.day + 365 };
      } else if (opt === 'talk') {
        if (!rng.chance(clamp(st.loyalty / 100, 0.15, 0.9))) leave();
        else st.loyalty = clamp(st.loyalty - 5, 0, 100);
      } else leave();
    },
  },
  {
    id: 'best_places',
    art: 'trophy',
    cooldown: 700,
    weight: (s) => {
      const l = staffList(s);
      if (l.length < 8 || !(s.company.values ?? []).length) return 0;
      const avg = l.reduce((t, x) => t + x.morale, 0) / l.length;
      return avg > 72 ? 0.8 : 0;
    },
    make: ({ s }) => ({
      title: 'Best Places to Work',
      body: `${s.company.name} has been shortlisted as one of the industry’s best places to work. A magazine wants a photo shoot and interviews.`,
      options: [
        { id: 'yes', label: 'Open the doors', preview: 'Reputation +4' },
        { id: 'no', label: 'Keep our heads down', preview: 'Nothing changes' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt !== 'yes') return;
      addRep(s, 4, 'Best Places to Work');
      pushNews(s, { category: 'studio', headline: `${s.company.name} named one of the best places to work in games`, tone: 'good' });
    },
  },
  {
    // A feud between colleagues (raised when a relationship sours past the feud line; never rolled at random).
    id: 'feud',
    art: 'conflict',
    cooldown: 60,
    weight: () => 0,
    make: ({ s }) => {
      const f = worstFeud(s);
      if (!f) return null;
      const cost = money(2_000, s.day);
      const together = f.a.assignment.kind === 'project' && f.b.assignment.kind === 'project' && f.a.assignment.id === f.b.assignment.id;
      const shared = together && f.a.assignment.kind === 'project' ? f.a.assignment.id : '';
      return {
        title: 'A feud in the team',
        body: `${f.a.name} and ${f.b.name} can’t stand each other any more. ${together ? 'They’re on the same project, and the whole team feels it.' : 'It’s poisoning the mood.'}`,
        options: [
          { id: 'mediate', label: `Bring in a mediator (${fmtMoney(cost)})`, preview: 'They make peace: the relationship recovers a lot', cost: cost },
          { id: 'split', label: `Split them up (${f.b.name.split(' ')[0]} leaves the project)`, preview: together ? 'The team calms down; the project loses a person' : 'Not on the same project', disabled: !together },
          { id: 'ignore', label: 'Let them work it out', preview: 'Both morale −8; it may get worse — or one may quit' },
        ],
        ctx: { a: f.a.id, b: f.b.id, cost, project: shared },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const a = staffById(s, e.ctx.a);
      const b = staffById(s, e.ctx.b);
      if (!a || !b) return;
      const k = pairKey(a.id, b.id);
      const rel = (s.relations ??= {});
      if (opt === 'mediate') {
        spend(s, 'other_expense', Number(e.ctx.cost));
        rel[k] = Math.max(rel[k] ?? 0, 0) + 10;
        pushNews(s, { category: 'staff', headline: `${a.name} and ${b.name} make peace`, tone: 'good' });
      } else if (opt === 'split') {
        const p = s.projects[String(e.ctx.project)];
        // only if they still share that project and it keeps someone on it
        if (p && p.team.includes(a.id) && p.team.includes(b.id) && p.team.length > 1) {
          p.team = p.team.filter((x) => x !== b.id);
          b.assignment = { kind: 'idle' };
        }
        rel[k] = (rel[k] ?? 0) + 15;
      } else {
        for (const x of [a, b]) x.morale = clamp(x.morale - 8, 0, 100);
        rel[k] = clamp((rel[k] ?? 0) - 10, -100, 100);
        const quitter = a.traits.includes('hothead') ? a : b;
        if (quitter.role !== 'founder' && rng.chance(0.12)) {
          maybeSpinOff(s, rng, quitter, 0.3);
          removeStaff(s, quitter.id);
          s.progress.stats.staffLost += 1;
          pushNews(s, { category: 'staff', headline: `${quitter.name} quits over a feud`, tone: 'bad' });
        }
      }
    },
  },
  {
    // End of the summer internship (fired on September 1; never rolled at random).
    id: 'intern_offer',
    art: 'handshake',
    cooldown: 300,
    weight: () => 0,
    make: ({ s }) => {
      const st = starIntern(s);
      if (!st) return null;
      const salary = Math.round(marketSalary(s, st.skills) * 0.9);
      const [primary] = ROLE_SKILLS[st.role];
      return {
        title: `Hire ${st.name}?`,
        body: `${st.name} was the standout intern this summer — a ${ROLE_NAMES[st.role].toLowerCase()} with ${Math.round(st.skills[primary])} ${primary} and potential ${Math.round(st.potential)}. They’d love to stay.`,
        options: [
          { id: 'hire', label: `Offer a junior role (${fmtMoney(salary)}/yr)`, preview: 'Loyal from day one: loyalty +25' },
          { id: 'go', label: 'Wish them luck at school', preview: 'They go back to their studies' },
        ],
        ctx: { staff: st.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const st = staffById(s, e.ctx.staff);
      if (!st || !st.intern) return;
      if (opt === 'hire') {
        hireIntern(s, st);
        s.progress.stats.internsHired = (s.progress.stats.internsHired ?? 0) + 1;
        pushNews(s, { category: 'staff', headline: `${st.name} joins full-time after their internship`, tone: 'good' });
      } else {
        rememberLeaver(s, st, 'their internship ended');
        removeStaff(s, st.id);
      }
    },
  },
  {
    // Annual shareholder meeting (scheduled each May for public studios; never rolled at random).
    id: 'agm',
    art: 'bell',
    cooldown: 300,
    weight: () => 0,
    make: ({ s }) => {
      const st = s.finance.stock;
      if (!st) return null;
      const yearAgo = st.history.length > 52 ? st.history[st.history.length - 53]! : st.ipoPrice;
      const change = yearAgo > 0 ? st.price / yearAgo - 1 : 0;
      const profit = s.finance.ledger.slice(-13, -1).reduce((t, m) => t + Object.values(m.income).reduce((a, v) => a + (v ?? 0), 0) - Object.values(m.expense).reduce((a, v) => a + (v ?? 0), 0), 0);
      const dividend = Math.max(0, Math.round(profit * 0.25));
      const pct = Math.round(change * 100);
      const control = st.founderShares / st.shares;
      const revolt = st.boardMood < 30 && control < 0.5;
      const recap = `The share price is ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct)}% on the year, with ${fmtMoney(profit)} profit over the last twelve months. Board mood ${Math.round(st.boardMood)}%. You hold ${Math.round(control * 100)}% of the shares.`;
      if (revolt)
        return {
          title: 'Shareholder revolt',
          body: `${recap} Unhappy investors have tabled a vote of no confidence and want a cost-cutting mandate.`,
          options: [
            { id: 'fight', label: 'Fight the vote', preview: `Win chance about ${Math.round(Math.min(90, 25 + control * 80 + s.company.reputation / 4))}%. Win: board mood +15. Lose: share price −12%, reputation −4.` },
            { id: 'concede', label: 'Accept the cost-cutting mandate', preview: 'Board mood +20; staff morale −8 for six months' },
          ],
          ctx: { profit, dividend, control, change, revolt: 1, revenue: 0 },
        };
      return {
        title: `Annual shareholder meeting`,
        body: `${recap} How do you address the shareholders?`,
        options: [
          { id: 'dividend', label: `Declare a dividend (${fmtMoney(dividend)})`, preview: 'A quarter of last year’s profit. Board mood +10, share price +3%', disabled: dividend <= 0 || s.company.cash < dividend * 1.5 },
          { id: 'bold', label: 'Promise bold growth', preview: 'Share price +6%, board mood +6 — but profit expectations rise 30%' },
          { id: 'steady', label: 'Steady as she goes', preview: change >= 0 ? 'Board mood +2' : 'Board mood −6 (they wanted a plan)' },
        ],
        ctx: { profit, dividend, control, change, revolt: 0, revenue: s.finance.ledger.slice(-13, -1).reduce((t, m) => t + Object.values(m.income).reduce((a, v) => a + (v ?? 0), 0), 0) },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const st = s.finance.stock;
      if (!st) return;
      if (opt === 'dividend') {
        const d = Number(e.ctx.dividend);
        if (d > 0 && s.company.cash >= d) {
          s.company.cash -= d;
          st.dividendsPaid += d;
          st.boardMood = clamp(st.boardMood + 10, 0, 100);
          st.price *= 1.03;
          pushNews(s, { category: 'studio', headline: `${s.company.name} pays a ${fmtMoney(d)} dividend`, tone: 'good' });
        }
      } else if (opt === 'bold') {
        // a promise is a promise: even a loss-making studio now owes a quarterly profit
        st.expectation = Math.max(st.expectation * 1.3, Number(e.ctx.revenue ?? 0) * 0.025);
        st.price *= 1.06;
        st.boardMood = clamp(st.boardMood + 6, 0, 100);
        pushNews(s, { category: 'studio', headline: `${s.company.name} promises shareholders bold growth`, tone: 'neutral' });
      } else if (opt === 'steady') {
        st.boardMood = clamp(st.boardMood + (Number(e.ctx.change) >= 0 ? 2 : -6), 0, 100);
      } else if (opt === 'fight') {
        const win = rng.chance(Math.min(0.9, 0.25 + Number(e.ctx.control) * 0.8 + s.company.reputation / 400));
        if (win) {
          st.boardMood = clamp(st.boardMood + 15, 0, 100);
          pushNews(s, { category: 'studio', headline: `${s.company.founderName} survives a no-confidence vote`, tone: 'good' });
        } else {
          st.price *= 0.88;
          addRep(s, -4, 'Lost a shareholder vote');
          pushNews(s, { category: 'studio', headline: `Shareholders rebuke ${s.company.name}’s leadership`, tone: 'bad' });
        }
      } else if (opt === 'concede') {
        st.boardMood = clamp(st.boardMood + 20, 0, 100);
        s.company.moraleMods.push({ v: -8, until: s.day + 180, label: 'Cost-cutting mandate' });
      }
    },
  },
  {
    id: 'poach_offer',
    art: 'handshake',
    cooldown: 120,
    weight: (s) => (staffList(s).some((x) => x.loyalty < poachLoyalty(s, x) && x.poachCooldown <= 0 && Math.max(...Object.values(x.skills)) > 55) ? 0.9 : 0),
    make: ({ s, rng }) => {
      const cands = staffList(s).filter((x) => x.loyalty < poachLoyalty(s, x) && x.poachCooldown <= 0);
      if (!cands.length) return null;
      const st = cands.reduce((a, b) => (Math.max(...Object.values(b.skills)) > Math.max(...Object.values(a.skills)) ? b : a));
      const rivals = Object.values(s.rivals).filter((r) => r.alive && !r.ownedByPlayer && r.staff > 10);
      const rival = rivals.length ? rng.pick(rivals) : undefined;
      if (!rival) return null;
      const raise = Math.round(st.salary * 0.3);
      return {
        title: `${rival.name} wants ${st.name}`,
        body: `${rival.name} has offered ${st.name} a big raise to join them. ${st.name} is tempted (loyalty ${Math.round(st.loyalty)}%).`,
        options: [
          { id: 'counter', label: `Counter-offer (+${fmtMoney(raise)}/yr)`, preview: 'Salary up, loyalty +25, morale +8' },
          { id: 'promise', label: 'Promise a lead role', preview: 'Loyalty +12; if not promoted within a year they may leave' },
          { id: 'let_go', label: 'Wish them well', preview: `${st.name} leaves for ${rival.name}` },
        ],
        ctx: { staff: st.id, rival: rival.id, raise },
      };
    },
    resolve: ({ s }, e, opt) => {
      const st = staffById(s, e.ctx.staff);
      if (!st) return;
      st.poachCooldown = 240;
      if (opt === 'counter') {
        st.salary += Number(e.ctx.raise);
        st.loyalty = clamp(st.loyalty + 25, 0, 100);
        st.morale = clamp(st.morale + 8, 0, 100);
      } else if (opt === 'promise') {
        st.loyalty = clamp(st.loyalty + 12, 0, 100);
      } else {
        rememberLeaver(s, st, 'a rival made them an offer');
        removeStaff(s, st.id);
        s.progress.stats.staffLost += 1;
        const rv = s.rivals[String(e.ctx.rival)];
        if (rv) rv.quality = clamp(rv.quality + 0.01, 0, 1);
        pushNews(s, { category: 'staff', headline: `${st.name} joins ${rv?.name ?? 'a rival'}`, tone: 'bad' });
      }
    },
  },
  // ── Community & legacy ────────────────────────────────────────────────────
  {
    id: 'preservation_society',
    art: 'letters',
    cooldown: 900,
    weight: (s) => (yr(s) >= 2000 && Object.values(s.releases).some((r) => !r.archived && s.day - r.day > 365 * 15 && r.score >= 70) ? 0.25 : 0),
    make: ({ s }) => {
      const r = Object.values(s.releases).filter((x) => !x.archived && s.day - x.day > 365 * 15 && x.score >= 70).sort((a, b) => b.score - a.score)[0];
      if (!r) return null;
      return {
        title: 'A game preservation society writes',
        body: `Historians want to archive ${r.name}’s source code, design documents and builds so it’s never lost. It costs you nothing but a little time.`,
        options: [
          { id: 'donate', label: 'Donate the archive', preview: 'Reputation +1.5, fans +1% — history will remember' },
          { id: 'no', label: 'Keep it private', preview: 'No change' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'donate') return;
      const r = s.releases[String(e.ctx.rel)];
      if (r) r.archived = true;
      addRep(s, 1.5 * (1 - s.company.reputation / 130), 'Donated to game preservation');
      s.company.fans = Math.round(s.company.fans * 1.01);
      pushNews(s, { category: 'industry', headline: `${r?.name ?? 'A classic'}’s source code goes to the archive`, body: 'Preservationists call it “a gift to the history of games”.', tone: 'good' });
    },
  },
  {
    id: 'guest_lecture',
    art: 'student',
    cooldown: 400,
    weight: (s) => (yr(s) >= 1990 && staffList(s).some((x) => x.level === 'senior' || x.level === 'lead') ? 0.3 : 0),
    make: ({ s, rng }) => {
      const pool = staffList(s).filter((x) => x.level === 'senior' || x.level === 'lead');
      if (!pool.length) return null;
      const st = rng.pick(pool);
      return {
        title: 'A university invites you to teach',
        body: `A games course would love ${st.name} to give a guest lecture — and maybe spot some future hires.`,
        options: [
          { id: 'go', label: `Send ${st.name.split(' ')[0]}`, preview: 'Their morale +6; better job applicants for six weeks; two days away' },
          { id: 'no', label: 'Too busy right now', preview: 'No change' },
        ],
        ctx: { staff: st.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'go') return;
      const st = staffById(s, e.ctx.staff);
      if (!st) return;
      st.morale = clamp(st.morale + 6, 0, 100);
      if (!(st.vacationDays ?? 0)) {
        st.vacationDays = 2;
        st.leave = 'conference';
      }
      s.company.talkBuzzUntil = Math.max(s.company.talkBuzzUntil ?? 0, s.day + 42);
    },
  },
  {
    id: 'childrens_hospital',
    art: 'heart',
    cooldown: 700,
    weight: (s) => (yr(s) >= 1990 && Object.values(s.releases).some((r) => r.concept.audience === 'kids' || r.concept.audience === 'everyone') ? 0.25 : 0),
    make: ({ s }) => {
      const cost = money(5_000, s.day);
      return {
        title: 'A children’s hospital asks for games',
        body: 'The children’s ward wants consoles and games to help young patients through long stays.',
        options: [
          { id: 'give', label: `Send consoles and games (${fmtMoney(cost)})`, preview: 'Reputation +1, fans +2%, morale +3 for a month', cost: cost },
          { id: 'no', label: 'Not this time', preview: 'No change' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'give' || s.company.cash < Number(e.ctx.cost)) return;
      spend(s, 'other_expense', Number(e.ctx.cost));
      addRep(s, 1 * (1 - s.company.reputation / 130), 'Gave games to a children’s hospital');
      s.company.fans = Math.round(s.company.fans * 1.02);
      mod(s, 3, 30, 'Children’s hospital donation');
    },
  },
  {
    id: 'fan_cover_song',
    art: 'crowd',
    cooldown: 500,
    weight: (s) => (yr(s) >= 2008 && Object.values(s.releases).some((r) => r.score >= 80 && s.day - r.day < 365 * 3) ? 0.3 : 0),
    make: ({ s }) => {
      const r = Object.values(s.releases).filter((x) => x.score >= 80 && s.day - x.day < 365 * 3).sort((a, b) => b.score - a.score)[0];
      if (!r) return null;
      const fee = money(3_000, s.day);
      return {
        title: 'A fan’s cover goes viral',
        body: `A fan’s orchestral cover of the ${r.name} theme has millions of views. Everyone’s waiting to see how you react.`,
        options: [
          { id: 'feature', label: `Hire them for the next trailer (${fmtMoney(fee)})`, preview: 'Fans +5%, reputation +0.5 — the internet loves it', cost: fee },
          { id: 'share', label: 'Share it from the official account', preview: 'Fans +3%' },
          { id: 'takedown', label: 'File a copyright takedown', preview: 'Fans −3%, reputation −1' },
        ],
        ctx: { rel: r.id, fee },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt === 'feature' && s.company.cash >= Number(e.ctx.fee)) {
        spend(s, 'marketing', Number(e.ctx.fee));
        s.company.fans = Math.round(s.company.fans * 1.05);
        addRep(s, 0.5, 'Hired a fan musician');
        communityNudge(s, 6);
      } else if (opt === 'share') s.company.fans = Math.round(s.company.fans * 1.03);
      else if (opt === 'takedown') {
        s.company.fans = Math.round(s.company.fans * 0.97);
        addRep(s, -1, 'Took down a fan cover');
        communityNudge(s, -10);
      }
    },
  },
  {
    id: 'tell_all_memoir',
    art: 'press',
    cooldown: 1200,
    weight: (s) => (yr(s) >= 1995 && (s.alumni ?? []).length > 0 ? 0.2 : 0),
    make: ({ s, rng }) => {
      const who = rng.pick(s.alumni!);
      const avg = staffList(s).reduce((t, x) => t + x.morale, 0) / Math.max(1, staffList(s).length);
      return {
        title: 'A former employee writes a memoir',
        body: `${who.name}, who spent ${who.years} years at ${s.company.name}, has written a book about life at the studio. The press wants your comment.`,
        options: [
          { id: 'embrace', label: 'Read it and celebrate it', preview: avg >= 60 ? 'It’s mostly fond — reputation +1' : 'Risky: it may not be kind' },
          { id: 'lawyers', label: 'Send the lawyers', preview: `Costs ${fmtMoney(money(20_000, s.day))}; reputation −1 for looking defensive`, cost: money(20_000, s.day) },
          { id: 'ignore', label: 'No comment', preview: 'Let it pass' },
        ],
        ctx: { name: who.name, avg: Math.round(avg) },
      };
    },
    resolve: ({ s }, e, opt) => {
      const fond = Number(e.ctx.avg) >= 60;
      if (opt === 'embrace') {
        addRep(s, fond ? 1 : -1.5, fond ? 'A fond memoir' : 'An unflattering memoir');
        pushNews(s, { category: 'industry', headline: fond ? `${e.ctx.name}’s memoir paints a warm picture of ${s.company.name}` : `${e.ctx.name}’s memoir lifts the lid on ${s.company.name}`, tone: fond ? 'good' : 'bad' });
      } else if (opt === 'lawyers') {
        spend(s, 'other_expense', money(20_000, e.day));
        addRep(s, -1, 'Sued over a memoir');
      } else if (!fond) addRep(s, -0.5, 'An unflattering memoir');
    },
  },
  {
    id: 'lootbox_regulation',
    art: 'audit',
    cooldown: 2000,
    weight: (s) => (yr(s) >= 2018 && Object.values(s.releases).some((r) => r.active && (r.concept.features ?? []).includes('loot_boxes')) ? 0.5 : 0),
    make: ({ s }) => {
      const games = Object.values(s.releases).filter((r) => r.active && (r.concept.features ?? []).includes('loot_boxes'));
      if (!games.length) return null;
      const fine = money(60_000, s.day) * games.length;
      return {
        title: 'Regulators take aim at loot boxes',
        body: `Several countries want to classify paid random rewards as gambling. ${games.map((g) => g.name).slice(0, 3).join(', ')} ${games.length === 1 ? 'is' : 'are'} in the spotlight.`,
        options: [
          { id: 'remove', label: 'Patch them out everywhere', preview: 'Players cheer (user score +3, community happier); those games earn about 25% less from now on' },
          { id: 'odds', label: 'Publish the odds and add limits', preview: 'User score +1; a compliance bill and about 8% less live income' },
          { id: 'fight', label: 'Lobby and fight it', preview: `Reputation −3 and ${fmtMoney(fine)} in legal costs; keep the revenue` },
        ],
        ctx: { fine },
      };
    },
    resolve: ({ s }, e, opt) => {
      const games = Object.values(s.releases).filter((r) => r.active && (r.concept.features ?? []).includes('loot_boxes'));
      if (opt === 'remove') {
        for (const r of games) {
          r.userScore = clamp(r.userScore + 3, 1, 100);
          for (const ps of r.platforms) ps.potential *= 0.88;
          r.liveMul = (r.liveMul ?? 1) * 0.75;
          r.concept = { ...r.concept, features: (r.concept.features ?? []).filter((f) => f !== 'loot_boxes') };
        }
        communityNudge(s, 8);
        addRep(s, 1, 'Removed loot boxes');
      } else if (opt === 'odds') {
        for (const r of games) {
          r.userScore = clamp(r.userScore + 1, 1, 100);
          r.liveMul = (r.liveMul ?? 1) * 0.92;
        }
        spend(s, 'other_expense', money(10_000, e.day) * games.length);
      } else {
        spend(s, 'other_expense', Number(e.ctx.fine));
        addRep(s, -3, 'Fought loot box regulation');
        communityNudge(s, -6);
      }
    },
  },
  // ── During development ────────────────────────────────────────────────────
  {
    id: 'feature_creep',
    art: 'lightbulb',
    cooldown: 200,
    weight: (s) => (activeGames(s).some((p) => p.phase === 1 && !p.cut) ? 0.45 : 0),
    make: ({ s, rng }) => {
      const pool = activeGames(s).filter((x) => x.phase === 1 && !x.cut);
      const p = pool.length ? rng.pick(pool) : undefined;
      if (!p) return null;
      const lead = p.team.map((id) => s.staff[id]).find((x) => x && (x.role === 'designer' || x.role === 'founder'));
      const idea = rng.pick(['a grappling hook', 'a photo mode', 'a day–night cycle', 'a pet companion', 'a new-game-plus mode', 'destructible scenery', 'a fishing mini-game', 'a branching ending']);
      return {
        title: 'One more feature?',
        body: `${lead ? lead.name : 'Your lead designer'} has a brilliant idea for ${p.concept.name}: ${idea}. It would make the game more memorable — and it would take three more weeks.`,
        options: [
          { id: 'add', label: 'Add it', preview: `Three more weeks of production; a novelty boost to quality; the designers are thrilled${lateNote(p)}` },
          { id: 'no', label: 'Stay on schedule', preview: 'No delay; a little disappointment' },
        ],
        ctx: { project: p.id, idea, lead: lead?.id ?? '' },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game') return;
      const lead = s.staff[String(e.ctx.lead)];
      if (opt === 'add') {
        if (p.phase <= 1) p.phaseDays[1] += 21;
        else p.extraDays += 21;
        p.novelty += 0.03;
        if (lead) lead.morale = clamp(lead.morale + 8, 0, 100);
      } else if (lead) lead.morale = clamp(lead.morale - 3, 0, 100);
    },
  },
  {
    id: 'tech_breakthrough',
    art: 'lightbulb',
    cooldown: 260,
    weight: (s) => (activeGames(s).some((p) => p.phase <= 1 && p.team.some((id) => s.staff[id]?.role === 'programmer')) ? 0.35 : 0),
    make: ({ s, rng }) => {
      const pool = activeGames(s).filter((x) => x.phase <= 1 && x.team.some((id) => s.staff[id]?.role === 'programmer'));
      const p = pool.length ? rng.pick(pool) : undefined;
      if (!p) return null;
      const dev = p.team.map((id) => s.staff[id]).find((x) => x?.role === 'programmer')!;
      return {
        title: 'A rendering breakthrough',
        body: `${dev.name} found a trick that makes ${p.concept.name} look a generation ahead. It's not battle-tested yet.`,
        options: [
          { id: 'ship', label: 'Use it now', preview: 'Development effort +5%, but bugs +15%' },
          { id: 'harden', label: 'Harden it first', preview: `Development effort +5% and a week more of production${lateNote(p)}` },
          { id: 'skip', label: 'Too risky', preview: 'No change' },
        ],
        ctx: { project: p.id, dev: dev.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game' || opt === 'skip') return;
      // scale all the work so the design/tech balance doesn't shift
      p.design *= 1.05;
      p.tech *= 1.05;
      for (const k of Object.keys(p.points) as (keyof typeof p.points)[]) p.points[k] *= 1.05;
      if (opt === 'ship') p.bugs *= 1.15;
      else if (p.phase <= 1) p.phaseDays[p.phase as 0 | 1] += 7;
      else p.extraDays += 7;
      const dev = s.staff[String(e.ctx.dev)];
      if (dev) dev.morale = clamp(dev.morale + 5, 0, 100);
    },
  },
  {
    id: 'accessibility_request',
    art: 'letters',
    cooldown: 700,
    weight: (s) => (yr(s) >= 2008 && accessibilityCandidate(s) ? 0.2 : 0),
    make: ({ s }) => {
      const r = accessibilityCandidate(s);
      if (!r) return null;
      const cost = money(6_000, s.day);
      return {
        title: `Players ask for accessibility options in ${r.name}`,
        body: `A group of disabled players love ${r.name} but can’t finish it: no remappable controls, no subtitles, no colour-blind mode. They’ve written a thoughtful letter asking for a patch.`,
        options: [
          { id: 'patch', label: `Patch them in (${fmtMoney(cost)})`, preview: 'User score +2, reputation +1, a few more players', cost: cost },
          { id: 'next', label: 'Promise it for the next game', preview: 'No cost; a little goodwill (reputation +0.3)' },
        ],
        ctx: { rel: r.id, cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r) return;
      r.accessibilityAsked = true;
      const cost = Number(e.ctx.cost);
      if (opt === 'patch') {
        if (s.company.cash < cost) {
          pushNews(s, { category: 'studio', headline: `No budget for ${r.name}’s accessibility patch`, body: 'The players who asked are disappointed.', tone: 'bad' });
          return;
        }
        spend(s, 'other_expense', cost);
        r.userScore = clamp(r.userScore + 2, 1, 100);
        if (!r.delisted) {
          for (const ps of r.platforms) ps.potential *= 1.02;
          r.active = true;
        }
        addRep(s, 1, `Accessibility patch for ${r.name}`);
        pushNews(s, { category: 'studio', headline: `${r.name} gets an accessibility patch`, body: 'Remappable controls, subtitles and a colour-blind mode — and a lot of grateful players.', tone: 'good' });
      } else addRep(s, 0.3, 'Promised accessibility options');
    },
  },
  {
    id: 'charity_stream',
    art: 'trophy',
    cooldown: 600,
    weight: (s) => (yr(s) >= 2012 && recentHit(s, 365 * 2, 75) ? 0.18 : 0),
    make: ({ s }) => {
      const r = recentHit(s, 365 * 2, 75);
      if (!r) return null;
      const raised = money(40_000, s.day);
      return {
        title: `Streamers raise money playing ${r.name}`,
        body: `A 48-hour charity marathon of ${r.name} has raised ${fmtMoney(raised)} for a children’s hospital, with thousands watching. The organisers have tagged you.`,
        options: [
          { id: 'match', label: `Match the donations (${fmtMoney(raised)})`, preview: `Reputation +${(2 * (1 - s.company.reputation / 130)).toFixed(1)}, fans +5%, and the team is proud`, cost: raised },
          { id: 'cheer', label: 'Send the team’s thanks on stream', preview: 'Fans +1%' },
        ],
        ctx: { rel: r.id, raised },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      const raised = Number(e.ctx.raised);
      const fr = r?.concept.franchiseId ? s.franchises[r.concept.franchiseId] : undefined;
      if (opt === 'match') {
        if (s.company.cash < raised) {
          pushNews(s, { category: 'studio', headline: 'Couldn’t match the charity stream after all', body: 'The money wasn’t there by the time the stream ended. The team sent their thanks instead.', tone: 'neutral' });
          return;
        }
        spend(s, 'other_expense', raised);
        s.progress.stats.donated = (s.progress.stats.donated ?? 0) + raised;
        addRep(s, 2 * (1 - s.company.reputation / 130), 'Matched a charity stream');
        s.company.fans = Math.round(s.company.fans * 1.05);
        if (fr) fr.fans *= 1.05;
        mod(s, 3, 60, 'Proud of the charity stream');
      } else s.company.fans = Math.round(s.company.fans * 1.01);
    },
  },
  {
    id: 'breakout_mod',
    art: 'crowd',
    cooldown: 540,
    weight: (s) => (breakoutCandidate(s) ? 0.22 : 0),
    make: ({ s, rng }) => {
      const r = breakoutCandidate(s);
      if (!r) return null;
      const mod = rollMod(s, rng, r);
      if (!mod) return null;
      const players = Math.max(5_000, Math.round((r.units * rng.range(0.08, 0.2)) / 1000) * 1000);
      const cand = generateCandidate(s, rng, { role: rng.pick(['designer', 'programmer'] as const), quality: 15 });
      cand.potential = clamp(Math.max(cand.potential, 80) + rng.int(0, 12), 0, 100);
      const salary = Math.round(marketSalary(s, cand.skills) * 1.1);
      const signing = Math.round(salary / 4);
      const pcPot = r.platforms.reduce((t, ps) => t + (platformInfo(s, ps.platform)?.kind === 'computer' ? ps.potential : 0), 0);
      const buy = Math.round(Math.max(money(15_000, s.day), pcPot * MOD_BUY * r.price * 0.25));
      const room = freeDesks(s) > 0 && Object.keys(s.staff).length < tierDef(s.office.tier).staffCap;
      const first = cand.name.split(' ')[0];
      return {
        title: `A mod for ${r.name} is taking over`,
        body: `“${mod.name}”, ${aOrAn(mod.style)} mod built on ${r.name}, has ${players.toLocaleString('en-US')} players — more than some full games. It’s the work of ${cand.name}, ${aOrAn(ROLE_NAMES[cand.role].toLowerCase())} with no studio behind them.`,
        options: [
          ...(room
            ? [{ id: 'hire', label: `Hire ${first} (${fmtMoney(signing)} signing bonus)`, preview: `A gifted young ${ROLE_NAMES[cand.role].toLowerCase()} (potential ${cand.potential}) joins with a pitch to make ${mod.name} a full game; ${r.name} sells again`, cost: signing }]
            : []),
          { id: 'buy', label: `Buy it and ship it officially (${fmtMoney(buy)})`, preview: `A big second wave for ${r.name} on computers; player score +2`, cost: buy },
          { id: 'feature', label: 'Feature it on the store page', preview: `${r.name} sells again to players who want the mod; fans +3%` },
        ],
        ctx: { rel: r.id, name: mod.name, style: mod.style, genre: mod.genre, cand: JSON.stringify(cand), salary, signing, buy },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r || r.breakoutMod) return;
      const name = String(e.ctx.name);
      const style = String(e.ctx.style);
      let choice: 'hire' | 'buy' | 'feature' = opt === 'hire' ? 'hire' : opt === 'buy' ? 'buy' : 'feature';
      if (choice === 'hire' && (freeDesks(s) <= 0 || Object.keys(s.staff).length >= tierDef(s.office.tier).staffCap)) {
        choice = 'feature';
        pushNews(s, { category: 'staff', headline: `No desk for the maker of ${name}`, body: 'The office is full, so you featured the mod instead.', tone: 'neutral' });
      }
      r.breakoutMod = { name, style, day: s.day, choice };
      if (choice === 'hire') {
        spend(s, 'recruiting', Number(e.ctx.signing));
        const cand = JSON.parse(String(e.ctx.cand));
        const id = newId(s, 's');
        const st = candidateToStaff(s, cand, id, Number(e.ctx.salary));
        st.loyalty = 80;
        s.staff[id] = st;
        s.progress.stats.staffHired += 1;
        assignDesks(s);
        r.breakoutMod.by = st.name;
        modRevival(s, r, MOD_HIRE);
        // they arrive wanting to make it properly (unless another pitch is already waiting)
        const waiting = s.company.pitch && s.company.pitch.until >= s.day && s.staff[s.company.pitch.staffId];
        if (!waiting) s.company.pitch = { staffId: id, genre: String(e.ctx.genre) as GenreId, topic: modTopic(s, rng, String(e.ctx.genre) as GenreId, r.concept.topic), until: s.day + PITCH_DAYS };
        pushNews(s, {
          category: 'staff',
          headline: `${s.company.name} hires the creator of ${name}`,
          body: waiting ? `${st.name} joins the studio. ${r.name} is selling again to players who want the mod.` : `${st.name} joins with one dream: ${name} as a full game. It’s waiting in New Game for six months — and ${r.name} is selling again.`,
          tone: 'good',
        });
      } else if (choice === 'buy') {
        spend(s, 'marketing', Number(e.ctx.buy));
        modRevival(s, r, MOD_BUY);
        r.userScore = modBuyScore(r);
        addRep(s, 0.5, `Shipped ${name} officially`);
        pushNews(s, { category: 'studio', headline: `${name} becomes official ${r.name} content`, body: `The ${style} mod is now part of the game, and players are pouring back in.`, tone: 'good' });
      } else {
        modRevival(s, r, MOD_FEATURE);
        s.company.fans = Math.round(s.company.fans * 1.03);
        const fr = r.concept.franchiseId ? s.franchises[r.concept.franchiseId] : undefined;
        if (fr) fr.fans = Math.round(fr.fans * 1.03);
        pushNews(s, { category: 'studio', headline: `${r.name}’s store page now features ${name}`, body: `Players are buying ${r.name} just to play the ${style} mod.`, tone: 'good' });
      }
    },
  },
  {
    id: 'fan_vote',
    art: 'crowd',
    cooldown: 900,
    weight: (s) => (yr(s) >= 2008 && votableSeries(s).length >= 2 ? 0.18 : 0),
    make: ({ s }) => {
      const pool = votableSeries(s).slice(0, 2);
      if (pool.length < 2) return null;
      const [a, b] = pool as [Franchise, Franchise];
      return {
        title: 'Which sequel should we make?',
        body: `Your community manager wants to run a poll: ${a.name} or ${b.name}? Fans of both are loud, and the winner would get a sequel.`,
        options: [
          { id: 'poll', label: 'Run the poll', preview: 'The winning series gets fans (+5%), and a sequel started within a year begins with extra hype (+0.35)' },
          { id: 'skip', label: 'We decide what we make', preview: 'No change' },
        ],
        ctx: { a: a.id, b: b.id },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      if (opt !== 'poll') return;
      const a = s.franchises[String(e.ctx.a)];
      const b = s.franchises[String(e.ctx.b)];
      if (!a || !b) return;
      const win = rng.chance(a.fans / Math.max(1, a.fans + b.fans)) ? a : b;
      const lose = win === a ? b : a;
      const fanShare = win.fans / Math.max(1, win.fans + lose.fans); // before the winner's boost
      win.fans = Math.round(win.fans * 1.05);
      win.votedUntil = s.day + 365;
      const how = fanShare >= 0.5 ? `with about ${Math.min(95, Math.round(fanShare * 100))}% of the vote` : 'in a narrow upset — its fans turned out in force';
      pushNews(s, { category: 'studio', headline: `Fans vote for a new ${win.name}`, body: `${win.name} beat ${lose.name} ${how}. Start the sequel within a year and the fans will be waiting.`, tone: 'good' });
    },
  },
  {
    id: 'april_fools',
    art: 'megaphone',
    cooldown: 300,
    weight: (s) => {
      const d = fromDay(s.day);
      return d.year >= 1995 && d.month === 3 && d.day >= 25 && s.releaseOrder.length >= 2 ? 1.2 : 0;
    },
    make: ({ s, rng }) => {
      const year = fromDay(s.day).year;
      const jokes = ([
        { name: 'Office Simulator: Printer Edition', genre: 'simulation', topic: 'business' },
        { name: 'Cat Kart Deluxe', genre: 'racing', topic: 'animals' },
        { name: 'Goat Tactics', genre: 'strategy', topic: 'farming' },
        { name: 'Dungeon Café', genre: 'casual', topic: 'cooking' },
        { name: 'Haunted Bowling', genre: 'sports', topic: 'horror' },
      ] as const).filter((j) => year >= GENRE_BY_ID[j.genre].year && year >= (TOPIC_BY_ID[j.topic]?.year ?? 9999) && !GENRE_BY_ID[j.genre].research && !TOPIC_BY_ID[j.topic]?.research);
      if (!jokes.length) return null;
      const idea = rng.pick(jokes);
      return {
        title: 'April Fools’ Day is coming',
        body: `The team has a joke announcement ready for April 1st: “${idea.name}”, complete with a fake trailer.`,
        options: [
          { id: 'go', label: 'Announce the joke game', preview: 'Players love a laugh (fans +2%, reputation +0.3) — and sometimes they beg for it to be real' },
          { id: 'skip', label: 'Keep it professional', preview: 'No change' },
        ],
        ctx: { name: idea.name, genre: idea.genre, topic: idea.topic },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const today = fromDay(s.day);
      if (opt !== 'go' || today.month > 4 || (today.month === 4 && today.day > 1)) return; // the joke only works on the day
      s.company.fans = Math.round(s.company.fans * 1.02);
      addRep(s, 0.3, 'An April Fools’ joke');
      const name = String(e.ctx.name);
      // a third of the time players want it for real: it becomes a designer's pitch
      const designers = Object.values(s.staff).filter((x) => x.role === 'designer' && !isAwayStaff(x));
      if (!s.company.pitch && designers.length && rng.chance(0.35)) {
        const st = rng.pick(designers);
        s.company.pitch = { staffId: st.id, genre: String(e.ctx.genre) as GenreId, topic: String(e.ctx.topic), until: s.day + PITCH_DAYS };
        pushNews(s, { category: 'studio', headline: `Players demand “${name}” be real`, body: `The April Fools’ joke went viral. ${st.name} says they could actually make it — the pitch is waiting in the new-game screen.`, tone: 'good' });
      } else pushNews(s, { category: 'studio', headline: `${s.company.name} announces “${name}”`, body: 'Players are fairly sure it’s a joke. Fairly.', tone: 'good' });
    },
  },
  {
    id: 'easter_egg',
    art: 'letters',
    cooldown: 500,
    weight: (s) => (activeGames(s).some((p) => p.phase === 1 && !p.easterEgg && p.team.some((id) => s.staff[id] && s.staff[id]!.role !== 'founder')) ? 0.2 : 0),
    make: ({ s, rng }) => {
      const pool = activeGames(s).filter((p) => p.phase === 1 && !p.easterEgg && p.team.some((id) => s.staff[id] && s.staff[id]!.role !== 'founder'));
      const p = pool.length ? rng.pick(pool) : undefined;
      const people = p ? p.team.map((id) => s.staff[id]).filter((x): x is Staff => !!x && x.role !== 'founder') : [];
      if (!p || !people.length) return null;
      const st = rng.pick(people);
      const what = rng.pick([...EGGS]);
      const first = st.name.split(' ')[0];
      return {
        title: `${first} hid something in ${p.concept.name}`,
        body: `During a late-night playtest you stumble on it: ${what}. ${first} looks sheepish. “Nobody will ever find it… right?”`,
        options: [
          { id: 'cut', label: 'Take it out', preview: `Keeps things tidy — ${first} is a bit deflated` },
          { id: 'keep', label: 'Leave it in', preview: `A few months after launch players may find it: a little buzz for the game, and a proud ${first}` },
        ],
        ctx: { project: p.id, staff: st.id, what },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      const st = s.staff[String(e.ctx.staff)];
      if (!p || p.kind !== 'game' || !st) return;
      if (opt === 'keep') p.easterEgg = { by: st.id, name: st.name, what: String(e.ctx.what) };
      else if (!st.mood || st.mood.until <= s.day || st.mood.v > -2) {
        st.mood = { v: -2, until: s.day + 30, label: 'Easter egg cut' };
        st.moraleWhy = undefined;
      }
    },
  },
  {
    id: 'cert_fail',
    art: 'smoke',
    cooldown: 400,
    weight: (s) => (yr(s) >= 1986 && certRisk(s) ? 0.35 : 0),
    make: ({ s }) => {
      const p = certRisk(s);
      if (!p) return null;
      const cost = money(8_000, s.day);
      const holder = p.concept.platforms.map((id) => platformInfo(s, id)).find((pl) => pl && pl.maker !== 'player' && (pl.kind === 'console' || pl.kind === 'handheld'));
      p.extraDays += 7; // it can't ship while it's failed: held for at least a week whatever you decide
      p.certified = true;
      return {
        title: `${p.concept.name} failed certification`,
        body: `${holder ? `${holder.name}’s` : 'The platform holder’s'} testers sent ${p.concept.name} back with a list of crash bugs. It can’t ship on their console until they’re fixed.`,
        options: [
          { id: 'rush', label: `Pay for an expedited re-test (${fmtMoney(cost)})`, preview: `A week’s hold; fixes the worst of it (bugs −10%)${lateNote(p)}`, cost: cost },
          { id: 'fix', label: 'Fix it properly and resubmit', preview: `Two weeks’ hold; bugs −25%${lateNote(p)}` },
        ],
        ctx: { project: p.id, cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game') return;
      const cost = Number(e.ctx.cost);
      if (opt === 'rush') {
        // can't pay any more? the week's hold stands, but nothing gets fixed
        if (s.company.cash < cost) return;
        spend(s, 'other_expense', cost);
        p.bugs *= 0.9;
      } else {
        p.extraDays += 7;
        p.bugs *= 0.75;
      }
    },
  },
  {
    id: 'lost_build',
    art: 'smoke',
    cooldown: 500,
    weight: (s) => (yr(s) < 2003 && activeGames(s).some((p) => p.phase >= 1) && !s.office.items.some((i) => i.item === 'server_rack') ? 0.25 : 0),
    make: ({ s, rng }) => {
      const pool = activeGames(s).filter((x) => x.phase >= 1);
      const p = pool.length ? rng.pick(pool) : undefined;
      if (!p) return null;
      return {
        title: 'The hard drive died',
        body: `A disk crash took about two weeks of work on ${p.concept.name} with it — the last backup is older than anyone would like. (A server rack in the office would have kept backups.)`,
        options: [
          { id: 'weekend', label: 'Rebuild it over the weekend', preview: 'Keep the date: the lost work stays lost, morale −4, a few more bugs' },
          { id: 'redo', label: 'Take the time to redo it', preview: `Two more weeks to make the work back${lateNote(p)}` },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game') return;
      // the lost work: about two weeks' worth
      const keep = 1 - Math.min(0.1, 14 / Math.max(30, s.day - p.startDay));
      p.design *= keep;
      p.tech *= keep;
      for (const k of Object.keys(p.points) as (keyof typeof p.points)[]) p.points[k] *= keep;
      if (opt === 'weekend') {
        for (const id of p.team) {
          const st = s.staff[id];
          if (st) st.morale = clamp(st.morale - 4, 0, 100);
        }
        p.bugs *= 1.05;
      } else if (p.phase <= 2) p.phaseDays[Math.min(2, p.phase) as 0 | 1 | 2] += 14;
      else p.extraDays += 14;
    },
  },
  {
    id: 'card_tournament',
    art: 'trophy',
    cooldown: 700,
    weight: (s) => (yr(s) >= 1995 && genreHit(s, 'cards', 72, 3) ? 0.2 : 0),
    make: ({ s }) => {
      const r = genreHit(s, 'cards', 72, 3);
      if (!r) return null;
      const cost = money(15_000, s.day);
      return {
        title: `Players are running a ${r.name} tournament`,
        body: `Hundreds of fans have signed up for a weekend ${r.name} tournament in a hotel ballroom. The organisers ask if you’d like to put your name on it.`,
        options: [
          { id: 'sponsor', label: `Sponsor it (${fmtMoney(cost)})`, preview: 'Fans +8% for the series, reputation +0.5, and a little burst of sales', cost: cost },
          { id: 'cheer', label: 'Send a signed deck and cheer them on', preview: 'Fans +2% for the series' },
        ],
        ctx: { rel: r.id, cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r) return;
      const fr = r.concept.franchiseId ? s.franchises[r.concept.franchiseId] : undefined;
      const cost = Number(e.ctx.cost);
      if (opt === 'sponsor' && s.company.cash >= cost) {
        spend(s, 'marketing', cost);
        addRep(s, 0.5, `${r.name} tournament`);
        if (fr) fr.fans *= 1.08;
        s.company.fans = Math.round(s.company.fans * 1.01);
        if (!r.delisted) {
          for (const ps of r.platforms) ps.potential *= 1.03;
          r.active = true;
        }
      } else if (fr) fr.fans *= 1.02;
    },
  },
  {
    id: 'fan_translation',
    art: 'letters',
    cooldown: 900,
    weight: (s) => (yr(s) >= 2000 && untranslatedNovel(s) ? 0.2 : 0),
    make: ({ s }) => {
      const r = untranslatedNovel(s);
      if (!r) return null;
      const cost = money(20_000, s.day);
      return {
        title: `Fans want to translate ${r.name}`,
        body: `A group of volunteer translators abroad loves ${r.name} and wants to release an unofficial translation. They’ve asked for your blessing — and a copy of the script.`,
        options: [
          { id: 'official', label: `Hire them to make it official (${fmtMoney(cost)})`, preview: 'Many more players find it (+15% sales), reputation +1, and a lot of goodwill', cost: cost },
          { id: 'no', label: 'Send a takedown notice', preview: 'Protects the IP — but fans are furious (reputation −1)' },
          { id: 'bless', label: 'Give them your blessing', preview: 'Free: a few more players find it (+6% sales), reputation +0.5' },
        ],
        ctx: { rel: r.id, cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r) return;
      r.fanTranslated = true;
      const cost = Number(e.ctx.cost);
      const boost = (m: number) => {
        if (r.delisted) return;
        for (const ps of r.platforms) ps.potential *= m;
        r.active = true;
      };
      if (opt === 'official' && s.company.cash >= cost) {
        spend(s, 'other_expense', cost);
        boost(1.15);
        addRep(s, 1, `Official translation of ${r.name}`);
        pushNews(s, { category: 'studio', headline: `${r.name} gets an official translation`, body: 'The fans who wanted to translate it are now doing it for real.', tone: 'good' });
      } else if (opt === 'no') {
        addRep(s, -1, `Took down a fan translation of ${r.name}`);
        communityNudge(s, -6);
      } else {
        // a blessing (also what happens if you can no longer afford the official version, or never answer)
        boost(1.06);
        addRep(s, 0.5, `Blessed a fan translation of ${r.name}`);
      }
    },
  },
  {
    id: 'staff_pitch',
    art: 'letters',
    cooldown: 300,
    weight: (s) => (!s.company.pitch && s.releaseOrder.length >= 1 && pitchers(s).length ? 0.22 : 0),
    make: ({ s, rng }) => {
      const pool = pitchers(s);
      const st = pool.length ? rng.pick(pool) : undefined;
      if (!st) return null;
      const idea = makePitch(s, rng, st);
      if (!idea) return null;
      const first = st.name.split(' ')[0];
      return {
        title: `${first} has a pitch`,
        body: `${st.name} corners you by the coffee machine with a sketchbook: ${pitchText(idea, true)}. “I’ve wanted to make this since I was a kid.”`,
        options: [
          { id: 'yes', label: 'Greenlight it', preview: `It waits in the new-game screen for six months. Make it with ${first} on the team: a passion project (fresh ideas, a very happy ${first}).` },
          { id: 'no', label: 'Not right now', preview: `${first} is a little deflated (a small mood dip)` },
        ],
        ctx: { staff: st.id, genre: idea.genre, topic: idea.topic },
      };
    },
    resolve: ({ s }, e, opt) => {
      const st = s.staff[String(e.ctx.staff)];
      if (!st) return;
      if (opt === 'yes' && s.company.pitch && s.company.pitch.until >= s.day && s.staff[s.company.pitch.staffId]) {
        pushNews(s, { category: 'staff', headline: `${st.name}’s pitch will have to wait`, body: 'Another pitch is already greenlit — one dream project at a time.', tone: 'neutral' });
      } else if (opt === 'yes') {
        s.company.pitch = { staffId: st.id, genre: String(e.ctx.genre) as GenreId, topic: String(e.ctx.topic), until: s.day + PITCH_DAYS };
        if (!st.mood || st.mood.until <= s.day || (st.mood.v >= 0 && st.mood.v < 3)) st.mood = { v: 3, until: s.day + 60, label: 'Pitch greenlit' };
      } else if (!st.mood || st.mood.until <= s.day || (st.mood.v > -2)) st.mood = { v: -2, until: s.day + 30, label: 'Pitch turned down' };
      st.moraleWhy = undefined;
    },
  },
  {
    id: 'licence_expiry',
    art: 'letters',
    cooldown: 0,
    weight: () => 0, // scheduled by systems/licences.ts, never random
    make: ({ s }) => {
      const r = licenceDecisionDue(s);
      if (!r) return null;
      const cost = renewalCost(s, r);
      const what = licensedParts(r).map((id) => (id === 'official_license' ? 'league licence' : 'soundtrack licence')).join(' and the ');
      return {
        title: `${r.name}’s licences are up`,
        body: `The ${what} for ${r.name} expire this month. Renew for another seven years, or let the game be delisted from stores for good.`,
        options: [
          { id: 'renew', label: `Renew for seven years (${fmtMoney(cost)})`, preview: 'It stays on sale — storefront sales and re-releases still possible', cost: cost },
          { id: 'lapse', label: 'Let it lapse', preview: 'Delisted for good: no more sales of any kind; fans grumble (reputation −0.5)' },
        ],
        ctx: { rel: r.id, cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r || r.delisted) return;
      const cost = Number(e.ctx.cost);
      if (opt === 'renew') {
        if (s.company.cash < cost) {
          // can't pay today: the licence stays due and the question comes back next month
          pushNews(s, { category: 'studio', headline: `Couldn’t afford to renew ${r.name}’s licences`, body: 'The licence holders will ask again next month.', tone: 'bad' });
          return;
        }
        spend(s, 'other_expense', cost);
        r.licenceUntil = s.day + Math.round(LICENCE_YEARS * 365.25);
        pushNews(s, { category: 'studio', headline: `${r.name}’s licences renewed`, body: 'It stays on store shelves for another seven years.', tone: 'neutral' });
      } else {
        delist(s, r, true);
        addRep(s, -0.5, `${r.name} delisted`);
      }
    },
  },
  {
    id: 'documentary',
    art: 'letters',
    cooldown: 1200,
    weight: (s) => (s.company.reputation >= 25 && activeGames(s).some((p) => docEligible(s, p)) ? 0.12 : 0),
    make: ({ s, rng }) => {
      const pool = activeGames(s).filter((p) => docEligible(s, p));
      const p = pool.length ? rng.pick(pool) : undefined;
      if (!p) return null;
      return {
        title: 'A film crew wants to follow you',
        body: `An independent filmmaker wants to document the making of ${p.concept.name} — every meeting, every setback, all the way to launch day. Fly-on-the-wall, nothing off limits.`,
        options: [
          { id: 'yes', label: 'Let the cameras in', preview: 'Hype +0.3 now (morale −1 for two months: cameras everywhere). The film premieres six months after launch: a great game (82+) makes it a celebrated documentary (fans, reputation, applicants); a flop makes it a cautionary tale. Crunch on camera always makes the cut.' },
          { id: 'no', label: 'Politely decline', preview: 'No change' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game' || opt !== 'yes' || p.documentary) return;
      p.documentary = { day: s.day, crunchDays: 0 };
      p.hype = Math.min(3, p.hype + 0.3);
      mod(s, -1, 60, 'Cameras in the office');
      pushNews(s, { category: 'studio', headline: `Documentary to follow the making of ${p.concept.name}`, body: 'A film crew has moved into the office. The team is mostly pretending not to notice.', tone: 'good' });
    },
  },
  {
    id: 'composer_offer',
    art: 'letters',
    cooldown: 400,
    weight: (s) => (yr(s) >= 1985 && activeGames(s).some((p) => p.phase <= 1 && p.concept.size !== 'small') ? 0.25 : 0),
    make: ({ s, rng }) => {
      const pool = activeGames(s).filter((x) => x.phase <= 1 && x.concept.size !== 'small');
      const p = pool.length ? rng.pick(pool) : undefined;
      if (!p) return null;
      const fee = money({ small: 4_000, medium: 8_000, large: 20_000, aaa: 45_000 }[p.concept.size], s.day);
      return {
        title: 'A celebrated composer wants in',
        body: `An award-winning film composer loves the look of ${p.concept.name} and offers to write the score.`,
        options: [
          { id: 'hire', label: `Commission the score (${fmtMoney(fee)})`, preview: 'Hype +0.2 and a quality touch (novelty)', cost: fee },
          { id: 'no', label: 'Keep it in-house', preview: 'No change' },
        ],
        ctx: { project: p.id, fee },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game' || opt !== 'hire' || s.company.cash < Number(e.ctx.fee)) return;
      spend(s, 'other_expense', Number(e.ctx.fee));
      p.hype = Math.min(3, p.hype + 0.2);
      p.novelty += 0.02;
      pushNews(s, { category: 'studio', headline: `${p.concept.name} gets an orchestral score`, body: 'A celebrated composer is writing the music.', tone: 'good' });
    },
  },
  {
    id: 'playtest_surprise',
    art: 'student',
    cooldown: 220,
    weight: (s) => (activeGames(s).some((p) => p.phase >= 1 && p.phase <= 2) ? 0.35 : 0),
    make: ({ s, rng }) => {
      const pool = activeGames(s).filter((x) => x.phase >= 1 && x.phase <= 2);
      const p = pool.length ? rng.pick(pool) : undefined;
      if (!p) return null;
      const thing = rng.pick(['a silly physics glitch', 'the side-quest with the talking cat', 'a throwaway mini-game', 'the hidden dance emote', 'one minor character', 'the speedrun shortcut']);
      return {
        title: 'Playtesters can’t get enough of it',
        body: `In playtests of ${p.concept.name}, everyone keeps going back to ${thing}. Lean into it?`,
        options: [
          { id: 'expand', label: 'Build it out', preview: `Ten more days of work; hype +0.2 and a novelty boost${lateNote(p)}` },
          { id: 'keep', label: 'Leave it as a secret', preview: 'A small hype bump' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game') return;
      if (opt === 'expand') {
        if (p.phase <= 2) p.phaseDays[Math.min(2, p.phase) as 0 | 1 | 2] += 10;
        else p.extraDays += 10;
        p.hype = Math.min(3, p.hype + 0.2);
        p.novelty += 0.02;
      } else p.hype = Math.min(3, p.hype + 0.05);
    },
  },
  {
    id: 'journalist_preview',
    art: 'press',
    cooldown: 150,
    weight: (s) => (activeGames(s).some((p) => p.announcedDay !== undefined) ? 0.5 + s.company.reputation / 100 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.announcedDay !== undefined);
      if (!p) return null;
      return {
        title: 'A journalist wants an early look',
        body: `A big magazine wants a hands-on preview of ${p.concept.name}. Great buzz if it impresses — but it's still rough.`,
        options: [
          { id: 'grant', label: 'Grant the preview', preview: 'Hype +0.3 (or −0.15 if the build disappoints)' },
          { id: 'refuse', label: 'Politely decline', preview: 'No change' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game' || opt !== 'grant') return;
      const q = p.qualityPreview?.total ?? 0.5;
      if (rng.chance(clamp(q, 0.2, 0.9))) {
        p.hype = Math.min(3, p.hype + 0.3);
        pushNews(s, { category: 'studio', headline: `Hands-on: ${p.concept.name} "looks fantastic"`, tone: 'good' });
      } else {
        p.hype = Math.max(0, p.hype - 0.15);
        pushNews(s, { category: 'studio', headline: `Preview: ${p.concept.name} "needs work"`, tone: 'bad' });
      }
    },
  },
  {
    id: 'staff_conflict',
    art: 'conflict',
    cooldown: 120,
    weight: (s) => (staffList(s).length >= 3 ? 0.4 + (staffList(s).some((x) => x.traits.includes('hothead')) ? 0.8 : 0) + (anyCrunch(s) ? 0.5 : 0) : 0),
    make: ({ s, rng }) => {
      const l = staffList(s);
      if (l.length < 2) return null;
      const a = l.find((x) => x.traits.includes('hothead')) ?? rng.pick(l);
      const b = rng.pick(l.filter((x) => x !== a));
      return {
        title: 'Office argument',
        body: `${a.name} and ${b.name} had a loud disagreement about the direction of the project. The team is unsettled.`,
        options: [
          { id: 'mediate', label: `Bring in a mediator (${fmtMoney(money(1500, s.day))})`, preview: 'Both morale +5', cost: money(1500, s.day) },
          { id: 'talk', label: 'Talk to them yourself', preview: '70%: resolved. 30%: both morale −6' },
          { id: 'ignore', label: 'Let them sort it out', preview: 'Both morale −10; small chance one quits' },
        ],
        ctx: { a: a.id, b: b.id },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const a = staffById(s, e.ctx.a);
      const b = staffById(s, e.ctx.b);
      const both = (d: number) => [a, b].forEach((x) => x && (x.morale = clamp(x.morale + d, 0, 100)));
      if (opt === 'mediate') {
        spend(s, 'other_expense', money(1500, e.day));
        both(5);
      } else if (opt === 'talk') {
        if (!rng.chance(0.7)) both(-6);
      } else {
        both(-10);
        if (a && rng.chance(0.15)) {
          maybeSpinOff(s, rng, a, 0.3);
          removeStaff(s, a.id);
          s.progress.stats.staffLost += 1;
          pushNews(s, { category: 'staff', headline: `${a.name} quits after the argument`, tone: 'bad' });
        }
      }
    },
  },
  {
    id: 'team_retreat',
    art: 'mountain',
    cooldown: 300,
    weight: (s) => (staffList(s).length >= 4 ? 0.5 : 0),
    make: ({ s }) => {
      const cost = money(400, s.day) * staffList(s).length;
      return {
        title: 'Team retreat request',
        body: 'The team asks for a weekend retreat to recharge and bond.',
        options: [
          { id: 'go', label: `Book it (${fmtMoney(cost)})`, preview: 'Studio morale +10 for 3 months, energy refilled', cost: cost },
          { id: 'no', label: 'Not this year', preview: 'Morale −3 for a month' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt === 'go') {
        spend(s, 'other_expense', Number(e.ctx.cost));
        mod(s, 10, 90, 'Team retreat');
        for (const st of Object.values(s.staff)) st.energy = 100;
      } else mod(s, -3, 30, 'Retreat declined');
    },
  },
  {
    id: 'crunch_pizza',
    art: 'pizza',
    cooldown: 60,
    weight: (s) => (anyCrunch(s) ? 1.2 : 0),
    make: ({ s }) => ({
      title: 'Late night at the office',
      body: 'The crunch team is still here at midnight. Someone suggests pizza.',
      options: [
        { id: 'pizza', label: `Order pizza for everyone (${fmtMoney(money(150, s.day))})`, preview: 'Morale +4 for 2 weeks', cost: money(150, s.day) },
        { id: 'home', label: 'Send everyone home', preview: 'Energy +20, lose a day of crunch output' },
        { id: 'nothing', label: 'Keep going', preview: 'Nothing changes' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'pizza') {
        spend(s, 'other_expense', money(150, s.day));
        mod(s, 4, 14, 'Crunch pizza');
      } else if (opt === 'home') for (const st of Object.values(s.staff)) st.energy = clamp(st.energy + 20, 0, 100);
    },
  },
  {
    id: 'crunch_exposed',
    art: 'megaphone',
    cooldown: 400,
    weight: (s) => (anyCrunch(s) && yr(s) >= 2004 && s.company.reputation > 25 ? 0.6 : 0),
    make: ({ s }) => ({
      title: 'Crunch story goes viral',
      body: `An anonymous post about crunch at ${s.company.name} is trending.`,
      options: [
        { id: 'end', label: 'Apologise and end crunch', preview: 'All crunch stops; reputation +1; morale +6' },
        { id: 'deny', label: 'Deny everything', preview: 'Reputation −4; morale −6' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'end') {
        for (const p of activeGames(s)) p.crunch = false;
        addRep(s, 1, 'Ended crunch publicly');
        mod(s, 6, 60, 'Crunch ended');
      } else {
        addRep(s, -(4), 'Denied crunch reports');
        mod(s, -6, 60, 'Crunch denial');
        communityNudge(s, -12);
      }
    },
  },
  {
    id: 'exclusivity',
    art: 'contract',
    cooldown: 360,
    weight: (s) => (activeGames(s).some((p) => p.concept.platforms.length > 1) && s.company.reputation > 20 ? 0.6 : 0),
    make: ({ s, rng }) => {
      const p = activeGames(s).find((x) => x.concept.platforms.length > 1);
      if (!p) return null;
      const pid = rng.pick(p.concept.platforms);
      const plat = pid;
      const holder = Object.values(s.rivals).find((r) => r.alive && COMPANY_BY_ID[r.id]?.kind === 'platform_holder');
      const amount = money(20_000, s.day) * ({ small: 1, medium: 3, large: 8, aaa: 20 }[p.concept.size]) * (1 + s.company.reputation / 50);
      return {
        title: 'Exclusivity offer',
        body: `A platform holder offers ${fmtMoney(amount)} to make ${p.concept.name} exclusive to one platform.`,
        options: [
          { id: 'accept', label: `Accept ${fmtMoney(amount)}`, preview: 'Game ships on that platform only' },
          { id: 'decline', label: 'Stay multi-platform', preview: 'No change' },
        ],
        ctx: { project: p.id, platform: plat, amount: Math.round(amount), holder: holder?.id ?? '' },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game' || opt !== 'accept') return;
      p.concept.platforms = [String(e.ctx.platform)];
      earn(s, 'other_income', Number(e.ctx.amount));
    },
  },
  {
    id: 'crowdfunding',
    art: 'crowd',
    cooldown: 500,
    weight: (s) => (hasFlag(s, 'crowdfunding') && activeGames(s).some((p) => !crowdfundBlocked(s, p)) && s.company.cash < money(200_000, s.day) ? 0.6 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => !crowdfundBlocked(s, x));
      if (!p) return null;
      return {
        title: 'Crowdfund it?',
        body: `Your fans could fund ${p.concept.name} directly. Success depends on reputation, fans, hype and how good the pitch looks. (Any time: Develop → the project → Crowdfund.)`,
        options: [
          { id: 'run', label: 'Launch a modest campaign', preview: `30 days, all or nothing: aim for ${fmtMoney(campaignGoal(s, p, 'modest'))}` },
          { id: 'no', label: 'No thanks', preview: 'No change' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: (c, e, opt) => {
      if (opt !== 'run') return;
      const p = c.s.projects[String(e.ctx.project)];
      if (p && p.kind === 'game') startCrowdfund(c, p, 'modest');
    },
  },
  {
    id: 'hardware_failure',
    art: 'smoke',
    cooldown: 360,
    weight: (s) => (s.office.items.length > 8 ? 0.3 : 0),
    make: ({ s }) => {
      const cost = money(2500 + s.office.items.length * 80, s.day);
      return {
        title: 'Hardware meltdown',
        body: 'A power surge fried several machines. Work grinds to a halt.',
        options: [
          { id: 'repair', label: `Replace everything now (${fmtMoney(cost)})`, preview: 'Back to normal' },
          { id: 'patch', label: 'Make do', preview: 'Morale −6 for 2 months' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt === 'repair') spend(s, 'office', Number(e.ctx.cost));
      else mod(s, -6, 60, 'Broken hardware');
    },
  },
  {
    id: 'tax_audit',
    art: 'audit',
    cooldown: 900,
    weight: (s) => (s.progress.stats.totalRevenue > money(500_000, s.day) ? 0.25 : 0),
    make: ({ s }) => {
      const fine = Math.round(Math.max(money(5_000, s.day), s.company.cash * 0.03));
      return {
        title: 'Tax audit',
        body: 'The tax office has questions about your R&D credits.',
        options: [
          { id: 'settle', label: `Settle (${fmtMoney(fine)})`, preview: 'Pay and move on' },
          { id: 'contest', label: 'Contest it', preview: '55%: pay nothing. 45%: pay double' },
        ],
        ctx: { fine },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const fine = Number(e.ctx.fine);
      if (opt === 'settle') spend(s, 'taxes', fine);
      else if (!rng.chance(0.55)) spend(s, 'taxes', fine * 2);
    },
  },
  {
    id: 'intern',
    art: 'student',
    cooldown: 240,
    weight: (s) => (freeDesks(s) > 0 && yr(s) >= 1984 ? 0.5 : 0),
    make: ({ s, rng }) => {
      const cand = generateCandidate(s, rng, { quality: -20 });
      cand.potential = clamp(cand.potential + 25, 0, 100);
      const salary = Math.round(marketSalary(s, cand.skills) * 0.45);
      return {
        title: 'Eager intern',
        body: `${cand.name}, ${aOrAn(cand.role)} student, begs for an internship. Raw, but full of potential (${cand.potential}).`,
        options: [
          { id: 'hire', label: `Hire as intern (${fmtMoney(salary)}/yr)`, preview: 'A junior with high potential joins' },
          { id: 'no', label: 'Not right now', preview: 'No change' },
        ],
        ctx: { cand: JSON.stringify(cand), salary },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'hire') return;
      const cand = JSON.parse(String(e.ctx.cand));
      const id = newId(s, 's');
      s.staff[id] = candidateToStaff(s, cand, id, Number(e.ctx.salary));
      s.staff[id]!.loyalty = 75;
      s.progress.stats.staffHired += 1;
      assignDesks(s);
    },
  },
  {
    id: 'fan_mail',
    art: 'letters',
    cooldown: 200,
    weight: (s) => (s.releaseOrder.some((id) => s.releases[id]!.score >= 80) ? 0.5 : 0),
    make: ({ s }) => ({
      title: 'A sack of fan mail',
      body: `Players have written in about ${s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]!.name}. Some letters are in crayon.`,
      options: [{ id: 'read', label: 'Read them to the team', preview: 'Studio morale +5 for a month' }],
      ctx: {},
    }),
    resolve: ({ s }) => mod(s, 5, 30, 'Fan mail'),
  },
  {
    id: 'buyout_offer',
    art: 'briefcase',
    cooldown: 720,
    weight: (s) => (s.company.reputation >= 45 && !s.finance.stock ? 0.25 : 0),
    make: ({ s, rng }) => {
      const big = Object.values(s.rivals).filter((r) => r.alive && !r.procedural && r.staff > 200);
      if (!big.length) return null;
      const r = rng.pick(big);
      const price = Math.round(ownerValue(s) * rng.range(1.2, 1.6)); // investors take their share of a buyout
      if (price <= 0) return null;
      return {
        title: `${r.name} wants to buy you`,
        body: `${r.name} offers ${fmtMoney(price)} for ${s.company.name}. Accepting ends your run with a "Sold" ending.`,
        options: [
          { id: 'sell', label: `Sell for ${fmtMoney(price)}`, preview: 'Game ends — scored in the Hall of Fame' },
          { id: 'decline', label: 'We are not for sale', preview: 'Morale +4 (the team loves independence)' },
        ],
        ctx: { rival: r.id, price },
      };
    },
    resolve: ({ s, out }, e, opt) => {
      if (opt === 'sell') {
        earn(s, 'asset_sales', Number(e.ctx.price));
        s.status = 'acquired';
        s.endReason = `Sold to ${s.rivals[String(e.ctx.rival)]?.name} for ${fmtMoney(Number(e.ctx.price))}.`;
        out.push({ type: 'gameOver', reason: s.endReason });
      } else mod(s, 4, 60, 'Stayed independent');
    },
  },
  {
    id: 'hostile_takeover',
    art: 'shark',
    cooldown: 720,
    weight: (s) => (s.finance.stock && s.finance.stock.founderShares / s.finance.stock.shares < 0.5 && s.finance.stock.price < s.finance.stock.ipoPrice * 0.8 ? 0.8 : 0),
    make: ({ s, rng }) => {
      const st = s.finance.stock!;
      const big = Object.values(s.rivals).filter((r) => r.alive && !r.procedural && r.staff > 150);
      if (!big.length) return null;
      const r = rng.pick(big);
      const toBuy = Math.round(st.shares * 0.52 - st.founderShares);
      const defend = Math.round(Math.max(0, toBuy) * st.price * 1.25);
      return {
        title: 'Hostile takeover bid!',
        body: `${r.name} is buying up your shares. Buy back enough stock to keep control, or lose the company.`,
        options: [
          { id: 'defend', label: `Buy back shares (${fmtMoney(defend)})`, preview: 'Requires the cash; keeps control', cost: defend },
          { id: 'lose', label: 'Let it happen', preview: 'Game over — acquired' },
        ],
        ctx: { rival: r.id, defend, toBuy },
      };
    },
    resolve: ({ s, out }, e, opt) => {
      const st = s.finance.stock;
      if (!st) return;
      if (opt === 'defend' && s.company.cash >= Number(e.ctx.defend)) {
        s.company.cash -= Number(e.ctx.defend);
        st.founderShares += Math.max(0, Number(e.ctx.toBuy));
        st.boardMood = clamp(st.boardMood - 10, 0, 100);
      } else {
        s.status = 'acquired';
        s.endReason = `Taken over by ${s.rivals[String(e.ctx.rival)]?.name}.`;
        out.push({ type: 'gameOver', reason: s.endReason });
      }
    },
  },
  {
    id: 'loan_shark',
    art: 'shark',
    cooldown: 180,
    weight: (s) => (s.company.insolventSince !== undefined ? 1.5 : 0),
    make: ({ s }) => {
      const amount = Math.round(Math.max(money(15_000, s.day), -s.company.cash * 1.3));
      return {
        title: 'A "friendly" lender calls',
        body: `A private lender offers ${fmtMoney(amount)} today. The terms are… aggressive.`,
        options: [
          { id: 'take', label: `Take ${fmtMoney(amount)} (repay 160% within a year)`, preview: 'Cash now; heavy monthly payments' },
          { id: 'no', label: 'Hang up', preview: 'No change' },
        ],
        ctx: { amount },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'take') return;
      const amount = Number(e.ctx.amount);
      // ~100% APR over 12 months ≈ 1.6× repaid; interest shows up in the ledger as loan interest
      const rate = 1.0;
      const i = rate / 12;
      s.company.cash += amount;
      s.finance.loans.push({ id: newId(s, 'l'), principal: amount, remaining: amount, rate, monthly: (amount * i) / (1 - Math.pow(1 + i, -12)), monthsLeft: 12, takenDay: s.day });
      s.company.creditScore = clamp(s.company.creditScore - 30, 300, 850);
    },
  },
  {
    id: 'ratings_controversy',
    art: 'megaphone',
    cooldown: 400,
    weight: (s) => (!hasFlag(s, 'ratings') && s.releaseOrder.slice(-1).some((id) => s.releases[id]!.concept.audience === 'mature' && s.day - s.releases[id]!.day < 60) ? 2 : 0),
    make: ({ s }) => {
      const r = s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]!;
      return {
        title: 'Moral panic!',
        body: `Parents' groups and TV pundits are outraged by ${r.name}.`,
        options: [
          { id: 'apologise', label: 'Apologise publicly', preview: 'Reputation −1, sales unaffected' },
          { id: 'lean', label: 'Lean into the controversy', preview: 'Sales potential +20%, reputation −5' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (opt === 'apologise') addRep(s, -(1), 'Apologised for a controversy');
      else {
        addRep(s, -(5), 'Leaned into a controversy');
        if (r) for (const p of r.platforms) p.potential *= 1.2;
      }
    },
  },
  {
    id: 'game_jam',
    art: 'lightbulb',
    cooldown: 240,
    weight: (s) => (staffList(s).length >= 2 ? 0.45 : 0),
    make: () => ({
      title: 'Weekend game jam?',
      body: 'The team wants to host a 48-hour game jam for fresh ideas.',
      options: [
        { id: 'jam', label: 'Let’s jam', preview: 'Morale +6 for 2 months; next game gets a novelty bonus' },
        { id: 'no', label: 'Rest instead', preview: 'Energy refilled' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'jam') {
        mod(s, 6, 60, 'Game jam');
        for (const p of activeGames(s)) p.novelty += 0.03;
      } else for (const st of Object.values(s.staff)) st.energy = 100;
    },
  },
  {
    id: 'charity_bundle',
    art: 'heart',
    cooldown: 500,
    weight: (s) => (yr(s) >= 2010 && s.releaseOrder.length > 2 ? 0.35 : 0),
    make: () => ({
      title: 'Charity bundle invitation',
      body: 'A charity bundle wants one of your older games.',
      options: [
        { id: 'join', label: 'Donate a game', preview: 'Reputation +2, fans +5%' },
        { id: 'no', label: 'Decline', preview: 'No change' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'join') {
        addRep(s, 2, 'Charity bundle');
        s.company.fans *= 1.05;
      }
    },
  },
  {
    id: 'four_day_week',
    art: 'calendar',
    cooldown: 900,
    weight: (s) => (yr(s) >= 2019 && staffList(s).length >= 8 && !s.company.policies.fourDayWeek ? 0.35 : 0),
    make: () => ({
      title: 'Four-day week petition',
      body: 'Staff petition for a four-day work week. Studies say output barely drops.',
      options: [
        { id: 'adopt', label: 'Adopt it', preview: 'Morale +9 permanently, output −12%, burnout heals faster' },
        { id: 'trial', label: 'Promise to review next year', preview: 'Morale −2 for 2 months' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'adopt') s.company.policies.fourDayWeek = true;
      else mod(s, -2, 60, 'Petition deferred');
    },
  },
  {
    id: 'remote_work',
    art: 'house',
    cooldown: 900,
    weight: (s) => (yr(s) >= 2020 && !s.company.policies.remote ? 0.6 : 0),
    make: () => ({
      title: 'Remote work?',
      body: 'Many staff want to keep working from home part of the week.',
      options: [
        { id: 'yes', label: 'Go hybrid', preview: 'Morale +4 permanently; office crowding matters less' },
        { id: 'no', label: 'Back to the office', preview: 'Morale −5 for 3 months' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'yes') s.company.policies.remote = true;
      else mod(s, -5, 90, 'Return-to-office mandate');
    },
  },
  {
    id: 'genai_controversy',
    art: 'robot',
    cooldown: 720,
    weight: (s) => (s.research.done.includes('ai_genai') ? 0.5 : 0),
    make: () => ({
      title: 'AI tools backlash',
      body: 'Players and some staff object to your use of generative AI tools.',
      options: [
        { id: 'disclose', label: 'Publish a clear AI-use policy', preview: 'Reputation +1, morale +3' },
        { id: 'ignore', label: 'Say nothing', preview: 'Reputation −3' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'disclose') {
        addRep(s, 1, 'Clear AI-use policy');
        mod(s, 3, 90, 'Clear AI policy');
      } else addRep(s, -(3), 'AI tools backlash');
    },
  },
  {
    id: 'esports_sponsor',
    art: 'trophy',
    cooldown: 400,
    weight: (s) => (s.research.done.includes('biz_esports') ? 0.4 : 0),
    make: ({ s }) => {
      const cost = money(60_000, s.day);
      return {
        title: 'Sponsor a tournament?',
        body: 'An esports league offers naming rights for its finals.',
        options: [
          { id: 'sponsor', label: `Sponsor (${fmtMoney(cost)})`, preview: 'Fans +8%, reputation +2' },
          { id: 'no', label: 'Pass', preview: 'No change' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'sponsor' || s.company.cash < Number(e.ctx.cost)) return;
      spend(s, 'marketing', Number(e.ctx.cost));
      s.company.fans *= 1.08;
      addRep(s, 2, 'Esports sponsorship');
    },
  },
  {
    id: 'build_leak',
    art: 'leak',
    cooldown: 500,
    weight: (s) => (activeGames(s).some((p) => p.hype > 0.8) ? 0.4 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.hype > 0.8);
      if (!p) return null;
      return {
        title: 'Build leaked!',
        body: `An early build of ${p.concept.name} is circulating online.`,
        options: [
          { id: 'embrace', label: 'Embrace the buzz', preview: 'Hype +0.2, team morale −4' },
          { id: 'legal', label: `Send lawyers (${fmtMoney(money(8_000, s.day))})`, preview: 'Hype unchanged', cost: money(8_000, s.day) },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game') return;
      if (opt === 'embrace') {
        p.hype = Math.min(3, p.hype + 0.2);
        mod(s, -4, 45, 'Leaked build');
      } else spend(s, 'other_expense', money(8_000, e.day));
    },
  },
  {
    id: 'office_party',
    art: 'heart',
    cooldown: 330,
    weight: (s) => (fromDay(s.day).month === 12 && staffList(s).length >= 3 ? 2 : 0),
    make: ({ s }) => {
      const cost = money(150, s.day) * Object.keys(s.staff).length;
      return {
        title: 'Holiday party?',
        body: 'It’s December. The team is hoping for an end-of-year celebration.',
        options: [
          { id: 'party', label: `Throw a party (${fmtMoney(cost)})`, preview: 'Morale +8 for 2 months, loyalty +5', cost },
          { id: 'bonus', label: `Small cash bonus instead (${fmtMoney(cost * 2)})`, preview: 'Morale +5, loyalty +10', cost: cost * 2 },
          { id: 'no', label: 'Skip it this year', preview: 'Morale −4 for a month' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const cost = Number(e.ctx.cost);
      if (opt === 'party') {
        spend(s, 'other_expense', cost);
        mod(s, 8, 60, 'Holiday party');
        for (const st of Object.values(s.staff)) st.loyalty = clamp(st.loyalty + 5, 0, 100);
      } else if (opt === 'bonus') {
        spend(s, 'salaries', cost * 2);
        mod(s, 5, 45, 'Year-end bonus');
        for (const st of Object.values(s.staff)) st.loyalty = clamp(st.loyalty + 10, 0, 100);
      } else mod(s, -4, 30, 'No holiday party');
    },
  },
  {
    id: 'review_bomb',
    art: 'megaphone',
    cooldown: 500,
    weight: (s) => {
      if (yr(s) < 2010) return 0;
      const last = s.releaseOrder.length ? s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]! : undefined;
      if (!last || s.day - last.day > 90) return 0;
      const base = last.concept.monetization !== 'premium' ? 0.8 : 0.2;
      // a healthy community talks people down; a toxic one piles on
      return s.community ? base * (s.community.health < 35 ? 1.5 : s.community.health > 70 ? 0.4 : 1) : base;
    },
    make: ({ s }) => {
      const r = s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]!;
      return {
        title: 'Review bomb!',
        body: `Angry players are flooding stores with 1-star reviews of ${r.name}.`,
        options: [
          { id: 'listen', label: `Listen and promise changes (${fmtMoney(money(8_000, s.day))})`, preview: s.community && s.community.health < 35 ? 'A toxic community barely believes you: user score +2' : 'User score +4, fans +3%', cost: money(8_000, s.day) },
          { id: 'ignore', label: 'Ride it out', preview: s.community && s.community.health < 35 ? 'User score −10 (your community piles on)' : 'User score −6' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r) return;
      const toxic = !!s.community && s.community.health < 35;
      if (opt === 'listen' && s.company.cash >= money(8_000, e.day)) {
        spend(s, 'other_expense', money(8_000, e.day)); // the work you promised
        r.userScore = clamp(r.userScore + (toxic ? 2 : 4), 1, 100);
        if (!toxic) s.company.fans *= 1.03;
        communityNudge(s, 6);
      } else {
        r.userScore = clamp(r.userScore - (toxic ? 10 : 6), 1, 100);
        communityNudge(s, -8);
      }
    },
  },
  {
    id: 'piracy_drm',
    art: 'leak',
    cooldown: 900,
    weight: (s) => (yr(s) >= 1995 && yr(s) <= 2015 && activeGames(s).some((p) => p.concept.platforms.includes('pc')) ? 0.5 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.concept.platforms.includes('pc'));
      if (!p) return null;
      return {
        title: 'Piracy worries',
        body: `Sales and marketing want strict DRM on the PC version of ${p.concept.name}.`,
        options: [
          { id: 'drm', label: `License strict DRM (${fmtMoney(money(12_000, s.day))})`, preview: 'Hype −0.1 (players hate it)', cost: money(12_000, s.day) },
          { id: 'none', label: 'Ship DRM-free', preview: 'Reputation +2 with players' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (opt === 'drm') {
        spend(s, 'other_expense', money(12_000, e.day));
        if (p && p.kind === 'game') p.hype = Math.max(0, p.hype - 0.1);
      } else addRep(s, 2, 'Shipped DRM-free');
    },
  },
  {
    id: 'sequel_demand',
    art: 'letters',
    cooldown: 720,
    weight: (s) => (Object.values(s.franchises).some((f) => f.bestScore >= 80 && s.day - f.lastDay > 500 && f.fans > 20_000) ? 0.6 : 0),
    make: ({ s }) => {
      const f = Object.values(s.franchises)
        .filter((x) => x.bestScore >= 80 && s.day - x.lastDay > 500)
        .sort((a, b) => b.fans - a.fans)[0];
      if (!f) return null;
      return {
        title: `Fans want more ${f.name}`,
        body: `A petition with ${(Math.round(f.fans / 100) * 100).toLocaleString()} signatures asks for a new ${f.name} game.`,
        options: [
          { id: 'tease', label: 'Tease a sequel', preview: 'Franchise fans +15%; fatigue reset' },
          { id: 'thank', label: 'Thank them, promise nothing', preview: 'Reputation +1' },
        ],
        ctx: { fr: f.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const f = s.franchises[String(e.ctx.fr)];
      if (!f) return;
      if (opt === 'tease') {
        f.fans *= 1.15;
        f.fatigue = 0;
      } else addRep(s, 1, 'Grateful to the fans');
    },
  },
  {
    id: 'free_devkit',
    art: 'contract',
    cooldown: 720,
    weight: (s) => (s.company.reputation >= 30 ? 0.4 : 0),
    make: ({ s }) => {
      const fresh = Object.keys(s.market.share).filter((id) => !s.devkits.includes(id) && (s.market.share[id] ?? 0) > 0.05);
      if (!fresh.length) return null;
      const pid = fresh[0]!;
      return {
        title: 'A platform holder comes calling',
        body: 'A platform team offers you a free development kit if you support their system.',
        options: [
          { id: 'take', label: 'Accept the dev kit', preview: 'Free dev kit for a popular platform' },
          { id: 'no', label: 'Not interested', preview: 'No change' },
        ],
        ctx: { platform: pid },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt === 'take' && !s.devkits.includes(String(e.ctx.platform))) {
        s.devkits.push(String(e.ctx.platform));
        pushNews(s, { category: 'studio', headline: `${s.company.name} receives a free dev kit`, tone: 'good' });
      }
    },
  },
  {
    id: 'speedrunners',
    art: 'trophy',
    cooldown: 720,
    weight: (s) => (yr(s) >= 2004 && s.releaseOrder.some((id) => ['platformer', 'action', 'racing', 'shooter'].includes(s.releases[id]!.concept.genre) && s.releases[id]!.score >= 75) ? 0.35 : 0),
    make: ({ s }) => {
      const r = s.releaseOrder
        .map((id) => s.releases[id]!)
        .filter((x) => x.score >= 75 && !x.delisted)
        .pop();
      if (!r) return null;
      return {
        title: 'Speedrunners adore your game',
        body: `${r.name} is a hit at a charity speedrun marathon.`,
        options: [
          { id: 'support', label: `Sponsor the marathon (${fmtMoney(money(5_000, s.day))})`, preview: 'Fans +5%, reputation +1, sales bump', cost: money(5_000, s.day) },
          { id: 'enjoy', label: 'Just enjoy the moment', preview: 'Small sales bump' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (r) {
        for (const p of r.platforms) p.potential *= opt === 'support' ? 1.08 : 1.03;
        r.active = true;
      }
      if (opt === 'support') {
        spend(s, 'marketing', money(5_000, e.day));
        s.company.fans *= 1.05;
        addRep(s, 1, 'Sponsored a charity marathon');
      }
    },
  },
  {
    id: 'mentorship',
    art: 'student',
    cooldown: 400,
    weight: (s) => (staffList(s).some((x) => x.level === 'lead') && staffList(s).some((x) => x.level === 'junior') ? 0.5 : 0),
    make: ({ s }) => {
      const lead = staffList(s).find((x) => x.level === 'lead');
      if (!lead) return null;
      return {
        title: 'Mentorship programme',
        body: `${lead.name} offers to run weekly mentoring sessions for the juniors.`,
        options: [
          { id: 'yes', label: 'Great idea', preview: 'Juniors gain skill and loyalty; the mentor gets tired' },
          { id: 'no', label: 'Keep focused on shipping', preview: 'No change' },
        ],
        ctx: { lead: lead.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'yes') return;
      const lead = staffById(s, e.ctx.lead);
      for (const st of staffList(s)) {
        if (st.level !== 'junior') continue;
        const best = (Object.keys(st.skills) as (keyof typeof st.skills)[]).reduce((a, b) => (st.skills[a] >= st.skills[b] ? a : b));
        st.skills[best] = Math.min(st.potential, st.skills[best] + 4);
        st.loyalty = clamp(st.loyalty + 5, 0, 100);
      }
      if (lead) lead.energy = clamp(lead.energy - 20, 0, 100);
    },
  },
  {
    id: 'patent_troll',
    art: 'audit',
    cooldown: 1200,
    weight: (s) => (s.progress.stats.totalRevenue > money(2_000_000, s.day) ? 0.2 : 0),
    make: ({ s }) => {
      const fee = Math.round(Math.max(money(20_000, s.day), s.company.cash * 0.02));
      return {
        title: 'Patent claim',
        body: 'A company you’ve never heard of claims your engine infringes a vague patent.',
        options: [
          { id: 'settle', label: `Settle quietly (${fmtMoney(fee)})`, preview: 'Pay and move on' },
          { id: 'fight', label: `Fight it in court (${fmtMoney(fee / 2)} legal fees)`, preview: '65%: win and gain reputation. 35%: pay double' },
        ],
        ctx: { fee },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const fee = Number(e.ctx.fee);
      if (opt === 'settle') spend(s, 'other_expense', fee);
      else {
        spend(s, 'other_expense', fee / 2);
        if (rng.chance(0.65)) {
          addRep(s, 2, 'Beat a patent troll');
          pushNews(s, { category: 'studio', headline: `${s.company.name} defeats patent claim`, tone: 'good' });
        } else spend(s, 'other_expense', fee * 2);
      }
    },
  },
  {
    id: 'magazine_cover',
    art: 'press',
    cooldown: 500,
    weight: (s) => (yr(s) < 2012 && activeGames(s).some((p) => p.announcedDay !== undefined) && s.company.reputation > 20 ? 0.5 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.announcedDay !== undefined);
      if (!p) return null;
      return {
        title: 'Cover story offer',
        body: `A leading magazine wants ${p.concept.name} on its cover — if you pay for an exclusive photo shoot.`,
        options: [
          { id: 'yes', label: `Do the shoot (${fmtMoney(money(6_000, s.day))})`, preview: 'Hype +0.35', cost: money(6_000, s.day) },
          { id: 'no', label: 'Pass', preview: 'No change' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (opt !== 'yes' || !p || p.kind !== 'game') return;
      spend(s, 'marketing', money(6_000, e.day));
      p.hype = Math.min(3, p.hype + 0.35);
    },
  },
  // ── Grassroots (help small studios get noticed) ───────────────────────────
  {
    id: 'club_demo_night',
    art: 'crowd',
    cooldown: 400,
    weight: (s) => (yr(s) < 1995 && s.company.reputation < 25 && s.releaseOrder.length > 0 ? 0.6 : 0),
    make: ({ s }) => {
      const last = s.releases[s.releaseOrder[s.releaseOrder.length - 1]!];
      if (!last) return null;
      return {
        title: 'Computer club demo night',
        body: `The local computer club invites you to show ${last.name} at their monthly meeting. Mostly hobbyists — but one of them writes for a magazine.`,
        options: [
          { id: 'go', label: 'Bring the floppies (a day off work)', preview: 'Reputation +3; games in development get a little hype' },
          { id: 'skip', label: 'Too busy', preview: 'No change' },
        ],
        ctx: {},
      };
    },
    resolve: ({ s }, _e, opt) => {
      if (opt !== 'go') return;
      addRep(s, 3, 'Demo night at the computer club');
      for (const p of activeGames(s)) p.hype = Math.min(3, p.hype + 0.15);
    },
  },
  {
    id: 'online_game_jam',
    art: 'lightbulb',
    cooldown: 500,
    weight: (s) => (yr(s) >= 2005 && s.company.reputation < 35 && staffList(s).length + 1 <= 12 ? 0.5 : 0),
    make: ({ s }) => ({
      title: 'A weekend game jam',
      body: 'A popular online game jam starts this weekend. Your team could enter — 48 hours, one theme, no sleep.',
      options: [
        { id: 'enter', label: 'Enter as a team', preview: 'Reputation +3, morale +5 for a month, everyone a bit tired' },
        { id: 'host', label: `Sponsor the jam (${fmtMoney(money(4_000, s.day))})`, preview: 'Reputation +4, a talented candidate joins the hiring pool', cost: money(4_000, s.day) },
        { id: 'skip', label: 'Rest instead', preview: 'No change' },
      ],
      ctx: {},
    }),
    resolve: (c, _e, opt) => {
      const { s } = c;
      if (opt === 'enter') {
        addRep(s, 3, 'Game jam entry went viral');
        mod(s, 5, 30, 'Game jam buzz');
        for (const st of Object.values(s.staff)) st.energy = Math.max(10, st.energy - 25);
      } else if (opt === 'host' && s.company.cash >= money(4_000, s.day)) {
        spend(s, 'marketing', money(4_000, s.day));
        addRep(s, 4, 'Sponsored a game jam');
        const cand = generateCandidate(s, c.rng, { quality: 25 });
        cand.potential = Math.min(100, cand.potential + 15);
        s.candidates.push(cand);
      }
    },
  },
  // ── Your legacy ───────────────────────────────────────────────────────────
  {
    id: 'movie_deal',
    art: 'press',
    cooldown: 1500,
    weight: (s) => (yr(s) >= 1990 && bigFranchise(s) ? 0.3 : 0),
    make: ({ s }) => {
      const fr = bigFranchise(s);
      if (!fr) return null;
      if ((s.mediaDeals ?? []).some((d) => d.franchiseId === fr.id && d.kind === 'movie' && s.day - d.startDay < 365 * 4)) return null; // already making one
      const fee = Math.round(money(500_000, s.day) * Math.min(4, fr.fans / 1_000_000));
      const coCost = money(800_000, s.day);
      return {
        title: `Hollywood wants ${fr.name}`,
        body: `A film studio wants to turn ${fr.name} into a movie. Game adaptations have a… mixed record.`,
        options: [
          { id: 'license', label: `Sell the film rights (+${fmtMoney(fee)})`, preview: '50%: a hit, fans +15%. 50%: a stinker, fans −8%, reputation −2' },
          { id: 'coproduce', label: `Co-produce and keep control (${fmtMoney(coCost)})`, preview: '75%: a hit, fans +25%, reputation +3. 25%: a flop, fans −5%', cost: coCost },
          { id: 'decline', label: 'Decline', preview: 'No change' },
        ],
        ctx: { fr: fr.id, fee, coCost },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const fr = s.franchises[String(e.ctx.fr)];
      if (!fr || opt === 'decline') return;
      if (opt === 'coproduce' && s.company.cash < Number(e.ctx.coCost)) return;
      // record it as a film deal so licensing respects the same gap
      const fans0 = fr.fans;
      const record = (fee: number) => {
        const out = fr.fans > fans0 ? 'hit' : fr.fans < fans0 ? 'flop' : 'fine';
        (s.mediaDeals ??= []).push({ id: `md${s.day}_movie_${fr.id}`, franchiseId: fr.id, name: fr.name, kind: 'movie', control: opt === 'coproduce' ? 'involved' : 'licensed', startDay: s.day, releaseDay: s.day, fee, outcome: out });
      };
      if (opt === 'license') {
        earn(s, 'licensing', Number(e.ctx.fee));
        if (rng.chance(0.5)) {
          fr.fans = Math.round(fr.fans * 1.15);
          pushNews(s, { category: 'industry', headline: `The ${fr.name} movie is a surprise box-office hit`, tone: 'good' });
        } else {
          fr.fans = Math.round(fr.fans * 0.92);
          addRep(s, -2, `The ${fr.name} movie flopped`);
          pushNews(s, { category: 'industry', headline: `Critics savage the ${fr.name} movie`, tone: 'bad' });
        }
      } else if (s.company.cash >= Number(e.ctx.coCost)) {
        spend(s, 'marketing', Number(e.ctx.coCost));
        if (rng.chance(0.75)) {
          fr.fans = Math.round(fr.fans * 1.25);
          addRep(s, 3, `The ${fr.name} movie was a hit`);
          pushNews(s, { category: 'industry', headline: `${fr.name} conquers cinemas — and sends fans back to the games`, tone: 'good' });
        } else {
          fr.fans = Math.round(fr.fans * 0.95);
          pushNews(s, { category: 'industry', headline: `The ${fr.name} movie underwhelms at the box office`, tone: 'bad' });
        }
      }
      record(opt === 'license' ? Number(e.ctx.fee) : 0);
    },
  },
  {
    id: 'retro_mini',
    art: 'console',
    cooldown: 2500,
    weight: (s) => (yr(s) >= 2016 && retroClassics(s).length >= 3 ? 0.3 : 0),
    make: ({ s }) => {
      const games = retroClassics(s).slice(0, 8);
      if (games.length < 3) return null;
      const fee = money(60_000, s.day) * games.length;
      return {
        title: 'A mini console of your classics',
        body: `A hardware maker wants to put ${games.length} of your old games — ${games
          .slice(0, 3)
          .map((g) => g.name)
          .join(', ')}${games.length > 3 ? '…' : ''} — on a nostalgic plug-and-play mini console.`,
        options: [
          { id: 'yes', label: `License them (+${fmtMoney(fee)})`, preview: 'Cash, reputation +1, fans of those franchises +5%' },
          { id: 'no', label: 'Keep the classics in the vault', preview: 'No change' },
        ],
        ctx: { fee, ids: games.map((g) => g.id).join(',') },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'yes') return;
      earn(s, 'licensing', Number(e.ctx.fee));
      addRep(s, 1, 'Classics re-released on a mini console');
      const fids = new Set(String(e.ctx.ids).split(',').map((id) => s.releases[id]?.concept.franchiseId).filter((x): x is string => !!x));
      for (const fid of fids) {
        const fr = s.franchises[fid];
        if (fr) fr.fans = Math.round(fr.fans * 1.05);
      }
      pushNews(s, { category: 'studio', headline: `${s.company.name} classics return on a retro mini console`, tone: 'good' });
    },
  },
  // ── Your own hardware ─────────────────────────────────────────────────────
  {
    id: 'hw_defect',
    art: 'console',
    cooldown: 900,
    weight: (s) => (liveHw(s).some((h) => s.day - h.launchDay > 60 && s.day - h.launchDay < 3 * 365 && h.installedM > 0.2) ? 0.5 : 0),
    make: ({ s }) => {
      const hw = liveHw(s).find((h) => s.day - h.launchDay > 60 && s.day - h.launchDay < 3 * 365 && h.installedM > 0.2);
      if (!hw) return null;
      const recall = Math.round(hw.installedM * 1e6 * 0.25 * money(8, s.day));
      return {
        title: `${hw.name} units are failing`,
        body: `Forums are full of owners reporting a fault that bricks their ${hw.name}. Retailers are asking what you'll do about it.`,
        options: [
          { id: 'recall', label: `Free repairs for everyone (${fmtMoney(recall)})`, preview: 'Expensive, but reputation +2 and buyers trust the brand', cost: recall },
          { id: 'warranty', label: `Quietly extend the warranty (${fmtMoney(recall * 0.4)})`, preview: 'Cheaper; reputation −3', cost: recall * 0.4 },
          { id: 'deny', label: 'Deny there is a problem', preview: 'Free; reputation −8 and hardware sales slump' },
        ],
        ctx: { hw: hw.id, recall },
      };
    },
    resolve: ({ s }, e, opt) => {
      const hw = s.hardware.find((h) => h.id === e.ctx.hw);
      if (!hw) return;
      const recall = Number(e.ctx.recall);
      if (opt === 'recall') {
        spend(s, 'manufacturing', recall);
        addRep(s, 2, `Fixed every faulty ${hw.name}`);
        hw.boost += 0.05;
      } else if (opt === 'warranty') {
        spend(s, 'manufacturing', recall * 0.4);
        addRep(s, -3, `${hw.name} fault handled quietly`);
      } else {
        addRep(s, -8, `Denied the ${hw.name} hardware fault`);
        hw.boost = Math.max(-0.4, hw.boost - 0.35);
        pushNews(s, { category: 'studio', headline: `${s.company.name} denies ${hw.name} fault as complaints pile up`, tone: 'bad' });
      }
    },
  },
  {
    id: 'hw_piracy',
    art: 'console',
    cooldown: 1200,
    weight: (s) => (liveHw(s).some((h) => s.day - h.launchDay > 365) ? 0.35 : 0),
    make: ({ s }) => {
      const hw = liveHw(s).find((h) => s.day - h.launchDay > 365);
      if (!hw) return null;
      const patch = money(400_000, s.day);
      return {
        title: `The ${hw.name} has been cracked`,
        body: `Hackers have published a way to run copied games on the ${hw.name}. Publishers on your platform are nervous.`,
        options: [
          { id: 'patch', label: `Rush out a security update (${fmtMoney(patch)})`, preview: 'Closes the hole', cost: patch },
          { id: 'sue', label: `Take the hackers to court (${fmtMoney(patch / 3)})`, preview: '60%: shut it down. 40%: bad press, reputation −3, piracy spreads', cost: patch / 3 },
          { id: 'ignore', label: 'Ignore it', preview: 'More consoles sell, but software and licence fees drop for 18 months' },
        ],
        ctx: { hw: hw.id, patch },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const hw = s.hardware.find((h) => h.id === e.ctx.hw);
      if (!hw) return;
      const piracy = () => {
        hw.boost += 0.15;
        s.market.modifiers.push({ target: `platform:${hw.id}`, mul: 0.8, startDay: s.day, untilDay: s.day + 548 });
      };
      if (opt === 'patch') spend(s, 'hardware_rd', Number(e.ctx.patch));
      else if (opt === 'sue') {
        spend(s, 'other_expense', Number(e.ctx.patch) / 3);
        if (!rng.chance(0.6)) {
          addRep(s, -3, 'Sued console hackers and lost');
          piracy();
        }
      } else piracy();
    },
  },
  {
    id: 'hw_retailer',
    art: 'console',
    cooldown: 700,
    weight: (s) => (liveHw(s).some((h) => s.day - h.launchDay > 180) ? 0.45 : 0),
    make: ({ s, rng }) => {
      const hws = liveHw(s).filter((h) => s.day - h.launchDay > 180);
      if (!hws.length) return null;
      const hw = rng.pick(hws);
      const bonus = money(rng.int(3, 8) * 100_000, s.day);
      return {
        title: 'A holiday bundle deal',
        body: `A national retail chain wants an exclusive ${hw.name} holiday bundle. They'll pay a marketing fee, but they want 10% off the shelf price.`,
        options: [
          { id: 'accept', label: `Accept (+${fmtMoney(bonus)})`, preview: 'Price −10%; a burst of hardware sales' },
          { id: 'decline', label: 'Decline', preview: 'No change' },
        ],
        ctx: { hw: hw.id, bonus },
      };
    },
    resolve: ({ s }, e, opt) => {
      const hw = s.hardware.find((h) => h.id === e.ctx.hw);
      if (!hw || opt !== 'accept') return;
      earn(s, 'other_income', Number(e.ctx.bonus));
      hw.price = Math.max(1, Math.round(hw.price * 0.9));
      hw.boost += 0.2;
    },
  },
  // ── The modern scene ──────────────────────────────────────────────────────
  {
    id: 'streamer_spotlight',
    art: 'crowd',
    cooldown: 300,
    weight: (s) => (yr(s) >= 2011 && recentHit(s, 730, 70) ? 0.45 : 0),
    make: ({ s }) => {
      const r = recentHit(s, 730, 70);
      if (!r) return null;
      const cost = money(15_000, s.day);
      return {
        title: `${r.name} is all over the streams`,
        body: `One of the biggest streamers just played ${r.name} for six hours straight, and chat loved it.`,
        options: [
          { id: 'sponsor', label: `Sponsor a follow-up stream (${fmtMoney(cost)})`, preview: 'Sales potential +12%, studio fans +4%', cost: cost },
          { id: 'thanks', label: 'Send a thank-you note', preview: 'Sales potential +5%' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r) return;
      const cost = money(15_000, e.day);
      const sponsor = opt === 'sponsor' && s.company.cash >= cost;
      if (sponsor) {
        spend(s, 'marketing', cost);
        s.company.fans *= 1.04;
      }
      for (const ps of r.platforms) ps.potential *= sponsor ? 1.12 : 1.05;
      r.active = true;
    },
  },
  {
    id: 'leaked_build',
    art: 'leak',
    cooldown: 900,
    weight: (s) => (yr(s) >= 1996 && activeGames(s).some((p) => p.phase >= 1 && p.phase < 3) ? 0.2 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.phase >= 1 && x.phase < 3);
      if (!p) return null;
      const cost = money(20_000, s.day);
      return {
        title: `An early build of ${p.concept.name} has leaked`,
        body: 'Screenshots and a playable alpha are spreading online. Fans are… curious.',
        options: [
          { id: 'legal', label: `Send the lawyers (${fmtMoney(cost)})`, preview: 'Contained: no other effect', cost: cost },
          { id: 'embrace', label: 'Lean in: “yes, it’s real”', preview: 'Hype +0.3, reputation −1' },
          { id: 'ignore', label: 'Say nothing', preview: 'Hype +0.15, team morale −4 for a month' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      const cost = money(20_000, e.day);
      if (opt === 'legal') {
        if (s.company.cash >= cost) spend(s, 'other_expense', cost);
        return;
      }
      if (!p || p.kind !== 'game') return;
      if (opt === 'embrace') {
        p.hype = Math.min(3, p.hype + 0.3);
        addRep(s, -1, 'Leaked build');
      } else {
        p.hype = Math.min(3, p.hype + 0.15);
        mod(s, -4, 30, 'The leak');
      }
    },
  },
  {
    id: 'speedrun_record',
    art: 'trophy',
    cooldown: 800,
    weight: (s) => (yr(s) >= 2008 && oldClassic(s) ? 0.3 : 0),
    make: ({ s }) => {
      const r = oldClassic(s);
      if (!r) return null;
      const cost = money(10_000, s.day);
      return {
        title: `A ${r.name} speedrun goes viral`,
        body: `A runner just shaved 11 seconds off the ${r.name} world record with a glitch your team never knew about.`,
        options: [
          { id: 'event', label: `Host a speedrun showcase (${fmtMoney(cost)})`, preview: 'Reputation +2, franchise fans +10%, the game sells again', cost: cost },
          { id: 'cheer', label: 'Cheer from the sidelines', preview: 'Franchise fans +3%' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r) return;
      const fr = r.concept.franchiseId ? s.franchises[r.concept.franchiseId] : undefined;
      const cost = money(10_000, e.day);
      if (opt === 'event' && s.company.cash >= cost) {
        spend(s, 'marketing', cost);
        addRep(s, 2, 'Speedrun showcase');
        if (fr) fr.fans *= 1.1;
        for (const ps of r.platforms) ps.potential *= 1.04;
        r.active = true;
      } else if (fr) fr.fans *= 1.03;
    },
  },
  {
    id: 'office_cat',
    art: 'heart',
    cooldown: 3000,
    weight: (s) => (staffList(s).length >= 3 && !s.eventCooldowns.office_cat_adopted ? 0.15 : 0),
    make: () => ({
      title: 'A stray cat wanders into the office',
      body: 'It has claimed the warmest keyboard and refuses to leave. The team is smitten.',
      options: [
        { id: 'adopt', label: 'Adopt the studio cat', preview: 'Morale +4 for two years' },
        { id: 'shelter', label: 'Take it to a shelter', preview: 'No change' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt !== 'adopt') return;
      mod(s, 4, 730, 'The studio cat');
      s.eventCooldowns.office_cat_adopted = s.day + 1e7;
      pushNews(s, { category: 'studio', headline: `${s.company.name} adopts a studio cat`, body: 'Productivity is unchanged. Morale is way up.', tone: 'good' });
    },
  },
  {
    id: 'localization_offer',
    art: 'handshake',
    cooldown: 600,
    weight: (s) => (yr(s) >= 1994 && recentHit(s, 365, 72) ? 0.3 : 0),
    make: ({ s }) => {
      const r = recentHit(s, 365, 72);
      if (!r) return null;
      const cost = Math.round(money(12_000, s.day) * (r.concept.size === 'aaa' ? 4 : r.concept.size === 'large' ? 2 : 1));
      return {
        title: `Localize ${r.name}?`,
        body: `A translation studio offers to bring ${r.name} to Japanese, German, French and Brazilian players.`,
        options: [
          { id: 'yes', label: `Localize it (${fmtMoney(cost)})`, preview: 'Sales potential +10% on every platform', cost: cost },
          { id: 'no', label: 'English is enough', preview: 'No change' },
        ],
        ctx: { rel: r.id, cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      const cost = Number(e.ctx.cost);
      if (opt !== 'yes' || !r || s.company.cash < cost) return;
      spend(s, 'other_expense', cost);
      for (const ps of r.platforms) ps.potential *= 1.1;
      r.active = true;
    },
  },
  {
    id: 'voice_strike',
    art: 'conflict',
    cooldown: 1200,
    weight: (s) => (yr(s) >= 2016 && activeGames(s).some((p) => p.phase >= 1 && p.phase < 3 && p.concept.size !== 'small') ? 0.2 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.phase >= 1 && x.phase < 3 && x.concept.size !== 'small');
      if (!p) return null;
      const cost = money(40_000, s.day);
      return {
        title: 'Voice actors are on strike',
        body: `The performers' union is striking over pay and AI clauses. ${p.concept.name}'s recording sessions are on hold.`,
        options: [
          { id: 'agree', label: `Sign the union's terms (${fmtMoney(cost)})`, preview: 'Reputation +2, recording resumes', cost: cost },
          { id: 'wait', label: 'Wait it out', preview: 'Release slips by about a month' },
          { id: 'cut', label: 'Ship with text only', preview: 'Hype −0.2' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      const cost = money(40_000, e.day);
      if (opt === 'agree' && s.company.cash >= cost) {
        spend(s, 'salaries', cost);
        addRep(s, 2, 'Fair deal for performers');
        return;
      }
      if (!p || p.kind !== 'game') return;
      if (opt === 'wait') p.extraDays += 30;
      else if (opt === 'cut') p.hype = Math.max(0, p.hype - 0.2);
    },
  },
];

const DEF_BY_ID = Object.fromEntries(EVENT_DEFS.map((d) => [d.id, d]));

/** Weekly roll for a random event. */
/** Raise a specific event now (scheduled events such as the shareholder meeting). */
export function fireEvent(c: Ctx, defId: string): boolean {
  const { s } = c;
  const def = DEF_BY_ID[defId];
  if (!def || s.pendingEvents.some((e) => e.defId === defId) || (s.eventCooldowns[defId] ?? -1) > s.day) return false;
  const made = def.make(c);
  if (!made) return false;
  s.nextEventUid += 1;
  const inst: EventInstance = { uid: s.nextEventUid, defId: def.id, day: s.day, title: made.title, body: made.body, options: made.options, ctx: made.ctx, expiresDay: s.day + 21, art: def.art };
  s.pendingEvents.push(inst);
  s.eventCooldowns[def.id] = s.day + def.cooldown;
  c.out.push({ type: 'event', uid: inst.uid });
  return true;
}

export function rollRandomEvent(c: Ctx): void {
  const { s, rng } = c;
  if (s.pendingEvents.length >= 2) return;
  // New studios get a quiet first few months.
  if (s.day - toDay(s.settings.startYear, 1, 1) < 150) return;
  if (!rng.chance(0.16)) return;
  const eligible = EVENT_DEFS.filter((d) => (s.eventCooldowns[d.id] ?? -1) <= s.day && d.weight(s) > 0);
  if (!eligible.length) return;
  const def = rng.weighted(eligible, (d) => d.weight(s));
  const made = def.make(c);
  if (!made) return;
  s.nextEventUid += 1;
  const inst: EventInstance = {
    uid: s.nextEventUid,
    defId: def.id,
    day: s.day,
    title: made.title,
    body: made.body,
    options: made.options,
    ctx: made.ctx,
    expiresDay: s.day + 21,
    art: def.art,
  };
  s.pendingEvents.push(inst);
  s.eventCooldowns[def.id] = s.day + def.cooldown;
  c.out.push({ type: 'event', uid: inst.uid });
}

export function resolveEvent(c: Ctx, uid: number, optionId: string): boolean {
  const { s } = c;
  const idx = s.pendingEvents.findIndex((e) => e.uid === uid);
  if (idx < 0) return false;
  const inst = s.pendingEvents[idx]!;
  const opt = inst.options.find((o) => o.id === optionId);
  if (!opt || opt.disabled) return false;
  if (opt.cost !== undefined && s.company.cash < opt.cost) return false; // the money isn't there any more
  s.pendingEvents.splice(idx, 1);
  DEF_BY_ID[inst.defId]?.resolve(c, inst, optionId);
  return true;
}

/** Events the player ignores resolve to their last (safest/default) option. */
export function expireEvents(c: Ctx): void {
  const { s } = c;
  for (const e of [...s.pendingEvents]) {
    if (e.expiresDay <= s.day) {
      const last = [...e.options].reverse().find((o) => !o.disabled && (o.cost === undefined || s.company.cash >= o.cost));
      // nothing you can take any more: the moment passes without an outcome (never stuck pending)
      if (!last || !resolveEvent(c, e.uid, last.id)) s.pendingEvents = s.pendingEvents.filter((x) => x.uid !== e.uid);
    }
  }
}
