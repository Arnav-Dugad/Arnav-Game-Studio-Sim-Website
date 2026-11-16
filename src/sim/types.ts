import type { Area, Audience, GenreId, IndustryFlag, Monetization, NewsCategory, Skill } from '../data/types';
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
}

export interface PublisherDeal {
  publisherId: Id; // company id
  advance: number;
  royalty: number; // share of net revenue paid to the player
  minScore: number;
  deadlineDay: number;
  reach: number; // publisher's distribution reach multiplier
  marketingBudget: number;
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
}

export interface Company {
  name: string;
  founderName: string;
  color: string;
  reputation: number; // 0..100
  fans: number;
  cash: number;
  creditScore: number; // 300..850
  insolventSince?: number;
  publicSince?: number;
  /** Temporary studio-wide morale modifiers from events/decisions. */
  moraleMods: { v: number; until: number; label: string }[];
  /** Persistent policies set by the player. */
  policies: { salaryPolicy: 'lean' | 'market' | 'generous'; remote: boolean; fourDayWeek: boolean };
  /** Day of the last major layoff (morale shock). */
  lastLayoffDay?: number;
  /** Recruitment spend level 0..3 (job ads/headhunting). */
  recruiting: number;
}

export interface Settings {
  difficulty: Difficulty;
  endless: boolean;
  autopause: { gates: boolean; events: boolean; releases: boolean; research: boolean };
  startYear: number;
}

export type GameStatus = 'running' | 'bankrupt' | 'acquired' | 'retired';

export interface GameState {
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
  news: NewsItem[];
  pendingEvents: EventInstance[];
  eventCooldowns: Record<string, number>;
  progress: {
    achievements: Record<string, number>;
    milestones: string[];
    stats: LifetimeStats;
    tutorialStep: number;
    journal: string[]; // design discoveries ("RPG likes Story")
  };
  status: GameStatus;
  endReason?: string;
  nextId: number;
  nextNewsId: number;
  nextEventUid: number;
}
