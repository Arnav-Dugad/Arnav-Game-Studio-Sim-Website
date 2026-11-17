import { useState, type ReactNode } from 'react';
import { OFFICE_TIERS } from '@/data/facilities';
import { RESEARCH } from '@/data/research';
import { fromDay } from '@/sim/calendar';
import { CHEAT_LIMITS, type CheatOp } from '@/sim/cheats';
import { HIREABLE_ROLES, ROLE_NAMES } from '@/sim/systems/staff';
import type { CheatSettings, Role } from '@/sim/types';
import { fmtMoney, fmtUnits } from '@/sim/util';
import { Button, Pill, Section, Segmented, cx, inputCls } from '../components/ui';
import { Icon } from '../icons';
import { useGame } from '../store';

type Tab = 'money' | 'staff' | 'games' | 'research' | 'world';

/** Run a cheat and report the outcome as a toast. */
function useCheat() {
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  return (cheat: CheatOp, ok?: string) => {
    const r = act({ type: 'cheat', cheat });
    if (!r.ok) toast({ text: r.error, tone: 'bad' });
    else if (ok) toast({ text: ok, tone: 'good', icon: 'sparkle' });
    return r.ok;
  };
}

export default function CheatsPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const [tab, setTab] = useState<Tab>('money');
  const cheat = useCheat();
  const on = Object.entries(s.cheats ?? {}).filter(([k, v]) => (typeof v === 'boolean' ? v : k !== 'moneyFloor' && v !== undefined && v !== (k === 'scoreBonus' ? 0 : 1)));
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-3 rounded-2xl border border-gold/50 bg-gold/10 p-3 text-xs">
        <Icon name="sparkle" size={18} className="shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Sandbox cheats</div>
          <div className="text-ink3">
            Bend the rules however you like. Using any cheat marks this run as cheated in the Hall of Fame.
            {s.cheatsUsed ? ' This run already uses cheats.' : ''}
          </div>
        </div>
        {on.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => cheat({ op: 'settings', settings: { infiniteMoney: false, noBankruptcy: false, noBurnout: false, alwaysHappy: false, noBugs: false, noEvents: false, freeBuild: false, salesMul: 1, workMul: 1, researchMul: 1, scoreBonus: 0 } }, 'All cheat switches are off')}>
            Turn all off ({on.length})
          </Button>
        )}
      </div>
      <Segmented<Tab>
        ariaLabel="Cheat categories"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'money', label: 'Money' },
          { value: 'staff', label: 'Staff' },
          { value: 'games', label: 'Games' },
          { value: 'research', label: 'Research' },
          { value: 'world', label: 'World' },
        ]}
      />
      {tab === 'money' && <MoneyCheats />}
      {tab === 'staff' && <StaffCheats />}
      {tab === 'games' && <GameCheats />}
      {tab === 'research' && <ResearchCheats />}
      {tab === 'world' && <WorldCheats />}
    </div>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

