/**
 * Releasing games: critic reviews + blurbs, user score, sales potential, weekly sales, franchises,
 * reputation, live-service income and yearly awards.
 */
import { exclusiveBuzz } from './hardware';
import { BALANCE } from '../../data/balance';
import { GENRE_BY_ID } from '../../data/genres';
import { OUTLETS, type OutletDef } from '../../data/outlets';
import { TOPIC_BY_ID } from '../../data/topics';
import { BD, clamp, type Breakdown } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { Rng } from '../rng';
import type { CriticReview, GameProject, GameState, Release, Size } from '../types';
import { addRep, earn, fmtMoney, fmtUnits, hasFlag, inflation, newId, pushNews, spend } from '../util';
import { finishProject, qualityToScore } from './dev';
import { demandMul, genreInterest, platformAudienceFit, platformGenreFit, platformInfo, topicPopularity, type PlatformInfo } from './market';

const SIZE_REP: Record<Size, number> = { small: 0.6, medium: 1, large: 1.4, aaa: 1.8 };
/** Price multiplier by size: retail-era games all cost about the same; digital lets small games sell cheap. */
const SIZE_PRICE_RETAIL: Record<Size, number> = { small: 0.8, medium: 0.92, large: 1, aaa: 1 };
const SIZE_PRICE_DIGITAL: Record<Size, number> = { small: 0.25, medium: 0.45, large: 0.8, aaa: 1 };

export function reputationReach(rep: number): number {
  return BALANCE.REPUTATION_REACH_MIN + (BALANCE.REPUTATION_REACH_MAX - BALANCE.REPUTATION_REACH_MIN) * (rep / 100);
}

// ── Blurbs ───────────────────────────────────────────────────────────────────

const PRAISE: Record<string, string[]> = {
  effort: ['Brimming with content and craft.', 'You can feel the hours poured into every corner.', 'An astonishing amount of game for the price.', 'Generous, confident and packed with ideas.'],
  focus: ['Every system pulls in the same direction.', 'It knows exactly what kind of game it wants to be.', 'The core loop is tight and endlessly replayable.', 'Smart priorities: the team put effort exactly where it counts.'],
  combo: ['A premise and genre made for each other.', 'The setting and mechanics click instantly.', 'The theme gives every mechanic a reason to exist.'],
  tech: ['A technical showcase that pushes the hardware.', 'Looks and runs like a generation ahead.', 'Silky smooth on the hardware it targets.'],
  bugs: ['Rock solid. Not a crash in sight.', 'Polished to a mirror shine.', 'Remarkably stable for a launch build.'],
  trend: ['Lands right in the middle of what players crave.', 'Perfectly in tune with the moment.', 'Exactly the game everyone is talking about this season.'],
  fresh: ['Something genuinely new.', 'A breath of fresh air.', 'Bold, original and a little bit strange — in a good way.'],
  balance: ['Design and technology in perfect balance.', 'Feels as good as it looks.'],
  repeat: ['Comfort food done right.'],
};
const CRITIQUE: Record<string, string[]> = {
  effort: ['Feels thin and rushed.', 'There just isn’t much here.', 'Over before it gets going.'],
  focus: ['Pulls in too many directions at once.', 'The priorities feel muddled.', 'Strong parts, wrong emphasis.'],
  combo: ['The theme and the mechanics never gel.', 'An odd pairing that never quite works.'],
  tech: ['Looks dated next to its peers.', 'The engine is showing its age.'],
  bugs: ['Riddled with bugs and crashes.', 'Needed another month of QA.', 'Glitches undermine every good idea.'],
  trend: ['Arrives after the party ended.', 'Players have moved on from this.'],
  repeat: ['We have played this before. Several times.', 'Familiar to a fault.'],
  balance: ['Ambition outpaces execution.', 'Lopsided — great ideas, shaky foundations.', 'Lovely on paper, wobbly in the hands.'],
};

