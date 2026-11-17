/**
 * Headless bot players. They interact ONLY through dispatch(), exactly like the UI.
 */
import { BRANCH } from '../../src/data/regions';
import { LOC_YEAR, REGIONS, regionMix } from '../../src/data/regions';
import { BALANCE } from '../../src/data/balance';
import { GENRES, GENRE_BY_ID } from '../../src/data/genres';
import { TOPICS } from '../../src/data/topics';
import { RESEARCH } from '../../src/data/research';
import { ITEMS, OFFICE_TIERS } from '../../src/data/facilities';
import { CHANNELS, TRADE_SHOWS } from '../../src/data/marketing';
import { PHASE_AREAS, type GenreId } from '../../src/data/types';
import { dispatch, featuresBlocked, type Action } from '../../src/sim/actions';
import { fromDay } from '../../src/sim/calendar';
import type { Rng } from '../../src/sim/rng';
import { availablePlatforms, genrePopularity } from '../../src/sim/systems/market';
import { canPlace, freeDesks, occupancy, tierDef } from '../../src/sim/systems/office';
import { creditLimit, ipoEligible, monthlyBurn } from '../../src/sim/systems/finance';
import { researchAvailable, researchCost } from '../../src/sim/systems/research';
import { engineTechFor, sizeDailyCost } from '../../src/sim/systems/dev';
import { estimateContractDays } from '../../src/sim/systems/offers';
import { canLaunchSub, subLaunchCost, subRefPrice } from '../../src/sim/systems/subscription';
import { showcaseBlocked, showcaseCost } from '../../src/sim/systems/showcase';
import { dealAdvance, labelBlocked, signableIndies } from '../../src/sim/systems/publishing';
import { canExpand, canRunSale, expansionPlatforms } from '../../src/sim/systems/release';
import { GAME_FEATURES } from '../../src/data/gameFeatures';
import { canFoundLeague, leagueCandidates, leagueSetupCost } from '../../src/sim/systems/esports';
import { MARKETING, canDesignConsole, consoleSpec, liveConsoles, refPrice } from '../../src/sim/systems/hardware';
import type { Focus3, GameState, Size } from '../../src/sim/types';
import { money } from '../../src/sim/util';

export type BotName = 'idle' | 'steady' | 'aggressive' | 'trend' | 'random' | 'tycoon';

export interface Bot {
  name: BotName;
  act(s: GameState, rng: Rng): void;
}

const yearOf = (s: GameState) => fromDay(s.day).year;

function idealFocus(genre: GenreId): [Focus3, Focus3, Focus3] {
  const g = GENRE_BY_ID[genre];
  return PHASE_AREAS.map((areas) => {
    const v = areas.map((a) => g.ideal[a]);
    const t = v[0]! + v[1]! + v[2]!;
    return v.map((x) => Math.round((x / t) * 100)) as Focus3;
  }) as [Focus3, Focus3, Focus3];
}

function idleStaff(s: GameState): string[] {
  return Object.values(s.staff)
    .filter((x) => x.assignment.kind === 'idle' && x.sickDays <= 0)
    .map((x) => x.id);
}

function bestCombo(s: GameState, rng: Rng, mode: 'fit' | 'trend' | 'random'): { genre: GenreId; topic: string } {
  const yr = yearOf(s);
  const genres = GENRES.filter((g) => g.year <= yr && (!g.research || s.research.done.includes(g.research)));
  const topics = TOPICS.filter((t) => t.year <= yr && (!t.research || s.research.done.includes(t.research)));
  if (mode === 'random') return { genre: rng.pick(genres).id, topic: rng.pick(topics).id };
  let best = { genre: genres[0]!.id as GenreId, topic: topics[0]!.id, score: -1 };
  const recent = s.releaseOrder.slice(-4).map((id) => s.releases[id]!.concept);
  for (const g of genres)
    for (const t of topics) {
      const fit = t.genreFit[g.id] ?? 1;
      if (fit < 2) continue;
      if (recent.some((r) => r.genre === g.id && r.topic === t.id)) continue;
      let sc = fit * 10 + rng.next() * 3;
      if (mode === 'trend') sc += genrePopularity(s, g.id) * 12;
      else sc += genrePopularity(s, g.id) * 4;
      if (sc > best.score) best = { genre: g.id, topic: t.id, score: sc };
    }
  return best;
}

function bestPlatforms(s: GameState, genre: GenreId, n: number): string[] {
  const av = availablePlatforms(s);
  const scored = av
    .map((p) => ({ id: p.id, sc: (s.market.users[p.id] ?? 0) * (GENRE_BY_ID[genre].kinds[p.kind] ?? 1) }))
    .sort((a, b) => b.sc - a.sc);
  return scored.slice(0, n).map((x) => x.id);
}

/** Projected cash cost of a project (team salaries + production costs). */
export function projectCost(s: GameState, size: Size, team: string[]): number {
  const days = BALANCE.SIZE[size].days;
  const salaries = team.reduce((t, id) => t + (s.staff[id]?.salary ?? 0), 0) * (days / 365);
  return salaries + sizeDailyCost(size, s.day) * days;
}

