/**
 * Hardware division: design, launch and sell your own console or handheld.
 *
 * A player console is a real platform in the market model: it gets an install base, market share,
 * and appears in the Develop wizard (free dev kit, no platform royalty on your own games). Hardware
 * is sold at a thin margin (often a loss at launch, as in real life) while third-party licence fees
 * and your own exclusives are where the money is.
 */
import { PLATFORMS } from '../../data/platforms';
import { COMPANY_BY_ID } from '../../data/companies';
import { livePlatforms } from './market';
import { BD, clamp } from '../breakdown';
import { fromDay, parseYM } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState, PlayerConsole, Release } from '../types';
import { addRep, earn, money, pushNews, spend } from '../util';

const YEAR = 365.2425;

export type ConsoleTier = PlayerConsole['tier'];
export type ConsoleKind = PlayerConsole['kind'];
export type ConsoleMarketing = PlayerConsole['marketing'];

/** Design constants in 1980 dollars. */
export const TIERS: Record<ConsoleTier, { label: string; techDelta: number; rd: number; months: number; unitCost: number; refPrice: number; desc: string }> = {
  budget: { label: 'Budget', techDelta: -1, rd: 7_000_000, months: 14, unitCost: 100, refPrice: 120, desc: 'Last-gen power at a friendly price. Cheap to build, easy to sell.' },
  standard: { label: 'Standard', techDelta: 0, rd: 16_000_000, months: 20, unitCost: 150, refPrice: 170, desc: 'Matches the current generation. The safe bet.' },
  premium: { label: 'Premium', techDelta: 1, rd: 35_000_000, months: 26, unitCost: 245, refPrice: 250, desc: 'Leapfrogs the competition. Expensive, but enthusiasts flock to it.' },
};

export const KIND_MUL: Record<ConsoleKind, { rd: number; cost: number; price: number }> = {
  console: { rd: 1, cost: 1, price: 1 },
  handheld: { rd: 0.7, cost: 0.6, price: 0.65 },
};

export const MARKETING: Record<ConsoleMarketing, { label: string; cost: number; mul: number }> = {
  none: { label: 'Word of mouth', cost: 0, mul: 1 },
  standard: { label: 'Launch campaign', cost: 2_500_000, mul: 1.15 },
  blitz: { label: 'Global blitz', cost: 8_000_000, mul: 1.32 },
};

export const MIN_REPUTATION = 55;
export const MAX_LIVE = 2;
export const RESEARCH_ID = 'biz_hardware_lab';
const AUTO_RETIRE_YEARS = 12;
/** Share of the retail price the maker receives (retailers keep the rest). */
export const WHOLESALE = 0.8;

function mediaFor(year: number): PlayerConsole['media'] {
  if (year < 1994) return 'cartridge';
  if (year < 2000) return 'cd';
  if (year < 2006) return 'dvd';
  if (year < 2030) return 'bluray';
  return 'digital';
}

/** Highest tech of mainstream hardware launched in the last four years (or about to launch). */
export function frontierTech(s: GameState, day = s.day): number {
  let best = 1;
  for (const p of PLATFORMS) {
    if (p.kind !== 'console' && p.kind !== 'handheld') continue;
    const launch = parseYM(p.launch);
    if (launch <= day + 180 && launch >= day - 4 * YEAR) best = Math.max(best, p.tech);
  }
  for (const f of s.market.futurePlatforms) if (f.launchDay <= day + 180 && f.launchDay >= day - 4 * YEAR) best = Math.max(best, f.tech);
  // If nothing launched recently (long gaps in history / endless mode), fall back to the newest ever.
  if (best === 1) {
    for (const p of PLATFORMS) if (parseYM(p.launch) <= day && (p.kind === 'console' || p.kind === 'handheld')) best = Math.max(best, p.tech);
    for (const f of s.market.futurePlatforms) if (f.launchDay <= day) best = Math.max(best, f.tech);
  }
  return best;
}

/** Typical lifetime sales (millions) of same-kind hardware launched around now. */
function typicalUnitsM(s: GameState, kind: ConsoleKind, day: number): number {
  const xs: number[] = [];
  for (const p of PLATFORMS) {
    if (p.kind !== kind || p.curve === 'flop') continue;
    const launch = parseYM(p.launch);
    if (Math.abs(launch - day) <= 5 * YEAR) xs.push(p.unitsM);
  }
  for (const f of s.market.futurePlatforms) if (f.kind === kind && Math.abs(f.launchDay - day) <= 5 * YEAR) xs.push(f.unitsM);
  if (!xs.length) return kind === 'handheld' ? 45 : 40;
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]!;
}

