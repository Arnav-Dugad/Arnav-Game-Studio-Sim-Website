/**
 * Releasing games: critic reviews + blurbs, user score, sales potential, weekly sales, franchises,
 * reputation, live-service income and yearly awards.
 */
import { eggOnRelease } from './easterEggs';
import { collectorsOnRelease } from './collectors';
import { campaignBoost } from './awardsCampaign';
import { renownSalesMul, renownUserEffect } from './renown';
import { PRICE_MUL, priceDemandMul, priceTierOf, priceUserEffect } from './pricing';
import { docOnRelease } from './documentary';
import { codevShareVoid } from './codev';
import { communityNudge, communityUserBonus } from './community';
import { partnersOnRelease } from './partners';
import { CULTURE_FX } from '../../data/culture';
import { hasValue } from './culture';
import { REGION_BY_ID, gameRegions, regionMix } from '../../data/regions';
import { ambitionOnShip } from './ambitions';
import { exclusiveBuzz } from './hardware';
import { catalogSalesMul } from './subscription';
import { leagueOnRelease, leagueSalesMul } from './esports';
import { FEATURE_BY_ID } from '../../data/gameFeatures';
import { showdownOnRelease } from './rivalry';
import { BALANCE } from '../../data/balance';
import { GENRES, GENRE_BY_ID } from '../../data/genres';
import { COMPANY_BY_ID } from '../../data/companies';
import { OUTLETS, type OutletDef } from '../../data/outlets';
import { TOPIC_BY_ID } from '../../data/topics';
import { BD, clamp, type Breakdown } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { Rng } from '../rng';
import type { AwardWinner, CriticReview, GameProject, GameState, PlatformSales, Release, Size } from '../types';
import { addRep, earn, fmtMoney, fmtUnits, hasFlag, inflation, newId, pushNews, spend } from '../util';
import { finishProject, qualityToScore } from './dev';
import { activeUsersM, demandMul, genreInterest, isPlatformAvailable, platformAudienceFit, platformGenreFit, platformInfo, topicPopularity, type PlatformInfo } from './market';

const SIZE_REP: Record<Size, number> = { small: 0.6, medium: 1, large: 1.4, aaa: 1.8 };
/** Price multiplier by size: retail-era games all cost about the same; digital lets small games sell cheap. */
const SIZE_PRICE_RETAIL: Record<Size, number> = { small: 0.8, medium: 0.92, large: 1, aaa: 1 };
const SIZE_PRICE_DIGITAL: Record<Size, number> = { small: 0.25, medium: 0.45, large: 0.8, aaa: 1 };

export function reputationReach(rep: number): number {
  return BALANCE.REPUTATION_REACH_MIN + (BALANCE.REPUTATION_REACH_MAX - BALANCE.REPUTATION_REACH_MIN) * (rep / 100);
}

// ── Blurbs ───────────────────────────────────────────────────────────────────

export const PRAISE: Record<string, string[]> = {
  effort: ['Brimming with content and craft.', 'You can feel the hours poured into every corner.', 'An astonishing amount of game for the price.', 'Generous, confident and packed with ideas.'],
  focus: ['Every system pulls in the same direction.', 'It knows exactly what kind of game it wants to be.', 'The core loop is tight and endlessly replayable.', 'Smart priorities: the team put effort exactly where it counts.'],
  combo: ['A premise and genre made for each other.', 'The setting and mechanics click instantly.', 'The theme gives every mechanic a reason to exist.'],
  tech: ['A technical showcase that pushes the hardware.', 'Looks and runs like a generation ahead.', 'Silky smooth on the hardware it targets.'],
  bugs: ['Rock solid. Not a crash in sight.', 'Polished to a mirror shine.', 'Remarkably stable for a launch build.'],
  trend: ['Lands right in the middle of what players crave.', 'Perfectly in tune with the moment.', 'Exactly the game everyone is talking about this season.'],
  fresh: ['Something genuinely new.', 'A breath of fresh air.', 'Bold, original and a little bit strange — in a good way.'],
  balance: ['Design and technology in perfect balance.', 'Feels as good as it looks.'],
  repeat: ['Comfort food done right.'],
  audience: ['Knows exactly who it’s for.', 'Pitched perfectly at its audience.'],
};
export const CRITIQUE: Record<string, string[]> = {
  effort: ['Feels thin and rushed.', 'There just isn’t much here.', 'Over before it gets going.'],
  focus: ['Pulls in too many directions at once.', 'The priorities feel muddled.', 'Strong parts, wrong emphasis.'],
  combo: ['The theme and the mechanics never gel.', 'An odd pairing that never quite works.'],
  tech: ['Looks dated next to its peers.', 'The engine is showing its age.'],
  bugs: ['Riddled with bugs and crashes.', 'Needed another month of QA.', 'Glitches undermine every good idea.'],
  trend: ['Arrives after the party ended.', 'Players have moved on from this.'],
  repeat: ['We have played this before. Several times.', 'Familiar to a fault.'],
  balance: ['Ambition outpaces execution.', 'Lopsided — great ideas, shaky foundations.', 'Lovely on paper, wobbly in the hands.'],
  audience: ['Not sure who it’s meant for.', 'Aimed at the wrong crowd.'],
};

function partKey(label: string): string {
  if (label.startsWith('Development')) return 'effort';
  if (label.startsWith('Focus')) return 'focus';
  if (label.startsWith('Audience')) return 'audience';
  if (label.includes('×')) return 'combo';
  if (label.startsWith('Engine') || label.startsWith('Platform')) return 'tech';
  if (label.startsWith('Bugs')) return 'bugs';
  if (label.includes('trend')) return 'trend';
  if (label.startsWith('Fresh') || label.startsWith('Visionary')) return 'fresh';
  if (label.includes('(great for') || label.includes('(an odd fit')) return 'focus';
  if (label.startsWith('Repetitive')) return 'repeat';
  if (label.startsWith('Design/tech')) return 'balance';
  return 'effort';
}

function blurb(rng: Rng, outlet: OutletDef, quality: Breakdown, score: number, gameName: string, idx = 0): string {
  const muls = quality.parts.filter((p) => p.kind === 'mul');
  // Each outlet notices different things: rotate through the top strengths / weaknesses.
  const bests = [...muls].sort((a, b) => b.value - a.value).slice(0, 3);
  const worsts = [...muls].sort((a, b) => a.value - b.value).slice(0, 3);
  const best = bests[idx % Math.max(1, bests.length)];
  const worst = worsts[idx % Math.max(1, worsts.length)];
  const base = quality.parts[0];
  const effortGood = (base?.value ?? 0) > 0.7;
  let line: string;
  if (score >= 75) {
    let k = best && best.value > 1.0 ? partKey(best.label) : effortGood ? 'effort' : 'focus';
    if (k === 'effort' && !effortGood) k = 'focus';
    line = rng.pick(PRAISE[k] ?? PRAISE.effort!);
  } else if (score >= 55) {
    let gk = best && best.value > 1 ? partKey(best.label) : 'focus';
    if (gk === 'effort' && !effortGood) gk = 'focus'; // don't praise effort that wasn't there
    // never praise and knock the same thing in one breath
    const bw = worsts.filter((w) => w.value < 1).map((w) => partKey(w.label)).filter((k) => k !== gk && !!CRITIQUE[k]);
    let bk = bw.length ? bw[idx % bw.length]! : gk === 'focus' ? 'balance' : 'focus';
    if (bk === 'effort' && effortGood) bk = gk === 'focus' ? 'balance' : 'focus';
    const good = rng.pick(PRAISE[gk] ?? PRAISE.focus!);
    const bad = rng.pick(CRITIQUE[bk] ?? CRITIQUE.balance!);
    line = `${good} ${bad}`;
  } else {
    const k = worst && worst.value < 0.95 ? partKey(worst.label) : effortGood ? 'focus' : 'effort';
    line = rng.pick(CRITIQUE[k] ?? CRITIQUE.effort!);
  }
  switch (outlet.voice) {
    case 'hype':
      return score >= 80 ? `${line} An absolute must-play!` : score < 50 ? `${line} Skip it.` : line;
    case 'snark':
      return score >= 85 ? `${line} Fine. We're impressed.` : score < 55 ? `${line} ${gameName}? More like ${gameName.split(' ')[0]}-not.` : line;
    case 'technical':
      return line;
    case 'warm':
      return score >= 70 ? `${line} A joy.` : line;
    default:
      return line;
  }
}

