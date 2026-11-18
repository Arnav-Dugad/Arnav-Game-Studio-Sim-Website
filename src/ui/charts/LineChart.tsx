import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useElementSize } from './useSize';
import {
  AXIS_TEXT_STYLE as axisTextStyle,
  cursorStep,
  estimateTextWidth,
  formatCompact,
  formatX,
  innerTicks,
  nearestIndex,
  distinctTicks,
  seriesColor,
  svgSafeId,
} from './palette';

/* ------------------------------------------------------------------ */
/* Shared chart chrome (used by LineChart, StackedArea and BarChart)   */
/* ------------------------------------------------------------------ */


/** "No data yet" placeholder that occupies exactly the chart's height (no layout shift). */
export function ChartEmpty({ message = 'No data yet' }: { message?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center rounded-lg border border-dashed border-line text-xs text-ink3 select-none">
      {message}
    </div>
  );
}

/** Floating tooltip anchored to an x pixel; flips to the left side on the right half. */
export function ChartTooltip({
  x,
  top = 4,
  offset = 12,
  containerWidth,
  children,
}: {
  x: number;
  top?: number;
  /** Horizontal gap (px) between the anchor and the tooltip. */
  offset?: number;
  containerWidth: number;
  children: ReactNode;
}) {
  const flip = x > containerWidth / 2;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10 min-w-[8rem] rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11px] leading-snug whitespace-nowrap text-ink shadow-panel num"
      style={{ transform: `translate(${flip ? `calc(${x - offset}px - 100%)` : `${x + offset}px`}, ${top}px)` }}
    >
      {children}
    </div>
  );
}

