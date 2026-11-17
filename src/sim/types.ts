import type { Area, Audience, GenreId, IndustryFlag, Monetization, NewsCategory, Skill } from '../data/types';
import type { CultureId } from '../data/culture';
import type { RegionId } from '../data/regions';
import type { TraitId } from '../data/traits';
import type { ItemId } from '../data/facilities';
import type { Difficulty } from '../data/balance';
import type { RngState } from './rng';
import type { Breakdown } from './breakdown';

export type Id = string;
export type Size = 'small' | 'medium' | 'large' | 'aaa';
export type Role = 'founder' | 'designer' | 'programmer' | 'artist' | 'audio' | 'writer' | 'qa' | 'marketer' | 'producer';
export type Level = 'junior' | 'mid' | 'senior' | 'lead';
export type Specialisation =
  | 'engine_programmer'
  | 'lead_designer'
  | 'art_director'
  | 'composer'
  | 'qa_lead'
  | 'producer'
  | 'community_manager'
  | 'narrative_director';

export type Activity = 'work' | 'break' | 'meeting' | 'chat' | 'idle' | 'sick' | 'training' | 'research' | 'burnout' | 'vacation';

/** A personal goal (systems/ambitions.ts). */
export type AmbitionKind = 'genre' | 'hit' | 'first' | 'raise' | 'research' | 'skill' | 'desk' | 'holiday';

export interface Ambition {
  kind: AmbitionKind;
  since: number;
  until: number;
  genre?: GenreId;
  skill?: Skill;
  /** Salary for 'raise', skill level for 'skill', desk tier for 'desk'. */
  target?: number;
  /** Days spent so far (research). */
  progress?: number;
}

export interface Staff {
  id: Id;
  name: string;
  /** Seed for the procedural avatar. */
  look: number;
  role: Role;
  level: Level;
  skills: Record<Skill, number>;
  potential: number; // 0..100 soft cap for skill growth
  traits: TraitId[];
  spec?: Specialisation;
  salary: number; // nominal $/year
  hiredDay: number;
  morale: number;
  energy: number;
  burnout: number;
  loyalty: number;
  /** Real person id (people.ts) for legendary hires. */
  personId?: string;
  assignment: Assignment;
  deskId?: Id;
  activity: Activity;
  sickDays: number;
  /** Paid leave remaining, and when the last one started. */
  vacationDays?: number;
  lastVacationDay?: number;
  /** Explanation of the latest target morale. */
  moraleWhy?: Breakdown;
  productivityWhy?: Breakdown;
  /** Lifetime contribution counter (points). */
  contributed: number;
  gamesShipped: number;
  trainingSkill?: Skill;
  trainingDaysLeft?: number;
  /** Days remaining on a raise promise / poach cooldown. */
  poachCooldown: number;
  /** A personal goal (systems/ambitions.ts), and no new one before this day. */
  ambition?: Ambition;
  ambitionCooldown?: number;
  /** A personal morale term (a fulfilled or ignored ambition). */
  mood?: { v: number; until: number; label: string };
  dreamsMet?: number;
  /** A raise granted for an ambition: cutting below it before `until` breaks the promise. */
  promise?: { salary: number; until: number };
  /** Contribution points at the last monthly check, and Employee of the Month wins. */
  contribMark?: number;
  eotmCount?: number;
}

export type Assignment =
  | { kind: 'idle' }
  | { kind: 'project'; id: Id }
  | { kind: 'research' }
  | { kind: 'training' };

export interface Candidate extends Omit<Staff, 'assignment' | 'deskId' | 'activity' | 'hiredDay' | 'contributed' | 'gamesShipped' | 'sickDays' | 'poachCooldown'> {
  askSalary: number;
  expiresDay: number;
  /** Poachable: currently employed by this rival (company id). */
  fromRival?: string;
}

export interface PlacedItem {
  id: Id;
  item: ItemId;
  floor: number;
  x: number;
  y: number;
  rot: 0 | 1; // 1 = rotated 90°
}

