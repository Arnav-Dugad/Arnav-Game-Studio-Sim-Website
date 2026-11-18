/** Monthly offers: contract work, publisher deals, acquisition targets. */
import { COMPANY_BY_ID } from '../../data/companies';
import { BALANCE } from '../../data/balance';
import { clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { ContractOffer, DealOffer, GameState, Size } from '../types';
import { inflation, money } from '../util';
import { acquisitionPrice, adoptableIpValue } from './rivals';
import { benchmarkPoints } from './dev';

const CONTRACT_TEMPLATES = [
  { t: 'Port {genre} game to {platform}', d: 0.25 },
  { t: 'Tech demo for {client}', d: 0.15 },
  { t: 'Educational game for a school board', d: 0.7 },
  { t: 'Licensed tie-in minigame', d: 0.6 },
  { t: 'Bug-fixing sprint for {client}', d: 0.2 },
  { t: 'Level pack for {client}', d: 0.75 },
  { t: 'Advergame for a cereal brand', d: 0.6 },
  { t: 'Physics middleware testing', d: 0.1 },
  { t: 'Localisation & UI polish', d: 0.55 },
  { t: 'Prototype pitch for {client}', d: 0.5 },
];

const GENRE_WORDS = ['a racing', 'a puzzle', 'an arcade', 'a sports', 'a strategy', 'a platform'];

/** How many studios a group can run before management can't absorb another. */
export const MAX_SUBSIDIARIES = 12;
export const ownedStudios = (s: GameState) => Object.values(s.rivals).filter((r) => r.ownedByPlayer && r.alive).length;

/** Offers go away the day they expire (not at the next monthly refresh), so nothing expired can be taken. */
export function pruneOffers(s: GameState): void {
  if (s.offers.contracts.some((o) => o.expiresDay <= s.day)) s.offers.contracts = s.offers.contracts.filter((o) => o.expiresDay > s.day);
  if (s.offers.deals.some((o) => o.expiresDay <= s.day)) s.offers.deals = s.offers.deals.filter((o) => o.expiresDay > s.day);
  if (s.offers.acquisitions.some((o) => o.expiresDay <= s.day)) s.offers.acquisitions = s.offers.acquisitions.filter((o) => o.expiresDay > s.day);
}

export function refreshOffers(c: Ctx): void {
  const { s, rng } = c;
  pruneOffers(s);
  const alive = Object.values(s.rivals).filter((r) => r.alive && !r.ownedByPlayer);
  const yr = fromDay(s.day).year;
  // Contracts: early game lifeline, scales with reputation
  const nContracts = 3 - s.offers.contracts.length;
  for (let i = 0; i < nContracts; i++) {
    const tpl = rng.pick(CONTRACT_TEMPLATES);
    const client = alive.length ? rng.pick(alive) : undefined;
    const scale = (0.6 + s.company.reputation / 40) * rng.range(0.7, 1.4) * (1 + (yr - 1980) * 0.03);
    const pts = Math.round(rng.range(8, 22) * scale);
    const needDesign = Math.round(pts * tpl.d);
    const needTech = pts - needDesign;
    const days = Math.round(clamp(pts * rng.range(4.2, 6), 28, 160));
    const pay = Math.round(money(pts * rng.range(520, 760), s.day) / 100) * 100;
    s.offers.contracts.push({
      id: `ct${s.nextId++}`,
      title: tpl.t.replace('{genre}', rng.pick(GENRE_WORDS)).replace('{platform}', 'home computers').replace('{client}', client?.name ?? 'a hardware maker'),
      client: client?.id ?? 'unknown',
      needDesign,
      needTech,
      days,
      pay,
      penalty: Math.round(pay * 0.25),
      expiresDay: s.day + 40,
    } satisfies ContractOffer);
  }
  // Publisher deals
  const publishers = alive.filter((r) => {
    const d = COMPANY_BY_ID[r.id];
    return d && (d.kind === 'publisher' || d.kind === 'platform_holder') && r.reputation >= 30 && (s.offers.snubbed?.[r.id] ?? 0) <= s.day && (s.publisherTrust?.[r.id] ?? 0) > -3; // burned publishers stop calling
  });
  while (s.offers.deals.length < 3) {
    // one offer per publisher at a time (two different deals from the same company reads like a glitch)
    const pool = publishers.filter((p) => !s.offers.deals.some((d) => d.publisherId === p.id));
    if (!pool.length) break;
    const pub = rng.pick(pool);
    const size = (['small', 'medium', 'large', 'aaa'] as Size[])[clamp(Math.floor(s.company.reputation / 25), 0, 3)]!;
    const bench = benchmarkPoints(size, s.day);
    const trust = s.publisherTrust?.[pub.id] ?? 0;
    const advance = Math.round((money(bench * rng.range(220, 380), s.day) * (1 + 0.06 * trust)) / 1000) * 1000;
    s.offers.deals.push({
      id: `dl${s.nextId++}`,
      publisherId: pub.id,
      advance,
      royalty: Math.round(clamp(0.3 + s.company.reputation / 300 + 0.015 * trust + rng.range(-0.05, 0.06), 0.22, 0.65) * 100) / 100,
      minScore: Math.round(clamp(55 + pub.reputation / 8 - trust + rng.range(-5, 5), 50, 85)),
      // time to make the size of game they're paying for, with some slack (a fixed window made big deals impossible)
      deadlineDay: s.day + Math.round(Math.max(200, BALANCE.SIZE[size].days * rng.range(1.25, 1.7))),
      reach: Math.round(clamp(1.15 + pub.reputation / 80 + pub.staff / 1500, 1.15, 2.4) * 100) / 100,
      marketingBudget: Math.round(money(rng.range(10_000, 40_000) * (1 + pub.reputation / 50), s.day)),
      size,
      expiresDay: s.day + 60,
    } satisfies DealOffer);
    if (s.offers.deals.length >= 3) break;
  }
  // Acquisition targets (once the company has some heft)
  if (s.company.reputation >= 35 && s.offers.acquisitions.length < 3 && ownedStudios(s) < MAX_SUBSIDIARIES) {
    // Studios mid-way through a game for your label aren't for sale (you'd be buying your own advance back).
    const funded = new Set((s.publishingDeals ?? []).filter((d) => d.status === 'dev').map((d) => d.rivalId));
    const cands = alive.filter((r) => (r.procedural || r.staff < 120) && r.reputation < s.company.reputation + 10 && !funded.has(r.id) && !s.offers.acquisitions.some((a) => a.id === r.id));
    if (cands.length) {
      const r = rng.pick(cands);
      s.offers.acquisitions.push({ id: r.id, price: acquisitionPrice(s, r), ip: adoptableIpValue(s, r.id), expiresDay: s.day + 90 });
    }
  }
}

export function dealTerms(_s: GameState, d: DealOffer): string {
  return `${Math.round(d.royalty * 100)}% royalty · ${d.minScore}+ score · ${Math.round(d.reach * 100)}% reach`;
}

/** Estimated calendar days for a team to finish a contract (cautious: assumes ~72% productivity, for sick days and slow starts). */
export function estimateContractDays(s: GameState, o: { needDesign: number; needTech: number }, team: string[]): number {
  let rate = 0;
  const dShare = o.needDesign / Math.max(1, o.needDesign + o.needTech);
  for (const id of team) {
    const st = s.staff[id];
    if (!st) continue;
    const best = Math.max(st.skills.design, st.skills.programming, st.skills.art, st.skills.writing, st.skills.qa) / 100;
    rate += (dShare * Math.max(st.skills.design / 100, best * 0.75) + (1 - dShare) * Math.max(st.skills.programming / 100, best * 0.75)) * 0.72;
  }
  if (rate <= 0) return Infinity;
  return Math.ceil(((o.needDesign + o.needTech) / rate) * 7 / 5);
}

export function contractValuePerDay(o: ContractOffer): number {
  return o.pay / Math.max(1, o.days);
}

export { inflation };
