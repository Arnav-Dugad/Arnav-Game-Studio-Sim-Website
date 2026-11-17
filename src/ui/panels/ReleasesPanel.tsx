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
  const all = s.releaseOrder.map((id) => s.releases[id]!).filter(Boolean);
  if (!all.length) return <Empty icon="library" title="No games released yet">Your shipped games, sales curves and reviews will live here.</Empty>;
  const rels = all.filter((r) => !selling || r.active).sort(SORTS[sort]);
  const total = all.reduce((t, r) => t + r.units, 0);
  return (
    <div className="space-y-3">
      {all.length > 3 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink2">
            <input type="checkbox" checked={selling} onChange={(e) => setSelling(e.target.checked)} className="accent-[var(--accent)]" />
            Still selling only
          </label>
        </div>
      )}
      {all.length > 3 && (
        <p className="text-xs text-ink3">
          {all.length} games · {fmtUnits(total)} copies sold in total · {all.filter((r) => r.active).length} still selling
        </p>
      )}
      {rels.length === 0 && <p className="text-xs text-ink3">Nothing is selling right now.</p>}
      <ul className="space-y-2">
        {rels.map((r) => {
          const base = r.concept.expansionOf ? s.releases[r.concept.expansionOf] : undefined;
          return (
            <li key={r.id}>
              <button type="button" onClick={() => pushModal({ kind: 'release', releaseId: r.id })} className="flex w-full items-center gap-3 rounded-2xl border border-line p-2 text-left hover:bg-bg2">
                <Cover title={r.name} genre={r.concept.genre} topic={r.concept.topic} seed={r.day} size={56} score={r.score} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{r.name}</span>
                    {saleRunning(s, r) ? <Pill tone="accent">Discounted</Pill> : r.active && <Pill tone="good">Selling</Pill>}
                    {base && <Pill tone="tech">Expansion</Pill>}
                    {r.concept.remasterOf && <Pill tone="gold">Remaster</Pill>}
                    {r.awards.length > 0 && <Pill tone="gold">🏆 {r.awards.length}</Pill>}
                  </div>
                  <div className="truncate text-xs text-ink3">
                    {GENRE_BY_ID[r.concept.genre].name} · {formatDate(r.day, false)} · users {r.userScore}
                    {base ? ` · for ${base.name}` : ''}
                  </div>
                  <div className="num text-xs">
                    {fmtUnits(r.units)} sold · <span className={cx(r.net >= r.devCost ? 'text-good' : 'text-bad')}>{fmtMoney(r.net)}</span>
                  </div>
                </div>
                <Sparkline values={r.weekly.slice(0, 52).length > 1 ? r.weekly.slice(0, 52) : [0, 0]} width={70} height={26} ariaLabel={`${r.name} weekly sales`} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
