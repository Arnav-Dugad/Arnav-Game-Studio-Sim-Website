import { fromDay, toDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState } from '../types';
import { money, pushNews } from '../util';
import { valuation } from './finance';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (s: GameState) => boolean;
  secret?: boolean;
}

const rels = (s: GameState) => s.releaseOrder.map((id) => s.releases[id]!);
const staffN = (s: GameState) => Object.keys(s.staff).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_release', name: 'Hello, World', desc: 'Release your first game.', icon: 'rocket', check: (s) => s.releaseOrder.length >= 1 },
  { id: 'five_releases', name: 'Prolific', desc: 'Release 5 games.', icon: 'stack', check: (s) => s.releaseOrder.length >= 5 },
  { id: 'twenty_five', name: 'Back Catalogue', desc: 'Release 25 games.', icon: 'library', check: (s) => s.releaseOrder.length >= 25 },
  { id: 'score_80', name: 'Critical Darling', desc: 'Get an 80+ review score.', icon: 'star', check: (s) => s.progress.stats.bestScore >= 80 },
  { id: 'score_90', name: 'Masterpiece', desc: 'Get a 90+ review score.', icon: 'crown', check: (s) => s.progress.stats.bestScore >= 90 },
  { id: 'score_97', name: 'Perfection', desc: 'Get a 97+ review score.', icon: 'diamond', check: (s) => s.progress.stats.bestScore >= 97 },
  { id: 'flop', name: 'We Don’t Talk About That One', desc: 'Release a game scoring under 40.', icon: 'skull', check: (s) => rels(s).some((r) => r.score < 40) },
  { id: 'units_100k', name: 'Six Figures', desc: 'Sell 100,000 copies of one game.', icon: 'chart', check: (s) => rels(s).some((r) => r.units >= 100_000) },
  { id: 'units_1m', name: 'Million Seller', desc: 'Sell 1 million copies of one game.', icon: 'disc', check: (s) => rels(s).some((r) => r.units >= 1_000_000) },
  { id: 'units_10m', name: 'Phenomenon', desc: 'Sell 10 million copies of one game.', icon: 'fire', check: (s) => rels(s).some((r) => r.units >= 10_000_000) },
  { id: 'remaster_80', name: 'Better Than I Remember', desc: 'Release a remaster scoring 80+.', icon: 'sparkle', check: (s) => rels(s).some((r) => !!r.concept.remasterOf && r.score >= 80) },
  { id: 'expansion_hit', name: 'The Saga Continues', desc: 'Release an expansion pack that sells 250,000 copies.', icon: 'layers', check: (s) => rels(s).some((r) => !!r.concept.expansionOf && r.units >= 250_000) },
  { id: 'gold_watch', name: 'Gold Watch', desc: 'See a veteran retire after a long career at your studio.', icon: 'heart', check: (s) => (s.alumni ?? []).length > 0 },
  { id: 'goty_three', name: 'Dynasty', desc: 'Win Game of the Year three times.', icon: 'crown', check: (s) => (s.awardHistory ?? []).filter((y) => y.winners.some((w) => w.mine && w.category === 'Game of the Year')).length >= 3 },
  { id: 'beta_tester', name: 'Public Test Realm', desc: 'Ship a game after running an open beta.', icon: 'people', check: (s) => Object.values(s.releases).some((r) => r.betaTested) },
  { id: 'world_champs', name: 'World Champions', desc: 'Run a world championship esports league.', icon: 'globe', check: (s) => (s.leagues ?? []).some((l) => l.tier === 'world') },
  { id: 'sale_master', name: 'Everything Must Go', desc: 'Run 10 storefront sales.', icon: 'coin', check: (s) => Object.values(s.releases).reduce((t, r) => t + (r.saleCount ?? 0), 0) >= 10 },
  { id: 'giant_slayer', name: 'Giant Slayer', desc: 'Win 5 head-to-head showdowns against rival studios.', icon: 'shield', check: (s) => Object.values(s.rivalry ?? {}).reduce((t, r) => t + r.wins, 0) >= 5 },
  { id: 'league_1m', name: 'Sold-Out Arena', desc: 'Draw 1 million monthly viewers to one of your esports leagues.', icon: 'trophy', check: (s) => (s.leagues ?? []).some((l) => l.peakViewers >= 1_000_000) },
  { id: 'pass_1m', name: 'All You Can Play', desc: 'Reach 1 million subscribers on your pass.', icon: 'people', check: (s) => (s.subscription?.peak ?? 0) >= 1_000_000 },
  { id: 'console_launch', name: 'Platform Holder', desc: 'Launch your own console or handheld.', icon: 'controller', check: (s) => (s.hardware ?? []).some((h) => h.status !== 'dev') },
  { id: 'console_10m', name: 'In Every Living Room', desc: 'Sell 10 million units of your own hardware.', icon: 'handheld', check: (s) => (s.hardware ?? []).some((h) => h.unitsSold >= 10_000_000) },
  { id: 'franchise', name: 'Franchise Builder', desc: 'Release 3 games in one franchise.', icon: 'chain', check: (s) => Object.values(s.franchises).some((f) => f.entries.length >= 3) },
  { id: 'franchise_6', name: 'Long-Running Saga', desc: 'Release 6 games in one franchise.', icon: 'scroll', check: (s) => Object.values(s.franchises).some((f) => f.entries.length >= 6) },
  { id: 'survive_crash', name: 'Survive the Crash', desc: 'Still be in business at the start of 1986.', icon: 'shield', check: (s) => s.settings.startYear <= 1983 && s.day >= toDay(1986, 1, 1) },
  { id: 'cash_1m', name: 'Seven Figures', desc: 'Have $1M in the bank.', icon: 'coin', check: (s) => s.company.cash >= 1_000_000 },
  { id: 'cash_100m', name: 'War Chest', desc: 'Have $100M in the bank.', icon: 'vault', check: (s) => s.company.cash >= 100_000_000 },
  { id: 'cash_1b', name: 'Billionaire Studio', desc: 'Have $1B in the bank.', icon: 'gem', check: (s) => s.company.cash >= 1_000_000_000 },
  { id: 'staff_10', name: 'Real Studio', desc: 'Employ 10 people.', icon: 'people', check: (s) => staffN(s) >= 10 },
  { id: 'staff_50', name: 'Big Team', desc: 'Employ 50 people.', icon: 'crowd', check: (s) => staffN(s) >= 50 },
  { id: 'staff_200', name: 'Small City', desc: 'Employ 200 people.', icon: 'city', check: (s) => staffN(s) >= 200 },
  { id: 'pets_both', name: 'Raining Cats and Dogs', desc: 'Keep a studio cat and an office dog at the same time.', icon: 'heart', check: (s) => s.office.items.some((i) => i.item === 'pet_cat') && s.office.items.some((i) => i.item === 'pet_dog') },
  { id: 'office_2', name: 'Moving Out', desc: 'Move out of the garage.', icon: 'box', check: (s) => s.office.tier >= 2 },
  { id: 'office_4', name: 'Your Own Building', desc: 'Move into a Studio Building.', icon: 'building', check: (s) => s.office.tier >= 4 },
  { id: 'office_6', name: 'Skyline', desc: 'Build the Global HQ.', icon: 'tower', check: (s) => s.office.tier >= 6 },
  { id: 'research_3d', name: 'A New Dimension', desc: 'Research 3D Graphics.', icon: 'cube', check: (s) => s.research.done.includes('gfx_3d_1') },
  { id: 'research_20', name: 'Lab Rats', desc: 'Complete 20 research projects.', icon: 'flask', check: (s) => s.progress.stats.researchDone >= 20 },
  { id: 'custom_engine', name: 'Engine Builder', desc: 'Build a custom engine.', icon: 'gear', check: (s) => Object.values(s.engines).some((e) => !e.licensedFrom && e.builtDay > 0) },
  { id: 'engine_license_out', name: 'Middleware Mogul', desc: 'License your engine to another studio.', icon: 'plug', check: (s) => Object.values(s.engines).some((e) => e.licensees > 0) },
  { id: 'go_public', name: 'Ring the Bell', desc: 'Take your company public.', icon: 'bell', check: (s) => !!s.finance.stock },
  { id: 'valuation_1b', name: 'Unicorn', desc: 'Reach a $1B valuation.', icon: 'unicorn', check: (s) => valuation(s) >= 1_000_000_000 },
  { id: 'acquire', name: 'Shopping Spree', desc: 'Acquire another studio.', icon: 'cart', check: (s) => s.progress.stats.acquisitions >= 1 },
  { id: 'acquire_real', name: 'Industry Titan', desc: 'Acquire a real-world company.', icon: 'castle', check: (s) => Object.values(s.rivals).some((r) => r.ownedByPlayer && !r.procedural) },
  { id: 'goty', name: 'Game of the Year', desc: 'Win Game of the Year.', icon: 'trophy', check: (s) => rels(s).some((r) => r.awards.includes('Game of the Year')) },
  { id: 'awards_10', name: 'Shelf Space', desc: 'Win 10 awards.', icon: 'medal', check: (s) => s.progress.stats.awardsWon >= 10 },
  { id: 'no_crunch_10y', name: 'Humane Studio', desc: 'Go 10 years without crunch.', icon: 'leaf', check: (s) => s.day - s.progress.stats.noCrunchSince >= 3650 && s.releaseOrder.length >= 5 },
  { id: 'comeback', name: 'Back from the Brink', desc: 'Recover from insolvency.', icon: 'phoenix', check: (s) => s.progress.stats.recoveredFromInsolvency >= 1 },
  { id: 'multiplatform', name: 'Everywhere at Once', desc: 'Release a game on 4+ platforms.', icon: 'grid', check: (s) => rels(s).some((r) => r.concept.platforms.length >= 4) },
  { id: 'mobile', name: 'Pocket Money', desc: 'Release a game on a phone.', icon: 'phone', check: (s) => rels(s).some((r) => r.concept.platforms.some((p) => p === 'ios' || p === 'android')) },
  { id: 'vr', name: 'Through the Looking Glass', desc: 'Release a VR game.', icon: 'goggles', check: (s) => rels(s).some((r) => r.concept.platforms.some((p) => p === 'pc_vr' || p === 'quest')) },
  { id: 'mmo', name: 'Persistent World', desc: 'Release an MMO.', icon: 'globe', check: (s) => rels(s).some((r) => r.concept.genre === 'mmo') },
  { id: 'legend', name: 'Legendary Hire', desc: 'Hire an industry legend.', icon: 'sparkle', check: (s) => Object.values(s.staff).some((x) => !!x.personId) },
  { id: 'contracts_10', name: 'For Hire', desc: 'Complete 10 contracts.', icon: 'briefcase', check: (s) => s.progress.stats.contractsDone >= 10 },
  { id: 'rep_80', name: 'Household Name', desc: 'Reach 80 reputation.', icon: 'heart', check: (s) => s.company.reputation >= 80 },
  { id: 'year_2000', name: 'Y2K Survivor', desc: 'Reach the year 2000.', icon: 'clock', check: (s) => s.settings.startYear < 2000 && fromDay(s.day).year >= 2000 },
  { id: 'year_2026', name: 'Present Day', desc: 'Reach 2026.', icon: 'flag', check: (s) => s.settings.startYear < 2026 && fromDay(s.day).year >= 2026 },
  { id: 'endless_2050', name: 'Future Proof', desc: 'Reach 2050 in endless mode.', icon: 'satellite', check: (s) => fromDay(s.day).year >= 2050 },
  { id: 'revenue_100m', name: 'Nine Figures', desc: 'Earn $100M in lifetime revenue.', icon: 'money', check: (s) => s.progress.stats.totalRevenue >= 100_000_000 },
  { id: 'genre_master', name: 'Jack of All Genres', desc: 'Release games in 10 different genres.', icon: 'palette', check: (s) => new Set(rels(s).map((r) => r.concept.genre)).size >= 10 },
  { id: 'garage_hit', name: 'Garage Miracle', desc: 'Score 85+ while still in the garage.', icon: 'wrench', check: (s) => s.office.tier === 1 && s.progress.stats.bestScore >= 85 },
];