export function consoleSpec(s: GameState, kind: ConsoleKind, tier: ConsoleTier, day = s.day) {
  const t = TIERS[tier];
  const k = KIND_MUL[kind];
  const tech = Math.max(1, frontierTech(s, day) + t.techDelta - (kind === 'handheld' ? 1 : 0));
  return {
    tech,
    rdTotal: money(t.rd * k.rd, day),
    months: t.months - (kind === 'handheld' ? 3 : 0),
    unitCost1980: t.unitCost * k.cost,
    refPrice: money(t.refPrice * k.price, day),
  };
}

export function liveConsoles(s: GameState): PlayerConsole[] {
  return (s.hardware ?? []).filter((c) => c.status === 'live');
}

export function canDesignConsole(s: GameState): string | null {
  if (!s.research.done.includes(RESEARCH_ID)) return 'Research the Hardware Lab first (Business branch)';
  if (s.company.reputation < MIN_REPUTATION) return `Retailers won't stock a console from a studio under ${MIN_REPUTATION} reputation`;
  if ((s.hardware ?? []).some((c) => c.status === 'dev')) return 'Your hardware team is already building a console';
  if (liveConsoles(s).length >= MAX_LIVE) return `You can support at most ${MAX_LIVE} consoles on the market at once — retire one first`;
  return null;
}

/**
 * Manufacturing cost per unit (nominal) for a console on a given day: falls ~15% a year (cheaper chips, die shrinks,
 * slimmer revisions), so a console sold at a loss on launch day turns a profit on each unit within a couple of years.
 */
export function unitCost(c: PlayerConsole, day: number): number {
  const age = Math.max(0, (day - c.launchDay) / YEAR);
  return money(c.unitCost1980, day) * Math.pow(0.85, age);
}

/** Reference retail price (nominal) the market expects for this console today. */
export function refPrice(c: PlayerConsole, day: number): number {
  const age = Math.max(0, (day - c.launchDay) / YEAR);
  const war = c.priceWarDay !== undefined && day >= c.priceWarDay ? PRICE_WAR_CUT : 1;
  return money(TIERS[c.tier].refPrice * KIND_MUL[c.kind].price, day) * Math.pow(0.95, age) * war;
}

/** Market share at which the incumbents start a price war, and how much it cuts expected prices. */
export const PRICE_WAR_SHARE = 0.12;
export const PRICE_WAR_CUT = 0.88;

/** Demand vs. the price the market expects: gentle below it, falling off a cliff above it. */
export function priceFactor(c: PlayerConsole, day: number): number {
  const rel = Math.max(1, c.price) / refPrice(c, day);
  if (rel <= 1) return Math.min(2.3, Math.pow(1 / rel, 1.3));
  return Math.max(0.01, Math.exp(-2.5 * (rel - 1)));
}

/** Allowed retail price range for a console today. */
export function priceBounds(c: PlayerConsole, day: number): [number, number] {
  const ref = refPrice(c, day);
  return [Math.round(ref * 0.3), Math.round(ref * 4)];
}

/** Third-party publishers support cheap-to-license platforms more. */
export function supportFactor(feeRate: number): number {
  return clamp(Math.exp(-3 * (feeRate - 0.2)), 0.35, 1.5);
}

/** Projects still in development for a console. */
export function projectsTargeting(s: GameState, id: string): number {
  return Object.values(s.projects).filter((p) => p.kind === 'game' && p.concept.platforms.includes(id)).length;
}

