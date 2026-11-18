/** Shared UI primitives. */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Breakdown } from '@/sim/breakdown';
import { Icon, type IconName } from '../icons';
import { sound } from '../sound';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: IconName }) {
  const v: Record<Variant, string> = {
    primary: 'bg-accent text-accent-ink hover:brightness-110 shadow-sm',
    secondary: 'bg-panel2 text-ink hover:bg-bg2 border border-line',
    ghost: 'text-ink2 hover:text-ink hover:bg-bg2',
    danger: 'bg-bad text-white hover:brightness-110',
    gold: 'bg-gold text-[#2a2622] hover:brightness-110 shadow-sm',
  };
  const s = { sm: 'h-8 px-2.5 text-xs gap-1.5', md: 'h-9 px-3.5 text-sm gap-2', lg: 'h-11 px-5 text-base gap-2' }[size];
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none select-none whitespace-nowrap',
        v[variant],
        s,
        className,
      )}
      onClick={(e) => {
        sound.play('click');
        onClick?.(e);
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cx(
        'inline-grid place-items-center size-9 rounded-xl transition active:scale-95',
        active ? 'bg-accent text-accent-ink' : 'text-ink2 hover:text-ink hover:bg-bg2',
        className,
      )}
      {...rest}
      onClick={(e) => {
        sound.play('click');
        rest.onClick?.(e);
      }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'good' | 'bad' | 'neutral' | 'gold' | 'accent' | 'tech'; className?: string }) {
  const t = {
    good: 'bg-good/15 text-good',
    bad: 'bg-bad/15 text-bad',
    neutral: 'bg-bg2 text-ink2',
    gold: 'bg-gold/20 text-gold-ink',
    accent: 'bg-accent/15 text-accent',
    tech: 'bg-tech/15 text-tech',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', t, className)}>{children}</span>;
}

export function Meter({ value, max = 100, tone, className, label }: { value: number; max?: number; tone?: 'auto' | 'accent' | 'gold' | 'tech'; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const color =
    tone === 'accent' ? 'bg-accent' : tone === 'gold' ? 'bg-gold' : tone === 'tech' ? 'bg-tech' : pct > 0.66 ? 'bg-good' : pct > 0.33 ? 'bg-warn' : 'bg-bad';
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-bg2', className)} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

/** Explains a number: renders a Breakdown as a readable list. */
export function BreakdownList({ bd, format = (v: number) => v.toFixed(2), title, result = 'Result' }: { bd: Breakdown; format?: (v: number) => string; title?: string; result?: string }) {
  return (
    <div className="min-w-56 text-xs">
      {title && <div className="mb-1.5 font-semibold text-ink">{title}</div>}
      <ul className="space-y-1">
        {bd.parts.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-4">
            <span className="text-ink2">{p.label}</span>
            <span className={cx('num font-semibold', p.kind === 'base' || (p.kind === 'mul' && Math.abs(p.value - 1) < 0.005) ? 'text-ink' : (p.kind === 'mul' ? p.value >= 1 : p.value >= 0) ? 'text-good' : 'text-bad')}>
              {p.kind === 'mul' ? `×${p.value.toFixed(2)}` : p.kind === 'add' ? `${p.value >= 0 ? '+' : ''}${format(p.value)}` : format(p.value)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-semibold">
        <span>{result}</span>
        <span className="num">{format(bd.total)}</span>
      </div>
    </div>
  );
}

/**
 * A button for something you can't undo: the first click asks (in place, in the game's own style), the second does it.
 * The button keeps its size (so the second click lands where the first did); the question shows in a bubble below it.
 * It disarms itself after a few seconds.
 */
export function ConfirmButton({ ask, onConfirm, children, ...rest }: Omit<Parameters<typeof Button>[0], 'onClick'> & { ask: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <span className="relative inline-flex">
      <Button
        {...rest}
        variant={armed ? 'danger' : rest.variant}
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          onConfirm();
        }}
      >
        {armed ? 'Confirm' : children}
      </Button>
      {armed && (
        <span role="status" className="glass absolute right-0 top-full z-20 mt-1 w-60 rounded-xl p-2 text-left text-xs text-ink2 shadow-lg">
          {ask} <b className="text-ink">Click again to confirm.</b>
        </span>
      )}
    </span>
  );
}

/** Hover/focus tooltip. Content can be any node (e.g. a BreakdownList). */
export function Tip({ content, children, className, side = 'top' }: { content: ReactNode; children: ReactNode; className?: string; side?: 'top' | 'bottom' | 'right' | 'left' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = side === 'right' ? r.right + 8 : side === 'left' ? r.left - 8 : r.left + r.width / 2;
    const y = side === 'bottom' ? r.bottom + 8 : side === 'top' ? r.top - 8 : r.top + r.height / 2;
    setPos({ x, y });
    setOpen(true);
  };
  return (
    <span
      ref={ref}
      className={cx('inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="glass pointer-events-none fixed z-[200] max-w-80 rounded-xl px-3 py-2 text-xs text-ink animate-pop"
            style={{
              left: pos.x,
              top: pos.y,
              transform:
                side === 'top' ? 'translate(-50%, -100%)' : side === 'bottom' ? 'translate(-50%, 0)' : side === 'right' ? 'translate(0, -50%)' : 'translate(-100%, -50%)',
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Accessible modal dialog with focus trap-lite and Escape to close. */
export function Modal({
  open,
  onClose,
  children,
  title,
  wide,
  dismissable = true,
  labelledBy,
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  title?: string;
  wide?: boolean;
  dismissable?: boolean;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        closeRef.current?.();
      }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const a = f[0]!;
        const b = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, dismissable]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-up" onClick={() => dismissable && onClose?.()} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        className={cx('glass relative max-h-[90vh] w-full overflow-y-auto scroll-pb-20 rounded-2xl p-5 scroll-thin animate-pop', wide ? 'max-w-3xl' : 'max-w-lg')}
      >
        {dismissable && onClose && (
          <button type="button" aria-label="Close" className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-ink3 hover:bg-bg2 hover:text-ink" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink2">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-ink3">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] font-medium text-bad">{error}</span>}
    </label>
  );
}

export const inputCls =
  'h-10 w-full rounded-xl border border-line bg-panel2 px-3 text-sm text-ink placeholder:text-ink3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

export function Segmented<T extends string | number>({ value, options, onChange, ariaLabel, className }: { value: T; options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]; onChange: (v: T) => void; ariaLabel: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx('inline-flex flex-wrap gap-1 rounded-xl bg-bg2 p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => {
            sound.play('click');
            onChange(o.value);
          }}
          className={cx(
            'rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40',
            o.value === value ? 'bg-panel text-ink shadow-sm' : 'text-ink2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-8 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-bg2 text-ink3">
        <Icon name={icon} size={20} />
      </span>
      <div className="text-sm font-semibold">{title}</div>
      {children && <div className="max-w-xs text-xs text-ink3">{children}</div>}
    </div>
  );
}

export function Section({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mb-5', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-ink3">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-bg2/70 px-3 py-2">
      <div className="text-[11px] font-medium text-ink3">{label}</div>
      <div className={cx('num font-display text-lg font-semibold', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad')}>{value}</div>
      {sub && <div className="text-[11px] text-ink3">{sub}</div>}
    </div>
  );
}