function chooseSize(s: GameState, team: string[], aggressive: boolean): Size {
  const order: Size[] = ['aaa', 'large', 'medium', 'small'];
  const bestScore = Math.max(0, ...s.releaseOrder.slice(-3).map((id) => s.releases[id]!.score));
  for (const sz of order) {
    if (sz === 'medium' && s.releaseOrder.length < 1) continue;
    if (sz === 'large' && (s.office.tier < 2 || bestScore < 65)) continue;
    if (sz === 'aaa' && (s.office.tier < 4 || yearOf(s) < 1995 || bestScore < 72)) continue;
    const need = BALANCE.SIZE[sz].typicalTeam * (aggressive ? 0.7 : 1.1);
    if (team.length < need) continue;
    const cost = projectCost(s, sz, team.slice(0, BALANCE.SIZE[sz].teamCap));
    if (cost > s.company.cash * (aggressive ? 1.5 : 0.8) + creditLimit(s) * (aggressive ? 0.6 : 0)) continue;
    return sz;
  }
  return 'small';
}

function placeFirstFree(s: GameState, item: (typeof ITEMS)[number]['id']): boolean {
  const t = tierDef(s.office.tier);
  const def = ITEMS.find((i) => i.id === item)!;
  for (let f = 0; f < t.floors; f++) {
    const occ = occupancy(s, f);
    for (let y = 1; y < t.h - 1; y++)
      for (let x = 0; x < t.w; x++) {
        if (!canPlace(s, def, f, x, y, 0, undefined, occ).ok) continue;
        const r = dispatch(s, { type: 'placeItem', item, floor: f, x, y, rot: 0 });
        return r.ok;
      }
  }
  return false;
}

function bestDesk(s: GameState): (typeof ITEMS)[number]['id'] {
  const yr = yearOf(s);
  const desks = ITEMS.filter((i) => i.category === 'desk' && i.year <= yr && (!i.research || s.research.done.includes(i.research)));
  return desks[desks.length - 1]!.id;
}

function startGameIfIdle(s: GameState, rng: Rng, opts: { mode: 'fit' | 'trend' | 'random'; aggressive: boolean; maxPlatforms: number }): void {
  const hasGame = Object.values(s.projects).some((p) => p.kind === 'game');
  if (hasGame) return;
  const team = idleStaff(s);
  if (!team.length) return;
  const size = chooseSize(s, team, opts.aggressive);
  // Planners sometimes follow a recent hit with an expansion pack instead of a new game.
  const hit = opts.mode !== 'random' && rng.chance(0.35) ? Object.values(s.releases).find((r) => r.score >= 75 && !canExpand(s, r)) : undefined;
  if (hit) {
    const expSize = hit.concept.size === 'small' || size === 'small' ? 'small' : 'medium';
    const r = dispatch(s, {
      type: 'startGame',
      game: { name: `${hit.name}: More`, genre: hit.concept.genre, topic: hit.concept.topic, platforms: expansionPlatforms(s, hit).slice(0, 6), audience: hit.concept.audience, size: expSize, monetization: 'premium', engineId: hit.concept.engineId in s.engines ? hit.concept.engineId : 'e0', franchiseId: hit.concept.franchiseId, expansionOf: hit.id, team: team.slice(0, BALANCE.SIZE[expSize].teamCap), focus: idealFocus(hit.concept.genre) },
    });
    if (r.ok) return;
    if (process.env.BOT_DEBUG) console.log('expansion failed', r.error);
  }
  const { genre, topic } = bestCombo(s, rng, opts.mode);
  const cap = BALANCE.SIZE[size].teamCap;
  const plats = bestPlatforms(s, genre, opts.maxPlatforms);
  if (!plats.length) return;
  const engine = Object.values(s.engines).reduce((a, b) => (b.tech > a.tech ? b : a));
  const selfPub = s.research.done.includes('biz_self_publishing');
  const thin = s.company.cash < projectCost(s, size, team.slice(0, cap)) * 1.2;
  const deal = !selfPub || (thin && s.offers.deals.length) ? s.offers.deals[0] : undefined;
  const monet = genre === 'mmo' && yearOf(s) >= 1997 ? 'subscription' : 'premium';
  // sequel to best franchise sometimes
  const fr = Object.values(s.franchises).filter((f) => f.genre === genre && f.bestScore >= 75 && s.day - f.lastDay > 700)[0];
  // planners translate for regions that add 8%+ when they have cash to spare
  const yrNow = fromDay(s.day).year;
  const localized = opts.mode !== 'random' && yrNow >= LOC_YEAR && !thin && size !== 'small' ? REGIONS.filter((r) => r.id !== (s.company.homeRegion ?? 'na') && regionMix(yrNow, genre, s.company.homeRegion ?? 'na', [r.id]).mul >= 1.08).map((r) => r.id) : [];
  const res = dispatch(s, {
    type: 'startGame',
    game: {
      name: `${opts.mode}-${s.releaseOrder.length + 1}`,
      genre,
      topic: fr?.topic ?? topic,
      platforms: plats,
      audience: GENRE_BY_ID[genre].audience.teen >= GENRE_BY_ID[genre].audience.everyone ? 'teen' : 'everyone',
      size,
      monetization: monet,
      engineId: engine.id,
      franchiseId: fr?.id,
      dealId: deal?.id,
      localized,
      team: team.slice(0, cap),
      focus: idealFocus(genre),
      features: opts.mode === 'random' ? undefined : GAME_FEATURES.filter((f) => f.fits[genre] && !featuresBlocked(s, [f.id], monet)).slice(0, 2).map((f) => f.id),
    },
  });
  if (!res.ok && process.env.BOT_DEBUG) console.log('startGame failed', fromDay(s.day).year, res.error, size, plats);
  if (!res.ok && plats.length > 1) {
    // fallback: single platform, publisher deal
    dispatch(s, {
      type: 'startGame',
      game: { name: `${opts.mode}-${s.releaseOrder.length + 1}`, genre, topic, platforms: plats.slice(0, 1), audience: 'everyone', size: 'small', monetization: 'premium', engineId: engine.id, dealId: s.offers.deals[0]?.id, team: team.slice(0, 3), focus: idealFocus(genre) },
    });
  }
}