function Card({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="font-semibold">{title}</div>
      {desc && <p className="mt-0.5 text-xs text-ink3">{desc}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Toggle({ k, label, desc }: { k: keyof CheatSettings; label: string; desc: string }) {
  const s = useGame((g) => g.s)!;
  const cheat = useCheat();
  const v = !!s.cheats?.[k];
  return (
    <label className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', v ? 'border-accent bg-accent/10' : 'border-line')}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" checked={v} onChange={(e) => cheat({ op: 'settings', settings: { [k]: e.target.checked } })} />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="text-xs text-ink3">{desc}</span>
      </span>
    </label>
  );
}

/** A slider for a persistent multiplier; commits when released. */
function Multiplier({ k, label, desc, min, max, step, format, neutral }: { k: 'salesMul' | 'workMul' | 'researchMul' | 'scoreBonus'; label: string; desc: string; min: number; max: number; step: number; format: (v: number) => string; neutral: number }) {
  const s = useGame((g) => g.s)!;
  const cheat = useCheat();
  const cur = s.cheats?.[k] ?? neutral;
  const [v, setV] = useState(cur);
  const commit = (x: number) => cheat({ op: 'settings', settings: { [k]: x } });
  return (
    <div className={cx('rounded-xl border p-3', cur !== neutral ? 'border-accent bg-accent/10' : 'border-line')}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className="num font-semibold">{format(v)}</span>
      </div>
      <p className="text-xs text-ink3">{desc}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          className="min-w-0 flex-1"
          min={min}
          max={max}
          step={step}
          value={v}
          aria-label={label}
          onChange={(e) => setV(Number(e.target.value))}
          onPointerUp={() => commit(v)}
          onKeyUp={() => commit(v)}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={cur === neutral && v === neutral}
          onClick={() => {
            setV(neutral);
            commit(neutral);
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

function NumberInput({ value, onChange, label, min, max, step = 1, className }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number; className?: string }) {
  return (
    <input
      type="number"
      aria-label={label}
      className={cx(inputCls, 'num', className)}
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
    />
  );
}

function Slider({ value, onChange, label, min, max, step = 1, format = (v: number) => String(v) }: { value: number; onChange: (v: number) => void; label: string; min: number; max: number; step?: number; format?: (v: number) => string }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-ink2">{label}</span>
      <input type="range" className="min-w-0 flex-1" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <span className="num w-12 text-right font-semibold">{format(value)}</span>
    </label>
  );
}

// ── Money & company ─────────────────────────────────────────────────────────

function MoneyCheats() {
  const s = useGame((g) => g.s)!;
  const cheat = useCheat();
  const [cash, setCash] = useState(1_000_000);
  const [rep, setRep] = useState(Math.round(s.company.reputation));
  const [fans, setFans] = useState(Math.round(s.company.fans));
  const [floor, setFloor] = useState(s.cheats?.moneyFloor ?? 1_000_000);
  return (
    <div className="space-y-3">
      <Card title="Cash" desc={`You have ${fmtMoney(s.company.cash)}.`}>
        <div className="flex flex-wrap gap-2">
          <NumberInput label="Amount" value={cash} onChange={setCash} className="w-40" />
          <Button size="sm" onClick={() => cheat({ op: 'addCash', amount: cash }, `Added ${fmtMoney(cash)}`)}>
            Add
          </Button>
          <Button size="sm" onClick={() => cheat({ op: 'setCash', amount: cash }, `Cash set to ${fmtMoney(cash)}`)}>
            Set exactly
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 100_000_000_000].map((x) => (
            <Button key={x} size="sm" variant="ghost" onClick={() => cheat({ op: 'addCash', amount: x }, `Added ${fmtMoney(x)}`)}>
              +{fmtMoney(x)}
            </Button>
          ))}
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="Reputation">
          <Slider label="Reputation" value={rep} onChange={setRep} min={0} max={100} />
          <Button size="sm" className="mt-2" onClick={() => cheat({ op: 'setReputation', value: rep }, `Reputation set to ${rep}`)}>
            Apply
          </Button>
        </Card>
        <Card title="Studio fans" desc={`Currently ${fmtUnits(s.company.fans)}.`}>
          <div className="flex gap-2">
            <NumberInput label="Fans" value={fans} onChange={setFans} min={0} className="min-w-0 flex-1" />
            <Button size="sm" onClick={() => cheat({ op: 'setFans', value: fans }, `Fans set to ${fmtUnits(fans)}`)}>
              Set
            </Button>
          </div>
        </Card>
      </div>
      <Card title="Debt" desc={s.finance.loans.length ? `${s.finance.loans.length} loan${s.finance.loans.length > 1 ? 's' : ''} outstanding.` : 'No loans.'}>
        <Button size="sm" disabled={!s.finance.loans.length} onClick={() => cheat({ op: 'clearLoans' }, 'Loans forgiven')}>
          Forgive all loans
        </Button>
      </Card>
      <Toggle k="infiniteMoney" label="Infinite money" desc={`Your cash never drops below ${fmtMoney(s.cheats?.moneyFloor ?? 1_000_000)}.`} />
      {s.cheats?.infiniteMoney && (
        <div className="flex items-center gap-2 pl-3 text-xs">
          <span className="text-ink2">Floor</span>
          <NumberInput label="Money floor" value={floor} onChange={setFloor} min={0} className="w-40" />
          <Button size="sm" onClick={() => cheat({ op: 'settings', settings: { moneyFloor: floor } }, `Floor set to ${fmtMoney(floor)}`)}>
            Set floor
          </Button>
        </div>
      )}
      <Toggle k="noBankruptcy" label="No bankruptcy" desc="Insolvency never ends the game, however deep in the red you go." />
    </div>
  );
}

// ── Staff ───────────────────────────────────────────────────────────────────

type StaffField = 'skills' | 'potential' | 'morale' | 'energy' | 'burnout';

function StaffCheats() {
  const s = useGame((g) => g.s)!;
  const cheat = useCheat();
  const staff = Object.values(s.staff);
  const [who, setWho] = useState('');
  const [vals, setVals] = useState<Record<StaffField, number>>({ skills: 100, potential: 100, morale: 100, energy: 100, burnout: 0 });
  const [use, setUse] = useState<Record<StaffField, boolean>>({ skills: true, potential: true, morale: true, energy: true, burnout: true });
  const [role, setRole] = useState<Role>('programmer');
  const [skill, setSkill] = useState(90);
  const [salary, setSalary] = useState(80_000);
  const [name, setName] = useState('');
  const fields: [StaffField, string][] = [
    ['skills', 'All skills'],
    ['potential', 'Potential'],
    ['morale', 'Morale'],
    ['energy', 'Energy'],
    ['burnout', 'Burnout'],
  ];
  const target = who ? (s.staff[who]?.name ?? 'them') : staff.length === 1 ? 'everyone' : `all ${staff.length} staff`;
  return (
    <div className="space-y-3">
      <Card title="Edit people" desc="Pick who to change, tick the stats to set, then apply.">
        <select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who">
          <option value="">Everyone ({staff.length})</option>
          {staff.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name} · {ROLE_NAMES[st.role]}
            </option>
          ))}
        </select>
        <div className="mt-2 space-y-1.5">
          {fields.map(([f, label]) => (
            <div key={f} className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={use[f]} onChange={(e) => setUse((u) => ({ ...u, [f]: e.target.checked }))} aria-label={`Change ${label}`} />
              <div className={cx('min-w-0 flex-1', !use[f] && 'opacity-40')}>
                <Slider label={label} value={vals[f]} onChange={(v) => setVals((x) => ({ ...x, [f]: v }))} min={0} max={100} />
              </div>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-2"
          disabled={!Object.values(use).some(Boolean)}
          onClick={() =>
            cheat(
              {
                op: 'staff',
                staffId: who || undefined,
                skills: use.skills ? vals.skills : undefined,
                potential: use.potential ? vals.potential : undefined,
                morale: use.morale ? vals.morale : undefined,
                energy: use.energy ? vals.energy : undefined,
                burnout: use.burnout ? vals.burnout : undefined,
              },
              `Updated ${target}`,
            )
          }
        >
          Apply to {target}
        </Button>
      </Card>
      <Card title="Summon a hire" desc="Adds someone straight to your team (office capacity still applies; they need a desk to work).">
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
            {HIREABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAMES[r]}
              </option>
            ))}
          </select>
          <input className={inputCls} placeholder="Name (optional)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        </div>
        <div className="mt-2 space-y-1.5">
          <Slider label="Skills" value={skill} onChange={setSkill} min={1} max={100} />
          <label className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-ink2">Salary/yr</span>
            <NumberInput label="Salary" value={salary} onChange={setSalary} min={0} className="min-w-0 flex-1" />
          </label>
        </div>
        <Button size="sm" className="mt-2" icon="plus" onClick={() => cheat({ op: 'spawnStaff', role, skill, salary: Number.isFinite(salary) ? salary : 0, name }, `${name || 'A new ' + ROLE_NAMES[role].toLowerCase()} joined`)}>
          Hire
        </Button>
      </Card>
      <Toggle k="noBurnout" label="Tireless team" desc="Nobody burns out and energy stays full." />
      <Toggle k="alwaysHappy" label="Always happy" desc="Morale is pinned at 100 for everyone." />
      <Multiplier k="workMul" label="Work output" desc="Multiplies the points your team produces every day (better games in the same time)." min={0.25} max={CHEAT_LIMITS.workMul[1]} step={0.25} neutral={1} format={(v) => `×${v}`} />
    </div>
  );
}

