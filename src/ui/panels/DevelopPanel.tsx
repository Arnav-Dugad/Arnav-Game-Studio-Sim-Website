import { useEffect, useMemo, useState } from 'react';
import { BALANCE } from '@/data/balance';
import { GENRE_BY_ID } from '@/data/genres';
import { TOPIC_BY_ID } from '@/data/topics';
import { CHANNELS } from '@/data/marketing';
import { COMPANY_BY_ID } from '@/data/companies';
import { AUDIENCES, type Audience, type GenreId, type Monetization } from '@/data/types';
import { fromDay, formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits, money } from '@/sim/util';
import { availablePlatforms } from '@/sim/systems/market';
import { estimateContractDays } from '@/sim/systems/offers';
import { upcomingReleases } from '@/sim/systems/rivals';
import { qualityToScore } from '@/sim/systems/dev';
import { salesPotential } from '@/sim/systems/release';
import { devkitCost, marketResearchCost, monetizationAllowed, sizeAllowed } from '@/sim/actions';
import type { ContractProject, EngineProject, Focus3, GameProject, Size } from '@/sim/types';
import { Button, BreakdownList, Empty, Field, Meter, Pill, Section, Segmented, Tip, cx, inputCls } from '../components/ui';
import { Cover } from '../art/Cover';
import { Avatar, InitialsBadge } from '../art/Avatar';
import { CompanyBadge } from '../art/CompanyBadge';
import { Icon } from '../icons';
import { useGame } from '../store';
import { FocusSliders } from '../game/FocusEditor';
import { AREA_LABEL, PHASE_NAMES, SIZE_LABEL, availableGenres, availableTopics, bestSkill, comboFitValue, estimateCost, fitLabel, genreExperience, idealFocus, knowsCombo, suggestName } from '../game/lib';
import { sound } from '../sound';

export default function DevelopPanel() {
  const tab = useGame((g) => g.panelTab) ?? 'projects';
  const setTab = (t: string) => useGame.setState({ panelTab: t });
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const projects = Object.values(s.projects);
  return (
    <div>
      <Segmented
        ariaLabel="Develop sections"
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: 'projects', label: `Projects (${projects.length})` },
          { value: 'new', label: 'New game' },
          { value: 'contracts', label: `Contracts (${s.offers.contracts.length})` },
        ]}
      />
      {tab === 'projects' && <Projects onNew={() => setTab('new')} />}
      {tab === 'new' && <NewGame onDone={() => setTab('projects')} />}
      {tab === 'contracts' && <Contracts />}
    </div>
  );
}

// ── Active projects ─────────────────────────────────────────────────────────

function Projects({ onNew }: { onNew: () => void }) {
  const s = useGame((g) => g.s)!;
  const projects = Object.values(s.projects);
  if (!projects.length)
    return (
      <Empty icon="develop" title="Nothing in development">
        Start a new game, take on contract work for quick cash, or build an engine from the Research panel.
        <div className="mt-3">
          <Button variant="primary" icon="plus" onClick={onNew} data-tutorial="start-new-game">
            New game
          </Button>
        </div>
      </Empty>
    );
  return (
    <div className="space-y-3">
      {projects.map((p) => (p.kind === 'game' ? <GameCard key={p.id} p={p} /> : p.kind === 'contract' ? <ContractCard key={p.id} p={p} /> : <EngineCard key={p.id} p={p} />))}
      {!projects.some((p) => p.kind === 'game') && (
        <Button variant="primary" icon="plus" onClick={onNew}>
          New game
        </Button>
      )}
    </div>
  );
}

