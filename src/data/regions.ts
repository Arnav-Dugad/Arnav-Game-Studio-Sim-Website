/**
 * World regions. Each has a share of the world's players (shifting by era: Japan's golden age, Europe's
 * computer scene, the rise of mobile everywhere else) and genre tastes. A game sells as before by default;
 * localising it for another region unlocks that region's appetite for its genre — big for an RPG in Japan,
 * small for a sports game there.
 */
import type { GenreId } from './types';
import type { Size } from '../sim/types';

export type RegionId = 'na' | 'eu' | 'jp' | 'row';

export interface RegionDef {
  id: RegionId;
  name: string;
  short: string;
  /** Share of the world's players at anchor years (interpolated). */
  share: [year: number, share: number][];
  taste: Partial<Record<GenreId, number>>;
  /** Sales reached without localisation, for text-heavy genres (light genres travel better). */
  unlocalized: number;
  blurb: string;
}

export const REGIONS: RegionDef[] = [
  {
    id: 'na',
    name: 'North America',
    short: 'NA',
    share: [[1980, 0.55], [1995, 0.42], [2010, 0.33], [2030, 0.26]],
    taste: { shooter: 1.35, sports: 1.35, action: 1.15, racing: 1.05, rpg: 0.9, strategy: 0.85, rhythm: 0.9, mmo: 0.95, visual_novel: 0.55, cards: 1.05 },
    unlocalized: 0.7,
    blurb: 'The biggest market for most of history. Loves shooters, sports and action.',
  },
  {
    id: 'eu',
    name: 'Europe',
    short: 'EU',
    share: [[1980, 0.2], [1995, 0.3], [2010, 0.3], [2030, 0.24]],
    taste: { strategy: 1.35, simulation: 1.35, racing: 1.2, sports: 1.15, puzzle: 1.05, platformer: 0.95, fighting: 0.85, cards: 1.15, visual_novel: 0.6 },
    unlocalized: 0.75,
    blurb: 'A strong computer scene: strategy, simulation, racing and football.',
  },
  {
    id: 'jp',
    name: 'Japan',
    short: 'JP',
    share: [[1980, 0.22], [1990, 0.24], [2000, 0.18], [2015, 0.1], [2030, 0.07]],
    taste: { rpg: 1.6, fighting: 1.45, rhythm: 1.5, platformer: 1.2, puzzle: 1.15, shooter: 0.5, sports: 0.65, strategy: 0.8, sandbox: 0.85, visual_novel: 2.2, cards: 1.1 },
    unlocalized: 0.45,
    blurb: 'Console-first and choosy: RPGs, fighting, rhythm games and visual novels rule. Little English.',
  },
  {
    id: 'row',
    name: 'Rest of the world',
    short: 'World',
    share: [[1980, 0.03], [1995, 0.06], [2005, 0.14], [2015, 0.3], [2030, 0.43]],
    taste: { mmo: 1.6, casual: 1.4, shooter: 1.15, strategy: 1.1, sports: 1.05, rpg: 1.05, simulation: 0.8, adventure: 0.85, cards: 1.2, visual_novel: 0.8 },
    unlocalized: 0.55,
    blurb: 'Latin America, China, South-East Asia and beyond: online, mobile and fast-growing.',
  },
];

export const REGION_BY_ID: Record<RegionId, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionDef>;

/** How much a genre leans on text (dialogue, menus): light genres travel without translation. */
const TEXT_HEAVY: Partial<Record<GenreId, number>> = { rpg: 1, adventure: 1, strategy: 0.9, simulation: 0.85, mmo: 0.9, sandbox: 0.6, action: 0.5, shooter: 0.45, sports: 0.4, racing: 0.3, fighting: 0.3, platformer: 0.3, puzzle: 0.35, casual: 0.35, rhythm: 0.4, cards: 0.5, visual_novel: 1 };

/** Localisation cost per region, in 1980 dollars, and extra work (share of the game). */
export const LOC_COST: Record<Size, number> = { small: 4_000, medium: 12_000, large: 35_000, aaa: 90_000 };
export const LOC_WORK = 0.03;
/** Branch offices abroad: games are localised there for free and sell a little better (a local team knows the market). */
export const BRANCH = { open: 400_000, rent: 12_000, minYear: 1985, minReputation: 35, reach: 1.06 };

/** Localisation is a thing from here (before, games shipped as they were). */
export const LOC_YEAR = 1983;

export function regionShare(r: RegionDef, year: number): number {
  const a = r.share;
  if (year <= a[0]![0]) return a[0]![1];
  for (let i = 1; i < a.length; i++) {
    const [y1, v1] = a[i]!;
    const [y0, v0] = a[i - 1]!;
    if (year <= y1) return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
  }
  return a[a.length - 1]![1];
}

/** Every region a game reaches in its players' language: paid localisation, branch-office versions and current branches (de-duplicated). */
export function gameRegions(c: { localized?: readonly RegionId[]; branchLocalized?: readonly RegionId[] }, branches: readonly RegionId[] = []): RegionId[] {
  return [...new Set([...(c.localized ?? []), ...(c.branchLocalized ?? []), ...branches])];
}

/** Shares normalised to sum to 1 for a year. */
export function regionShares(year: number): Record<RegionId, number> {
  const raw = REGIONS.map((r) => regionShare(r, year));
  const total = raw.reduce((t, v) => t + v, 0);
  return Object.fromEntries(REGIONS.map((r, i) => [r.id, raw[i]! / total])) as Record<RegionId, number>;
}

/** Sales reached in a region without localisation (1 = full). */
export function unlocalizedReach(r: RegionDef, genre: GenreId): number {
  const heavy = TEXT_HEAVY[genre] ?? 0.6;
  return 1 - (1 - r.unlocalized) * heavy;
}

/**
 * Where a game's players come from, and the sales multiplier from home region and localisation (1 = an
 * unlocalised game from a North American studio — the baseline every game had before regions existed).
 */
export function regionMix(year: number, genre: GenreId, home: RegionId, localized: readonly RegionId[], branches: readonly RegionId[] = []): { mix: Record<RegionId, number>; mul: number } {
  const shares = regionShares(year);
  let base = 0; // reference: an unlocalised game from a North American studio (the baseline everything was tuned on)
  let now = 0;
  const raw: Record<RegionId, number> = { na: 0, eu: 0, jp: 0, row: 0 };
  for (const r of REGIONS) {
    const demand = shares[r.id] * (r.taste[genre] ?? 1);
    const branch = r.id !== home && branches.includes(r.id);
    const local = r.id === home || branch || localized.includes(r.id);
    const without = r.id === home ? 1 : unlocalizedReach(r, genre);
    base += demand * (r.id === 'na' ? 1 : unlocalizedReach(r, genre));
    raw[r.id] = demand * (local ? 1 : without) * (branch ? BRANCH.reach : 1);
    now += raw[r.id];
  }
  const mix = Object.fromEntries(REGIONS.map((r) => [r.id, now > 0 ? raw[r.id] / now : 0])) as Record<RegionId, number>;
  return { mix, mul: base > 0 ? now / base : 1 };
}