// ── Games ───────────────────────────────────────────────────────────────────

function GameCheats() {
  const s = useGame((g) => g.s)!;
  const cheat = useCheat();
  const games = Object.values(s.projects).filter((p) => p.kind === 'game');
  const rels = [...s.releaseOrder].reverse().map((id) => s.releases[id]!).filter(Boolean);
  const frs = Object.values(s.franchises);
  const [hype, setHype] = useState(2);
  const [relId, setRelId] = useState(rels[0]?.id ?? '');
  const rel = s.releases[relId];
  const [score, setScore] = useState(rel?.score ?? 90);
  const [userScore, setUserScore] = useState(rel?.userScore ?? 90);
  const [units, setUnits] = useState(1_000_000);
  const [frId, setFrId] = useState('');
  const [frFans, setFrFans] = useState(5_000_000);
  return (
    <div className="space-y-3">
      <Card title="Games in development" desc={games.length ? games.map((p) => p.kind === 'game' && p.concept.name).join(', ') : 'Nothing in development right now.'}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="fast" disabled={!games.length} onClick={() => cheat({ op: 'finishProjects', polish: false }, 'Finishing now — releases tomorrow')}>
            Finish now
          </Button>
          <Button size="sm" icon="sparkle" disabled={!games.length} onClick={() => cheat({ op: 'finishProjects', polish: true }, 'Polished and finished — releases tomorrow')}>
            Finish polished (no bugs)
          </Button>
        </div>
        <div className="mt-3">
          <Slider label="Hype" value={hype} onChange={setHype} min={0} max={3} step={0.1} format={(v) => v.toFixed(1)} />
          <Button size="sm" className="mt-2" disabled={!games.length} onClick={() => cheat({ op: 'setHype', value: hype }, `Hype set to ${hype.toFixed(1)}`)}>
            Set hype
          </Button>
        </div>
      </Card>
      <Multiplier k="scoreBonus" label="Review bonus" desc="Added to the critic score of every game you release from now on." min={CHEAT_LIMITS.scoreBonus[0]} max={CHEAT_LIMITS.scoreBonus[1]} step={1} neutral={0} format={(v) => (v > 0 ? `+${v}` : String(v))} />
      <Multiplier k="salesMul" label="Sales" desc="Multiplies the weekly sales of every game (and lifts the market cap to match)." min={CHEAT_LIMITS.salesMul[0]} max={CHEAT_LIMITS.salesMul[1]} step={0.1} neutral={1} format={(v) => `×${v.toFixed(1)}`} />
      <Toggle k="noBugs" label="Bug-free code" desc="Games in development never accumulate bugs." />
      <Card title="Edit a released game" desc={rels.length ? undefined : 'Release a game first.'}>
        {rels.length > 0 && (
          <>
            <select
              className={inputCls}
              value={relId}
              aria-label="Game"
              onChange={(e) => {
                setRelId(e.target.value);
                const r = s.releases[e.target.value];
                if (r) {
                  setScore(r.score);
                  setUserScore(r.userScore);
                }
              }}
            >
              {rels.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.score}) · {fmtUnits(r.units)} sold
                </option>
              ))}
            </select>
            <div className="mt-2 space-y-1.5">
              <Slider label="Critics" value={score} onChange={setScore} min={1} max={100} />
              <Slider label="Users" value={userScore} onChange={setUserScore} min={1} max={100} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => cheat({ op: 'editRelease', releaseId: relId, score, userScore }, 'Scores updated')}>
                Set scores
              </Button>
              <NumberInput label="Copies to add" value={units} onChange={setUnits} min={0} className="w-36" />
              <Button size="sm" onClick={() => cheat({ op: 'editRelease', releaseId: relId, addUnits: units }, `Sold ${fmtUnits(units)} more copies`)}>
                Add sales
              </Button>
            </div>
          </>
        )}
      </Card>
      <Card title="Franchise fans" desc={frs.length ? undefined : 'Release a game to start a franchise.'}>
        {frs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <select className={cx(inputCls, 'min-w-0 flex-1')} value={frId} onChange={(e) => setFrId(e.target.value)} aria-label="Franchise">
              <option value="">Every franchise</option>
              {frs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {fmtUnits(f.fans)} fans
                </option>
              ))}
            </select>
            <NumberInput label="Fans" value={frFans} onChange={setFrFans} min={0} className="w-36" />
            <Button size="sm" onClick={() => cheat({ op: 'franchiseFans', franchiseId: frId || undefined, fans: frFans }, 'Fans updated')}>
              Set
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Research ────────────────────────────────────────────────────────────────