function displayScore(score: number, scale: OutletDef['scale']): string {
  if (scale === 100) return `${Math.round(score)}/100`;
  if (scale === 10) return `${(Math.round(score) / 10).toFixed(1)}/10`;
  const stars = Math.round((score / 20) * 2) / 2;
  return `${stars}/5`;
}

export function generateReviews(rng: Rng, s: GameState, quality: Breakdown, baseScore: number, bugDensity: number, genre: string, name: string): { reviews: CriticReview[]; aggregate: number } {
  const yr = fromDay(s.day).year;
  const outlets = OUTLETS.filter((o) => o.from <= yr && (o.to ?? 9999) >= yr);
  const reviews: CriticReview[] = [];
  let wsum = 0;
  let total = 0;
  for (const o of outlets) {
    const sc = clamp(baseScore + o.bias + (o.genreBias[genre as keyof typeof o.genreBias] ?? 0) + rng.normal(0, BALANCE.CRITIC_NOISE) - o.bugHate * bugDensity * 40, 1, 100);
    reviews.push({ outlet: o.name, score: sc, display: displayScore(sc, o.scale), blurb: blurb(rng, o, quality, sc, name, reviews.length) });
    total += sc * o.weight;
    wsum += o.weight;
  }
  return { reviews, aggregate: wsum ? total / wsum : baseScore };
}

// ── Pricing & per-unit economics ────────────────────────────────────────────

export function digitalShare(s: GameState, pl: PlatformInfo, day = s.day): number {
  if (pl.kind === 'mobile' || pl.kind === 'cloud' || pl.kind === 'vr' || pl.media === 'digital') return 1;
  const yr = fromDay(day).year + fromDay(day).month / 12;
  if (pl.kind === 'computer') {
    if (!hasFlag(s, 'digital')) return 0;
    const base = clamp((yr - 2004) / 11, 0, 0.92);
    return s.research.done.includes('biz_digital_store') ? Math.max(base, 0.35) : base * 0.6;
  }
  return clamp((yr - 2008) / 14, 0, 0.7);
}

export function gamePrice(s: GameState, pl: PlatformInfo, size: Size, monet: GameProject['concept']['monetization'], day = s.day): number {
  const launchInfl = inflation(pl.launchDay);
  const real = Math.pow(inflation(day) / launchInfl, 0.55);
  const dig = digitalShare(s, pl, day);
  const sizeMul = SIZE_PRICE_RETAIL[size] * (1 - dig) + SIZE_PRICE_DIGITAL[size] * dig;
  return Math.max(0.99, pl.gamePrice * real * sizeMul * BALANCE.MONETIZATION[monet].priceMul);
}

/** Net revenue per unit to the PUBLISHER (before publisher/engine royalties to others). */
export function netPerUnit(s: GameState, pl: PlatformInfo, price: number, selfPublished: boolean): number {
  const dig = digitalShare(s, pl);
  const storeCut = s.market.storeCut[pl.kind] ?? 0.3;
  const retail = price * (1 - BALANCE.RETAILER_CUT) * (1 - pl.royalty);
  const manufacturing = selfPublished ? BALANCE.MANUFACTURING_PER_UNIT[pl.media] * inflation(s.day) : 0;
  const digital = price * (1 - Math.max(storeCut, pl.kind === 'computer' ? 0 : pl.royalty));
  return Math.max(0.1, (1 - dig) * (retail - manufacturing) + dig * digital);
}

// ── Release ─────────────────────────────────────────────────────────────────

/**
 * Lifetime unit potential per platform for a concept at a given effective score and hype.
 * Shared by releases, the in-game forecast, and the balance probe.
 */
const CROSSPLAY_GENRES = new Set<string>(['shooter', 'fighting', 'sports', 'racing', 'mmo', 'strategy', 'sandbox']);

function crossplayEligible(s: GameState, concept: GameProject['concept'], platformCount: number): boolean {
  return s.research.done.includes('online_crossplay') && platformCount >= 2 && (CROSSPLAY_GENRES.has(concept.genre) || concept.monetization === 'live_service' || concept.monetization === 'f2p');
}

/** Games out in a platform's first months sell to early adopters starved for software. */
export const LAUNCH_WINDOW_DAYS = 120;
const LAUNCH_TITLE_BOOST = 1.35;
const MODDABLE = new Set<string>(['strategy', 'shooter', 'rpg', 'simulation', 'sandbox']);
/** PC games in moddable genres ship with mod tools once researched. */
export function moddable(s: GameState, c: GameProject['concept']): boolean {
  return s.research.done.includes('online_mod_tools') && MODDABLE.has(c.genre) && !c.expansionOf && c.platforms.some((pid) => platformInfo(s, pid)?.kind === 'computer');
}

export function launchTitleMul(s: GameState, pl: PlatformInfo, day = s.day): number {
  const age = day - pl.launchDay;
  if (age < 0 || age > LAUNCH_WINDOW_DAYS) return 1;
  return 1 + (LAUNCH_TITLE_BOOST - 1) * (1 - age / LAUNCH_WINDOW_DAYS);
}

/**
 * Users a game on this platform will sell to. A young platform keeps growing while the game sells, so in
 * its first year count the base it will have six months in (discounted), not today's handful of owners.
 */
function sellingUsersM(s: GameState, pid: string, pl: PlatformInfo): number {
  const now = s.market.users[pid] ?? 0;
  const age = s.day - pl.launchDay;
  if (age < 0 || age > 365 || pl.own) return now;
  const ahead = activeUsersM(pl, Math.max(s.day, pl.launchDay + 180)) * demandMul(s, pl);
  return Math.max(now, ahead * 0.7);
}

/** What a game will actually cost at launch: base price, expansion discount, culture and price tier. */
export function launchPrice(s: GameState, pl: PlatformInfo, c: GameProject['concept']): number {
  return gamePrice(s, pl, c.size, c.monetization) * (c.expansionOf ? BALANCE.EXPANSION_PRICE : 1) * (hasValue(s, 'players') ? CULTURE_FX.playersPrice : 1) * (hasValue(s, 'profit') ? CULTURE_FX.profitPrice : 1) * PRICE_MUL[priceTierOf(c)];
}

