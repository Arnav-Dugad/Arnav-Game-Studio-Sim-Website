import { GENRE_BY_ID } from '@/data/genres';
import { formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits } from '@/sim/util';
import { Empty, Pill, cx } from '../components/ui';
import { Cover } from '../art/Cover';
import { Sparkline } from '../charts';
import { useGame } from '../store';

export default function ReleasesPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const pushModal = useGame((g) => g.pushModal);
  const rels = [...s.releaseOrder].reverse().map((id) => s.releases[id]!);
  if (!rels.length) return <Empty icon="library" title="No games released yet">Your shipped games, sales curves and reviews will live here.</Empty>;
  return (
    <ul className="space-y-2">
      {rels.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => pushModal({ kind: 'release', releaseId: r.id })} className="flex w-full items-center gap-3 rounded-2xl border border-line p-2 text-left hover:bg-bg2">
            <Cover title={r.name} genre={r.concept.genre} topic={r.concept.topic} seed={r.day} size={56} score={r.score} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{r.name}</span>
                {r.active && <Pill tone="good">On sale</Pill>}
                {r.awards.length > 0 && <Pill tone="gold">🏆 {r.awards.length}</Pill>}
              </div>
              <div className="truncate text-xs text-ink3">
                {GENRE_BY_ID[r.concept.genre].name} · {formatDate(r.day, false)} · users {r.userScore}
              </div>
              <div className="num text-xs">
                {fmtUnits(r.units)} sold · <span className={cx(r.net >= r.devCost ? 'text-good' : 'text-bad')}>{fmtMoney(r.net)}</span>
              </div>
            </div>
            <Sparkline values={r.weekly.slice(0, 52).length > 1 ? r.weekly.slice(0, 52) : [0, 0]} width={70} height={26} ariaLabel={`${r.name} weekly sales`} />
          </button>
        </li>
      ))}
    </ul>
  );
}