function ResearchCheats() {
  const s = useGame((g) => g.s)!;
  const cheat = useCheat();
  const yr = fromDay(s.day).year;
  const nowLeft = RESEARCH.filter((r) => r.year <= yr && !s.research.done.includes(r.id)).length;
  const allLeft = RESEARCH.filter((r) => !s.research.done.includes(r.id)).length;
  return (
    <div className="space-y-3">
      <Card title="Unlock research" desc={`${s.research.done.length} of ${RESEARCH.length} researched.`}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="research" disabled={!nowLeft} onClick={() => cheat({ op: 'unlockResearch', scope: 'now' }, `Unlocked ${nowLeft} research items`)}>
            Everything available in {yr} ({nowLeft})
          </Button>
          <Button size="sm" icon="rocket" disabled={!allLeft} onClick={() => cheat({ op: 'unlockResearch', scope: 'all' }, `Unlocked ${allLeft} research items, future tech included`)}>
            Everything, even the future ({allLeft})
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink3">Future tech unlocks features early, but platforms, genres and topics still arrive in their own years.</p>
      </Card>
      <Multiplier k="researchMul" label="Research speed" desc="Multiplies research points from your researchers." min={0.25} max={CHEAT_LIMITS.researchMul[1]} step={0.25} neutral={1} format={(v) => `×${v}`} />
    </div>
  );
}