export function salesPotential(s: GameState, concept: GameProject['concept'], effScore: number, rawHype: number, opts: { renown?: boolean } = {}) {
  const fr = concept.franchiseId ? s.franchises[concept.franchiseId] : undefined;
  const crowd = BALANCE.ERA_BOOST / (1 + BALANCE.CROWDING * Math.max(0, fromDay(s.day).year - 1980));
  // Steep curve for hits, blended with a gentler one so mid-scoring games still find an audience.
  const q = clamp(effScore, 0, 100) / 100;
  const attach = BALANCE.ATTACH_PEAK * (0.85 * Math.pow(q, BALANCE.ATTACH_EXP) + 0.15 * Math.pow(q, 4)) * crowd;
  const deal = concept.deal;
  const marketingHype = deal ? Math.min(1.2, (deal.marketingBudget / Math.max(1, inflation(s.day) * 20_000)) * 0.4) : 0;
  const hype = Math.min(BALANCE.HYPE_MAX, rawHype + marketingHype);
  const yrs = fromDay(s.day).year - 1980;
  const indie = concept.size === 'small' || concept.size === 'medium' ? 1 + BALANCE.INDIE_ERA_BOOST * Math.max(0, 1 - yrs / 25) : 1;
  const reach = BALANCE.SIZE[concept.size].reach * indie * reputationReach(s.company.reputation) * (deal ? deal.reach : 0.9) * BALANCE.DIFFICULTY[s.settings.difficulty].sales;
  const monet = BALANCE.MONETIZATION[concept.monetization];
  const fatigueMul = (fr ? 1 - fr.fatigue * 0.45 : 1) * (concept.remasterOf ? BALANCE.REMASTER_REACH : 1);
  const sb = new BD('Reach (size × reputation × distribution)', reach);
  if (concept.remasterOf) sb.mul('Remaster (a nostalgia market)', BALANCE.REMASTER_REACH);
  // Cross-play: online-leaning games on several platforms share one player pool.
  const crossplay = crossplayEligible(s, concept, concept.platforms.length);
  if (crossplay) sb.mul('Cross-play', BALANCE.CROSSPLAY_SALES);
  sb.mul(`Review appeal (${Math.round(effScore)})`, attach * 10);
  sb.mul('Hype', 1 + hype * 0.45);
  sb.mul('Monetization', monet.units);
  const tier = priceTierOf(concept);
  const priceMul = priceDemandMul(tier, effScore);
  if (tier !== 'standard') sb.mul(tier === 'budget' ? 'Budget price (more people buy)' : 'Premium price (fewer people buy)', priceMul);
  if (fr) sb.mul('Franchise fatigue', fr ? 1 - fr.fatigue * 0.45 : 1);
  let featSales = 1;
  for (const id of concept.features ?? []) {
    const f = FEATURE_BY_ID[id];
    if (f?.sales) {
      featSales *= f.sales;
      sb.mul(f.name, f.sales);
    }
  }
  // a studio known for this genre: its players trust the name
  const renown = concept.expansionOf || concept.remasterOf || opts.renown === false ? 1 : renownSalesMul(s, concept.genre);
  if (renown > 1) sb.mul(`Known for ${GENRE_BY_ID[concept.genre].name} games`, renown);
  let totalUsers = 0;
  const launchTitles: { name: string; mul: number }[] = [];
  const g = GENRE_BY_ID[concept.genre];
  const platforms = concept.platforms
    .map((pid) => ({ pid, pl: platformInfo(s, pid) }))
    .filter((x): x is { pid: string; pl: PlatformInfo } => !!x.pl)
    .map(({ pid, pl }) => {
      const users = sellingUsersM(s, pid, pl) * 1e6;
      totalUsers += users;
      const interest =
        users *
        genreInterest(s, concept.genre) *
        Math.sqrt(platformGenreFit(pl, concept.genre)) *
        Math.sqrt(platformAudienceFit(pl, concept.audience) * (g.audience[concept.audience] ?? 1) * (TOPIC_BY_ID[concept.topic]?.audience[concept.audience] ?? 1)) *
        Math.sqrt(topicPopularity(s, concept.topic));
      const launch = launchTitleMul(s, pl);
      if (launch > 1.005) launchTitles.push({ name: pl.name, mul: launch });
      const potential = interest * attach * reach * (1 + hype * 0.45) * monet.units * fatigueMul * (crossplay ? BALANCE.CROSSPLAY_SALES : 1) * launch * featSales * priceMul * renown;
      return { platform: pid, potential: Math.max(0, potential), units: 0, pl };
    });
  for (const lt of launchTitles) sb.mul(`Launch title on ${lt.name} (early adopters buy everything)`, lt.mul);
  // Localisation: translated versions reach players abroad who'd otherwise pass.
  const home = s.company.homeRegion ?? 'na';
  const year = fromDay(s.day).year;
  const reached = gameRegions(concept, s.company.branches ?? []);
  const homeMul = regionMix(year, concept.genre, home, [], []).mul;
  const loc = regionMix(year, concept.genre, home, reached, s.company.branches ?? []);
  if (Math.abs(loc.mul - 1) > 0.0005) for (const ps of platforms) ps.potential *= loc.mul;
  if (Math.abs(homeMul - 1) > 0.0005) sb.mul(`Home market: ${REGION_BY_ID[home].name}`, homeMul);
  if (loc.mul / homeMul > 1.0005) sb.mul(`Localised for ${reached.filter((r) => r !== home).map((r) => REGION_BY_ID[r].short).join(', ')}`, loc.mul / homeMul);
  if (fr && fr.fans > 0) {
    const fanBuy = fr.fans * clamp((effScore - 40) / 50, 0.05, 1) * fatigueMul;
    for (const ps of platforms) ps.potential += fanBuy * (((s.market.users[ps.platform] ?? 0) * 1e6) / Math.max(1, totalUsers));
    sb.add('Franchise fans (units)', Math.round(fanBuy));
  }
  const base = concept.expansionOf ? s.releases[concept.expansionOf] : undefined;
  if (base) return expansionPotential(base, concept.size, platforms, effScore, hype, attach);
  return { platforms, hype, salesWhy: sb.done(), attach };
}

/**
 * Expansion packs sell mostly to people who own the base game (a share that climbs steeply with the
 * expansion's own reviews), plus a trickle of newcomers who buy both.
 */
function expansionPotential<P extends { platform: string; potential: number }>(base: Release, size: Size, platforms: P[], effScore: number, hype: number, attach: number) {
  const q = clamp(effScore, 0, 100) / 100;
  // A small add-on for a huge game appeals to fewer owners than a big one.
  const content = Math.min(1, Math.sqrt(BALANCE.SIZE[size].days / BALANCE.SIZE[base.concept.size].days));
  const share = Math.min(0.9, BALANCE.EXPANSION_ATTACH * Math.pow(q, 2.2) * (1 + hype * 0.25) * content);
  const owners = base.platforms.reduce((t, p) => t + p.units, 0);
  let fresh = 0;
  for (const ps of platforms) {
    const own = base.platforms.find((b) => b.platform === ps.platform)?.units ?? 0;
    const newcomers = ps.potential * 0.08;
    fresh += newcomers;
    ps.potential = own * share + newcomers;
  }
  const sb = new BD(`Owners of ${base.name}`, owners)
    .mul(`Expansion appeal (${Math.round(effScore)})`, share / content)
    .mul('Amount of new content vs. the base game', content)
    .add('Newcomers who buy both', Math.round(fresh));
  return { platforms, hype, salesWhy: sb.done(), attach };
}

