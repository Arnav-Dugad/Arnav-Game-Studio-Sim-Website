/**
 * The Team tab, built for big studios: status chips, search, role filter, sort, grouping, a compact
 * density, and multi-select with bulk actions (assign to a project, research, idle, vacation, training,
 * raises, letting people go).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { SKILLS, type Skill } from '@/data/types';
import { BALANCE } from '@/data/balance';
import { fromDay } from '@/sim/calendar';
import { fmtMoney } from '@/sim/util';
import { tierDef } from '@/sim/systems/office';
import { ROLE_NAMES } from '@/sim/systems/staff';
import type { GameState, Project, Role, Staff } from '@/sim/types';
import { Button, Meter, Pill, cx, inputCls } from '../components/ui';
import { Icon } from '../icons';
import { useGame } from '../store';
import { Face } from './staffBits';
import { atRisk, matchesQuery, statusOf, topSkill, type StaffStatus } from './staffTools';

type Filter = 'all' | StaffStatus | 'risk';
type Sort = 'skill' | 'morale' | 'burnout' | 'salary' | 'name' | 'role' | 'tenure';
type Group = 'none' | 'role' | 'assignment';

const PAGE = 120;

function projectName(p: Project): string {
  return p.kind === 'game' ? p.concept.name : p.kind === 'contract' ? p.title : `Engine: ${p.name}`;
}
function projectCap(p: Project): number {
  return p.kind === 'game' ? BALANCE.SIZE[p.concept.size].teamCap : 99;
}

function assignmentLabel(s: GameState, st: Staff): string {
  if (st.sickDays > 0) return `Sick (${st.sickDays}d)`;
  if ((st.vacationDays ?? 0) > 0) return `On vacation (${st.vacationDays}d)`;
  switch (st.assignment.kind) {
    case 'idle':
      return 'Idle';
    case 'research':
      return 'Research';
    case 'training':
      return `Training ${st.trainingSkill ?? ''}`;
    case 'project': {
      const p = s.projects[st.assignment.id];
      return p ? projectName(p) : 'Idle';
    }
  }
}

export function TeamTab() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const pushModal = useGame((g) => g.pushModal);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(() => (useGame.getState().panelTab === 'idle' ? 'idle' : 'all'));
  const [role, setRole] = useState<Role | 'all'>('all');
  const [sort, setSort] = useState<Sort>('skill');
  const [group, setGroup] = useState<Group>('none');
  const [dense, setDense] = useState(() => Object.keys(s.staff).length > 25);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);

  const all = Object.values(s.staff);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: all.length,
      idle: 0,
      project: 0,
      research: 0,
      training: 0,
      away: 0,
      risk: 0,
    };
    for (const st of all) {
      c[statusOf(st)] += 1;
      if (atRisk(st)) c.risk += 1;
    }
    return c;
  }, [all]);
  const roles = useMemo(
    () => [...new Set(all.map((x) => x.role))].sort((a, b) => ROLE_NAMES[a].localeCompare(ROLE_NAMES[b])),
    [all],
  );

  const list = all
    .filter((st) => (filter === 'all' ? true : filter === 'risk' ? atRisk(st) : statusOf(st) === filter))
    .filter((st) => role === 'all' || st.role === role)
    .filter((st) => matchesQuery(st, q))
    .sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'morale':
          return a.morale - b.morale;
        case 'burnout':
          return b.burnout - a.burnout;
        case 'salary':
          return b.salary - a.salary;
        case 'role':
          return ROLE_NAMES[a.role].localeCompare(ROLE_NAMES[b.role]) || topSkill(b) - topSkill(a);
        case 'tenure':
          return a.hiredDay - b.hiredDay;
        default:
          return topSkill(b) - topSkill(a);
      }
    });
  // keep the selection to people who still exist
  const selected = [...sel].filter((id) => s.staff[id]);
  const shownIds = list.map((x) => x.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => sel.has(id));
  const toggle = (id: string) =>
    setSel((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // grouping
  const groups: { key: string; label: string; items: Staff[] }[] = [];
  if (group === 'none') groups.push({ key: 'all', label: '', items: list.slice(0, limit) });
  else {
    const m = new Map<string, Staff[]>();
    for (const st of list) {
      const k = group === 'role' ? ROLE_NAMES[st.role] : assignmentLabel(s, st);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(st);
    }
    for (const [k, items] of [...m.entries()].sort((a, b) => b[1].length - a[1].length))
      groups.push({ key: k, label: k, items });
  }

  const payroll = all.reduce((t, x) => t + x.salary, 0);
  const avgMorale = all.reduce((t, x) => t + x.morale, 0) / Math.max(1, all.length);
  const chip = (f: Filter, label: string, tone?: 'bad') => (
    <button
      key={f}
      type="button"
      role="radio"
      aria-checked={filter === f}
      disabled={f !== 'all' && counts[f] === 0}
      onClick={() => {
        setFilter(f);
        setLimit(PAGE);
      }}
      className={cx(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40',
        filter === f
          ? 'border-accent bg-accent text-accent-ink'
          : tone === 'bad' && counts[f] > 0
            ? 'border-bad/60 text-bad hover:bg-bad/10'
            : 'border-line hover:bg-bg2',
      )}
    >
      {label} <span className="num opacity-75">{counts[f]}</span>
    </button>
  );

  return (
    <div className="pb-16">
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Payroll</div>
          <div className="num font-semibold">{fmtMoney(payroll)}/yr</div>
        </div>
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Avg morale</div>
          <div
            className={cx(
              'num font-semibold',
              avgMorale < 40 ? 'text-bad' : avgMorale > 70 ? 'text-good' : '',
            )}
          >
            {Math.round(avgMorale)}%
          </div>
        </div>
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Capacity</div>
          <div className="num font-semibold">
            {all.length}/{tierDef(s.office.tier).staffCap}
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by status">
        {chip('all', 'Everyone')}
        {chip('idle', 'Idle')}
        {chip('project', 'On projects')}
        {chip('research', 'Research')}
        {chip('training', 'Training')}
        {chip('away', 'Away')}
        {chip('risk', 'Needs attention', 'bad')}
      </div>

      <div className="mb-2 space-y-2">
        <label className="relative block">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink3"
          />
          <input
            className={cx(inputCls, 'h-8 pl-8 text-xs')}
            placeholder="Search name, role, trait…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            aria-label="Search staff"
          />
        </label>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <select
            className={cx(inputCls, 'h-8 min-w-0 text-xs')}
            value={role}
            onChange={(e) => setRole(e.target.value as Role | 'all')}
            aria-label="Role"
          >
            <option value="all">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAMES[r]}
              </option>
            ))}
          </select>
          <select
            className={cx(inputCls, 'h-8 min-w-0 text-xs')}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort"
          >
            <option value="skill">Top skill</option>
            <option value="morale">Lowest morale</option>
            <option value="burnout">Most burnt out</option>
            <option value="salary">Salary</option>
            <option value="tenure">Longest serving</option>
            <option value="role">Role</option>
            <option value="name">Name</option>
          </select>
          <select
            className={cx(inputCls, 'h-8 min-w-0 text-xs')}
            value={group}
            onChange={(e) => setGroup(e.target.value as Group)}
            aria-label="Group"
          >
            <option value="none">No grouping</option>
            <option value="assignment">Group by assignment</option>
            <option value="role">Group by role</option>
          </select>
          <button
            type="button"
            onClick={() => setDense((d) => !d)}
            className="grid size-8 place-items-center rounded-lg border border-line hover:bg-bg2"
            title={dense ? 'Comfortable rows' : 'Compact rows'}
            aria-label={dense ? 'Comfortable rows' : 'Compact rows'}
          >
            <Icon name={dense ? 'grid' : 'menu'} size={14} />
          </button>
        </div>
      </div>

      <div className="mb-1.5 flex items-center justify-between text-xs text-ink3">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={allShownSelected}
            onChange={() =>
              setSel((x) => {
                const n = new Set(x);
                if (allShownSelected) for (const id of shownIds) n.delete(id);
                else for (const id of shownIds) n.add(id);
                return n;
              })
            }
            aria-label="Select everyone shown"
          />
          Select all {list.length !== all.length ? `${list.length} shown` : list.length}
        </label>
        <span>
          {list.length} of {all.length}
        </span>
      </div>

      {list.length === 0 && (
        <p className="py-4 text-center text-xs text-ink3">Nobody matches these filters.</p>
      )}
      {groups.map((g) => (
        <section key={g.key} className="mb-2">
          {g.label && (
            <h4 className="sticky top-0 z-10 -mx-1 mb-1 flex items-center justify-between bg-panel/95 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink3 backdrop-blur">
              <span>{g.label}</span>
              <span className="num">{g.items.length}</span>
            </h4>
          )}
          <ul className={dense ? 'divide-y divide-line rounded-xl border border-line' : 'space-y-1.5'}>
            {g.items.map((st) =>
              dense ? (
                <DenseRow
                  key={st.id}
                  s={s}
                  st={st}
                  on={sel.has(st.id)}
                  toggle={() => toggle(st.id)}
                  open={() => pushModal({ kind: 'staff', staffId: st.id })}
                />
              ) : (
                <CardRow
                  key={st.id}
                  s={s}
                  st={st}
                  on={sel.has(st.id)}
                  toggle={() => toggle(st.id)}
                  open={() => pushModal({ kind: 'staff', staffId: st.id })}
                />
              ),
            )}
          </ul>
        </section>
      ))}
      {group === 'none' && list.length > limit && (
        <Button size="sm" variant="ghost" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, list.length - limit)} more
        </Button>
      )}
      {selected.length > 0 && <BulkBar ids={selected} clear={() => setSel(new Set())} />}
    </div>
  );
}

function Check({ on, toggle, name }: { on: boolean; toggle: () => void; name: string }) {
  return (
    <input
      type="checkbox"
      checked={on}
      onChange={toggle}
      onClick={(e) => e.stopPropagation()}
      className="size-4 shrink-0 accent-[var(--accent)]"
      aria-label={`Select ${name}`}
    />
  );
}

function DenseRow({
  s,
  st,
  on,
  toggle,
  open,
}: {
  s: GameState;
  st: Staff;
  on: boolean;
  toggle: () => void;
  open: () => void;
}) {
  return (
    <li className={cx('flex items-center gap-2 px-2 py-1 text-xs', on && 'bg-accent/10')}>
      <Check on={on} toggle={toggle} name={st.name} />
      <button
        type="button"
        onClick={open}
        className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
      >
        <Face p={st} size={22} />
        <span className="min-w-0 flex-1 truncate font-semibold">{st.name}</span>
      </button>
      <span className="hidden w-28 truncate text-ink3 sm:block">
        {st.level} {ROLE_NAMES[st.role]}
      </span>
      <span className="hidden w-28 truncate text-ink2 min-[480px]:block">{assignmentLabel(s, st)}</span>
      <span className="num w-8 text-right font-semibold" title="Top skill">
        {Math.round(topSkill(st))}
      </span>
      <span
        className="w-8 sm:w-12"
        title={`Morale ${Math.round(st.morale)} · energy ${Math.round(st.energy)} · burnout ${Math.round(st.burnout)}`}
      >
        <Meter value={st.morale} label="Morale" />
      </span>
      {atRisk(st) ? (
        <Icon name="warning" size={13} className="shrink-0 text-bad" title="Needs attention" />
      ) : (
        <span className="w-[13px]" />
      )}
    </li>
  );
}

function CardRow({
  s,
  st,
  on,
  toggle,
  open,
}: {
  s: GameState;
  st: Staff;
  on: boolean;
  toggle: () => void;
  open: () => void;
}) {
  return (
    <li
      className={cx(
        'flex items-center gap-2 rounded-xl border p-2',
        on ? 'border-accent bg-accent/10' : 'border-line bg-panel2/50',
      )}
    >
      <Check on={on} toggle={toggle} name={st.name} />
      <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Face p={st} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{st.name}</span>
            {st.personId && <Pill tone="gold">Legend</Pill>}
            {atRisk(st) && <Pill tone="bad">Needs attention</Pill>}
          </div>
          <div className="truncate text-xs text-ink3">
            {st.level} {ROLE_NAMES[st.role]} · {assignmentLabel(s, st)} · since {fromDay(st.hiredDay).year}
          </div>
        </div>
        <div className="w-24 space-y-1 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="w-10 text-ink3">Morale</span>
            <Meter value={st.morale} label="Morale" />
          </div>
          <div className="flex items-center gap-1">
            <span className="w-10 text-ink3">Energy</span>
            <Meter value={st.energy} label="Energy" />
          </div>
          {st.burnout > 30 && (
            <div className="flex items-center gap-1">
              <span className="w-10 text-bad">Burnout</span>
              <Meter value={100 - st.burnout} label="Burnout" />
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

/** Actions for everyone selected, applied one by one with a single summary toast. */
function BulkBar({ ids, clear }: { ids: string[]; clear: () => void }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const [confirmFire, setConfirmFire] = useState(false);
  const [target, setTarget] = useState('');
  const projects = Object.values(s.projects).filter((p) => p.kind !== 'game' || p.phase < 3);
  const training = s.research.done.includes('biz_training');
  const people = ids.map((id) => s.staff[id]!).filter(Boolean);

  const runEach = (label: string, fn: (st: Staff) => { ok: boolean; error?: string } | null) => {
    let ok = 0;
    let firstErr = '';
    for (const st of people) {
      const r = fn(st);
      if (!r) continue;
      if (r.ok) ok += 1;
      else if (!firstErr) firstErr = `${st.name}: ${r.error}`;
    }
    const failed = people.length - ok;
    toast(
      failed
        ? {
            text: `${label}: ${ok} done, ${failed} skipped${firstErr ? ` (${firstErr})` : ''}`,
            tone: ok ? 'neutral' : 'bad',
          }
        : { text: `${label}: ${ok} done`, tone: 'good', icon: 'staff' },
    );
  };
  const res = (r: { ok: true } | { ok: false; error: string }) =>
    r.ok ? { ok: true } : { ok: false, error: r.error };

  const assignTo = (pid: string) => {
    const p = s.projects[pid];
    if (!p) return;
    const cap = projectCap(p);
    const room = Math.max(0, cap - p.team.length);
    const joining = people
      .filter(
        (st) =>
          !p.team.includes(st.id) &&
          st.assignment.kind !== 'training' &&
          (st.sickDays ?? 0) === 0 &&
          !(st.vacationDays ?? 0),
      )
      .slice(0, room);
    if (!joining.length) {
      toast({
        text: room
          ? 'Nobody selected can join right now (away, in training or already on it)'
          : `${projectName(p)} is full (${cap})`,
        tone: 'bad',
      });
      return;
    }
    // free them from other projects first
    for (const st of joining)
      if (st.assignment.kind === 'project' && st.assignment.id !== pid)
        act({ type: 'assign', staffId: st.id, to: 'idle' });
    const r = act({ type: 'setTeam', projectId: pid, team: [...p.team, ...joining.map((x) => x.id)] });
    const skipped = people.length - joining.length;
    if (r.ok) {
      clear();
      toast({
        text: `${joining.length} joined ${projectName(p)}${skipped ? ` · ${skipped} didn't fit or weren't available` : ''}`,
        tone: 'good',
        icon: 'staff',
      });
    } else toast({ text: r.error, tone: 'bad' });
  };

  const bar = (children: ReactNode) => (
    <div
      className="glass sticky bottom-0 z-20 -mx-1 mt-3 rounded-2xl p-2 shadow-lg animate-fade-up"
      role="region"
      aria-label="Bulk actions"
    >
      {children}
    </div>
  );

  return bar(
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 font-semibold">{people.length} selected</span>
      <select
        className={cx(inputCls, 'h-8 !w-44 text-xs')}
        value={target}
        onChange={(e) => {
          setTarget('');
          if (e.target.value) assignTo(e.target.value);
        }}
        aria-label="Assign to project"
      >
        <option value="">Assign to project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {projectName(p)} ({p.team.length}/{projectCap(p) === 99 ? '∞' : projectCap(p)})
          </option>
        ))}
      </select>
      <Button
        size="sm"
        icon="research"
        onClick={() =>
          runEach('Research', (st) => res(act({ type: 'assign', staffId: st.id, to: 'research' })))
        }
      >
        Research
      </Button>
      <Button
        size="sm"
        onClick={() =>
          runEach('Made idle', (st) =>
            st.assignment.kind === 'idle' ? null : res(act({ type: 'assign', staffId: st.id, to: 'idle' })),
          )
        }
      >
        Idle
      </Button>
      <Button
        size="sm"
        icon="sun"
        onClick={() => runEach('Vacation', (st) => res(act({ type: 'vacation', staffId: st.id, days: 14 })))}
        title="Two weeks off: burnout down, energy up"
      >
        Vacation
      </Button>
      {training && (
        <select
          className={cx(inputCls, 'h-8 !w-32 text-xs')}
          value=""
          onChange={(e) => {
            const skill = e.target.value as Skill;
            if (!skill) return;
            runEach(`Training ${skill}`, (st) => {
              if (st.assignment.kind === 'project') act({ type: 'assign', staffId: st.id, to: 'idle' });
              return res(act({ type: 'train', staffId: st.id, skill }));
            });
          }}
          aria-label="Train a skill"
          title="Send them to a four-week course (takes them off their projects)"
        >
          <option value="">Train…</option>
          {SKILLS.map((k) => (
            <option key={k} value={k}>
              {k === 'qa' ? 'QA' : k}
            </option>
          ))}
        </select>
      )}
      <Button
        size="sm"
        icon="cash"
        onClick={() =>
          runEach('Raise +10%', (st) =>
            res(act({ type: 'setSalary', staffId: st.id, salary: Math.round(st.salary * 1.1) })),
          )
        }
        title="A 10% raise lifts morale and loyalty"
      >
        +10% pay
      </Button>
      {confirmFire ? (
        <Button
          size="sm"
          variant="danger"
          icon="trash"
          onClick={() => {
            runEach('Let go', (st) =>
              st.role === 'founder' ? null : res(act({ type: 'fire', staffId: st.id })),
            );
            setConfirmFire(false);
            clear();
          }}
          onBlur={() => setConfirmFire(false)}
          autoFocus
        >
          Really let {people.filter((p) => p.role !== 'founder').length} go?
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          onClick={() => setConfirmFire(true)}
          disabled={people.every((p) => p.role === 'founder')}
        >
          Let go
        </Button>
      )}
      <span className="flex-1" />
      <Button size="sm" variant="ghost" onClick={clear}>
        Clear
      </Button>
    </div>,
  );
}
