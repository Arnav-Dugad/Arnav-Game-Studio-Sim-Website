import { useState } from 'react';
import { TRAIT_BY_ID } from '@/data/traits';
import { SKILLS } from '@/data/types';
import { PERSON_BY_ID } from '@/data/people';
import { fmtMoney, money } from '@/sim/util';
import { tierDef, freeDesks } from '@/sim/systems/office';
import { ROLE_NAMES, marketSalary } from '@/sim/systems/staff';
import type { Candidate, Staff } from '@/sim/types';
import { Button, Empty, Meter, Pill, Section, Segmented, Tip, cx } from '../components/ui';
import { Avatar, InitialsBadge } from '../art/Avatar';
import { useGame } from '../store';

export function Face({ p, size = 40 }: { p: { name: string; look: number; morale: number; personId?: string }; size?: number }) {
  return p.personId ? <InitialsBadge name={p.name} size={size} legendary /> : <Avatar seed={p.look} size={size} mood={p.morale} />;
}

export function SkillBars({ skills, compact }: { skills: Staff['skills']; compact?: boolean }) {
  const top = [...SKILLS].sort((a, b) => skills[b] - skills[a]).slice(0, compact ? 3 : 7);
  return (
    <div className={cx('grid gap-x-3 gap-y-1', compact ? 'grid-cols-3' : 'grid-cols-2')}>
      {top.map((k) => (
        <div key={k} className="text-[11px]">
          <div className="flex justify-between">
            <span className="capitalize text-ink3">{k}</span>
            <span className="num font-semibold">{Math.round(skills[k])}</span>
          </div>
          <Meter value={skills[k]} tone="tech" label={k} />
        </div>
      ))}
    </div>
  );
}

export function Traits({ traits }: { traits: Staff['traits'] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {traits.map((t) => {
        const d = TRAIT_BY_ID[t];
        return (
          <Tip key={t} content={d.desc}>
            <Pill tone={d.good === true ? 'good' : d.good === false ? 'bad' : 'neutral'}>{d.name}</Pill>
          </Tip>
        );
      })}
    </div>
  );
}

export default function StaffPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const tab = useGame((g) => g.panelTab) ?? 'team';
  const setTab = (t: string) => useGame.setState({ panelTab: t });
  return (
    <div>
      <Segmented
        ariaLabel="Staff sections"
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: 'team', label: `Team (${Object.keys(s.staff).length})` },
          { value: 'hire', label: `Hire (${s.candidates.length})` },
          { value: 'policies', label: 'Policies' },
        ]}
      />
      {tab === 'team' && <Team />}
      {tab === 'hire' && <Hire />}
      {tab === 'policies' && <Policies />}
    </div>
  );
}

function assignmentLabel(s: NonNullable<ReturnType<typeof useGame.getState>['s']>, st: Staff): string {
  if (st.sickDays > 0) return `Sick (${st.sickDays}d)`;
  switch (st.assignment.kind) {
    case 'idle':
      return 'Idle';
    case 'research':
      return 'Research';
    case 'training':
      return `Training ${st.trainingSkill ?? ''}`;
    case 'project': {
      const p = s.projects[st.assignment.id];
      return p ? (p.kind === 'game' ? p.concept.name : p.kind === 'contract' ? 'Contract' : 'Engine') : 'Idle';
    }
  }
}

function Team() {
  const s = useGame((g) => g.s)!;
  const pushModal = useGame((g) => g.pushModal);
  const [sort, setSort] = useState<'name' | 'morale' | 'skill' | 'salary'>('skill');
  const list = Object.values(s.staff).sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : sort === 'morale' ? a.morale - b.morale : sort === 'salary' ? b.salary - a.salary : Math.max(...Object.values(b.skills)) - Math.max(...Object.values(a.skills)),
  );
  const payroll = Object.values(s.staff).reduce((t, x) => t + x.salary, 0);
  const avgMorale = list.reduce((t, x) => t + x.morale, 0) / Math.max(1, list.length);
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Payroll</div>
          <div className="num font-semibold">{fmtMoney(payroll)}/yr</div>
        </div>
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Avg morale</div>
          <div className={cx('num font-semibold', avgMorale < 40 ? 'text-bad' : avgMorale > 70 ? 'text-good' : '')}>{Math.round(avgMorale)}%</div>
        </div>
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Capacity</div>
          <div className="num font-semibold">
            {list.length}/{tierDef(s.office.tier).staffCap}
          </div>
        </div>
      </div>
      <Segmented
        ariaLabel="Sort staff"
        value={sort}
        onChange={setSort}
        className="mb-2"
        options={[
          { value: 'skill', label: 'Skill' },
          { value: 'morale', label: 'Morale' },
          { value: 'salary', label: 'Salary' },
          { value: 'name', label: 'Name' },
        ]}
      />
      <ul className="space-y-1.5">
        {list.map((st) => (
          <li key={st.id}>
            <button type="button" onClick={() => pushModal({ kind: 'staff', staffId: st.id })} className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel2/50 p-2 text-left hover:bg-bg2">
              <Face p={st} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{st.name}</span>
                  {st.personId && <Pill tone="gold">Legend</Pill>}
                </div>
                <div className="truncate text-xs text-ink3">
                  {st.level} {ROLE_NAMES[st.role]} · {assignmentLabel(s, st)}
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
        ))}
      </ul>
    </div>
  );
}