export interface Office {
  tier: number;
  items: PlacedItem[];
  nextItemId: number;
  /** Bumped on every layout change (cache key). */
  rev?: number;
}

export interface DeskMetrics {
  deskId: Id;
  floor: number;
  x: number;
  y: number;
  /** Steps to nearest energy station (Infinity if unreachable / none). */
  energyDist: number;
  energyGain: number;
  crowding: number;
  decor: number;
  noise: number;
  trainingBoost: number;
}

/** Derived from office layout; recomputed when the office changes. Not saved. */
export interface LayoutCache {
  version: number;
  desks: Record<Id, DeskMetrics>;
  meeting: number;
  qa: number;
  servers: number;
  audio: number;
  mocap: number;
  training: number;
  research: number;
  marketing: number;
  trophies: number;
  deskTierById: Record<Id, number>;
}

export type Focus3 = [number, number, number];

export interface Concept {
  name: string;
  genre: GenreId;
  topic: string;
  platforms: Id[];
  audience: Audience;
  size: Size;
  monetization: Monetization;
  engineId: Id;
  franchiseId?: Id;
  /** Publisher deal id if published by a third party. */
  deal?: PublisherDeal;
  /** Release id of the classic this game remasters. */
  remasterOf?: Id;
  /** Release id of the base game this expansion pack extends. */
  expansionOf?: Id;
  /** Signature features (data/gameFeatures.ts), up to three. */
  features?: string[];
  /** Regions the game is translated for (the studio's home region always is). */
  localized?: RegionId[];
}

export interface PublisherDeal {
  publisherId: Id; // company id
  advance: number;
  royalty: number; // share of net revenue paid to the player
  minScore: number;
  deadlineDay: number;
  reach: number; // publisher's distribution reach multiplier
  marketingBudget: number;
  /** Game size the advance was offered for (smaller games get a proportionally smaller advance). */
  size?: Size;
}

export interface Campaign {
  channel: string;
  day: number;
  cost: number;
  hype: number;
}

export interface GameProject {
  id: Id;
  kind: 'game';
  concept: Concept;
  phase: 0 | 1 | 2 | 3; // 3 = polish extension (after the 3 phases)
  phaseDay: number;
  phaseDays: [number, number, number];
  focus: [Focus3, Focus3, Focus3];
  points: Record<Area, number>;
  design: number;
  tech: number;
  bugs: number;
  bugsFixed: number;
  crunch: boolean;
  cut: boolean;
  extraDays: number; // polish/delay days remaining after phase 3
  team: Id[];
  startDay: number;
  announcedDay?: number;
  hype: number;
  campaigns: Campaign[];
  spent: number;
  novelty: number; // visionary etc. bonus accumulator
  /** Waiting for player input at a phase gate. */
  awaitingGate: boolean;
  qualityPreview?: Breakdown;
  /** Public beta run during polish: when, and the score beta players predicted. */
  beta?: { day: number; predicted: number };
}

export interface ContractProject {
  id: Id;
  kind: 'contract';
  title: string;
  client: Id;
  needDesign: number;
  needTech: number;
  design: number;
  tech: number;
  pay: number;
  penalty: number;
  deadlineDay: number;
  startDay: number;
  team: Id[];
  bugs: number;
}

export interface EngineProject {
  id: Id;
  kind: 'engine';
  name: string;
  features: string[];
  needPoints: number;
  points: number;
  team: Id[];
  startDay: number;
  cost: number;
}

export type Project = GameProject | ContractProject | EngineProject;

export interface Engine {
  id: Id;
  name: string;
  features: string[];
  tech: number;
  maturity: number; // 0..1
  gamesShipped: number;
  builtDay: number;
  /** Licensed from a third party (engines.ts id). */
  licensedFrom?: string;
  royalty: number;
  /** Licensed OUT to others: monthly income. */
  licensees: number;
}

export interface CriticReview {
  outlet: string;
  score: number; // 0..100
  display: string;
  blurb: string;
}