function manageGames(s: GameState, aggressive: boolean): void {
  for (const p of Object.values(s.projects)) {
    if (p.kind !== 'game') continue;
    if (p.awaitingGate) dispatch(s, { type: 'continueGate', projectId: p.id });
    if (p.announcedDay === undefined && p.phase >= 1) dispatch(s, { type: 'announce', projectId: p.id });
    if (aggressive) dispatch(s, { type: 'setCrunch', projectId: p.id, on: p.phase >= 1 });
    else if (p.phase === 2 && !p.beta) dispatch(s, { type: 'openBeta', projectId: p.id });
    // marketing: spend up to ~8% of cash per campaign
    if (p.announcedDay !== undefined && p.campaigns.length < (aggressive ? 4 : 2)) {
      const yr = yearOf(s);
      const ch = CHANNELS.filter((c) => c.from <= yr && (c.to ?? 9999) >= yr && (!c.research || s.research.done.includes(c.research)))
        .filter((c) => money(c.cost, s.day) < s.company.cash * (aggressive ? 0.15 : 0.06))
        .sort((a, b) => b.hype - a.hype)[0];
      if (ch) dispatch(s, { type: 'marketing', projectId: p.id, channel: ch.id });
    }
    // polish if buggy
    if (p.phase === 2 && p.phaseDay === p.phaseDays[2] - 2 && p.bugs > (p.design + p.tech) * 0.06 && !aggressive) dispatch(s, { type: 'delay', projectId: p.id, weeks: 2 });
  }
}

function hireIfAffordable(s: GameState, rng: Rng, runwayMonths: number): void {
  const cap = tierDef(s.office.tier).staffCap;
  if (Object.keys(s.staff).length >= cap) return;
  const burn = monthlyBurn(s);
  if (s.company.cash < burn * runwayMonths + money(10_000, s.day)) return;
  const rev12 = s.finance.revenue12m.reduce((a, b) => a + b, 0);
  if (Object.keys(s.staff).length > 2 && rev12 < burn * 12 * 1.1 && s.company.cash < burn * 24) return;
  if (freeDesks(s) <= 0) {
    placeFirstFree(s, bestDesk(s));
    if (freeDesks(s) <= 0) return;
  }
  const roles = Object.values(s.staff).map((x) => x.role);
  const want = (['programmer', 'designer', 'artist', 'qa', 'audio', 'writer', 'programmer', 'artist', 'designer', 'producer'] as const).find(
    (r, i) => roles.filter((x) => x === r).length < 1 + Math.floor(i / 5) + Math.floor(roles.length / 10),
  );
  const cand = s.candidates.filter((c) => !want || c.role === want).sort((a, b) => Math.max(...Object.values(b.skills)) / b.askSalary - Math.max(...Object.values(a.skills)) / a.askSalary)[0] ?? s.candidates[0];
  if (cand) dispatch(s, { type: 'hire', candidateId: cand.id });
  void rng;
}

function research(s: GameState): void {
  if (s.research.active) return;
  const yr = yearOf(s);
  const opts = RESEARCH.filter((r) => researchAvailable(s, r).ok && r.year <= yr).sort((a, b) => a.points - b.points);
  const pick = opts.find((r) => researchCost(s, r) < s.company.cash * 0.15);
  if (pick) dispatch(s, { type: 'research', id: pick.id });
  // keep one researcher assigned once there are 4+ staff
  const staff = Object.values(s.staff);
  const researchers = staff.filter((x) => x.assignment.kind === 'research').length;
  if (staff.length >= 4 && researchers < Math.max(1, Math.floor(staff.length / 8))) {
    const idle = staff.find((x) => x.assignment.kind === 'idle' && x.role !== 'founder');
    if (idle) dispatch(s, { type: 'assign', staffId: idle.id, to: 'research' });
  }
}