/** Lifetime demand estimate at launch, with an explanation. */
export function launchPotential(s: GameState, c: PlayerConsole, day = s.day) {
  const typical = typicalUnitsM(s, c.kind, day);
  const rep = s.company.reputation;
  const repF = 0.2 + 0.8 * Math.pow(clamp(rep, 0, 100) / 100, 1.2);
  const techF = clamp(1 + (c.tech - frontierTech(s, day)) * 0.18, 0.4, 1.4);
  const prior = (s.hardware ?? []).filter((x) => x.id !== c.id && x.status !== 'dev');
  const bestPrior = prior.reduce((m, x) => Math.max(m, x.unitsSold), 0);
  const trust = prior.length === 0 ? 0.5 : clamp(0.55 + (0.45 * bestPrior) / (typical * 1e6), 0.55, 1);
  const fans = Object.values(s.franchises).reduce((t, f) => t + (f.fans ?? 0), 0);
  const fanF = 1 + Math.min(0.25, fans / (typical * 1e6 * 2));
  const mkt = MARKETING[c.marketing].mul;
  const b = new BD(`Typical ${c.kind} sales this era (M)`, typical);
  b.mul(`Reputation ${Math.round(rep)}`, repF);
  b.mul(`Tech ${c.tech} vs frontier ${frontierTech(s, day)}`, techF);
  b.mul(prior.length ? 'Brand trust (your past hardware)' : 'Newcomer to hardware', trust);
  if (fanF > 1.001) b.mul('Your franchise fans', fanF);
  if (mkt !== 1) b.mul(MARKETING[c.marketing].label, mkt);
  return b.done();
}

/** Units (millions) sold this month at current price/fee/buzz. */
export function monthlyDemandM(c: PlayerConsole, day: number): number {
  if (c.status !== 'live') return 0;
  const age = Math.max(0, (day - c.launchDay) / YEAR) + 0.25;
  const pk = c.kind === 'handheld' ? 2.2 : 2.6;
  const shape = (age / pk) * Math.exp(1 - age / pk);
  const rate = c.potentialM / (Math.E * pk); // per year at the shape's peak, integrates to ≈ potential
  return (rate / 12) * shape * priceFactor(c, day) * supportFactor(c.feeRate) * (1 + c.boost);
}

/** A great pack-in game sells hardware (score 90 → +30%). Returns 1 with no valid pack-in. */
export function packInMul(s: GameState, hw: PlayerConsole): number {
  const rel = hw.packIn ? s.releases[hw.packIn] : undefined;
  if (!rel || !rel.concept.platforms.includes(hw.id)) return 1;
  return 1 + Math.max(0, rel.score - 60) / 100;
}

/** Third-party software spend per active user per month (nominal). */
function spendPerUser(day: number): number {
  return money(1.6, day);
}

export function installedOf(c: PlayerConsole): number {
  return c.installedM;
}

// ── Monthly update ─────────────────────────────────────────────────────────

export function hardwareMonthly(c: Ctx): void {
  const { s, rng } = c;
  if (!s.hardware?.length) return;
  for (const hw of s.hardware) {
    if (hw.status === 'dev') {
      const months = Math.max(1, Math.round((hw.launchDay - hw.devStartDay) / 30.44));
      const pay = Math.min(hw.rdTotal - hw.rdPaid, Math.ceil(hw.rdTotal / months));
      if (pay > 0) {
        spend(s, 'hardware_rd', pay);
        hw.rdPaid += pay;
      }
      if (s.day < hw.launchDay) continue;
      launch(c, hw, rng.range(0.85, 1.15));
    }
    if (hw.status !== 'live') continue;
    const pim = packInMul(s, hw);
    const units = monthlyDemandM(hw, s.day) * pim;
    hw.installedM += units;
    hw.unitsSold += Math.round(units * 1e6);
    hw.monthly.push(Math.round(units * 1e4) / 1e4);
    if (hw.monthly.length > 240) hw.monthly.shift();
    const rev = units * 1e6 * hw.price * WHOLESALE;
    const cost = units * 1e6 * unitCost(hw, s.day);
    earn(s, 'hardware', rev);
    spend(s, 'manufacturing', cost);
    hw.hwRevenue += Math.round(rev);
    hw.hwCost += Math.round(cost);
    // Licence fees from third-party games sold on your platform.
    const users = s.market.users[hw.id] ?? 0;
    const fees = users * 1e6 * spendPerUser(s.day) * 0.6 * hw.feeRate * supportFactor(hw.feeRate);
    earn(s, 'platform_fees', fees);
    hw.feeRevenue += Math.round(fees);
    // Bundled players become fans of the pack-in's franchise.
    const pack = hw.packIn ? s.releases[hw.packIn] : undefined;
    if (pim > 1 && pack?.concept.franchiseId && s.franchises[pack.concept.franchiseId]) s.franchises[pack.concept.franchiseId]!.fans += Math.round(units * 1e6 * 0.08);
    // The incumbents notice a real threat and slash their prices.
    const share = s.market.share[hw.id] ?? 0;
    if (hw.priceWarDay === undefined && share >= PRICE_WAR_SHARE && s.day - hw.launchDay > 365) {
      hw.priceWarDay = s.day;
      const rivals = livePlatforms(s)
        .filter((p) => !p.own && (p.kind === 'console' || p.kind === 'handheld'))
        .sort((a, b) => (s.market.share[b.id] ?? 0) - (s.market.share[a.id] ?? 0))
        .slice(0, 2);
      const names = [...new Set(rivals.map((p) => COMPANY_BY_ID[p.maker]?.name ?? p.maker))];
      const n = pushNews(s, {
        category: 'platform',
        headline: `${names.length ? names.join(' and ') : 'Rival platform holders'} slash prices to fight the ${hw.name}`,
        body: `Your console's ${Math.round(share * 100)}% market share has the incumbents worried. Players now expect a cheaper ${hw.name} — consider a price cut.`,
        tone: 'bad',
      });
      c.out.push({ type: 'news', newsId: n.id, major: true });
    }
    hw.boost *= 0.95;
    // End of life — but never strand a game that is still being made for it.
    if ((s.day - hw.launchDay) / YEAR >= AUTO_RETIRE_YEARS && projectsTargeting(s, hw.id) === 0) retireConsole(c, hw, 'reached the end of its life');
  }
}