export function releaseGame(c: Ctx, p: GameProject): void {
  const { s, rng } = c;
  const quality = p.qualityPreview!;
  const total = p.design + p.tech;
  const density = total > 0 ? p.bugs / total : 0;
  const base = qualityToScore(quality.total);
  const { reviews, aggregate } = generateReviews(rng, s, quality, base, density, p.concept.genre, p.concept.name);
  const score = clamp(Math.round(aggregate + (s.cheats?.scoreBonus ?? 0)), 1, 100);
  const fr = p.concept.franchiseId ? s.franchises[p.concept.franchiseId] : undefined;
  // User score
  const ub = new BD('Critics', score);
  ub.add('Monetization', BALANCE.MONETIZATION[p.concept.monetization].userScore);
  ub.add('Bugs', -Math.min(20, density * 45));
  if (p.hype > 1 && score < 72) ub.add('Didn’t live up to the hype', -Math.min(15, (p.hype * (72 - score)) / 5));
  if (fr && score >= 75) ub.add('Fan favourite', 3);
  // Series expectations: fans compare a new entry with the best one so far.
  // (Only your own entries count: an acquired series isn't judged against its legendary past.)
  const ownBest = fr ? Math.max(0, ...fr.entries.map((id) => s.releases[id]?.score ?? 0)) : 0;
  const sequel = !!fr && ownBest > 0 && !p.concept.expansionOf && !p.concept.remasterOf;
  const gap = sequel ? ownBest - score : 0;
  if (sequel && gap > 8) ub.add(`Not as good as the series’ best (${ownBest})`, -Math.min(10, (gap - 8) * 0.6));
  else if (sequel && ownBest >= 70 && score >= ownBest + 3) ub.add('Raises the bar for the series', 2);
  if (fr) ub.add('Franchise fatigue', -fr.fatigue * 12);
  if (p.paysCliffhanger) ub.add('Pays off the last game’s cliffhanger', 3);
  // players remember a public delay: forgiven for a great game, not for a weak one
  if ((p.delayedWeeks ?? 0) >= 4 && score >= 80) ub.add('Worth the wait', 1);
  else if ((p.delayedWeeks ?? 0) >= 4 && score < 65) ub.add('Delayed — and still disappointing', -2);
  if (s.research.done.includes('ai_genai') && fromDay(s.day).year >= 2023) ub.add('Gen-AI backlash', -1.5);
  if (hasValue(s, 'players')) ub.add('Culture: Player Obsessed', CULTURE_FX.playersUser);
  if (hasValue(s, 'profit')) ub.add('Culture: Profit Driven', CULTURE_FX.profitUser);
  for (const id of p.concept.features ?? []) {
    const f = FEATURE_BY_ID[id];
    if (f?.user) ub.add(f.name, f.user);
  }
  const modded = moddable(s, p.concept);
  if (modded) ub.add('Mod support', 2);
  const ea = p.earlyAccess;
  const eaWeeks = ea ? Math.floor((s.day - ea.day) / 7) : 0;
  const cf = p.crowdfund?.success ? p.crowdfund : undefined;
  const cfLate = cf?.promised !== undefined ? Math.max(0, s.day - cf.promised) : 0;
  if (cf && cfLate > 0) ub.add(`Backers waited ${Math.ceil(cfLate / 30)} month${Math.ceil(cfLate / 30) > 1 ? 's' : ''} past the promised date`, -Math.min(6, 1.5 * Math.ceil(cfLate / 30)));
  else if (cf) ub.add('Delivered to backers on time', 2);
  if (ea && eaWeeks >= 78) ub.add('Took years to leave Early Access', -4);
  else if (ea && eaWeeks >= 8 && ea.rating >= 55) ub.add('Shaped by Early Access players', 2);
  const pu = priceUserEffect(priceTierOf(p.concept), score);
  const ru = p.concept.expansionOf || p.concept.remasterOf ? 0 : renownUserEffect(s, p.concept.genre, score);
  if (ru) ub.add('Below the studio’s usual standard', ru);
  if (pu) ub.add(pu > 0 ? 'Great value' : 'Feels overpriced', pu);
  const cmb = communityUserBonus(s);
  if (cmb) ub.add(cmb > 0 ? 'A healthy community' : 'A toxic community', cmb);
  ub.add('Players vary', rng.normal(0, 3));
  ub.clamp(1, 100);
  const userScore = Math.round(ub.value);
  if (fr && gap > 8) fr.fans *= 1 - Math.min(0.15, (gap - 8) / 100); // some fans give up on the series

  // Sales potential
  const effScore = score * 0.7 + userScore * 0.3;
  // a 1.0 launch after Early Access is old news to part of the audience
  // a shadow drop: never announced, released out of nowhere (2015+), the surprise is the marketing
  const shadowDrop = p.announcedDay === undefined && !ea && !p.crowdfund && !p.concept.expansionOf && fromDay(s.day).year >= 2015;
  // when the reviews went live
  const rp = p.reviewPolicy ?? 'launch';
  const reviewMul = rp === 'early' ? (score >= 80 ? 1.07 : score < 65 ? 0.9 : 1) : rp === 'none' ? (score < 60 ? 1.05 : 0.96) : 1;
  const pot = salesPotential(s, p.concept, effScore, (ea && ea.units > 0 ? p.hype * 0.85 : p.hype) + (shadowDrop ? Math.max(0, 0.6 * clamp((score - 60) / 25, 0, 1) * clamp(0.3 + s.company.reputation / 60, 0.3, 1) - p.hype) : 0));
  const { hype, salesWhy } = pot;
  const plats = pot.platforms;
  const pricePl = plats[0]!.pl;
  const price = launchPrice(s, pricePl, p.concept);
  const baseDecay = score >= 88 ? BALANCE.LIFECYCLE_DECAY_EVERGREEN : digitalShare(s, pricePl) > 0.5 ? BALANCE.LIFECYCLE_DECAY_DIGITAL : BALANCE.LIFECYCLE_DECAY_RETAIL;
  // Mod communities keep PC games selling for years.
  const pcOnly = p.concept.platforms.every((pid) => platformInfo(s, pid)?.kind === 'computer');
  const decay = modded && pcOnly ? 1 - (1 - baseDecay) * 0.8 : baseDecay;
  if (modded) for (const pp of plats) if (pp.pl.kind === 'computer') pp.potential *= 1.1;
  if (reviewMul !== 1) for (const pp of plats) pp.potential *= reviewMul;
  if (rp === 'none') addRep(s, -0.5, 'No review copies');
  if (ea && ea.units > 0) {
    // Early Access buyers already own it: fewer new PC customers at 1.0
    const pcs = plats.filter((pp) => pp.pl.kind === 'computer');
    const pcPot = pcs.reduce((t, pp) => t + pp.potential, 0);
    for (const pp of pcs) pp.potential = Math.max(pp.potential * 0.5, pp.potential - ea.units * (pp.potential / Math.max(1, pcPot)));
  }
  if (cf && cf.backers > 0) {
    // most backers pledged for a copy: they already own it
    const all = plats.reduce((t, pp) => t + pp.potential, 0);
    for (const pp of plats) pp.potential = Math.max(pp.potential * 0.6, pp.potential - cf.backers * 0.8 * (pp.potential / Math.max(1, all)));
  }
  const id = newId(s, 'r');
  const rel: Release = {
    id,
    name: p.concept.name,
    concept: p.concept,
    regionMix: regionMix(fromDay(s.day).year, p.concept.genre, s.company.homeRegion ?? 'na', gameRegions(p.concept, s.company.branches ?? []), s.company.branches ?? []).mix,
    day: s.day,
    quality,
    score,
    userScore,
    reviews,
    platforms: plats.map(({ platform, potential }) => ({ platform, potential: Math.max(0, potential), units: 0 })),
    units: 0,
    gross: 0,
    net: 0,
    weekly: [],
    monthly: [],
    week: 0,
    price: Math.round(price * 100) / 100,
    decay,
    active: true,
    hypeAtLaunch: hype,
    devCost: p.spent,
    bugs: Math.round(p.bugs),
    awards: [],
    liveIncome: 0,
    serverLoad: ['mmo'].includes(p.concept.genre) || ['subscription', 'f2p', 'live_service'].includes(p.concept.monetization) ? 1 : 0,
    why: { sales: salesWhy, user: ub.done() },
    ...(p.beta ? { betaTested: true } : {}),
    ...(shadowDrop ? { shadowDrop: true } : {}),
    ...(p.coDev ? { coDev: { name: p.coDev.name, share: p.coDev.share, rivalId: p.coDev.rivalId } } : {}),
    ...(ea ? { earlyAccess: { weeks: eaWeeks, units: ea.units, net: Math.round(ea.net) } } : {}),
    ...(cf ? { crowdfund: { raised: cf.raised, backers: cf.backers, late: cfLate } } : {}),
    ...(modded ? { modded: true } : {}),
    ...(p.passion ? { passion: p.passion } : {}),
    ...(p.demo ? { demo: { ...p.demo } } : {}),
  };
  if (ea) {
    rel.units += ea.units;
    rel.gross += Math.round(ea.gross);
    rel.net += Math.round(ea.net);
  }
  rel.credits = p.team.map((sid) => s.staff[sid]).filter((x): x is NonNullable<typeof x> => !!x).map((x) => ({ id: x.id, name: x.name, role: x.role, level: x.level }));
  partnersOnRelease(s, rel);
  docOnRelease(s, p, rel);
  eggOnRelease(p, rel);
  collectorsOnRelease(s, rng, p, rel);
  s.releases[id] = rel;
  s.releaseOrder.push(id);
  exclusiveBuzz(s, rel);
  leagueOnRelease(s, rel);
  showdownOnRelease(s, rel);
  // Engine maturity
  const eng = s.engines[p.concept.engineId];
  if (eng) {
    eng.gamesShipped += 1;
    eng.maturity = Math.min(1, eng.maturity + 0.2 * (1 - eng.maturity));
  }
  // Staff morale/xp
  for (const sid of p.team) {
    const st = s.staff[sid];
    if (!st) continue;
    st.gamesShipped += 1;
    st.morale = clamp(st.morale + (score - 60) / 4, 0, 100);
    ambitionOnShip(c, st, score, p.concept.genre);
  }
  // Franchise bookkeeping
  let frId = p.concept.franchiseId;
  if (!frId) {
    frId = newId(s, 'f');
    s.franchises[frId] = { id: frId, name: p.concept.name.replace(/\s+\d+$|:.*$/, ''), genre: p.concept.genre, topic: p.concept.topic, fans: 0, entries: [], fatigue: 0, lastDay: s.day, bestScore: 0 };
    rel.concept = { ...rel.concept, franchiseId: frId };
  }
  const f = s.franchises[frId]!;
  const baseRel = p.concept.expansionOf ? s.releases[p.concept.expansionOf] : undefined;
  if (baseRel) {
    // An expansion isn't a sequel: no fatigue and no new entry, but it brings lapsed players back to the base game.
    reviveBase(baseRel, rel, score);
  } else {
    if (f.entries.length > 0 && s.day - f.lastDay < 365 * 2) f.fatigue = clamp(f.fatigue + BALANCE.FATIGUE_PER_SEQUEL, 0, 0.9);
    f.entries.push(id);
    f.lastDay = s.day;
    f.bestScore = Math.max(f.bestScore, score);
    if ((p.concept.features ?? []).includes('cliffhanger') && !p.concept.remasterOf) f.openCliffhanger = s.day;
  }
  // Reputation
  const rd = ((score - 60) / 7) * SIZE_REP[p.concept.size] * (baseRel ? 0.5 : 1);
  addRep(s, (rd > 0 ? rd * (1 - s.company.reputation / 115) : rd), `Reviews of ${rel.name}`);
  // Stats
  const st = s.progress.stats;
  st.gamesReleased += 1;
  if (score > st.bestScore) {
    st.bestScore = score;
    st.bestGame = rel.name;
  }
  if (score >= 85) st.hits += 1;
  if (score < 50) st.flops += 1;
  // Publisher clauses: deadline and minimum score
  const deal = p.concept.deal;
  if (deal && s.day > deal.deadlineDay) {
    const monthsLate = Math.ceil((s.day - deal.deadlineDay) / 30);
    addRep(s, -Math.min(8, 2 + monthsLate), 'Missed a publisher deadline');
    pushNews(s, { category: 'studio', headline: `Publisher frustrated: ${p.concept.name} shipped ${monthsLate} month${monthsLate > 1 ? 's' : ''} late`, tone: 'bad' });
  }
  if (deal) {
    // the publisher remembers how this went
    const late = s.day > deal.deadlineDay ? Math.ceil((s.day - deal.deadlineDay) / 30) : 0;
    const rank = { small: 1, medium: 2, large: 3, aaa: 4 } as const;
    const weight = Math.min(1, rank[p.concept.size] / rank[deal.size ?? p.concept.size]);
    const raw = (late ? -1 - late * 0.5 : 1) + (score >= deal.minScore ? 1 : -1.5) + (score >= deal.minScore + 10 ? 1 : 0);
    const d = raw > 0 ? raw * weight : raw; // a tiny game earns little trust, but a let-down still hurts
    (s.publisherTrust ??= {})[deal.publisherId] = Math.round(clamp((s.publisherTrust[deal.publisherId] ?? 0) + d, -5, 6) * 10) / 10;
  }
  if (deal && score < deal.minScore) {
    addRep(s, -(2), 'Publisher disappointed');
    pushNews(s, { category: 'studio', headline: `Publisher disappointed with ${rel.name}`, body: `The contract wanted ${deal.minScore}+.`, tone: 'bad' });
  }
  pushNews(s, {
    category: 'studio',
    headline: `${rel.name}${ea ? ' leaves Early Access and' : shadowDrop ? ' shadow-drops out of nowhere and' : ''} launches to ${score >= 85 ? 'rave' : score >= 70 ? 'positive' : score >= 50 ? 'mixed' : 'poor'} reviews (${score})`,
    body: `${GENRE_BY_ID[p.concept.genre].name} · ${TOPIC_BY_ID[p.concept.topic]?.name ?? p.concept.topic}. Users rate it ${userScore}.`,
    tone: score >= 70 ? 'good' : score >= 50 ? 'neutral' : 'bad',
  });
  // Journal: teach the player what worked
  communityNudge(s, (userScore - 70) / 4);
  learnFromRelease(s, p, quality);
  finishProject(s, p.id);
  c.out.push({ type: 'release', releaseId: id });
  c.out.push({ type: 'reviews', releaseId: id });
  c.out.push({ type: 'projectDone', projectId: p.id, kind: 'game' });
}

