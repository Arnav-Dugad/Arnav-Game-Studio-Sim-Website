import { fmtMoney } from '@/sim/util';
import { Icon, type IconName } from '../icons';
import { cx } from '../components/ui';
import { useGame } from '../store';
import { useSettings } from '../settings';

export function Toasts() {
  const toasts = useGame((g) => g.toasts);
  const dismiss = useGame((g) => g.dismissToast);
  return (
    <div className="pointer-events-none absolute right-3 top-44 z-40 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2 sm:top-[7.5rem] xl:top-20" aria-live="polite" role="status">
      {toasts.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cx(
            'glass pointer-events-auto flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm animate-fade-up',
            t.tone === 'bad' && 'border-bad/40',
            t.tone === 'gold' && 'border-gold/50',
          )}
        >
          <span
            className={cx(
              'grid size-7 shrink-0 place-items-center rounded-lg',
              t.tone === 'good' && 'bg-good/15 text-good',
              t.tone === 'bad' && 'bg-bad/15 text-bad',
              t.tone === 'gold' && 'bg-gold/20 text-gold-ink',
              t.tone === 'neutral' && 'bg-bg2 text-ink2',
            )}
          >
            <Icon name={(t.icon as IconName) ?? (t.tone === 'bad' ? 'warning' : 'info')} size={15} />
          </span>
          <span className="font-medium">{t.text}</span>
        </button>
      ))}
    </div>
  );
}

/** Floating "+$12k" numbers rising from the cash counter whenever sales land. */
export function NumberPops() {
  const pops = useGame((g) => g.pops);
  const enabled = useSettings((s) => s.numberPops);
  if (!enabled) return null;
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-40" aria-hidden>
      {pops
        .slice(-4)
        .map((p, i) => (
          <span
            key={p.id}
            className="num absolute whitespace-nowrap font-display text-base font-bold text-good drop-shadow"
            style={{ left: `calc(min(36vw, 470px) + ${i * 16}px)`, top: 104, animation: 'float-up 1.5s ease-out forwards' }}
          >
            +{fmtMoney(p.amount)}
          </span>
        ))}
    </div>
  );
}
