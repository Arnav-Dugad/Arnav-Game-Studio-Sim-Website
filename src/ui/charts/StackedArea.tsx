import { useMemo, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useElementSize } from './useSize';
import { ChartEmpty, ChartLegend, ChartTooltip, LiveRegion, TooltipRow } from './LineChart';
import {
  AXIS_TEXT_STYLE as axisTextStyle,
  cursorStep,
  estimateTextWidth,
  formatCompact,
  formatPct,
  formatX,
  innerTicks,
  nearestIndex,
  niceTicks,
  seriesColor,
} from './palette';

export interface StackedDatum {
  x: number;
  values: Record<string, number>;
}

export interface StackedAreaProps {
  data: StackedDatum[];
  /** Draw order, bottom → top. */
  keys: string[];
  labels?: Record<string, string>;
  colors?: Record<string, string>;
  height?: number;
  className?: string;
  ariaLabel: string;
  xFormat?: (v: number) => string;
  /** Formatter for raw values (used when `normalize` is false). */
  yFormat?: (v: number) => string;
  /** Stack as 100% shares (default true). */
  normalize?: boolean;
}

const M_TOP = 8;
const M_RIGHT = 12;
const M_BOTTOM = 22;
const TOOLTIP_ROWS = 8;
const LEGEND_ITEMS = 8;

interface StackModel {
  left: number;
  innerW: number;
  innerH: number;
  xs: number[];
  xPx: number[];
  /** Raw (clamped ≥ 0) values per row, by key index. */
  raw: number[][];
  totals: number[];
  layers: { key: string; color: string; d: string }[];
  yTicks: { v: number; py: number; label: string }[];
  xTicks: { px: number; label: string; anchor: 'start' | 'middle' | 'end' }[];
}

