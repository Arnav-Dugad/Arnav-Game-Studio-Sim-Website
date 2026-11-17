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

function Photo({ p, company }: { p: YearbookPhoto; company: string }) {
  const rs = rows(p.faces);
  const bg = BACKDROP[(p.tier - 1) % BACKDROP.length] ?? BACKDROP[0]!;
  return (
    <figure className="rounded-2xl border border-line bg-[#fbf8f2] p-2.5 shadow-sm dark:bg-[#2a2622]">
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
            {p.awards > 0 && <> · 🏆 {p.awards}</>}
          </div>
        )}
      </figcaption>
    </figure>
  );
}

export function YearbookTab() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const book = [...(s.yearbook ?? [])].reverse();
  if (!book.length) return <Empty icon="people" title="No photos yet">The first team photo is taken on New Year’s Day. Come back in January!</Empty>;
  return (
    <div>
      <p className="mb-3 text-xs text-ink3">Every New Year’s Day the team lines up for a photo — the founder in front, then whoever’s been here longest. Their faces show how the year went.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {book.map((p) => (
          <Photo key={p.year} p={p} company={s.company.name} />
        ))}
      </div>
    </div>
  );
}