function learnFromRelease(s: GameState, p: GameProject, q: Breakdown): void {
  const g = GENRE_BY_ID[p.concept.genre];
  const t = TOPIC_BY_ID[p.concept.topic];
  const add = (line: string) => {
    if (!s.progress.journal.includes(line)) s.progress.journal.push(line);
  };
  for (const part of q.parts) {
    if (part.kind !== 'mul') continue;
    if (part.label.includes('×') && part.value >= 1.05) add(`${g.name} + ${t?.name}: great combination.`);
    if (part.label.includes('×') && part.value <= 0.8) add(`${g.name} + ${t?.name}: poor combination.`);
    if (part.label.startsWith('Focus') && part.value >= 1.0) add(`${g.name}: the focus split on ${p.concept.name} worked well.`);
    if (part.label.startsWith('Design/tech') && part.value < 0.85)
      add(`${g.name}: aim for about ${Math.round(g.designRatio * 100)}% design points.`);
  }
}

/** Weekly sales tick (called on Mondays). */
/** After the week's sales: did one of your games top the chart? (rival weekly sales are estimated the same way as the Market chart) */
function chartTopper(s: GameState): void {
  let rivalBest = 0;
  for (const g of s.rivalGames) {
    const weeks = Math.floor((s.day - g.day) / 7);
    if (weeks < 0 || weeks > 26) continue;
    rivalBest = Math.max(rivalBest, g.units * 0.12 * Math.pow(0.85, weeks));
  }
  let best: Release | null = null;
  let bestWeekly = 0;
  for (const id of s.releaseOrder.slice(-30)) {
    const r = s.releases[id];
    if (!r?.active) continue;
    const w = r.lastWeekUnits ?? 0;
    if (w > bestWeekly) {
      bestWeekly = w;
      best = r;
    }
  }
  if (best && bestWeekly > rivalBest && bestWeekly > 1000 && !best.numberOne) {
    best.numberOne = true;
    s.progress.stats.numberOnes = (s.progress.stats.numberOnes ?? 0) + 1;
    pushNews(s, { category: 'studio', headline: `${best.name} is #1 this week`, body: `${Math.round(bestWeekly).toLocaleString('en-US')} copies in seven days — more than anything else on the shelves.`, tone: 'good' });
  }
}

