/**
 * Player commands. Every UI interaction (and every bot decision) goes through dispatch(), which
 * validates and applies the action deterministically.
 */
import { BALANCE } from '../data/balance';
import { ENGINE_BY_ID } from '../data/engines';
import { ITEM_BY_ID, type ItemId } from '../data/facilities';
import { GENRE_BY_ID } from '../data/genres';
import { CHANNELS, TRADE_SHOWS } from '../data/marketing';
import { RESEARCH_BY_ID } from '../data/research';
import { TOPIC_BY_ID } from '../data/topics';
import type { Audience, GenreId, Monetization, Skill } from '../data/types';
import { clamp } from './breakdown';
import { fromDay } from './calendar';
import type { Ctx, SimEvent } from './ctx';
import { Rng } from './rng';
import { engineBuildPoints, engineTechFor, phaseLength } from './systems/dev';
import { resolveEvent } from './systems/events';
import { MARKETING, canDesignConsole, consoleSpec, mediaFor, priceBounds, projectsTargeting, retireConsole, type ConsoleKind, type ConsoleMarketing, type ConsoleTier } from './systems/hardware';
import { applyPatch, applyPort, canPatch, canRemaster, patchCost, portCost } from './systems/release';
import { creditLimit, doIPO, ipoEligible, ipValue, repayLoan, secondaryOffering, takeLoan } from './systems/finance';
import { isPlatformAvailable, platformInfo } from './systems/market';
import { assignDesks, canPlace, freeDesks, tierDef, touchOffice } from './systems/office';
import { researchAvailable, researchCost } from './systems/research';
import { candidateToStaff, marketSalary, refreshCandidates, removeStaff, vacationBlocked } from './systems/staff';
import { FRANCHISES } from '../data/franchises';
import { parseYM } from './calendar';
import type { Focus3, GameProject, GameState, Size, Specialisation } from './types';
import { addRep, earn, fmtMoney, hasFlag, inflation, money, newId, pushNews, spend } from './util';

export interface StartGamePayload {
  name: string;
  genre: GenreId;
  topic: string;
  platforms: string[];
  audience: Audience;
  size: Size;
  monetization: Monetization;
  engineId: string;
  franchiseId?: string;
  dealId?: string;
  remasterOf?: string;
  team: string[];
  focus?: [Focus3, Focus3, Focus3];
}

export type Action =
  | { type: 'startGame'; game: StartGamePayload }
  | { type: 'setFocus'; projectId: string; phase: 0 | 1 | 2; focus: Focus3 }
  | { type: 'continueGate'; projectId: string }
  | { type: 'setTeam'; projectId: string; team: string[] }
  | { type: 'setCrunch'; projectId: string; on: boolean }
  | { type: 'delay'; projectId: string; weeks: number }
  | { type: 'cutFeatures'; projectId: string }
  | { type: 'announce'; projectId: string }
  | { type: 'cancelProject'; projectId: string }
  | { type: 'marketing'; projectId: string; channel: string }
  | { type: 'tradeShow'; show: string; booth: 0 | 1 | 2 }
  | { type: 'hire'; candidateId: string; salary?: number }
  | { type: 'fire'; staffId: string }
  | { type: 'setSalary'; staffId: string; salary: number }
  | { type: 'assign'; staffId: string; to: 'idle' | 'research' }
  | { type: 'train'; staffId: string; skill: Skill }
  | { type: 'setSpec'; staffId: string; spec: Specialisation }
  | { type: 'placeItem'; item: ItemId; floor: number; x: number; y: number; rot: 0 | 1 }
  | { type: 'moveItem'; id: string; floor: number; x: number; y: number; rot: 0 | 1 }
  | { type: 'sellItem'; id: string }
  | { type: 'moveOffice'; tier: number }
  | { type: 'research'; id: string }
  | { type: 'queueResearch'; id: string }
  | { type: 'cancelResearch' }
  | { type: 'buildEngine'; name: string; features: string[]; team: string[] }
  | { type: 'licenseEngine'; engineDef: string }
  | { type: 'licenseOut'; engineId: string }
  | { type: 'acceptContract'; offerId: string; team: string[] }
  | { type: 'takeLoan'; amount: number; months: number }
  | { type: 'repayLoan'; loanId: string }
  | { type: 'ipo'; pct: number }
  | { type: 'buyback'; shares: number }
  | { type: 'acquire'; targetId: string }
  | { type: 'setSubsidiary'; id: string; budget: 'low' | 'normal' | 'high'; focusGenre?: GenreId }
  | { type: 'sellFranchise'; franchiseId: string }
  | { type: 'resolveEvent'; uid: number; option: string }
  | { type: 'setPolicy'; salaryPolicy?: 'lean' | 'market' | 'generous'; remote?: boolean; fourDayWeek?: boolean }
  | { type: 'setRecruiting'; level: number }
  | { type: 'buyDevkit'; platform: string }
  | { type: 'continueEndless' }
  | { type: 'retire' }
  | { type: 'setAutopause'; key: 'gates' | 'events' | 'releases' | 'research'; on: boolean }
  | { type: 'tutorial'; step: number }
  | { type: 'refreshCandidates' }
  | { type: 'patchGame'; releaseId: string }
  | { type: 'portGame'; releaseId: string; platform: string }
  | { type: 'secondaryOffering'; pct: number }
  | { type: 'marketResearch'; genre: GenreId; topic: string }
  | { type: 'designConsole'; name: string; kind: ConsoleKind; tier: ConsoleTier; price: number; feeRate: number; marketing: ConsoleMarketing }
  | { type: 'setConsole'; id: string; price?: number; feeRate?: number; packIn?: string | null }
  | { type: 'retireConsole'; id: string }
  | { type: 'vacation'; staffId: string; days: 7 | 14 }
  | { type: 'cancelConsole'; id: string };