export interface PlatformSales {
  platform: Id;
  potential: number; // lifetime unit potential at release (before competition)
  units: number;
  /** Release week this platform version launched (ports launch later). */
  startWeek?: number;
  /** A second wave of sales (an expansion brought players back): extra units and the week it started. */
  revival?: { week: number; potential: number; units: number; priceMul?: number };
  /** Total extra potential ever granted by second waves (for the addressable-market cap). */
  extraPotential?: number;
}

export interface Release {
  id: Id;
  name: string;
  concept: Concept;
  day: number;
  quality: Breakdown;
  score: number;
  userScore: number;
  reviews: CriticReview[];
  platforms: PlatformSales[];
  units: number;
  gross: number;
  net: number;
  /** Weekly units (first 104 weeks), then monthly aggregates. */
  weekly: number[];
  monthly: number[];
  week: number;
  price: number;
  decay: number;
  active: boolean;
  hypeAtLaunch: number;
  devCost: number;
  bugs: number;
  awards: string[];
  /** Live-service / subscription monthly income tail. */
  liveIncome: number;
  serverLoad: number;
  why: { sales?: Breakdown; user?: Breakdown };
  /** Post-launch patches shipped. */
  patches?: number;
  /** Shipped with mod tools (a longer, bigger PC tail). */
  modded?: boolean;
  /** The game ran an open beta before release. */
  betaTested?: boolean;
  /** Share of players by region at launch (data/regions.ts). */
  regionMix?: Record<RegionId, number>;
  /** Storefront discounts run so far, and when the last one started. */
  saleCount?: number;
  lastSaleDay?: number;
}

export interface Franchise {
  id: Id;
  name: string;
  genre: GenreId;
  topic: string;
  fans: number;
  entries: Id[]; // release ids
  fatigue: number; // 0..1
  lastDay: number;
  bestScore: number;
  /** Came from an acquisition of a real company's IP. */
  origin?: string;
}

export interface RivalGame {
  name: string;
  company: Id;
  genre: GenreId;
  topic: string;
  platforms: Id[];
  day: number;
  score: number;
  units: number;
  franchise?: string; // franchises.ts id
  /** Indie game released under the player's publishing label (not a rival entry for awards). */
  publishedByPlayer?: boolean;
  /** Already faced one of your games in a showdown. */
  contested?: boolean;
}

export interface Rival {
  id: Id; // company id (or procedural 'proc_*')
  name: string;
  color: string;
  procedural: boolean;
  alive: boolean;
  ownedByPlayer: boolean;
  cash: number;
  reputation: number;
  staff: number;
  quality: number;
  genres: GenreId[];
  aggression: number;
  output: number;
  lastRelease: number;
  revenue12m: number;
  /** Bought-out → subsidiary. */
  enteredDay: number;
}

export interface Subsidiary {
  id: Id;
  name: string;
  origin: Id; // rival id
  staff: number;
  quality: number;
  genres: GenreId[];
  budget: 'low' | 'normal' | 'high';
  focusGenre?: GenreId;
  nextReleaseDay: number;
  /** Day of the previous release (revenue covers the time since). */
  lastReleaseDay?: number;
  releases: number;
  revenue: number;
  bought: number;
}

export interface Loan {
  id: Id;
  principal: number;
  remaining: number;
  rate: number;
  monthly: number;
  monthsLeft: number;
  takenDay: number;
}

export type LedgerCat =
  | 'sales'
  | 'contracts'
  | 'licensing'
  | 'live'
  | 'merch'
  | 'subsidiaries'
  | 'interest_income'
  | 'asset_sales'
  | 'advances'
  | 'other_income'
  | 'salaries'
  | 'rent'
  | 'upkeep'
  | 'servers'
  | 'devkits'
  | 'marketing'
  | 'research'
  | 'training'
  | 'loan_interest'
  | 'taxes'
  | 'recruiting'
  | 'office'
  | 'manufacturing'
  | 'hardware'
  | 'platform_fees'
  | 'subscriptions'
  | 'esports'
  | 'publishing'
  | 'advances_paid'
  | 'hardware_rd'
  | 'royalties'
  | 'acquisitions'
  | 'other_expense';

