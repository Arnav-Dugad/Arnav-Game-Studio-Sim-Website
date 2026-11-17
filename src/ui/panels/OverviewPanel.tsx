import { useMemo } from 'react';
/**
 * Studio overview: everything that needs your attention right now, each with a one-click fix, plus your
 * projects at a glance, what's selling and how the year is going. The "home screen" for big studios.
 */
import type { ReactNode } from 'react';
import { fromDay, formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits } from '@/sim/util';
import { monthlyBurn } from '@/sim/systems/finance';
import { devProgress, qualityToScore } from '@/sim/systems/dev';
import { Meter, Section, cx } from '../components/ui';
import { Icon } from '../icons';
import { useGame, type PanelId } from '../store';
import { daysLeft, projectName, studioAlerts } from '../game/alerts';
import { furnish } from '../game/BuildBar';
import { comingUp } from '../game/calendar';

export default function OverviewPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const openPanel = useGame((g) => g.openPanel);
  const pushModal = useGame((g) => g.pushModal);
  const open = (p: PanelId, tab?: string) => openPanel(p, tab ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const upcoming = useMemo(() => comingUp(s), [s.day, s.office.rev]);
  const alerts = studioAlerts(s, open, (id) => pushModal({ kind: 'gate', projectId: id }), furnish);
  const projects = Object.values(s.projects);
  const selling = Object.values(s.releases)
    .filter((r) => r.active)
    .map((r) => ({ r, last: r.week <= 104 ? (r.weekly[r.weekly.length - 1] ?? 0) : (r.monthly[r.monthly.length - 1] ?? 0) / 4 }))
    .sort((a, b) => b.last - a.last)
    .slice(0, 5);
  const yr = fromDay(s.day).year;
  const months = s.finance.ledger.filter((m) => fromDay(m.day).year === yr);
  const revenue = months.reduce((t, m) => t + Object.values(m.income).reduce((u, v) => u + (v ?? 0), 0), 0);
  const expense = months.reduce((t, m) => t + Object.values(m.expense).reduce((u, v) => u + (v ?? 0), 0), 0);
  const shippedThisYear = s.releaseOrder.map((id) => s.releases[id]!).filter((r) => r && fromDay(r.day).year === yr);

  return (
    <div className="space-y-4 text-sm">
      <Section title={alerts.length ? `Needs attention (${alerts.length})` : 'Needs attention'}>
        {alerts.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-good/10 p-3 text-xs text-good">
            <Icon name="check" size={16} /> All quiet. The studio is running smoothly.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {alerts.slice(0, 12).map((a) => (
              <li key={a.id} className={cx('flex items-center gap-2.5 rounded-xl border p-2.5 text-xs', a.tone === 'bad' ? 'border-bad/50 bg-bad/5' : a.tone === 'warn' ? 'border-warn/50 bg-warn/5' : 'border-line')}>
                <Icon name={a.icon} size={16} className={cx('shrink-0', a.tone === 'bad' ? 'text-bad' : a.tone === 'warn' ? 'text-warn' : 'text-ink3')} />
                <span className="min-w-0 flex-1">{a.text}</span>
                {a.action && (
                  <button type="button" onClick={a.action.run} className="shrink-0 rounded-lg border border-line px-2 py-1 font-semibold hover:bg-bg2">
                    {a.action.label} →
                  </button>
                )}
              </li>
            ))}
            {alerts.length > 12 && <li className="text-xs text-ink3">…and {alerts.length - 12} more.</li>}
          </ul>
        )}
      </Section>

      <Section title={`In development (${projects.length})`} right={<Link onClick={() => open('develop', 'new')}>New game</Link>}>
        {projects.length === 0 ? (
          <p className="text-xs text-ink3">Nothing in development. Start a game, take a contract or build an engine.</p>
        ) : (
          <ul className="space-y-1.5">
            {projects.map((p) => {
              const pct = p.kind === 'game' ? devProgress(p) : p.kind === 'contract' ? Math.min(1, (p.design + p.tech) / Math.max(1, p.needDesign + p.needTech)) : Math.min(1, p.points / p.needPoints);
              const est = p.kind === 'game' && p.qualityPreview ? Math.round(qualityToScore(p.qualityPreview.total)) : null;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => open('develop')} className="w-full rounded-xl border border-line p-2.5 text-left text-xs hover:bg-bg2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{projectName(p)}</span>
                      <span className="shrink-0 text-ink3">
                        {p.kind === 'game' ? `${['Pre-production', 'Production', 'Polish', 'Launching'][Math.min(3, p.phase)]} · ships ~${formatDate(s.day + daysLeft(p), false)}` : p.kind === 'contract' ? `due ${formatDate(p.deadlineDay, false)}` : 'engine'}
                      </span>
                    </div>
                    <Meter value={pct * 100} tone="accent" className="mt-1.5" label="Progress" />
                    <div className="mt-1 flex justify-between text-[11px] text-ink3">
                      <span>{p.team.length} on the team{p.kind === 'game' && p.crunch ? ' · crunching' : ''}</span>
                      {est !== null && <span className={cx('num font-semibold', est >= 75 ? 'text-good' : est < 50 ? 'text-bad' : 'text-ink2')}>est. {est}</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Coming up">
        {upcoming.length === 0 ? (
          <p className="text-xs text-ink3">Nothing scheduled in the next few months.</p>
        ) : (
          <ol className="space-y-1">
            {upcoming.map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="num w-20 shrink-0 text-ink3">{formatDate(e.day, true)}</span>
                <span className={cx('grid size-6 shrink-0 place-items-center rounded-lg', e.tone === 'good' ? 'bg-good/15 text-good' : e.tone === 'bad' ? 'bg-bad/15 text-bad' : e.tone === 'gold' ? 'bg-gold/20 text-gold' : 'bg-bg2 text-ink2')}>
                  <Icon name={e.icon} size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate">{e.text}</span>
                <span className="num shrink-0 text-[11px] text-ink3">{Math.ceil((e.day - s.day) / 7) <= 1 ? 'this week' : `${Math.ceil((e.day - s.day) / 7)} wks`}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Selling now" right={<Link onClick={() => open('releases')}>All games</Link>}>
          {selling.length === 0 ? (
            <p className="text-xs text-ink3">Nothing on shelves right now.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {selling.map(({ r, last }) => (
                <li key={r.id}>
                  <button type="button" onClick={() => pushModal({ kind: 'release', releaseId: r.id })} className="flex w-full justify-between gap-2 rounded-lg px-1 py-0.5 hover:bg-bg2">
                    <span className="truncate">{r.name}</span>
                    <span className="num shrink-0 text-ink3">{fmtUnits(last)}/wk</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`${yr} so far`} right={<Link onClick={() => open('finance')}>Finance</Link>}>
          <dl className="grid grid-cols-2 gap-1.5 text-xs">
            <Stat label="Revenue" value={fmtMoney(revenue)} />
            <Stat label="Profit" value={fmtMoney(revenue - expense)} tone={revenue - expense >= 0 ? 'good' : 'bad'} />
            <Stat label="Games shipped" value={String(shippedThisYear.length)} />
            <Stat label="Monthly burn" value={fmtMoney(monthlyBurn(s))} />
          </dl>
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-bg2/70 p-2">
      <dt className="text-ink3">{label}</dt>
      <dd className={cx('num font-semibold', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad')}>{value}</dd>
    </div>
  );
}

function Link({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-semibold text-accent hover:underline">
      {children} →
    </button>
  );
}