export type ActionResult = { ok: true; events: SimEvent[] } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

/** Price of a focus-group study that reveals how well a genre and topic fit together. */
export function marketResearchCost(s: GameState): number {
  return money(1_500, s.day);
}

export function devkitCost(s: GameState, platform: string): number {
  const pl = platformInfo(s, platform);
  if (!pl) return 0;
  return Math.round(pl.devKit * Math.pow(inflation(s.day) / inflation(pl.launchDay), 0.7));
}

export function defaultFocus(genre: GenreId): [Focus3, Focus3, Focus3] {
  const g = GENRE_BY_ID[genre];
  const f = (a: number, b: number, c: number): Focus3 => {
    const t = a + b + c;
    return [Math.round((a / t) * 100), Math.round((b / t) * 100), 100 - Math.round((a / t) * 100) - Math.round((b / t) * 100)];
  };
  void g;
  return [f(1, 1, 1), f(1, 1, 1), f(1, 1, 1)];
}

function teamValid(s: GameState, team: string[], projectIdToIgnore?: string): string | null {
  if (new Set(team).size !== team.length) return 'Each person can only be listed once';
  for (const id of team) {
    if (s.staff[id]?.assignment.kind === 'training') return `${s.staff[id]!.name} is in training`;
    const st = s.staff[id];
    if (!st) return 'Unknown staff member';
    if (st.assignment.kind === 'project' && st.assignment.id !== projectIdToIgnore && s.projects[st.assignment.id]) {
      return `${st.name} is already on another project`;
    }
  }
  return null;
}

function assignTeam(s: GameState, projectId: string, team: string[]): void {
  for (const id of team) {
    const st = s.staff[id];
    if (st) st.assignment = { kind: 'project', id: projectId };
  }
}

export function sizeAllowed(s: GameState, size: Size): string | null {
  if (size === 'large' && s.office.tier < 2) return 'Large games need at least a Small Office';
  if (size === 'aaa' && (s.office.tier < 4 || fromDay(s.day).year < 1995)) return 'AAA needs a Studio Building and 1995+';
  if (size !== 'small' && s.releaseOrder.length < 1) return 'Ship a small game first';
  return null;
}

export function monetizationAllowed(s: GameState, m: Monetization, genre: GenreId): string | null {
  const yr = fromDay(s.day).year;
  const def = BALANCE.MONETIZATION[m];
  if (yr < def.minYear) return `Available from ${def.minYear}`;
  if (m === 'subscription' && genre !== 'mmo') return 'Subscriptions only work for MMOs';
  if (m === 'f2p' && !hasFlag(s, 'f2p')) return 'Free-to-play hasn’t caught on yet';
  if (m === 'live_service' && !hasFlag(s, 'liveService')) return 'Live service isn’t a thing yet';
  if (m === 'shareware' && !hasFlag(s, 'shareware')) return 'Shareware isn’t a thing yet';
  if (m === 'premium_dlc' && !hasFlag(s, 'dlc')) return 'DLC isn’t a thing yet';
  return null;
}

export function dispatch(s: GameState, a: Action): ActionResult {
  const rng = new Rng(s.rng);
  const c: Ctx = { s, rng, out: [] };
  const r = apply(c, a);
  s.rng = rng.state;
  if (r) return fail(r);
  return { ok: true, events: c.out };
}

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === 'number' && Number.isFinite(x));