function partKey(label: string): string {
  if (label.startsWith('Development')) return 'effort';
  if (label.startsWith('Focus')) return 'focus';
  if (label.includes('×') || label.startsWith('Audience')) return 'combo';
  if (label.startsWith('Engine') || label.startsWith('Platform')) return 'tech';
  if (label.startsWith('Bugs')) return 'bugs';
  if (label.includes('trend')) return 'trend';
  if (label.startsWith('Fresh')) return 'fresh';
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
    const k = best && best.value > 1.0 ? partKey(best.label) : effortGood ? 'effort' : 'focus';
    line = rng.pick(PRAISE[k] ?? PRAISE.effort!);
  } else if (score >= 55) {
    const good = rng.pick(PRAISE[best && best.value > 1 ? partKey(best.label) : 'focus'] ?? PRAISE.focus!);
    const bad = rng.pick(CRITIQUE[worst ? partKey(worst.label) : 'effort'] ?? CRITIQUE.effort!);
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

export function salesPotential(s: GameState, concept: GameProject['concept'], effScore: number, rawHype: number) {
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
  const crossplay = s.research.done.includes('online_crossplay') && concept.platforms.length >= 2 && (CROSSPLAY_GENRES.has(concept.genre) || concept.monetization === 'live_service' || concept.monetization === 'f2p');
  if (crossplay) sb.mul('Cross-play', BALANCE.CROSSPLAY_SALES);
  sb.mul(`Review appeal (${Math.round(effScore)})`, attach * 10);
  sb.mul('Hype', 1 + hype * 0.45);
  sb.mul('Monetization', monet.units);
  if (fr) sb.mul('Franchise fatigue', fr ? 1 - fr.fatigue * 0.45 : 1);
  let totalUsers = 0;
  const g = GENRE_BY_ID[concept.genre];
  const platforms = concept.platforms
    .map((pid) => ({ pid, pl: platformInfo(s, pid) }))
    .filter((x): x is { pid: string; pl: PlatformInfo } => !!x.pl)
    .map(({ pid, pl }) => {
      const users = (s.market.users[pid] ?? 0) * 1e6;
      totalUsers += users;
      const interest =
        users *
        genreInterest(s, concept.genre) *
        Math.sqrt(platformGenreFit(pl, concept.genre)) *
        Math.sqrt(platformAudienceFit(pl, concept.audience) * (g.audience[concept.audience] ?? 1) * (TOPIC_BY_ID[concept.topic]?.audience[concept.audience] ?? 1)) *
        Math.sqrt(topicPopularity(s, concept.topic));
      const potential = interest * attach * reach * (1 + hype * 0.45) * monet.units * fatigueMul * (crossplay ? BALANCE.CROSSPLAY_SALES : 1);
      return { platform: pid, potential: Math.max(0, potential), units: 0, pl };
    });
  if (fr && fr.fans > 0) {
    const fanBuy = fr.fans * clamp((effScore - 40) / 50, 0.05, 1) * fatigueMul;
    for (const ps of platforms) ps.potential += fanBuy * (((s.market.users[ps.platform] ?? 0) * 1e6) / Math.max(1, totalUsers));
    sb.add('Franchise fans (units)', Math.round(fanBuy));
  }
  return { platforms, hype, salesWhy: sb.done(), attach };
}

export function releaseGame(c: Ctx, p: GameProject): void {
  const { s, rng } = c;
  const quality = p.qualityPreview!;
  const total = p.design + p.tech;
  const density = total > 0 ? p.bugs / total : 0;
  const base = qualityToScore(quality.total);
  const { reviews, aggregate } = generateReviews(rng, s, quality, base, density, p.concept.genre, p.concept.name);
  const score = clamp(Math.round(aggregate), 1, 100);
  const fr = p.concept.franchiseId ? s.franchises[p.concept.franchiseId] : undefined;
  // User score
  const ub = new BD('Critics', score);
  ub.add('Monetization', BALANCE.MONETIZATION[p.concept.monetization].userScore);
  ub.add('Bugs', -Math.min(20, density * 45));
  if (p.hype > 1 && score < 72) ub.add('Didn’t live up to the hype', -Math.min(15, (p.hype * (72 - score)) / 5));
  if (fr && score >= 75) ub.add('Fan favourite', 3);
  if (fr) ub.add('Franchise fatigue', -fr.fatigue * 12);
  if (s.research.done.includes('ai_genai') && fromDay(s.day).year >= 2023) ub.add('Gen-AI backlash', -1.5);
  ub.add('Players vary', rng.normal(0, 3));
  ub.clamp(1, 100);
  const userScore = Math.round(ub.value);

  // Sales potential
  const effScore = score * 0.7 + userScore * 0.3;
  const pot = salesPotential(s, p.concept, effScore, p.hype);
  const { hype, salesWhy } = pot;
  const plats = pot.platforms;
  const pricePl = plats[0]!.pl;
  const price = gamePrice(s, pricePl, p.concept.size, p.concept.monetization);
  const decay = score >= 88 ? BALANCE.LIFECYCLE_DECAY_EVERGREEN : digitalShare(s, pricePl) > 0.5 ? BALANCE.LIFECYCLE_DECAY_DIGITAL : BALANCE.LIFECYCLE_DECAY_RETAIL;
  const id = newId(s, 'r');
  const rel: Release = {
    id,
    name: p.concept.name,
    concept: p.concept,
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
  };
  s.releases[id] = rel;
  s.releaseOrder.push(id);
  exclusiveBuzz(s, rel);
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
  }
  // Franchise bookkeeping
  let frId = p.concept.franchiseId;
  if (!frId) {
    frId = newId(s, 'f');
    s.franchises[frId] = { id: frId, name: p.concept.name.replace(/\s+\d+$|:.*$/, ''), genre: p.concept.genre, topic: p.concept.topic, fans: 0, entries: [], fatigue: 0, lastDay: s.day, bestScore: 0 };
    rel.concept = { ...rel.concept, franchiseId: frId };
  }
  const f = s.franchises[frId]!;
  if (f.entries.length > 0 && s.day - f.lastDay < 365 * 2) f.fatigue = clamp(f.fatigue + BALANCE.FATIGUE_PER_SEQUEL, 0, 0.9);
  f.entries.push(id);
  f.lastDay = s.day;
  f.bestScore = Math.max(f.bestScore, score);
  // Reputation
  const rd = ((score - 60) / 7) * SIZE_REP[p.concept.size];
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
  if (deal && score < deal.minScore) {
    addRep(s, -(2), 'Publisher disappointed');
    pushNews(s, { category: 'studio', headline: `Publisher disappointed with ${rel.name}`, body: `The contract wanted ${deal.minScore}+.`, tone: 'bad' });
  }
  pushNews(s, {
    category: 'studio',
    headline: `${rel.name} launches to ${score >= 85 ? 'rave' : score >= 70 ? 'positive' : score >= 50 ? 'mixed' : 'poor'} reviews (${score})`,
    body: `${GENRE_BY_ID[p.concept.genre].name} · ${TOPIC_BY_ID[p.concept.topic]?.name ?? p.concept.topic}. Users rate it ${userScore}.`,
    tone: score >= 70 ? 'good' : score >= 50 ? 'neutral' : 'bad',
  });
  // Journal: teach the player what worked
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
    if (!rel.active) continue;
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
      let u = (ps.potential * share * life * demandMul(s, pl) * season * (rel.serverLoad > 0 ? outage : 1)) / comp;
      u = Math.floor(u + c.rng.next()); // stochastic rounding keeps integers without bias
      u = Math.min(u, Math.max(0, Math.floor(ps.potential * 1.5) - ps.units)); // can't exceed the addressable market
      if (u <= 0) continue;
      ps.units += u;
      units += u;
      const price = rel.price;
      gross += u * price;
      net += u * netPerUnit(s, pl, price, selfPub);
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
      if (f) f.fans += units * BALANCE.FAN_CONVERSION * liked * (s.research.done.includes('biz_community') ? 1.25 : 1);
      s.company.fans += units * 0.04 * liked;
    }
    s.progress.stats.totalUnits += units;
    s.progress.stats.totalRevenue += toPlayer;
    const tiny = units < 1 && rel.week > 6;
    if (tiny && rel.liveIncome < 50) {
      rel.active = false;
    }
  }
  void weekIncome;
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
  let comp = 1;
  for (const g of s.rivalGames) {
    if (Math.abs(g.day - rel.day) > w || g.genre !== rel.concept.genre) continue;
    if (!g.platforms.some((p) => rel.concept.platforms.includes(p))) continue;
    comp += BALANCE.COMPETITION_WEIGHT * BALANCE.DIFFICULTY[s.settings.difficulty].competition * Math.pow(g.score / 100, 2) * (g.franchise ? 1.6 : 1);
  }
  for (const o of Object.values(s.releases)) {
    if (o.id === rel.id || Math.abs(o.day - rel.day) > w || o.concept.genre !== rel.concept.genre) continue;
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
    if (m === 'subscription' || m === 'f2p' || m === 'live_service' || m === 'premium_dlc') {
      const age = (s.day - rel.day) / 30.44;
      if (age < 1) continue;
      const tail = BALANCE.MONETIZATION[m].tailMul;
      const base = (rel.net / Math.max(1, age)) * 0.12 * (tail - 0.9) * (s.research.done.includes('online_liveops') ? 1.3 : 1);
      rel.liveIncome = Math.max(0, base * Math.pow(0.96, age) * clamp(rel.userScore / 75, 0.3, 1.3));
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
  const mine = Object.values(s.releases).filter((r) => fromDay(r.day).year === yr);
  const rivals = s.rivalGames.filter((g) => fromDay(g.day).year === yr);
  const bestRival = rivals.reduce((m, g) => Math.max(m, g.score), 0);
  if (!mine.length) return;
  const best = mine.reduce((a, b) => (b.score > a.score ? b : a));
  const awards: string[] = [];
  if (best.score >= 85 && best.score >= bestRival) awards.push('Game of the Year');
  // genre awards
  for (const r of mine) {
    const sameGenre = rivals.filter((g) => g.genre === r.concept.genre);
    const topRival = sameGenre.reduce((m, g) => Math.max(m, g.score), 0);
    if (r.score >= 80 && r.score > topRival) {
      r.awards.push(`Best ${GENRE_BY_ID[r.concept.genre].name}`);
      awards.push(`Best ${GENRE_BY_ID[r.concept.genre].name}`);
      c.out.push({ type: 'award', releaseId: r.id, award: `Best ${GENRE_BY_ID[r.concept.genre].name}` });
    }
  }
  if (awards.includes('Game of the Year')) {
    best.awards.push('Game of the Year');
    c.out.push({ type: 'award', releaseId: best.id, award: 'Game of the Year' });
    addRep(s, 4, 'Game of the Year');
  }
  if (awards.length) {
    s.progress.stats.awardsWon += awards.length;
    addRep(s, awards.length, 'Award wins');
    s.company.moraleMods.push({ v: 6, until: s.day + 120, label: 'Award win' });
    pushNews(s, { category: 'studio', headline: `${s.company.name} wins ${awards.length} award${awards.length > 1 ? 's' : ''} at the Golden Pixel Gala`, body: awards.join(', '), tone: 'good' });
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
  if (rel.concept.franchiseId && !s.franchises[rel.concept.franchiseId]) return 'You sold this IP';
  if (rel.score < REMASTER_MIN_SCORE) return `Only games scoring ${REMASTER_MIN_SCORE}+ are worth remastering`;
  const age = (s.day - rel.day) / 365.25;
  if (age < REMASTER_MIN_AGE_YEARS) return `Too recent — remasters work for games at least ${REMASTER_MIN_AGE_YEARS} years old (${Math.ceil(REMASTER_MIN_AGE_YEARS - age)} to go)`;
  const taken = Object.values(s.projects).some((p) => p.kind === 'game' && p.concept.remasterOf === rel.id) || Object.values(s.releases).some((r) => r.concept.remasterOf === rel.id);
  if (taken) return 'Already remastered';
  return null;
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

export function portCost(s: GameState, rel: Release): number {
  return Math.round(PORT_COST[rel.concept.size] * inflation(s.day));
}

/** Outsourced port: the game launches on a new platform with a fresh (smaller) sales curve. */
export function applyPort(s: GameState, rel: Release, platform: string): number {
  const eff = rel.score * 0.7 + rel.userScore * 0.3;
  const pot = salesPotential(s, { ...rel.concept, platforms: [platform], franchiseId: undefined }, eff - 3, 0.2);
  const potential = (pot.platforms[0]?.potential ?? 0) * 0.65;
  rel.platforms.push({ platform, potential, units: 0, startWeek: rel.week });
  rel.concept = { ...rel.concept, platforms: [...rel.concept.platforms, platform] };
  rel.active = true;
  return potential;
}