function engines(s: GameState): void {
  if (Object.values(s.projects).some((p) => p.kind === 'engine')) return;
  const best = Object.values(s.engines).reduce((a, b) => (b.tech > a.tech ? b : a));
  const feats = s.research.done.filter((r) => RESEARCH.find((x) => x.id === r)?.engineTech);
  const tech = engineTechFor(feats);
  if (tech - best.tech < 0.9) return;
  const progs = Object.values(s.staff).filter((x) => x.assignment.kind === 'idle' && x.skills.programming >= 30);
  if (!progs.length || Object.keys(s.staff).length < 3) return;
  dispatch(s, { type: 'buildEngine', name: `Engine ${Object.keys(s.engines).length + 1}`, features: feats, team: progs.slice(0, 2).map((x) => x.id) });
}

function contracts(s: GameState): void {
  const hasGame = Object.values(s.projects).some((p) => p.kind === 'game');
  const idle = idleStaff(s).filter((id) => hasGame || id !== s.founderId);
  if (!idle.length || !s.offers.contracts.length) return;
  const team = idle.slice(0, 3);
  const o = s.offers.contracts.find((c) => estimateContractDays(s, c, team) <= c.days * 0.8);
  if (o) dispatch(s, { type: 'acceptContract', offerId: o.id, team });
}

function office(s: GameState): void {
  const prev = OFFICE_TIERS.find((t) => t.tier === s.office.tier - 1);
  if (prev && Object.keys(s.staff).length <= prev.staffCap - 1 && s.company.cash < monthlyBurn(s) * 3) {
    dispatch(s, { type: 'moveOffice', tier: prev.tier });
    return;
  }
  const next = OFFICE_TIERS.find((t) => t.tier === s.office.tier + 1);
  if (!next) return;
  const staffN = Object.keys(s.staff).length;
  const cur = tierDef(s.office.tier);
  if (staffN >= cur.staffCap - 1 && s.company.reputation >= next.minReputation && s.company.cash > money(next.moveCost, s.day) * 2 + monthlyBurn(s) * 6) {
    dispatch(s, { type: 'moveOffice', tier: next.tier });
  }
  // décor & energy (once a month is plenty)
  if (fromDay(s.day).day > 7) return;
  const items = s.office.items.map((i) => i.item);
  if (!items.includes('kitchen') && s.company.cash > money(30_000, s.day) && yearOf(s) >= 1985) placeFirstFree(s, 'kitchen');
  if (items.filter((i) => i === 'plant_large').length < s.office.tier * 2 && s.company.cash > money(10_000, s.day)) placeFirstFree(s, 'plant_large');
  if (s.research.done.includes('biz_qa_lab') && !items.includes('qa_station') && s.company.cash > money(60_000, s.day)) placeFirstFree(s, 'qa_station');
}

function events(s: GameState, rng: Rng, pickFirst: boolean): void {
  for (const e of [...s.pendingEvents]) {
    const opts = e.options.filter((o) => !o.disabled);
    const o = pickFirst ? opts.find((x) => !/sell|lose|take/i.test(x.id)) ?? opts[opts.length - 1]! : rng.pick(opts);
    if (o) dispatch(s, { type: 'resolveEvent', uid: e.uid, option: o.id });
  }
}

function survive(s: GameState): void {
  const burn = monthlyBurn(s);
  const rev12 = s.finance.revenue12m.reduce((a, b) => a + b, 0);
  // Trim the team when revenue can't cover a shrinking runway
  if (s.company.cash < burn * 3 && rev12 < burn * 12 * 0.8) {
    const exp = Object.values(s.staff).filter((x) => x.role !== 'founder' && x.assignment.kind !== 'project').sort((a, b) => b.salary - a.salary)[0];
    if (exp) dispatch(s, { type: 'fire', staffId: exp.id });
  }
  if (s.company.cash < 0) {
    const lim = creditLimit(s);
    if (lim > 1000) dispatch(s, { type: 'takeLoan', amount: Math.min(lim, -s.company.cash + monthlyBurn(s) * 3), months: 36 });
    // lay off the most expensive non-founder if still negative
    if (s.company.cash < -monthlyBurn(s) * 2) {
      const exp = Object.values(s.staff).filter((x) => x.role !== 'founder').sort((a, b) => b.salary - a.salary)[0];
      if (exp) dispatch(s, { type: 'fire', staffId: exp.id });
    }
  }
}

function tradeShows(s: GameState, big: boolean): void {
  const d = fromDay(s.day);
  const show = TRADE_SHOWS.find((t) => t.month === d.month && t.from <= d.year && (t.to ?? 9999) >= d.year);
  if (!show) return;
  if (!Object.values(s.projects).some((p) => p.kind === 'game' && p.announcedDay !== undefined)) return;
  const booth = big ? 2 : 0;
  if (money(show.booths[booth], s.day) < s.company.cash * 0.1) dispatch(s, { type: 'tradeShow', show: show.id, booth });
}

