/**
 * Player commands. Every UI interaction (and every bot decision) goes through dispatch(), which
 * validates and applies the action deterministically.
 */
import type { PriceTier } from './types';
import { priceTierAllowed } from './systems/pricing';
import { checkIn } from './systems/checkIns';
import { docOnCancel } from './systems/documentary';
import type { MascotDesign } from './types';
import { signCodev } from './systems/codev';
import { communityNudge, foundCommunity, setModeration } from './systems/community';
import { openSourceEngine } from './systems/giving';
import { devkitMul } from './systems/partners';
import type { MediaKind } from './types';
import { signMediaDeal } from './systems/media';
import { giveTalk } from './systems/talks';
import { pinFanArt } from './systems/fanMail';
import type { CampaignTier } from './systems/crowdfunding';
import { startCrowdfund } from './systems/crowdfunding';
import { startEarlyAccess } from './systems/earlyAccess';
import { PHASE_AREAS } from '../data/types';
import { COMPANY_BY_ID } from '../data/companies';
import { runLiveEvent } from './systems/liveEvents';
import { teamRetreat } from './systems/studioLife';
import type { CultureId } from '../data/culture';
import { setValues } from './systems/culture';
import { BRANCH, LOC_COST, LOC_YEAR, REGION_BY_ID, type RegionId } from '../data/regions';
import { BALANCE } from '../data/balance';
import { ENGINE_BY_ID } from '../data/engines';
import { ITEM_BY_ID, type ItemId } from '../data/facilities';
import { FEATURE_BY_ID, MAX_FEATURES } from '../data/gameFeatures';
import { GENRE_BY_ID } from '../data/genres';
import { CHANNELS, TRADE_SHOWS } from '../data/marketing';
import { RESEARCH_BY_ID } from '../data/research';
import { TOPIC_BY_ID } from '../data/topics';
import type { Audience, GenreId, Monetization, Skill } from '../data/types';
import { clamp } from './breakdown';
import { fromDay } from './calendar';
import type { Ctx, SimEvent } from './ctx';
import { Rng } from './rng';
import { benchmarkPoints, engineBuildPoints, engineTechFor, gameQuality, phaseLength, qualityToScore, workShare } from './systems/dev';
import { resolveEvent } from './systems/events';
import { hostShowcase, showcaseBlocked } from './systems/showcase';
import { LABEL_TIERS, dealAdvance, labelBlocked, signIndie, signableIndies } from './systems/publishing';
import { canLaunchSub, launchSub, subLaunchCost, subRefPrice } from './systems/subscription';
import { MARKETING, canDesignConsole, consoleSpec, mediaFor, priceBounds, projectsTargeting, retireConsole, type ConsoleKind, type ConsoleMarketing, type ConsoleTier } from './systems/hardware';
import { SALE_DISCOUNTS, applyPatch, applyPort, applyRerelease, applySale, canExpand, canPatch, canRemaster, canRunSale, expansionPlatforms, expansionSizeOk, patchCost, portCost, rereleaseBlocked, rereleaseCost, type SaleDiscount } from './systems/release';
import { creditLimit, doIPO, ipValue, ipoEligible, raiseFunding, repayLoan, secondaryOffering, takeLoan } from './systems/finance';
import { isPlatformAvailable, platformInfo } from './systems/market';
import { assignDesks, canPlace, freeDesks, itemRequirement, tierDef, touchOffice } from './systems/office';
import { researchAvailable, researchCost } from './systems/research';
import { SABBATICAL, candidateToStaff, invalidateMentees, marketSalary, maybeSpinOff, mentorBlocked, refreshCandidates, removeStaff, sabbaticalBlocked, vacationBlocked } from './systems/staff';
import { FRANCHISES } from '../data/franchises';
import { parseYM } from './calendar';
import type { BadgeShape, FloorStyle, Focus3, GameProject, GameState, LeagueTier, Size, Specialisation } from './types';
import { applyCheat, markCheated, type CheatOp } from './cheats';
import { canFoundLeague, closeLeague, foundLeague, LEAGUE_TIERS, leagueSetupCost } from './systems/esports';
import { addRep, aOrAn, earn, fmtMoney, fmtUnits, hasFlag, inflation, money, newId, pushNews, spend } from './util';

export interface StartGamePayload {
  name: string;
  genre: GenreId;
  topic: string;
  platforms: string[];
  audience: Audience;
  size: Size;
  monetization: Monetization;
  engineId: string;
  franchiseId?: string;
  dealId?: string;
  remasterOf?: string;
  /** Release id of the base game, for an expansion pack. */
  expansionOf?: string;
  /** Signature features (up to three). */
  features?: string[];
  /** Extra regions to localise for. */
  localized?: RegionId[];
  /** Launch price tier (full-price, self-published new games only). */
  priceTier?: PriceTier;
  team: string[];
  focus?: [Focus3, Focus3, Focus3];
}

/** What copying a floor's layout costs (every item at its current price). */
export function copyFloorCost(s: GameState, from: number): number {
  if (s.cheats?.freeBuild) return 0;
  return s.office.items.filter((i) => i.floor === from).reduce((t, i) => t + money(ITEM_BY_ID[i.item].cost, s.day), 0);
}

/** A focus group costs more for bigger games. */
export function focusTestCost(s: GameState, size: Size): number {
  return money({ small: 2_500, medium: 6_000, large: 15_000, aaa: 40_000 }[size], s.day);
}

/** Chance a publisher agrees to better terms: your reputation is your leverage. */
export function negotiateOdds(s: GameState): number {
  return clamp(0.3 + s.company.reputation / 160, 0.3, 0.85);
}

/** Fan conventions for a big series (once every two years). */
export function fanConCost(s: GameState, f: { fans: number }): number {
  return Math.round(Math.max(money(60_000, s.day), f.fans * 0.6 * inflation(s.day)));
}
export function fanConBlocked(s: GameState, f: { fans: number; lastCon?: number }): string | null {
  if (f.fans < 300_000) return 'Needs 300k fans';
  if (f.lastCon !== undefined && s.day - f.lastCon < 730) return `Next con in ${730 - (s.day - f.lastCon)} days`;
  if (s.company.cash < fanConCost(s, f)) return `Needs ${fmtMoney(fanConCost(s, f))}`;
  return null;
}

/** Why a branch office can't open in this region right now (or null). */
export function branchBlocked(s: GameState, region: RegionId): string | null {
  if (!REGION_BY_ID[region]) return 'Unknown region';
  if (region === (s.company.homeRegion ?? 'na')) return 'That’s home';
  if ((s.company.branches ?? []).includes(region)) return 'Already open';
  if (fromDay(s.day).year < BRANCH.minYear) return `From ${BRANCH.minYear}`;
  if (s.company.reputation < BRANCH.minReputation) return `Needs reputation ${BRANCH.minReputation}`;
  if (s.company.cash < money(BRANCH.open, s.day)) return `Needs ${fmtMoney(money(BRANCH.open, s.day))}`;
  return null;
}

export type Action =
  | { type: 'startGame'; game: StartGamePayload }
  | { type: 'setFocus'; projectId: string; phase: 0 | 1 | 2; focus: Focus3 }
  | { type: 'continueGate'; projectId: string }
  | { type: 'setTeam'; projectId: string; team: string[] }
  | { type: 'setCrunch'; projectId: string; on: boolean }
  | { type: 'delay'; projectId: string; weeks: number }
  | { type: 'cutFeatures'; projectId: string }
  | { type: 'announce'; projectId: string }
  | { type: 'cancelProject'; projectId: string }
  | { type: 'marketing'; projectId: string; channel: string }
  | { type: 'tradeShow'; show: string; booth: 0 | 1 | 2 }
  | { type: 'hire'; candidateId: string; salary?: number }
  | { type: 'fire'; staffId: string }
  /** Let several people go at once (one combined, capped morale hit). */
  | { type: 'fireMany'; staffIds: string[] }
  | { type: 'setSalary'; staffId: string; salary: number }
  | { type: 'assign'; staffId: string; to: 'idle' | 'research' }
  | { type: 'train'; staffId: string; skill: Skill }
  | { type: 'setSpec'; staffId: string; spec: Specialisation }
  | { type: 'placeItem'; item: ItemId; floor: number; x: number; y: number; rot: 0 | 1 }
  | { type: 'moveItem'; id: string; floor: number; x: number; y: number; rot: 0 | 1 }
  | { type: 'sellItem'; id: string }
  | { type: 'moveOffice'; tier: number }
  | { type: 'research'; id: string }
  | { type: 'queueResearch'; id: string }
  | { type: 'cancelResearch' }
  | { type: 'buildEngine'; name: string; features: string[]; team: string[] }
  | { type: 'licenseEngine'; engineDef: string }
  | { type: 'licenseOut'; engineId: string }
  | { type: 'acceptContract'; offerId: string; team: string[] }
  | { type: 'takeLoan'; amount: number; months: number }
  | { type: 'repayLoan'; loanId: string }
  | { type: 'ipo'; pct: number }
  | { type: 'buyback'; shares: number }
  | { type: 'setValues'; values: CultureId[] }
  | { type: 'teamRetreat' }
  | { type: 'liveEvent'; releaseId: string }
  | { type: 'rerelease'; releaseId: string; platform: string }
  | { type: 'focusTest'; projectId: string }
  | { type: 'copyFloor'; from: number; to: number }
  | { type: 'raiseFunding' }
  | { type: 'earlyAccess'; projectId: string }
  | { type: 'pinFanArt'; id: string; on: boolean }
  | { type: 'trailerCut'; projectId: string; points: number }
  | { type: 'foundCommunity' }
  | { type: 'setReviewPolicy'; projectId: string; policy: 'early' | 'launch' | 'none' }
  | { type: 'setMascot'; mascot: MascotDesign }
  | { type: 'coDevelop'; projectId: string; rivalId: string }
  | { type: 'setModeration'; level: 0 | 1 | 2 }
  | { type: 'openSourceEngine'; engineId: string }
  | { type: 'giveTalk'; staffId: string; releaseId: string }
  | { type: 'checkIn'; staffId: string }
  | { type: 'mediaDeal'; franchiseId: string; kind: MediaKind; control: 'licensed' | 'involved' }
  | { type: 'readFanMail' }
  | { type: 'crowdfund'; projectId: string; tier: CampaignTier }
  | { type: 'negotiateDeal'; dealId: string; ask: 'advance' | 'royalty' }
  | { type: 'sabbatical'; staffId: string }
  | { type: 'undoPlace' }
  | { type: 'fanCon'; franchiseId: string }
  | { type: 'bugBash'; projectId: string; hits: number }
  | { type: 'setMentor'; staffId: string; mentorId: string | null }
  | { type: 'setOfficeStyle'; floor: FloorStyle; wall?: string }
  | { type: 'openBranch'; region: RegionId }
  | { type: 'closeBranch'; region: RegionId }
  | { type: 'acquire'; targetId: string }
  | { type: 'setSubsidiary'; id: string; budget: 'low' | 'normal' | 'high'; focusGenre?: GenreId }
  | { type: 'sellFranchise'; franchiseId: string }
  | { type: 'resolveEvent'; uid: number; option: string }
  | { type: 'setPolicy'; salaryPolicy?: 'lean' | 'market' | 'generous'; remote?: boolean; fourDayWeek?: boolean; wellness?: boolean; charity?: 0 | 1 | 5; parentalLeave?: 'minimal' | 'standard' | 'generous'; interns?: boolean; autoResearch?: boolean; autoVacation?: boolean; autoQueue?: boolean }
  | { type: 'setRecruiting'; level: number }
  | { type: 'buyDevkit'; platform: string }
  | { type: 'continueEndless' }
  | { type: 'retire' }
  | { type: 'setAutopause'; key: 'gates' | 'events' | 'releases' | 'research'; on: boolean }
  | { type: 'tutorial'; step: number }
  | { type: 'refreshCandidates' }
  | { type: 'patchGame'; releaseId: string }
  | { type: 'cheat'; cheat: CheatOp }
  | { type: 'openBeta'; projectId: string }
  /** Place the best available desk in free spots until everyone has one. */
  | { type: 'furnishDesks'; extra?: number }
  | { type: 'setIdentity'; name?: string; color?: string; emblem?: string | null; shape?: BadgeShape }
  | { type: 'foundLeague'; releaseId: string; tier: LeagueTier; name: string }
  | { type: 'closeLeague'; id: string }
  | { type: 'runSale'; releaseId: string; discount: SaleDiscount }
  | { type: 'portGame'; releaseId: string; platform: string }
  | { type: 'secondaryOffering'; pct: number }
  | { type: 'marketResearch'; genre: GenreId; topic: string }
  | { type: 'designConsole'; name: string; kind: ConsoleKind; tier: ConsoleTier; price: number; feeRate: number; marketing: ConsoleMarketing }
  | { type: 'setConsole'; id: string; price?: number; feeRate?: number; packIn?: string | null }
  | { type: 'retireConsole'; id: string }
  | { type: 'vacation'; staffId: string; days: 7 | 14 }
  | { type: 'launchSubscription'; name: string; price: number }
  | { type: 'setSubscriptionPrice'; price: number }
  | { type: 'closeSubscription' }
  | { type: 'hostShowcase' }
  | { type: 'signIndie'; rivalId: string; tier: 'small' | 'medium' | 'large' }
  | { type: 'cancelConsole'; id: string };

