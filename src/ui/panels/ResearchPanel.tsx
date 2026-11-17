import { useState } from 'react';
import { isAway } from '@/sim/systems/staff';
import { OPEN_SOURCE_AGE_YEARS, openSourceBlocked } from '@/sim/systems/giving';
import { RESEARCH, RESEARCH_BY_ID, type ResearchBranch } from '@/data/research';
import { ENGINES } from '@/data/engines';
import { fromDay } from '@/sim/calendar';
import { fmtMoney, money } from '@/sim/util';
import { researchAvailable, researchCost, researchRate, researchers } from '@/sim/systems/research';
import { engineBuildPoints, engineTechFor } from '@/sim/systems/dev';
import { Button, Empty, Field, Meter, Pill, Section, Segmented, cx, inputCls } from '../components/ui';
import { Icon } from '../icons';
import { useGame } from '../store';
import HardwarePanel from './HardwarePanel';
import { StaffPicker } from '../components/StaffPicker';
import { freeStaff } from './staffTools';

const BRANCHES: { id: ResearchBranch; label: string }[] = [
  { id: 'graphics', label: 'Graphics' },
  { id: 'audio', label: 'Audio' },
  { id: 'systems', label: 'Systems' },
  { id: 'online', label: 'Online' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'business', label: 'Business' },
  { id: 'ai', label: 'AI' },
];

export default function ResearchPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const tab = useGame((g) => g.panelTab) ?? 'tree';
  const setTab = (t: string) => useGame.setState({ panelTab: t });
  return (
    <div>
      <Segmented
        ariaLabel="Research sections"
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: 'tree', label: `Tech tree (${s.research.done.length}/${RESEARCH.length})` },
          { value: 'engines', label: `Engines (${Object.keys(s.engines).length})` },
          { value: 'hardware', label: `Hardware${s.hardware?.length ? ` (${s.hardware.length})` : ''}` },
        ]}
      />
      {tab === 'tree' ? <Tree /> : tab === 'engines' ? <Engines /> : <HardwarePanel />}
    </div>
  );
}

