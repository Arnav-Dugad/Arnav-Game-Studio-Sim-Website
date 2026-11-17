/** "The story of your studio": a short biography written from what actually happened in the run. */
import { REGION_BY_ID } from '@/data/regions';
import { fromDay } from '@/sim/calendar';
import { MEDIA } from '@/sim/systems/media';
import { tierDef } from '@/sim/systems/office';
import type { GameState, Release } from '@/sim/types';
import { fmtMoney, fmtUnits } from '@/sim/util';

const yr = (d: number) => fromDay(d).year;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function biography(s: GameState): string[] {
  const out: string[] = [];
  const name = s.company.name;
  const founder = s.staff['founder']?.name ?? (s.alumni ?? []).find((a) => a.role === 'founder')?.name;
  const home = REGION_BY_ID[s.company.homeRegion ?? 'na']?.name;
  const rels: Release[] = s.releaseOrder.map((id) => s.releases[id]!).filter(Boolean);
  out.push(`${name} was founded in ${s.settings.startYear}${founder ? ` by ${founder}` : ''}${home ? `, in ${home}` : ''}, with ${tierDef(1).name.toLowerCase() === 'garage' ? 'little more than a garage and a dream' : 'a small team and a big idea'}.`);
  if (!rels.length) {
    out.push('Its first game was still to come.');
    return out;
  }
  const first = rels[0]!;
  out.push(`Its first game, ${first.name} (${yr(first.day)}), scored ${Math.round(first.score)}${first.score >= 80 ? ' — a stunning debut' : first.score < 55 ? ' — a rough start' : ''}.`);
  const breakthrough = rels.find((r) => r !== first && (r.score >= 85 || r.units >= 1_000_000));
  if (breakthrough) out.push(`The breakthrough came in ${yr(breakthrough.day)} with ${breakthrough.name}, which ${breakthrough.score >= 85 ? `earned a ${Math.round(breakthrough.score)}` : 'struck a chord'} and sold ${fmtUnits(breakthrough.units)} copies.`);
  const best = [...rels].sort((a, b) => b.score - a.score)[0]!;
  const goty = rels.filter((r) => r.awards.includes('Game of the Year'));
  const awards = rels.reduce((t, r) => t + r.awards.length, 0);
  if (best !== breakthrough && best !== first) out.push(`Its finest hour was ${best.name} (${yr(best.day)}), with a score of ${Math.round(best.score)}.`);
  if (awards) out.push(`Over the years it won ${awards} Golden Pixel award${awards > 1 ? 's' : ''}${goty.length ? `, including Game of the Year for ${list(goty.map((r) => r.name))}` : ''}.`);
  const flop = rels.filter((r) => r.score < 45 && r !== first).sort((a, b) => a.score - b.score)[0];
  const hardYear = [...(s.yearbook ?? [])].sort((a, b) => a.morale - b.morale)[0];
  if (flop || (hardYear && hardYear.morale < 45)) {
    const bits: string[] = [];
    if (flop) bits.push(`${flop.name} flopped in ${yr(flop.day)}`);
    if (hardYear && hardYear.morale < 45) bits.push(`${hardYear.year} was a hard year for the team`);
    out.push(`There were dark times too: ${list(bits)}.`);
  }
  const photos = s.yearbook ?? [];
  const peak = photos.reduce((m, p) => Math.max(m, p.people), Object.keys(s.staff).length);
  if (peak > 5) out.push(`The team grew to ${peak} people${s.office.tier > 1 ? `, and the studio moved into a ${tierDef(s.office.tier).name}` : ''}.`);
  const series = Object.values(s.franchises).filter((f) => f.entries.length >= 2).sort((a, b) => b.fans - a.fans)[0];
  if (series) out.push(`${series.name} became its signature series: ${series.entries.length} games and ${fmtUnits(series.fans)} fans.`);
  const hits = (s.mediaDeals ?? []).filter((d) => d.outcome === 'hit');
  if (hits.length) out.push(`Its worlds reached beyond games — ${list(hits.slice(0, 3).map((d) => `a hit ${d.name} ${MEDIA[d.kind].noun}`))}.`);
  const classics = rels.filter((r) => r.classic);
  if (classics.length) out.push(`${list(classics.map((r) => r.name))} ${classics.length > 1 ? 'were' : 'was'} inducted into the Hall of Classics.`);
  const extras: string[] = [];
  if ((s.progress.stats.fanMail ?? 0) >= 10) extras.push(`${s.progress.stats.fanMail} letters and drawings from fans`);
  if ((s.progress.stats.donated ?? 0) > 0) extras.push(`${fmtMoney(s.progress.stats.donated!)} given to charity`);
  if (s.community && s.community.members > 1000) extras.push(`a community of ${fmtUnits(s.community.members)} players`);
  if ((s.progress.stats.babies ?? 0) + (s.progress.stats.weddings ?? 0) >= 3) extras.push(`${(s.progress.stats.weddings ?? 0)} weddings and ${(s.progress.stats.babies ?? 0)} babies among its people`);
  if (extras.length) out.push(`Along the way: ${list(extras)}.`);
  out.push(`In all, ${name} released ${rels.length} game${rels.length > 1 ? 's' : ''} and sold ${fmtUnits(s.progress.stats.totalUnits)} copies${s.progress.stats.peakValuation > 0 ? `, peaking at a ${fmtMoney(s.progress.stats.peakValuation)} valuation` : ''}.`);
  return out;
}