function apply(c: Ctx, a: Action): string | null {
  const { s } = c;
  if ('amount' in a && !finite(a.amount)) return 'Invalid amount';
  if ('salary' in a && a.salary !== undefined && !finite(a.salary)) return 'Invalid salary';
  if ('shares' in a && !finite(a.shares)) return 'Invalid share count';
  if ('weeks' in a && !finite(a.weeks)) return 'Invalid duration';
  if ('months' in a && !finite(a.months)) return 'Invalid term';
  if ('pct' in a && !finite(a.pct)) return 'Invalid percentage';
  if ('price' in a && a.price !== undefined && (!finite(a.price) || a.price <= 0)) return 'Invalid price';
  if ('feeRate' in a && a.feeRate !== undefined && (!finite(a.feeRate) || a.feeRate < 0 || a.feeRate > 0.5)) return 'Licence fee must be between 0% and 50%';
  if (a.type === 'tradeShow' && ![0, 1, 2].includes(a.booth)) return 'Invalid booth';
  if ((a.type === 'placeItem' || a.type === 'moveItem') && !finite(a.x, a.y, a.floor)) return 'Invalid position';
  if (s.status !== 'running' && a.type !== 'continueEndless') return 'The game has ended';
  switch (a.type) {
    case 'startGame': {
      const g = a.game;
      const genre = GENRE_BY_ID[g.genre];
      const topic = TOPIC_BY_ID[g.topic];
      const yr = fromDay(s.day).year;
      if (!genre || yr < genre.year || (genre.research && !s.research.done.includes(genre.research))) return 'Genre not available';
      if (!topic || yr < topic.year || (topic.research && !s.research.done.includes(topic.research))) return 'Topic not available';
      if (!g.name.trim()) return 'Give your game a name';
      if (!g.platforms.length || g.platforms.length > 6) return 'Choose 1–6 platforms';
      if (new Set(g.platforms).size !== g.platforms.length) return 'Each platform can only be chosen once';
      for (const pid of g.platforms) {
        const pl = platformInfo(s, pid);
        if (!pl || !isPlatformAvailable(s, pl)) return `${pl?.name ?? pid} is not available`;
      }
      const sizeErr = sizeAllowed(s, g.size);
      if (sizeErr) return sizeErr;
      const mErr = monetizationAllowed(s, g.monetization, g.genre);
      if (mErr) return mErr;
      if (!s.engines[g.engineId]) return 'Unknown engine';
      if (!g.team.length) return 'Assign at least one person';
      if (g.team.length > BALANCE.SIZE[g.size].teamCap) return `Team too large for a ${g.size} game (max ${BALANCE.SIZE[g.size].teamCap})`;
      const te = teamValid(s, g.team);
      if (te) return te;
      if (g.franchiseId && !s.franchises[g.franchiseId]) return 'Unknown franchise';
      const orig = g.remasterOf ? s.releases[g.remasterOf] : undefined;
      if (g.remasterOf) {
        if (!orig) return 'Unknown game to remaster';
        const why = canRemaster(s, orig);
        if (why) return why;
        if (g.genre !== orig.concept.genre || g.topic !== orig.concept.topic) return 'A remaster keeps the original genre and topic';
        if (g.franchiseId !== (orig.concept.franchiseId && s.franchises[orig.concept.franchiseId] ? orig.concept.franchiseId : undefined)) return 'A remaster belongs to the original’s franchise';
      }
      // dev kits
      const kitCost = g.platforms.filter((p) => !s.devkits.includes(p)).reduce((t, p) => t + devkitCost(s, p), 0);
      if (kitCost > 0 && kitCost > s.company.cash) return `Need ${fmtMoney(kitCost)} for dev kits`;
      const deal = g.dealId ? s.offers.deals.find((d) => d.id === g.dealId) : undefined;
      if (g.dealId && !deal) return 'That publisher deal expired';
      if (!deal && !s.research.done.includes('biz_self_publishing') && yr >= 1983 && s.releaseOrder.length >= 1) {
        // Early on (before self-publishing research) small studios may still self-publish on computers only.
        const onlyComputers = g.platforms.every((p) => platformInfo(s, p)?.kind === 'computer');
        if (!onlyComputers) return 'Research Self-Publishing (or sign a publisher deal) to ship on consoles';
      }
      for (const p of g.platforms)
        if (!s.devkits.includes(p)) {
          spend(s, 'devkits', devkitCost(s, p));
          s.devkits.push(p);
        }
      const id = newId(s, 'p');
      const proj: GameProject = {
        id,
        kind: 'game',
        concept: {
          name: g.name.trim().slice(0, 60),
          genre: g.genre,
          topic: g.topic,
          platforms: [...g.platforms],
          audience: g.audience,
          size: g.size,
          monetization: g.monetization,
          engineId: g.engineId,
          franchiseId: g.franchiseId,
          remasterOf: orig?.id,
          deal: deal ? { publisherId: deal.publisherId, advance: deal.advance, royalty: deal.royalty, minScore: deal.minScore, deadlineDay: deal.deadlineDay, reach: deal.reach, marketingBudget: deal.marketingBudget } : undefined,
        },
        phase: 0,
        phaseDay: 0,
        phaseDays: [0, 1, 2].map((ph) => Math.max(4, Math.round(phaseLength(g.size, ph) * (orig ? BALANCE.REMASTER_WORK : 1)))) as [number, number, number],
        focus: g.focus ?? defaultFocus(g.genre),
        points: { engine: 0, gameplay: 0, story: 0, level: 0, dialogue: 0, ai: 0, world: 0, graphics: 0, sound: 0 },
        design: 0,
        tech: 0,
        bugs: 0,
        bugsFixed: 0,
        crunch: false,
        cut: false,
        extraDays: 0,
        team: [...g.team],
        startDay: s.day,
        hype: g.franchiseId ? Math.min(1, (s.franchises[g.franchiseId]!.fans / 200_000) * 0.5) : 0,
        campaigns: [],
        spent: kitCost,
        novelty: 0,
        awaitingGate: false,
      };
      s.projects[id] = proj;
      assignTeam(s, id, g.team);
      if (deal) {
        earn(s, 'advances', deal.advance);
        s.offers.deals = s.offers.deals.filter((d) => d.id !== deal.id);
      }
      return null;
    }
    case 'setFocus': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (a.phase < Math.min(2, p.phase)) return 'That phase is finished';
      const f = a.focus.map((x) => clamp(Math.round(x), 0, 100)) as Focus3;
      if (f[0] + f[1] + f[2] <= 0) return 'Focus cannot be all zero';
      p.focus[a.phase] = f;
      return null;
    }
    case 'continueGate': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      p.awaitingGate = false;
      return null;
    }
    case 'setTeam': {
      const p = s.projects[a.projectId];
      if (!p) return 'No such project';
      if (p.kind === 'game' && a.team.length > BALANCE.SIZE[p.concept.size].teamCap) return 'Team too large for this size';
      const te = teamValid(s, a.team, p.id);
      if (te) return te;
      for (const id of p.team) {
        const st = s.staff[id];
        if (st && !a.team.includes(id)) st.assignment = { kind: 'idle' };
      }
      p.team = [...a.team];
      assignTeam(s, p.id, a.team);
      return null;
    }
    case 'setCrunch': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      p.crunch = a.on;
      return null;
    }
    case 'delay': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      const weeks = clamp(Math.round(a.weeks), 1, BALANCE.DELAY_WEEKS_MAX);
      p.extraDays += weeks * 7;
      if (p.announcedDay !== undefined) {
        p.hype = Math.max(0, p.hype - 0.05 * weeks);
        pushNews(s, { category: 'studio', headline: `${p.concept.name} delayed by ${weeks} weeks`, tone: 'neutral' });
      }
      return null;
    }
    case 'cutFeatures': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game' || p.cut) return 'Can’t cut further';
      if (p.phase >= 3) return 'Too late to cut';
      const ph = p.phase as 0 | 1 | 2;
      for (let i = ph; i < 3; i++) p.phaseDays[i as 0 | 1 | 2] = Math.max(4, Math.round(p.phaseDays[i as 0 | 1 | 2] * 0.75));
      p.cut = true;
      return null;
    }
    case 'announce': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (p.announcedDay !== undefined) return 'Already announced';
      p.announcedDay = s.day;
      p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + 0.1 + s.company.reputation / 250 + Math.log10(1 + s.company.fans) / 30);
      pushNews(s, { category: 'studio', headline: `${s.company.name} announces ${p.concept.name}`, tone: 'good' });
      return null;
    }
    case 'cancelProject': {
      const p = s.projects[a.projectId];
      if (!p) return 'No such project';
      for (const id of p.team) {
        const st = s.staff[id];
        if (st) {
          st.assignment = { kind: 'idle' };
          st.morale = clamp(st.morale - 8, 0, 100);
        }
      }
      delete s.projects[a.projectId];
      if (p.kind === 'game' && p.announcedDay !== undefined) addRep(s, -(2), 'Cancelled an announced game');
      if (p.kind === 'game' && p.concept.deal) {
        // the publisher wants its advance back
        spend(s, 'other_expense', p.concept.deal.advance);
        addRep(s, -2, 'Cancelled a published game');
      }
      if (p.kind === 'contract') {
        spend(s, 'other_expense', p.penalty);
        addRep(s, -1.5, 'Abandoned a contract');
      }
      return null;
    }
    case 'marketing': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (p.announcedDay === undefined) return 'Announce the game first';
      const ch = CHANNELS.find((x) => x.id === a.channel);
      const yr = fromDay(s.day).year;
      if (!ch || yr < ch.from || (ch.to !== undefined && yr > ch.to)) return 'Channel not available';
      if (ch.research && !s.research.done.includes(ch.research)) return `Research ${RESEARCH_BY_ID[ch.research]?.name} first`;
      const cost = money(ch.cost, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'marketing', cost);
      const used = p.campaigns.filter((x) => x.channel === ch.id).length;
      const dim = Math.pow(0.6, used) * Math.pow(0.85, p.campaigns.length);
      const war = 1 + (s.office.items.some((i) => i.item === 'marketing_board') ? 0.15 : 0);
      const audienceFit = ch.audience[p.concept.audience];
      const hype = ch.hype * dim * war * audienceFit;
      p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + hype);
      p.campaigns.push({ channel: ch.id, day: s.day, cost, hype });
      p.spent += cost;
      return null;
    }
    case 'tradeShow': {
      const show = TRADE_SHOWS.find((t) => t.id === a.show);
      const d = fromDay(s.day);
      if (!show || d.month !== show.month || d.year < show.from || (show.to !== undefined && d.year > show.to)) return 'That show isn’t on this month';
      const key = `show_${show.id}_${d.year}`;
      if (s.eventCooldowns[key]) return 'Already exhibited this year';
      const cost = money(show.booths[a.booth], s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'marketing', cost);
      s.eventCooldowns[key] = s.day;
      const announced = Object.values(s.projects).filter((p): p is GameProject => p.kind === 'game' && p.announcedDay !== undefined);
      for (const p of announced) p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + show.hype[a.booth] / Math.max(1, Math.sqrt(announced.length)));
      addRep(s, show.rep[a.booth], 'Trade show appearance');
      pushNews(s, { category: 'studio', headline: `${s.company.name} wows crowds at ${show.name}`, tone: 'good' });
      return null;
    }
    case 'hire': {
      const cand = s.candidates.find((x) => x.id === a.candidateId);
      if (!cand) return 'Candidate no longer available';
      const staffCount = Object.keys(s.staff).length;
      if (staffCount >= tierDef(s.office.tier).staffCap) return 'Office is at capacity — move to a bigger office';
      if (freeDesks(s) <= 0) return 'No free desk — place a desk first';
      const salary = Math.round(a.salary ?? cand.askSalary);
      if (salary < cand.askSalary * 0.85) return `${cand.name} won’t accept less than ${Math.round(cand.askSalary * 0.85)}`;
      const signing = salary / 12;
      if (s.company.cash < signing) return 'Not enough cash for the first month’s salary';
      const id = newId(s, 's');
      s.staff[id] = candidateToStaff(s, cand, id, salary);
      s.candidates = s.candidates.filter((x) => x.id !== cand.id);
      spend(s, 'recruiting', money(300, s.day));
      if (cand.fromRival) {
        const rv = s.rivals[cand.fromRival];
        if (rv) rv.quality = clamp(rv.quality - 0.01, 0.1, 1);
        addRep(s, -(1), 'Poached a rival developer');
        spend(s, 'recruiting', cand.askSalary * 0.25); // headhunter fee
        pushNews(s, { category: 'staff', headline: `${cand.name} defects from ${rv?.name ?? 'a rival'} to ${s.company.name}`, tone: 'neutral' });
      }
      s.progress.stats.staffHired += 1;
      assignDesks(s);
      c.out.push({ type: 'hired', staffId: id });
      return null;
    }
    case 'fire': {
      const st = s.staff[a.staffId];
      if (!st) return 'No such staff';
      if (st.role === 'founder') return 'You can’t fire yourself';
      spend(s, 'salaries', st.salary / 12); // severance: one month
      removeStaff(s, st.id);
      const recent = (s.eventCooldowns.__fires ?? 0) > s.day - 30 ? (s.eventCooldowns.__fireCount ?? 0) + 1 : 1;
      s.eventCooldowns.__fires = s.day;
      s.eventCooldowns.__fireCount = recent;
      if (recent >= 3) s.company.lastLayoffDay = s.day;
      for (const o of Object.values(s.staff)) o.morale = clamp(o.morale - 2, 0, 100);
      assignDesks(s);
      return null;
    }
    case 'setSalary': {
      const st = s.staff[a.staffId];
      if (!st || st.role === 'founder') return 'No such staff';
      const sal = Math.max(1000, Math.round(a.salary));
      if (sal > st.salary) {
        st.morale = clamp(st.morale + Math.min(15, ((sal - st.salary) / st.salary) * 60), 0, 100);
        st.loyalty = clamp(st.loyalty + Math.min(15, ((sal - st.salary) / st.salary) * 50), 0, 100);
      } else if (sal < st.salary) {
        st.morale = clamp(st.morale - Math.min(30, ((st.salary - sal) / st.salary) * 120), 0, 100);
        st.loyalty = clamp(st.loyalty - 15, 0, 100);
      }
      st.salary = sal;
      st.moraleWhy = undefined;
      return null;
    }
    case 'assign': {
      const st = s.staff[a.staffId];
      if (!st) return 'No such staff';
      if (st.assignment.kind === 'project') {
        const p = s.projects[st.assignment.id];
        if (p) p.team = p.team.filter((x) => x !== st.id);
      }
      st.assignment = a.to === 'research' ? { kind: 'research' } : { kind: 'idle' };
      return null;
    }
    case 'train': {
      const st = s.staff[a.staffId];
      if (!st) return 'No such staff';
      if (!s.research.done.includes('biz_training')) return 'Research the Training Programme first';
      if (st.assignment.kind === 'project') return 'Take them off their project first';
      if (st.assignment.kind === 'training') return `${st.name} is already in training`;
      if ((st.vacationDays ?? 0) > 0) return `${st.name} is on vacation`;
      const cost = money(2_500, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'training', cost);
      st.assignment = { kind: 'training' };
      st.trainingSkill = a.skill;
      const boost = s.office.items.some((i) => i.item === 'training_desk') ? 0.5 : 0;
      st.trainingDaysLeft = Math.round(28 / (1 + boost));
      return null;
    }
    case 'setSpec': {
      const st = s.staff[a.staffId];
      if (!st) return 'No such staff';
      if (st.level !== 'senior' && st.level !== 'lead' && st.role !== 'founder') return 'Only seniors and leads can specialise';
      if (st.spec) return 'Already specialised';
      st.spec = a.spec;
      return null;
    }
    case 'placeItem': {
      const def = ITEM_BY_ID[a.item];
      if (!def) return 'Unknown item';
      if (fromDay(s.day).year < def.year) return `Available from ${def.year}`;
      if (def.research && !s.research.done.includes(def.research)) return `Research ${RESEARCH_BY_ID[def.research]?.name} first`;
      const cost = money(def.cost, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      const ok = canPlace(s, def, a.floor, a.x, a.y, a.rot);
      if (!ok.ok) return ok.reason ?? 'Can’t place there';
      spend(s, 'office', cost);
      s.office.items.push({ id: `i${s.office.nextItemId++}`, item: a.item, floor: a.floor, x: a.x, y: a.y, rot: a.rot });
      touchOffice(s);
      assignDesks(s);
      return null;
    }
    case 'moveItem': {
      const it = s.office.items.find((i) => i.id === a.id);
      if (!it) return 'No such item';
      const ok = canPlace(s, ITEM_BY_ID[it.item], a.floor, a.x, a.y, a.rot, it.id);
      if (!ok.ok) return ok.reason ?? 'Can’t place there';
      it.floor = a.floor;
      it.x = a.x;
      it.y = a.y;
      it.rot = a.rot;
      touchOffice(s);
      assignDesks(s);
      return null;
    }
    case 'sellItem': {
      const it = s.office.items.find((i) => i.id === a.id);
      if (!it) return 'No such item';
      const def = ITEM_BY_ID[it.item];
      s.office.items = s.office.items.filter((i) => i.id !== it.id);
      earn(s, 'asset_sales', money(def.cost, s.day) * 0.4);
      touchOffice(s);
      assignDesks(s);
      return null;
    }
    case 'moveOffice': {
      if (a.tier !== s.office.tier + 1 && a.tier !== s.office.tier - 1) return 'Move one tier at a time';
      const t = tierDef(a.tier);
      if (t.tier !== a.tier) return 'No such office';
      if (s.company.reputation < t.minReputation && a.tier > s.office.tier) return `Needs reputation ${t.minReputation}`;
      const cost = money(t.moveCost, s.day);
      if (a.tier > s.office.tier && s.company.cash < cost) return 'Not enough cash';
      if (a.tier < s.office.tier && Object.keys(s.staff).length > t.staffCap) return 'Too many staff for a smaller office';
      if (a.tier > s.office.tier) spend(s, 'office', cost);
      // keep items that fit on the new grid; refund the rest at 40%
      const kept = [];
      const old = s.office.items;
      s.office = { tier: a.tier, items: [], nextItemId: s.office.nextItemId };
      for (const it of old) {
        const def = ITEM_BY_ID[it.item];
        // try original spot, else first free spot on any floor
        let placed = false;
        if (canPlace(s, def, Math.min(it.floor, t.floors - 1), it.x, it.y, it.rot).ok) {
          s.office.items.push({ ...it, floor: Math.min(it.floor, t.floors - 1) });
          placed = true;
        } else {
          outer: for (let f = 0; f < t.floors; f++)
            for (let y = 0; y < t.h; y++)
              for (let x = 0; x < t.w; x++)
                if (canPlace(s, def, f, x, y, it.rot).ok) {
                  s.office.items.push({ ...it, floor: f, x, y });
                  placed = true;
                  break outer;
                }
        }
        if (placed) kept.push(it.id);
        else earn(s, 'asset_sales', money(def.cost, s.day) * 0.4);
      }
      touchOffice(s);
      assignDesks(s);
      pushNews(s, { category: 'studio', headline: `${s.company.name} moves into a ${t.name}`, tone: 'good' });
      return null;
    }
    case 'research':
    case 'queueResearch': {
      const def = RESEARCH_BY_ID[a.id];
      if (!def) return 'Unknown research';
      const av = researchAvailable(s, def);
      if (!av.ok && !(a.type === 'queueResearch' && av.why?.startsWith('Requires'))) return av.why ?? 'Unavailable';
      if (s.research.active === def.id || s.research.queue.includes(def.id)) return 'Already queued';
      const cost = researchCost(s, def);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'research', cost);
      if (a.type === 'research' && !s.research.active) {
        s.research.active = def.id;
        s.research.progress = 0;
      } else s.research.queue.push(def.id);
      return null;
    }
    case 'cancelResearch': {
      const def = s.research.active ? RESEARCH_BY_ID[s.research.active] : undefined;
      if (!def) return 'Nothing to stop';
      // half the budget comes back (booked as reduced research spending, not as revenue)
      const refund = Math.round(researchCost(s, def) * 0.5);
      s.company.cash += refund;
      const led = s.finance.ledger[s.finance.ledger.length - 1];
      if (led) led.expense.research = Math.max(0, (led.expense.research ?? 0) - refund);
      s.research.active = null;
      s.research.progress = 0;
      return null;
    }
    case 'buildEngine': {
      if (!a.name.trim()) return 'Name your engine';
      const feats = [...new Set(a.features)].filter((f) => s.research.done.includes(f) && RESEARCH_BY_ID[f]?.engineTech);
      if (!feats.length) return 'Pick at least one researched feature';
      if (!a.team.length) return 'Assign at least one programmer';
      const te = teamValid(s, a.team);
      if (te) return te;
      const cost = money(2_000 + engineTechFor(feats) * 2_500, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'research', cost);
      const id = newId(s, 'p');
      s.projects[id] = { id, kind: 'engine', name: a.name.trim().slice(0, 40), features: feats, needPoints: engineBuildPoints(feats, s.day), points: 0, team: [...a.team], startDay: s.day, cost };
      assignTeam(s, id, a.team);
      return null;
    }
    case 'licenseEngine': {
      const def = ENGINE_BY_ID[a.engineDef];
      const yr = fromDay(s.day).year;
      if (!def || yr < def.year || (def.retired !== undefined && yr > def.retired)) return 'Engine not available';
      if (Object.values(s.engines).some((e) => e.licensedFrom === def.id)) return 'Already licensed';
      const fee = Math.round(def.fee);
      if (s.company.cash < fee) return 'Not enough cash';
      spend(s, 'devkits', fee);
      const id = newId(s, 'e');
      s.engines[id] = { id, name: def.name, features: [], tech: def.tech, maturity: 0.6, gamesShipped: 0, builtDay: s.day, licensedFrom: def.id, royalty: def.royalty, licensees: 0 };
      return null;
    }
    case 'licenseOut': {
      const e = s.engines[a.engineId];
      if (!e || e.licensedFrom) return 'Can only license your own engines';
      if (!s.research.done.includes('biz_engine_licensing')) return 'Research Engine Licensing first';
      if (e.licensees > 0) return 'Already on the market';
      e.licensees = Math.max(1, Math.round(s.company.reputation / 25));
      pushNews(s, { category: 'studio', headline: `${e.name} engine now available for licensing`, tone: 'good' });
      return null;
    }
    case 'acceptContract': {
      const o = s.offers.contracts.find((x) => x.id === a.offerId);
      if (!o) return 'Offer expired';
      if (!a.team.length) return 'Assign someone';
      const te = teamValid(s, a.team);
      if (te) return te;
      const id = newId(s, 'p');
      s.projects[id] = { id, kind: 'contract', title: o.title, client: o.client, needDesign: o.needDesign, needTech: o.needTech, design: 0, tech: 0, pay: o.pay, penalty: o.penalty, deadlineDay: s.day + o.days, startDay: s.day, team: [...a.team], bugs: 0 };
      assignTeam(s, id, a.team);
      s.offers.contracts = s.offers.contracts.filter((x) => x.id !== o.id);
      return null;
    }
    case 'takeLoan': {
      const months = clamp(Math.round(a.months), 6, 120);
      if (a.amount > creditLimit(s)) return 'Above your credit limit';
      const l = takeLoan(s, Math.round(a.amount), months);
      return l ? null : 'Loan refused';
    }
    case 'repayLoan':
      return repayLoan(s, a.loanId) ? null : 'Not enough cash to repay';
    case 'ipo': {
      const e = ipoEligible(s);
      if (!e.ok) return e.why;
      doIPO(s, a.pct);
      pushNews(s, { category: 'studio', headline: `${s.company.name} goes public!`, tone: 'good' });
      return null;
    }
    case 'buyback': {
      const st = s.finance.stock;
      if (!st) return 'Not public';
      const n = Math.min(Math.round(a.shares), st.shares - st.founderShares);
      const cost = n * st.price * 1.05;
      if (n <= 0 || s.company.cash < cost) return 'Not enough cash';
      s.company.cash -= Math.round(cost);
      st.founderShares += n;
      st.price *= 1 + 0.15 * (n / st.shares);
      return null;
    }
    case 'acquire': {
      const t = s.offers.acquisitions.find((x) => x.id === a.targetId);
      const r = s.rivals[a.targetId];
      if (!t || !r || !r.alive) return 'Target no longer available';
      if (s.company.cash < t.price) return 'Not enough cash';
      spend(s, 'acquisitions', t.price);
      r.ownedByPlayer = true;
      s.subsidiaries[r.id] = {
        id: r.id,
        name: r.name,
        origin: r.id,
        staff: r.staff,
        quality: r.quality,
        genres: r.genres,
        budget: 'normal',
        nextReleaseDay: s.day + 180,
        releases: 0,
        revenue: 0,
        bought: s.day,
      };
      s.offers.acquisitions = s.offers.acquisitions.filter((x) => x.id !== t.id);
      s.progress.stats.acquisitions += 1;
      // Real companies bring their franchises
      if (!r.procedural) adoptFranchises(s, r.id);
      pushNews(s, { category: 'studio', headline: `${s.company.name} acquires ${r.name}`, tone: 'good' });
      addRep(s, 3, 'Acquired a studio');
      return null;
    }
    case 'setSubsidiary': {
      const sub = s.subsidiaries[a.id];
      if (!sub) return 'No such subsidiary';
      sub.budget = a.budget;
      sub.focusGenre = a.focusGenre;
      return null;
    }
    case 'sellFranchise': {
      const f = s.franchises[a.franchiseId];
      if (!f) return 'No such franchise';
      if (Object.values(s.projects).some((p) => p.kind === 'game' && p.concept.franchiseId === f.id)) return 'A sequel is in development';
      const price = Math.max(money(5_000, s.day), (f.fans * 4 * (f.bestScore / 100) * inflation(s.day)) * 0.8);
      earn(s, 'asset_sales', price);
      delete s.franchises[f.id];
      pushNews(s, { category: 'studio', headline: `${s.company.name} sells the ${f.name} IP`, tone: 'neutral' });
      void ipValue;
      return null;
    }
    case 'resolveEvent':
      return resolveEvent(c, a.uid, a.option) ? null : 'Event no longer available';
    case 'setPolicy': {
      if (a.salaryPolicy) s.company.policies.salaryPolicy = a.salaryPolicy;
      if (a.remote !== undefined) s.company.policies.remote = a.remote;
      if (a.fourDayWeek !== undefined) s.company.policies.fourDayWeek = a.fourDayWeek;
      for (const st of Object.values(s.staff)) st.moraleWhy = undefined;
      return null;
    }
    case 'setRecruiting':
      s.company.recruiting = clamp(Math.round(a.level), 0, 3);
      return null;
    case 'buyDevkit': {
      if (s.devkits.includes(a.platform)) return 'Already owned';
      const pl = platformInfo(s, a.platform);
      if (!pl || !isPlatformAvailable(s, pl)) return 'Platform not available';
      const cost = devkitCost(s, a.platform);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'devkits', cost);
      s.devkits.push(a.platform);
      return null;
    }
    case 'continueEndless':
      if (s.status !== 'retired' || s.endReason?.startsWith('Retired')) return 'Only available when the story ends';
      s.settings.endless = true;
      s.status = 'running';
      delete s.endReason;
      return null;
    case 'retire':
      s.status = 'retired';
      s.endReason = `Retired in ${fromDay(s.day).year}.`;
      c.out.push({ type: 'gameOver', reason: s.endReason });
      return null;
    case 'setAutopause':
      s.settings.autopause[a.key] = a.on;
      if (a.key === 'gates' && !a.on) for (const p of Object.values(s.projects)) if (p.kind === 'game') p.awaitingGate = false;
      return null;
    case 'tutorial':
      s.progress.tutorialStep = a.step;
      return null;
    case 'marketResearch': {
      const key = `${a.genre}|${a.topic}`;
      const list = (s.progress.researchedCombos ??= []);
      if (list.includes(key)) return 'Already researched';
      const cost = marketResearchCost(s);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'research', cost);
      list.push(key);
      return null;
    }
    case 'secondaryOffering': {
      const st = s.finance.stock;
      if (!st) return 'Not public';
      const raised = secondaryOffering(s, Math.min(0.2, Math.max(0.02, a.pct)));
      if (raised <= 0) return 'No shares left to sell';
      pushNews(s, { category: 'studio', headline: `${s.company.name} raises ${fmtMoney(raised)} in a share sale`, tone: 'neutral' });
      return null;
    }
    case 'patchGame': {
      const rel = s.releases[a.releaseId];
      if (!rel) return 'No such game';
      const why = canPatch(s, rel);
      if (why) return why;
      const cost = patchCost(s, rel);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'other_expense', cost);
      const gain = applyPatch(s, rel);
      pushNews(s, { category: 'studio', headline: `Patch for ${rel.name} fixes bugs (user score +${gain})`, tone: 'good' });
      return null;
    }
    case 'portGame': {
      const rel = s.releases[a.releaseId];
      if (!rel) return 'No such game';
      if (rel.concept.platforms.includes(a.platform)) return 'Already on that platform';
      const pl = platformInfo(s, a.platform);
      if (!pl || !isPlatformAvailable(s, pl)) return 'Platform not available';
      if (s.day - rel.day > 365 * 4) return 'Too old to port profitably';
      if (rel.concept.monetization === 'subscription') return 'Subscription games can’t be ported';
      if (!rel.concept.deal && pl.kind !== 'computer' && !s.research.done.includes('biz_self_publishing')) return 'Research Self-Publishing to put your games on consoles yourself';
      const kit = s.devkits.includes(a.platform) ? 0 : devkitCost(s, a.platform);
      const cost = portCost(s, rel) + kit;
      if (s.company.cash < cost) return 'Not enough cash';
      if (kit) s.devkits.push(a.platform);
      spend(s, 'devkits', kit);
      spend(s, 'other_expense', portCost(s, rel));
      applyPort(s, rel, a.platform);
      pushNews(s, { category: 'studio', headline: `${rel.name} is out now on ${pl.name}`, tone: 'good' });
      return null;
    }
    case 'designConsole': {
      const why = canDesignConsole(s);
      if (why) return why;
      if (a.kind !== 'console' && a.kind !== 'handheld') return 'Invalid hardware type';
      if (!['budget', 'standard', 'premium'].includes(a.tier)) return 'Invalid tier';
      if (!MARKETING[a.marketing]) return 'Invalid marketing plan';
      const name = a.name.trim().slice(0, 40);
      if (!name) return 'Give your hardware a name';
      const spec = consoleSpec(s, a.kind, a.tier);
      const mkt = money(MARKETING[a.marketing].cost, s.day);
      const firstMonths = Math.ceil(spec.rdTotal / spec.months) * 3;
      if (s.company.cash < mkt + firstMonths) return `Need ${fmtMoney(mkt + firstMonths)} on hand (launch marketing + 3 months of R&D)`;
      if (a.price < spec.refPrice * 0.3 || a.price > spec.refPrice * 4) return 'That price is unrealistic';
      spend(s, 'marketing', mkt);
      const n = s.hardware.length + 1;
      const launchDay = s.day + Math.round(spec.months * 30.44);
      s.hardware.push({
        id: `own_${n}_${s.nextId++}`,
        name,
        kind: a.kind,
        tier: a.tier,
        tech: spec.tech,
        media: mediaFor(fromDay(launchDay).year),
        status: 'dev',
        devStartDay: s.day,
        launchDay,
        endDay: null,
        rdTotal: spec.rdTotal,
        rdPaid: 0,
        price: Math.round(a.price),
        unitCost1980: spec.unitCost1980,
        feeRate: a.feeRate,
        marketing: a.marketing,
        potentialM: 0,
        installedM: 0,
        boost: 0,
        unitsSold: 0,
        hwRevenue: 0,
        hwCost: 0,
        feeRevenue: 0,
        monthly: [],
      });
      pushNews(s, { category: 'studio', headline: `${s.company.name} is secretly building a ${a.kind}: codename “${name}”`, tone: 'neutral' });
      return null;
    }
    case 'setConsole': {
      const hw = s.hardware.find((h) => h.id === a.id);
      if (!hw || hw.status === 'retired') return 'No such console';
      // validate everything first so a rejected change applies nothing
      const pack = a.packIn ? s.releases[a.packIn] : undefined;
      if (a.packIn) {
        if (!pack) return 'No such game';
        if (!pack.concept.platforms.includes(hw.id)) return `${pack.name} isn’t on the ${hw.name} — port it first`;
      }
      if (a.price !== undefined) {
        const [lo, hi] = priceBounds(hw, s.day);
        if (a.price < lo || a.price > hi) return `Price must be between ${fmtMoney(lo)} and ${fmtMoney(hi)}`;
      }
      if (a.packIn === null) delete hw.packIn;
      else if (pack) hw.packIn = pack.id;
      if (a.price !== undefined) hw.price = Math.round(a.price);
      if (a.feeRate !== undefined) hw.feeRate = a.feeRate;
      return null;
    }
    case 'vacation': {
      const st = s.staff[a.staffId];
      if (!st) return 'Unknown staff member';
      if (a.days !== 7 && a.days !== 14) return 'Vacations are one or two weeks';
      const why = vacationBlocked(s, st);
      if (why) return why;
      st.vacationDays = a.days;
      st.lastVacationDay = s.day;
      st.loyalty = clamp(st.loyalty + (a.days === 14 ? 5 : 3), 0, 100);
      return null;
    }
    case 'retireConsole': {
      const hw = s.hardware.find((h) => h.id === a.id);
      if (!hw || hw.status !== 'live') return 'That console isn’t on sale';
      const n = projectsTargeting(s, hw.id);
      if (n) return `${n} game${n > 1 ? 's are' : ' is'} still in development for the ${hw.name}`;
      retireConsole(c, hw);
      return null;
    }
    case 'cancelConsole': {
      const i = s.hardware.findIndex((h) => h.id === a.id);
      if (i < 0 || s.hardware[i]!.status !== 'dev') return 'Only consoles still in development can be cancelled';
      const hw = s.hardware[i]!;
      s.hardware.splice(i, 1);
      pushNews(s, { category: 'studio', headline: `${s.company.name} scraps its ${hw.name} hardware project`, body: `${fmtMoney(hw.rdPaid)} of R&D written off.`, tone: 'bad' });
      return null;
    }
    case 'refreshCandidates': {
      const cost = money(1_200, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'recruiting', cost);
      s.candidates = [];
      refreshCandidates(c);
      return null;
    }
  }
}

export { marketSalary };

/** Acquiring a real company transfers its real franchises (released so far) to the player. */
function adoptFranchises(s: GameState, companyId: string): void {
  const yr = fromDay(s.day).year;
  for (const f of FRANCHISES) {
    let owner = f.company;
    for (const [cid, y] of f.transfers ?? []) if (yr >= y) owner = cid;
    if (owner !== companyId) continue;
    const past = f.releases.filter((r) => parseYM(r.date) <= s.day);
    if (!past.length) continue;
    const id = newId(s, 'f');
    s.franchises[id] = {
      id,
      name: f.name,
      genre: f.genre,
      topic: f.topic,
      fans: Math.round(past.reduce((t, r) => t + r.unitsM * 1e6, 0) * 0.12),
      entries: [],
      fatigue: 0,
      lastDay: parseYM(past[past.length - 1]!.date),
      bestScore: Math.max(...past.map((r) => r.score)),
      origin: f.id,
    };
    pushNews(s, { category: 'studio', headline: `You now own the ${f.name} franchise`, tone: 'good' });
  }
}