function GameCard({ p }: { p: GameProject }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const [showMkt, setShowMkt] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const total = p.phaseDays[0] + p.phaseDays[1] + p.phaseDays[2];
  const done = p.phase >= 3 ? total : p.phaseDays.slice(0, p.phase).reduce((a, b) => a + b, 0) + p.phaseDay;
  const pct = Math.min(1, done / total);
  const q = p.qualityPreview;
  const est = q ? Math.round(qualityToScore(q.total)) : null;
  const yr = fromDay(s.day).year;
  const run = (a: Parameters<typeof act>[0]) => {
    const r = act(a);
    if (!r.ok) toast({ text: r.error, tone: 'bad' });
  };
  const channels = CHANNELS.filter((c) => c.from <= yr && (c.to ?? 9999) >= yr);
  return (
    <article className="rounded-2xl border border-line bg-panel2/60 p-3">
      <div className="flex gap-3">
        <Cover title={p.concept.name} genre={p.concept.genre} topic={p.concept.topic} seed={p.startDay} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="truncate font-display font-semibold">{p.concept.name}</h4>
              <div className="text-xs text-ink3">
                {SIZE_LABEL[p.concept.size]} {GENRE_BY_ID[p.concept.genre].name} · {TOPIC_BY_ID[p.concept.topic]?.name} · {p.concept.platforms.length} platform{p.concept.platforms.length > 1 ? 's' : ''}
              </div>
            </div>
            {p.crunch && <Pill tone="bad">Crunch</Pill>}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="font-semibold">{p.phase >= 3 ? (p.extraDays > 0 ? `Polishing · ${p.extraDays}d left` : 'Shipping!') : PHASE_NAMES[p.phase as 0 | 1 | 2]}</span>
            <span className="num text-ink3">{Math.round(pct * 100)}%</span>
          </div>
          <Meter value={pct * 100} tone="accent" className="mt-1" label="Progress" />
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[11px]">
            <div className="rounded-lg bg-bg2 py-1">
              <div className="text-ink3">Design</div>
              <div className="num font-semibold">{Math.round(p.design)}</div>
            </div>
            <div className="rounded-lg bg-bg2 py-1">
              <div className="text-ink3">Tech</div>
              <div className="num font-semibold">{Math.round(p.tech)}</div>
            </div>
            <div className="rounded-lg bg-bg2 py-1">
              <div className="text-ink3">Bugs</div>
              <div className={cx('num font-semibold', p.bugs > (p.design + p.tech) * 0.08 ? 'text-bad' : 'text-ink')}>{Math.round(p.bugs)}</div>
            </div>
            <Tip content={q ? <BreakdownList bd={q} title="Why this estimate?" format={(v) => v.toFixed(2)} /> : 'Builds as the team works'}>
              <div className="w-full cursor-help rounded-lg bg-bg2 py-1">
                <div className="text-ink3">Est. score</div>
                <div className="num font-semibold">{est ?? '—'}</div>
              </div>
            </Tip>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink3">
        <div className="flex -space-x-2">
          {p.team.slice(0, 8).map((id) => {
            const st = s.staff[id];
            return st ? (
              <span key={id} title={st.name} className="rounded-full ring-2 ring-[var(--panel)]">
                {st.personId ? <InitialsBadge name={st.name} size={24} legendary /> : <Avatar seed={st.look} size={24} mood={st.morale} />}
              </span>
            ) : null;
          })}
          {p.team.length > 8 && <span className="grid size-6 place-items-center rounded-full bg-bg2 text-[10px] ring-2 ring-[var(--panel)]">+{p.team.length - 8}</span>}
        </div>
        <span>
          Hype <b className="num text-ink">{p.hype.toFixed(2)}</b>
          {p.announcedDay === undefined && ' · unannounced'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.awaitingGate && (
          <Button size="sm" variant="primary" onClick={() => useGame.getState().pushModal({ kind: 'gate', projectId: p.id })}>
            Review phase plan
          </Button>
        )}
        {p.announcedDay === undefined ? (
          <Button size="sm" icon="megaphone" onClick={() => run({ type: 'announce', projectId: p.id })}>
            Announce
          </Button>
        ) : (
          <Button size="sm" icon="megaphone" onClick={() => setShowMkt((x) => !x)} aria-expanded={showMkt}>
            Marketing
          </Button>
        )}
        <Button size="sm" icon="people" onClick={() => setShowTeam((x) => !x)} aria-expanded={showTeam}>
          Team ({p.team.length}/{BALANCE.SIZE[p.concept.size].teamCap})
        </Button>
        <Button size="sm" variant={p.crunch ? 'danger' : 'secondary'} icon="fire" onClick={() => run({ type: 'setCrunch', projectId: p.id, on: !p.crunch })} title="+35% output, +60% bugs, burns people out">
          {p.crunch ? 'Stop crunch' : 'Crunch'}
        </Button>
        <Button size="sm" icon="hourglass" onClick={() => run({ type: 'delay', projectId: p.id, weeks: 2 })} title="Two more weeks of polish: more points, fewer bugs, more cost">
          Polish +2w
        </Button>
        {!p.cut && p.phase < 3 && (
          <Button size="sm" icon="minus" onClick={() => run({ type: 'cutFeatures', projectId: p.id })} title="Remaining phases 25% shorter, small quality penalty">
            Cut features
          </Button>
        )}
        {confirming ? (
          <Button size="sm" variant="danger" icon="trash" onClick={() => run({ type: 'cancelProject', projectId: p.id })} onBlur={() => setConfirming(false)} autoFocus>
            Really cancel? Work is lost
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirming(true)}>
            Cancel
          </Button>
        )}
      </div>
      {showTeam && <TeamEditor p={p} />}
      {showMkt && p.announcedDay !== undefined && (
        <div className="mt-2 grid gap-1.5 rounded-xl bg-bg2/60 p-2">
          {channels.map((c) => {
            const locked = c.research && !s.research.done.includes(c.research);
            const used = p.campaigns.filter((x) => x.channel === c.id).length;
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-semibold">
                    {c.name} {used > 0 && <span className="text-ink3">×{used}</span>}
                  </div>
                  <div className="text-ink3">{locked ? 'Needs research' : c.desc}</div>
                </div>
                <Button size="sm" disabled={!!locked || s.company.cash < money(c.cost, s.day)} onClick={() => run({ type: 'marketing', projectId: p.id, channel: c.id })}>
                  {fmtMoney(money(c.cost, s.day))}
                </Button>
              </div>
            );
          })}
          <div className="text-[11px] text-ink3">Repeating a channel has diminishing returns. Hype decays ~4%/week, so time campaigns near launch.</div>
        </div>
      )}
    </article>
  );
}

