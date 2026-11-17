import { BALANCE, type Difficulty } from '../data/balance';
import { GENRES } from '../data/genres';
import { TOPICS } from '../data/topics';
import { HISTORICAL_EVENTS } from '../data/events';
import { SKILLS } from '../data/types';
import { parseYM, toDay } from './calendar';
import type { Ctx } from './ctx';
import { Rng, seedRng } from './rng';
import { engineTechFor } from './systems/dev';
import { processHistory, updateMarketMonthly } from './systems/market';
import { refreshOffers } from './systems/offers';
import { starterResearch } from './systems/research';
import { rivalsHistory } from './systems/rivals';
import { emptySkills, refreshCandidates } from './systems/staff';
import { assignDesks } from './systems/office';
import type { GameState, Staff } from './types';
import { money, pushNews } from './util';
import { RESEARCH_BY_ID } from '../data/research';
import { SCHEMA_VERSION } from './save';

export interface NewGameOptions {
  seed: number;
  companyName: string;
  founderName: string;
  difficulty?: Difficulty;
  startYear?: number;
  endless?: boolean;
  color?: string;
  /** Founder strengths. */
  founderFocus?: 'design' | 'programming' | 'balanced';
  autopause?: boolean;
  /** Creative sandbox: infinite money, no bankruptcy, free building; the run is marked as cheated. */
  sandbox?: boolean;
}