export function updateSalesWeekly(c: Ctx): void {
  const { s } = c;
  const L = c.s;
  let weekIncome = 0;
  const onlineActive = Object.values(s.releases).filter((r) => r.active && r.serverLoad > 0).length;
  const servers = Math.max(0, countServers(L));
  const outage = onlineActive > 0 && servers < onlineActive ? clamp(servers / onlineActive, 0.4, 1) : 1;
  // Digital-era sales are less seasonal than boxed retail.
  const rawSeason = BALANCE.SEASONALITY[fromDay(s.day).month - 1] ?? 1;
  for (const rel of Object.values(s.releases)) {
    if (!rel.active || rel.delisted) continue;
    const comp = competition(s, rel);
    let units = 0;
    let net = 0;
    let gross = 0;
    const selfPub = !rel.concept.deal;
    for (const ps of rel.platforms) {
      const pl = platformInfo(s, ps.platform);
      if (!pl) continue;
      const season = 1 + (rawSeason - 1) * (1 - 0.5 * digitalShare(s, pl));
      const decay = rel.concept.monetization === 'premium' ? rel.decay : Math.min(0.985, 1 - (1 - rel.decay) / BALANCE.MONETIZATION[rel.concept.monetization].tailMul);
      const share = (1 - decay) * Math.pow(decay, Math.max(0, rel.week - (ps.startWeek ?? 0)));
      // platform decline after discontinuation scales sales down
      const life = pl.endDay !== null && s.day > pl.endDay ? Math.exp(-(s.day - pl.endDay) / 250) : 1;
      let u = (ps.potential * share * life * demandMul(s, pl) * season * (rel.serverLoad > 0 ? outage : 1) * catalogSalesMul(s, rel.day) * leagueSalesMul(s, rel.id)) / comp;
      const cheatMul = s.cheats?.salesMul ?? 1;
      u = Math.floor(u * cheatMul + c.rng.next()); // stochastic rounding keeps integers without bias
      u = Math.min(u, Math.max(0, Math.floor(ps.potential * 1.5 * Math.max(1, cheatMul) + (ps.extraPotential ?? 0)) - ps.units)); // can't exceed the addressable market
      const price = rel.price;
      if (u > 0) {
        gross += u * price;
        net += u * netPerUnit(s, pl, price, selfPub);
      }
      // A second wave (expansion launch or a storefront sale), possibly at a discount.
      const rv = ps.revival;
      if (rv && rv.units < rv.potential) {
        const w = Math.max(0, rel.week - rv.week);
        const rate = rv.priceMul !== undefined ? SALE_RATE : REVIVAL_RATE;
        // the second wave also respects the addressable-market cap (with what the main wave sold this week)
        const room = Math.max(0, Math.floor(ps.potential * 1.5 * Math.max(1, cheatMul) + (ps.extraPotential ?? 0)) - ps.units - u);
        const extra = Math.min(room, Math.floor(rv.potential - rv.units), Math.floor(rv.potential * rate * Math.pow(1 - rate, w) * life * (rv.priceMul !== undefined ? 1 : season) + c.rng.next()));
        if (extra > 0) {
          rv.units += extra;
          u += extra;
          const p2 = price * (rv.priceMul ?? 1);
          gross += extra * p2;
          net += extra * netPerUnit(s, pl, p2, selfPub);
        }
      }
      if (u <= 0) continue;
      ps.units += u;
      units += u;
    }
    rel.week += 1;
    if (rel.week <= 104) rel.weekly.push(units);
    else {
      if ((rel.week - 105) % 4 === 0) rel.monthly.push(0);
      rel.monthly[rel.monthly.length - 1] = (rel.monthly[rel.monthly.length - 1] ?? 0) + units;
    }
    rel.units += units;
    rel.gross += gross;
    // royalties & splits
    let toPlayer = net;
    if (rel.concept.deal) toPlayer = net * rel.concept.deal.royalty;
    if (rel.coDev && !codevShareVoid(s, rel.coDev.rivalId)) toPlayer *= 1 - rel.coDev.share;
    const eng = s.engines[rel.concept.engineId];
    if (eng && eng.royalty > 0) {
      const roy = toPlayer * eng.royalty;
      spend(s, 'royalties', roy);
    }
    rel.net += toPlayer;
    if (toPlayer > 0) {
      earn(s, 'sales', toPlayer);
      weekIncome += toPlayer;
      c.out.push({ type: 'income', amount: toPlayer, source: 'sales', releaseId: rel.id });
    }
    // franchise fans accrue from satisfied buyers
    if (rel.concept.franchiseId && units > 0) {
      const f = s.franchises[rel.concept.franchiseId];
      const liked = clamp((rel.userScore - 55) / 40, 0, 1);
      const fresh = rel.concept.expansionOf ? 0.25 : 1; // expansion buyers are mostly existing fans
      if (f) f.fans += units * fresh * BALANCE.FAN_CONVERSION * liked * (s.research.done.includes('biz_community') ? 1.25 : 1) * (hasValue(s, 'players') ? CULTURE_FX.playersFans : 1);
      s.company.fans += units * fresh * 0.04 * liked;
    }
    s.progress.stats.totalUnits += units;
    rel.lastWeekUnits = units;
    s.progress.stats.totalRevenue += toPlayer;
    const tiny = units < 1 && rel.week > 6;
    if (tiny && rel.liveIncome < 50) {
      rel.active = false;
    }
  }
  void weekIncome;
  chartTopper(s);
}

function countServers(s: GameState): number {
  return s.office.items.filter((i) => i.item === 'server_rack').length;
}

/** Competition divisor from rival and own releases in the release window. */
export function competition(s: GameState, rel: Release): number {
  const w = BALANCE.COMPETITION_WINDOW_DAYS;
  const now = s.day;
  // Only meaningful during the launch window (first ~10 weeks)
  if (rel.week > 10 && rel.platforms.every((p) => rel.week - (p.startWeek ?? 0) > 10)) return 1;
  // a re-released classic competes with what's out now, not with its original launch window
  const launch = rel.rereleaseDay ?? rel.day;
  let comp = 1;
  for (const g of s.rivalGames) {
    if (Math.abs(g.day - launch) > w || g.genre !== rel.concept.genre) continue;
    if (!g.platforms.some((p) => rel.concept.platforms.includes(p))) continue;
    comp += BALANCE.COMPETITION_WEIGHT * BALANCE.DIFFICULTY[s.settings.difficulty].competition * Math.pow(g.score / 100, 2) * (g.franchise ? 1.6 : 1);
  }
  for (const o of Object.values(s.releases)) {
    if (o.id === rel.id || Math.abs(o.day - launch) > w || o.concept.genre !== rel.concept.genre) continue;
    comp += 0.3 * Math.pow(o.score / 100, 2);
  }
  void now;
  return comp;
}

/** Monthly live-service / subscription income and franchise merchandise. */
export function updateLiveMonthly(c: Ctx): void {
  const { s } = c;
  for (const rel of Object.values(s.releases)) {
    const m = rel.concept.monetization;
    if (rel.delisted) continue;
    if (m === 'subscription' || m === 'f2p' || m === 'live_service' || m === 'premium_dlc') {
      const age = (s.day - rel.day) / 30.44;
      if (age < 1) continue;
      const tail = BALANCE.MONETIZATION[m].tailMul;
      const base = (rel.net / Math.max(1, age)) * 0.12 * (tail - 0.9) * (s.research.done.includes('online_liveops') ? 1.3 : 1);
      rel.liveIncome = Math.max(0, base * Math.pow(0.96, age) * clamp(rel.userScore / 75, 0.3, 1.3) * (rel.liveMul ?? 1));
      if (rel.liveEvent) {
        if (s.day <= rel.liveEvent.until) rel.liveIncome *= rel.liveEvent.mul;
        else rel.liveEvent = undefined;
      }
      if (rel.liveIncome > 50) {
        earn(s, 'live', rel.liveIncome);
        rel.net += rel.liveIncome;
        s.progress.stats.totalRevenue += rel.liveIncome;
        rel.active = true;
      } else rel.liveIncome = 0;
    }
  }
  if (s.research.done.includes('biz_merch')) {
    let merch = 0;
    for (const f of Object.values(s.franchises)) if (f.fans > 50_000) merch += f.fans * 0.02 * inflation(s.day) * (f.bestScore / 100);
    if (merch > 0) earn(s, 'merch', merch);
  }
  // Server upkeep for online games
  const online = Object.values(s.releases).filter((r) => r.active && r.serverLoad > 0).length;
  if (online > 0) spend(s, 'servers', online * 800 * inflation(s.day));
}