function common(s: GameState, rng: Rng, o: { mode: 'fit' | 'trend' | 'random'; aggressive: boolean; tycoon?: boolean }) {
  events(s, rng, true);
  if (!o.aggressive) for (const st of Object.values(s.staff)) if (st.burnout > 60) dispatch(s, { type: 'vacation', staffId: st.id, days: 14 });
  manageGames(s, o.aggressive);
  startGameIfIdle(s, rng, { mode: o.mode, aggressive: o.aggressive, maxPlatforms: o.aggressive ? 3 : 2 });
  research(s);
  engines(s);
  hireIfAffordable(s, rng, o.aggressive ? 2 : 6);
  contracts(s);
  office(s);
  tradeShows(s, o.aggressive);
  survive(s);
  if (o.aggressive && s.company.cash < monthlyBurn(s) * 2 && creditLimit(s) > money(20_000, s.day)) {
    dispatch(s, { type: 'takeLoan', amount: Math.min(creditLimit(s), monthlyBurn(s) * 6), months: 48 });
  }
  // planners use the studio-life systems a sensible player would
  if (!o.aggressive && o.mode !== 'random') {
    if (!(s.company.values ?? []).length && Object.keys(s.staff).length >= 6) dispatch(s, { type: 'setValues', values: o.mode === 'trend' ? ['innovation', 'players'] : ['craft', 'balance'] });
    if (s.company.cash > monthlyBurn(s) * 12) dispatch(s, { type: 'teamRetreat' });
    if (s.company.policies.parentalLeave === undefined) dispatch(s, { type: 'setPolicy', parentalLeave: 'generous', interns: true });
    if (!s.community) dispatch(s, { type: 'foundCommunity' });
    for (const e of s.pendingEvents.filter((x) => x.defId === 'intern_offer')) dispatch(s, { type: 'resolveEvent', uid: e.uid, option: 'hire' });
    // a talk a year from the most senior person with a shipped game
    const speaker = Object.values(s.staff).find((x) => x.level === 'lead' || x.role === 'founder');
    const credited = speaker && Object.values(s.releases).filter((r) => (r.credits ?? []).some((c) => c.id === speaker.id));
    if (speaker && credited?.length) dispatch(s, { type: 'giveTalk', staffId: speaker.id, releaseId: credited[credited.length - 1]!.id });
    // crowdfund and early access self-published games when the timing is right
    for (const p of Object.values(s.projects)) {
      if (p.kind !== 'game') continue;
      if (p.phase === 0 && !p.crowdfund) dispatch(s, { type: 'crowdfund', projectId: p.id, tier: 'modest' });
      if (p.phase === 1 && !p.earlyAccess && p.concept.size !== 'small') dispatch(s, { type: 'earlyAccess', projectId: p.id });
    }
    // license the biggest series
    const big = Object.values(s.franchises).sort((a, b) => b.fans - a.fans)[0];
    if (big) for (const k of ['comic', 'toys', 'animated', 'movie'] as const) dispatch(s, { type: 'mediaDeal', franchiseId: big.id, kind: k, control: 'involved' });
    for (const m of (s.fanMail ?? []).filter((x) => x.kind === 'art' && !x.pinned).slice(0, 2)) dispatch(s, { type: 'pinFanArt', id: m.id, on: true });
    // pair juniors with seniors in the same craft
    const seniors = Object.values(s.staff).filter((x) => (x.level === 'senior' || x.level === 'lead') && !x.mentorId);
    for (const j of Object.values(s.staff).filter((x) => (x.level === 'junior' || x.level === 'mid') && !x.mentorId).slice(0, 3)) {
      const m = seniors.find((x) => x.role === j.role);
      if (m) dispatch(s, { type: 'setMentor', staffId: j.id, mentorId: m.id });
    }
  }
  if (o.tycoon) {
    if (ipoEligible(s).ok) dispatch(s, { type: 'ipo', pct: 0.3 });
    const t = s.offers.acquisitions[0];
    if (t && s.company.cash > t.price * 3) dispatch(s, { type: 'acquire', targetId: t.id });
    hardware(s);
    // Start a league for a big competitive hit.
    const lgGame = leagueCandidates(s).find((r) => !canFoundLeague(s, r) && r.units > 3e6);
    if (lgGame && s.company.cash > leagueSetupCost(s, 'pro') * 30) dispatch(s, { type: 'foundLeague', releaseId: lgGame.id, tier: 'pro', name: 'Bot League' });
    // Wake up the back catalogue with a storefront sale now and then.
    const old = Object.values(s.releases).find((r) => r.score >= 70 && !canRunSale(s, r));
    if (old && rng.chance(0.2)) dispatch(s, { type: 'runSale', releaseId: old.id, discount: rng.pick([0.25, 0.5, 0.75] as const) });
    if (!showcaseBlocked(s) && s.company.cash > showcaseCost(s) * 20) dispatch(s, { type: 'hostShowcase' });
    for (const r of ['eu', 'jp', 'row'] as const) if (s.company.cash > money(BRANCH.open, s.day) * 20) dispatch(s, { type: 'openBranch', region: r });
    const indie = signableIndies(s)[0];
    if (indie && !labelBlocked(s) && s.company.cash > dealAdvance(s, 'medium') * 15) dispatch(s, { type: 'signIndie', rivalId: indie.id, tier: 'medium' });
    if (!canLaunchSub(s) && s.company.cash > subLaunchCost(s) * 20) dispatch(s, { type: 'launchSubscription', name: 'Bot Pass', price: subRefPrice(s) });
  }
}