function buildStackModel(
  data: StackedDatum[],
  keys: string[],
  colors: Record<string, string> | undefined,
  width: number,
  height: number,
  normalize: boolean,
  fx: (v: number) => string,
  fy: (v: number) => string,
): StackModel | null {
  const rows = data.filter((d) => Number.isFinite(d.x)).sort((a, b) => a.x - b.x);
  if (rows.length === 0 || keys.length === 0 || width <= 0) return null;

  const raw = rows.map((r) =>
    keys.map((k) => {
      const v = r.values[k];
      return v !== undefined && Number.isFinite(v) && v > 0 ? v : 0;
    }),
  );
  const totals = raw.map((vals) => vals.reduce((a, b) => a + b, 0));
  const scaled = raw.map((vals, i) => {
    const t = totals[i]!;
    return normalize ? vals.map((v) => (t > 0 ? v / t : 0)) : vals;
  });

  const yMax = normalize ? 1 : Math.max(0, ...totals);
  const yt = normalize ? { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] } : niceTicks(0, yMax, 5);
  const yLabels = yt.ticks.map((v) => (normalize ? formatPct(v, 0) : fy(v)));
  const left = Math.ceil(Math.max(24, ...yLabels.map((l) => estimateTextWidth(l))) + 10);
  const innerW = Math.max(10, width - left - M_RIGHT);
  const innerH = Math.max(10, height - M_TOP - M_BOTTOM);

  const xs = rows.map((r) => r.x);
  const xMin0 = xs[0]!;
  const xMax0 = xs[xs.length - 1]!;
  const single = xMin0 === xMax0;
  const xMin = single ? xMin0 - 1 : xMin0;
  const xMax = single ? xMax0 + 1 : xMax0;
  const sx = (x: number) => left + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = (y: number) => M_TOP + (1 - (y - yt.min) / (yt.max - yt.min)) * innerH;

  // Geometry x positions — a single row is stretched across the full width.
  const gx = single ? [left, left + innerW] : xs.map(sx);
  const gRows = single ? [scaled[0]!, scaled[0]!] : scaled;

  const f = (v: number) => Math.round(v * 100) / 100;
  const cum = gRows.map(() => 0);
  const layers: StackModel['layers'] = [];
  keys.forEach((key, k) => {
    const lower = cum.slice();
    let any = false;
    for (let i = 0; i < gRows.length; i++) {
      const v = gRows[i]![k] ?? 0;
      if (v > 0) any = true;
      cum[i] = cum[i]! + v;
    }
    if (!any) return;
    let d = '';
    for (let i = 0; i < gx.length; i++) d += `${i === 0 ? 'M' : 'L'}${f(gx[i]!)},${f(sy(cum[i]!))}`;
    for (let i = gx.length - 1; i >= 0; i--) d += `L${f(gx[i]!)},${f(sy(lower[i]!))}`;
    layers.push({ key, color: colors?.[key] ?? seriesColor(k), d: d + 'Z' });
  });

  const allInt = xs.every((x) => Number.isInteger(x));
  let xTickVals: number[] = single ? [xMin0] : [];
  if (!single) {
    for (let count = Math.min(8, Math.max(2, Math.floor(innerW / 70))); count >= 1; count--) {
      const cand = innerTicks(xMin0, xMax0, count, allInt);
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

  return {
    left,
    innerW,
    innerH,
    xs,
    xPx: xs.map(sx),
    raw,
    totals,
    layers,
    yTicks: yt.ticks.map((v, i) => ({ v, py: sy(v), label: yLabels[i] ?? '' })),
    xTicks,
  };
}

export function StackedArea({ data, keys, labels, colors, height = 200, className, ariaLabel, xFormat, yFormat, normalize = true }: StackedAreaProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const fx = xFormat ?? formatX;
  const fy = yFormat ?? formatCompact;
  const width = size.width;

  const model = useMemo(
    () => buildStackModel(data, keys, colors, width, height, normalize, fx, fy),
    [data, keys, colors, width, height, normalize, fx, fy],
  );

  const colorOf = (key: string, k: number) => colors?.[key] ?? seriesColor(k);
  const labelOf = (key: string) => labels?.[key] ?? key;

  // Legend: top keys by latest value.
  const legend = useMemo(() => {
    if (!model) return [];
    const last = model.raw[model.raw.length - 1] ?? [];
    return keys
      .map((key, k) => ({ key, k, v: last[k] ?? 0 }))
      .filter((e) => e.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, LEGEND_ITEMS)
      .map((e) => ({ key: e.key, label: labels?.[e.key] ?? e.key, color: colors?.[e.key] ?? seriesColor(e.k) }));
  }, [model, keys, labels, colors]);

  const n = model?.xs.length ?? 0;
  const idx = active !== null && active < n ? active : null;

  const rowsAt = (i: number) => {
    if (!model) return { top: [], rest: 0, total: 0 };
    const vals = model.raw[i] ?? [];
    const total = model.totals[i] ?? 0;
    const sorted = keys
      .map((key, k) => ({ key, k, v: vals[k] ?? 0 }))
      .filter((e) => e.v > 0)
      .sort((a, b) => b.v - a.v);
    return { top: sorted.slice(0, TOOLTIP_ROWS), rest: Math.max(0, sorted.length - TOOLTIP_ROWS), total };
  };
  const fmtVal = (v: number, total: number) => (normalize ? formatPct(total > 0 ? v / total : 0) : fy(v));

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

  const tip = idx !== null ? rowsAt(idx) : null;
  const activeX = idx !== null && model ? model.xs[idx] : undefined;
  const liveText =
    keyboard && tip && activeX !== undefined
      ? `${fx(activeX)}: ${tip.top.map((r) => `${labelOf(r.key)} ${fmtVal(r.v, tip.total)}`).join(', ')}`
      : '';

  return (
    <div className={className}>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {!model ? (
          width > 0 || data.length === 0 ? <ChartEmpty /> : null
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
              <g aria-hidden="true">
                {model.layers.map((l) => (
                  <path key={l.key} d={l.d} style={{ fill: l.color, stroke: 'var(--bg)' }} fillOpacity={0.88} strokeWidth={0.75} strokeLinejoin="round" />
                ))}
                {model.yTicks.map((t) => (
                  <g key={t.v}>
                    <line
                      x1={model.left}
                      x2={model.left + model.innerW}
                      y1={t.py}
                      y2={t.py}
                      style={{ stroke: 'var(--line)' }}
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
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
              </g>
              {idx !== null && (
                <line
                  aria-hidden="true"
                  pointerEvents="none"
                  x1={model.xPx[idx]}
                  x2={model.xPx[idx]}
                  y1={M_TOP}
                  y2={M_TOP + model.innerH}
                  style={{ stroke: 'var(--ink)' }}
                  strokeOpacity={0.7}
                  strokeWidth={1.25}
                />
              )}
            </svg>
            {tip && idx !== null && activeX !== undefined && (
              <ChartTooltip x={model.xPx[idx] ?? 0} top={M_TOP} containerWidth={width}>
                <div className="mb-0.5 font-medium text-ink3">{fx(activeX)}</div>
                {tip.top.length === 0 ? (
                  <div className="text-ink3">No data</div>
                ) : (
                  tip.top.map((r) => <TooltipRow key={r.key} color={colorOf(r.key, r.k)} label={labelOf(r.key)} value={fmtVal(r.v, tip.total)} />)
                )}
                {tip.rest > 0 && <div className="mt-0.5 pl-4 text-ink3">+{tip.rest} more</div>}
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
