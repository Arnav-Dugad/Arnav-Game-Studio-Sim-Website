/**
 * Static data contracts. Every historical / tunable dataset in src/data conforms to these types.
 * Dates are 'YYYY-MM' strings (or 'YYYY') so they are easy to read and correct by hand.
 * Money in data files is NOMINAL US dollars at the stated date unless noted otherwise.
 */

export type YearMonth = `${number}-${number}` | `${number}`;

export type Audience = 'kids' | 'everyone' | 'teen' | 'mature';
export const AUDIENCES: readonly Audience[] = ['kids', 'everyone', 'teen', 'mature'];

export type Skill = 'design' | 'programming' | 'art' | 'audio' | 'writing' | 'qa' | 'marketing';
export const SKILLS: readonly Skill[] = ['design', 'programming', 'art', 'audio', 'writing', 'qa', 'marketing'];

/** The nine focus areas, three per development phase. */
export type Area =
  | 'engine'
  | 'gameplay'
  | 'story'
  | 'level'
  | 'dialogue'
  | 'ai'
  | 'world'
  | 'graphics'
  | 'sound';
export const PHASE_AREAS: readonly (readonly [Area, Area, Area])[] = [
  ['engine', 'gameplay', 'story'],
  ['level', 'dialogue', 'ai'],
  ['world', 'graphics', 'sound'],
];
export const AREAS: readonly Area[] = PHASE_AREAS.flat();

export type GenreId =
  | 'action'
  | 'adventure'
  | 'rpg'
  | 'strategy'
  | 'simulation'
  | 'puzzle'
  | 'platformer'
  | 'shooter'
  | 'racing'
  | 'sports'
  | 'fighting'
  | 'casual'
  | 'rhythm'
  | 'mmo'
  | 'sandbox';

export type PlatformKind = 'console' | 'handheld' | 'computer' | 'mobile' | 'vr' | 'cloud';

export type Monetization = 'premium' | 'shareware' | 'subscription' | 'premium_dlc' | 'f2p' | 'live_service';

/** Industry-wide features toggled on by history (or research) that unlock mechanics. */
export type IndustryFlag =
  | 'ratings' // age-ratings board exists; mature games stop causing random controversies
  | 'cdrom'
  | 'online'
  | 'digital' // digital distribution on computers
  | 'mobileStores'
  | 'f2p'
  | 'crowdfunding'
  | 'streaming'
  | 'vr'
  | 'liveService'
  | 'lootboxRegulation'
  | 'genAI'
  | 'esports'
  | 'shareware'
  | 'dlc';

export interface GenreDef {
  id: GenreId;
  name: string;
  /** First year the genre can be chosen (historical plausibility). */
  year: number;
  /** Research node required, if any. */
  research?: string;
  /** Ideal share of design points (0..1); the rest is tech. */
  designRatio: number;
  /** Ideal focus weight per area (relative, any scale) — drives focus alignment. */
  ideal: Record<Area, number>;
  audience: Record<Audience, number>; // 0..1.2 multipliers
  kinds: Partial<Record<PlatformKind, number>>; // platform kind fit multiplier (default 1)
  /** Popularity keyframes (year → relative market share weight). Interpolated linearly. */
  popularity: [number, number][];
  blurb: string;
}

export interface TopicDef {
  id: string;
  name: string;
  year: number;
  research?: string;
  /** 3 = great, 2 = good, 1 = okay (default), 0 = bad fit. */
  genreFit: Partial<Record<GenreId, 0 | 1 | 2 | 3>>;
  audience: Partial<Record<Audience, number>>;
  /** Optional popularity keyframes (default flat 1). */
  popularity?: [number, number][];
}

export interface PlatformDef {
  id: string;
  name: string;
  /** CompanyDef id of the maker, e.g. 'nintendo'. 'various' for open platforms like PC. */
  maker: string;
  kind: PlatformKind;
  /** Hardware generation (1 = 2nd-gen consoles in 1980 terms … 9 = PS5 era). Used for tech expectations. */
  generation: number;
  launch: YearMonth;
  /** Month the platform stopped receiving new games / was discontinued. Omit if still active. */
  discontinued?: YearMonth;
  /**
   * Lifetime hardware units in millions (consoles/handhelds), or PEAK ACTIVE GAMING USERS in millions
   * for open/long-lived platforms (computers, PC, iOS, Android, cloud).
   */
  unitsM: number;
  /** Years from launch until sales/users peak. */
  peakYears: number;
  /** Shape: 'fast' adoption, 'normal', 'slow' burner, or 'flop'. */
  curve: 'fast' | 'normal' | 'slow' | 'flop';
  /** Dev kit + licence cost in nominal USD at launch. */
  devKit: number;
  /** Platform holder's cut of net revenue (0..1). */
  royalty: number;
  /** Graphics/tech capability tier 1..12; drives engine tech expectations. */
  tech: number;
  media: 'cartridge' | 'tape' | 'floppy' | 'cd' | 'dvd' | 'bluray' | 'digital' | 'card';
  audience: Record<Audience, number>;
  genreFit?: Partial<Record<GenreId, number>>;
  /** Typical full retail price of a new game on this platform at launch (nominal USD). */
  gamePrice: number;
  /** Research node needed before you can develop for it (e.g. 'platform_vr'). */
  research?: string;
  notes?: string;
}