function launch(c: Ctx, hw: PlayerConsole, luck: number): void {
  const { s } = c;
  const why = launchPotential(s, hw);
  hw.potentialM = Math.max(0.2, why.total * luck);
  hw.potentialWhy = { total: hw.potentialM, parts: [...why.parts, ...(Math.abs(luck - 1) > 0.01 ? [{ label: luck > 1 ? 'Launch buzz' : 'Shaky launch', value: luck, kind: 'mul' as const }] : [])] };
  hw.status = 'live';
  hw.launchDay = s.day;
  addRep(s, 3, 'Launched your own hardware');
  const n = pushNews(s, {
    category: 'studio',
    headline: `${s.company.name} launches the ${hw.name}`,
    body: `The ${hw.name} ${hw.kind} hits shelves at ${'$' + Math.round(hw.price)}. Analysts expect around ${hw.potentialM.toFixed(1)} million units over its lifetime.`,
    tone: 'good',
  });
  c.out.push({ type: 'news', newsId: n.id, major: true });
}

export function retireConsole(c: Ctx, hw: PlayerConsole, why = 'was discontinued'): void {
  if (hw.status !== 'live') return;
  hw.status = 'retired';
  hw.endDay = c.s.day;
  const n = pushNews(c.s, { category: 'studio', headline: `The ${hw.name} ${why}`, body: `${(hw.unitsSold / 1e6).toFixed(1)} million units sold.`, tone: 'neutral' });
  c.out.push({ type: 'news', newsId: n.id, major: false });
}

/** Called when the player releases a game: great exclusives sell hardware. */
export function exclusiveBuzz(s: GameState, rel: Release): void {
  if (!s.hardware?.length) return;
  const own = rel.concept.platforms.filter((p) => s.hardware.some((h) => h.id === p && h.status === 'live'));
  if (!own.length) return;
  const exclusive = own.length === rel.concept.platforms.length;
  const sizeW = { small: 0.3, medium: 0.6, large: 1, aaa: 1.5 }[rel.concept.size];
  const gain = (Math.max(0, rel.score - 60) / 40) * sizeW * (exclusive ? 0.3 : 0.1);
  for (const id of own) {
    const hw = s.hardware.find((h) => h.id === id)!;
    hw.boost = Math.min(1.5, hw.boost + gain);
  }
}

/** Lifetime profit of a console so far (hardware margin + fees − R&D). */
export function consoleProfit(hw: PlayerConsole): number {
  return hw.hwRevenue - hw.hwCost + hw.feeRevenue - hw.rdPaid;
}

export function consoleYear(hw: PlayerConsole): number {
  return fromDay(hw.launchDay).year;
}

export { mediaFor };
