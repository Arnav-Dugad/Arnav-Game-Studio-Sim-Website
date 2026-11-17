/** "Coming up": the next few months of dated events across the game's systems, for the Overview. */
import { TRADE_SHOWS } from '@/data/marketing';
import { COMPANY_BY_ID } from '@/data/companies';
import { fromDay, toDay } from '@/sim/calendar';
import { CAMPAIGN_DAYS } from '@/sim/systems/crowdfunding';
import { EA_STALE_WEEKS } from '@/sim/systems/earlyAccess';
import { allPlatforms } from '@/sim/systems/market';
import { MEDIA } from '@/sim/systems/media';
import { upcomingReleases } from '@/sim/systems/rivals';
import type { GameState } from '@/sim/types';
import type { IconName } from '../icons';
import { daysLeft } from './alerts';

export interface CalendarEntry {
  day: number;
  icon: IconName;
  text: string;
  tone?: 'good' | 'bad' | 'gold';
}

export function comingUp(s: GameState, days = 120, max = 10): CalendarEntry[] {
  const end = s.day + days;
  const out: CalendarEntry[] = [];
  const add = (e: CalendarEntry) => {
    if (e.day > s.day && e.day <= end) out.push(e);
  };
  const { year } = fromDay(s.day);
  // your games
  for (const p of Object.values(s.projects)) {
    if (p.kind !== 'game') continue;
    add({ day: s.day + daysLeft(p), icon: 'rocket', text: `${p.concept.name} launches (planned)`, tone: 'good' });
    if (p.concept.deal) add({ day: p.concept.deal.deadlineDay, icon: 'calendar', text: `Publisher deadline for ${p.concept.name}`, tone: 'bad' });
    if (p.crowdfund && p.crowdfund.end === undefined) add({ day: p.crowdfund.day + CAMPAIGN_DAYS, icon: 'crowd', text: `${p.concept.name}’s crowdfunding campaign ends` });
    if (p.crowdfund?.promised !== undefined) add({ day: p.crowdfund.promised, icon: 'crowd', text: `Promised to backers: ${p.concept.name}`, tone: 'bad' });
    if (p.earlyAccess && !p.earlyAccess.stale) add({ day: p.earlyAccess.day + EA_STALE_WEEKS * 7, icon: 'hourglass', text: `${p.concept.name}: Early Access patience runs out`, tone: 'bad' });
  }
  for (const d of s.mediaDeals ?? []) if (d.outcome === undefined) add({ day: d.releaseDay, icon: 'sparkle', text: `The ${d.name} ${MEDIA[d.kind].noun} comes out` });
  // the industry
  for (const r of upcomingReleases(s, s.day + 1, end).slice(0, 4)) add({ day: r.day, icon: 'company', text: `${s.rivals[r.company]?.name ?? COMPANY_BY_ID[r.company]?.name ?? r.company}: ${r.title}` });
  for (const pl of allPlatforms(s)) if (!pl.own && pl.launchDay > s.day && pl.launchDay <= end) add({ day: pl.launchDay, icon: 'controller', text: `${pl.name} launches`, tone: 'gold' });
  for (const y of [year, year + 1])
    for (const t of TRADE_SHOWS) if (y >= t.from && (t.to === undefined || y <= t.to)) add({ day: toDay(y, t.month, 1), icon: 'megaphone', text: `${t.name} (exhibit this month)` });
  // the calendar
  for (const y of [year, year + 1]) {
    add({ day: toDay(y, 1, 1), icon: 'trophy', text: 'Golden Pixel Gala — the year’s awards', tone: 'gold' });
    if (s.company.policies.interns) {
      add({ day: toDay(y, 6, 1), icon: 'people', text: 'Summer interns arrive' });
      add({ day: toDay(y, 9, 1), icon: 'people', text: 'Interns head back to school' });
    }
    if (s.finance.stock && toDay(y, 5, 1) - s.finance.stock.ipoDay > 300) add({ day: toDay(y, 5, 1), icon: 'bell', text: 'Annual shareholder meeting' });
    for (const m of [1, 4, 7, 10]) add({ day: toDay(y, m, 1), icon: 'target', text: 'New quarterly objectives' });
  }
  return out.sort((a, b) => a.day - b.day).slice(0, max);
}
