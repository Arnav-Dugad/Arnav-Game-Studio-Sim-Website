import { useMemo, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useElementSize } from './useSize';
import { ChartEmpty, ChartLegend, ChartTooltip, LiveRegion, TooltipRow } from './LineChart';
import { AXIS_TEXT_STYLE as axisTextStyle, cursorStep, estimateTextWidth, formatCompact, niceTicks, seriesColor } from './palette';

export interface BarSegment {
  key: string;
  value: number;
  color?: string;
}
export interface BarDatum {
  label: string;
  segments: BarSegment[];
}
export interface BarChartProps {
  data: BarDatum[];
  height?: number;
  yFormat?: (v: number) => string;
  className?: string;
  ariaLabel: string;
  /**
   * Stack segments from zero (positives up, negatives down). Default true.
   * When false, segments are drawn side by side within each bar slot.
   */
  stacked?: boolean;
}

const M_TOP = 10;
const M_RIGHT = 8;
const M_BOTTOM = 22;

interface RectModel {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}
interface BarModel {
  left: number;
  innerW: number;
  innerH: number;
  band: number;
  centers: number[];
  rects: RectModel[][];
  nets: { value: number; py: number; show: boolean }[];
  yTicks: { v: number; py: number; label: string }[];
  zeroY: number;
  labelEvery: number;
  keys: { key: string; color: string }[];
}

function buildBarModel(data: BarDatum[], width: number, height: number, stacked: boolean, fy: (v: number) => string): BarModel | null {
  if (data.length === 0 || width <= 0) return null;

  // Stable colour per key (first explicit colour wins, else palette by first appearance).
  const keyColor = new Map<string, string>();
  const keyOrder: string[] = [];
  for (const d of data)
    for (const s of d.segments) {
      if (!keyColor.has(s.key)) {
        keyOrder.push(s.key);
        keyColor.set(s.key, s.color ?? '');
      } else if (!keyColor.get(s.key) && s.color) keyColor.set(s.key, s.color);
    }
  keyOrder.forEach((k, i) => {
    if (!keyColor.get(k)) keyColor.set(k, seriesColor(i));
  });

  const val = (v: number) => (Number.isFinite(v) ? v : 0);
  let lo = 0;
  let hi = 0;
  for (const d of data) {
    let pos = 0;
    let neg = 0;
    for (const s of d.segments) {
      const v = val(s.value);
      if (stacked) {
        if (v >= 0) pos += v;
        else neg += v;
      } else {
        pos = Math.max(pos, v);
        neg = Math.min(neg, v);
      }
    }
    hi = Math.max(hi, pos);
    lo = Math.min(lo, neg);
  }
  const yt = niceTicks(lo, hi, 5);
  const yLabels = yt.ticks.map((v) => fy(v));
  const left = Math.ceil(Math.max(24, ...yLabels.map((l) => estimateTextWidth(l))) + 10);
  const innerW = Math.max(10, width - left - M_RIGHT);
  const innerH = Math.max(10, height - M_TOP - M_BOTTOM);
  const sy = (y: number) => M_TOP + (1 - (y - yt.min) / (yt.max - yt.min)) * innerH;
  const zeroY = sy(0);

  const n = data.length;
  const band = innerW / n;
  const barW = Math.max(2, Math.min(band * 0.64, 56));
  const centers = data.map((_, i) => left + band * (i + 0.5));

  const rects: RectModel[][] = data.map((d, i) => {
    const cx = centers[i]!;
    const out: RectModel[] = [];
    if (stacked) {
      let pos = 0;
      let neg = 0;
      for (const s of d.segments) {
        const v = val(s.value);
        if (v === 0) continue;
        const from = v > 0 ? pos : neg;
        const to = from + v;
        if (v > 0) pos = to;
        else neg = to;
        const y0 = sy(Math.max(from, to));
        const y1 = sy(Math.min(from, to));
        out.push({ key: s.key, x: cx - barW / 2, y: y0, w: barW, h: Math.max(0.5, y1 - y0), color: keyColor.get(s.key) ?? seriesColor(0) });
      }
    } else {
      const k = Math.max(1, d.segments.length);
      const sub = barW / k;
      d.segments.forEach((s, j) => {
        const v = val(s.value);
        const y0 = sy(Math.max(0, v));
        const y1 = sy(Math.min(0, v));
        out.push({
          key: s.key,
          x: cx - barW / 2 + j * sub + 0.5,
          y: y0,
          w: Math.max(1, sub - 1),
          h: Math.max(v === 0 ? 0 : 0.5, y1 - y0),
          color: keyColor.get(s.key) ?? seriesColor(j),
        });
      });
    }
    return out;
  });

  const nets = data.map((d) => {
    const value = d.segments.reduce((a, s) => a + val(s.value), 0);
    return { value, py: sy(value), show: stacked && d.segments.length > 1 };
  });

  const widestLabel = Math.max(0, ...data.map((d) => estimateTextWidth(d.label)));
  const labelEvery = Math.max(1, Math.ceil((widestLabel + 8) / band));

  return {
    left,
    innerW,
    innerH,
    band,
    centers,
    rects,
    nets,
    yTicks: yt.ticks.map((v, i) => ({ v, py: sy(v), label: yLabels[i] ?? '' })),
    zeroY,
    labelEvery,
    keys: keyOrder.map((k) => ({ key: k, color: keyColor.get(k) ?? seriesColor(0) })),
  };
}