/** Yearly awards ceremony (December). */
export function yearlyAwards(c: Ctx, yr = fromDay(c.s.day).year): void {
  const { s } = c;
  type Entry = { name: string; company: string; score: number; genre: string; mine: boolean; classic?: boolean; releaseId?: string; user?: number; boost?: number };
  const entries: Entry[] = [
    ...Object.values(s.releases)
      .filter((r) => fromDay(r.day).year === yr && !r.concept.remasterOf && !r.concept.expansionOf)
      .map((r) => ({ name: r.name, company: s.company.name, score: Math.round(r.score), genre: r.concept.genre, mine: true, releaseId: r.id, user: Math.round(r.userScore), boost: campaignBoost(s, r.id, yr) })),
    ...s.rivalGames
      .filter((g) => fromDay(g.day).year === yr && !g.publishedByPlayer)
      .map((g) => ({ name: g.name, company: s.rivals[g.company]?.name ?? COMPANY_BY_ID[g.company]?.name ?? g.company, score: g.score, genre: g.genre, mine: false, classic: !!g.franchise })),
  ];
  if (!entries.length) return;
  // The player is judged on raw score (same rules as ever: 85+ and at least as good as every rival for GOTY,
  // 80+ and strictly ahead for a genre). Among rivals, real-history classics carry their legend with the jury
  // (+3) over generic titles (-3) — but a rival never wins a category over a better-scoring player game.
  const weight = (e: Entry) => e.score + (e.classic ? 3 : -3);
  const byWeight = (a: Entry, b: Entry) => weight(b) - weight(a) || b.score - a.score;
  const winners: AwardWinner[] = [];
  const pick = (category: string, pool: Entry[], minScore: number, mineMin: number, strict: boolean) => {
    // an awards campaign gives its game a little extra weight with the jury
    const judged = (e: Entry) => e.score + (e.boost ?? 0);
    const mine = pool.filter((e) => e.mine).sort((a, b) => judged(b) - judged(a))[0];
    const rivalsIn = pool.filter((e) => !e.mine);
    const bestRivalRaw = rivalsIn.reduce((m, e) => Math.max(m, e.score), 0);
    if (mine && judged(mine) >= mineMin && (strict ? judged(mine) > bestRivalRaw : judged(mine) >= bestRivalRaw)) {
      winners.push({ category, name: mine.name, company: mine.company, score: mine.score, mine: true, releaseId: mine.releaseId });
      return;
    }
    const floor = Math.max(minScore, mine?.score ?? 0);
    const r = rivalsIn.filter((e) => e.score >= floor).sort(byWeight)[0];
    if (r) winners.push({ category, name: r.name, company: r.company, score: r.score, mine: false });
  };
  pick('Game of the Year', entries, 75, 85, false);
  // Players' Choice: what players loved most (user scores; rival games are judged by their reputation)
  {
    const mine = entries.filter((e) => e.mine).sort((a, b) => (b.user ?? 0) - (a.user ?? 0))[0];
    const rivalBest = entries.filter((e) => !e.mine).sort(byWeight)[0];
    const rivalVote = rivalBest ? weight(rivalBest) : 0;
    if (mine && (mine.user ?? 0) >= 85 && (mine.user ?? 0) >= rivalVote) winners.push({ category: "Players' Choice", name: mine.name, company: mine.company, score: mine.user ?? mine.score, mine: true, releaseId: mine.releaseId });
    else if (rivalBest && rivalBest.score >= 75) winners.push({ category: "Players' Choice", name: rivalBest.name, company: rivalBest.company, score: rivalBest.score, mine: false });
  }
  for (const g of GENRES) pick(`Best ${g.name}`, entries.filter((e) => e.genre === g.id), 70, 80, true);
  const gotyW = winners.find((w) => w.category === 'Game of the Year');
  s.awardHistory = [...(s.awardHistory ?? []), { year: yr, winners }].slice(-60);
  const awards: string[] = [];
  for (const w of winners) {
    if (!w.mine || !w.releaseId) continue;
    const rel = s.releases[w.releaseId];
    if (!rel) continue;
    rel.awards.push(w.category);
    awards.push(w.category);
    c.out.push({ type: 'award', releaseId: rel.id, award: w.category });
  }
  if (awards.includes('Game of the Year')) addRep(s, 4, 'Game of the Year');
  if (awards.length) {
    s.progress.stats.awardsWon += awards.length;
    addRep(s, awards.length, 'Award wins');
    s.company.moraleMods.push({ v: 6, until: s.day + 120, label: 'Award win' });
    pushNews(s, { category: 'studio', headline: `${s.company.name} wins ${awards.length} award${awards.length > 1 ? 's' : ''} at the Golden Pixel Gala`, body: awards.join(', '), tone: 'good' });
  } else if (gotyW) {
    pushNews(s, { category: 'industry', headline: `${gotyW.name} wins Game of the Year at the Golden Pixel Gala`, body: `${gotyW.company} takes the top prize for ${yr}.`, tone: 'neutral' });
  }
}

/** Human summary of a release's performance (for UI). */
export function releaseSummary(r: Release): string {
  return `${fmtUnits(r.units)} sold · ${fmtMoney(r.net)} earned`;
}


// ── Post-launch support ─────────────────────────────────────────────────────

const PORT_COST: Record<Size, number> = { small: 6_000, medium: 25_000, large: 90_000, aaa: 300_000 };

export function patchCost(s: GameState, rel: Release): number {
  return Math.round((2_000 + rel.bugs * 250) * inflation(s.day) * (rel.concept.size === 'aaa' ? 4 : rel.concept.size === 'large' ? 2 : 1));
}

/** Remasters: classics (70+) at least 8 years old, once each. */
export const REMASTER_MIN_AGE_YEARS = 8;
export const REMASTER_MIN_SCORE = 70;
export function canRemaster(s: GameState, rel: Release): string | null {
  if (rel.concept.remasterOf) return 'Already a remaster';
  if (rel.concept.expansionOf) return 'Remaster the base game instead';
  if (rel.concept.franchiseId && !s.franchises[rel.concept.franchiseId]) return 'You sold this IP';
  if (rel.score < REMASTER_MIN_SCORE) return `Only games scoring ${REMASTER_MIN_SCORE}+ are worth remastering`;
  const age = (s.day - rel.day) / 365.25;
  if (age < REMASTER_MIN_AGE_YEARS) return `Too recent — remasters work for games at least ${REMASTER_MIN_AGE_YEARS} years old (${Math.ceil(REMASTER_MIN_AGE_YEARS - age)} to go)`;
  const taken = Object.values(s.projects).some((p) => p.kind === 'game' && p.concept.remasterOf === rel.id) || Object.values(s.releases).some((r) => r.concept.remasterOf === rel.id);
  if (taken) return 'Already remastered';
  return null;
}

/** Expansion packs: up to two for a well-reviewed paid game while players are still around. */
export const EXPANSION_MAX = 2;
export const EXPANSION_MIN_SCORE = 65;
export const EXPANSION_MAX_AGE_YEARS = 5;
export const EXPANSION_FIRST_YEAR = 1987;
const REVIVAL_RATE = 0.14;
/** Storefront sales are front-loaded: most of the extra copies sell in the first two weeks. */
const SALE_RATE = 0.45;
const NO_EXPANSION = new Set<string>(['f2p', 'live_service', 'shareware']);
const SIZE_RANK: Record<Size, number> = { small: 0, medium: 1, large: 2, aaa: 3 };

export function expansionsOf(s: GameState, rel: Release): { released: Release[]; inDev: number } {
  const released = Object.values(s.releases).filter((r) => r.concept.expansionOf === rel.id);
  const inDev = Object.values(s.projects).filter((p) => p.kind === 'game' && p.concept.expansionOf === rel.id).length;
  return { released, inDev };
}

export function canExpand(s: GameState, rel: Release): string | null {
  if (rel.concept.expansionOf) return 'Expand the base game instead';
  if (rel.concept.remasterOf) return 'Remasters don’t get expansions';
  if (fromDay(s.day).year < EXPANSION_FIRST_YEAR) return `Expansion packs catch on around ${EXPANSION_FIRST_YEAR}`;
  if (NO_EXPANSION.has(rel.concept.monetization)) return 'Free-to-play, live and shareware games get updates, not expansions';
  if (rel.concept.franchiseId && !s.franchises[rel.concept.franchiseId]) return 'You sold this IP';
  if (rel.score < EXPANSION_MIN_SCORE) return `Only games scoring ${EXPANSION_MIN_SCORE}+ have players asking for more`;
  const age = (s.day - rel.day) / 365.25;
  if (age > EXPANSION_MAX_AGE_YEARS) return `Too old — players have moved on (expansions work within ${EXPANSION_MAX_AGE_YEARS} years)`;
  const { released, inDev } = expansionsOf(s, rel);
  if (inDev > 0) return 'An expansion is already in development';
  if (released.length >= EXPANSION_MAX) return `Already has ${EXPANSION_MAX} expansions`;
  if (!expansionPlatforms(s, rel).length) return 'None of its platforms can take an expansion (cartridge or no longer sold)';
  return null;
}

/** Platforms an expansion can ship on: the base game's platforms still on sale (cartridges can't take add-ons). */
export function expansionPlatforms(s: GameState, rel: Release): string[] {
  return rel.concept.platforms.filter((pid) => {
    const pl = platformInfo(s, pid);
    return !!pl && pl.media !== 'cartridge' && isPlatformAvailable(s, pl);
  });
}

/** An expansion can be at most as big as its base game. */
export function expansionSizeOk(base: Release, size: Size): boolean {
  return SIZE_RANK[size] <= SIZE_RANK[base.concept.size];
}

/** The base game gets a second wave: lapsed and new players return for the expansion. */
function reviveBase(base: Release, exp: Release, score: number): void {
  const q = clamp((score - 50) / 40, 0, 1);
  const expUnits = exp.platforms.reduce((t, p) => t + p.potential, 0);
  const baseUnits = Math.max(1, base.platforms.reduce((t, p) => t + p.units, 0));
  const total = expUnits * 0.35 * q;
  for (const ps of base.platforms) {
    if (!exp.concept.platforms.includes(ps.platform)) continue;
    const add = total * (ps.units / baseUnits);
    if (add < 1) continue;
    const prev = ps.revival;
    ps.revival = { week: base.week, potential: (prev ? prev.potential - prev.units : 0) + add, units: 0 };
    ps.extraPotential = (ps.extraPotential ?? 0) + add;
  }
  base.active = true;
  base.userScore = clamp(base.userScore + Math.round(q * 3), 1, 100);
}

