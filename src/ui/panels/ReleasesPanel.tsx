import { useState } from 'react';
import { GENRE_BY_ID } from '@/data/genres';
import { formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits } from '@/sim/util';
import type { Release } from '@/sim/types';
import { Empty, Pill, Segmented, cx } from '../components/ui';
import { Cover } from '../art/Cover';
import { Sparkline } from '../charts';
import { useGame } from '../store';

type Sort = 'new' | 'score' | 'units' | 'profit';
const SORTS: Record<Sort, (a: Release, b: Release) => number> = {
  new: (a, b) => b.day - a.day,
  score: (a, b) => b.score - a.score || b.day - a.day,
  units: (a, b) => b.units - a.units,
  profit: (a, b) => b.net - b.devCost - (a.net - a.devCost),
};

/** A storefront discount counts as "running" for the three weeks after it starts. */
export function saleRunning(s: { day: number }, r: Release): boolean {
  return r.lastSaleDay !== undefined && s.day - r.lastSaleDay < 21;
}

export default function ReleasesPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const pushModal = useGame((g) => g.pushModal);
  const [sort, setSort] = useState<Sort>('new');
  const [selling, setSelling] = useState(false);
  const [view, setView] = useState<'list' | 'shelf' | 'stats'>(() => {
    try {
      const v = localStorage.getItem('ase:gamesView');
      return v === 'shelf' || v === 'stats' ? v : 'list';
    } catch {
      return 'list';
    }
  });
  const pickView = (v: 'list' | 'shelf' | 'stats') => {
    setView(v);
    try {
      localStorage.setItem('ase:gamesView', v);
    } catch {
      /* private mode */
    }
  };
  const all = s.releaseOrder.map((id) => s.releases[id]!).filter(Boolean);
  if (!all.length)
    return (
      <Empty icon="library" title="No games released yet">
        Your shipped games, sales curves and reviews will live here.
      </Empty>
    );
  const rels = all.filter((r) => !selling || r.active).sort(SORTS[sort]);
  // The remembered view is global; with fewer than two games the toggle is hidden, so show the list.
  const shown = all.length > 1 ? view : 'list';
  const total = all.reduce((t, r) => t + r.units, 0);
  return (
    <div className="space-y-3">
      {all.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {view !== 'stats' && (
            <Segmented<Sort>
              ariaLabel="Sort games"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'new', label: 'Newest' },
                { value: 'score', label: 'Best' },
                { value: 'units', label: 'Best-selling' },
                { value: 'profit', label: 'Profit' },
              ]}
            />
          )}
          <Segmented<'list' | 'shelf' | 'stats'>
            ariaLabel="View"
            value={view}
            onChange={pickView}
            options={[
              { value: 'list', label: 'List' },
              { value: 'shelf', label: 'Shelf' },
              { value: 'stats', label: 'Stats' },
            ]}
          />
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink2">
            <input
              type="checkbox"
              checked={selling}
              onChange={(e) => setSelling(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Still selling only
          </label>
        </div>
      )}
      {all.length > 3 && (
        <p className="text-xs text-ink3">
          {all.length} games · {fmtUnits(total)} copies sold in total · {all.filter((r) => r.active).length}{' '}
          still selling
        </p>
      )}
      {rels.length === 0 && <p className="text-xs text-ink3">Nothing is selling right now.</p>}
      {shown === 'stats' ? (
        <GenreStats rels={rels} />
      ) : shown === 'shelf' ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4" aria-label="Your games shelf">
          {rels.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => pushModal({ kind: 'release', releaseId: r.id })}
                className="group block w-full text-left"
                title={`${r.name} · ${r.score} · ${fmtUnits(r.units)} sold`}
              >
                <div className="relative transition group-hover:-translate-y-1">
                  <Cover
                    title={r.name}
                    genre={r.concept.genre}
                    topic={r.concept.topic}
                    seed={r.day}
                    size={120}
                    score={r.score}
                    className="h-auto w-full rounded-[6%] shadow-md"
                  />
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold">
                  <span className="truncate">{r.name}</span>
                  {r.awards.length > 0 && (
                    <span className="shrink-0 text-gold" title={r.awards.join(', ')}>
                      🏆{r.awards.length > 1 ? r.awards.length : ''}
                    </span>
                  )}
                </div>
                <div className="truncate text-[10px] text-ink3">
                  {formatDate(r.day, false)} · {fmtUnits(r.units)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {rels.map((r) => {
            const base = r.concept.expansionOf ? s.releases[r.concept.expansionOf] : undefined;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => pushModal({ kind: 'release', releaseId: r.id })}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line p-2 text-left hover:bg-bg2"
                >
                  <Cover
                    title={r.name}
                    genre={r.concept.genre}
                    topic={r.concept.topic}
                    seed={r.day}
                    size={56}
                    score={r.score}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{r.name}</span>
                      {saleRunning(s, r) ? (
                        <Pill tone="accent">Discounted</Pill>
                      ) : (
                        r.active && <Pill tone="good">Selling</Pill>
                      )}
                      {base && <Pill tone="tech">Expansion</Pill>}
                      {r.concept.remasterOf && <Pill tone="gold">Remaster</Pill>}
                      {r.awards.length > 0 && <Pill tone="gold">🏆 {r.awards.length}</Pill>}
                    </div>
                    <div className="truncate text-xs text-ink3">
                      {GENRE_BY_ID[r.concept.genre].name} · {formatDate(r.day, false)} · users {r.userScore}
                      {base ? ` · for ${base.name}` : ''}
                    </div>
                    <div className="num text-xs">
                      {fmtUnits(r.units)} sold ·{' '}
                      <span className={cx(r.net >= r.devCost ? 'text-good' : 'text-bad')}>
                        {fmtMoney(r.net)}
                      </span>
                    </div>
                  </div>
                  <Sparkline
                    values={r.weekly.slice(0, 52).length > 1 ? r.weekly.slice(0, 52) : [0, 0]}
                    width={70}
                    height={26}
                    ariaLabel={`${r.name} weekly sales`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Your track record by genre: what your studio is actually good at. */
function GenreStats({ rels }: { rels: Release[] }) {
  const pushModal = useGame((g) => g.pushModal);
  const rows = Object.values(
    rels.reduce<
      Record<
        string,
        { genre: string; n: number; score: number; units: number; profit: number; best: Release }
      >
    >((acc, r) => {
      const k = r.concept.genre;
      const row = (acc[k] ??= { genre: k, n: 0, score: 0, units: 0, profit: 0, best: r });
      row.n += 1;
      row.score += r.score;
      row.units += r.units;
      row.profit += r.net - r.devCost;
      if (r.score > row.best.score) row.best = r;
      return acc;
    }, {}),
  ).sort((a, b) => b.profit - a.profit);
  if (!rows.length) return <p className="text-xs text-ink3">Nothing matches the filter.</p>;
  const maxProfit = Math.max(1, ...rows.map((r) => Math.abs(r.profit)));
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-ink3">
        Sorted by lifetime profit. Hover a bar for details; click a best game to open it.
      </p>
      {rows.map((r) => (
        <div key={r.genre} className="rounded-xl border border-line p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              {GENRE_BY_ID[r.genre as keyof typeof GENRE_BY_ID]?.name ?? r.genre}
            </span>
            <span className="num text-ink3">
              {r.n} game{r.n === 1 ? '' : 's'} · avg {Math.round(r.score / r.n)} · {fmtUnits(r.units)} sold
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg2"
            title={`${fmtMoney(r.profit)} lifetime profit`}
          >
            <div
              className={cx('h-full rounded-full', r.profit >= 0 ? 'bg-good' : 'bg-bad')}
              style={{ width: `${Math.max(2, (Math.abs(r.profit) / maxProfit) * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className={cx('num font-semibold', r.profit >= 0 ? 'text-good' : 'text-bad')}>
              {fmtMoney(r.profit)} profit
            </span>
            <button
              type="button"
              className="truncate text-ink2 hover:underline"
              onClick={() => pushModal({ kind: 'release', releaseId: r.best.id })}
            >
              Best: {r.best.name} ({r.best.score})
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
