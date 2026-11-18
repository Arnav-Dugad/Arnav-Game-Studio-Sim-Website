import { PHASE_AREAS } from '@/data/types';
import { GENRE_BY_ID } from '@/data/genres';
import { DESIGN_AREAS } from '@/sim/systems/dev';
import type { GameProject } from '@/sim/types';
import { aOrAn } from '@/sim/util';
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
            <input type="range" min={0} max={100} step={1} value={value[i]} onChange={(e) => set(i, Number(e.target.value))} className="w-full" aria-label={`${AREA_LABEL[a]} focus`} />
            {ideal && <span className="pointer-events-none absolute top-0 h-1.5 w-0.5 rounded bg-gold" style={{ left: `calc(${ideal[i]}% - 1px)` }} title="What worked before" />}
          </span>
          <span className="num text-right font-semibold">{value[i]}%</span>
        </label>
      ))}
    </fieldset>
  );
}

/** How the game's points split between design and tech, against what its genre wants — and what to do about it. */
export function BalanceBar({ p, className }: { p: GameProject; className?: string }) {
  const total = p.design + p.tech;
  if (total < 10) return null;
  const g = GENRE_BY_ID[p.concept.genre];
  const share = p.design / total;
  const ideal = g.designRatio;
  const off = share - ideal;
  const areas = PHASE_AREAS[Math.min(2, p.phase)]!;
  const want = areas.filter((a) => (off > 0 ? !DESIGN_AREAS.has(a) : DESIGN_AREAS.has(a))).map((a) => AREA_LABEL[a]);
  const ok = Math.abs(off) <= 0.03;
  const cost = Math.round(Math.min(0.35, Math.abs(off) * 1.2) * 100); // the quality model's balance penalty
  const hint = ok
    ? `On target for ${g.name.toLowerCase()} games`
    : `${Math.abs(off) <= 0.08 ? `Close (costs about ${cost}%): ` : `Costs about ${cost}% — `}${off > 0 ? 'too much design' : 'too much tech'} for ${aOrAnWord(g.id === 'rpg' || g.id === 'mmo' ? g.name : g.name.toLowerCase())} — ${p.phase < 3 && want.length ? `favour ${want.join(' and ')}, or ` : ''}add more ${off > 0 ? 'programmers' : 'designers, writers or artists'}`;
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink3">
          So far: design {Math.round(share * 100)}% · tech {100 - Math.round(share * 100)}%
        </span>
        <span className="text-ink3">ideal ≈ {Math.round(ideal * 100)}% design</span>
      </div>
      <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--line)]" role="img" aria-label={`Design ${Math.round(share * 100)} percent, ideal ${Math.round(ideal * 100)} percent`}>
        <div className={ok ? 'h-full bg-good' : 'h-full bg-warn'} style={{ width: `${share * 100}%` }} />
        <span className="absolute top-0 h-full w-0.5 bg-gold" style={{ left: `calc(${ideal * 100}% - 1px)` }} />
      </div>
      <div className={ok ? 'mt-1 text-[11px] text-good' : 'mt-1 text-[11px] text-warn'}>{hint}</div>
    </div>
  );
}

const aOrAnWord = (w: string) => `${aOrAn(w)} game`;