export const MILESTONES: { id: string; text: string; check: (s: GameState) => boolean }[] = [
  { id: 'm_first_game', text: 'Release your first game', check: (s) => s.releaseOrder.length >= 1 },
  { id: 'm_hire', text: 'Hire your first employee', check: (s) => s.progress.stats.staffHired >= 1 },
  { id: 'm_research', text: 'Complete a research project', check: (s) => s.progress.stats.researchDone >= 1 },
  { id: 'm_three_games', text: 'Release 3 games', check: (s) => s.releaseOrder.length >= 3 },
  { id: 'm_score70', text: 'Score 70 or higher', check: (s) => s.progress.stats.bestScore >= 70 },
  { id: 'm_100k', text: 'Have $100k in the bank', check: (s) => s.company.cash >= money(100_000, s.day) / 2 },
  { id: 'm_office', text: 'Move into a Small Office', check: (s) => s.office.tier >= 2 },
  { id: 'm_engine', text: 'Build your own engine', check: (s) => Object.values(s.engines).some((e) => !e.licensedFrom && e.builtDay > 0) },
  { id: 'm_medium', text: 'Release a Medium game', check: (s) => rels(s).some((r) => r.concept.size !== 'small') },
  { id: 'm_selfpub', text: 'Self-publish a game', check: (s) => rels(s).some((r) => !r.concept.deal) && s.research.done.includes('biz_self_publishing') },
  { id: 'm_staff10', text: 'Grow to 10 staff', check: (s) => staffN(s) >= 10 },
  { id: 'm_hit', text: 'Score 85 or higher', check: (s) => s.progress.stats.bestScore >= 85 },
  { id: 'm_showdown', text: 'Win a head-to-head showdown with a rival (launch near their game in the same genre)', check: (s) => Object.values(s.rivalry ?? {}).some((r) => r.wins > 0) },
  { id: 'm_studio_floor', text: 'Move into a Studio Floor', check: (s) => s.office.tier >= 3 },
  { id: 'm_large', text: 'Release a Large game', check: (s) => rels(s).some((r) => r.concept.size === 'large' || r.concept.size === 'aaa') },
  { id: 'm_million', text: 'Sell a million copies', check: (s) => rels(s).some((r) => r.units >= 1_000_000) },
  { id: 'm_expansion', text: 'Release an expansion pack (open a recent 65+ game)', check: (s) => rels(s).some((r) => !!r.concept.expansionOf) },
  { id: 'm_ipo', text: 'Go public', check: (s) => !!s.finance.stock },
  { id: 'm_aaa', text: 'Release a AAA game', check: (s) => rels(s).some((r) => r.concept.size === 'aaa') },
  { id: 'm_acquire', text: 'Acquire a studio', check: (s) => s.progress.stats.acquisitions >= 1 },
  { id: 'm_hq', text: 'Build a Campus HQ', check: (s) => s.office.tier >= 5 },
  { id: 'm_label', text: 'Publish an indie studio’s game (Company → Publishing)', check: (s) => (s.publishingDeals ?? []).some((d) => d.gameName !== undefined) },
  { id: 'm_league', text: 'Run an esports league (Company → Esports)', check: (s) => (s.leagues ?? []).length > 0 },
  { id: 'm_console', text: 'Launch your own console (Research → Hardware)', check: (s) => (s.hardware ?? []).some((h) => h.status !== 'dev') },
  { id: 'm_pass', text: 'Launch a subscription pass (Company → Pass)', check: (s) => !!s.subscription },
  { id: 'm_goty', text: 'Win Game of the Year', check: (s) => Object.values(s.releases).some((r) => r.awards.includes('Game of the Year')) },
];