export interface CompanyStrategy {
  genres: GenreId[];
  /** Preferred platform ids (own platforms are implied for platform holders). */
  platforms?: string[];
  quality: number; // 0..1 baseline polish
  aggression: number; // 0..1 release-window clashes, poaching
  risk: number; // 0..1 willingness to try new genres/platforms
  marketing: number; // 0..1 marketing intensity
  /** Typical games shipped per year when at full size. */
  output: number;
}

export interface CompanyDef {
  id: string;
  name: string;
  founded: number;
  /** Year the company becomes active in the games market (may differ from founding). */
  enters: number;
  /** Year the company stops operating independently (bankruptcy/merger). */
  exits?: number;
  exitReason?: 'bankrupt' | 'merged' | 'acquired' | 'left_games';
  /** Company id that absorbs it on exit (merger/acquisition). */
  mergedInto?: string;
  country: string;
  /** Brand-adjacent colour for the monogram badge (hex). NOT a logo. */
  color: string;
  kind: 'platform_holder' | 'publisher' | 'developer';
  /** Approximate staff headcount when entering the market. */
  staff: number;
  /** Rough reputation 0..100 when entering the market. */
  reputation: number;
  strategy: CompanyStrategy;
  /** Id of a real person (people.ts) who leads/founded the company — shown as initials badge. */
  leader?: string;
  notes?: string;
}

export interface FranchiseRelease {
  title: string;
  date: YearMonth;
  platforms: string[];
  /** Approximate aggregate critic score 0..100. */
  score: number;
  /** Approximate lifetime units sold in millions (rough is fine). */
  unitsM: number;
}

export interface FranchiseDef {
  id: string;
  name: string;
  /** Company id that owns/publishes it (at time of first release). */
  company: string;
  /** Optional later owner after an acquisition: [companyId, year]. */
  transfers?: [string, number][];
  genre: GenreId;
  topic: string;
  audience: Audience;
  releases: FranchiseRelease[];
}

export type PersonRole = 'designer' | 'programmer' | 'artist' | 'composer' | 'writer' | 'producer' | 'executive';

export interface PersonDef {
  id: string;
  name: string;
  role: PersonRole;
  /** Neutral, factual one-liner (no private details, no invented controversy). */
  knownFor: string;
  /** Company most associated with (company id) — used for rival leadership. */
  company?: string;
  /** Years they are professionally active (can be hired / lead). */
  activeFrom: number;
  activeTo?: number;
  /** If true, they may rarely appear in the player's hiring pool as a legendary candidate. */
  hireable: boolean;
  /** Skills 0..100 used if hired. Unlisted skills default low. */
  skills: Partial<Record<Skill, number>>;
}

/** Effects attached to historical events (market-level). */
export type MarketEffect =
  | {
      kind: 'demand';
      /** Which platforms: all, a platform kind, or a specific platform id. */
      target: 'all' | PlatformKind | `platform:${string}`;
      mul: number;
      months: number;
    }
  | { kind: 'genreTrend'; genre: GenreId; delta: number }
  | { kind: 'topicTrend'; topic: string; delta: number }
  | { kind: 'flag'; flag: IndustryFlag }
  | { kind: 'techJump'; delta: number }
  | { kind: 'talentPool'; mul: number; months: number }
  | { kind: 'salaryShock'; mul: number }
  | { kind: 'storeCut'; target: PlatformKind; cut: number };

export type NewsCategory = 'industry' | 'platform' | 'rival' | 'studio' | 'staff' | 'market' | 'tech';

export interface HistoricalEventDef {
  id: string;
  date: YearMonth;
  headline: string;
  body: string;
  category: NewsCategory;
  effects: MarketEffect[];
  /** Major events pause the game and show a full card. */
  major?: boolean;
}

export interface EngineDef {
  id: string;
  name: string;
  /** Company id that owns it. */
  owner: string;
  year: number;
  retired?: number;
  /** Tech tier 1..12 at release. */
  tech: number;
  /** One-off licence fee (nominal USD) and royalty share of net revenue. */
  fee: number;
  royalty: number;
  features: string[];
  notes?: string;
}
