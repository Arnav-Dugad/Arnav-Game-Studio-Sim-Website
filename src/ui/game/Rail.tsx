import type { IconName } from '../icons';
import { Icon } from '../icons';
import { cx } from '../components/ui';
import { useGame, type PanelId } from '../store';

const ITEMS: { id: PanelId; icon: IconName; label: string; key: string }[] = [
  { id: 'develop', icon: 'develop', label: 'Develop', key: 'N' },
  { id: 'staff', icon: 'staff', label: 'Staff', key: 'H' },
  { id: 'office', icon: 'build', label: 'Office', key: 'B' },
  { id: 'research', icon: 'research', label: 'Research', key: 'R' },
  { id: 'market', icon: 'market', label: 'Market', key: 'M' },
  { id: 'releases', icon: 'library', label: 'Games', key: 'L' },
  { id: 'finance', icon: 'finance', label: 'Finance', key: 'F' },
  { id: 'company', icon: 'company', label: 'Company', key: 'C' },
  { id: 'news', icon: 'news', label: 'News', key: 'J' },
  { id: 'goals', icon: 'goals', label: 'Goals', key: 'G' },
];

export function Rail() {
  const panel = useGame((g) => g.panel);
  const openPanel = useGame((g) => g.openPanel);
  const s = useGame((g) => g.s);
  useGame((g) => g.v);
  const badge: Partial<Record<PanelId, number>> = {
    develop: s ? Object.values(s.projects).filter((p) => p.kind === 'game' && p.awaitingGate).length : 0,
    staff: s ? Object.values(s.staff).filter((x) => x.burnout > 70 || x.morale < 30 || (x.assignment.kind === 'idle' && x.role !== 'founder')).length : 0,
    research: s && !s.research.active && Object.values(s.staff).some((x) => x.assignment.kind === 'research') ? 1 : 0,
  };
  return (
    <nav
      aria-label="Game sections"
      className="glass absolute bottom-2 left-1/2 z-30 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 gap-0.5 overflow-x-auto rounded-2xl p-1 scroll-thin sm:bottom-auto sm:left-3 sm:top-1/2 sm:max-w-none sm:-translate-x-0 sm:-translate-y-1/2 sm:flex-col sm:overflow-visible"
    >
      {ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          data-tutorial={`rail-${it.id}`}
          onClick={() => openPanel(it.id)}
          aria-pressed={panel === it.id}
          title={`${it.label} (${it.key})`}
          className={cx(
            'group relative grid size-10 shrink-0 place-items-center rounded-xl transition sm:size-11',
            panel === it.id ? 'bg-accent text-accent-ink' : 'text-ink2 hover:bg-bg2 hover:text-ink',
          )}
        >
          <Icon name={it.icon} size={20} />
          <span className="sr-only">{it.label}</span>
          {!!badge[it.id] && <span className="absolute right-1 top-1 size-2 rounded-full bg-bad ring-2 ring-[var(--panel)]" />}
          <span aria-hidden className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs font-semibold text-bg opacity-0 transition group-hover:opacity-100 sm:block">
            {it.label} <span className="opacity-60">{it.key}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