function Tree() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const [branch, setBranch] = useState<ResearchBranch>('graphics');
  const rate = researchRate(s);
  const active = s.research.active ? RESEARCH_BY_ID[s.research.active] : undefined;
  const team = researchers(s);
  const idleNow = Object.values(s.staff).filter((x) => x.assignment.kind === 'idle' && !isAway(x));
  const yr = fromDay(s.day).year;
  return (
    <div>
      <div className="mb-3 rounded-2xl border border-line bg-panel2/60 p-3">
        {active ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Researching: {active.name}</span>
              <span className="num text-xs text-ink3">{rate > 0 ? `~${Math.ceil(((active.points - s.research.progress) / rate) * 1.4)} days` : 'nobody assigned'}</span>
            </div>
            <Meter value={(s.research.progress / Math.max(1, active.points)) * 100} tone="tech" className="mt-1.5" label="Research progress" />
            {s.research.queue.length > 0 && <div className="mt-1 text-[11px] text-ink3">Next: {s.research.queue.map((q) => RESEARCH_BY_ID[q]?.name).join(' → ')}</div>}
          </>
        ) : (
          <div className="text-sm text-ink2">No active research. Pick a project below.</div>
        )}
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={cx(team.length ? 'text-ink3' : 'text-warn')}>
            {team.length ? `${team.length} researcher${team.length > 1 ? 's' : ''} · ${rate.toFixed(2)} pts/day` : 'Nobody is researching. Idle staff can — or pick people in the Staff panel.'}
          </span>
          {!team.length && idleNow.length > 0 && (
            <Button
              size="sm"
              variant="primary"
              icon="research"
              onClick={() => {
                for (const st of idleNow) act({ type: 'assign', staffId: st.id, to: 'research' });
                toast({ text: `${idleNow.length === 1 ? idleNow[0]!.name.split(' ')[0] : `${idleNow.length} people`} started researching`, tone: 'good', icon: 'research' });
              }}
            >
              Assign idle staff ({idleNow.length})
            </Button>
          )}
          {active && (
            <Button size="sm" variant="ghost" onClick={() => useGame.getState().actOrToast({ type: 'cancelResearch' }, 'Research stopped — half the budget refunded')} title="Stops this project and refunds half its cost">
              Stop (50% refund)
            </Button>
          )}
        </div>
      </div>
      <Segmented ariaLabel="Research branch" value={branch} onChange={setBranch} className="mb-2" options={BRANCHES.map((b) => ({ value: b.id, label: b.label }))} />
      <ol className="space-y-1.5">
        {RESEARCH.filter((r) => r.branch === branch).map((r) => {
          const done = s.research.done.includes(r.id);
          const av = researchAvailable(s, r);
          const isActive = s.research.active === r.id;
          const queued = s.research.queue.includes(r.id);
          const cost = researchCost(s, r);
          const prereqOnly = !av.ok && av.why?.startsWith('Requires') && yr >= r.year;
          return (
            <li key={r.id} className={cx('flex items-center gap-3 rounded-xl border p-2.5', done ? 'border-good/40 bg-good/5' : isActive ? 'border-tech bg-tech/5' : 'border-line')}>
              <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', done ? 'bg-good/15 text-good' : 'bg-bg2 text-ink3')}>
                <Icon name={done ? 'check' : av.ok ? 'flask' : 'lock'} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {r.name}
                  {r.engineTech && <Pill tone="tech">engine +{r.engineTech}</Pill>}
                </div>
                <div className="text-xs text-ink3">{done ? r.desc : av.ok || prereqOnly ? r.desc : av.why}</div>
              </div>
              {!done && (
                <div className="text-right">
                  {(av.ok || prereqOnly) && (
                    <div className="num mb-1 text-[11px] text-ink3">
                      {r.points} pts · {fmtMoney(cost)}
                    </div>
                  )}
                  {isActive ? (
                    <Pill tone="tech">Active</Pill>
                  ) : queued ? (
                    <Pill>Queued</Pill>
                  ) : av.ok ? (
                    <Button
                      size="sm"
                      variant={s.research.active ? 'secondary' : 'primary'}
                      onClick={() => {
                        const res = act({ type: s.research.active ? 'queueResearch' : 'research', id: r.id });
                        if (!res.ok) toast({ text: res.error, tone: 'bad' });
                      }}
                    >
                      {s.research.active ? 'Queue' : 'Research'}
                    </Button>
                  ) : prereqOnly ? (
                    <Button size="sm" onClick={() => useGame.getState().actOrToast({ type: 'queueResearch', id: r.id }, `${r.name} queued`)}>
                      Queue
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Engines() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const yr = fromDay(s.day).year;
  const feats = s.research.done.filter((r) => RESEARCH_BY_ID[r]?.engineTech);
  const [sel, setSel] = useState<string[]>(feats);
  const [name, setName] = useState(`${s.company.name.split(' ')[0]} Engine ${Object.keys(s.engines).length}`);
  const progs = freeStaff(s);
  const [team, setTeam] = useState<string[]>(progs.sort((a, b) => b.skills.programming - a.skills.programming).slice(0, 2).map((x) => x.id));
  const tech = engineTechFor(sel);
  const pts = engineBuildPoints(sel, s.day);
  const cost = money(2_000 + tech * 2_500, s.day);
  const building = Object.values(s.projects).some((p) => p.kind === 'engine');
  const licensable = ENGINES.filter((e) => e.year <= yr && (e.retired === undefined || e.retired >= yr) && !Object.values(s.engines).some((x) => x.licensedFrom === e.id));
  return (
    <div>
      <Section title="Your engines">
        <ul className="space-y-1.5">
          {Object.values(s.engines)
            .sort((a, b) => b.tech - a.tech)
            .map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <span className="grid size-9 place-items-center rounded-lg bg-tech/15 text-tech">
                  <Icon name="gear" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {e.name} {e.licensedFrom && <Pill tone="tech">licensed</Pill>} {e.openSourced && <Pill tone="good">open source</Pill>}
                  </div>
                  <div className="text-xs text-ink3">
                    Tech {e.tech} · maturity {Math.round(e.maturity * 100)}% · {e.gamesShipped} games{e.royalty ? ` · ${Math.round(e.royalty * 100)}% royalty` : ''}
                    {e.licensees > 0 && ` · licensed to ${e.licensees} studios`}
                  </div>
                </div>
                {!e.licensedFrom && !e.openSourced && s.day - e.builtDay >= OPEN_SOURCE_AGE_YEARS * 365 && e.builtDay > 0 && (
                  <Button size="sm" variant="ghost" disabled={!!openSourceBlocked(s, e.id)} title={openSourceBlocked(s, e.id) ?? 'Release the code for free: reputation, proud programmers — and no more licensing income from it'} onClick={() => useGame.getState().actOrToast({ type: 'openSourceEngine', engineId: e.id }, `${e.name} is open source!`)}>
                    Open-source
                  </Button>
                )}
                {!e.licensedFrom && !e.openSourced && s.day - e.builtDay >= OPEN_SOURCE_AGE_YEARS * 365 && e.builtDay > 0 && openSourceBlocked(s, e.id) && <span className="max-w-[9rem] text-[11px] text-ink3">{openSourceBlocked(s, e.id)}</span>}
                {!e.licensedFrom && !e.openSourced && e.licensees === 0 && s.research.done.includes('biz_engine_licensing') && e.tech >= 4 && (
                  <Button size="sm" onClick={() => useGame.getState().actOrToast({ type: 'licenseOut', engineId: e.id })}>
                    License out
                  </Button>
                )}
              </li>
            ))}
        </ul>
      </Section>

      <Section title="Build a custom engine">
        {building ? (
          <p className="text-xs text-ink3">An engine is already being built (see Develop).</p>
        ) : feats.length === 0 ? (
          <Empty icon="gear" title="Research engine features first" />
        ) : (
          <div className="space-y-2">
            <Field label="Name">
              <input className={inputCls} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {feats.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={sel.includes(f)}
                  onClick={() => setSel((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]))}
                  className={cx('rounded-full border px-2.5 py-1 text-xs', sel.includes(f) ? 'border-tech bg-tech/10' : 'border-line')}
                >
                  {RESEARCH_BY_ID[f]?.name}
                </button>
              ))}
            </div>
            <div className="text-xs font-semibold text-ink2">Programmers</div>
            <StaffPicker pool={progs} selected={team} onChange={setTeam} cap={12} score={(st) => st.skills.programming} scoreLabel="prog" />
            <div className="flex items-center justify-between rounded-xl bg-bg2/60 p-2 text-xs">
              <span>
                Tech <b>{tech}</b> · {pts} points · {fmtMoney(cost)}
              </span>
              <Button
                variant="primary"
                size="sm"
                disabled={!sel.length || !team.length}
                onClick={() => {
                  const r = act({ type: 'buildEngine', name, features: sel, team });
                  toast(r.ok ? { text: `Engine work started: ${name}`, tone: 'good', icon: 'gear' } : { text: r.error, tone: 'bad' });
                }}
              >
                Start building
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="License an engine">
        {licensable.length === 0 ? (
          <p className="text-xs text-ink3">No third-party engines available right now.</p>
        ) : (
          <ul className="space-y-1.5">
            {licensable.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{e.name}</div>
                  <div className="text-ink3">
                    Tech {e.tech} · {e.features.join(', ')}
                    {e.notes ? ` · ${e.notes}` : ''}
                  </div>
                </div>
                <Button size="sm" disabled={s.company.cash < e.fee} onClick={() => useGame.getState().actOrToast({ type: 'licenseEngine', engineDef: e.id }, `${e.name} licensed`)}>
                  {e.fee ? fmtMoney(e.fee) : 'Free'}
                  {e.royalty ? ` + ${Math.round(e.royalty * 100)}%` : ''}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
