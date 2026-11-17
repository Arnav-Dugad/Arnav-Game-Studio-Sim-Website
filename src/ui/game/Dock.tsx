/** At-a-glance status: active projects (bottom) and a non-blocking "year in review" card. */
import { useEffect, useMemo, useState } from 'react';
import { fromDay, toDay } from '@/sim/calendar';
import { fmtMoney, fmtUnits, sum } from '@/sim/util';
import { qualityToScore, devProgress } from '@/sim/systems/dev';
import { Icon } from '../icons';
import { cx } from '../components/ui';
import { useGame } from '../store';
import { PHASE_NAMES } from './lib';

export function ProjectDock() {
  const s = useGame((g) => g.s);
  useGame((g) => g.v);
  const panel = useGame((g) => g.panel);
  const build = useGame((g) => g.build);
  const openPanel = useGame((g) => g.openPanel);
  if (!s || panel || build) return null;
  const projects = Object.values(s.projects);
  const research = s.research.active;
  const idle = Object.values(s.staff).filter((x) => x.assignment.kind === 'idle' && x.sickDays <= 0 && !x.vacationDays).length;
  const nudge = !projects.length && idle > 0 && s.status === 'running';
  // In a busy studio, point at idle people (they cost salary and do nothing).
  const idleNudge = projects.length > 0 && idle >= 3 && s.status === 'running';
  if (!projects.length && !research && !nudge) return null;
  return (
    <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap justify-center gap-2 sm:bottom-4">
      {nudge && (
        <div className="glass pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs">
          <Icon name="hourglass" size={14} className="shrink-0 text-warn" />
          <span className="font-semibold">
            {idle === 1 && Object.keys(s.staff).length === 1 ? 'Your team is idle' : `${idle} ${idle === 1 ? 'person is' : 'people are'} idle`}
          </span>
          <button type="button" className="rounded-lg bg-accent px-2 py-1 font-semibold text-accent-ink hover:brightness-110" onClick={() => openPanel('develop', 'new')}>
            New game
          </button>
          {s.offers.contracts.length > 0 && (
            <button type="button" className="rounded-lg border border-line px-2 py-1 font-semibold hover:bg-bg2" onClick={() => openPanel('develop', 'contracts')}>
              Contracts<span className="hidden sm:inline"> ({s.offers.contracts.length})</span>
            </button>
          )}
        </div>
      )}
      {idleNudge && (
        <button type="button" onClick={() => openPanel('staff', 'idle')} className="glass pointer-events-auto flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs hover:brightness-105" title="Open the Team tab filtered to idle people">
          <Icon name="hourglass" size={14} className="shrink-0 text-warn" />
          <span className="font-semibold">{idle} idle</span>
          <span className="text-accent">Assign →</span>
        </button>
      )}
      {projects.slice(0, 4).map((p) => {
        const pct =
          p.kind === 'game' ? devProgress(p) : p.kind === 'contract' ? Math.min(1, (p.design + p.tech) / Math.max(1, p.needDesign + p.needTech)) : Math.min(1, p.points / p.needPoints);
        const label = p.kind === 'game' ? p.concept.name : p.kind === 'contract' ? p.title : `Engine: ${p.name}`;
        const sub =
          p.kind === 'game'
            ? `${p.phase >= 3 ? 'Polish' : PHASE_NAMES[p.phase as 0 | 1 | 2]}${p.qualityPreview ? ` · est. ${Math.round(qualityToScore(p.qualityPreview.total))}` : ''}${p.crunch ? ' · crunch' : ''}`
            : p.kind === 'contract'
              ? `due in ${Math.max(0, p.deadlineDay - s.day)}d`
              : 'building';
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => openPanel('develop', 'projects')}
            className={cx('glass pointer-events-auto w-52 rounded-xl px-3 py-2 text-left transition hover:-translate-y-0.5', p.kind === 'game' && p.awaitingGate && 'ring-2 ring-gold')}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Icon name={p.kind === 'game' ? 'develop' : p.kind === 'contract' ? 'briefcase' : 'gear'} size={13} className="shrink-0 text-accent" />
              <span className="truncate">{label}</span>
            </div>
            <div className="mt-0.5 truncate text-[10px] text-ink3">{sub}</div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg2">
              <div className={cx('h-full rounded-full', p.kind === 'game' ? 'bg-accent' : 'bg-tech')} style={{ width: `${pct * 100}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface YearSummary {
  year: number;
  revenue: number;
  profit: number;
  games: { name: string; score: number }[];
  units: number;
  rivalHit?: { name: string; score: number };
  goty?: { name: string; company: string; mine: boolean };
  staff: number;
}

/** Shows a dismissible recap card each January (does not pause the game). */
export function YearInReview() {
  const s = useGame((g) => g.s);
  const v = useGame((g) => g.v);
  const [shown, setShown] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const year = s ? fromDay(s.day).year : 0;
  const isJanuary = !!s && fromDay(s.day).month === 1 && s.day > toDay(s.settings.startYear, 1, 1) + 40;
  useEffect(() => {
    if (!isJanuary || shown === year) return;
    const t = setTimeout(() => setShown(year), 0);
    return () => clearTimeout(t);
  }, [isJanuary, shown, year]);
  useEffect(() => {
    if (shown === null) return;
    const t = setTimeout(() => setDismissed(shown), 14_000);
    return () => clearTimeout(t);
  }, [shown]);
  const summary = useMemo<YearSummary | null>(() => {
    if (!s || shown === null) return null;
    const prev = shown - 1;
    const months = s.finance.ledger.filter((m) => fromDay(m.day).year === prev);
    const revenue = sum(months.map((m) => sum(Object.values(m.income).map((x) => x ?? 0))));
    const expense = sum(months.map((m) => sum(Object.values(m.expense).map((x) => x ?? 0))));
    const rels = s.releaseOrder.map((id) => s.releases[id]!).filter((r) => fromDay(r.day).year === prev);
    const rivalHit = s.rivalGames.filter((g) => fromDay(g.day).year === prev).sort((a, b) => b.score - a.score)[0];
    const gala = s.awardHistory?.find((y) => y.year === prev)?.winners.find((w) => w.category === 'Game of the Year');
    return {
      year: prev,
      revenue,
      profit: revenue - expense,
      games: rels.map((r) => ({ name: r.name, score: r.score })),
      units: sum(rels.map((r) => r.units)),
      rivalHit: rivalHit ? { name: rivalHit.name, score: rivalHit.score } : undefined,
      goty: gala ? { name: gala.name, company: gala.company, mine: gala.mine } : undefined,
      staff: Object.keys(s.staff).length,
    };
    // v: recompute when the sim ticks
  }, [s, shown, v]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!summary || dismissed === shown) return null;
  return (
    <section aria-label={`${summary.year} in review`} className="glass absolute left-3 top-20 z-30 hidden w-72 rounded-2xl p-4 animate-fade-up md:block md:left-[4.75rem]">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Year in review</div>
          <h3 className="font-display text-xl font-semibold">{summary.year}</h3>
        </div>
        <button type="button" aria-label="Dismiss" className="grid size-7 place-items-center rounded-lg text-ink3 hover:bg-bg2" onClick={() => setDismissed(shown)}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-bg2/70 p-2">
          <dt className="text-ink3">Revenue</dt>
          <dd className="num font-semibold">{fmtMoney(summary.revenue)}</dd>
        </div>
        <div className="rounded-lg bg-bg2/70 p-2">
          <dt className="text-ink3">Profit</dt>
          <dd className={cx('num font-semibold', summary.profit >= 0 ? 'text-good' : 'text-bad')}>{fmtMoney(summary.profit)}</dd>
        </div>
        <div className="rounded-lg bg-bg2/70 p-2">
          <dt className="text-ink3">Games shipped</dt>
          <dd className="num font-semibold">{summary.games.length}</dd>
        </div>
        <div className="rounded-lg bg-bg2/70 p-2">
          <dt className="text-ink3">Team</dt>
          <dd className="num font-semibold">{summary.staff}</dd>
        </div>
      </dl>
      {summary.games.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {summary.games.slice(0, 4).map((g) => (
            <li key={g.name} className="flex justify-between">
              <span className="truncate">{g.name}</span>
              <span className="num font-semibold">{g.score}</span>
            </li>
          ))}
          {summary.units > 0 && <li className="text-ink3">{fmtUnits(summary.units)} copies sold so far</li>}
        </ul>
      )}
      {summary.goty ? (
        <p className={cx('mt-2 flex items-center gap-1.5 text-[11px]', summary.goty.mine ? 'font-semibold text-gold' : 'text-ink3')}>
          <Icon name="trophy" size={12} className="shrink-0" />
          <span>
            Game of the Year: <b className={summary.goty.mine ? '' : 'text-ink2'}>{summary.goty.name}</b> ({summary.goty.company})
          </span>
        </p>
      ) : summary.rivalHit && (
        <p className="mt-2 text-[11px] text-ink3">
          Industry’s best: <b className="text-ink2">{summary.rivalHit.name}</b> ({summary.rivalHit.score})
        </p>
      )}
    </section>
  );
}
