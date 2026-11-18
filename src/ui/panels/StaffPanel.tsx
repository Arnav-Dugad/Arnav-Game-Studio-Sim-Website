import { useState } from 'react';
import { PLEDGE_YEAR, pledgeBlocked, pledged } from '@/sim/systems/crunchPledge';
import { formatDate, fromDay } from '@/sim/calendar';
import { INTERN_YEAR, internCount } from '@/sim/systems/interns';
import { WELLNESS_COST } from '@/sim/systems/finance';
import { RETREAT_MORALE, retreatBlocked, retreatCost } from '@/sim/systems/studioLife';
import { PERSON_BY_ID } from '@/data/people';
import { fmtMoney, money } from '@/sim/util';
import { tierDef, freeDesks, crampedCount } from '@/sim/systems/office';
import { HIREABLE_ROLES, ROLE_NAMES, ROLE_SEARCH_COST, ROLE_SEARCH_SIZE, marketSalary } from '@/sim/systems/staff';
import type { Candidate, GameProject } from '@/sim/types';
import { BALANCE } from '@/data/balance';
import { ITEM_BY_ID } from '@/data/facilities';
import { Button, Empty, Pill, Section, Segmented, cx, inputCls } from '../components/ui';
import { useGame } from '../store';
import { Face, SkillBars, Traits } from './staffBits';
import { TeamTab } from './TeamTab';
import { AcademySection } from './AcademySection';

export { Face, SkillBars, Traits };

export default function StaffPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const raw = useGame((g) => g.panelTab) ?? 'team';
  const tab = raw === 'idle' || raw === 'risk' || raw === 'ambition' ? 'team' : raw;
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
      {tab === 'team' && <TeamTab key={raw} />}
      {tab === 'hire' && <Hire />}
      {tab === 'policies' && <Policies />}
    </div>
  );
}

type HireSort = 'skill' | 'potential' | 'cheap' | 'value';
const candSkill = (c: Candidate) => Math.max(...Object.values(c.skills));