export function checkAchievements(c: Ctx): void {
  const { s } = c;
  for (const a of ACHIEVEMENTS) {
    if (s.progress.achievements[a.id] !== undefined) continue;
    if (a.check(s)) {
      s.progress.achievements[a.id] = s.day;
      c.out.push({ type: 'achievement', id: a.id });
      pushNews(s, { category: 'studio', headline: `Achievement unlocked: ${a.name}`, body: a.desc, tone: 'good' });
    }
  }
  for (const m of MILESTONES) {
    if (s.progress.milestones.includes(m.id)) continue;
    if (m.check(s)) {
      s.progress.milestones.push(m.id);
      c.out.push({ type: 'milestone', id: m.id });
    }
  }
}

export function nextMilestone(s: GameState) {
  return MILESTONES.find((m) => !s.progress.milestones.includes(m.id));
}

/** Run score for the Hall of Fame. */
export function runScore(s: GameState): number {
  const st = s.progress.stats;
  const val = Math.max(st.peakValuation, valuation(s));
  const diff = { relaxed: 0.8, standard: 1, hardcore: 1.3 }[s.settings.difficulty];
  return Math.round(
    (Math.log10(1 + val) * 800 + Math.log10(1 + st.totalRevenue) * 400 + st.bestScore * 20 + st.hits * 150 + Object.keys(s.progress.achievements).length * 120 + Object.values(s.franchises).filter((f) => f.entries.length >= 3).length * 300) * diff,
  );
}
