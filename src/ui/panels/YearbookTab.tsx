import { memo } from 'react';
import { LineChart } from '../charts/LineChart';
import { fmtMoney, fmtUnits } from '@/sim/util';
import { tierDef } from '@/sim/systems/office';
import { ROLE_NAMES } from '@/sim/systems/staff';
import type { Role, YearbookPhoto } from '@/sim/types';
import { Avatar, InitialsBadge } from '../art/Avatar';
import { Empty } from '../components/ui';
import { useGame } from '../store';

/** Backdrops by office tier: a garage door, office walls, a studio, a campus. */
const BACKDROP = ['#9aa1a8', '#d9c9ad', '#b9cbd8', '#c7d6b8', '#d6c3dc', '#e6d2a8'];

/** Lay faces out like a class photo: a front row of ~6, then rows behind, each a little smaller. */
function rows<T>(items: T[]): T[][] {
  const out: T[][] = [];
  let i = 0;
  let size = Math.min(7, Math.max(3, Math.ceil(items.length / 3)));
  while (i < items.length) {
    out.push(items.slice(i, i + size));
    i += size;
    size += 1;
  }
  return out;
}

const Photo = memo(function Photo({ p, company, honours }: { p: YearbookPhoto; company: string; honours?: string }) {
  const rs = rows(p.faces);
  const bg = BACKDROP[(p.tier - 1) % BACKDROP.length] ?? BACKDROP[0]!;
  return (
    <figure className="rounded-2xl border border-line bg-bg2/50 p-2.5 shadow-sm">
      <div className="relative overflow-hidden rounded-lg px-2 pb-2 pt-3" style={{ background: `linear-gradient(${bg}, color-mix(in srgb, ${bg} 70%, #000 30%))` }}>
        <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.18))' }} />
        {/* back rows on top, the front row (founder first) at the bottom, overlapping like risers */}
        <div className="relative flex flex-col items-center">
          {[...rs].reverse().map((row, i) => {
            const ri = rs.length - 1 - i; // 0 = front row
            const size = Math.min(48 - ri * 5, Math.floor(220 / row.length) + 3);
            return (
              <div key={ri} className="flex justify-center" style={{ marginTop: i === 0 ? 0 : -Math.round(size * 0.28), zIndex: i }}>
                {row.map((f, fi) => (
                  <span key={fi} className="-mx-0.5" title={`${f.name} · ${ROLE_NAMES[f.role as Role] ?? f.role}`}>
                    {f.legend ? <InitialsBadge name={f.name} size={size} legendary /> : <Avatar seed={f.look} size={size} mood={Math.max(30, f.mood)} />}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="mt-2 text-center">
        <div className="font-display text-base font-semibold">
          {company} · {p.year}
        </div>
        <div className="text-xs text-ink3">
          {p.people} {p.people === 1 ? 'person' : 'people'}
          {p.people > p.faces.length ? ` (${p.faces.length} pictured)` : ''} · {tierDef(p.tier).name}
          {p.morale < 45 ? ' · a hard year' : p.morale >= 75 ? ' · a great year' : ''}
        </div>
        {(p.games.length > 0 || p.awards > 0) && (
          <div className="mt-0.5 text-xs text-ink2">
            {p.games.length > 0 && <>Shipped {p.games.join(', ')}</>}
            {p.awards > 0 && <>{p.games.length > 0 ? ' · ' : ''}🏆 {p.awards}</>}
          </div>
        )}
        {honours && <div className="mt-0.5 text-[11px] text-gold">🏆 {honours}</div>}
      </figcaption>
    </figure>
  );
});

export function YearbookTab() {
  const s = useGame((g) => g.s)!;
  const book = [...(s.yearbook ?? [])].reverse();
  if (!book.length) return <Empty icon="people" title="No photos yet">The first team photo is taken on New Year’s Day. Come back in January!</Empty>;
  return (
    <div>
      <OverTheYears book={[...book].reverse()} />
      <p className="mb-3 text-xs text-ink3">Every New Year’s Day the team lines up for a photo — the founder in front, then whoever’s been here longest. Their faces show how the year went.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {book.map((p) => (
          <Photo key={p.year} p={p} company={s.company.name} honours={(s.studioAwards ?? []).find((a) => a.year === p.year)?.winners.map((w) => `${w.category}: ${w.name.split(' ')[0]}`).join(' · ')} />
        ))}
      </div>
    </div>
  );
}

/** The studio's arc in four small charts, from the yearbook's numbers. */
function OverTheYears({ book }: { book: YearbookPhoto[] }) {
  const rows = book.filter((p) => p.revenue !== undefined);
  if (rows.length < 2) return null;
  const series = (name: string, get: (p: YearbookPhoto) => number) => [{ name, points: rows.map((p) => ({ x: p.year, y: get(p) })) }];
  const charts: { title: string; data: ReturnType<typeof series>; fmt?: (v: number) => string }[] = [
    { title: 'People', data: series('People', (p) => p.people) },
    { title: 'Reputation', data: series('Reputation', (p) => p.reputation ?? 0) },
    { title: 'Fans', data: series('Fans', (p) => p.fans ?? 0), fmt: (v) => fmtUnits(v) },
    { title: 'Revenue', data: series('Revenue', (p) => p.revenue ?? 0), fmt: (v) => fmtMoney(v) },
  ];
  return (
    <div className="mb-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink3">Over the years</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {charts.map((c) => (
          <div key={c.title} className="rounded-xl border border-line p-2">
            <div className="text-xs font-semibold">{c.title}</div>
            <LineChart ariaLabel={`${c.title} by year`} height={110} area series={c.data} xFormat={(x) => String(Math.round(x))} {...(c.fmt ? { yFormat: c.fmt } : {})} />
          </div>
        ))}
      </div>
    </div>
  );
}
