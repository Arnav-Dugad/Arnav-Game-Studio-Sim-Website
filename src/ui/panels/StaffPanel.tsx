import { useState } from 'react';
import { PERSON_BY_ID } from '@/data/people';
import { fmtMoney, money } from '@/sim/util';
import { tierDef, freeDesks } from '@/sim/systems/office';
import { ROLE_NAMES, marketSalary } from '@/sim/systems/staff';
import type { Candidate } from '@/sim/types';
import { Button, Empty, Pill, Section, Segmented, cx } from '../components/ui';
import { useGame } from '../store';
import { Face, SkillBars, Traits } from './staffBits';
import { TeamTab } from './TeamTab';

export { Face, SkillBars, Traits };

export default function StaffPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const raw = useGame((g) => g.panelTab) ?? 'team';
  const tab = raw === 'idle' ? 'team' : raw;
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
      {tab === 'team' && <TeamTab />}
      {tab === 'hire' && <Hire />}
      {tab === 'policies' && <Policies />}
    </div>
  );
}

function Hire() {
  const s = useGame((g) => g.s)!;
  const [role, setRole] = useState<'all' | Candidate['role']>('all');
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
        <Button size="sm" icon="refresh" onClick={() => useGame.getState().actOrToast({ type: 'refreshCandidates' }, 'Fresh candidates found')} title="Pay a recruiter for a fresh pool">
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
      {s.candidates.length > 0 && (
        <Segmented
          ariaLabel="Filter by role"
          value={role}
          onChange={setRole}
          className="mb-2"
          options={[{ value: 'all' as const, label: 'All' }, ...[...new Set(s.candidates.map((c) => c.role))].map((r) => ({ value: r, label: ROLE_NAMES[r] }))]}
        />
      )}
      <div className="space-y-2">
        {s.candidates.filter((c) => role === 'all' || c.role === role).map((c) => (
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
      <Section title="Automation">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>Idle staff join research</b>
            <span className="block text-xs text-ink3">Each week, anyone left idle starts researching instead of drawing salary for nothing. Pull them onto projects any time.</span>
          </span>
          <input type="checkbox" checked={!!p.autoResearch} onChange={(e) => act({ type: 'setPolicy', autoResearch: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        </label>
        <label className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>Automatic vacations</b>
            <span className="block text-xs text-ink3">Anyone whose burnout passes 70 takes two weeks off (if they haven’t had a break in the last four months).</span>
          </span>
          <input type="checkbox" checked={!!p.autoVacation} onChange={(e) => act({ type: 'setPolicy', autoVacation: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        </label>
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
