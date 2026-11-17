/** Studio alerts: what needs the player's attention right now (shared by the Overview panel and the rail badge). */
import { campaignBlocked, campaignFor } from '@/sim/systems/awardsCampaign';
import { sabbaticalBlocked } from '@/sim/systems/staff';
import { formatDate, fromDay } from '@/sim/calendar';
import { fmtMoney } from '@/sim/util';
import { monthlyBurn, trailingRevenue } from '@/sim/systems/finance';
import { devProgress, qualityToScore } from '@/sim/systems/dev';
import { platformInfo } from '@/sim/systems/market';
import { freeDesks, tierDef } from '@/sim/systems/office';
import { earlyAccessBlocked } from '@/sim/systems/earlyAccess';
import { crowdfundBlocked } from '@/sim/systems/crowdfunding';
import { MEDIA_KINDS, mediaBlocked } from '@/sim/systems/media';
import { talkBlocked } from '@/sim/systems/talks';
import { INTERN_YEAR } from '@/sim/systems/interns';
import { isAway } from '@/sim/systems/staff';
import type { GameProject, GameState, Project } from '@/sim/types';
import type { IconName } from '../icons';
import { useGame, type PanelId } from '../store';
import { atRisk } from '../panels/staffTools';

export interface Alert {
  id: string;
  tone: 'bad' | 'warn' | 'info';
  icon: IconName;
  text: string;
  action?: { label: string; run: () => void };
}

export function daysLeft(p: GameProject): number {
  if (p.phase >= 3) return p.extraDays;
  let d = p.phaseDays[p.phase as 0 | 1 | 2] - p.phaseDay + p.extraDays;
  for (let ph = p.phase + 1; ph < 3; ph++) d += p.phaseDays[ph as 0 | 1 | 2];
  return Math.max(0, d);
}

export function projectName(p: Project): string {
  return p.kind === 'game' ? p.concept.name : p.kind === 'contract' ? p.title : `Engine: ${p.name}`;
}

