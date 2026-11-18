/**
 * Every tunable number in the simulation lives here, named and commented with intent.
 * Money values are in 1980 US dollars unless noted; the sim multiplies by inflation(year).
 */
import type { Monetization } from './types';

export const BALANCE = {
  // ── Economy ────────────────────────────────────────────────────────────────
  /** Remasters need this share of a new game's work and reach this share of its market. */
  REMASTER_WORK: 0.55,
  REMASTER_REACH: 0.7,
  /** Expansion packs: share of a new game's work, price vs. a full game, and the share of base-game owners who buy one at a perfect score. */
  EXPANSION_WORK: 0.4,
  EXPANSION_PRICE: 0.6,
  EXPANSION_ATTACH: 0.8,
  /** Sales multiplier for multi-platform online games once Cross-Play is researched. */
  CROSSPLAY_SALES: 1.1,
  INFLATION: 0.032, // ~3.2%/yr compounding (1980→2026 ≈ ×4.25)
  START_CASH: { relaxed: 90_000, standard: 55_000, hardcore: 30_000 },
  CORPORATE_TAX: 0.25, // on positive yearly profit
  BANKRUPTCY_GRACE_DAYS: { relaxed: 150, standard: 90, hardcore: 30 },
  /** Market harshness per difficulty: sales reach, rival competition weight, salary demands. */
  DIFFICULTY: {
    relaxed: { sales: 1.2, competition: 0.8, salary: 0.95 },
    standard: { sales: 1, competition: 1, salary: 1 },
    hardcore: { sales: 0.72, competition: 1.5, salary: 1.15 },
  },

  // ── Staff ──────────────────────────────────────────────────────────────────
  SALARY_BASE: 17_000, // yearly salary of a 50-skill mid-level employee in 1980
  SALARY_SKILL_EXP: 1.45, // salary grows super-linearly with skill
  SALARY_ERA_PREMIUM: 0.008, // extra real-terms growth of dev salaries per year (industry maturing)
  MORALE_RATE: 0.06, // daily approach rate toward target morale
  ENERGY_DRAIN: 3.2, // per working day
  ENERGY_DRAIN_CRUNCH: 6.5,
  BREAK_THRESHOLD: 40, // energy at which staff head for a break
  WEEKEND_RECOVERY: 22,
  BURNOUT_GAIN_LOW_ENERGY: 1.4,
  BURNOUT_GAIN_CRUNCH: 1.1,
  BURNOUT_DECAY: 0.8,
  SKILL_GROWTH: 0.045, // per working day, scaled by (potential - skill)/100
  POINTS_PER_DAY: 1.0, // points a 100-skill, 100%-productive person makes per day
  QUIT_MORALE: 22,
  FOUNDER_SALARY: 16_000, // the founder needs to eat (1980 $/yr, inflation-adjusted each January)
  HIRE_POOL_BASE: 4,

  // ── Development ────────────────────────────────────────────────────────────
  SIZE: {
    small: { days: 60, teamCap: 3, typicalTeam: 1.6, reach: 0.06, costMul: 1 },
    medium: { days: 150, teamCap: 8, typicalTeam: 4, reach: 0.14, costMul: 1 },
    large: { days: 300, teamCap: 20, typicalTeam: 10, reach: 0.42, costMul: 1 },
    aaa: { days: 540, teamCap: 60, typicalTeam: 28, reach: 1.0, costMul: 1 },
  },
  PHASE_SHARE: [0.3, 0.45, 0.25] as const,
  BENCHMARK_GROWTH: 0.031, // the "good game" bar rises ~3.1%/yr in points per person-day
  BENCHMARK_SKILL: 0.5, // benchmark assumes a team of 50-skill staff at 100% productivity…
  BENCHMARK_PROD: 0.85, // …at 85% productivity
  CRUNCH_OUTPUT: 1.35,
  CRUNCH_BUGS: 1.6,
  BUG_RATE: 0.22, // bugs per tech point before modifiers
  QA_FIX_RATE: 0.06, // bugs fixed per QA-skill-point-per-day/100
  CUT_FEATURES_PENALTY: 0.94,
  DELAY_WEEKS_MAX: 26,

  // ── Reviews & sales ────────────────────────────────────────────────────────
  SCORE_GAIN: 1.18, // maps quality 0..1 → score
  CRITIC_NOISE: 3.5,
  ATTACH_PEAK: 0.42,
  /** Discoverability: early markets were uncrowded. attach × ERA_BOOST/(1+CROWDING×years). */
  ERA_BOOST: 3.2,
  CROWDING: 0.14, // how fast the market fills with competing games (each year makes a release a little harder to notice)
  ATTACH_EXP: 8, // steepness of score→attach curve
  GENRE_INTEREST: 0.22, // share of a platform's users interested in an average genre
  LIFECYCLE_DECAY_RETAIL: 0.86, // weekly decay of sales (retail era)
  LIFECYCLE_DECAY_DIGITAL: 0.93,
  LIFECYCLE_DECAY_EVERGREEN: 0.965,
  RETAILER_CUT: 0.38, // retail chain margin pre-digital
  MANUFACTURING_PER_UNIT: { cartridge: 6, tape: 1.5, floppy: 2, cd: 1.2, dvd: 1, bluray: 1.5, digital: 0, card: 4 },
  REPUTATION_REACH_MIN: 0.4,
  /** Small/medium games reach further in the early, uncrowded era (fades out by ~2005). */
  INDIE_ERA_BOOST: 0.9, // early-era reach boost for small/medium games (fades out over 25 years)
  REPUTATION_REACH_MAX: 1.25,
  FAN_CONVERSION: 0.18, // buyers of a liked game who become franchise fans
  FATIGUE_PER_SEQUEL: 0.18,
  FATIGUE_DECAY_YEARS: 2.2,
  HYPE_DECAY_WEEKLY: 0.04,
  HYPE_MAX: 3,
  /** Retail seasonality by month (Jan..Dec): holidays sell, January and summer are quiet. Mean ≈ 1. */
  SEASONALITY: [0.78, 0.85, 0.95, 0.92, 0.9, 0.88, 0.86, 0.92, 1.02, 1.08, 1.32, 1.52] as const,

  // ── Monetization multipliers on lifetime revenue/units & user score ───────
  MONETIZATION: {
    premium: { units: 1, priceMul: 1, tailMul: 1, userScore: 0, minYear: 1980 },
    shareware: { units: 1.6, priceMul: 0.45, tailMul: 1.2, userScore: 2, minYear: 1988 },
    subscription: { units: 0.55, priceMul: 2.6, tailMul: 2.6, userScore: -2, minYear: 1997 },
    premium_dlc: { units: 1, priceMul: 1.18, tailMul: 1.15, userScore: -1, minYear: 2005 },
    f2p: { units: 6, priceMul: 0.16, tailMul: 1.8, userScore: -6, minYear: 2009 },
    live_service: { units: 1.3, priceMul: 1.05, tailMul: 2.2, userScore: -3, minYear: 2017 },
  } satisfies Record<Monetization, { units: number; priceMul: number; tailMul: number; userScore: number; minYear: number }>,

  // ── Finance ────────────────────────────────────────────────────────────────
  LOAN_RATE_BY_YEAR: [[1980, 0.15], [1985, 0.11], [1995, 0.085], [2005, 0.07], [2010, 0.05], [2020, 0.045], [2023, 0.075], [2026, 0.065]] as [number, number][],
  CREDIT_MULTIPLE: 0.45, // credit limit = trailing-12m revenue × this (+ base)
  CREDIT_BASE: 25_000,
  IPO_MIN_REVENUE: 6_000_000, // trailing-12m revenue (1980 $)
  IPO_MIN_REPUTATION: 55,
  SHARES_OUTSTANDING: 10_000_000,
  PE_BASE: 16,

  // ── Rivals ─────────────────────────────────────────────────────────────────
  RIVAL_SCORE_BASE: 54,
  RIVAL_SCORE_QUALITY: 30,
  RIVAL_SCORE_SD: 8,
  COMPETITION_WINDOW_DAYS: 35,
  COMPETITION_WEIGHT: 0.5,
} as const;

export type Difficulty = keyof typeof BALANCE.START_CASH;
