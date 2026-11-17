/**
 * Team picker that scales to big studios: search, role filters, sort by fit for the genre, one-click
 * "best team", and a capacity counter. Used by the new-game wizard and the project team editor.
 */
import { useMemo, useState } from 'react';
import type { GenreId } from '@/data/types';
import type { Role, Staff } from '@/sim/types';
import { Button, cx, inputCls } from './ui';
import { Icon } from '../icons';
import { Face } from '../panels/staffBits';
import { autoPickTeam, genreFit, matchesQuery, roleName, topSkill } from '../panels/staffTools';

type Sort = 'fit' | 'skill' | 'morale' | 'name';

export function StaffPicker({
  pool,
  selected,
  onChange,
  cap,
  genre,
  minOne = false,
  score,
  scoreLabel = 'fit',
}: {
  /** Everyone who could be on the team (including the current members). */
  pool: Staff[];
  selected: string[];
  onChange: (ids: string[]) => void;
  cap: number;
  genre?: GenreId;
  /** Keep at least one person on the team. */
  minOne?: boolean;
  /** Custom suitability score (0–100) instead of genre fit, e.g. programming for an engine. */
  score?: (st: Staff) => number;
  scoreLabel?: string;
}) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');
  const ranked = !!genre || !!score;
  const [sort, setSort] = useState<Sort>(ranked ? 'fit' : 'skill');
  const fit = useMemo(() => new Map(pool.map((st) => [st.id, score ? score(st) : genre ? genreFit(st, genre) : topSkill(st)])), [pool, genre, score]);
  const roles = useMemo(() => {
    const m = new Map<Role, number>();
    for (const st of pool) m.set(st.role, (m.get(st.role) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pool]);
  const list = pool
    .filter((st) => (role === 'all' || st.role === role) && matchesQuery(st, q))
    .sort((a, b) => {
      // Current members first, then the chosen order.
      const sel = Number(selected.includes(b.id)) - Number(selected.includes(a.id));
      if (sel) return sel;
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'morale') return b.morale - a.morale;
      if (sort === 'skill') return topSkill(b) - topSkill(a);
      return (fit.get(b.id) ?? 0) - (fit.get(a.id) ?? 0);
    });
  const full = selected.length >= cap;
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      if (minOne && selected.length <= 1) return;
      onChange(selected.filter((x) => x !== id));
    } else if (!full) onChange([...selected, id]);
  };
  const best = genre ? autoPickTeam(pool, genre, cap) : score ? [...pool].sort((a, b) => (fit.get(b.id) ?? 0) - (fit.get(a.id) ?? 0)).slice(0, cap).map((x) => x.id) : null;
  const avgFit = selected.length ? selected.reduce((t, id) => t + (fit.get(id) ?? 0), 0) / selected.length : 0;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('num rounded-lg px-2 py-1 font-semibold', full ? 'bg-accent/15 text-accent' : 'bg-bg2')}>
          {selected.length}/{cap} picked
        </span>
        {ranked && selected.length > 0 && <span className="text-ink3">avg {scoreLabel} {Math.round(avgFit)}</span>}
        <span className="flex-1" />
        {best && (
          <Button size="sm" icon="sparkle" disabled={!best.length} onClick={() => onChange(best)} title="Pick the best available people for this genre (skills in the areas it needs, adjusted for morale and energy)">
            Best team
          </Button>
        )}
        {selected.length > (minOne ? 1 : 0) && (
          <Button size="sm" variant="ghost" onClick={() => onChange(minOne ? selected.slice(0, 1) : [])}>
            Clear
          </Button>
        )}
      </div>
      {pool.length > 6 && (
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink3" />
            <input className={cx(inputCls, 'h-8 pl-8 text-xs')} placeholder="Search name, role, trait…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search staff" />
          </label>
          <select className={cx(inputCls, 'h-8 !w-32 text-xs')} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            {ranked && <option value="fit">Best {scoreLabel}</option>}
            <option value="skill">Top skill</option>
            <option value="morale">Morale</option>
            <option value="name">Name</option>
          </select>
        </div>
      )}
      {roles.length > 1 && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Filter by role">
          {[['all', pool.length] as const, ...roles].map(([r, n]) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              className={cx('rounded-full border px-2 py-0.5 font-medium', role === r ? 'border-accent bg-accent text-accent-ink' : 'border-line hover:bg-bg2')}
            >
              {r === 'all' ? 'All' : roleName(r)} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <p className="py-2 text-ink3">{pool.length ? 'Nobody matches.' : 'Everyone is busy. Free someone up in the Staff panel, or hire.'}</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 scroll-thin">
          {list.map((st) => {
            const on = selected.includes(st.id);
            const f = Math.round(fit.get(st.id) ?? 0);
            const disabled = (!on && full) || (on && minOne && selected.length <= 1);
            return (
              <li key={st.id}>
                <label className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1', on ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2', disabled && !on && 'opacity-45')}>
                  <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(st.id)} className="accent-[var(--accent)]" />
                  <Face p={st} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{st.name}</span>
                    <span className="block truncate text-[11px] text-ink3">
                      {st.level} {roleName(st.role)}
                      {st.assignment.kind === 'research' ? ' · researching' : ''}
                      {st.burnout >= 60 ? ' · burning out' : ''}
                    </span>
                  </span>
                  <span className="w-16 shrink-0" title={ranked ? `${scoreLabel}: ${f}` : `Top skill: ${f}`}>
                    <span className="mb-0.5 flex justify-between text-[10px] text-ink3">
                      <span>{ranked ? scoreLabel : 'skill'}</span>
                      <span className="num font-semibold text-ink">{f}</span>
                    </span>
                    <span className="block h-1 overflow-hidden rounded-full bg-bg2">
                      <span className={cx('block h-full rounded-full', f >= 60 ? 'bg-good' : f >= 35 ? 'bg-accent' : 'bg-ink3')} style={{ width: `${Math.min(100, f)}%` }} />
                    </span>
                  </span>
                  <span className={cx('size-2 shrink-0 rounded-full', st.morale >= 65 ? 'bg-good' : st.morale >= 40 ? 'bg-warn' : 'bg-bad')} title={`Morale ${Math.round(st.morale)}`} />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
