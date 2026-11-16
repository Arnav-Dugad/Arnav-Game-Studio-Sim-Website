import { useMemo } from 'react';
import { formatCompact } from './palette';

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Defaults to var(--good) when trending up (last ≥ first), else var(--bad). */
  color?: string;
  className?: string;
  /** Defaults to an automatic "Trend up/down from A to B" description. */
  ariaLabel?: string;
}

const PAD = 2.5;

export function Sparkline({ values, width = 80, height = 24, color, className, ariaLabel }: SparklineProps) {
  const geo = useMemo(() => {
    const v = values.filter((x) => Number.isFinite(x));
    if (v.length === 0) return null;
    const first = v[0]!;
    const last = v[v.length - 1]!;
    let min = Math.min(...v);
    let max = Math.max(...v);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const innerW = Math.max(1, width - PAD * 2);
    const innerH = Math.max(1, height - PAD * 2);
    const step = v.length > 1 ? innerW / (v.length - 1) : 0;
    const f = (n: number) => Math.round(n * 100) / 100;
    const pts = v.map((y, i) => [v.length > 1 ? PAD + i * step : PAD + innerW, PAD + (1 - (y - min) / (max - min)) * innerH] as const);
    const d =
      v.length > 1
        ? pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)},${f(y)}`).join('')
        : `M${f(PAD)},${f(pts[0]![1])}L${f(PAD + innerW)},${f(pts[0]![1])}`;
    const end = pts[pts.length - 1]!;
    return { d, endX: end[0], endY: end[1], up: last >= first, first, last };
  }, [values, width, height]);

  const stroke = color ?? (geo && !geo.up ? 'var(--bad)' : 'var(--good)');
  const label =
    ariaLabel ??
    (geo
      ? geo.first === geo.last
        ? `Flat at ${formatCompact(geo.last)}`
        : `Trend ${geo.up ? 'up' : 'down'} from ${formatCompact(geo.first)} to ${formatCompact(geo.last)}`
      : 'No data');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={`inline-block shrink-0 align-middle ${className ?? ''}`}>
      <title>{label}</title>
      {geo ? (
        <>
          <path d={geo.d} fill="none" style={{ stroke }} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={geo.endX} cy={geo.endY} r={2.25} style={{ fill: stroke }} />
        </>
      ) : (
        <line x1={PAD} x2={width - PAD} y1={height / 2} y2={height / 2} style={{ stroke: 'var(--line)' }} strokeWidth={1.5} strokeDasharray="2 3" strokeLinecap="round" />
      )}
    </svg>
  );
}
