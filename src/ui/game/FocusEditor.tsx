import { PHASE_AREAS } from '@/data/types';
import type { Focus3 } from '@/sim/types';
import { AREA_LABEL, PHASE_NAMES } from './lib';

/** Three linked sliders that always sum to 100%. */
export function FocusSliders({ phase, value, onChange, ideal, disabled }: { phase: 0 | 1 | 2; value: Focus3; onChange: (f: Focus3) => void; ideal?: Focus3; disabled?: boolean }) {
  const areas = PHASE_AREAS[phase]!;
  const set = (i: number, v: number) => {
    const next = [...value] as Focus3;
    next[i] = v;
    // rebalance the other two proportionally so the sum stays 100
    const others = [0, 1, 2].filter((j) => j !== i);
    const rest = 100 - v;
    const curRest = others.reduce((t, j) => t + value[j]!, 0);
    for (const j of others) next[j] = curRest > 0 ? Math.round((value[j]! / curRest) * rest) : Math.round(rest / 2);
    const fix = 100 - (next[0] + next[1] + next[2]);
    next[others[0]!] = Math.max(0, (next[others[0]!] ?? 0) + fix);
    onChange(next);
  };
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-1 text-xs font-semibold text-ink2">{PHASE_NAMES[phase]}</legend>
      {areas.map((a, i) => (
        <label key={a} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-xs">
          <span className="text-ink2">{AREA_LABEL[a]}</span>
          <span className="relative">
            <input type="range" min={0} max={100} step={5} value={value[i]} onChange={(e) => set(i, Number(e.target.value))} className="w-full" aria-label={`${AREA_LABEL[a]} focus`} />
            {ideal && <span className="pointer-events-none absolute top-0 h-1.5 w-0.5 rounded bg-gold" style={{ left: `calc(${ideal[i]}% - 1px)` }} title="What worked before" />}
          </span>
          <span className="num text-right font-semibold">{value[i]}%</span>
        </label>
      ))}
    </fieldset>
  );
}