export interface MonthLedger {
  day: number; // first day of the month
  income: Partial<Record<LedgerCat, number>>;
  expense: Partial<Record<LedgerCat, number>>;
  cashEnd: number;
}

export interface StockState {
  shares: number;
  founderShares: number;
  price: number;
  history: number[]; // weekly closes (trimmed)
  ipoDay: number;
  ipoPrice: number;
  expectation: number; // next quarter profit expectation
  boardMood: number; // 0..100
  dividendsPaid: number;
}

export interface NewsItem {
  id: number;
  day: number;
  category: NewsCategory;
  headline: string;
  body?: string;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface EventOption {
  id: string;
  label: string;
  /** Human-readable preview of effects. */
  preview: string;
  disabled?: boolean;
}

export interface EventInstance {
  uid: number;
  defId: string;
  day: number;
  title: string;
  body: string;
  options: EventOption[];
  /** Context ids (staff/rival/project) the event references. */
  ctx: Record<string, string | number>;
  expiresDay: number;
  art: string;
}

export interface ContractOffer {
  id: Id;
  title: string;
  client: Id;
  needDesign: number;
  needTech: number;
  days: number;
  pay: number;
  penalty: number;
  expiresDay: number;
}

export interface DealOffer extends PublisherDeal {
  id: Id;
  expiresDay: number;
}

export interface AcquisitionTarget {
  id: Id; // rival id
  price: number;
  expiresDay: number;
}

export interface MarketState {
  /** Per-genre trend offsets (−0.5..+0.6). */
  genreTrend: Record<GenreId, number>;
  topicTrend: Record<string, number>;
  /** Active demand modifiers from events. */
  modifiers: { target: string; mul: number; untilDay: number; startDay: number }[];
  flags: Partial<Record<IndustryFlag, number>>; // flag → day enabled
  techBonus: number; // extra tech expectation from history
  talentMul: { mul: number; untilDay: number }[];
  salaryMul: number;
  storeCut: Partial<Record<string, number>>;
  /** Cached per-platform active users (millions) for the current month. */
  users: Record<Id, number>;
  share: Record<Id, number>;
  /** Monthly history for charts: [day, {platform:share}] trimmed to 600 entries. */
  shareHistory: { day: number; share: Record<Id, number> }[];
  trendHistory: { day: number; trend: Record<string, number> }[];
  historicalIndex: number; // next HISTORICAL_EVENTS index to fire
  scheduleIndex: number; // next real franchise release to fire
  futurePlatforms: FuturePlatform[];
}

/** One entry of the yearly Golden Pixel Gala (fictional awards show). */
export interface AwardWinner {
  category: string; // 'Game of the Year' | 'Best <Genre>'
  name: string;
  company: string; // display name
  score: number;
  mine: boolean;
  releaseId?: Id;
}

export interface AwardYear {
  year: number;
  winners: AwardWinner[];
}

/** A game you fund and publish for an independent studio. */
export interface PublishedDeal {
  id: Id;
  rivalId: Id;
  studio: string;
  tier: 'small' | 'medium' | 'large';
  advance: number;
  genre: GenreId;
  signedDay: number;
  releaseDay: number;
  status: 'dev' | 'released' | 'done';
  gameName?: string;
  score?: number;
  units?: number;
  payoutsLeft: number;
  monthlyPayout: number;
  earned: number;
}

export interface SubscriptionState {
  name: string;
  /** Monthly price (nominal). */
  price: number;
  launchedDay: number;
  subscribers: number;
  peak: number;
  revenue: number;
  /** Monthly subscriber counts. */
  history: number[];
  active: boolean;
}

/** A console or handheld designed and sold by the player's own hardware division. */
export interface PlayerConsole {
  id: Id; // 'own_1', 'own_2'…
  name: string;
  kind: 'console' | 'handheld';
  tier: 'budget' | 'standard' | 'premium';
  tech: number;
  media: 'cartridge' | 'cd' | 'dvd' | 'bluray' | 'digital';
  status: 'dev' | 'live' | 'retired';
  devStartDay: number;
  launchDay: number;
  endDay: number | null;
  /** Total R&D budget (nominal) and how much has been paid so far. */
  rdTotal: number;
  rdPaid: number;
  /** Retail price (nominal dollars). */
  price: number;
  /** Manufacturing cost per unit at launch, in 1980 dollars (falls every year). */
  unitCost1980: number;
  /** Licence fee charged to third-party publishers (0..0.5). */
  feeRate: number;
  marketing: 'none' | 'standard' | 'blitz';
  /** Lifetime demand (millions) at the reference price, fixed at launch. */
  potentialM: number;
  potentialWhy?: Breakdown;
  installedM: number;
  /** Buzz from great exclusives (decays monthly). */
  boost: number;
  unitsSold: number;
  hwRevenue: number;
  hwCost: number;
  feeRevenue: number;
  /** Units sold per month (millions), most recent last. */
  monthly: number[];
  /** Your game bundled in the box, if any. */
  packIn?: Id;
  /** Day the established platform holders answered this console with price cuts. */
  priceWarDay?: number;
}

export interface FuturePlatform {
  id: Id;
  name: string;
  maker: string;
  kind: 'console' | 'handheld' | 'vr' | 'mobile';
  launchDay: number;
  endDay: number;
  unitsM: number;
  tech: number;
  price: number;
}

export interface LifetimeStats {
  gamesReleased: number;
  totalUnits: number;
  totalRevenue: number;
  bestScore: number;
  bestGame?: string;
  hits: number; // games ≥ 85
  flops: number; // games < 50
  peakCash: number;
  peakValuation: number;
  staffHired: number;
  staffLost: number;
  crunchDays: number;
  awardsWon: number;
  contractsDone: number;
  researchDone: number;
  daysInsolvent: number;
  recoveredFromInsolvency: number;
  acquisitions: number;
  noCrunchSince: number; // day of last crunch (or start)
  /** Staff ambitions fulfilled. */
  dreamsMet?: number;
}

export interface Company {
  name: string;
  /** Where the studio is based (its own language is always supported). Defaults to North America. */
  homeRegion?: RegionId;
  /** Studio culture (data/culture.ts) and when it last changed. */
  values?: CultureId[];
  valuesDay?: number;
  lastRetreatDay?: number;
  founderName: string;
  color: string;
  /** Studio emblem (an icon id) and badge shape; the monogram is used without one. */
  logo?: { emblem?: string; shape?: BadgeShape };
  reputation: number; // 0..100
  fans: number;
  cash: number;
  creditScore: number; // 300..850
  insolventSince?: number;
  publicSince?: number;
  /** Temporary studio-wide morale modifiers from events/decisions. */
  moraleMods: { v: number; until: number; label: string }[];
  /** Persistent policies set by the player. */
  policies: {
    salaryPolicy: 'lean' | 'market' | 'generous';
    remote: boolean;
    fourDayWeek: boolean;
    /** Automation: idle people go to research; burnt-out people take two weeks off. */
    autoResearch?: boolean;
    autoVacation?: boolean;
    /** When research runs dry, start the cheapest available project (if under 10% of cash). */
    autoQueue?: boolean;
  };
  /** Day of the last major layoff (morale shock). */
  lastLayoffDay?: number;
  /** Recruitment spend level 0..3 (job ads/headhunting). */
  recruiting: number;
  /** Recent reputation changes with reasons (newest last) — powers the "why" tooltip. */
  repLog?: { day: number; delta: number; reason: string }[];
}

export interface Settings {
  difficulty: Difficulty;
  endless: boolean;
  autopause: { gates: boolean; events: boolean; releases: boolean; research: boolean };
  startYear: number;
}

export type GameStatus = 'running' | 'bankrupt' | 'acquired' | 'retired';

export interface GameState {
  /** Relationships between colleagues (pair key 'a|b' → −100..100; systems/relations.ts). */
  relations?: Record<string, number>;
  /** This month's Employee of the Month. */
  eotm?: { id: string; day: number };
  schemaVersion: number;
  seed: number;
  rng: RngState;
  day: number;
  settings: Settings;
  company: Company;
  founderId: Id;
  staff: Record<Id, Staff>;
  candidates: Candidate[];
  office: Office;
  projects: Record<Id, Project>;
  releases: Record<Id, Release>;
  releaseOrder: Id[];
  franchises: Record<Id, Franchise>;
  research: { done: string[]; active: string | null; progress: number; queue: string[] };
  engines: Record<Id, Engine>;
  market: MarketState;
  rivals: Record<Id, Rival>;
  rivalGames: RivalGame[]; // recent (trimmed) rival releases for competition & news
  subsidiaries: Record<Id, Subsidiary>;
  finance: {
    ledger: MonthLedger[];
    loans: Loan[];
    stock: StockState | null;
    revenue12m: number[]; // last 12 monthly revenues
    profitYTD: number;
  };
  offers: { contracts: ContractOffer[]; deals: DealOffer[]; acquisitions: AcquisitionTarget[] };
  devkits: Id[]; // platforms licensed
  /** Player-made consoles (hardware division). */
  hardware: PlayerConsole[];
  /** Golden Pixel Gala results by year (industry-wide). */
  awardHistory?: AwardYear[];
  /** Games you publish for indie studios. */
  publishingDeals?: PublishedDeal[];
  /** Your catalogue subscription service, once launched. */
  subscription?: SubscriptionState;
  /** Esports leagues you run. */
  leagues?: EsportsLeague[];
  /** Retirement anchor for saves made before retirement existed (veterans then retire over 1–3 years). */
  retirementSince?: number;
  /** Veterans who retired from the studio. */
  alumni?: { name: string; role: Role; years: number; games: number; day: number; legend: boolean }[];
  /** Head-to-head record against each rival (company id → record). */
  rivalry?: Record<Id, RivalryRecord>;
  /** Persistent cheat switches (see sim/cheats.ts). */
  cheats?: CheatSettings;
  /** Set once any cheat is used; the Hall of Fame marks the run. */
  cheatsUsed?: boolean;
  news: NewsItem[];
  pendingEvents: EventInstance[];
  eventCooldowns: Record<string, number>;
  progress: {
    achievements: Record<string, number>;
    milestones: string[];
    stats: LifetimeStats;
    tutorialStep: number;
    journal: string[]; // design discoveries ("RPG likes Story")
    /** genre|topic combos revealed by paid market research. */
    researchedCombos?: string[];
  };
  status: GameStatus;
  endReason?: string;
  nextId: number;
  nextNewsId: number;
  nextEventUid: number;
}

/** Persistent cheats the simulation honours every day. Undefined means off / ×1. */
export interface CheatSettings {
  /** Cash never drops below `moneyFloor`. */
  infiniteMoney?: boolean;
  moneyFloor?: number;
  /** Never go bankrupt (insolvency is ignored). */
  noBankruptcy?: boolean;
  noBurnout?: boolean;
  alwaysHappy?: boolean;
  noBugs?: boolean;
  noEvents?: boolean;
  /** Office items and moves cost nothing and ignore reputation requirements. */
  freeBuild?: boolean;
  /** Multipliers. */
  salesMul?: number;
  workMul?: number;
  researchMul?: number;
  /** Review points added to every new release. */
  scoreBonus?: number;
}

export type LeagueTier = 'regional' | 'pro' | 'world';

export interface EsportsLeague {
  id: Id;
  name: string;
  /** The game currently played in the league (moves to a strong sequel). */
  releaseId: Id;
  franchiseId?: Id;
  tier: LeagueTier;
  foundedDay: number;
  closedDay?: number;
  /** 0–100: builds season by season, fades when the game gets old. */
  prestige: number;
  viewers: number;
  peakViewers: number;
  revenue: number;
  costs: number;
  seasons: number;
  status: 'live' | 'closed';
  /** Monthly viewers (last 10 years). */
  history: number[];
}

export interface RivalryRecord {
  wins: number;
  losses: number;
  draws: number;
  /** One-line summary of the latest showdown. */
  last: string;
}

export type BadgeShape = 'rounded' | 'circle' | 'shield' | 'hex';