function TeamEditor({ p }: { p: GameProject }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const cap = BALANCE.SIZE[p.concept.size].teamCap;
  const free = Object.values(s.staff).filter((x) => x.assignment.kind === 'idle' || x.assignment.kind === 'research');
  const set = (team: string[]) => {
    const r = act({ type: 'setTeam', projectId: p.id, team });
    if (!r.ok) toast({ text: r.error, tone: 'bad' });
  };
  return (
    <div className="mt-2 grid gap-2 rounded-xl bg-bg2/60 p-2 text-xs sm:grid-cols-2">
      <div>
        <div className="mb-1 font-semibold text-ink2">On this game</div>
        <ul className="space-y-1">
          {p.team.map((id) => {
            const st = s.staff[id];
            if (!st) return null;
            const [k, v] = bestSkill(st);
            return (
              <li key={id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {st.name} <span className="text-ink3">· {k} {v}</span>
                </span>
                {p.team.length > 1 && (
                  <button type="button" className="rounded-md px-1.5 text-ink3 hover:bg-bg2 hover:text-bad" aria-label={`Remove ${st.name}`} onClick={() => set(p.team.filter((x) => x !== id))}>
                    <Icon name="minus" size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <div className="mb-1 font-semibold text-ink2">Available</div>
        {free.length === 0 ? (
          <p className="text-ink3">Everyone is busy.</p>
        ) : (
          <ul className="space-y-1">
            {free.map((st) => {
              const [k, v] = bestSkill(st);
              return (
                <li key={st.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {st.name} <span className="text-ink3">· {k} {v}</span>
                  </span>
                  <button type="button" disabled={p.team.length >= cap} className="rounded-md px-1.5 text-ink3 hover:bg-bg2 hover:text-good disabled:opacity-30" aria-label={`Add ${st.name}`} onClick={() => set([...p.team, st.id])}>
                    <Icon name="plus" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ContractCard({ p }: { p: ContractProject }) {
  const s = useGame((g) => g.s)!;
  const need = p.needDesign + p.needTech;
  const have = Math.min(p.design, p.needDesign) + Math.min(p.tech, p.needTech);
  return (
    <article className="rounded-2xl border border-line bg-panel2/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">{p.title}</h4>
          <div className="text-xs text-ink3">
            Contract · pays {fmtMoney(p.pay)} · due {formatDate(p.deadlineDay)} ({Math.max(0, p.deadlineDay - s.day)}d)
          </div>
        </div>
        <Pill tone="tech">Contract</Pill>
      </div>
      <Meter value={(have / Math.max(1, need)) * 100} tone="tech" className="mt-2" label="Contract progress" />
      <div className="mt-1 text-[11px] text-ink3">
        Design {Math.round(p.design)}/{p.needDesign} · Tech {Math.round(p.tech)}/{p.needTech} · {p.team.map((id) => s.staff[id]?.name).filter(Boolean).join(', ')}
      </div>
    </article>
  );
}

function EngineCard({ p }: { p: EngineProject }) {
  return (
    <article className="rounded-2xl border border-line bg-panel2/60 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Building engine: {p.name}</h4>
        <Pill tone="tech">Engine</Pill>
      </div>
      <Meter value={(p.points / p.needPoints) * 100} tone="tech" className="mt-2" label="Engine progress" />
      <div className="mt-1 text-[11px] text-ink3">
        {Math.round(p.points)}/{p.needPoints} points · {p.features.length} features
      </div>
    </article>
  );
}

// ── New game wizard ─────────────────────────────────────────────────────────

function NewGame({ onDone }: { onDone: () => void }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const yr = fromDay(s.day).year;
  const genres = availableGenres(s);
  const topics = availableTopics(s);
  const firstGenre = (genres.find((g) => g.ok)?.g.id ?? 'action') as GenreId;
  // Planning a sequel pre-fills the wizard from the franchise
  const [presetFr] = useState(() => {
    const p = useGame.getState().wizardPreset;
    return p ? s.franchises[p.franchiseId] : undefined;
  });
  const [genre, setGenre] = useState<GenreId>(presetFr?.genre ?? firstGenre);
  const [topic, setTopic] = useState<string>(presetFr?.topic ?? topics.find((t) => t.ok)?.t.id ?? 'fantasy');
  const [name, setName] = useState(() => (presetFr ? `${presetFr.name} ${presetFr.entries.length + 1 + (presetFr.origin ? 1 : 0)}` : suggestName(s.day, 'fantasy')));
  const [audience, setAudience] = useState<Audience>('everyone');
  const [size, setSize] = useState<Size>('small');
  const [monet, setMonet] = useState<Monetization>('premium');
  const plats = availablePlatforms(s).sort((a, b) => (s.market.users[b.id] ?? 0) - (s.market.users[a.id] ?? 0));
  const [platforms, setPlatforms] = useState<string[]>(plats[0] ? [plats[0].id] : []);
  const engines = Object.values(s.engines).sort((a, b) => b.tech - a.tech);
  const [engineId, setEngineId] = useState(engines[0]?.id ?? 'e0');
  const idle = Object.values(s.staff).filter((x) => x.assignment.kind === 'idle' || x.assignment.kind === 'research');
  const [team, setTeam] = useState<string[]>(idle.slice(0, BALANCE.SIZE.small.teamCap).map((x) => x.id));
  const [franchiseId, setFranchiseId] = useState<string>(presetFr?.id ?? '');
  useEffect(() => {
    if (presetFr) useGame.setState({ wizardPreset: null });
  }, [presetFr]);
  const selfPub = s.research.done.includes('biz_self_publishing');
  const [dealId, setDealId] = useState<string>(selfPub ? '' : (s.offers.deals[0]?.id ?? ''));
  const learned = genreExperience(s, genre) > 0;
  const [focus, setFocus] = useState<[Focus3, Focus3, Focus3]>([
    [34, 33, 33],
    [34, 33, 33],
    [34, 33, 33],
  ]);
  const ideal = learned ? idealFocus(genre) : undefined;
  const franchises = Object.values(s.franchises).filter((f) => f.bestScore > 0 || f.origin);
  const teamStaff = team.map((id) => s.staff[id]!).filter(Boolean);
  const cost = estimateCost(s, size, teamStaff);
  const kitCost = platforms.filter((p) => !s.devkits.includes(p)).reduce((t, p) => t + devkitCost(s, p), 0);
  const deal = s.offers.deals.find((d) => d.id === dealId);
  const liveDealId = deal ? dealId : ''; // the offer may have expired since it was picked
  const liveTeam = team.filter((id) => idle.some((x) => x.id === id)); // people may have quit or been reassigned
  const conceptPreview = useMemo(
    () => ({ name, genre, topic, platforms, audience, size, monetization: monet, engineId, franchiseId: franchiseId || undefined, deal: deal ? { ...deal } : undefined }),
    [name, genre, topic, platforms, audience, size, monet, engineId, franchiseId, deal],
  );
  const forecast = useMemo(() => {
    if (!platforms.length) return null;
    const pot = salesPotential(s, conceptPreview, 72, 0.2);
    return { units: pot.platforms.reduce((t, p) => t + p.potential, 0), why: pot.salesWhy };
  }, [s, conceptPreview, platforms.length]);
  const fit = comboFitValue(genre, topic);
  const known = knowsCombo(s, genre, topic);
  const cap = BALANCE.SIZE[size].teamCap;

  const start = () => {
    const r = act({
      type: 'startGame',
      game: { name, genre, topic, platforms, audience, size, monetization: monet, engineId, franchiseId: franchiseId || undefined, dealId: liveDealId || undefined, team: liveTeam.slice(0, cap), focus },
    });
    if (r.ok) {
      sound.play('success');
      toast({ text: `${name} is in development!`, tone: 'good', icon: 'rocket' });
      if (s.progress.tutorialStep <= 2) act({ type: 'tutorial', step: 3 });
      onDone();
    } else toast({ text: r.error, tone: 'bad' });
  };

  return (
    <div className="space-y-5">
      <Section title="1 · Concept">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Title">
            <div className="flex gap-2">
              <input className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <Button icon="refresh" aria-label="Suggest a name" onClick={() => setName(suggestName(Math.random() * 1e6, topic))} />
            </div>
          </Field>
          {franchises.length > 0 && (
            <Field label="Sequel to">
              <select
                className={inputCls}
                value={franchiseId}
                onChange={(e) => {
                  const f = s.franchises[e.target.value];
                  setFranchiseId(e.target.value);
                  if (f) {
                    setGenre(f.genre);
                    setTopic(f.topic);
                    setName(`${f.name} ${f.entries.length + 1 + (f.origin ? 1 : 0)}`);
                  }
                }}
              >
                <option value="">New IP</option>
                {franchises.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · {fmtUnits(f.fans)} fans{f.fatigue > 0.2 ? ' · fatigued' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Section>

      <Section title="2 · Genre">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {genres.map(({ g, ok, why }) => (
            <button
              key={g.id}
              type="button"
              disabled={!ok}
              onClick={() => {
                setGenre(g.id);
                sound.play('click');
              }}
              title={ok ? g.blurb : why}
              aria-pressed={genre === g.id}
              className={cx('rounded-xl border px-2.5 py-2 text-left text-xs transition disabled:opacity-40', genre === g.id ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2')}
            >
              <div className="font-semibold">{g.name}</div>
              <div className="truncate text-ink3">{ok ? `${genreExperience(s, g.id)} shipped` : why}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink3">{GENRE_BY_ID[genre].blurb}</p>
      </Section>

      <Section
        title="3 · Topic"
        right={
          known ? (
            <Pill tone={fitLabel(fit).tone}>{`${fitLabel(fit).label} fit`}</Pill>
          ) : (
            <Button size="sm" icon="search" onClick={() => useGame.getState().actOrToast({ type: 'marketResearch', genre, topic })} title="Run focus groups to learn how well this genre and topic fit">
              Research fit · {fmtMoney(marketResearchCost(s))}
            </Button>
          )
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {topics.map(({ t, ok, why }) => {
            const f = comboFitValue(genre, t.id);
            const k = knowsCombo(s, genre, t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={!ok}
                title={ok ? (k ? `${fitLabel(f).label} with ${GENRE_BY_ID[genre].name}` : 'Fit unknown') : why}
                aria-pressed={topic === t.id}
                onClick={() => setTopic(t.id)}
                className={cx(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-35',
                  topic === t.id ? 'border-accent bg-accent text-accent-ink' : 'border-line hover:bg-bg2',
                  k && ok && topic !== t.id && f >= 3 && 'border-gold/70',
                  k && ok && topic !== t.id && f === 0 && 'border-bad/50',
                )}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="4 · Audience & size">
        <div className="flex flex-wrap gap-3">
          <Segmented<Audience>
            ariaLabel="Audience"
            value={audience}
            onChange={setAudience}
            options={AUDIENCES.map((a) => ({ value: a, label: a[0]!.toUpperCase() + a.slice(1) }))}
          />
          <Segmented<Size>
            ariaLabel="Size"
            value={size}
            onChange={(v) => {
              setSize(v);
              setTeam((t) => t.slice(0, BALANCE.SIZE[v].teamCap));
            }}
            options={(['small', 'medium', 'large', 'aaa'] as Size[]).map((z) => ({ value: z, label: SIZE_LABEL[z], disabled: !!sizeAllowed(s, z), title: sizeAllowed(s, z) ?? `${BALANCE.SIZE[z].days} days · up to ${BALANCE.SIZE[z].teamCap} people` }))}
          />
        </div>
        <div className="mt-2">
          <Segmented<Monetization>
            ariaLabel="Business model"
            value={monet}
            onChange={setMonet}
            options={(['premium', 'shareware', 'premium_dlc', 'subscription', 'f2p', 'live_service'] as Monetization[]).map((m) => ({
              value: m,
              label: { premium: 'Premium', shareware: 'Shareware', premium_dlc: 'Premium + DLC', subscription: 'Subscription', f2p: 'Free-to-play', live_service: 'Live service' }[m],
              disabled: !!monetizationAllowed(s, m, genre),
              title: monetizationAllowed(s, m, genre) ?? undefined,
            }))}
          />
        </div>
      </Section>

      <Section title="5 · Platforms" right={<span className="text-xs text-ink3">Each extra platform costs ~6% efficiency</span>}>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {plats.map((p) => {
            const on = platforms.includes(p.id);
            const fitG = GENRE_BY_ID[genre].kinds[p.kind] ?? 1;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPlatforms((x) => (on ? x.filter((y) => y !== p.id) : [...x, p.id].slice(0, 6)))}
                className={cx('flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition', on ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2')}
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="text-ink3">
                    {fmtUnits((s.market.users[p.id] ?? 0) * 1e6)} users · {Math.round((s.market.share[p.id] ?? 0) * 100)}% share
                  </div>
                </div>
                <div className="text-right">
                  {fitG >= 1.15 && <Pill tone="good">Genre fit</Pill>}
                  {fitG < 0.9 && <Pill tone="bad">Weak fit</Pill>}
                  <div className="mt-0.5 text-[10px] text-ink3">{s.devkits.includes(p.id) ? 'Dev kit owned' : `Kit ${fmtMoney(devkitCost(s, p.id))}`}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="6 · Engine & publishing">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Engine" hint="Higher tech scores better on modern hardware. Build or license engines in Research.">
            <select className={inputCls} value={engineId} onChange={(e) => setEngineId(e.target.value)}>
              {engines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · tech {e.tech}
                  {e.royalty ? ` · ${Math.round(e.royalty * 100)}% royalty` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Publishing" hint={selfPub ? 'Self-publish to keep all revenue, or take a deal for an advance and wider reach.' : 'Research Self-Publishing to ship consoles yourself.'}>
            <select className={inputCls} value={liveDealId} onChange={(e) => setDealId(e.target.value)}>
              <option value="">{selfPub ? 'Self-publish' : 'Self-publish (computers only)'}</option>
              {s.offers.deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {COMPANY_BY_ID[d.publisherId]?.name ?? d.publisherId}: {fmtMoney(d.advance)} advance · {Math.round(d.royalty * 100)}% royalty · min {d.minScore}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {deal && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-bg2/60 p-2 text-xs">
            <CompanyBadge name={COMPANY_BY_ID[deal.publisherId]?.name ?? deal.publisherId} color={COMPANY_BY_ID[deal.publisherId]?.color ?? '#888'} size={28} />
            <div>
              You get <b>{fmtMoney(deal.advance)}</b> now and <b>{Math.round(deal.royalty * 100)}%</b> of net revenue. Their distribution gives <b>{Math.round(deal.reach * 100)}%</b> reach. They expect a score of {deal.minScore}+ by {formatDate(deal.deadlineDay, false)}.
            </div>
          </div>
        )}
      </Section>

      <Section title={`7 · Team (${Math.min(team.length, cap)}/${cap})`}>
        {idle.length === 0 ? (
          <p className="text-xs text-ink3">Everyone is busy. Free someone up in the Staff panel, or hire.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {idle.map((st) => {
              const on = team.includes(st.id);
              const [k, v] = bestSkill(st);
              return (
                <label key={st.id} className={cx('flex cursor-pointer items-center gap-2 rounded-xl border px-2 py-1.5 text-xs', on ? 'border-accent bg-accent/10' : 'border-line')}>
                  <input type="checkbox" checked={on} onChange={() => setTeam((t) => (on ? t.filter((x) => x !== st.id) : [...t, st.id]))} className="accent-[var(--accent)]" />
                  {st.personId ? <InitialsBadge name={st.name} size={26} legendary /> : <Avatar seed={st.look} size={26} mood={st.morale} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{st.name}</span>
                    <span className="text-ink3">
                      {k} {v} · {st.assignment.kind === 'research' ? 'researching' : 'free'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {team.length > cap && <p className="mt-1 text-xs text-warn">Only the first {cap} will join a {SIZE_LABEL[size]} game.</p>}
      </Section>

      <Section title="8 · Focus" right={ideal ? <Pill tone="gold">Gold marks = your notes on {GENRE_BY_ID[genre].name}</Pill> : <Pill>Ship a {GENRE_BY_ID[genre].name} game to learn what works</Pill>}>
        <div className="space-y-3">
          {([0, 1, 2] as const).map((ph) => (
            <FocusSliders key={ph} phase={ph} value={focus[ph]} ideal={ideal?.[ph]} onChange={(f) => setFocus((x) => x.map((y, i) => (i === ph ? f : y)) as [Focus3, Focus3, Focus3])} />
          ))}
          <p className="text-[11px] text-ink3">
            Areas: {Object.values(AREA_LABEL).join(' · ')}. You can adjust the focus at each phase gate during development.
          </p>
        </div>
      </Section>

      <Section title="Summary">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Tip content={<span>Boxed games sell far more in November–December and slump in January. Use “Polish +2w” to nudge a launch into a better month.</span>}>
            <div className="w-full cursor-help rounded-xl bg-bg2/70 p-2 text-left">
              <div className="text-ink3">Ships ~{formatDate(s.day + cost.days, false)}</div>
              <div className="num font-semibold">
                {cost.days} days ·{' '}
                <span className={cx((BALANCE.SEASONALITY[fromDay(s.day + cost.days).month - 1] ?? 1) >= 1.05 ? 'text-good' : (BALANCE.SEASONALITY[fromDay(s.day + cost.days).month - 1] ?? 1) < 0.9 ? 'text-bad' : 'text-ink2')}>
                  {(BALANCE.SEASONALITY[fromDay(s.day + cost.days).month - 1] ?? 1) >= 1.05 ? 'peak season' : (BALANCE.SEASONALITY[fromDay(s.day + cost.days).month - 1] ?? 1) < 0.9 ? 'quiet season' : 'normal season'}
                </span>
              </div>
            </div>
          </Tip>
          <div className="rounded-xl bg-bg2/70 p-2">
            <div className="text-ink3">Est. cost</div>
            <div className="num font-semibold">{fmtMoney(cost.total + kitCost)}</div>
          </div>
          <div className="rounded-xl bg-bg2/70 p-2">
            <div className="text-ink3">Dev kits</div>
            <div className="num font-semibold">{fmtMoney(kitCost)}</div>
          </div>
          {forecast && (
            <Tip content={<BreakdownList bd={forecast.why} title="Forecast at a 72 review score" format={(v) => v.toFixed(3)} />}>
              <div className="w-full cursor-help rounded-xl bg-bg2/70 p-2 text-left">
                <div className="text-ink3">Forecast @72</div>
                <div className="num font-semibold">{fmtUnits(forecast.units)} units</div>
              </div>
            </Tip>
          )}
        </div>
        {(() => {
          const ship = s.day + cost.days;
          const clashes = upcomingReleases(s, ship - 35, ship + 35).filter((g) => g.genre === genre && g.platforms.some((p) => platforms.includes(p)));
          return clashes.length ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
              <Icon name="warning" size={14} /> Your launch window clashes with {clashes.map((c) => `${c.title} (${formatDate(c.day, false)})`).join(', ')}.
            </p>
          ) : null;
        })()}
        {kitCost + cost.production > s.company.cash && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
            <Icon name="warning" size={14} /> This will cost more cash than you have. Consider a publisher deal or a smaller game.
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <Button variant="primary" size="lg" icon="rocket" onClick={start} disabled={!platforms.length || !liveTeam.length} data-tutorial="start-dev">
            Start development
          </Button>
        </div>
        <p className="mt-1 text-right text-[11px] text-ink3">Year {yr}</p>
      </Section>
    </div>
  );
}

// ── Contracts ───────────────────────────────────────────────────────────────

function Contracts() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const idle = Object.values(s.staff).filter((x) => x.assignment.kind === 'idle');
  const [teamPick, setTeam] = useState<string[]>(idle.slice(0, 2).map((x) => x.id));
  const team = teamPick.filter((id) => idle.some((x) => x.id === id));
  if (!s.offers.contracts.length) return <Empty icon="briefcase" title="No contract offers right now">New offers arrive every month.</Empty>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink3">Contracts pay reliably — great for cash flow early on, or to keep idle staff busy. Missing a deadline costs reputation.</p>
      <div>
        <div className="mb-1 text-xs font-semibold text-ink2">Assign</div>
        <div className="flex flex-wrap gap-1.5">
          {idle.length === 0 && <span className="text-xs text-ink3">No one is free.</span>}
          {idle.map((st) => (
            <button
              key={st.id}
              type="button"
              aria-pressed={team.includes(st.id)}
              onClick={() => setTeam((t) => (t.includes(st.id) ? t.filter((x) => x !== st.id) : [...t, st.id]))}
              className={cx('rounded-full border px-2.5 py-1 text-xs', team.includes(st.id) ? 'border-accent bg-accent/10' : 'border-line')}
            >
              {st.name}
            </button>
          ))}
        </div>
      </div>
      {s.offers.contracts.map((o) => {
        const est = estimateContractDays(s, o, team);
        const ok = est <= o.days;
        const client = s.rivals[o.client];
        return (
          <article key={o.id} className="flex items-center gap-3 rounded-2xl border border-line bg-panel2/60 p-3">
            {client && <CompanyBadge name={client.name} color={client.color} size={34} />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{o.title}</div>
              <div className="text-xs text-ink3">
                {o.needDesign} design · {o.needTech} tech · {o.days} days · penalty {fmtMoney(o.penalty)}
              </div>
              <div className={cx('text-xs', team.length ? (ok ? 'text-good' : 'text-bad') : 'text-ink3')}>
                {team.length ? (Number.isFinite(est) ? `Your team needs ~${est} days` : 'Your team lacks the skills') : 'Pick people to estimate'}
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={!team.length}
              onClick={() => {
                const r = act({ type: 'acceptContract', offerId: o.id, team });
                if (!r.ok) toast({ text: r.error, tone: 'bad' });
                else {
                  toast({ text: `Contract accepted: ${o.title}`, tone: 'good', icon: 'briefcase' });
                  setTeam([]);
                }
              }}
            >
              {fmtMoney(o.pay)}
            </Button>
          </article>
        );
      })}
    </div>
  );
}