/** One "swatch · name · value" row inside a tooltip. */
export function TooltipRow({ color, label, value, strong }: { color?: string; label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${strong ? 'font-semibold' : ''}`}>
      {color ? <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: color }} /> : <span className="inline-block size-2 shrink-0" />}
      <span className="min-w-0 flex-1 truncate text-ink2">{label}</span>
      <span className="pl-3 text-right tabular-nums">{value}</span>
    </div>
  );
}

export function ChartLegend({ items }: { items: { key: string; label: string; color: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink2" aria-hidden="true">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2.5 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** Polite live region — only fed while the user navigates with the keyboard. */
export function LiveRegion({ text }: { text: string }) {
  return (
    <div className="sr-only" role="status" aria-live="polite">
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LineChart                                                           */
/* ------------------------------------------------------------------ */

export interface LinePoint {
  x: number;
  y: number;
}
export interface LineSeries {
  name: string;
  color?: string;
  points: LinePoint[];
}
export interface LineChartProps {
  series: LineSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  xFormat?: (v: number) => string;
  className?: string;
  /** Gradient fill under the first series. */
  area?: boolean;
  ariaLabel: string;
}

const M_TOP = 10;
const M_RIGHT = 12;
const M_BOTTOM = 22;

/** Monotone cubic (Fritsch–Carlson) path through points with strictly increasing x. */
function monotonePath(px: readonly number[], py: readonly number[]): string {
  const n = px.length;
  if (n === 0) return '';
  const f = (v: number) => Math.round(v * 100) / 100;
  if (n === 1) return `M${f(px[0]!)},${f(py[0]!)}`;
  if (n === 2) return `M${f(px[0]!)},${f(py[0]!)}L${f(px[1]!)},${f(py[1]!)}`;
  const m: number[] = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = px[i + 1]! - px[i]!;
    m[i] = dx === 0 ? 0 : (py[i + 1]! - py[i]!) / dx;
  }
  const t: number[] = new Array<number>(n);
  t[0] = m[0]!;
  t[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const a = m[i - 1]!;
    const b = m[i]!;
    t[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const mi = m[i]!;
    if (mi === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i]! / mi;
    const b = t[i + 1]! / mi;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * mi;
      t[i + 1] = tau * b * mi;
    }
  }
  let d = `M${f(px[0]!)},${f(py[0]!)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = px[i]!;
    const x1 = px[i + 1]!;
    const h = (x1 - x0) / 3;
    d += `C${f(x0 + h)},${f(py[i]! + t[i]! * h)},${f(x1 - h)},${f(py[i + 1]! - t[i + 1]! * h)},${f(x1)},${f(py[i + 1]!)}`;
  }
  return d;
}

interface SeriesModel {
  name: string;
  color: string;
  line: string;
  byX: Map<number, number>;
}

interface LineModel {
  left: number;
  innerW: number;
  innerH: number;
  xs: number[];
  xPx: number[];
  sy: (y: number) => number;
  yTicks: { v: number; py: number; label: string }[];
  xTicks: { px: number; label: string; anchor: 'start' | 'middle' | 'end' }[];
  zeroY: number | null;
  baseY: number;
  series: SeriesModel[];
  areaPath: string | null;
}

function buildLineModel(
  series: LineSeries[],
  width: number,
  height: number,
  fy: (v: number) => string,
  fx: (v: number) => string,
  area: boolean,
): LineModel | null {
  const cleaned = series.map((s, i) => {
    const map = new Map<number, number>();
    for (const p of s.points) if (Number.isFinite(p.x) && Number.isFinite(p.y)) map.set(p.x, p.y);
    const pts = [...map.entries()].sort((a, b) => a[0] - b[0]);
    return { name: s.name, color: s.color ?? seriesColor(i), pts, byX: map };
  });
  const xsSet = new Set<number>();
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of cleaned)
    for (const [x, y] of s.pts) {
      xsSet.add(x);
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  if (xsSet.size === 0 || width <= 0) return null;
  const xs = [...xsSet].sort((a, b) => a - b);

  // Y domain: anchor at zero when all values share a sign (honest area/baseline).
  let lo = yMin;
  let hi = yMax;
  if (lo >= 0) lo = 0;
  else if (hi <= 0) hi = 0;
  const yt = distinctTicks(lo, hi, fy);
  const yLabels = yt.ticks.map((v) => fy(v));
  const left = Math.ceil(Math.max(24, ...yLabels.map((l) => estimateTextWidth(l))) + 10);
  const innerW = Math.max(10, width - left - M_RIGHT);
  const innerH = Math.max(10, height - M_TOP - M_BOTTOM);

  const xMin0 = xs[0]!;
  const xMax0 = xs[xs.length - 1]!;
  const single = xMin0 === xMax0;
  const xMin = single ? xMin0 - 1 : xMin0;
  const xMax = single ? xMax0 + 1 : xMax0;
  const sx = (x: number) => left + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = (y: number) => M_TOP + (1 - (y - yt.min) / (yt.max - yt.min)) * innerH;

  // X ticks: as many as fit without overlapping labels.
  const allInt = xs.every((x) => Number.isInteger(x));
  let xTickVals: number[] = single ? [xMin0] : [];
  if (!single) {
    for (let count = Math.min(8, Math.max(2, Math.floor(innerW / 70))); count >= 1; count--) {
      const cand = innerTicks(xMin0, xMax0, count, allInt);
      if (new Set(cand.map(fx)).size < cand.length) continue; // e.g. two ticks inside one year: "1980, 1980"
      const widest = Math.max(0, ...cand.map((v) => estimateTextWidth(fx(v))));
      if (cand.length <= 1 || (widest + 14) * cand.length <= innerW) {
        xTickVals = cand;
        break;
      }
    }
  }
  const xTicks = xTickVals.map((v) => {
    const px = sx(v);
    const w = estimateTextWidth(fx(v));
    const anchor: 'start' | 'middle' | 'end' = px - w / 2 < left - 4 ? 'start' : px + w / 2 > width - 2 ? 'end' : 'middle';
    return { px, label: fx(v), anchor };
  });

  const zeroY = yt.min < 0 && yt.max > 0 ? sy(0) : null;
  const baseY = sy(Math.min(yt.max, Math.max(yt.min, 0)));

  const model: SeriesModel[] = cleaned.map((s) => ({
    name: s.name,
    color: s.color,
    byX: s.byX,
    line: monotonePath(
      s.pts.map((p) => sx(p[0])),
      s.pts.map((p) => sy(p[1])),
    ),
  }));

  let areaPath: string | null = null;
  const first = cleaned[0];
  const firstLine = model[0]?.line;
  if (area && first && firstLine && first.pts.length > 1) {
    const x0 = sx(first.pts[0]![0]);
    const x1 = sx(first.pts[first.pts.length - 1]![0]);
    areaPath = `${firstLine}L${x1.toFixed(2)},${baseY.toFixed(2)}L${x0.toFixed(2)},${baseY.toFixed(2)}Z`;
  }

  return {
    left,
    innerW,
    innerH,
    xs,
    xPx: xs.map(sx),
    sy,
    yTicks: yt.ticks.map((v, i) => ({ v, py: sy(v), label: yLabels[i] ?? '' })),
    xTicks,
    zeroY,
    baseY,
    series: model,
    areaPath,
  };
}

export function LineChart({ series, height = 180, yFormat, xFormat, className, area, ariaLabel }: LineChartProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const gid = svgSafeId(useId());
  const [active, setActive] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const fy = yFormat ?? formatCompact;
  const fx = xFormat ?? formatX;
  const width = size.width;

  const model = useMemo(() => buildLineModel(series, width, height, fy, fx, !!area), [series, width, height, fy, fx, area]);

  const n = model?.xs.length ?? 0;
  const idx = active !== null && active < n ? active : null;
  const activeX = idx !== null && model ? model.xs[idx] : undefined;

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!model) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = nearestIndex(model.xPx, e.clientX - rect.left);
    if (i >= 0) {
      setActive(i);
      setKeyboard(false);
    }
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const next = cursorStep(e.key, idx, n);
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
    setKeyboard(true);
  };

  const liveText =
    keyboard && model && activeX !== undefined
      ? `${fx(activeX)}: ${model.series.map((s) => `${s.name} ${s.byX.has(activeX) ? fy(s.byX.get(activeX)!) : 'no value'}`).join(', ')}`
      : '';

  const legend = series.length > 1 ? series.map((s, i) => ({ key: `${i}:${s.name}`, label: s.name, color: s.color ?? seriesColor(i) })) : [];
  const areaColor = model?.series[0]?.color ?? seriesColor(0);

  return (
    <div className={className}>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {!model ? (
          width > 0 || series.every((s) => s.points.length === 0) ? <ChartEmpty /> : null
        ) : (
          <>
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={ariaLabel}
              tabIndex={0}
              className="block touch-pan-y select-none"
              onPointerMove={onPointerMove}
              onPointerDown={onPointerMove}
              onPointerLeave={() => !keyboard && setActive(null)}
              onKeyDown={onKeyDown}
              onBlur={() => {
                setActive(null);
                setKeyboard(false);
              }}
            >
              <title>{ariaLabel}</title>
              {model.areaPath && (
                <defs>
                  <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: areaColor, stopOpacity: 0.28 }} />
                    <stop offset="100%" style={{ stopColor: areaColor, stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
              )}
              {/* Grid + y labels */}
              <g aria-hidden="true">
                {model.yTicks.map((t) => (
                  <g key={t.v}>
                    <line x1={model.left} x2={model.left + model.innerW} y1={t.py} y2={t.py} style={{ stroke: 'var(--line)' }} strokeWidth={1} shapeRendering="crispEdges" />
                    <text x={model.left - 6} y={t.py} textAnchor="end" dominantBaseline="middle" style={axisTextStyle}>
                      {t.label}
                    </text>
                  </g>
                ))}
                {model.xTicks.map((t, i) => (
                  <text key={i} x={t.px} y={height - 6} textAnchor={t.anchor} style={axisTextStyle}>
                    {t.label}
                  </text>
                ))}
                {model.zeroY !== null && (
                  <line x1={model.left} x2={model.left + model.innerW} y1={model.zeroY} y2={model.zeroY} style={{ stroke: 'var(--ink3)' }} strokeWidth={1.25} shapeRendering="crispEdges" />
                )}
              </g>
              {/* Series */}
              <g aria-hidden="true">
                {model.areaPath && <path d={model.areaPath} style={{ fill: `url(#${gid}-area)` }} />}
                {model.series.map((s, i) => (
                  <path key={i} d={s.line} fill="none" style={{ stroke: s.color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                ))}
              </g>
              {/* Crosshair */}
              {idx !== null && activeX !== undefined && (
                <g aria-hidden="true" pointerEvents="none">
                  <line x1={model.xPx[idx]} x2={model.xPx[idx]} y1={M_TOP} y2={M_TOP + model.innerH} style={{ stroke: 'var(--ink3)' }} strokeWidth={1} strokeDasharray="3 3" />
                  {model.series.map((s, i) =>
                    s.byX.has(activeX) ? (
                      <circle key={i} cx={model.xPx[idx]} cy={model.sy(s.byX.get(activeX)!)} r={4} style={{ fill: s.color, stroke: 'var(--panel2)' }} strokeWidth={2} />
                    ) : null,
                  )}
                </g>
              )}
            </svg>
            {idx !== null && activeX !== undefined && (
              <ChartTooltip x={model.xPx[idx] ?? 0} top={M_TOP} containerWidth={width}>
                <div className="mb-0.5 font-medium text-ink3">{fx(activeX)}</div>
                {model.series.map((s, i) => (
                  <TooltipRow key={i} color={s.color} label={s.name} value={s.byX.has(activeX) ? fy(s.byX.get(activeX)!) : '—'} />
                ))}
              </ChartTooltip>
            )}
          </>
        )}
      </div>
      <ChartLegend items={legend} />
      <LiveRegion text={liveText} />
    </div>
  );
}
