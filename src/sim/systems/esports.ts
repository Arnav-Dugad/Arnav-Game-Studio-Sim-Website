/**
 * Esports leagues: run a pro league for one of your competitive games.
 *
 * Viewership comes from the game's player base (copies sold, fading with age, plus franchise fans), how
 * well it reviewed, how competitive its genre is, the era (esports grows through the 2010s), the league's
 * tier and its prestige, which builds season after season. Sponsorship and broadcast deals pay per viewer;
 * running the league and the yearly prize pool cost money. Leagues also turn viewers into franchise fans,
 * keep the game selling, and follow the franchise to a good sequel.
 */
import { BD, clamp } from '../breakdown';
import { fromDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { EsportsLeague, GameState, LeagueTier, Release } from '../types';
import { addRep, earn, fmtMoney, fmtUnits, inflation, money, newId, pushNews, spend } from '../util';

export const ESPORTS_RESEARCH = 'biz_esports';
export const LEAGUE_MIN_SCORE = 75;
export const LEAGUE_MIN_REP = 40;
export const LEAGUE_MAX_LIVE = 2;
export const LEAGUE_MAX_AGE_YEARS = 6;

/** How naturally each genre turns into a spectator sport. */
export const ESPORTS_GENRES: Record<string, number> = { shooter: 1.2, strategy: 1.1, fighting: 1, mmo: 0.85, sports: 0.8, racing: 0.6 };

export const LEAGUE_TIERS: Record<LeagueTier, { label: string; setup: number; monthly: number; prize: number; reach: number; prestige: number }> = {
  regional: { label: 'Regional circuit', setup: 100_000, monthly: 14_000, prize: 60_000, reach: 0.35, prestige: 0.6 },
  pro: { label: 'Pro league', setup: 600_000, monthly: 90_000, prize: 500_000, reach: 1, prestige: 1 },
  world: { label: 'World championship', setup: 2_500_000, monthly: 320_000, prize: 2_000_000, reach: 2.2, prestige: 1.4 },
};

/** Sponsorship + broadcast income per monthly viewer (nominal). */
export function revenuePerViewer(s: GameState): number {
  return 0.18 * inflation(s.day);
}

export function leagueSetupCost(s: GameState, tier: LeagueTier): number {
  return money(LEAGUE_TIERS[tier].setup, s.day);
}
export function leagueMonthlyCost(s: GameState, tier: LeagueTier): number {
  return money(LEAGUE_TIERS[tier].monthly, s.day);
}
export function leaguePrize(s: GameState, tier: LeagueTier): number {
  return money(LEAGUE_TIERS[tier].prize, s.day);
}

export const liveLeagues = (s: GameState): EsportsLeague[] => (s.leagues ?? []).filter((l) => l.status === 'live');

/** Why a game can't host a league (null if it can). */
export function canFoundLeague(s: GameState, rel: Release | undefined): string | null {
  if (!s.research.done.includes(ESPORTS_RESEARCH)) return 'Research Esports first (Business branch)';
  if (!rel) return 'Pick a game';
  if (!(rel.concept.genre in ESPORTS_GENRES)) return 'Only competitive genres (shooters, strategy, fighting, MMOs, sports, racing) work as esports';
  if (rel.concept.expansionOf || rel.concept.remasterOf) return 'Run the league on the main game';
  if (rel.score < LEAGUE_MIN_SCORE) return `Pro players only stick with games scoring ${LEAGUE_MIN_SCORE}+`;
  if ((s.day - rel.day) / 365.25 > LEAGUE_MAX_AGE_YEARS) return `Too old — the scene has moved on (within ${LEAGUE_MAX_AGE_YEARS} years of launch)`;
  if (s.company.reputation < LEAGUE_MIN_REP) return `Sponsors won't back a studio under ${LEAGUE_MIN_REP} reputation`;
  const live = liveLeagues(s);
  if (live.length >= LEAGUE_MAX_LIVE) return `You can run ${LEAGUE_MAX_LIVE} leagues at once`;
  const fr = rel.concept.franchiseId;
  if (live.some((l) => l.releaseId === rel.id || (fr && l.franchiseId === fr))) return 'This franchise already has a league';
  return null;
}

/** Candidates for a league, best first. */
export function leagueCandidates(s: GameState): Release[] {
  return Object.values(s.releases)
    .filter((r) => r.concept.genre in ESPORTS_GENRES && !r.concept.expansionOf && !r.concept.remasterOf && r.score >= LEAGUE_MIN_SCORE - 10 && (s.day - r.day) / 365.25 <= LEAGUE_MAX_AGE_YEARS + 2)
    .sort((a, b) => b.units - a.units);
}

/** Monthly viewers a league would draw (and why). */
export function leagueViewers(s: GameState, rel: Release, tier: LeagueTier, prestige: number) {
  const age = (s.day - rel.day) / 365.25;
  const fr = rel.concept.franchiseId ? s.franchises[rel.concept.franchiseId] : undefined;
  // Fans count, but only up to the game's own player base (so league-made fans can't snowball).
  const players = rel.units * Math.exp(-age / 5) + Math.min(fr?.fans ?? 0, rel.units) * 0.5;
  const yr = fromDay(s.day).year;
  const b = new BD('Active players and fans', players);
  b.mul('Share who watch', 0.25);
  b.mul(`Competitive genre`, ESPORTS_GENRES[rel.concept.genre] ?? 0.5);
  b.mul(`Reviews (${Math.round(rel.score)})`, clamp((rel.score - 60) / 30, 0.2, 1.3));
  b.mul(`Prestige ${Math.round(prestige)}`, 0.4 + (prestige / 100) * 1.2);
  b.mul(LEAGUE_TIERS[tier].label, LEAGUE_TIERS[tier].reach);
  b.mul(`Esports in ${yr}`, clamp((yr - 2005) / 15, 0.3, 1.4));
  const done = b.done();
  return { viewers: Math.max(0, Math.round(Math.min(done.total, players * 1.5))), why: done };
}

/** Rough monthly profit before the yearly prize pool (for the UI preview). */
export function leagueMonthlyProfit(s: GameState, rel: Release, tier: LeagueTier, prestige: number): number {
  return leagueViewers(s, rel, tier, prestige).viewers * revenuePerViewer(s) - leagueMonthlyCost(s, tier) - leaguePrize(s, tier) / 12;
}

export function foundLeague(c: Ctx, rel: Release, tier: LeagueTier, name: string): EsportsLeague {
  const { s } = c;
  spend(s, 'esports', leagueSetupCost(s, tier));
  const lg: EsportsLeague = {
    id: newId(s, 'lg'),
    name,
    releaseId: rel.id,
    franchiseId: rel.concept.franchiseId,
    tier,
    foundedDay: s.day,
    prestige: tier === 'world' ? 15 : tier === 'pro' ? 8 : 3,
    viewers: 0,
    peakViewers: 0,
    revenue: 0,
    costs: leagueSetupCost(s, tier),
    seasons: 0,
    status: 'live',
    history: [],
  };
  (s.leagues ??= []).push(lg);
  const n = pushNews(s, { category: 'studio', headline: `${s.company.name} launches the ${name}`, body: `${LEAGUE_TIERS[tier].label} for ${rel.name}. The first season starts next month.`, tone: 'good' });
  c.out.push({ type: 'news', newsId: n.id, major: false });
  return lg;
}

export function closeLeague(s: GameState, lg: EsportsLeague): void {
  lg.status = 'closed';
  lg.closedDay = s.day;
  if (lg.prestige > 50) addRep(s, -1, `Shut down the ${lg.name}`);
  pushNews(s, { category: 'studio', headline: `The ${lg.name} ends after ${lg.seasons} season${lg.seasons === 1 ? '' : 's'}`, tone: 'neutral' });
}

/** Sales boost for a game whose league is live (it keeps the game in front of players). */
export function leagueSalesMul(s: GameState, releaseId: string): number {
  return liveLeagues(s).some((l) => l.releaseId === releaseId) ? 1.12 : 1;
}

/** A strong sequel in the same genre takes over its franchise's league. */
export function leagueOnRelease(s: GameState, rel: Release): void {
  if (!rel.concept.franchiseId || rel.concept.expansionOf || rel.concept.remasterOf) return;
  for (const lg of liveLeagues(s)) {
    if (lg.franchiseId !== rel.concept.franchiseId || lg.releaseId === rel.id) continue;
    const old = s.releases[lg.releaseId];
    if (!old || rel.concept.genre !== old.concept.genre || rel.score < LEAGUE_MIN_SCORE - 5) continue;
    lg.releaseId = rel.id;
    pushNews(s, { category: 'studio', headline: `The ${lg.name} moves to ${rel.name}`, body: 'Pros and viewers follow the series to its new entry.', tone: 'good' });
  }
}

export function esportsMonthly(c: Ctx): void {
  const { s } = c;
  const month = fromDay(s.day).month;
  for (const lg of liveLeagues(s)) {
    const rel = s.releases[lg.releaseId];
    if (!rel) {
      closeLeague(s, lg);
      continue;
    }
    const t = LEAGUE_TIERS[lg.tier];
    const { viewers } = leagueViewers(s, rel, lg.tier, lg.prestige);
    lg.viewers = viewers;
    lg.peakViewers = Math.max(lg.peakViewers, viewers);
    const revenue = viewers * revenuePerViewer(s);
    const cost = leagueMonthlyCost(s, lg.tier);
    earn(s, 'esports', revenue);
    spend(s, 'esports', cost);
    lg.revenue += Math.round(revenue);
    lg.costs += Math.round(cost);
    lg.history.push(viewers);
    if (lg.history.length > 120) lg.history.shift();
    // Viewers become fans of the series and of the studio.
    const fr = rel.concept.franchiseId ? s.franchises[rel.concept.franchiseId] : undefined;
    if (fr) fr.fans += viewers * 0.01;
    s.company.fans += viewers * 0.002;
    // Prestige builds with a good game and fades once it ages.
    const age = (s.day - rel.day) / 365.25;
    const grow = 0.6 * t.prestige * clamp((rel.score - 60) / 25, 0.2, 1.4);
    lg.prestige = clamp(lg.prestige + (age > LEAGUE_MAX_AGE_YEARS ? -1.5 : grow), 0, 100);
    // Season finals once a year, in the month the league was founded.
    if (month === fromDay(lg.foundedDay).month && s.day - lg.foundedDay > 300) {
      const prize = leaguePrize(s, lg.tier);
      spend(s, 'esports', prize);
      lg.costs += Math.round(prize);
      lg.seasons += 1;
      lg.prestige = clamp(lg.prestige + 5 * t.prestige, 0, 100);
      if (lg.tier !== 'regional' && lg.prestige >= 40) addRep(s, lg.tier === 'world' ? 2 : 1, `${lg.name} finals`);
      const n = pushNews(s, {
        category: 'studio',
        headline: `${lg.name} Season ${lg.seasons} finals draw ${fmtUnits(viewers)} viewers`,
        body: `A ${fmtMoney(prize)} prize pool for the best ${rel.name} players in the world.`,
        tone: 'good',
      });
      c.out.push({ type: 'news', newsId: n.id, major: false });
    }
  }
}