export function createGame(o: NewGameOptions): GameState {
  const startYear = o.startYear ?? 1980;
  const difficulty = o.difficulty ?? 'standard';
  const rngState = seedRng(o.seed);
  const day = toDay(startYear, 1, 1);
  const s: GameState = {
    schemaVersion: SCHEMA_VERSION,
    seed: o.seed,
    rng: rngState,
    day,
    settings: {
      difficulty,
      endless: o.endless ?? false,
      autopause: { gates: o.autopause ?? true, events: o.autopause ?? true, releases: o.autopause ?? true, research: false },
      startYear,
    },
    company: {
      name: o.companyName,
      founderName: o.founderName,
      color: o.color ?? '#e07a5f',
      reputation: startYear > 1980 ? 6 : 0,
      fans: 0,
      cash: money(BALANCE.START_CASH[difficulty], day),
      creditScore: 640,
      moraleMods: [],
      policies: { salaryPolicy: 'market', remote: false, fourDayWeek: false },
      recruiting: 0,
    },
    founderId: 'founder',
    staff: {},
    candidates: [],
    office: { tier: 1, items: [], nextItemId: 1 },
    projects: {},
    releases: {},
    releaseOrder: [],
    franchises: {},
    research: { done: starterResearch(startYear), active: null, progress: 0, queue: [] },
    engines: {},
    market: {
      genreTrend: Object.fromEntries(GENRES.map((g) => [g.id, 0])) as GameState['market']['genreTrend'],
      topicTrend: Object.fromEntries(TOPICS.map((t) => [t.id, 0])),
      modifiers: [],
      flags: {},
      techBonus: 0,
      talentMul: [],
      salaryMul: 1,
      storeCut: {},
      users: {},
      share: {},
      shareHistory: [],
      trendHistory: [],
      historicalIndex: 0,
      scheduleIndex: 0,
      futurePlatforms: [],
    },
    rivals: {},
    rivalGames: [],
    subsidiaries: {},
    finance: { ledger: [{ day, income: {}, expense: {}, cashEnd: 0 }], loans: [], stock: null, revenue12m: [], profitYTD: 0 },
    offers: { contracts: [], deals: [], acquisitions: [] },
    devkits: [],
    hardware: [],
    news: [],
    pendingEvents: [],
    eventCooldowns: {},
    progress: {
      achievements: {},
      milestones: [],
      stats: {
        gamesReleased: 0,
        totalUnits: 0,
        totalRevenue: 0,
        bestScore: 0,
        hits: 0,
        flops: 0,
        peakCash: 0,
        peakValuation: 0,
        staffHired: 0,
        staffLost: 0,
        crunchDays: 0,
        awardsWon: 0,
        contractsDone: 0,
        researchDone: 0,
        daysInsolvent: 0,
        recoveredFromInsolvency: 0,
        acquisitions: 0,
        noCrunchSince: day,
      },
      tutorialStep: 0,
      journal: [],
    },
    status: 'running',
    nextId: 1,
    nextNewsId: 0,
    nextEventUid: 0,
  };
  const rng = new Rng(s.rng);
  const c: Ctx = { s, rng, out: [] };

  // Founder
  const skills = emptySkills();
  for (const k of SKILLS) skills[k] = Math.round(rng.range(22, 34));
  const focus = o.founderFocus ?? 'balanced';
  skills.design = focus === 'design' ? 58 : focus === 'programming' ? 38 : 48;
  skills.programming = focus === 'programming' ? 58 : focus === 'design' ? 38 : 48;
  const founder: Staff = {
    id: 'founder',
    name: o.founderName,
    look: Math.floor(rng.next() * 2 ** 31),
    role: 'founder',
    level: 'mid',
    skills,
    potential: 92,
    traits: ['visionary'],
    salary: money(BALANCE.FOUNDER_SALARY, day),
    hiredDay: day,
    morale: 80,
    energy: 100,
    burnout: 0,
    loyalty: 100,
    assignment: { kind: 'idle' },
    activity: 'idle',
    sickDays: 0,
    contributed: 0,
    gamesShipped: 0,
    poachCooldown: 0,
  };
  s.staff.founder = founder;

  // Garage starter layout (8×6, entrance bottom-middle at (4,5))
  const place = (item: GameState['office']['items'][number]['item'], x: number, y: number, rot: 0 | 1 = 0) =>
    s.office.items.push({ id: `i${s.office.nextItemId++}`, item, floor: 0, x, y, rot });
  place('desk_basic', 2, 2);
  place('desk_basic', 4, 2);
  place('coffee_machine', 7, 0);
  place('plant_small', 0, 0);
  place('poster', 3, 0);
  assignDesks(s);

  // Starter engine from starter research
  const feats = s.research.done.filter((r) => RESEARCH_BY_ID[r]?.engineTech);
  s.engines.e0 = { id: 'e0', name: 'Garage Engine', features: feats, tech: engineTechFor(feats), maturity: 0.2, gamesShipped: 0, builtDay: 0, royalty: 0, licensees: 0 };

  // Skip historical events before the start (apply their lasting effects silently)
  processHistory(c);
  const sched = { i: 0 };
  s.market.scheduleIndex = sched.i;
  rivalsHistory(c);
  updateMarketMonthly(c);
  refreshCandidates(c);
  refreshOffers(c);
  s.news = [];
  pushNews(s, {
    category: 'studio',
    headline: `${o.companyName} opens for business`,
    body: `${o.founderName} sets up shop in a garage with a couple of desks and big dreams.`,
    tone: 'good',
  });
  if (o.sandbox) {
    s.cheatsUsed = true;
    s.cheats = { infiniteMoney: true, moneyFloor: money(1_000_000, day), noBankruptcy: true, freeBuild: true };
    s.company.cash = Math.max(s.company.cash, money(1_000_000, day));
    pushNews(s, { category: 'studio', headline: 'Sandbox mode', body: 'Money is no object: cash never drops below the floor, building is free and you can’t go bankrupt. Open Menu → Cheats (`) to bend any other rule.', tone: 'neutral' });
  }
  // ensure historicalIndex points past events before the start day
  while (s.market.historicalIndex < HISTORICAL_EVENTS.length && parseYM(HISTORICAL_EVENTS[s.market.historicalIndex]!.date) <= day) s.market.historicalIndex++;
  s.rng = rng.state;
  return s;
}
