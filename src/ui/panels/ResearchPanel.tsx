import { useState } from 'react';
import { isAway } from '@/sim/systems/staff';
import { OPEN_SOURCE_AGE_YEARS, openSourceBlocked } from '@/sim/systems/giving';
import { RESEARCH, RESEARCH_BY_ID, type ResearchBranch } from '@/data/research';
import { ENGINES } from '@/data/engines';
import { fromDay } from '@/sim/calendar';
import { fmtMoney, money } from '@/sim/util';
import { activeResearch, researchAvailable, researchCost, researchLeft, researchRate, researchers } from '@/sim/systems/research';
import { RND, RND_MAX, RND_UNLOCK, rndBlocked, rndCost, rndLevel, rndPoints, rndUnlocked } from '@/sim/systems/rnd';
import { engineBuildPoints, engineTechFor } from '@/sim/systems/dev';
import { Button, Empty, Field, Meter, Pill, Section, Segmented, cx, inputCls } from '../components/ui';
import { Icon } from '../icons';
import { useGame } from '../store';
import HardwarePanel from './HardwarePanel';
import { StaffPicker } from '../components/StaffPicker';
import { freeStaff } from './staffTools';
import { plural } from '@/sim/util';

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

/** Long-running R&D programmes: open once most of the tree is done; ten levels each, each costing more. */
function RndSection() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  if (!rndUnlocked(s)) {
    const left = RND_UNLOCK - s.research.done.length;
    return left <= 8 ? <p className="mb-3 rounded-xl bg-bg2/60 p-2.5 text-xs text-ink3">R&amp;D programmes open after {left} more research project{left === 1 ? '' : 's'}: long-running work on your pipeline, engine, testing, analytics and market research.</p> : null;
  }
  return (
    <section className="mb-3 rounded-2xl border border-tech/30 bg-tech/5 p-3" aria-label="R&D programmes">
      <h3 className="text-sm font-semibold">R&amp;D programmes</h3>
      <p className="mt-0.5 text-[11px] text-ink3">Long-running work that makes every game a little better — {RND_MAX} levels each, each dearer than the last.</p>
      <ul className="mt-2 space-y-1.5">
        {RND.map((r) => {
          const lv = rndLevel(s, r.id);
          const maxed = lv >= RND_MAX;
          const why = rndBlocked(s, r.id);
          const running = s.research.active === r.id;
          return (
            <li key={r.id} className={cx('flex items-center gap-3 rounded-xl border p-2', running ? 'border-tech bg-tech/10' : 'border-line bg-panel2/40')}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {r.name}
                  <span className="num text-[11px] font-normal text-ink3">level {lv}/{RND_MAX}</span>
                </div>
                <div className="text-xs text-ink3">{lv ? `${r.effect(lv)} so far.` : r.desc}{!maxed && ` Next: ${r.effect(lv + 1)}.`}</div>
                <div className="mt-1 flex gap-0.5" aria-hidden>
                  {Array.from({ length: RND_MAX }, (_, i) => (
                    <span key={i} className={cx('h-1 flex-1 rounded-full', i < lv ? 'bg-tech' : 'bg-[var(--line)]')} />
                  ))}
                </div>
              </div>
              {running ? (
                <Pill tone="tech">In progress</Pill>
              ) : maxed ? (
                <Pill tone="good">Complete</Pill>
              ) : (
                <div className="text-right">
                  <div className="num mb-1 text-[11px] text-ink3">
                    {rndPoints(s, r.id)} pts · {fmtMoney(rndCost(s, r.id))}
                  </div>
                  <Button
                    size="sm"
                    disabled={!!why}
                    title={why ?? `Start level ${lv + 1}`}
                    onClick={() => {
                      const res = act({ type: 'startRnd', id: r.id });
                      if (!res.ok) toast({ text: res.error, tone: 'bad' });
                    }}
                  >
                    Start
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tree() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const [branch, setBranch] = useState<ResearchBranch>('graphics');
  const rate = researchRate(s);
  const active = activeResearch(s);
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
            {s.research.queue.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink3">
                Next:
                {s.research.queue.map((q, i) => (
                  <span key={q} className="inline-flex items-center gap-0.5">
                    {i > 0 && '→ '}
                    {RESEARCH_BY_ID[q]?.name ?? q}
                    <button
                      type="button"
                      data-queue-x
                      className="grid min-h-6 min-w-6 place-items-center rounded px-1 text-ink3 hover:bg-bg2 hover:text-bad pointer-coarse:min-h-9 pointer-coarse:min-w-9"
                      title={`Take ${RESEARCH_BY_ID[q]?.name ?? q} off the queue (full refund — no work has started)`}
                      aria-label={`Remove ${RESEARCH_BY_ID[q]?.name ?? q} from the queue`}
                      onClick={(e) => {
                        const box = e.currentTarget.closest('section, div');
                        useGame.getState().actOrToast({ type: 'unqueueResearch', id: q }, `${RESEARCH_BY_ID[q]?.name ?? q} taken off the queue — budget refunded`);
                        // keep keyboard focus nearby: the next queued item's ✕, or the panel
                        setTimeout(() => (document.querySelector<HTMLElement>('[data-queue-x]') ?? box?.closest<HTMLElement>('aside'))?.focus({ preventScroll: true }), 0);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-ink2">{researchLeft(s) ? 'No active research. Pick a project below.' : 'Nothing to research yet — new projects open up as the industry moves on.'}</div>
        )}
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={cx(team.length ? 'text-ink3' : 'text-warn')}>
            {team.length ? `${team.length} researcher${team.length > 1 ? 's' : ''} · ${rate.toFixed(2)} pts/day` : researchLeft(s) ? 'Nobody is researching. Idle staff can — or pick people in the Staff panel.' : 'Nobody needs to research until something new opens up.'}
          </span>
          {idleNow.length > 0 && researchLeft(s) && (s.research.active || !team.length) && (
            <Button
              size="sm"
              variant="primary"
              icon="research"
              onClick={() => {
                for (const st of idleNow) act({ type: 'assign', staffId: st.id, to: 'research' });
                toast({ text: `${idleNow.length === 1 ? idleNow[0]!.name.split(' ')[0] : `${idleNow.length} people`} started researching`, tone: 'good', icon: 'research' });
              }}
            >
              {team.length ? 'Add' : 'Assign'} idle staff ({idleNow.length})
            </Button>
          )}
          {active && (
            <Button size="sm" variant="ghost" onClick={() => useGame.getState().actOrToast({ type: 'cancelResearch' }, 'Research stopped — half the budget refunded')} title="Stops this project and refunds half its cost">
              Stop (50% refund)
            </Button>
          )}
        </div>
      </div>
      <RndSection />
      <Segmented ariaLabel="Research branch" value={branch} onChange={setBranch} className="mb-2" options={BRANCHES.map((b) => ({ value: b.id, label: b.label }))} />
      <ol className="space-y-1.5">
        {RESEARCH.filter((r) => r.branch === branch).sort((a, b) => a.year - b.year).map((r) => {
          const done = s.research.done.includes(r.id);
          const av = researchAvailable(s, r);
          const isActive = s.research.active === r.id;
          const queued = s.research.queue.includes(r.id);
          const cost = researchCost(s, r);
          const prereqOnly = !av.ok && av.why?.startsWith('Requires') && yr >= r.year;
          // what has to be researched, under way or queued before this can join the queue
          const notLined = prereqOnly ? r.requires.filter((q) => !s.research.done.includes(q) && s.research.active !== q && !s.research.queue.includes(q)).map((q) => RESEARCH_BY_ID[q]?.name ?? q) : [];
          return (
            <li key={r.id} className={cx('flex items-center gap-3 rounded-xl border p-2.5', done ? 'border-good/40 bg-good/5' : isActive ? 'border-tech bg-tech/5' : 'border-line')}>
              <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', done ? 'bg-good/15 text-good' : 'bg-bg2 text-ink3')}>
                <Icon name={done ? 'check' : av.ok ? 'flask' : 'lock'} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {r.name}
                  {done && <span className="sr-only">(researched)</span>}
                  {r.engineTech && <Pill tone="tech">engine +{r.engineTech}</Pill>}
                </div>
                <div className="text-xs text-ink3">{done ? r.desc : av.ok || prereqOnly ? r.desc : av.why}</div>
                {notLined.length > 0 && <div className="text-[11px] text-warn">Queue {notLined.join(' and ')} first</div>}
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
                        else if (s.research.active) toast({ text: `${r.name} queued — ${fmtMoney(cost)} paid now (refunded if you take it off the queue)`, tone: 'neutral', icon: 'research' });
                      }}
                    >
                      {s.research.active ? `Queue · ${fmtMoney(cost)}` : 'Research'}
                    </Button>
                  ) : prereqOnly ? (
                    <Button size="sm" disabled={notLined.length > 0} title={notLined.length ? `Needs ${notLined.join(' and ')} first` : undefined} onClick={() => useGame.getState().actOrToast({ type: 'queueResearch', id: r.id }, `${r.name} queued`)}>
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
                    Tech {e.tech} · maturity {Math.round(e.maturity * 100)}% · {plural(e.gamesShipped, 'game')}{e.royalty ? ` · ${Math.round(e.royalty * 100)}% royalty` : ''}
                    {e.licensees > 0 && ` · licensed to ${plural(e.licensees, 'studio')}`}
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