/** Tycoons build a console once they are rich and famous, and keep its price in line with the market. */
function hardware(s: GameState): void {
  if (!canDesignConsole(s)) {
    const spec = consoleSpec(s, 'console', 'standard');
    if (s.company.cash > (spec.rdTotal + money(MARKETING.standard.cost, s.day)) * 4) {
      dispatch(s, { type: 'designConsole', name: `Bot Box ${s.hardware.length + 1}`, kind: 'console', tier: 'standard', price: Math.round(spec.refPrice), feeRate: 0.2, marketing: 'standard' });
    }
  }
  for (const hw of liveConsoles(s)) {
    const ref = Math.round(refPrice(hw, s.day));
    if (Math.abs(hw.price - ref) / ref > 0.15) dispatch(s, { type: 'setConsole', id: hw.id, price: ref });
  }
}

const ALL_ACTION_BUILDERS: ((s: GameState, rng: Rng) => Action | null)[] = [
  (s, rng) => (s.candidates.length ? { type: 'hire', candidateId: rng.pick(s.candidates).id } : null),
  (s, rng) => {
    const st = Object.values(s.staff).filter((x) => x.role !== 'founder');
    return st.length ? { type: 'fire', staffId: rng.pick(st).id } : null;
  },
  (s, rng) => {
    const t = tierDef(s.office.tier);
    return { type: 'placeItem', item: rng.pick(ITEMS).id, floor: rng.int(0, t.floors - 1), x: rng.int(0, t.w), y: rng.int(0, t.h), rot: rng.chance(0.5) ? 1 : 0 };
  },
  (s, rng) => (s.office.items.length ? { type: 'sellItem', id: rng.pick(s.office.items).id } : null),
  (_s, rng) => ({ type: 'research', id: rng.pick(RESEARCH).id }),
  (_s, rng) => ({ type: 'takeLoan', amount: rng.range(1000, 200000), months: rng.int(6, 60) }),
  (s, rng) => (s.finance.loans.length ? { type: 'repayLoan', loanId: rng.pick(s.finance.loans).id } : null),
  (s, rng) => ({ type: 'moveOffice', tier: s.office.tier + (rng.chance(0.7) ? 1 : -1) }),
  (s, rng) => {
    const ps = Object.values(s.projects);
    return ps.length ? { type: 'setCrunch', projectId: rng.pick(ps).id, on: rng.chance(0.5) } : null;
  },
  (s, rng) => {
    const ps = Object.values(s.projects);
    return ps.length ? { type: 'delay', projectId: rng.pick(ps).id, weeks: rng.int(1, 8) } : null;
  },
  (s, rng) => {
    const ps = Object.values(s.projects);
    return ps.length ? { type: 'cutFeatures', projectId: rng.pick(ps).id } : null;
  },
  (_s, rng) => ({ type: 'setPolicy', salaryPolicy: rng.pick(['lean', 'market', 'generous'] as const), remote: rng.chance(0.5), fourDayWeek: rng.chance(0.3) }),
  (_s, rng) => ({ type: 'setRecruiting', level: rng.int(0, 3) }),
  (_s, rng) => ({ type: 'ipo', pct: rng.range(0.1, 0.5) }),
  (s, rng) => (s.offers.acquisitions.length ? { type: 'acquire', targetId: rng.pick(s.offers.acquisitions).id } : null),
  (s, rng) => {
    const st = Object.values(s.staff);
    return st.length ? { type: 'setSalary', staffId: rng.pick(st).id, salary: rng.range(5000, 200000) } : null;
  },
  (s, rng) => {
    const fs = Object.values(s.franchises);
    return fs.length && rng.chance(0.1) ? { type: 'sellFranchise', franchiseId: rng.pick(fs).id } : null;
  },
  (_s, rng) => ({
    type: 'designConsole',
    name: rng.chance(0.1) ? '' : 'Fuzz',
    kind: rng.chance(0.5) ? 'console' : 'handheld',
    tier: rng.pick(['budget', 'standard', 'premium'] as const),
    price: rng.range(-10, 900),
    feeRate: rng.range(-0.1, 0.6),
    marketing: rng.pick(['none', 'standard', 'blitz'] as const),
  }),
  (s, rng) => (s.hardware.length ? { type: 'setConsole', id: rng.pick(s.hardware).id, price: rng.chance(0.5) ? rng.range(-5, 900) : undefined, feeRate: rng.chance(0.5) ? rng.range(-0.1, 0.6) : undefined } : null),
  (s, rng) => (s.hardware.length ? { type: rng.chance(0.5) ? 'retireConsole' : 'cancelConsole', id: rng.pick(s.hardware).id } : null),
  (_s, rng) => ({ type: 'launchSubscription', name: 'Fuzz Pass', price: rng.range(-1, 60) }),
  () => ({ type: 'hostShowcase' }),
  () => ({ type: 'teamRetreat' }),
  (s, rng) => { const r = Object.values(s.releases); const p = availablePlatforms(s); return r.length && p.length ? { type: 'rerelease', releaseId: rng.pick(r).id, platform: rng.pick(p).id } : null; },
  (s, rng) => { const p = Object.keys(s.projects); return p.length ? { type: 'focusTest', projectId: rng.pick(p) } : null; },
  (_s, rng) => ({ type: 'setPolicy', wellness: rng.chance(0.5) }),
  (_s, rng) => ({ type: 'copyFloor', from: rng.int(-1, 4), to: rng.int(-1, 4) }),
  () => ({ type: 'raiseFunding' }),
  (s, rng) => (s.offers.deals.length ? { type: 'negotiateDeal', dealId: rng.pick(s.offers.deals).id, ask: rng.pick(['advance', 'royalty', 'everything'] as never[]) } : null),
  (s, rng) => { const st = Object.keys(s.staff); return st.length ? { type: 'sabbatical', staffId: rng.pick(st) } : null; },
  () => ({ type: 'undoPlace' }),
  () => ({ type: 'foundCommunity' }),
  (s, rng) => { const p = Object.keys(s.projects); return p.length ? { type: 'setReviewPolicy', projectId: rng.pick(p), policy: rng.pick(['early', 'launch', 'none', 'never'] as never[]) } : null; },
  (_s, rng) => ({ type: 'setMascot', mascot: { kind: rng.pick(['bear', 'cat', 'robot', 'dragon', 'blob', 'bird', 'whale'] as never[]), color: rng.pick(['#e07a5f', 'red', '#123456'] as never[]), acc: rng.pick(['none', 'cap', 'crown', 'cape'] as never[]) } }),
  (s, rng) => { const p = Object.keys(s.projects); const r = Object.keys(s.rivals); return p.length && r.length ? { type: 'coDevelop', projectId: rng.pick(p), rivalId: rng.chance(0.9) ? rng.pick(r) : 'nope' } : null; },
  (_s, rng) => ({ type: 'setModeration', level: rng.pick([0, 1, 2, 5] as never[]) }),
  (s, rng) => { const p = Object.keys(s.projects); return p.length ? { type: 'trailerCut', projectId: rng.pick(p), points: rng.int(-2, 12) } : null; },
  (_s, rng) => ({ type: 'setPolicy', charity: rng.pick([0, 1, 5, 7] as never[]) }),
  (s, rng) => { const e = Object.keys(s.engines); return e.length ? { type: 'openSourceEngine', engineId: rng.pick(e) } : null; },
  (s, rng) => { const p = Object.keys(s.projects); return p.length ? { type: 'earlyAccess', projectId: rng.chance(0.9) ? rng.pick(p) : 'nope' } : null; },
  (s, rng) => { const p = Object.keys(s.projects); return p.length ? { type: 'crowdfund', projectId: rng.pick(p), tier: rng.pick(['modest', 'ambitious', 'moonshot', 'bogus'] as never[]) } : null; },
  (_s, rng) => ({ type: 'setPolicy', parentalLeave: rng.pick(['minimal', 'standard', 'generous', 'bogus'] as never[]), interns: rng.chance(0.5) }),
  (s, rng) => { const st = Object.keys(s.staff); return st.length ? { type: 'checkIn', staffId: rng.chance(0.9) ? rng.pick(st) : 'nope' } : null; },
  (s, rng) => (s.fanMail?.length ? { type: 'pinFanArt', id: rng.pick(s.fanMail).id, on: rng.chance(0.7) } : { type: 'readFanMail' }),
  (s, rng) => { const st = Object.keys(s.staff); const r = Object.keys(s.releases); return st.length ? { type: 'giveTalk', staffId: rng.pick(st), releaseId: r.length && rng.chance(0.9) ? rng.pick(r) : 'nope' } : null; },
  (s, rng) => { const f = Object.keys(s.franchises); return f.length ? { type: 'mediaDeal', franchiseId: rng.pick(f), kind: rng.pick(['comic', 'board', 'toys', 'animated', 'tv', 'movie', 'ride', 'opera'] as never[]), control: rng.pick(['licensed', 'involved', 'nope'] as never[]) } : null; },
  (s, rng) => { const f = Object.keys(s.franchises); return { type: 'fanCon', franchiseId: f.length && rng.chance(0.8) ? rng.pick(f) : 'nope' }; },
  (s, rng) => { const st = Object.keys(s.staff); return st.length > 1 ? { type: 'setMentor', staffId: rng.pick(st), mentorId: rng.chance(0.2) ? null : rng.pick(st) } : null; },
  (_s, rng) => ({ type: rng.chance(0.7) ? 'openBranch' : 'closeBranch', region: rng.pick(['na', 'eu', 'jp', 'row', 'moon'] as never[]) }),
  (_s, rng) => ({ type: 'setOfficeStyle', floor: rng.pick(['auto', 'wood', 'tiles', 'lava'] as never[]), wall: rng.pick([undefined, '#abcdef', 'red'] as never[]) }),
  (s, rng) => { const r = Object.values(s.releases); return r.length ? { type: 'liveEvent', releaseId: rng.pick(r).id } : null; },
  (_s, rng) => ({ type: 'setValues', values: rng.shuffle(['craft', 'speed', 'players', 'profit', 'innovation', 'balance', 'nope'] as never[]).slice(0, rng.int(0, 3)) }),
  (s, rng) => { const st = Object.keys(s.staff); return st.length ? { type: 'startGame', game: { name: 'Feat', genre: rng.pick(['rpg', 'shooter', 'puzzle'] as const), topic: 'fantasy', platforms: [availablePlatforms(s)[0]?.id ?? 'pc'], audience: 'teen', size: 'small', monetization: rng.pick(['premium', 'f2p'] as const), engineId: 'e0', team: st.slice(0, 1), features: rng.shuffle(GAME_FEATURES.map((f) => f.id).concat('bogus')).slice(0, rng.int(0, 5)), localized: rng.shuffle(['na', 'eu', 'jp', 'row', 'mars'] as never[]).slice(0, rng.int(0, 5)), priceTier: rng.pick(['budget', 'standard', 'premium', 'bogus'] as never[]) } } : null; },
  (s, rng) => { const p = Object.keys(s.projects); return p.length ? { type: 'openBeta', projectId: rng.pick(p) } : null; },
  (s, rng) => { const r = Object.values(s.releases); return r.length ? { type: 'foundLeague', releaseId: rng.pick(r).id, tier: rng.pick(['regional', 'pro', 'world', 'mega'] as never[]), name: rng.chance(0.1) ? '' : 'Fuzz League' } : null; },
  (s, rng) => (s.leagues?.length ? { type: 'closeLeague', id: rng.pick(s.leagues).id } : null),
  (s, rng) => { const r = Object.values(s.releases); return r.length ? { type: 'runSale', releaseId: rng.pick(r).id, discount: rng.pick([0.25, 0.5, 0.75, 0.9] as never[]) } : null; },
  (s, rng) => {
    const r = Object.values(s.releases);
    if (!r.length) return null;
    const b = rng.pick(r);
    return { type: 'startGame', game: { name: 'Fuzz Exp', genre: b.concept.genre, topic: b.concept.topic, platforms: rng.chance(0.8) ? b.concept.platforms : ['nes'], audience: b.concept.audience, size: rng.pick(['small', 'medium', 'large', 'aaa'] as const), monetization: rng.chance(0.8) ? 'premium' : 'f2p', engineId: 'e0', priceTier: rng.pick(['budget', 'premium'] as const), franchiseId: b.concept.franchiseId, expansionOf: b.id, remasterOf: rng.chance(0.1) ? b.id : undefined, team: Object.keys(s.staff).slice(0, 2) } };
  },
  (s, rng) => { const r = Object.values(s.rivals); return r.length ? { type: 'signIndie', rivalId: rng.pick(r).id, tier: rng.pick(['small', 'medium', 'large'] as const) } : null; },
  (_s, rng) => (rng.chance(0.7) ? { type: 'setSubscriptionPrice', price: rng.range(-1, 60) } : { type: 'closeSubscription' }),
  (s, rng) => { const st = Object.values(s.staff); return st.length ? { type: 'vacation', staffId: rng.pick(st).id, days: rng.chance(0.5) ? 7 : 14 } : null; },
];

export function makeBot(name: BotName): Bot {
  return {
    name,
    act(s, rng) {
      switch (name) {
        case 'idle':
          // Does nothing except acknowledge events (default options).
          return;
        case 'steady':
          return common(s, rng, { mode: 'fit', aggressive: false });
        case 'aggressive':
          return common(s, rng, { mode: 'fit', aggressive: true });
        case 'trend':
          return common(s, rng, { mode: 'trend', aggressive: false });
        case 'tycoon':
          return common(s, rng, { mode: 'fit', aggressive: false, tycoon: true });
        case 'random': {
          common(s, rng, { mode: 'random', aggressive: rng.chance(0.3) });
          for (let i = 0; i < 3; i++) {
            const b = rng.pick(ALL_ACTION_BUILDERS)(s, rng);
            if (b) dispatch(s, b);
          }
          return;
        }
      }
    },
  };
}