export function studioAlerts(s: GameState, open: (p: PanelId, tab?: string) => void, pushGate: (id: string) => void, furnishDesks: () => void = () => undefined, urgentOnly = false): Alert[] {
  const out: Alert[] = [];
  const staff = Object.values(s.staff);
  const projects = Object.values(s.projects);
  // Money
  const burn = monthlyBurn(s);
  const income = trailingRevenue(s) / 12;
  const net = income - burn;
  if (s.company.cash < 0) out.push({ id: 'cash-neg', tone: 'bad', icon: 'warning', text: `You're ${fmtMoney(-s.company.cash)} in the red. Take a loan, cut costs or land a contract fast.`, action: { label: 'Finance', run: () => open('finance') } });
  else if (net < 0 && s.company.cash < -net * 6)
    out.push({ id: 'runway', tone: 'warn', icon: 'hourglass', text: `About ${Math.max(0, Math.floor(s.company.cash / -net))} months of cash left at this burn rate (${fmtMoney(-net)}/mo).`, action: { label: 'Finance', run: () => open('finance') } });
  // Decisions waiting
  for (const p of projects) if (p.kind === 'game' && p.awaitingGate) out.push({ id: `gate-${p.id}`, tone: 'warn', icon: 'develop', text: `${p.concept.name} is waiting for your phase review.`, action: { label: 'Review', run: () => pushGate(p.id) } });
  if (s.pendingEvents.length) out.push({ id: 'events', tone: 'info', icon: 'mail', text: `${s.pendingEvents.length} decision${s.pendingEvents.length > 1 ? 's' : ''} waiting in your inbox.` });
  // People
  const risk = staff.filter(atRisk).length;
  if (risk) out.push({ id: 'risk', tone: risk >= 5 ? 'bad' : 'warn', icon: 'heart', text: `${risk} ${risk === 1 ? 'person needs' : 'people need'} attention (burnout, low morale or exhausted).`, action: { label: 'See who', run: () => open('staff', 'risk') } });
  const idle = staff.filter((x) => x.assignment.kind === 'idle' && !isAway(x) && x.role !== 'founder').length;
  if (idle) out.push({ id: 'idle', tone: idle >= 5 ? 'warn' : 'info', icon: 'hourglass', text: `${idle} ${idle === 1 ? 'person is' : 'people are'} idle — paid, but not working.`, action: { label: 'Assign', run: () => open('staff', 'idle') } });
  if (!projects.some((p) => p.kind === 'game' || p.kind === 'contract') && staff.some((x) => x.assignment.kind === 'idle' && !isAway(x)))
    out.push({ id: 'nothing', tone: 'info', icon: 'develop', text: 'Nothing in development — the team is waiting for its next game.', action: { label: 'New game', run: () => open('develop', 'new') } });
  if (staff.length >= 6 && !(s.company.values ?? []).length) out.push({ id: 'culture', tone: 'info', icon: 'sparkle', text: 'Your studio has no stated values yet. Pick a culture — quality, speed, players, profit, innovation or balance.', action: { label: 'Culture', run: () => open('company', 'culture') } });
  const tired = staff.filter((x) => x.burnout > 60 && !sabbaticalBlocked(s, x)).length;
  if (tired) out.push({ id: 'sabbatical', tone: 'info', icon: 'leaf', text: `${tired} burnt-out ${tired === 1 ? 'veteran could' : 'veterans could'} use a sabbatical (two months off, back stronger).`, action: { label: 'See who', run: () => open('staff', 'risk') } });
  const dreams = staff.filter((x) => x.ambition && x.ambition.until - s.day < 45);
  if (dreams.length) out.push({ id: 'ambitions', tone: 'warn', icon: 'star', text: `${dreams.length} ${dreams.length === 1 ? 'ambition runs' : 'ambitions run'} out soon — help them and they’ll be far more loyal.`, action: { label: 'See who', run: () => open('staff', 'ambition') } });
  const avgMorale = staff.reduce((t, x) => t + x.morale, 0) / Math.max(1, staff.length);
  if (staff.length >= 5 && avgMorale < 45) out.push({ id: 'morale', tone: 'bad', icon: 'heart', text: `Studio morale is low (${Math.round(avgMorale)}%). Try raises, vacations, a nicer office or ending crunch.`, action: { label: 'Policies', run: () => open('staff', 'policies') } });
  const crunching = projects.filter((p) => p.kind === 'game' && p.crunch).length;
  if (crunching) out.push({ id: 'crunch', tone: 'info', icon: 'fire', text: `${crunching} game${crunching > 1 ? 's are' : ' is'} in crunch: faster, but bugs and burnout pile up.`, action: { label: 'Develop', run: () => open('develop') } });
  // Research
  if (!s.research.active && !s.company.policies.autoQueue && staff.some((x) => x.assignment.kind === 'research')) out.push({ id: 'research', tone: 'warn', icon: 'research', text: 'Your researchers have nothing to research.', action: { label: 'Pick research', run: () => open('research') } });
  // Office
  const deskless = staff.filter((x) => !x.deskId).length;
  if (deskless) out.push({ id: 'desks', tone: 'warn', icon: 'build', text: `${deskless} ${deskless === 1 ? 'person has' : 'people have'} no desk and can't work properly.`, action: { label: 'Add desks', run: () => furnishDesks() } });
  const cap = tierDef(s.office.tier).staffCap;
  if (staff.length >= cap) out.push({ id: 'office', tone: 'info', icon: 'build', text: `Your office is full (${staff.length}/${cap}). Move to grow the team.`, action: { label: 'Office', run: () => open('office') } });
  // Projects at risk
  for (const p of projects) if (p.team.length === 0) out.push({ id: `empty-${p.id}`, tone: 'bad', icon: 'staff', text: `Nobody is working on ${projectName(p)} — it still costs money every day.`, action: { label: 'Develop', run: () => open('develop') } });
  for (const p of projects) {
    if (p.kind !== 'game') continue;
    for (const pid of p.concept.platforms) {
      const pl = platformInfo(s, pid);
      if (pl && pl.endDay !== null && pl.endDay - s.day < 365 && !pl.own) out.push({ id: `plat-${p.id}-${pid}`, tone: 'warn', icon: 'controller', text: `${pl.name} is being phased out — ${p.concept.name} targets it.`, action: { label: 'Develop', run: () => open('develop') } });
    }
    if (p.concept.deal && s.day + daysLeft(p) > p.concept.deal.deadlineDay) out.push({ id: `late-${p.id}`, tone: 'bad', icon: 'calendar', text: `${p.concept.name} will miss its publisher deadline (${formatDate(p.concept.deal.deadlineDay, false)}).`, action: { label: 'Develop', run: () => open('develop') } });
    const est = p.qualityPreview ? qualityToScore(p.qualityPreview.total) : null;
    if (est !== null && devProgress(p) > 0.4 && est < 50) out.push({ id: `weak-${p.id}`, tone: 'warn', icon: 'chart', text: `${p.concept.name} is tracking toward a weak score (~${Math.round(est)}). More polish, a better team or a focus change could help.`, action: { label: 'Develop', run: () => open('develop') } });
  }
  for (const p of projects) if (p.kind === 'contract' && s.day > p.deadlineDay - 14) out.push({ id: `contract-${p.id}`, tone: 'warn', icon: 'contract', text: `Contract "${p.title}" is due ${p.deadlineDay < s.day ? 'already' : 'within two weeks'}.`, action: { label: 'Develop', run: () => open('develop') } });
  // Opportunities (only when they're real and actionable)
  if (urgentOnly) return out.filter((x) => x.tone === 'bad');
  const yr = fromDay(s.day).year;
  for (const p of projects) {
    if (p.kind !== 'game') continue;
    if (p.phase === 1 && !p.earlyAccess && p.concept.size !== 'small' && !earlyAccessBlocked(s, p)) out.push({ id: `ea-${p.id}`, tone: 'info', icon: 'coin', text: `${p.concept.name} could go on sale in Early Access now — players would fund and shape it.`, action: { label: 'Develop', run: () => open('develop') } });
    if (p.phase === 0 && !p.crowdfund && net < 0 && !crowdfundBlocked(s, p)) out.push({ id: `cf-${p.id}`, tone: 'info', icon: 'crowd', text: `Money’s tight: your fans could crowdfund ${p.concept.name}.`, action: { label: 'Develop', run: () => open('develop') } });
  }
  const bigSeries = Object.values(s.franchises).sort((a, b) => b.fans - a.fans)[0];
  if (bigSeries && !(s.mediaDeals ?? []).length && MEDIA_KINDS.some((k) => !mediaBlocked(s, bigSeries, k))) out.push({ id: 'media', tone: 'info', icon: 'sparkle', text: `${bigSeries.name} is popular enough to license — comics, toys, maybe more.`, action: { label: 'IP', run: () => open('company', 'ip') } });
  if (fromDay(s.day).month >= 6 && (s.company.lastTalkDay === undefined || s.day - s.company.lastTalkDay >= 300) && staff.some((x) => (x.level === 'senior' || x.level === 'lead' || x.role === 'founder') && !talkBlocked(s, x))) out.push({ id: 'talk', tone: 'info', icon: 'megaphone', text: 'This year’s Developers Summit slot is unused — a senior could give a talk (open their card).', action: { label: 'Staff', run: () => open('staff') } });
  if (!s.company.policies.interns && yr >= INTERN_YEAR && staff.length >= 8 && freeDesks(s) >= 2) out.push({ id: 'interns', tone: 'info', icon: 'people', text: 'You have room for summer interns: cheap, eager and high-potential.', action: { label: 'Policies', run: () => open('staff', 'policies') } });
  // awards season: a contender without a campaign behind it
  {
    const contender = !campaignFor(s) ? s.releaseOrder.map((id) => s.releases[id]!).filter((r) => r && r.score >= 83 && !campaignBlocked(s, r)).sort((a, b) => b.score - a.score)[0] : undefined;
    if (contender) {
      const go = () => useGame.getState().openModalNow({ kind: 'release', releaseId: contender.id });
      out.push({ id: 'awards', tone: 'info', icon: 'trophy', text: `Awards season: ${contender.name} (${Math.round(contender.score)}) is in the running at the Golden Pixel Gala. A campaign could tip it.`, action: { label: 'See it', run: go } });
    }
  }
  if ((s.fanMail ?? []).some((m) => m.kind === 'art') && !s.office.items.some((i) => i.item === 'fan_wall')) out.push({ id: 'fanwall', tone: 'info', icon: 'palette', text: 'Fans are sending drawings — build a Fan Art Wall to pin them up.', action: { label: 'Fan mail', run: () => open('news', 'mail') } });
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