export type ActionResult = { ok: true; events: SimEvent[] } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

/** Price of a focus-group study that reveals how well a genre and topic fit together. */
export function marketResearchCost(s: GameState): number {
  return money(1_500, s.day);
}

export function devkitCost(s: GameState, platform: string): number {
  const pl = platformInfo(s, platform);
  if (!pl) return 0;
  return Math.round(pl.devKit * Math.pow(inflation(s.day) / inflation(pl.launchDay), 0.7) * devkitMul(s, platform));
}

export function defaultFocus(genre: GenreId): [Focus3, Focus3, Focus3] {
  const g = GENRE_BY_ID[genre];
  const f = (a: number, b: number, c: number): Focus3 => {
    const t = a + b + c;
    return [Math.round((a / t) * 100), Math.round((b / t) * 100), 100 - Math.round((a / t) * 100) - Math.round((b / t) * 100)];
  };
  void g;
  return [f(1, 1, 1), f(1, 1, 1), f(1, 1, 1)];
}

function teamValid(s: GameState, team: string[], projectIdToIgnore?: string): string | null {
  if (new Set(team).size !== team.length) return 'Each person can only be listed once';
  for (const id of team) {
    if (s.staff[id]?.assignment.kind === 'training') return `${s.staff[id]!.name} is in training`;
    const st = s.staff[id];
    if (!st) return 'Unknown staff member';
    if (st.assignment.kind === 'project' && st.assignment.id !== projectIdToIgnore && s.projects[st.assignment.id]) {
      return `${st.name} is already on another project`;
    }
  }
  return null;
}

function assignTeam(s: GameState, projectId: string, team: string[]): void {
  for (const id of team) {
    const st = s.staff[id];
    if (st) st.assignment = { kind: 'project', id: projectId };
  }
}

/** Morale cost of letting n people go together (capped: one bad week, not a collapse). */
export function layoffMoraleHit(n: number): number {
  return Math.min(10, 2 + n);
}

/** The series' latest game ended on a cliffhanger (in the last six years) that no sequel has paid off yet. */
export function cliffhangerPending(s: GameState, franchiseId: string): boolean {
  const f = s.franchises[franchiseId];
  return f?.openCliffhanger !== undefined && s.day - f.openCliffhanger < 365 * 6;
}

/** Public betas (2005+): two extra weeks in polish, a quarter of the bugs found, some hype, and a score read. */
export const BETA_DAYS = 14;
export function betaCost(s: GameState, p: GameProject): number {
  return money({ small: 4_000, medium: 10_000, large: 25_000, aaa: 60_000 }[p.concept.size], s.day);
}
export function betaBlocked(s: GameState, p: GameProject): string | null {
  if (fromDay(s.day).year < 2005) return 'Public betas take off with online distribution (2005+)';
  if (p.beta) return 'Already ran a beta';
  if (p.earlyAccess) return 'It’s already in players’ hands (Early Access)';
  if (p.phase !== 2) return 'Betas happen during polish';
  if (p.announcedDay === undefined) return 'Announce the game first';
  if (s.company.cash < betaCost(s, p)) return `Needs ${fmtMoney(betaCost(s, p))} for servers`;
  return null;
}

/** Why this set of signature features can't be used (null if fine). */
export function featuresBlocked(s: GameState, ids: string[], monet: Monetization): string | null {
  if (ids.length > MAX_FEATURES) return `Pick at most ${MAX_FEATURES} signature features`;
  const yr = fromDay(s.day).year;
  for (const id of ids) {
    const f = FEATURE_BY_ID[id];
    if (!f) return 'Unknown feature';
    if (yr < f.year) return `${f.name} isn't possible until ${f.year}`;
    if (f.research && !s.research.done.includes(f.research)) return `${f.name} needs ${RESEARCH_BY_ID[f.research]?.name ?? 'research'}`;
    if (f.monet && !f.monet.includes(monet)) return `${f.name} only suits ${f.monet.includes('premium') ? 'games sold at full price' : 'free-to-play or live games'}`;
  }
  return null;
}

/** A publisher pays the advance for the game size it offered for; a smaller game gets a proportionally smaller one. */
export function dealAdvanceFor(deal: { advance: number; size?: Size }, size: Size, day: number): number {
  if (!deal.size) return deal.advance;
  const ratio = Math.min(1, benchmarkPoints(size, day) / benchmarkPoints(deal.size, day));
  return Math.round((deal.advance * ratio) / 1000) * 1000;
}

export function sizeAllowed(s: GameState, size: Size): string | null {
  if (size === 'large' && s.office.tier < 2) return 'Large games need at least a Small Office';
  if (size === 'aaa' && (s.office.tier < 4 || fromDay(s.day).year < 1995)) return 'AAA needs a Studio Building and 1995+';
  if (size !== 'small' && s.releaseOrder.length < 1) return 'Ship a small game first';
  return null;
}

export function monetizationAllowed(s: GameState, m: Monetization, genre: GenreId): string | null {
  const yr = fromDay(s.day).year;
  const def = BALANCE.MONETIZATION[m];
  if (yr < def.minYear) return `Available from ${def.minYear}`;
  if (m === 'subscription' && genre !== 'mmo') return 'Subscriptions only work for MMOs';
  if (m === 'f2p' && !hasFlag(s, 'f2p')) return 'Free-to-play hasn’t caught on yet';
  if (m === 'live_service' && !hasFlag(s, 'liveService')) return 'Live service isn’t a thing yet';
  if (m === 'shareware' && !hasFlag(s, 'shareware')) return 'Shareware isn’t a thing yet';
  if (m === 'premium_dlc' && !hasFlag(s, 'dlc')) return 'DLC isn’t a thing yet';
  return null;
}

export function dispatch(s: GameState, a: Action): ActionResult {
  const rng = new Rng(s.rng);
  const c: Ctx = { s, rng, out: [] };
  const r = apply(c, a);
  s.rng = rng.state;
  if (r) return fail(r);
  return { ok: true, events: c.out };
}

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === 'number' && Number.isFinite(x));