function Hire() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const cap = tierDef(s.office.tier).staffCap;
  const full = Object.keys(s.staff).length >= cap;
  const desks = freeDesks(s);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg2/60 p-2 text-xs">
        <span>
          Free desks: <b className={desks <= 0 ? 'text-bad' : ''}>{desks}</b> · Office capacity {Object.keys(s.staff).length}/{cap}
        </span>
        <Button size="sm" icon="refresh" onClick={() => act({ type: 'refreshCandidates' })} title="Pay a recruiter for a fresh pool">
          New candidates ({fmtMoney(money(1_200, s.day))})
        </Button>
      </div>
      {desks <= 0 && !full && (
        <p className="mb-2 text-xs text-warn">
          Place another desk in the{' '}
          <button className="underline" onClick={() => useGame.getState().openPanel('office')}>
            Office
          </button>{' '}
          before hiring.
        </p>
      )}
      {full && <p className="mb-2 text-xs text-warn">Your office is full. Move to a bigger office to grow the team.</p>}
      {!s.candidates.length && <Empty icon="people" title="No candidates">The pool refreshes monthly. Reputation and recruiting attract better people.</Empty>}
      <div className="space-y-2">
        {s.candidates.map((c) => (
          <CandidateCard key={c.id} c={c} disabled={full || desks <= 0} onHire={() => {
            const r = act({ type: 'hire', candidateId: c.id });
            if (r.ok) toast({ text: `${c.name} joined the team!`, tone: 'good', icon: 'staff' });
            else toast({ text: r.error, tone: 'bad' });
          }} />
        ))}
      </div>
    </div>
  );
}

function CandidateCard({ c, onHire, disabled }: { c: Candidate; onHire: () => void; disabled: boolean }) {
  const s = useGame((g) => g.s)!;
  const person = c.personId ? PERSON_BY_ID[c.personId] : undefined;
  const market = marketSalary(s, c.skills);
  return (
    <article className={cx('rounded-2xl border bg-panel2/50 p-3', person ? 'border-gold/60' : 'border-line')}>
      <div className="flex items-start gap-3">
        <Face p={c} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{c.name}</span>
            {person && <Pill tone="gold">Industry legend</Pill>}
            {c.fromRival && <Pill tone="tech">Poach from {s.rivals[c.fromRival]?.name ?? 'rival'}</Pill>}
          </div>
          <div className="text-xs text-ink3">
            {c.level} {ROLE_NAMES[c.role]} · potential {c.potential}
            {person && ` · ${person.knownFor}`}
          </div>
          <div className="mt-1.5">
            <Traits traits={c.traits} />
          </div>
        </div>
        <div className="text-right">
          <div className="num text-sm font-semibold">{fmtMoney(c.askSalary)}/yr</div>
          <div className="text-[10px] text-ink3">{c.fromRival ? `+${fmtMoney(c.askSalary * 0.25)} fee · −1 rep` : `market ${fmtMoney(market)}`}</div>
          <Button size="sm" variant="primary" className="mt-1" onClick={onHire} disabled={disabled}>
            Hire
          </Button>
        </div>
      </div>
      <div className="mt-2">
        <SkillBars skills={c.skills} compact />
      </div>
    </article>
  );
}

function Policies() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const p = s.company.policies;
  return (
    <div className="space-y-4 text-sm">
      <Section title="Benefits">
        <Segmented
          ariaLabel="Benefits"
          value={p.salaryPolicy}
          onChange={(v) => act({ type: 'setPolicy', salaryPolicy: v })}
          options={[
            { value: 'lean', label: 'Lean (−5 morale)' },
            { value: 'market', label: 'Standard' },
            { value: 'generous', label: 'Generous (+5 morale, +8% payroll)' },
          ]}
        />
      </Section>
      <Section title="Recruiting">
        <Segmented
          ariaLabel="Recruiting budget"
          value={s.company.recruiting}
          onChange={(v) => act({ type: 'setRecruiting', level: v })}
          options={[0, 1, 2, 3].map((l) => ({ value: l, label: l === 0 ? 'None' : `${'★'.repeat(l)} ${fmtMoney(money(1_500 * l, s.day))}/mo` }))}
        />
        <p className="mt-1 text-xs text-ink3">More and better candidates each month.</p>
      </Section>
      <Section title="Work culture">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>Hybrid / remote work</b>
            <span className="block text-xs text-ink3">+4 morale for everyone.</span>
          </span>
          <input type="checkbox" checked={p.remote} onChange={(e) => act({ type: 'setPolicy', remote: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        </label>
        <label className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>Four-day week</b>
            <span className="block text-xs text-ink3">+9 morale, burnout heals faster, −12% output.</span>
          </span>
          <input type="checkbox" checked={p.fourDayWeek} onChange={(e) => act({ type: 'setPolicy', fourDayWeek: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        </label>
      </Section>
    </div>
  );
}