function Hire() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const [role, setRole] = useState<'all' | Candidate['role']>('all');
  const [sort, setSort] = useState<HireSort>('skill');
  const [picked, setPicked] = useState<string[]>([]);
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const cap = tierDef(s.office.tier).staffCap;
  const room = cap - Object.keys(s.staff).length;
  const full = room <= 0;
  const desks = freeDesks(s);
  const cramped = crampedCount(s);
  const list = s.candidates
    .filter((c) => role === 'all' || c.role === role)
    .sort((a, b) =>
      sort === 'potential' ? b.potential - a.potential : sort === 'cheap' ? a.askSalary - b.askSalary : sort === 'value' ? candSkill(b) / b.askSalary - candSkill(a) / a.askSalary : candSkill(b) - candSkill(a),
    );
  const sel = picked.filter((id) => s.candidates.some((c) => c.id === id));
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  /** New hires get to work: with a single game in development that has room, they join its team. */
  const joinCurrent = (names: string[]): string | null => {
    const st = useGame.getState().s!;
    const games = Object.values(st.projects).filter((p): p is GameProject => p.kind === 'game');
    if (games.length !== 1) return null;
    const g = games[0]!;
    const fresh = Object.values(st.staff).filter((x) => names.includes(x.name) && x.hiredDay === st.day && x.assignment.kind === 'idle').map((x) => x.id);
    const roomLeft = BALANCE.SIZE[g.concept.size].teamCap - g.team.length;
    const joining = fresh.slice(0, Math.max(0, roomLeft));
    if (!joining.length) return null;
    return act({ type: 'setTeam', projectId: g.id, team: [...g.team, ...joining] }).ok ? g.concept.name : null;
  };
  // the desk "Hire" adds when nobody has a free one (the newest kind you can buy, as furnishing does)
  const deskless = Object.values(s.staff).filter((x) => !x.deskId).length;
  const hireDesk = Object.values(ITEM_BY_ID).filter((i) => i.category === 'desk' && i.year <= fromDay(s.day).year && (!i.research || s.research.done.includes(i.research))).pop();
  const hireOne = (c: Candidate) => {
    if (freeDesks(s) <= 0) act({ type: 'furnishDesks', extra: 1 });
    const r = act({ type: 'hire', candidateId: c.id });
    if (r.ok) {
      const on = joinCurrent([c.name]);
      toast({ text: on ? `${c.name} joined — and is already working on ${on}` : `${c.name} joined the team!`, tone: 'good', icon: 'staff' });
    } else toast({ text: r.error, tone: 'bad' });
  };
  const hireSelected = () => {
    const chosen = sel
      .map((id) => s.candidates.find((c) => c.id === id)!)
      .filter(Boolean)
      .slice(0, Math.max(0, room));
    if (!chosen.length) {
      toast({ text: full ? 'Your office is full' : 'Pick some candidates first', tone: 'bad' });
      return;
    }
    // Seat them first: add any missing desks in one go.
    if (freeDesks(s) < chosen.length) act({ type: 'furnishDesks', extra: chosen.length });
    let ok = 0;
    let err = '';
    for (const c of chosen) {
      const r = act({ type: 'hire', candidateId: c.id });
      if (r.ok) ok += 1;
      else if (!err) err = `${c.name}: ${r.error}`;
    }
    setPicked([]);
    const on = ok ? joinCurrent(chosen.map((c) => c.name)) : null;
    toast(
      ok === chosen.length
        ? { text: `${ok} new hire${ok === 1 ? '' : 's'} joined${on ? ` — working on ${on}` : '!'}`, tone: 'good', icon: 'staff' }
        : { text: `${ok} hired, ${chosen.length - ok} not${err ? ` (${err})` : ''}`, tone: ok ? 'neutral' : 'bad' },
    );
  };
  return (
    <div className="pb-14">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg2/60 p-2 text-xs">
        <span>
          <span title="Everyone needs a desk; hiring places one for you if none is free">Free desks: <b className={desks <= 0 ? 'text-warn' : ''}>{desks}</b>{desks <= 0 && !full ? ' (hiring adds one)' : ''}</span> · <span title="The most people this office can hold — move to a bigger office for more">People {Object.keys(s.staff).length} of {cap} this office holds</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {cramped >= 3 && (
            <Button
              size="sm"
              icon="move"
              onClick={() => {
                const before = cramped;
                const r = act({ type: 'spreadOut' });
                if (!r.ok) toast({ text: r.error, tone: 'bad' });
                else toast({ text: `Moved people to roomier desks: ${before} → ${crampedCount(useGame.getState().s!)} cramped`, tone: 'good' });
              }}
              title="Give everyone room: people move to roomier desks, cramped desks are sold (40% back) and new ones placed across every floor. Undone automatically if it wouldn’t help."
            >
              Spread out ({cramped} cramped)
            </Button>
          )}
          {desks <= 0 && !full && (
            <Button size="sm" icon="plus" onClick={() => useGame.getState().actOrToast({ type: 'furnishDesks', extra: Math.min(5, room) }, 'Desks added')} title="Place up to five more of your best desk">
              Add desks
            </Button>
          )}
          <Button size="sm" icon="refresh" disabled={full} onClick={() => useGame.getState().actOrToast({ type: 'refreshCandidates' }, 'Fresh candidates found')} title={full ? 'Your office is full — move to a bigger one before hiring' : 'Pay a recruiter for a fresh pool'}>
            New candidates ({fmtMoney(money(1_200, s.day))})
          </Button>
          <select
            className={cx(inputCls, 'h-8 !w-auto text-xs')}
            value=""
            disabled={full}
            aria-label="Search for a role"
            title={`A recruiter finds ${ROLE_SEARCH_SIZE} candidates for the role you pick`}
            onChange={(e) => {
              const r = e.target.value;
              if (r) useGame.getState().actOrToast({ type: 'searchRole', role: r }, `${ROLE_SEARCH_SIZE} ${ROLE_NAMES[r as keyof typeof ROLE_NAMES].toLowerCase()}s found`);
            }}
          >
            <option value="">Find a… ({fmtMoney(money(ROLE_SEARCH_COST, s.day))})</option>
            {HIREABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAMES[r]}
              </option>
            ))}
          </select>
        </span>
      </div>
      {full && <p className="mb-2 text-xs text-warn">Your office is full. Move to a bigger office to grow the team.</p>}
      {!s.candidates.length && <Empty icon="people" title="No candidates">The pool refreshes monthly. Reputation and recruiting attract better people.</Empty>}
      {s.candidates.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Filter by role"
            value={role}
            onChange={setRole}
            options={[{ value: 'all' as const, label: 'All' }, ...[...new Set(s.candidates.map((c) => c.role))].map((r) => ({ value: r, label: ROLE_NAMES[r] }))]}
          />
          <select className={cx(inputCls, 'h-8 !w-36 text-xs')} value={sort} onChange={(e) => setSort(e.target.value as HireSort)} aria-label="Sort candidates">
            <option value="skill">Best skill</option>
            <option value="potential">Most potential</option>
            <option value="value">Best value</option>
            <option value="cheap">Cheapest</option>
          </select>
        </div>
      )}
      {s.candidates.length > 0 && (
        <p className="mb-2 text-[11px] text-ink3">
          Each hire costs a {fmtMoney(money(300, s.day))} recruiting fee
          {freeDesks(s) <= 0 && hireDesk && !s.cheats?.freeBuild ? deskless > 0 ? `, plus ${deskless + 1} desks (${fmtMoney(money(hireDesk.cost, s.day) * (deskless + 1))}) — none are free and ${deskless} ${deskless === 1 ? 'person has' : 'people have'} no desk yet` : `, plus a desk (${fmtMoney(money(hireDesk.cost, s.day))}) — none are free` : ''}. People poached from a rival add a headhunter’s fee of a quarter of their salary.
        </p>
      )}
      <div className="space-y-2">
        {list.map((c) => (
          <CandidateCard key={c.id} c={c} disabled={full} onHire={() => hireOne(c)} picked={sel.includes(c.id)} onPick={() => toggle(c.id)} />
        ))}
      </div>
      {sel.length > 0 && (
        <div className="glass sticky bottom-0 z-20 mt-3 flex items-center gap-2 rounded-2xl p-2 text-xs shadow-lg animate-fade-up">
          <span className="font-semibold">{sel.length} picked</span>
          <span className="text-ink3">· {fmtMoney(sel.reduce((t, id) => t + (s.candidates.find((c) => c.id === id)?.askSalary ?? 0), 0))}/yr</span>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
            Clear
          </Button>
          <Button size="sm" variant="primary" icon="plus" disabled={full} onClick={hireSelected}>
            Hire {Math.min(sel.length, Math.max(0, room))}
          </Button>
        </div>
      )}
    </div>
  );
}

