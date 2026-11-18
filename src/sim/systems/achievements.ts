import { fromDay, toDay } from '../calendar';
import { knownFor } from './renown';
import { gameRegions } from '../../data/regions';
import type { Ctx } from '../ctx';
import type { GameState } from '../types';
import { money, pushNews } from '../util';
import { ownerValue } from './finance';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (s: GameState) => boolean;
  secret?: boolean;
  /** Can this run still earn it at all (some depend on when you started)? */
  possible?: (s: GameState) => boolean;
}

const rels = (s: GameState) => s.releaseOrder.map((id) => s.releases[id]!);
const staffN = (s: GameState) => Object.values(s.staff).filter((x) => !x.intern).length;

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
  { id: 'survive_crash', name: 'Survive the Crash', desc: 'Still be in business at the start of 1986.', icon: 'shield', possible: (s) => s.settings.startYear <= 1983, check: (s) => s.settings.startYear <= 1983 && s.day >= toDay(1986, 1, 1) },
  { id: 'cash_1m', name: 'Seven Figures', desc: 'Have $1M in the bank.', icon: 'coin', check: (s) => s.company.cash >= 1_000_000 },
  { id: 'cash_100m', name: 'War Chest', desc: 'Have $100M in the bank.', icon: 'vault', check: (s) => s.company.cash >= 100_000_000 },
  { id: 'cash_1b', name: 'Billionaire Studio', desc: 'Have $1B in the bank.', icon: 'gem', check: (s) => s.company.cash >= 1_000_000_000 },
  { id: 'staff_10', name: 'Real Studio', desc: 'Employ 10 people.', icon: 'people', check: (s) => staffN(s) >= 10 },
  { id: 'staff_50', name: 'Big Team', desc: 'Employ 50 people.', icon: 'crowd', check: (s) => staffN(s) >= 50 },
  { id: 'staff_200', name: 'Small City', desc: 'Employ 200 people.', icon: 'city', check: (s) => staffN(s) >= 200 },
  { id: 'pets_both', name: 'Raining Cats and Dogs', desc: 'Keep a studio cat and an office dog at the same time.', icon: 'heart', check: (s) => s.office.items.some((i) => i.item === 'pet_cat') && s.office.items.some((i) => i.item === 'pet_dog') },
  { id: 'culture', name: 'Culture Club', desc: 'Give your studio stated values.', icon: 'sparkle', check: (s) => (s.company.values ?? []).length > 0 },
  { id: 'dreams_10', name: 'Dream Employer', desc: 'Help staff fulfil 10 ambitions.', icon: 'star', check: (s) => (s.progress.stats.dreamsMet ?? 0) >= 10 },
  { id: 'global_hit', name: 'Lost in Translation? Never.', desc: 'Sell 1 million copies of a game localised for every region.', icon: 'globe', check: (s) => Object.values(s.releases).some((r) => gameRegions(r.concept).filter((x) => x !== (s.company.homeRegion ?? 'na')).length >= 3 && r.units >= 1_000_000) },
  { id: 'dividend', name: 'Shareholder Value', desc: 'Pay your shareholders a dividend.', icon: 'coin', check: (s) => (s.finance.stock?.dividendsPaid ?? 0) > 0 },
  { id: 'global_studio', name: 'Global Studio', desc: 'Run branch offices in every other region of the world.', icon: 'globe', check: (s) => (s.company.branches ?? []).length >= 3 },
  { id: 'live_ops', name: 'Live Ops', desc: 'Run 10 live events across your games.', icon: 'sparkle', check: (s) => Object.values(s.releases).reduce((t, r) => t + (r.liveEvents ?? 0), 0) >= 10 },
  { id: 'bff', name: 'Inseparable', desc: 'Have five pairs of best friends at the studio.', icon: 'heart', check: (s) => Object.values(s.relations ?? {}).filter((v) => v >= 60).length >= 5 },
  { id: 'retreat', name: 'Retreat!', desc: 'Take the team on a retreat.', icon: 'leaf', check: (s) => s.company.lastRetreatDay !== undefined },
  { id: 'scenario_win', name: 'Scenario Champion', desc: 'Complete a scenario.', icon: 'flag', check: (s) => s.scenario?.result === 'won' },
  { id: 'mascot', name: 'Mascot Mania', desc: 'Put up a statue of your series’ hero.', icon: 'star', check: (s) => s.office.items.some((i) => i.item === 'mascot_statue') },
  { id: 'bug_squasher', name: 'Bug Squasher', desc: 'Squash 25 bugs in a single bug bash.', icon: 'bug', check: (s) => (s.progress.stats.bestBash ?? 0) >= 25 },
  { id: 'fan_con', name: 'Convention Season', desc: 'Host a fan convention for one of your series.', icon: 'people', check: (s) => Object.values(s.franchises).some((f) => f.lastCon !== undefined) },
  { id: 'copied', name: 'Sincerest Flattery', desc: 'Have a rival rush out a knock-off of your hit.', icon: 'sparkle', check: (s) => Object.values(s.releases).some((r) => (r.copycats ?? 0) > 0) },
  { id: 'mentor', name: 'Proud Mentor', desc: 'See a mentee graduate to senior.', icon: 'star', check: (s) => (s.progress.stats.graduates ?? 0) > 0 },
  { id: 'union', name: 'Solidarity', desc: 'Recognise your workers’ union.', icon: 'people', check: (s) => !!s.company.union },
  { id: 'gym', name: 'Healthy Studio', desc: 'Build a studio gym.', icon: 'heart', check: (s) => s.office.items.some((i) => i.item === 'gym') },
  { id: 'welcome_home', name: 'Welcome Home', desc: 'Acquire a studio founded by one of your former stars.', icon: 'handshake', check: (s) => Object.values(s.rivals).some((r) => r.ownedByPlayer && !!r.founder) },
  { id: 'number_one', name: 'Number One', desc: 'Top the weekly sales chart.', icon: 'trophy', check: (s) => (s.progress.stats.numberOnes ?? 0) > 0 },
  { id: 'goal_getter', name: 'Goal Getter', desc: 'Meet 10 quarterly objectives.', icon: 'target', check: (s) => (s.progress.stats.objectivesDone ?? 0) >= 10 },
  { id: 'office_2', name: 'Moving Out', desc: 'Move out of the garage.', icon: 'box', check: (s) => s.office.tier >= 2 },
  { id: 'office_4', name: 'Your Own Building', desc: 'Move into a Studio Building.', icon: 'building', check: (s) => s.office.tier >= 4 },
  { id: 'office_6', name: 'Skyline', desc: 'Build the Global HQ.', icon: 'tower', check: (s) => s.office.tier >= 6 },
  { id: 'research_3d', name: 'A New Dimension', desc: 'Research 3D Graphics.', icon: 'cube', check: (s) => s.research.done.includes('gfx_3d_1') },
  { id: 'research_20', name: 'Lab Rats', desc: 'Complete 20 research projects.', icon: 'flask', check: (s) => s.progress.stats.researchDone >= 20 },
  { id: 'custom_engine', name: 'Engine Builder', desc: 'Build a custom engine.', icon: 'gear', check: (s) => Object.values(s.engines).some((e) => !e.licensedFrom && e.builtDay > 0) },
  { id: 'engine_license_out', name: 'Middleware Mogul', desc: 'License your engine to another studio.', icon: 'plug', check: (s) => Object.values(s.engines).some((e) => e.licensees > 0) },
  { id: 'go_public', name: 'Ring the Bell', desc: 'Take your company public.', icon: 'bell', check: (s) => !!s.finance.stock },
  { id: 'valuation_1b', name: 'Unicorn', desc: 'Own a studio stake worth $1B.', icon: 'unicorn', check: (s) => ownerValue(s) >= 1_000_000_000 },
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
  { id: 'year_2000', name: 'Y2K Survivor', desc: 'Reach the year 2000.', icon: 'clock', possible: (s) => s.settings.startYear < 2000, check: (s) => s.settings.startYear < 2000 && fromDay(s.day).year >= 2000 },
  { id: 'year_2026', name: 'Present Day', desc: 'Reach 2026.', icon: 'flag', possible: (s) => s.settings.startYear < 2026, check: (s) => s.settings.startYear < 2026 && fromDay(s.day).year >= 2026 },
  { id: 'endless_2050', name: 'Future Proof', desc: 'Reach 2050 in endless mode.', icon: 'satellite', check: (s) => fromDay(s.day).year >= 2050 },
  { id: 'revenue_100m', name: 'Nine Figures', desc: 'Earn $100M in lifetime revenue.', icon: 'money', check: (s) => s.progress.stats.totalRevenue >= 100_000_000 },
  { id: 'genre_master', name: 'Jack of All Genres', desc: 'Release games in 10 different genres.', icon: 'palette', check: (s) => new Set(rels(s).map((r) => r.concept.genre)).size >= 10 },
  { id: 'ea_graduate', name: 'Out of the Oven', desc: 'Release a game scoring 80+ after Early Access.', icon: 'rocket', check: (s) => rels(s).some((r) => !!r.earlyAccess && r.score >= 80) },
  { id: 'office_wedding', name: 'Love at Work', desc: 'Two of your staff fall in love and marry each other.', icon: 'heart', check: (s) => (s.progress.stats.officeWeddings ?? 0) >= 1 },
  { id: 'family_studio', name: 'Family Business', desc: 'Ten babies born to your staff.', icon: 'people', check: (s) => (s.progress.stats.babies ?? 0) >= 10 },
  { id: 'crowd_million', name: 'The Crowd Provides', desc: 'Raise $1M+ in one crowdfunding campaign.', icon: 'crowd', check: (s) => Object.values(s.releases).some((r) => (r.crowdfund?.raised ?? 0) >= 1_000_000) || Object.values(s.projects).some((p) => p.kind === 'game' && !!p.crowdfund?.success && p.crowdfund.raised >= 1_000_000) },
  { id: 'fridge_worthy', name: 'Fridge-Worthy', desc: 'Pin eight fan drawings to your Fan Art Wall.', icon: 'palette', check: (s) => (s.fanMail ?? []).filter((m) => m.pinned).length >= 8 },
  { id: 'thought_leader', name: 'Thought Leader', desc: 'Earn three standing ovations at the Developers Summit.', icon: 'star', check: (s) => (s.progress.stats.ovations ?? 0) >= 3 },
  { id: 'multimedia', name: 'Multimedia Empire', desc: 'Have hits in four different media (comics, toys, TV, film…).', icon: 'crown', check: (s) => new Set((s.mediaDeals ?? []).filter((d) => d.outcome === 'hit').map((d) => d.kind)).size >= 4 },
  { id: 'timeless', name: 'Timeless', desc: 'Have a game inducted into the Golden Pixel Hall of Classics.', icon: 'medal', check: (s) => (s.progress.stats.classics ?? 0) >= 1 },
  { id: 'living_legend', name: 'Living Legend', desc: 'Have three games in the Hall of Classics.', icon: 'crown', check: (s) => (s.progress.stats.classics ?? 0) >= 3 },
  { id: 'intern_to_lead', name: 'From Intern to Lead', desc: 'A former summer intern becomes a lead.', icon: 'rocket', check: (s) => Object.values(s.staff).some((x) => x.wasIntern && x.level === 'lead') },
  { id: 'key_partner', name: 'Key Partner', desc: 'Earn a platform holder’s top favour (85+).', icon: 'handshake', check: (s) => Object.values(s.partners ?? {}).some((v) => v >= 85) },
  { id: 'open_book', name: 'Open Book', desc: 'Open-source one of your engines.', icon: 'gear', check: (s) => Object.values(s.engines).some((e) => e.openSourced) },
  { id: 'philanthropist', name: 'Philanthropist', desc: 'Give $1M to charity.', icon: 'heart', check: (s) => (s.progress.stats.donated ?? 0) >= 1_000_000 },
  { id: 'beloved_community', name: 'Wholesome', desc: 'Grow a community of 100k+ members with health 85+.', icon: 'people', check: (s) => !!s.community && s.community.members >= 100_000 && s.community.health >= 85 },
  { id: 'studio_awards', name: 'And the Award Goes To…', desc: 'Hold your first in-house Studio Awards.', icon: 'trophy', check: (s) => (s.studioAwards ?? []).length > 0 },
  { id: 'shadow_drop', name: 'Out of Nowhere', desc: 'Shadow-drop a game that scores 80+.', icon: 'rocket', check: (s) => rels(s).some((r) => r.shadowDrop && r.score >= 80) },
  { id: 'trusted', name: 'Reliable', desc: 'Earn a publisher’s full trust.', icon: 'handshake', check: (s) => Object.values(s.publisherTrust ?? {}).some((v) => v >= 5) },
  { id: 'cliffhanger_payoff', name: 'Worth the Wait', desc: 'Pay off a cliffhanger with a sequel.', icon: 'sparkle', check: (s) => rels(s).some((r) => (r.why.user?.parts ?? []).some((x) => x.label.startsWith('Pays off'))) },
  { id: 'final_cut', name: 'Final Cut', desc: 'Cut a perfect trailer (8/8).', icon: 'star', check: (s) => (s.progress.stats.perfectTrailers ?? 0) > 0 },
  { id: 'better_together', name: 'Better Together', desc: 'Ship a co-developed game that scores 80+.', icon: 'handshake', check: (s) => rels(s).some((r) => !!r.coDev && r.score >= 80) },
  { id: 'specialist', name: 'Specialist', desc: 'Become known for a genre: average 75+ across your recent games in it (at least two).', icon: 'star', check: (s) => knownFor(s).length >= 1 },
  { id: 'double_threat', name: 'Double Threat', desc: 'Be known for two genres at once.', icon: 'crown', check: (s) => knownFor(s).length >= 2 },
  { id: 'festival_favourite', name: 'Festival Favourite', desc: 'Have a making-of documentary acclaimed.', icon: 'camera', check: (s) => rels(s).some((r) => r.documentary?.outcome === 'acclaimed') },
  { id: 'open_door', name: 'Open Door', desc: 'Hold 25 one-on-ones with your staff.', icon: 'user', check: (s) => (s.progress.stats.checkIns ?? 0) >= 25 },
  { id: 'value_king', name: 'Value for Money', desc: 'Sell a million copies of a budget-priced game.', icon: 'coin', check: (s) => rels(s).some((r) => r.concept.priceTier === 'budget' && r.units >= 1_000_000) },
  { id: 'page_turner', name: 'Page Turner', desc: 'Release a visual novel scoring 85+.', icon: 'book', check: (s) => rels(s).some((r) => r.concept.genre === 'visual_novel' && r.score >= 85) },
  { id: 'dream_maker', name: 'Dream Maker', desc: 'Ship three of your staff’s passion projects.', icon: 'sparkle', check: (s) => rels(s).filter((r) => !!r.passion).length >= 3 },
  { id: 'welcome_back', name: 'Welcome Back', desc: 'Rehire a former colleague.', icon: 'people', check: (s) => Object.values(s.staff).some((x) => x.rejoined !== undefined) },
  { id: 'awards_campaign_win', name: 'For Your Consideration', desc: 'Win Game of the Year with a game you campaigned for.', icon: 'trophy', check: (s) => (s.awardHistory ?? []).some((y) => y.winners.some((w) => w.mine && w.category === 'Game of the Year' && w.releaseId !== undefined && s.company.awardsCampaign?.releaseId === w.releaseId)) },
  { id: 'daily_win', name: 'Daily Grind', desc: 'Win a daily challenge.', icon: 'calendar', check: (s) => !!s.settings.daily && s.scenario?.result === 'won' },
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
  { id: 'm_selfpub', text: 'Research Self-Publishing and release a game without a publisher', check: (s) => rels(s).some((r) => !r.concept.deal) && s.research.done.includes('biz_self_publishing') },
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
  const val = Math.max(st.peakValuation, ownerValue(s));
  const diff = { relaxed: 0.8, standard: 1, hardcore: 1.3 }[s.settings.difficulty];
  // a career counts: years at the helm (a quick sale shouldn't rival four decades)
  const years = Math.max(0, (s.day - toDay(s.settings.startYear, 1, 1)) / 365);
  return Math.round(
    (Math.min(60, years) * 60 + Math.log10(1 + val) * 800 + Math.log10(1 + st.totalRevenue) * 400 + st.bestScore * 20 + st.hits * 150 + Object.keys(s.progress.achievements).length * 120 + Object.values(s.franchises).filter((f) => f.entries.length >= 3).length * 300) * diff,
  );
}