export function BarChart({ data, height = 180, yFormat, className, ariaLabel, stacked = true }: BarChartProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const fy = yFormat ?? formatCompact;
  const width = size.width;

  const model = useMemo(() => buildBarModel(data, width, height, stacked, fy), [data, width, height, stacked, fy]);

  const n = model ? data.length : 0;
  const idx = active !== null && active < n ? active : null;
  const activeBar = idx !== null ? data[idx] : undefined;

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!model) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.min(n - 1, Math.max(0, Math.floor((px - model.left) / model.band)));
    setActive(i);
    setKeyboard(false);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const next = cursorStep(e.key, idx, n);
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
    setKeyboard(true);
  };

  const colorFor = (key: string) => model?.keys.find((k) => k.key === key)?.color ?? seriesColor(0);
  const net = idx !== null ? model?.nets[idx] : undefined;
  const liveText =
    keyboard && activeBar
      ? `${activeBar.label}: ${activeBar.segments.map((s) => `${s.key} ${fy(s.value)}`).join(', ')}${net?.show ? `, net ${fy(net.value)}` : ''}`
      : '';
  const legend = model && model.keys.length > 1 ? model.keys.map((k) => ({ key: k.key, label: k.key, color: k.color })) : [];

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
              {idx !== null && (
                <rect
                  aria-hidden="true"
                  x={model.left + model.band * idx + 1}
                  y={M_TOP}
                  width={Math.max(0, model.band - 2)}
                  height={model.innerH}
                  rx={4}
                  style={{ fill: 'var(--line)' }}
                  fillOpacity={0.6}
                />
              )}
              <g aria-hidden="true">
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
                {data.map((d, i) =>
                  i % model.labelEvery === 0 ? (
                    <text key={i} x={model.centers[i]} y={height - 6} textAnchor="middle" style={axisTextStyle}>
                      {d.label}
                    </text>
                  ) : null,
                )}
              </g>
              <g aria-hidden="true">
                {model.rects.map((bar, i) => (
                  <g key={i} opacity={idx === null || idx === i ? 1 : 0.55}>
                    {bar.map((r, j) => (
                      <rect key={j} x={r.x} y={r.y} width={r.w} height={r.h} rx={Math.min(2, r.w / 4)} style={{ fill: r.color }} />
                    ))}
                  </g>
                ))}
                <line
                  x1={model.left}
                  x2={model.left + model.innerW}
                  y1={model.zeroY}
                  y2={model.zeroY}
                  style={{ stroke: 'var(--ink3)' }}
                  strokeWidth={1.25}
                  shapeRendering="crispEdges"
                />
                {model.nets.map((nm, i) =>
                  nm.show ? (
                    <circle key={i} cx={model.centers[i]} cy={nm.py} r={3.5} style={{ fill: 'var(--ink)', stroke: 'var(--panel2)' }} strokeWidth={1.5} />
                  ) : null,
                )}
              </g>
            </svg>
            {activeBar && idx !== null && (
              <ChartTooltip x={model.centers[idx] ?? 0} offset={Math.min(model.band / 2, 40) + 4} top={M_TOP} containerWidth={width}>
                <div className="mb-0.5 font-medium text-ink3">{activeBar.label}</div>
                {activeBar.segments.length === 0 ? (
                  <div className="text-ink3">No data</div>
                ) : (
                  activeBar.segments.map((s, j) => (
                    <TooltipRow key={j} color={colorFor(s.key)} label={s.key} value={<span style={{ color: s.value < 0 ? 'var(--bad)' : undefined }}>{fy(s.value)}</span>} />
                  ))
                )}
                {net?.show && (
                  <div className="mt-1 border-t border-line pt-1">
                    <TooltipRow
                      strong
                      label="Net"
                      value={<span style={{ color: net.value < 0 ? 'var(--bad)' : net.value > 0 ? 'var(--good)' : undefined }}>{fy(net.value)}</span>}
                    />
                  </div>
                )}
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