/** Storefront discounts: the digital era's way to wake up a back-catalogue game. */
export const SALE_DISCOUNTS = [0.25, 0.5, 0.75] as const;
export type SaleDiscount = (typeof SALE_DISCOUNTS)[number];
/** Share of the game's lifetime potential that a sale at each discount brings in (first sale; later sales shrink). */
const SALE_LIFT: Record<SaleDiscount, number> = { 0.25: 0.06, 0.5: 0.13, 0.75: 0.22 };
export const SALE_COOLDOWN_DAYS = 180;
export const SALE_MIN_AGE_DAYS = 120;
const SALE_MONET = new Set<string>(['premium', 'premium_dlc']);
/** Share of sale buyers who would otherwise have bought at full price later. */
const SALE_CANNIBALIZE = 0.3;

/** Platforms where the game is sold digitally enough for a storefront sale to matter. */
function saleShare(s: GameState, ps: PlatformSales): number {
  const pl = platformInfo(s, ps.platform);
  if (!pl) return 0;
  const life = pl.endDay !== null && s.day > pl.endDay ? Math.exp(-(s.day - pl.endDay) / 250) : 1;
  return digitalShare(s, pl) * life;
}

export function canRunSale(s: GameState, rel: Release): string | null {
  if (rel.delisted) return 'Delisted — its licences expired';
  if (!SALE_MONET.has(rel.concept.monetization)) return 'Only one-off purchases go on sale';
  if (s.day - rel.day < SALE_MIN_AGE_DAYS) return `Too new — wait ${Math.ceil((SALE_MIN_AGE_DAYS - (s.day - rel.day)) / 7)} more weeks`;
  if (rel.lastSaleDay !== undefined && s.day - rel.lastSaleDay < SALE_COOLDOWN_DAYS) return `On sale recently — again in ${Math.ceil((SALE_COOLDOWN_DAYS - (s.day - rel.lastSaleDay)) / 7)} weeks`;
  if (!rel.platforms.some((ps) => saleShare(s, ps) >= 0.2)) {
    const dead = rel.platforms.every((ps) => {
      const pl = platformInfo(s, ps.platform);
      return !pl || (pl.endDay !== null && s.day > pl.endDay);
    });
    return dead ? 'Its platforms are no longer sold — nobody is shopping there' : 'Needs digital storefronts (most sales here are still boxed)';
  }
  return null;
}

/** Expected extra copies from a sale (shown in the UI; the sale itself is stochastic week to week). */
export function saleForecast(s: GameState, rel: Release, discount: SaleDiscount): number {
  const appeal = clamp((rel.score * 0.6 + rel.userScore * 0.4 - 30) / 50, 0.1, 1.2);
  const fade = Math.pow(0.7, rel.saleCount ?? 0);
  return rel.platforms.reduce((t, ps) => t + ps.potential * SALE_LIFT[discount] * appeal * fade * saleShare(s, ps), 0);
}

export function applySale(s: GameState, rel: Release, discount: SaleDiscount): number {
  const appeal = clamp((rel.score * 0.6 + rel.userScore * 0.4 - 30) / 50, 0.1, 1.2);
  const fade = Math.pow(0.7, rel.saleCount ?? 0);
  let total = 0;
  for (const ps of rel.platforms) {
    const add = ps.potential * SALE_LIFT[discount] * appeal * fade * saleShare(s, ps);
    if (add < 1) continue;
    // A sale replaces any unfinished wave (its leftover is folded in at the new price).
    const left = ps.revival ? Math.max(0, ps.revival.potential - ps.revival.units) * 0.5 : 0;
    ps.revival = { week: rel.week, potential: add + left, units: 0, priceMul: 1 - discount };
    // Some of those buyers would have paid full price later.
    const cut = Math.min(ps.potential, add * SALE_CANNIBALIZE);
    ps.potential -= cut; // only ever lowers it
    // the cap (1.5× potential + extra) keeps room for the sale itself
    ps.extraPotential = (ps.extraPotential ?? 0) + add + cut * 1.5;
    total += add;
  }
  rel.saleCount = (rel.saleCount ?? 0) + 1;
  rel.lastSaleDay = s.day;
  rel.active = true;
  return total;
}

export function canPatch(s: GameState, rel: Release): string | null {
  if (s.day - rel.day > 365 * 3) return 'Too old to patch';
  if ((rel.patches ?? 0) >= 3) return 'Already patched three times';
  if (rel.bugs < 2) return 'Nothing left worth patching';
  return null;
}

/** Ship a patch: fewer bugs, happier players, a small sales bump. */
export function applyPatch(s: GameState, rel: Release): number {
  const before = rel.userScore;
  const gain = Math.min(10, Math.round(rel.bugs * 0.5 + 1));
  rel.userScore = clamp(rel.userScore + gain, 1, 100);
  rel.bugs = Math.round(rel.bugs * 0.3);
  rel.patches = (rel.patches ?? 0) + 1;
  rel.active = true;
  for (const p of rel.platforms) p.potential *= 1 + gain / 100;
  addRep(s, 0.5, 'Shipped a patch');
  return rel.userScore - before;
}

/** Why a classic can't get a digital re-release (or null). 2006+, 12+ years old, 70+ score, once. */
export function rereleaseBlocked(s: GameState, rel: Release): string | null {
  if (rel.delisted) return 'Delisted — its licences expired';
  if (fromDay(s.day).year < 2006) return 'Digital storefronts for classics arrive around 2006';
  if (s.day - rel.day < 365 * 12) return 'Only games 12+ years old count as classics';
  if (rel.score < 70) return 'Only well-loved games (70+) are worth re-releasing';
  if (rel.rereleased) return 'Already re-released';
  if (rel.concept.expansionOf) return 'Expansions come with their base game';
  if (rel.concept.monetization !== 'premium' && rel.concept.monetization !== 'shareware') return 'Only boxed and shareware classics can be re-released';
  if (!s.research.done.includes('biz_self_publishing')) return 'Research Self-Publishing first';
  return null;
}

export function rereleaseCost(s: GameState, rel: Release): number {
  return Math.round(portCost(s, rel) * 0.35);
}

export const MAX_BUNDLE = 4;

/** Extra appeal of a classics collection: each bundled game adds buyers, more if it was loved. */
export function bundleMul(bundled: Release[]): number {
  return 1 + bundled.reduce((t, b) => t + 0.35 * Math.min(1.2, b.score / 80), 0);
}

export function bundleCost(s: GameState, bundled: Release[]): number {
  return Math.round(bundled.reduce((t, b) => t + rereleaseCost(s, b) * 0.4, 0));
}

/** Emulated re-release on a modern platform: a nostalgic niche (40% of a normal port) — optionally as a collection. */
export function applyRerelease(s: GameState, rel: Release, platform: string, bundled: Release[] = []): void {
  applyPort(s, rel, platform);
  const ps = rel.platforms[rel.platforms.length - 1];
  if (ps) ps.potential *= 0.4 * bundleMul(bundled);
  rel.rereleaseDay = s.day;
  rel.rereleased = true;
  if (bundled.length) {
    rel.collection = bundled.map((b) => b.name);
    for (const b of bundled) {
      b.rereleased = true;
      b.rereleaseDay = s.day;
    }
  }
}

export function portCost(s: GameState, rel: Release): number {
  return Math.round(PORT_COST[rel.concept.size] * inflation(s.day));
}

/** Outsourced port: the game launches on a new platform with a fresh (smaller) sales curve. */
export function applyPort(s: GameState, rel: Release, platform: string): number {
  const eff = rel.score * 0.7 + rel.userScore * 0.3;
  const pot = salesPotential(s, { ...rel.concept, platforms: [platform], franchiseId: undefined }, eff - 3, 0.2, { renown: false });
  // A port joins the existing player pool, so cross-play counts all the game's platforms.
  const cross = crossplayEligible(s, rel.concept, rel.concept.platforms.length + 1) ? BALANCE.CROSSPLAY_SALES : 1;
  const potential = (pot.platforms[0]?.potential ?? 0) * 0.65 * cross;
  rel.platforms.push({ platform, potential, units: 0, startWeek: rel.week });
  rel.concept = { ...rel.concept, platforms: [...rel.concept.platforms, platform] };
  rel.active = true;
  return potential;
}
