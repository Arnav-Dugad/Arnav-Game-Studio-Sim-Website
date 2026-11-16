import { useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { LiveRegion } from './LineChart';
import { cursorStep, formatCompact, formatPct, seriesColor } from './palette';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color?: string;
}
export interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: ReactNode;
  centerValue?: ReactNode;
  className?: string;
  ariaLabel: string;
  /** Formatter for slice values shown on hover (default compact). */
  valueFormat?: (v: number) => string;
}

export function Donut({ slices, size = 120, thickness = 16, centerLabel, centerValue, className, ariaLabel, valueFormat }: DonutProps) {
  const [active, setActive] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const fv = valueFormat ?? formatCompact;

  const r = Math.max(1, (size - thickness) / 2 - 2);
  const c = size / 2;
  const circ = 2 * Math.PI * r;

  const arcs = useMemo(() => {
    const valid = slices.map((s, i) => ({ ...s, value: Number.isFinite(s.value) && s.value > 0 ? s.value : 0, color: s.color ?? seriesColor(i) }));
    const total = valid.reduce((a, s) => a + s.value, 0);
    const visible = valid.filter((s) => s.value > 0);
    const gap = visible.length > 1 ? Math.min(2, circ * 0.01) : 0;
    const out: (DonutSlice & { color: string; share: number; dash: string; offset: number })[] = [];
    let acc = 0;
    for (const s of visible) {
      const len = total > 0 ? (s.value / total) * circ : 0;
      const drawn = Math.max(0.001, len - Math.min(gap, len * 0.5));
      out.push({ ...s, share: total > 0 ? s.value / total : 0, dash: `${drawn} ${circ - drawn}`, offset: -acc });
      acc += len;
    }
    return { list: out, total };
  }, [slices, circ]);

  const n = arcs.list.length;
  const idx = active !== null && active < n ? active : null;
  const cur = idx !== null ? arcs.list[idx] : undefined;

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const next = cursorStep(e.key, idx, n);
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
    setKeyboard(true);
  };

  const desc = arcs.list.map((s) => `${s.label} ${formatPct(s.share)}`).join(', ');
  const liveText = keyboard && cur ? `${cur.label}: ${fv(cur.value)}, ${formatPct(cur.share)}` : '';

  return (
    <div className={`relative inline-block shrink-0 ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={desc ? `${ariaLabel}: ${desc}` : `${ariaLabel}: no data`}
        tabIndex={n > 0 ? 0 : undefined}
        className="block select-none"
        onKeyDown={onKeyDown}
        onPointerLeave={() => !keyboard && setActive(null)}
        onBlur={() => {
          setActive(null);
          setKeyboard(false);
        }}
      >
        <title>{ariaLabel}</title>
        <circle cx={c} cy={c} r={r} fill="none" style={{ stroke: 'var(--line)' }} strokeWidth={thickness} />
        <g transform={`rotate(-90 ${c} ${c})`}>
          {arcs.list.map((s, i) => (
            <circle
              key={s.key}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              style={{ stroke: s.color, transition: 'stroke-width 120ms ease-out, opacity 120ms ease-out' }}
              strokeWidth={idx === i ? thickness + 4 : thickness}
              strokeDasharray={s.dash}
              strokeDashoffset={s.offset}
              opacity={idx === null || idx === i ? 1 : 0.4}
              onPointerEnter={() => {
                setActive(i);
                setKeyboard(false);
              }}
            >
              <title>{`${s.label}: ${fv(s.value)} (${formatPct(s.share)})`}</title>
            </circle>
          ))}
        </g>
      </svg>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center leading-tight" style={{ padding: thickness + 4 }}>
        {cur ? (
          <>
            <span className="font-display text-base font-semibold text-ink num">{formatPct(cur.share)}</span>
            <span className="max-w-full truncate text-[10.5px] text-ink3">{cur.label}</span>
          </>
        ) : arcs.total <= 0 ? (
          <span className="text-[11px] text-ink3">No data yet</span>
        ) : (
          <>
            {centerValue !== undefined && <span className="font-display text-base font-semibold text-ink num">{centerValue}</span>}
            {centerLabel !== undefined && <span className="max-w-full truncate text-[10.5px] text-ink3">{centerLabel}</span>}
          </>
        )}
      </div>
      <LiveRegion text={liveText} />
    </div>
  );
}