// ── World ───────────────────────────────────────────────────────────────────

function WorldCheats() {
  const s = useGame((g) => g.s)!;
  const step = useGame((g) => g.step);
  const toast = useGame((g) => g.toast);
  const cheat = useCheat();
  const [days, setDays] = useState(90);
  const [tier, setTier] = useState(s.office.tier);
  const skip = (d: number) => {
    if (!Number.isFinite(d) || d < 1 || d > 3650) {
      toast({ text: 'Skip between 1 day and 10 years', tone: 'bad' });
      return;
    }
    // Mark the run first so the skip itself counts as a cheat.
    if (!cheat({ op: 'settings', settings: {} })) return;
    step(Math.round(d));
    toast({ text: `Skipped ${Math.round(d)} days`, tone: 'good', icon: 'fastest' });
  };
  return (
    <div className="space-y-3">
      <Card title="Skip time" desc="Simulates the days instantly (projects, sales and the market all move on). Events that need a decision will be waiting for you.">
        <div className="flex flex-wrap gap-1.5">
          {[
            [7, '1 week'],
            [30, '1 month'],
            [182, '6 months'],
            [365, '1 year'],
            [1826, '5 years'],
          ].map(([d, l]) => (
            <Button key={l} size="sm" variant="ghost" onClick={() => skip(d as number)}>
              {l}
            </Button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <NumberInput label="Days" value={days} onChange={setDays} min={1} max={3650} className="w-28" />
          <Button size="sm" onClick={() => skip(days)}>
            Skip days
          </Button>
        </div>
      </Card>
      <Card title="Office" desc="Move straight to any office, free of charge and ignoring reputation requirements.">
        <div className="flex gap-2">
          <select className={cx(inputCls, 'min-w-0 flex-1')} value={tier} onChange={(e) => setTier(Number(e.target.value))} aria-label="Office">
            {OFFICE_TIERS.map((t) => (
              <option key={t.tier} value={t.tier}>
                {t.name} · up to {t.staffCap} staff{t.tier === s.office.tier ? ' (current)' : ''}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={tier === s.office.tier} onClick={() => cheat({ op: 'officeTier', tier }, 'Moved in!')}>
            Move
          </Button>
        </div>
      </Card>
      <Toggle k="freeBuild" label="Free building" desc="Furniture costs nothing and office moves ignore cost and reputation." />
      <Toggle k="noEvents" label="No random events" desc="A quiet world: no surprise choices, disasters or windfalls." />
      <Section title="Active switches">
        <ActiveList />
      </Section>
    </div>
  );
}

function ActiveList() {
  const s = useGame((g) => g.s)!;
  const c = s.cheats ?? {};
  const items: string[] = [];
  if (c.infiniteMoney) items.push(`Infinite money (floor ${fmtMoney(c.moneyFloor ?? 1_000_000)})`);
  if (c.noBankruptcy) items.push('No bankruptcy');
  if (c.noBurnout) items.push('Tireless team');
  if (c.alwaysHappy) items.push('Always happy');
  if (c.noBugs) items.push('Bug-free code');
  if (c.noEvents) items.push('No random events');
  if (c.freeBuild) items.push('Free building');
  if ((c.salesMul ?? 1) !== 1) items.push(`Sales ×${(c.salesMul ?? 1).toFixed(1)}`);
  if ((c.workMul ?? 1) !== 1) items.push(`Work output ×${c.workMul}`);
  if ((c.researchMul ?? 1) !== 1) items.push(`Research ×${c.researchMul}`);
  if ((c.scoreBonus ?? 0) !== 0) items.push(`Review bonus ${c.scoreBonus! > 0 ? '+' : ''}${c.scoreBonus}`);
  return items.length ? (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Pill key={i} tone="accent">
          {i}
        </Pill>
      ))}
    </div>
  ) : (
    <p className="text-xs text-ink3">None — the world runs by the normal rules.</p>
  );
}