function CandidateCard({ c, onHire, disabled, picked, onPick }: { c: Candidate; onHire: () => void; disabled: boolean; picked?: boolean; onPick?: () => void }) {
  const s = useGame((g) => g.s)!;
  const person = c.personId ? PERSON_BY_ID[c.personId] : undefined;
  const market = marketSalary(s, c.skills);
  return (
    <article className={cx('rounded-2xl border bg-panel2/50 p-3', picked ? 'border-accent bg-accent/10' : person ? 'border-gold/60' : 'border-line')}>
      <div className="flex items-start gap-3">
        {onPick && <input type="checkbox" checked={!!picked} onChange={onPick} className="mt-3 size-4 shrink-0 accent-[var(--accent)]" aria-label={`Pick ${c.name}`} />}
        <Face p={c} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{c.name}</span>
            {person && <Pill tone="gold">Industry legend</Pill>}
            {c.fromRival && <Pill tone="tech">Poach from {s.rivals[c.fromRival]?.name ?? 'rival'}</Pill>}
            {c.returning && (
              <span title={`Left ${formatDate(c.returning.leftDay)} — ${c.returning.reason}. Comes back loyal.`}>
                <Pill tone="good">Former colleague</Pill>
              </span>
            )}
            {c.formerly && <Pill tone="neutral">ex-{c.formerly}</Pill>}
            {c.academy && (
              <span title="Trained at your academy: high potential, asks under market rate, loyal to the studio">
                <Pill tone="accent">Academy class of {c.academy}</Pill>
              </span>
            )}
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
        <label className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>Keep research going</b>
            <span className="block text-xs text-ink3">When your researchers run out of work, start the quickest available project (only if it costs under 10% of your cash).</span>
          </span>
          <input type="checkbox" checked={!!p.autoQueue} onChange={(e) => act({ type: 'setPolicy', autoQueue: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        </label>
        <label className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>Always mediate feuds</b>
            <span className="block text-xs text-ink3">When two people fall out, bring in a mediator straight away (a small fee each time) — no popup.</span>
          </span>
          <input type="checkbox" checked={!!p.autoMediate} onChange={(e) => act({ type: 'setPolicy', autoMediate: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        </label>
        <label className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>Keep pay at market rate</b>
            <span className="block text-xs text-ink3">Each week, anyone whose salary has fallen behind the market (as people grow and prices rise) gets a raise to the going rate — no more “Pay vs market” grumbling.</span>
          </span>
          <input type="checkbox" checked={!!p.autoPay} onChange={(e) => act({ type: 'setPolicy', autoPay: e.target.checked })} className="size-5 accent-[var(--accent)]" />
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
        <label className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>Wellness program</b>
            <span className="block text-xs text-ink3">Meditation, therapy, gym passes: +2 morale, burnout builds 15% slower. {fmtMoney(money(WELLNESS_COST, s.day))} per person per month.</span>
          </span>
          <input type="checkbox" checked={!!p.wellness} onChange={(e) => act({ type: 'setPolicy', wellness: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        </label>
      </Section>
      <Section title="Giving back">
        <Segmented
          ariaLabel="Charity pledge"
          value={String(p.charity ?? 0)}
          onChange={(v) => act({ type: 'setPolicy', charity: Number(v) as 0 | 1 | 5 })}
          options={[
            { value: '0', label: 'No pledge' },
            { value: '1', label: '1% of profit' },
            { value: '5', label: '5% of profit' },
          ]}
        />
        <p className="mt-1 text-xs text-ink3">
          Each month, the pledged share of last month’s profit goes to good causes. After three months of an unbroken pledge staff feel the work means more (+1 morale at 1%, +3 at 5%), and goodwill builds with what you actually give. Nothing is given in a loss-making month; lowering the pledge restarts the three months.
          {(s.progress.stats.donated ?? 0) > 0 && ` Given so far: ${fmtMoney(s.progress.stats.donated ?? 0)}.`}
        </p>
      </Section>
      <Section title="Summer internships">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>Host summer interns{fromDay(s.day).year < INTERN_YEAR ? ` (from ${INTERN_YEAR})` : ''}</b>
            <span className="block text-xs text-ink3">
              Every June, {internCount(s)} student{internCount(s) > 1 ? 's' : ''} join until September (if there are free desks): cheap, green, high potential, learning 50% faster — pair them with mentors. At the end you can offer the best one a job.
              {(s.progress.stats.internsHired ?? 0) > 0 && ` ${s.progress.stats.internsHired} former intern${s.progress.stats.internsHired === 1 ? '' : 's'} on the books so far.`}
            </span>
          </span>
          <input type="checkbox" disabled={fromDay(s.day).year < INTERN_YEAR} checked={!!p.interns} onChange={(e) => act({ type: 'setPolicy', interns: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        </label>
      </Section>
      <AcademySection />
      <Section title="No-crunch pledge">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span className="min-w-0">
            <b>{pledged(s) ? `Pledged since ${formatDate(s.company.crunchPledge!.since!)}` : 'Promise never to crunch'}</b>
            <span className="block text-xs text-ink3">
              {pledged(s)
                ? 'Everyone works happier for it (+3 morale). Crunching on any game now breaks the pledge in public: reputation −5, morale −8 for four months, and no new pledge for three years.'
                : `A public promise (from ${PLEDGE_YEAR}): +3 morale for as long as you keep it${s.company.crunchPledge?.ever ? '' : ', and goodwill the first time'}. Breaking it later is a scandal.`}
            </span>
          </span>
          {pledged(s) ? (
            <Button size="sm" variant="ghost" onClick={() => act({ type: 'crunchPledge', on: false })} title="Reputation −1, and no new pledge for a year">
              Withdraw
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={!!pledgeBlocked(s)} title={pledgeBlocked(s) ?? undefined} onClick={() => act({ type: 'crunchPledge', on: true })}>
              Pledge
            </Button>
          )}
        </div>
      </Section>
      <Section title="Parental leave">
        <Segmented
          ariaLabel="Parental leave"
          value={p.parentalLeave ?? 'standard'}
          onChange={(v) => act({ type: 'setPolicy', parentalLeave: v })}
          options={[
            { value: 'minimal', label: 'Two weeks' },
            { value: 'standard', label: 'Six weeks' },
            { value: 'generous', label: 'Sixteen weeks' },
          ]}
        />
        <p className="mt-1 text-xs text-ink3">
          {(p.parentalLeave ?? 'standard') === 'minimal'
            ? 'New parents are back fast — but they resent it (−8 loyalty, a sour mood) and some quit to be with their baby.'
            : (p.parentalLeave ?? 'standard') === 'generous'
              ? 'Four months paid at home with the baby: +15 loyalty and a happy return, +1 morale for everyone. Their projects miss them for longer.'
              : 'Six weeks paid: a fair deal, +4 loyalty.'}
          {(s.progress.stats.babies ?? 0) > 0 && <> {s.progress.stats.babies} {s.progress.stats.babies === 1 ? 'baby' : 'babies'} born to the studio so far.</>}
        </p>
      </Section>
      {s.company.union && (
        <div className="rounded-xl bg-good/10 p-2.5 text-xs text-ink2">
          <b className="text-good">Unionised.</b> Morale +4 for everyone, and crunch overtime protections halve its morale cost.
        </div>
      )}
      <Section title="Team retreat">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-bg2/60 p-2.5">
          <span>
            <b>A few days away together</b>
            <span className="block text-xs text-ink3">
              +{RETREAT_MORALE.v} morale for {RETREAT_MORALE.days} days, everyone rested, burnout −15, friendships grow. Once a year · {fmtMoney(retreatCost(s))}
            </span>
          </span>
          <Button size="sm" disabled={!!retreatBlocked(s)} title={retreatBlocked(s) ?? undefined} onClick={() => useGame.getState().actOrToast({ type: 'teamRetreat' }, 'Off on a retreat! 🏕️')}>
            Book it
          </Button>
        </div>
        {s.eotm && s.staff[s.eotm.id] && (
          <p className="mt-2 text-xs text-ink2">
            ⭐ Employee of the Month: <b>{s.staff[s.eotm.id]!.name}</b>
          </p>
        )}
      </Section>
    </div>
  );
}