function apply(c: Ctx, a: Action): string | null {
  const { s } = c;
  if ('amount' in a && !finite(a.amount)) return 'Invalid amount';
  if ('salary' in a && a.salary !== undefined && !finite(a.salary)) return 'Invalid salary';
  if ('shares' in a && !finite(a.shares)) return 'Invalid share count';
  if ('weeks' in a && !finite(a.weeks)) return 'Invalid duration';
  if ('months' in a && !finite(a.months)) return 'Invalid term';
  if ('pct' in a && !finite(a.pct)) return 'Invalid percentage';
  if ('price' in a && a.price !== undefined && (!finite(a.price) || a.price <= 0)) return 'Invalid price';
  if ('feeRate' in a && a.feeRate !== undefined && (!finite(a.feeRate) || a.feeRate < 0 || a.feeRate > 0.5)) return 'Licence fee must be between 0% and 50%';
  if (a.type === 'tradeShow' && ![0, 1, 2].includes(a.booth)) return 'Invalid booth';
  if ((a.type === 'placeItem' || a.type === 'moveItem') && !finite(a.x, a.y, a.floor)) return 'Invalid position';
  if (s.status !== 'running' && a.type !== 'continueEndless') return 'The game has ended';
  switch (a.type) {
    case 'startGame': {
      const g = a.game;
      const genre = GENRE_BY_ID[g.genre];
      const topic = TOPIC_BY_ID[g.topic];
      const yr = fromDay(s.day).year;
      if (!genre || yr < genre.year || (genre.research && !s.research.done.includes(genre.research))) return 'Genre not available';
      if (!topic || yr < topic.year || (topic.research && !s.research.done.includes(topic.research))) return 'Topic not available';
      if (!g.name.trim()) return 'Give your game a name';
      if (!g.platforms.length || g.platforms.length > 6) return 'Choose 1–6 platforms';
      if (new Set(g.platforms).size !== g.platforms.length) return 'Each platform can only be chosen once';
      for (const pid of g.platforms) {
        const pl = platformInfo(s, pid);
        if (!pl || !isPlatformAvailable(s, pl)) return `${pl?.name ?? pid} is not available`;
      }
      const sizeErr = sizeAllowed(s, g.size);
      if (sizeErr) return sizeErr;
      const mErr = monetizationAllowed(s, g.monetization, g.genre);
      if (mErr) return mErr;
      if (!s.engines[g.engineId]) return 'Unknown engine';
      if (!g.team.length) return 'Assign at least one person';
      if (g.team.length > BALANCE.SIZE[g.size].teamCap) return `Team too large for a ${g.size} game (max ${BALANCE.SIZE[g.size].teamCap})`;
      const te = teamValid(s, g.team);
      if (te) return te;
      if (g.franchiseId && !s.franchises[g.franchiseId]) return 'Unknown franchise';
      const orig = g.remasterOf ? s.releases[g.remasterOf] : undefined;
      if (g.remasterOf) {
        if (!orig) return 'Unknown game to remaster';
        const why = canRemaster(s, orig);
        if (why) return why;
        if (g.genre !== orig.concept.genre || g.topic !== orig.concept.topic) return 'A remaster keeps the original genre and topic';
        if (g.franchiseId !== (orig.concept.franchiseId && s.franchises[orig.concept.franchiseId] ? orig.concept.franchiseId : undefined)) return 'A remaster belongs to the original’s franchise';
      }
      const base = g.expansionOf ? s.releases[g.expansionOf] : undefined;
      if (g.expansionOf) {
        if (!base) return 'Unknown game to expand';
        if (orig) return 'A game can’t be both a remaster and an expansion';
        const why = canExpand(s, base);
        if (why) return why;
        if (g.genre !== base.concept.genre || g.topic !== base.concept.topic) return 'An expansion keeps the base game’s genre and topic';
        if (g.franchiseId !== base.concept.franchiseId) return 'An expansion belongs to the base game’s franchise';
        if (g.monetization !== 'premium') return 'Expansion packs are sold as one-off purchases';
        if (!expansionSizeOk(base, g.size)) return 'An expansion can’t be bigger than its base game';
        const ok = expansionPlatforms(s, base);
        if (g.platforms.some((pid) => !ok.includes(pid))) return 'An expansion ships on the base game’s platforms';
      }
      const feats = [...new Set(g.features ?? [])];
      const featErr = featuresBlocked(s, feats, g.monetization);
      if (featErr) return featErr;
      if (feats.includes('cliffhanger') && (g.remasterOf || g.expansionOf)) return 'Cliffhangers are for new games and sequels';
      const featCost0 = feats.reduce((t, id) => t + money(FEATURE_BY_ID[id]!.cost ?? 0, s.day), 0);
      const home = s.company.homeRegion ?? 'na';
      const locs = [...new Set(g.localized ?? [])].filter((r) => r !== home && !(s.company.branches ?? []).includes(r));
      if (locs.some((r) => !REGION_BY_ID[r])) return 'Unknown region';
      if (locs.length && yr < LOC_YEAR) return `Localisation is available from ${LOC_YEAR}`;
      const locCost = locs.length * money(LOC_COST[g.size], s.day);
      const featCost = featCost0 + locCost;
      // dev kits
      const kitCost = g.platforms.filter((p) => !s.devkits.includes(p)).reduce((t, p) => t + devkitCost(s, p), 0);
      if (kitCost + featCost > 0 && kitCost + featCost > s.company.cash) return `Need ${fmtMoney(kitCost + featCost)} for dev kits, licences and localisation`;
      const deal = g.dealId ? s.offers.deals.find((d) => d.id === g.dealId) : undefined;
      if (g.dealId && !deal) return 'That publisher deal expired';
      if (!deal && !s.research.done.includes('biz_self_publishing') && yr >= 1983 && s.releaseOrder.length >= 1) {
        // Early on (before self-publishing research) small studios may still self-publish on computers only.
        const onlyComputers = g.platforms.every((p) => platformInfo(s, p)?.kind === 'computer');
        if (!onlyComputers) return 'Research Self-Publishing (or sign a publisher deal) to ship on consoles';
      }
      if (featCost > 0) spend(s, 'other_expense', featCost);
      for (const p of g.platforms)
        if (!s.devkits.includes(p)) {
          spend(s, 'devkits', devkitCost(s, p));
          s.devkits.push(p);
        }
      const id = newId(s, 'p');
      const proj: GameProject = {
        id,
        kind: 'game',
        concept: {
          name: g.name.trim().slice(0, 60),
          genre: g.genre,
          topic: g.topic,
          platforms: [...g.platforms],
          audience: g.audience,
          size: g.size,
          monetization: g.monetization,
          engineId: g.engineId,
          franchiseId: g.franchiseId,
          remasterOf: orig?.id,
          expansionOf: base?.id,
          ...(feats.length ? { features: feats } : {}),
          ...((g.priceTier === 'budget' || g.priceTier === 'premium') && priceTierAllowed({ monetization: g.monetization, expansionOf: base?.id, deal: g.dealId ? ({} as never) : undefined }) ? { priceTier: g.priceTier } : {}),
          ...(locs.length ? { localized: locs } : {}),
          ...((s.company.branches ?? []).length ? { branchLocalized: [...(s.company.branches ?? [])] } : {}),
          deal: deal ? { publisherId: deal.publisherId, advance: dealAdvanceFor(deal, g.size, s.day), royalty: deal.royalty, minScore: deal.minScore, deadlineDay: deal.deadlineDay, reach: deal.reach, marketingBudget: deal.marketingBudget } : undefined,
        },
        phase: 0,
        phaseDay: 0,
        phaseDays: [0, 1, 2].map((ph) => Math.max(4, Math.round(phaseLength(g.size, ph) * workShare({ remasterOf: orig?.id, expansionOf: base?.id, features: feats, localized: locs })))) as [number, number, number],
        focus: g.focus ?? defaultFocus(g.genre),
        points: { engine: 0, gameplay: 0, story: 0, level: 0, dialogue: 0, ai: 0, world: 0, graphics: 0, sound: 0 },
        design: 0,
        tech: 0,
        bugs: 0,
        bugsFixed: 0,
        crunch: false,
        cut: false,
        extraDays: 0,
        team: [...g.team],
        startDay: s.day,
        hype: (g.franchiseId ? Math.min(1, (s.franchises[g.franchiseId]!.fans / 200_000) * 0.5) : 0) + (g.franchiseId && !g.expansionOf && !g.remasterOf && cliffhangerPending(s, g.franchiseId) ? 0.6 : 0),
        campaigns: [],
        spent: kitCost,
        novelty: 0,
        awaitingGate: false,
      };
      s.projects[id] = proj;
      // this sequel claims the series' open cliffhanger
      if (g.franchiseId && !g.expansionOf && !g.remasterOf && cliffhangerPending(s, g.franchiseId)) {
        proj.paysCliffhanger = true;
        s.franchises[g.franchiseId]!.openCliffhanger = undefined;
      }
      assignTeam(s, id, g.team);
      if (deal) {
        earn(s, 'advances', proj.concept.deal!.advance);
        s.offers.deals = s.offers.deals.filter((d) => d.id !== deal.id);
      }
      return null;
    }
    case 'setFocus': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (a.phase < Math.min(2, p.phase)) return 'That phase is finished';
      const f = a.focus.map((x) => clamp(Math.round(x), 0, 100)) as Focus3;
      if (f[0] + f[1] + f[2] <= 0) return 'Focus cannot be all zero';
      p.focus[a.phase] = f;
      return null;
    }
    case 'continueGate': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      p.awaitingGate = false;
      return null;
    }
    case 'setTeam': {
      const p = s.projects[a.projectId];
      if (!p) return 'No such project';
      if (p.kind === 'game' && a.team.length > BALANCE.SIZE[p.concept.size].teamCap) return 'Team too large for this size';
      const te = teamValid(s, a.team, p.id);
      if (te) return te;
      for (const id of p.team) {
        const st = s.staff[id];
        if (st && !a.team.includes(id)) st.assignment = { kind: 'idle' };
      }
      p.team = [...a.team];
      assignTeam(s, p.id, a.team);
      return null;
    }
    case 'setCrunch': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      p.crunch = a.on;
      return null;
    }
    case 'delay': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      const weeks = clamp(Math.round(a.weeks), 1, BALANCE.DELAY_WEEKS_MAX);
      p.extraDays += weeks * 7;
      if (p.announcedDay !== undefined) {
        p.hype = Math.max(0, p.hype - 0.05 * weeks);
        pushNews(s, { category: 'studio', headline: `${p.concept.name} delayed by ${weeks} weeks`, tone: 'neutral' });
      }
      return null;
    }
    case 'cutFeatures': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game' || p.cut) return 'Can’t cut further';
      if (p.phase >= 3) return 'Too late to cut';
      if (p.crowdfund && p.crowdfund.end === undefined) return 'Not while the crowdfunding campaign is running';
      const ph = p.phase as 0 | 1 | 2;
      for (let i = ph; i < 3; i++) p.phaseDays[i as 0 | 1 | 2] = Math.max(4, Math.round(p.phaseDays[i as 0 | 1 | 2] * 0.75));
      p.cut = true;
      return null;
    }
    case 'announce': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (p.announcedDay !== undefined) return 'Already announced';
      p.announcedDay = s.day;
      p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + 0.1 + s.company.reputation / 250 + Math.log10(1 + s.company.fans) / 30);
      pushNews(s, { category: 'studio', headline: `${s.company.name} announces ${p.concept.name}`, tone: 'good' });
      return null;
    }
    case 'cancelProject': {
      const p = s.projects[a.projectId];
      if (!p) return 'No such project';
      for (const id of p.team) {
        const st = s.staff[id];
        if (st) {
          st.assignment = { kind: 'idle' };
          st.morale = clamp(st.morale - 8, 0, 100);
        }
      }
      delete s.projects[a.projectId];
      if (p.kind === 'game') docOnCancel(s, p);
      if (p.kind === 'game' && p.announcedDay !== undefined) addRep(s, -(2), 'Cancelled an announced game');
      if (p.kind === 'game' && p.crowdfund?.success) {
        addRep(s, -8, 'Cancelled a crowdfunded game');
        spend(s, 'other_expense', p.crowdfund.raised * 0.9); // the platform forces refunds
        s.company.fans = Math.round(s.company.fans * 0.95);
        pushNews(s, { category: 'studio', headline: `${p.concept.name} cancelled after raising ${fmtMoney(p.crowdfund.raised)}`, body: `${p.crowdfund.backers.toLocaleString('en-US')} backers are furious. “Where did our money go?”`, tone: 'bad' });
      } else if (p.kind === 'game' && p.crowdfund && p.crowdfund.end === undefined) addRep(s, -1, 'Pulled a crowdfunding campaign');
      if (p.kind === 'game' && p.earlyAccess) {
        addRep(s, -6, 'Abandoned an Early Access game');
        spend(s, 'other_expense', p.earlyAccess.net * 0.5); // refunds
        s.company.fans = Math.round(s.company.fans * 0.96);
        pushNews(s, { category: 'studio', headline: `${p.concept.name} abandoned in Early Access`, body: `${fmtUnits(p.earlyAccess.units)} players paid for a game that will never be finished. Refund requests are pouring in.`, tone: 'bad' });
      }
      if (p.kind === 'game' && p.concept.deal) {
        // the publisher wants its advance back — and won't forget
        (s.publisherTrust ??= {})[p.concept.deal.publisherId] = Math.max(-5, (s.publisherTrust[p.concept.deal.publisherId] ?? 0) - 3);
        spend(s, 'other_expense', p.concept.deal.advance);
        addRep(s, -2, 'Cancelled a published game');
      }
      if (p.kind === 'contract') {
        spend(s, 'other_expense', p.penalty);
        addRep(s, -1.5, 'Abandoned a contract');
      }
      return null;
    }
    case 'marketing': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (p.announcedDay === undefined) return 'Announce the game first';
      const ch = CHANNELS.find((x) => x.id === a.channel);
      const yr = fromDay(s.day).year;
      if (!ch || yr < ch.from || (ch.to !== undefined && yr > ch.to)) return 'Channel not available';
      if (ch.research && !s.research.done.includes(ch.research)) return `Research ${RESEARCH_BY_ID[ch.research]?.name} first`;
      const cost = money(ch.cost, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'marketing', cost);
      const used = p.campaigns.filter((x) => x.channel === ch.id).length;
      const dim = Math.pow(0.6, used) * Math.pow(0.85, p.campaigns.length);
      const war = 1 + (s.office.items.some((i) => i.item === 'marketing_board') ? 0.15 : 0);
      const audienceFit = ch.audience[p.concept.audience];
      const hype = ch.hype * dim * war * audienceFit;
      p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + hype);
      p.campaigns.push({ channel: ch.id, day: s.day, cost, hype });
      p.spent += cost;
      return null;
    }
    case 'tradeShow': {
      const show = TRADE_SHOWS.find((t) => t.id === a.show);
      const d = fromDay(s.day);
      if (!show || d.month !== show.month || d.year < show.from || (show.to !== undefined && d.year > show.to)) return 'That show isn’t on this month';
      const key = `show_${show.id}_${d.year}`;
      if (s.eventCooldowns[key]) return 'Already exhibited this year';
      const cost = money(show.booths[a.booth], s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'marketing', cost);
      s.eventCooldowns[key] = s.day;
      const announced = Object.values(s.projects).filter((p): p is GameProject => p.kind === 'game' && p.announcedDay !== undefined);
      for (const p of announced) p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + show.hype[a.booth] / Math.max(1, Math.sqrt(announced.length)));
      addRep(s, show.rep[a.booth], 'Trade show appearance');
      pushNews(s, { category: 'studio', headline: `${s.company.name} wows crowds at ${show.name}`, tone: 'good' });
      return null;
    }
    case 'hire': {
      const cand = s.candidates.find((x) => x.id === a.candidateId);
      if (!cand) return 'Candidate no longer available';
      const staffCount = Object.keys(s.staff).length;
      if (staffCount >= tierDef(s.office.tier).staffCap) return 'Office is at capacity — move to a bigger office';
      if (freeDesks(s) <= 0) return 'No free desk — place a desk first';
      const salary = Math.round(a.salary ?? cand.askSalary);
      if (salary < cand.askSalary * 0.85) return `${cand.name} won’t accept less than ${Math.round(cand.askSalary * 0.85)}`;
      const signing = salary / 12;
      if (s.company.cash < signing) return 'Not enough cash for the first month’s salary';
      const id = newId(s, 's');
      s.staff[id] = candidateToStaff(s, cand, id, salary);
      s.candidates = s.candidates.filter((x) => x.id !== cand.id);
      spend(s, 'recruiting', money(300, s.day));
      if (cand.fromRival) {
        const rv = s.rivals[cand.fromRival];
        if (rv) rv.quality = clamp(rv.quality - 0.01, 0.1, 1);
        addRep(s, -(1), 'Poached a rival developer');
        spend(s, 'recruiting', cand.askSalary * 0.25); // headhunter fee
        pushNews(s, { category: 'staff', headline: `${cand.name} defects from ${rv?.name ?? 'a rival'} to ${s.company.name}`, tone: 'neutral' });
      }
      s.progress.stats.staffHired += 1;
      assignDesks(s);
      c.out.push({ type: 'hired', staffId: id });
      return null;
    }
    case 'fire': {
      const st = s.staff[a.staffId];
      if (!st) return 'No such staff';
      if (st.role === 'founder') return 'You can’t fire yourself';
      if (st.intern) {
        // ending an internship early: no severance, not a layoff
        removeStaff(s, st.id);
        assignDesks(s);
        return null;
      }
      spend(s, 'salaries', st.salary / 12); // severance: one month
      maybeSpinOff(s, c.rng, st, 0.2);
      removeStaff(s, st.id);
      const recent = (s.eventCooldowns.__fires ?? 0) > s.day - 30 ? (s.eventCooldowns.__fireCount ?? 0) + 1 : 1;
      s.eventCooldowns.__fires = s.day;
      s.eventCooldowns.__fireCount = recent;
      if (recent >= 3) s.company.lastLayoffDay = s.day;
      for (const o of Object.values(s.staff)) o.morale = clamp(o.morale - 2, 0, 100);
      assignDesks(s);
      return null;
    }
    case 'fireMany': {
      if (!Array.isArray(a.staffIds)) return 'Pick people first';
      const all = [...new Set(a.staffIds)].map((id) => s.staff[id]).filter((st): st is NonNullable<typeof st> => !!st && st.role !== 'founder');
      if (!all.length) return 'Nobody to let go';
      for (const st of all.filter((x) => x.intern)) removeStaff(s, st.id); // interns just go home early
      const gone = all.filter((x) => !x.intern);
      if (!gone.length) {
        assignDesks(s);
        return null;
      }
      for (const st of gone) {
        spend(s, 'salaries', st.salary / 12); // severance: one month each
        maybeSpinOff(s, c.rng, st, 0.2);
        removeStaff(s, st.id);
      }
      s.company.lastLayoffDay = s.day;
      const hit = layoffMoraleHit(gone.length);
      for (const o of Object.values(s.staff)) o.morale = clamp(o.morale - hit, 0, 100);
      assignDesks(s);
      return null;
    }
    case 'setSalary': {
      const st = s.staff[a.staffId];
      if (!st || st.role === 'founder') return 'No such staff';
      const sal = Math.max(1000, Math.round(a.salary));
      if (sal > st.salary) {
        st.morale = clamp(st.morale + Math.min(15, ((sal - st.salary) / st.salary) * 60), 0, 100);
        st.loyalty = clamp(st.loyalty + Math.min(15, ((sal - st.salary) / st.salary) * 50), 0, 100);
      } else if (sal < st.salary) {
        st.morale = clamp(st.morale - Math.min(30, ((st.salary - sal) / st.salary) * 120), 0, 100);
        st.loyalty = clamp(st.loyalty - 15, 0, 100);
      }
      st.salary = sal;
      st.moraleWhy = undefined;
      return null;
    }
    case 'assign': {
      const st = s.staff[a.staffId];
      if (!st) return 'No such staff';
      if (st.assignment.kind === 'project') {
        const p = s.projects[st.assignment.id];
        if (p) p.team = p.team.filter((x) => x !== st.id);
      }
      st.assignment = a.to === 'research' ? { kind: 'research' } : { kind: 'idle' };
      return null;
    }
    case 'train': {
      const st = s.staff[a.staffId];
      if (!st) return 'No such staff';
      if (!s.research.done.includes('biz_training')) return 'Research the Training Programme first';
      if (st.assignment.kind === 'project') return 'Take them off their project first';
      if (st.assignment.kind === 'training') return `${st.name} is already in training`;
      if ((st.vacationDays ?? 0) > 0) return `${st.name} is on vacation`;
      const cost = money(2_500, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'training', cost);
      st.assignment = { kind: 'training' };
      st.trainingSkill = a.skill;
      const boost = s.office.items.some((i) => i.item === 'training_desk') ? 0.5 : 0;
      st.trainingDaysLeft = Math.round(28 / (1 + boost));
      return null;
    }
    case 'setSpec': {
      const st = s.staff[a.staffId];
      if (!st) return 'No such staff';
      if (st.level !== 'senior' && st.level !== 'lead' && st.role !== 'founder') return 'Only seniors and leads can specialise';
      if (st.spec) return 'Already specialised';
      st.spec = a.spec;
      return null;
    }
    case 'placeItem': {
      const def = ITEM_BY_ID[a.item];
      if (!def) return 'Unknown item';
      if (fromDay(s.day).year < def.year) return `Available from ${def.year}`;
      if (def.research && !s.research.done.includes(def.research)) return `Research ${RESEARCH_BY_ID[def.research]?.name} first`;
      const req = itemRequirement(s, def);
      if (req) return req;
      const cost = s.cheats?.freeBuild ? 0 : money(def.cost, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      const ok = canPlace(s, def, a.floor, a.x, a.y, a.rot);
      if (!ok.ok) return ok.reason ?? 'Can’t place there';
      spend(s, 'office', cost);
      s.office.items.push({ id: `i${s.office.nextItemId++}`, item: a.item, floor: a.floor, x: a.x, y: a.y, rot: a.rot, placedDay: s.day, paid: cost });
      touchOffice(s);
      assignDesks(s);
      return null;
    }
    case 'moveItem': {
      const it = s.office.items.find((i) => i.id === a.id);
      if (!it) return 'No such item';
      const ok = canPlace(s, ITEM_BY_ID[it.item], a.floor, a.x, a.y, a.rot, it.id);
      if (!ok.ok) return ok.reason ?? 'Can’t place there';
      it.floor = a.floor;
      it.x = a.x;
      it.y = a.y;
      it.rot = a.rot;
      touchOffice(s);
      assignDesks(s);
      return null;
    }
    case 'undoPlace': {
      // take back today's most recent placement, at full refund (the expense is reversed, not booked as income)
      const it = [...s.office.items].reverse().find((i) => i.placedDay === s.day);
      if (!it) return 'Nothing placed today to undo';
      s.office.items = s.office.items.filter((i) => i.id !== it.id);
      const paid = it.paid ?? 0;
      s.company.cash += paid;
      const led = s.finance.ledger[s.finance.ledger.length - 1];
      if (led?.expense.office) led.expense.office = Math.max(0, led.expense.office - paid);
      touchOffice(s);
      assignDesks(s);
      return null;
    }
    case 'sellItem': {
      const it = s.office.items.find((i) => i.id === a.id);
      if (!it) return 'No such item';
      const def = ITEM_BY_ID[it.item];
      s.office.items = s.office.items.filter((i) => i.id !== it.id);
      earn(s, 'asset_sales', money(def.cost, s.day) * 0.4);
      touchOffice(s);
      assignDesks(s);
      return null;
    }
    case 'moveOffice': {
      if (a.tier !== s.office.tier + 1 && a.tier !== s.office.tier - 1) return 'Move one tier at a time';
      const t = tierDef(a.tier);
      if (t.tier !== a.tier) return 'No such office';
      const free = !!s.cheats?.freeBuild;
      if (!free && s.company.reputation < t.minReputation && a.tier > s.office.tier) return `Needs reputation ${t.minReputation}`;
      const cost = free ? 0 : money(t.moveCost, s.day);
      if (a.tier > s.office.tier && s.company.cash < cost) return 'Not enough cash';
      if (a.tier < s.office.tier && Object.keys(s.staff).length > t.staffCap) return 'Too many staff for a smaller office';
      if (a.tier > s.office.tier) spend(s, 'office', cost);
      // keep items that fit on the new grid; refund the rest at 40%
      const kept = [];
      const old = s.office.items;
      s.office = { tier: a.tier, items: [], nextItemId: s.office.nextItemId, ...(s.office.style ? { style: s.office.style } : {}) };
      for (const it of old) {
        const def = ITEM_BY_ID[it.item];
        // try original spot, else first free spot on any floor
        let placed = false;
        if (canPlace(s, def, Math.min(it.floor, t.floors - 1), it.x, it.y, it.rot).ok) {
          s.office.items.push({ ...it, floor: Math.min(it.floor, t.floors - 1) });
          placed = true;
        } else {
          outer: for (let f = 0; f < t.floors; f++)
            for (let y = 0; y < t.h; y++)
              for (let x = 0; x < t.w; x++)
                if (canPlace(s, def, f, x, y, it.rot).ok) {
                  s.office.items.push({ ...it, floor: f, x, y });
                  placed = true;
                  break outer;
                }
        }
        if (placed) kept.push(it.id);
        else earn(s, 'asset_sales', money(def.cost, s.day) * 0.4);
      }
      touchOffice(s);
      assignDesks(s);
      pushNews(s, { category: 'studio', headline: `${s.company.name} moves into ${aOrAn(t.name)}`, tone: 'good' });
      return null;
    }
    case 'research':
    case 'queueResearch': {
      const def = RESEARCH_BY_ID[a.id];
      if (!def) return 'Unknown research';
      const av = researchAvailable(s, def);
      if (!av.ok && !(a.type === 'queueResearch' && av.why?.startsWith('Requires'))) return av.why ?? 'Unavailable';
      if (s.research.active === def.id || s.research.queue.includes(def.id)) return 'Already queued';
      const cost = researchCost(s, def);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'research', cost);
      if (a.type === 'research' && !s.research.active) {
        s.research.active = def.id;
        s.research.progress = 0;
      } else s.research.queue.push(def.id);
      return null;
    }
    case 'cancelResearch': {
      const def = s.research.active ? RESEARCH_BY_ID[s.research.active] : undefined;
      if (!def) return 'Nothing to stop';
      // half the budget comes back (booked as reduced research spending, not as revenue)
      const refund = Math.round(researchCost(s, def) * 0.5);
      s.company.cash += refund;
      const led = s.finance.ledger[s.finance.ledger.length - 1];
      if (led) led.expense.research = Math.max(0, (led.expense.research ?? 0) - refund);
      s.research.active = null;
      s.research.progress = 0;
      return null;
    }
    case 'buildEngine': {
      if (!a.name.trim()) return 'Name your engine';
      const feats = [...new Set(a.features)].filter((f) => s.research.done.includes(f) && RESEARCH_BY_ID[f]?.engineTech);
      if (!feats.length) return 'Pick at least one researched feature';
      if (!a.team.length) return 'Assign at least one programmer';
      const te = teamValid(s, a.team);
      if (te) return te;
      const cost = money(2_000 + engineTechFor(feats) * 2_500, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'research', cost);
      const id = newId(s, 'p');
      s.projects[id] = { id, kind: 'engine', name: a.name.trim().slice(0, 40), features: feats, needPoints: engineBuildPoints(feats, s.day), points: 0, team: [...a.team], startDay: s.day, cost };
      assignTeam(s, id, a.team);
      return null;
    }
    case 'licenseEngine': {
      const def = ENGINE_BY_ID[a.engineDef];
      const yr = fromDay(s.day).year;
      if (!def || yr < def.year || (def.retired !== undefined && yr > def.retired)) return 'Engine not available';
      if (Object.values(s.engines).some((e) => e.licensedFrom === def.id)) return 'Already licensed';
      const fee = Math.round(def.fee);
      if (s.company.cash < fee) return 'Not enough cash';
      spend(s, 'devkits', fee);
      const id = newId(s, 'e');
      s.engines[id] = { id, name: def.name, features: [], tech: def.tech, maturity: 0.6, gamesShipped: 0, builtDay: s.day, licensedFrom: def.id, royalty: def.royalty, licensees: 0 };
      return null;
    }
    case 'licenseOut': {
      const e = s.engines[a.engineId];
      if (!e || e.licensedFrom) return 'Can only license your own engines';
      if (!s.research.done.includes('biz_engine_licensing')) return 'Research Engine Licensing first';
      if (e.licensees > 0) return 'Already on the market';
      if (e.openSourced) return 'It’s open source now';
      e.licensees = Math.max(1, Math.round(s.company.reputation / 25));
      pushNews(s, { category: 'studio', headline: `${e.name} engine now available for licensing`, tone: 'good' });
      return null;
    }
    case 'acceptContract': {
      const o = s.offers.contracts.find((x) => x.id === a.offerId);
      if (!o) return 'Offer expired';
      if (!a.team.length) return 'Assign someone';
      const te = teamValid(s, a.team);
      if (te) return te;
      const id = newId(s, 'p');
      s.projects[id] = { id, kind: 'contract', title: o.title, client: o.client, needDesign: o.needDesign, needTech: o.needTech, design: 0, tech: 0, pay: o.pay, penalty: o.penalty, deadlineDay: s.day + o.days, startDay: s.day, team: [...a.team], bugs: 0 };
      assignTeam(s, id, a.team);
      s.offers.contracts = s.offers.contracts.filter((x) => x.id !== o.id);
      return null;
    }
    case 'takeLoan': {
      const months = clamp(Math.round(a.months), 6, 120);
      if (a.amount > creditLimit(s)) return 'Above your credit limit';
      const l = takeLoan(s, Math.round(a.amount), months);
      return l ? null : 'Loan refused';
    }
    case 'repayLoan':
      return repayLoan(s, a.loanId) ? null : 'Not enough cash to repay';
    case 'ipo': {
      const e = ipoEligible(s);
      if (!e.ok) return e.why;
      doIPO(s, a.pct);
      const ipoNews = pushNews(s, { category: 'studio', headline: `${s.company.name} goes public!`, body: `Shares open at ${fmtMoney(s.finance.stock?.price ?? 0)}. ${s.company.founderName} rings the opening bell.`, tone: 'good' });
      c.out.push({ type: 'news', newsId: ipoNews.id, major: true });
      return null;
    }
    case 'openBranch': {
      const why = branchBlocked(s, a.region);
      if (why) return why;
      spend(s, 'office', money(BRANCH.open, s.day));
      (s.company.branches ??= []).push(a.region);
      pushNews(s, { category: 'studio', headline: `${s.company.name} opens a studio in ${REGION_BY_ID[a.region].name}`, body: 'Every game is now translated there for free — and the local team knows what players want.', tone: 'good' });
      return null;
    }
    case 'closeBranch':
      if (!(s.company.branches ?? []).includes(a.region)) return 'No branch there';
      s.company.branches = (s.company.branches ?? []).filter((r) => r !== a.region);
      pushNews(s, { category: 'studio', headline: `${s.company.name} closes its ${REGION_BY_ID[a.region].name} studio`, tone: 'neutral' });
      return null;
    case 'setOfficeStyle':
      if (!['auto', 'wood', 'carpet', 'concrete', 'tiles', 'checker'].includes(a.floor)) return 'Unknown floor';
      if (a.wall !== undefined && !/^#[0-9a-fA-F]{6}$/.test(a.wall)) return 'Invalid colour';
      s.office.style = { floor: a.floor, ...(a.wall ? { wall: a.wall } : {}) };
      return null;
    case 'setMentor': {
      const st = s.staff[a.staffId];
      if (!st) return 'No such staff';
      if (a.mentorId === null) {
        st.mentorId = undefined;
        invalidateMentees(s);
        return null;
      }
      const m = s.staff[a.mentorId];
      if (!m) return 'No such mentor';
      const why = mentorBlocked(s, st, m);
      if (why) return why;
      st.mentorId = m.id;
      invalidateMentees(s);
      return null;
    }
    case 'coDevelop':
      return signCodev(s, a.projectId, a.rivalId);
    case 'setMascot': {
      const m = a.mascot;
      if (!m || !['bear', 'cat', 'robot', 'dragon', 'blob', 'bird'].includes(m.kind) || !['none', 'cap', 'headphones', 'star', 'crown'].includes(m.acc) || !/^#[0-9a-f]{6}$/i.test(m.color)) return 'Pick a mascot';
      s.company.mascot = { kind: m.kind, color: m.color, acc: m.acc };
      return null;
    }
    case 'setReviewPolicy': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (!['early', 'launch', 'none'].includes(a.policy)) return 'Pick a review policy';
      if (p.phase < 2) return 'Decide on review copies during polish';
      p.reviewPolicy = a.policy;
      return null;
    }
    case 'foundCommunity':
      return foundCommunity(s);
    case 'setModeration':
      return setModeration(s, a.level);
    case 'trailerCut': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (p.announcedDay === undefined) return 'Announce the game first';
      if (p.trailerCut !== undefined) return 'Already cut a trailer for this one';
      if (!finite(a.points) || a.points < 0) return 'Invalid result';
      const pts = Math.min(8, Math.floor(a.points));
      p.trailerCut = pts;
      if (pts >= 8) s.progress.stats.perfectTrailers = (s.progress.stats.perfectTrailers ?? 0) + 1;
      // a trailer can only show what's there: hype scales with the game's projected score
      const est = qualityToScore(gameQuality(s, p, true).total);
      p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + pts * 0.05 * clamp(est / 70, 0.4, 1.2) * (s.research.done.includes('biz_trailer_studio') ? 1.3 : 1));
      if (pts >= 7) pushNews(s, { category: 'studio', headline: `The ${p.concept.name} trailer goes viral`, body: 'Millions of views overnight. People can’t stop talking about it.', tone: 'good' });
      return null;
    }
    case 'bugBash': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (p.phase < 2) return 'Bug bashes happen during polish';
      if (p.bugBashed) return 'Already bashed this one';
      if (!finite(a.hits) || a.hits < 0) return 'Invalid result';
      p.bugBashed = true;
      s.progress.stats.bestBash = Math.max(s.progress.stats.bestBash ?? 0, Math.min(45, Math.floor(a.hits)));
      p.bugs *= 1 - Math.min(0.25, Math.floor(a.hits) * 0.01);
      s.company.moraleMods.push({ v: 2, until: s.day + 21, label: 'Bug bash' });
      return null;
    }
    case 'fanCon': {
      const f = s.franchises[a.franchiseId];
      if (!f) return 'No such series';
      const why = fanConBlocked(s, f);
      if (why) return why;
      spend(s, 'marketing', fanConCost(s, f));
      f.lastCon = s.day;
      f.fans = Math.round(f.fans + Math.min(f.fans * 0.08, 400_000));
      if (!s.company.moraleMods.some((m) => m.label.endsWith(' Con') && m.until > s.day)) s.company.moraleMods.push({ v: 3, until: s.day + 45, label: `${f.name} Con` });
      for (const p of Object.values(s.projects)) if (p.kind === 'game' && p.concept.franchiseId === f.id) p.hype = Math.max(p.hype, Math.min(BALANCE.HYPE_MAX, p.hype + 0.3));
      pushNews(s, { category: 'studio', headline: `Thousands of fans pack ${f.name} Con`, body: 'Cosplay, panels, a surprise announcement — and a very long merch queue.', tone: 'good' });
      return null;
    }
    case 'negotiateDeal': {
      const d = s.offers.deals.find((x) => x.id === a.dealId);
      if (!d) return 'That offer is gone';
      if (d.negotiated) return 'You already negotiated this one';
      if (a.ask !== 'advance' && a.ask !== 'royalty') return 'Ask for a bigger advance or a better royalty';
      if (a.ask === 'royalty' && d.royalty >= 0.6) return 'That royalty is already as high as they go';
      d.negotiated = true;
      if (c.rng.chance(negotiateOdds(s))) {
        if (a.ask === 'advance') d.advance = Math.round(d.advance * 1.25);
        else d.royalty = Math.min(0.6, d.royalty + 0.05);
        pushNews(s, { category: 'studio', headline: `${COMPANY_BY_ID[d.publisherId]?.name ?? 'The publisher'} improves its offer`, tone: 'good' });
      } else {
        s.offers.deals = s.offers.deals.filter((x) => x.id !== d.id);
        (s.offers.snubbed ??= {})[d.publisherId] = s.day + 270; // they won't call for a while
        pushNews(s, { category: 'studio', headline: `${COMPANY_BY_ID[d.publisherId]?.name ?? 'The publisher'} walks away from the table`, tone: 'bad' });
      }
      return null;
    }
    case 'crowdfund': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      return startCrowdfund(c, p, a.tier);
    }
    case 'mediaDeal':
      return signMediaDeal(s, a.franchiseId, a.kind, a.control);
    case 'checkIn':
      return checkIn(s, a.staffId);
    case 'giveTalk':
      return giveTalk(c, a.staffId, a.releaseId);
    case 'openSourceEngine':
      return openSourceEngine(s, a.engineId);
    case 'pinFanArt':
      return pinFanArt(s, a.id, a.on);
    case 'readFanMail':
      for (const m of s.fanMail ?? []) m.read = true;
      return null;
    case 'earlyAccess': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      return startEarlyAccess(s, p);
    }
    case 'raiseFunding':
      return raiseFunding(s);
    case 'copyFloor': {
      const t = tierDef(s.office.tier);
      if (!finite(a.from, a.to) || a.from === a.to || a.from < 0 || a.to < 0 || a.from >= t.floors || a.to >= t.floors) return 'Pick two different floors';
      const src = s.office.items.filter((i) => i.floor === a.from);
      if (!src.length) return 'That floor is empty';
      const total = copyFloorCost(s, a.from);
      if (s.company.cash < total) return `Copying this floor costs ${fmtMoney(total)}`;
      let placed = 0;
      let skipped = 0;
      for (const it of src) {
        const def = ITEM_BY_ID[it.item];
        const cost = s.cheats?.freeBuild ? 0 : money(def.cost, s.day);
        if (s.company.cash < cost || itemRequirement(s, def) || !canPlace(s, def, a.to, it.x, it.y, it.rot).ok) {
          skipped++;
          continue;
        }
        spend(s, 'office', cost);
        s.office.items.push({ id: `i${s.office.nextItemId++}`, item: it.item, floor: a.to, x: it.x, y: it.y, rot: it.rot, placedDay: s.day, paid: cost });
        placed++;
      }
      touchOffice(s);
      assignDesks(s);
      if (!placed) return skipped ? 'Nothing fits there (or not enough cash)' : 'Nothing to copy';
      c.out.push({ type: 'toast', text: `Copied ${placed} item${placed === 1 ? '' : 's'} to floor ${a.to + 1}${skipped ? ` (${skipped} didn’t fit or couldn’t be afforded)` : ''}`, tone: 'good' });
      return null;
    }
    case 'liveEvent':
      return runLiveEvent(s, a.releaseId);
    case 'teamRetreat':
      return teamRetreat(s);
    case 'setValues':
      if (!Array.isArray(a.values)) return 'Invalid values';
      return setValues(s, a.values);
    case 'buyback': {
      const st = s.finance.stock;
      if (!st) return 'Not public';
      const n = Math.min(Math.round(a.shares), st.shares - st.founderShares);
      const cost = n * st.price * 1.05;
      if (n <= 0 || s.company.cash < cost) return 'Not enough cash';
      s.company.cash -= Math.round(cost);
      st.founderShares += n;
      st.price *= 1 + 0.15 * (n / st.shares);
      return null;
    }
    case 'acquire': {
      const t = s.offers.acquisitions.find((x) => x.id === a.targetId);
      const r = s.rivals[a.targetId];
      if (!t || !r || !r.alive) return 'Target no longer available';
      if (s.company.cash < t.price) return 'Not enough cash';
      spend(s, 'acquisitions', t.price);
      r.ownedByPlayer = true;
      s.subsidiaries[r.id] = {
        id: r.id,
        name: r.name,
        origin: r.id,
        staff: r.staff,
        quality: r.quality,
        genres: r.genres,
        budget: 'normal',
        nextReleaseDay: s.day + 180,
        releases: 0,
        revenue: 0,
        bought: s.day,
      };
      s.offers.acquisitions = s.offers.acquisitions.filter((x) => x.id !== t.id);
      s.progress.stats.acquisitions += 1;
      // Real companies bring their franchises
      if (!r.procedural) adoptFranchises(s, r.id);
      const acqNews = pushNews(s, { category: 'studio', headline: `${s.company.name} acquires ${r.name}`, body: `A ${fmtMoney(t.price)} deal: their studio, their people and their games are now part of ${s.company.name}.`, tone: 'good' });
      c.out.push({ type: 'news', newsId: acqNews.id, major: true });
      addRep(s, 3, 'Acquired a studio');
      return null;
    }
    case 'setSubsidiary': {
      const sub = s.subsidiaries[a.id];
      if (!sub) return 'No such subsidiary';
      sub.budget = a.budget;
      sub.focusGenre = a.focusGenre;
      return null;
    }
    case 'sellFranchise': {
      const f = s.franchises[a.franchiseId];
      if (!f) return 'No such franchise';
      if (Object.values(s.projects).some((p) => p.kind === 'game' && p.concept.franchiseId === f.id)) return 'A sequel is in development';
      if ((s.mediaDeals ?? []).some((d) => d.franchiseId === f.id && d.outcome === undefined)) return 'A licensing deal is still in production';
      const price = Math.max(money(5_000, s.day), (f.fans * 4 * (f.bestScore / 100) * inflation(s.day)) * 0.8);
      earn(s, 'asset_sales', price);
      delete s.franchises[f.id];
      pushNews(s, { category: 'studio', headline: `${s.company.name} sells the ${f.name} IP`, tone: 'neutral' });
      void ipValue;
      return null;
    }
    case 'resolveEvent':
      return resolveEvent(c, a.uid, a.option) ? null : 'Event no longer available';
    case 'setPolicy': {
      if (a.salaryPolicy) s.company.policies.salaryPolicy = a.salaryPolicy;
      if (a.remote !== undefined) s.company.policies.remote = a.remote;
      if (a.fourDayWeek !== undefined) s.company.policies.fourDayWeek = a.fourDayWeek;
      if (a.wellness !== undefined) s.company.policies.wellness = !!a.wellness;
      if (a.interns !== undefined) s.company.policies.interns = !!a.interns;
      if (a.charity !== undefined) {
        if (![0, 1, 5].includes(a.charity)) return 'Pick 0%, 1% or 5%';
        const was = s.company.policies.charity ?? 0;
        if (a.charity < was || !a.charity) s.company.charitySince = undefined; // breaking a pledge starts the clock over
        if (a.charity > 0 && s.company.charitySince === undefined) s.company.charitySince = s.day;
        s.company.policies.charity = a.charity;
        s.company.charityOwed = Math.max(s.company.charityOwed ?? 0, a.charity) as 0 | 1 | 5; // a pledge held this month is honoured
      }
      if (a.parentalLeave !== undefined) {
        if (!['minimal', 'standard', 'generous'].includes(a.parentalLeave)) return 'Unknown parental leave policy';
        s.company.policies.parentalLeave = a.parentalLeave;
      }
      if (a.autoResearch !== undefined) s.company.policies.autoResearch = !!a.autoResearch;
      if (a.autoVacation !== undefined) s.company.policies.autoVacation = !!a.autoVacation;
      if (a.autoQueue !== undefined) s.company.policies.autoQueue = !!a.autoQueue;
      for (const st of Object.values(s.staff)) st.moraleWhy = undefined;
      return null;
    }
    case 'setRecruiting':
      s.company.recruiting = clamp(Math.round(a.level), 0, 3);
      return null;
    case 'buyDevkit': {
      if (s.devkits.includes(a.platform)) return 'Already owned';
      const pl = platformInfo(s, a.platform);
      if (!pl || !isPlatformAvailable(s, pl)) return 'Platform not available';
      const cost = devkitCost(s, a.platform);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'devkits', cost);
      s.devkits.push(a.platform);
      return null;
    }
    case 'continueEndless':
      if (s.status !== 'retired' || s.endReason?.startsWith('Retired')) return 'Only available when the story ends';
      s.settings.endless = true;
      s.status = 'running';
      delete s.endReason;
      return null;
    case 'retire':
      s.status = 'retired';
      s.endReason = `Retired in ${fromDay(s.day).year}.`;
      c.out.push({ type: 'gameOver', reason: s.endReason });
      return null;
    case 'setAutopause':
      s.settings.autopause[a.key] = a.on;
      if (a.key === 'gates' && !a.on) for (const p of Object.values(s.projects)) if (p.kind === 'game') p.awaitingGate = false;
      return null;
    case 'tutorial':
      s.progress.tutorialStep = a.step;
      return null;
    case 'marketResearch': {
      const key = `${a.genre}|${a.topic}`;
      const list = (s.progress.researchedCombos ??= []);
      if (list.includes(key)) return 'Already researched';
      const cost = marketResearchCost(s);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'research', cost);
      list.push(key);
      return null;
    }
    case 'secondaryOffering': {
      const st = s.finance.stock;
      if (!st) return 'Not public';
      const raised = secondaryOffering(s, Math.min(0.2, Math.max(0.02, a.pct)));
      if (raised <= 0) return 'No shares left to sell';
      pushNews(s, { category: 'studio', headline: `${s.company.name} raises ${fmtMoney(raised)} in a share sale`, tone: 'neutral' });
      return null;
    }
    case 'patchGame': {
      const rel = s.releases[a.releaseId];
      if (!rel) return 'No such game';
      const why = canPatch(s, rel);
      if (why) return why;
      const cost = patchCost(s, rel);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'other_expense', cost);
      const gain = applyPatch(s, rel);
      communityNudge(s, 4);
      pushNews(s, { category: 'studio', headline: `Patch for ${rel.name} fixes bugs (user score +${gain})`, tone: 'good' });
      return null;
    }
    case 'cheat': {
      if (!a.cheat || typeof a.cheat !== 'object') return 'Unknown cheat';
      if (a.cheat.op !== 'officeTier') return applyCheat(c, a.cheat);
      const target = a.cheat.tier;
      if (!finite(target) || tierDef(target).tier !== target) return 'No such office';
      if (Object.keys(s.staff).length > tierDef(target).staffCap) return 'Too many staff for that office';
      markCheated(s);
      const prev = s.cheats?.freeBuild;
      s.cheats = { ...s.cheats, freeBuild: true };
      try {
        while (s.office.tier !== target) {
          const e = apply(c, { type: 'moveOffice', tier: s.office.tier + (target > s.office.tier ? 1 : -1) });
          if (e) return e;
        }
      } finally {
        s.cheats = { ...s.cheats, freeBuild: prev };
        if (!prev) delete s.cheats.freeBuild;
      }
      return null;
    }
    case 'foundLeague': {
      if (!(a.tier in LEAGUE_TIERS)) return 'Pick a league tier';
      const rel = s.releases[a.releaseId];
      const why = canFoundLeague(s, rel);
      if (why) return why;
      const name = (a.name ?? '').trim().slice(0, 40);
      if (!name) return 'Give your league a name';
      const cost = leagueSetupCost(s, a.tier);
      if (s.company.cash < cost) return `Setting up costs ${fmtMoney(cost)}`;
      foundLeague(c, rel!, a.tier, name);
      return null;
    }
    case 'closeLeague': {
      const lg = (s.leagues ?? []).find((l) => l.id === a.id && l.status === 'live');
      if (!lg) return 'No such league';
      closeLeague(s, lg);
      return null;
    }
    case 'setIdentity': {
      if (a.name !== undefined) {
        const n = String(a.name).trim().slice(0, 40);
        if (!n) return 'Your studio needs a name';
        s.company.name = n;
      }
      if (a.color !== undefined) {
        if (!/^#[0-9a-f]{6}$/i.test(a.color)) return 'Pick a colour';
        s.company.color = a.color;
      }
      if (a.shape !== undefined && !['rounded', 'circle', 'shield', 'hex'].includes(a.shape)) return 'Unknown shape';
      if (a.emblem !== undefined && a.emblem !== null && !/^[a-z_]{2,20}$/.test(a.emblem)) return 'Unknown emblem';
      const logo = { ...s.company.logo };
      if (a.shape !== undefined) logo.shape = a.shape;
      if (a.emblem === null) delete logo.emblem;
      else if (a.emblem !== undefined) logo.emblem = a.emblem;
      s.company.logo = logo;
      return null;
    }
    case 'furnishDesks': {
      const yr = fromDay(s.day).year;
      const desks = Object.values(ITEM_BY_ID).filter((i) => i.category === 'desk' && i.year <= yr && (!i.research || s.research.done.includes(i.research)));
      const def = desks[desks.length - 1];
      if (!def) return 'No desks available yet';
      assignDesks(s);
      const extra = Math.max(0, Math.min(200, Math.round(Number(a.extra) || 0)));
      let need = Object.values(s.staff).filter((st) => !st.deskId).length + Math.max(0, extra - freeDesks(s));
      if (need <= 0) return extra ? 'You already have enough free desks' : 'Everyone already has a desk';
      const cost = s.cheats?.freeBuild ? 0 : money(def.cost, s.day);
      const t = tierDef(s.office.tier);
      let placed = 0;
      // Crowding is the number of other desks within two tiles of a desk (penalties start above 3).
      // Place in passes of increasing allowed crowding so desks spread over every floor before any area
      // gets dense, and never push an existing desk past the pass's limit.
      const W = t.w;
      const anchors = Array.from({ length: t.floors }, () => new Uint8Array(t.w * t.h));
      const crowd = Array.from({ length: t.floors }, () => new Uint8Array(t.w * t.h));
      const bump = (f: number, x: number, y: number) => {
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if ((dx || dy) && xx >= 0 && yy >= 0 && xx < t.w && yy < t.h) crowd[f]![yy * W + xx]! += 1;
          }
      };
      for (const it of s.office.items)
        if (ITEM_BY_ID[it.item].category === 'desk' && it.floor < t.floors) {
          anchors[it.floor]![it.y * W + it.x] = 1;
          bump(it.floor, it.x, it.y);
        }
      const fits = (f: number, x: number, y: number, limit: number) => {
        if (crowd[f]![y * W + x]! > limit) return false;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if ((dx || dy) && xx >= 0 && yy >= 0 && xx < t.w && yy < t.h && anchors[f]![yy * W + xx] && crowd[f]![yy * W + xx]! + 1 > Math.max(limit, 3)) return false;
          }
        return true;
      };
      outer: for (let limit = 0; limit <= 6; limit++)
        for (let y = 1; y < t.h - 1; y++)
          for (let x = 0; x < t.w; x++)
            for (let f = 0; f < t.floors; f++) {
              if (need <= 0 || s.company.cash < cost) break outer;
              if (!fits(f, x, y, limit) || !canPlace(s, def, f, x, y, 0).ok) continue;
              if (cost) spend(s, 'office', cost);
              s.office.items.push({ id: `i${s.office.nextItemId++}`, item: def.id, floor: f, x, y, rot: 0 });
              anchors[f]![y * W + x] = 1;
              bump(f, x, y);
              placed += 1;
              need -= 1;
            }
      if (!placed) return s.company.cash < cost ? 'Not enough cash for a desk' : 'No room for more desks — move to a bigger office or clear some space';
      touchOffice(s);
      assignDesks(s);
      return null;
    }
    case 'focusTest': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      if (p.phase > 2) return 'Too late for a focus test';
      const phase = p.phase;
      if (p.focusTest?.phase === phase) return 'Already focus-tested this phase';
      const cost = focusTestCost(s, p.concept.size);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'research', cost);
      const est = qualityToScore(gameQuality(s, p, true).total);
      // which of this phase's areas is furthest below what the genre wants?
      const g = GENRE_BY_ID[p.concept.genre];
      const areas = PHASE_AREAS[phase]!;
      const raw = p.focus[phase as 0 | 1 | 2];
      const fsum = raw.reduce((t, v) => t + v, 0) || 1;
      const focus = raw.map((v) => (v / fsum) * 100);
      const total = areas.reduce((t, ar) => t + (g.ideal[ar] ?? 1), 0);
      let worst: { area: string; gap: number } | null = null;
      areas.forEach((ar, i) => {
        const gap = ((g.ideal[ar] ?? 1) / total) * 100 - (focus[i] ?? 33);
        if (gap > 6 && (!worst || gap > worst.gap)) worst = { area: ar, gap };
      });
      p.focusTest = { phase, predicted: clamp(Math.round(est + c.rng.normal(0, 4)), 1, 100), ...(worst ? { wantMore: (worst as { area: string }).area } : {}) };
      return null;
    }
    case 'openBeta': {
      const p = s.projects[a.projectId];
      if (!p || p.kind !== 'game') return 'No such game';
      const why = betaBlocked(s, p);
      if (why) return why;
      const cost = betaCost(s, p);
      spend(s, 'servers', cost);
      p.extraDays += BETA_DAYS;
      p.bugs *= 0.75;
      p.hype = Math.min(BALANCE.HYPE_MAX, p.hype + 0.15);
      const est = qualityToScore(gameQuality(s, p, true).total);
      p.beta = { day: s.day, predicted: clamp(Math.round(est + c.rng.normal(0, 2)), 1, 100) };
      pushNews(s, { category: 'studio', headline: `${p.concept.name} opens a public beta`, body: `Players are hunting bugs, and the buzz is building. Early impressions suggest a score around ${p.beta.predicted}.`, tone: 'good' });
      return null;
    }
    case 'runSale': {
      const rel = s.releases[a.releaseId];
      if (!rel) return 'No such game';
      if (!SALE_DISCOUNTS.includes(a.discount)) return 'Pick 25%, 50% or 75% off';
      const why = canRunSale(s, rel);
      if (why) return why;
      const extra = applySale(s, rel, a.discount);
      pushNews(s, { category: 'studio', headline: `${rel.name} is ${Math.round(a.discount * 100)}% off this week`, body: `Storefronts expect around ${fmtUnits(extra)} extra copies.`, tone: 'neutral' });
      return null;
    }
    case 'portGame': {
      const rel = s.releases[a.releaseId];
      if (!rel) return 'No such game';
      if (rel.concept.platforms.includes(a.platform)) return 'Already on that platform';
      const pl = platformInfo(s, a.platform);
      if (!pl || !isPlatformAvailable(s, pl)) return 'Platform not available';
      if (s.day - rel.day > 365 * 4) return 'Too old to port profitably';
      if (rel.concept.monetization === 'subscription') return 'Subscription games can’t be ported';
      if (!rel.concept.deal && pl.kind !== 'computer' && !s.research.done.includes('biz_self_publishing')) return 'Research Self-Publishing to put your games on consoles yourself';
      const kit = s.devkits.includes(a.platform) ? 0 : devkitCost(s, a.platform);
      const cost = portCost(s, rel) + kit;
      if (s.company.cash < cost) return 'Not enough cash';
      if (kit) s.devkits.push(a.platform);
      spend(s, 'devkits', kit);
      spend(s, 'other_expense', portCost(s, rel));
      // an 'exclusive' that's ported within a year wasn't really one
      if (rel.exclusiveBonus && s.day - rel.day < 365 && s.partners) {
        const m = rel.exclusiveBonus.maker;
        s.partners[m] = Math.max(0, (s.partners[m] ?? 50) - rel.exclusiveBonus.amount * 1.5);
        rel.exclusiveBonus = undefined;
      }
      applyPort(s, rel, a.platform);
      pushNews(s, { category: 'studio', headline: `${rel.name} is out now on ${pl.name}`, tone: 'good' });
      return null;
    }
    case 'rerelease': {
      const rel = s.releases[a.releaseId];
      if (!rel) return 'No such game';
      const why = rereleaseBlocked(s, rel);
      if (why) return why;
      if (rel.concept.platforms.includes(a.platform)) return 'Already on that platform';
      const pl = platformInfo(s, a.platform);
      if (!pl || !isPlatformAvailable(s, pl)) return 'Platform not available';
      const cost = rereleaseCost(s, rel);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'other_expense', cost);
      applyRerelease(s, rel, a.platform);
      pushNews(s, { category: 'studio', headline: `Classic ${rel.name} returns on ${pl.name}`, body: 'A whole new generation discovers it — and old fans buy it again.', tone: 'good' });
      return null;
    }
    case 'designConsole': {
      const why = canDesignConsole(s);
      if (why) return why;
      if (a.kind !== 'console' && a.kind !== 'handheld') return 'Invalid hardware type';
      if (!['budget', 'standard', 'premium'].includes(a.tier)) return 'Invalid tier';
      if (!MARKETING[a.marketing]) return 'Invalid marketing plan';
      const name = a.name.trim().slice(0, 40);
      if (!name) return 'Give your hardware a name';
      const spec = consoleSpec(s, a.kind, a.tier);
      const mkt = money(MARKETING[a.marketing].cost, s.day);
      const firstMonths = Math.ceil(spec.rdTotal / spec.months) * 3;
      if (s.company.cash < mkt + firstMonths) return `Need ${fmtMoney(mkt + firstMonths)} on hand (launch marketing + 3 months of R&D)`;
      if (a.price < spec.refPrice * 0.3 || a.price > spec.refPrice * 4) return 'That price is unrealistic';
      spend(s, 'marketing', mkt);
      const n = s.hardware.length + 1;
      const launchDay = s.day + Math.round(spec.months * 30.44);
      s.hardware.push({
        id: `own_${n}_${s.nextId++}`,
        name,
        kind: a.kind,
        tier: a.tier,
        tech: spec.tech,
        media: mediaFor(fromDay(launchDay).year),
        status: 'dev',
        devStartDay: s.day,
        launchDay,
        endDay: null,
        rdTotal: spec.rdTotal,
        rdPaid: 0,
        price: Math.round(a.price),
        unitCost1980: spec.unitCost1980,
        feeRate: a.feeRate,
        marketing: a.marketing,
        potentialM: 0,
        installedM: 0,
        boost: 0,
        unitsSold: 0,
        hwRevenue: 0,
        hwCost: 0,
        feeRevenue: 0,
        monthly: [],
      });
      pushNews(s, { category: 'studio', headline: `${s.company.name} is secretly building ${aOrAn(a.kind)}: codename “${name}”`, tone: 'neutral' });
      return null;
    }
    case 'setConsole': {
      const hw = s.hardware.find((h) => h.id === a.id);
      if (!hw || hw.status === 'retired') return 'No such console';
      // validate everything first so a rejected change applies nothing
      const pack = a.packIn ? s.releases[a.packIn] : undefined;
      if (a.packIn) {
        if (!pack) return 'No such game';
        if (!pack.concept.platforms.includes(hw.id)) return `${pack.name} isn’t on the ${hw.name} — port it first`;
      }
      if (a.price !== undefined) {
        const [lo, hi] = priceBounds(hw, s.day);
        if (a.price < lo || a.price > hi) return `Price must be between ${fmtMoney(lo)} and ${fmtMoney(hi)}`;
      }
      if (a.packIn === null) delete hw.packIn;
      else if (pack) hw.packIn = pack.id;
      if (a.price !== undefined) hw.price = Math.round(a.price);
      if (a.feeRate !== undefined) hw.feeRate = a.feeRate;
      return null;
    }
    case 'signIndie': {
      const why = labelBlocked(s);
      if (why) return why;
      if (!LABEL_TIERS[a.tier]) return 'Invalid budget';
      const rv = signableIndies(s).find((r) => r.id === a.rivalId);
      if (!rv) return 'That studio isn’t available';
      if (s.company.cash < dealAdvance(s, a.tier)) return 'Not enough cash for the advance';
      signIndie(c, rv, a.tier);
      return null;
    }
    case 'hostShowcase': {
      const why = showcaseBlocked(s);
      if (why) return why;
      hostShowcase(c);
      return null;
    }
    case 'launchSubscription': {
      const why = canLaunchSub(s);
      if (why) return why;
      const name = a.name.trim().slice(0, 32);
      if (!name) return 'Name your pass';
      if (a.price < subRefPrice(s) * 0.25 || a.price > subRefPrice(s) * 4) return 'That price is unrealistic';
      if (s.company.cash < subLaunchCost(s)) return `Launching costs ${fmtMoney(subLaunchCost(s))}`;
      launchSub(c, name, Math.round(a.price * 100) / 100);
      return null;
    }
    case 'setSubscriptionPrice': {
      if (!s.subscription?.active) return 'No pass is running';
      if (a.price < subRefPrice(s) * 0.25 || a.price > subRefPrice(s) * 4) return 'That price is unrealistic';
      s.subscription.price = Math.round(a.price * 100) / 100;
      return null;
    }
    case 'closeSubscription': {
      if (!s.subscription?.active) return 'No pass is running';
      s.subscription.active = false;
      s.subscription.subscribers = 0;
      addRep(s, -2, `Shut down ${s.subscription.name}`);
      pushNews(s, { category: 'studio', headline: `${s.subscription.name} is shutting down`, tone: 'bad' });
      return null;
    }
    case 'vacation': {
      const st = s.staff[a.staffId];
      if (!st) return 'Unknown staff member';
      if (a.days !== 7 && a.days !== 14) return 'Vacations are one or two weeks';
      const why = vacationBlocked(s, st);
      if (why) return why;
      st.vacationDays = a.days;
      st.lastVacationDay = s.day;
      st.loyalty = clamp(st.loyalty + (a.days === 14 ? 5 : 3), 0, 100);
      return null;
    }
    case 'sabbatical': {
      const st = s.staff[a.staffId];
      if (!st) return 'Unknown staff member';
      const why = sabbaticalBlocked(s, st);
      if (why) return why;
      st.vacationDays = SABBATICAL.days;
      st.lastVacationDay = s.day;
      st.lastSabbaticalDay = s.day;
      st.sabbatical = true;
      return null;
    }
    case 'retireConsole': {
      const hw = s.hardware.find((h) => h.id === a.id);
      if (!hw || hw.status !== 'live') return 'That console isn’t on sale';
      const n = projectsTargeting(s, hw.id);
      if (n) return `${n} game${n > 1 ? 's are' : ' is'} still in development for the ${hw.name}`;
      retireConsole(c, hw);
      return null;
    }
    case 'cancelConsole': {
      const i = s.hardware.findIndex((h) => h.id === a.id);
      if (i < 0 || s.hardware[i]!.status !== 'dev') return 'Only consoles still in development can be cancelled';
      const hw = s.hardware[i]!;
      s.hardware.splice(i, 1);
      pushNews(s, { category: 'studio', headline: `${s.company.name} scraps its ${hw.name} hardware project`, body: `${fmtMoney(hw.rdPaid)} of R&D written off.`, tone: 'bad' });
      return null;
    }
    case 'refreshCandidates': {
      const cost = money(1_200, s.day);
      if (s.company.cash < cost) return 'Not enough cash';
      spend(s, 'recruiting', cost);
      s.candidates = [];
      refreshCandidates(c);
      return null;
    }
  }
}

export { marketSalary };

/** Acquiring a real company transfers its real franchises (released so far) to the player. */
function adoptFranchises(s: GameState, companyId: string): void {
  const yr = fromDay(s.day).year;
  for (const f of FRANCHISES) {
    let owner = f.company;
    for (const [cid, y] of f.transfers ?? []) if (yr >= y) owner = cid;
    if (owner !== companyId) continue;
    const past = f.releases.filter((r) => parseYM(r.date) <= s.day);
    if (!past.length) continue;
    const id = newId(s, 'f');
    s.franchises[id] = {
      id,
      name: f.name,
      genre: f.genre,
      topic: f.topic,
      fans: Math.round(past.reduce((t, r) => t + r.unitsM * 1e6, 0) * 0.12),
      entries: [],
      fatigue: 0,
      lastDay: parseYM(past[past.length - 1]!.date),
      bestScore: Math.max(...past.map((r) => r.score)),
      origin: f.id,
    };
    pushNews(s, { category: 'studio', headline: `You now own the ${f.name} franchise`, tone: 'good' });
  }
}
