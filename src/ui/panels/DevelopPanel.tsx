import { useEffect, useMemo, useState } from 'react';
import { pitchText } from '@/sim/systems/pitches';
import { pledged } from '@/sim/systems/crunchPledge';
import { knownFor } from '@/sim/systems/renown';
import { priceTierAllowed } from '@/sim/systems/pricing';
import type { PriceTier } from '@/sim/types';
import { CODEV_YEAR, codevPartners, codevTerms } from '@/sim/systems/codev';
import { CAMPAIGN_DAYS, STRETCH, STRETCH_DAYS, STRETCH_NAMES, TIERS, campaignCost, campaignGoal, crowdfundBlocked, expectedPledges } from '@/sim/systems/crowdfunding';
import { EA_PRICE, EA_STALE_WEEKS, EA_YEAR, earlyAccessBlocked, earlyAccessCost, earlyAccessRating } from '@/sim/systems/earlyAccess';
import { LOC_COST, LOC_WORK, LOC_YEAR, REGIONS, REGION_BY_ID, regionMix, regionShares, type RegionId } from '@/data/regions';
import { BALANCE } from '@/data/balance';
import { GENRE_BY_ID } from '@/data/genres';
import { TOPIC_BY_ID } from '@/data/topics';
import { CHANNELS } from '@/data/marketing';
import { COMPANY_BY_ID } from '@/data/companies';
import { AUDIENCES, type Audience, type GenreId, type Monetization } from '@/data/types';
import { fromDay, formatDate } from '@/sim/calendar';
import { aOrAn, fmtMoney, fmtUnits, hasFlag, money } from '@/sim/util';
import { availablePlatforms, genrePopularity, platformInfo } from '@/sim/systems/market';
import { estimateContractDays } from '@/sim/systems/offers';
import { upcomingReleases } from '@/sim/systems/rivals';
import { qualityToScore, workShare } from '@/sim/systems/dev';
import { expansionPlatforms, expansionSizeOk, launchPrice, launchTitleMul, salesPotential } from '@/sim/systems/release';
import { betaBlocked, betaCost, cliffhangerPending, dealAdvanceFor, devkitCost, featuresBlocked, focusTestCost, marketResearchCost, monetizationAllowed, sizeAllowed } from '@/sim/actions';
import { FEATURE_BY_ID, GAME_FEATURES, MAX_FEATURES } from '@/data/gameFeatures';
import type { ContractProject, EngineProject, Focus3, GameProject, Release, Size, Staff } from '@/sim/types';
import { Button, BreakdownList, Empty, Field, Meter, Pill, Section, Segmented, Tip, cx, inputCls } from '../components/ui';
import { Cover } from '../art/Cover';
import { Avatar, InitialsBadge } from '../art/Avatar';
import { CompanyBadge } from '../art/CompanyBadge';
import { Icon } from '../icons';
import { useGame } from '../store';
import { isAway } from '@/sim/systems/staff';
import { FocusSliders } from '../game/FocusEditor';
import { StaffPicker } from '../components/StaffPicker';
import { autoPickTeam, freeStaff } from './staffTools';
import { AREA_LABEL, PHASE_NAMES, SIZE_LABEL, availableGenres, availableTopics, comboFitValue, estimateCost, expansionSubtitle, fitLabel, genreExperience, genreMomentum, idealFocus, knowsCombo, suggestConcept, suggestName } from '../game/lib';
import { sound } from '../sound';

export default function DevelopPanel() {
  const s = useGame((g) => g.s)!;
  // With nothing in development, jump straight to the new-game wizard.
  const tab = useGame((g) => g.panelTab) ?? (Object.keys(s.projects).length ? 'projects' : 'new');
  const setTab = (t: string) => useGame.setState({ panelTab: t });
  useGame((g) => g.v);
  const wizardNonce = useGame((g) => g.wizardNonce);
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
      {tab === 'new' && <NewGame key={wizardNonce} onDone={() => setTab('projects')} />}
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
  const [showCf, setShowCf] = useState(false);
  const [showCo, setShowCo] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eaRating = useMemo(() => (p.phase >= 1 && p.phase <= 2 && !p.earlyAccess ? earlyAccessRating(s, p) : 0), [s.day, p.id, p.phase, p.earlyAccess]);
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
          {p.coDev && (
            <>
              with <b className="text-ink">{p.coDev.name}</b> ({Math.round(p.coDev.share * 100)}%) ·{' '}
            </>
          )}
          {p.earlyAccess && (
            <>
              <span title={`On sale for ${Math.floor((s.day - p.earlyAccess.day) / 7)} weeks · ${fmtMoney(p.earlyAccess.net)} earned so far${p.earlyAccess.stale ? ' · players are losing patience' : ''}`}>
                Early Access <b className={`num ${p.earlyAccess.rating >= 70 ? 'text-good' : p.earlyAccess.rating < 50 ? 'text-bad' : 'text-ink'}`}>{p.earlyAccess.rating}</b> · <b className="num text-ink">{fmtUnits(p.earlyAccess.units)}</b> sold
                {p.earlyAccess.stale && <b className="text-bad"> · overdue</b>}
              </span>{' '}
              ·{' '}
            </>
          )}
          {p.beta && (
            <>
              Beta says <b className="num text-ink">~{p.beta.predicted}</b> ·{' '}
            </>
          )}
          {!p.beta && p.focusTest && p.focusTest.phase === Math.min(2, p.phase) && (
            <>
              Focus test <b className="num text-ink">~{p.focusTest.predicted}</b>
              {p.focusTest.wantMore && <> · players want more <b className="capitalize text-ink">{p.focusTest.wantMore}</b></>} ·{' '}
            </>
          )}
          Hype <b className="num text-ink">{p.hype.toFixed(2)}</b>
          {p.announcedDay === undefined && (fromDay(s.day).year >= 2015 && !p.concept.expansionOf ? ' · unannounced (a shadow drop if it stays that way)' : ' · unannounced')}
          {p.documentary && ` · film crew on set${p.documentary.crunchDays >= 20 ? ' (filming the crunch)' : ''}`}
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
        <Button size="sm" variant={p.crunch || pledged(s) ? 'danger' : 'secondary'} icon="fire" onClick={() => run({ type: 'setCrunch', projectId: p.id, on: !p.crunch })} title={pledged(s) && !p.crunch ? 'Breaks your no-crunch pledge, publicly: reputation −5 and a bitter team (morale −8 for four months)' : '+35% output, +60% bugs, burns people out'}>
          {p.crunch ? 'Stop crunch' : pledged(s) ? 'Crunch (breaks pledge!)' : 'Crunch'}
        </Button>
        <Button size="sm" icon="hourglass" onClick={() => run({ type: 'delay', projectId: p.id, weeks: 2 })} title="Two more weeks of polish: more points, fewer bugs, more cost">
          Polish +2w
        </Button>
        {p.phase <= 2 && p.focusTest?.phase !== Math.min(2, p.phase) && (
          <Button size="sm" icon="people" onClick={() => run({ type: 'focusTest', projectId: p.id })} title={`Players try the build: a rough score estimate and which area of this phase they want more of (${fmtMoney(focusTestCost(s, p.concept.size))})`}>
            Focus test
          </Button>
        )}
        {p.announcedDay !== undefined && p.trailerCut === undefined && (
          <Button size="sm" icon="play" onClick={() => {
              if (!useGame.getState().modals.some((m) => m.kind === 'trailerCut')) useGame.getState().openModalNow({ kind: 'trailerCut', projectId: p.id });
            }} title="A 25-second mini-game: cut a trailer from four shots for up to +0.4 hype (once per game)">
            Cut trailer
          </Button>
        )}
        {p.phase >= 2 && !p.bugBashed && (
          <Button size="sm" icon="bug" onClick={() => {
              if (!useGame.getState().modals.some((m) => m.kind === 'bugBash')) useGame.getState().openModalNow({ kind: 'bugBash', projectId: p.id });
            }} title="A 20-second mini-game: squash bugs to fix up to 25% of them (once per game)">
            Bug bash
          </Button>
        )}
        {p.phase === 2 && !p.beta && fromDay(s.day).year >= 2005 && (
          <Button size="sm" icon="people" disabled={!!betaBlocked(s, p)} onClick={() => run({ type: 'openBeta', projectId: p.id })} title={betaBlocked(s, p) ?? `Two more weeks of polish with real players: a quarter of the bugs found, +0.15 hype and an early read on the score (${fmtMoney(betaCost(s, p))})`}>
            Open beta
          </Button>
        )}
        {!p.coDev && p.phase <= 1 && !p.concept.deal && p.concept.size !== 'small' && fromDay(s.day).year >= CODEV_YEAR && (
          <Button size="sm" icon="handshake" onClick={() => setShowCo((x) => !x)} aria-expanded={showCo}>
            Co-develop
          </Button>
        )}
        {!p.crowdfund && p.phase <= 1 && !p.concept.deal && hasFlag(s, 'crowdfunding') && (
          <Button size="sm" icon="crowd" onClick={() => setShowCf((x) => !x)} aria-expanded={showCf} title={crowdfundBlocked(s, p) ?? 'Ask fans to fund the game: 30 days, all or nothing'}>
            Crowdfund
          </Button>
        )}
        {!p.earlyAccess && p.phase >= 1 && p.phase <= 2 && !p.concept.deal && fromDay(s.day).year >= EA_YEAR && (
          <Button size="sm" icon="coin" disabled={!!earlyAccessBlocked(s, p)} onClick={() => run({ type: 'earlyAccess', projectId: p.id })} title={earlyAccessBlocked(s, p) ?? `Players would rate today’s build about ${eaRating} (under 50 barely sells; 75+ spreads by word of mouth). Sell it on PC now at ${Math.round((1 - EA_PRICE) * 100)}% off while you keep building. Players file bugs and shape the design (up to +3% quality), and a good build spreads the word. Early Access buyers won't buy again at launch, and after ${Math.round((EA_STALE_WEEKS / 52) * 12)} months players lose patience. Storefront launch ${fmtMoney(earlyAccessCost(s, p))}.`}>
            Early Access
          </Button>
        )}
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
      {p.phase >= 2 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink3">Reviews go live:</span>
          <Segmented
            ariaLabel="Review policy"
            value={p.reviewPolicy ?? 'launch'}
            onChange={(v) => run({ type: 'setReviewPolicy', projectId: p.id, policy: v })}
            options={[
              { value: 'early', label: 'A week early' },
              { value: 'launch', label: 'At launch' },
              { value: 'none', label: 'No review copies' },
            ]}
          />
          <span className="text-ink3">{(p.reviewPolicy ?? 'launch') === 'early' ? 'Confident: great reviews sell more, weak ones scare buyers off.' : (p.reviewPolicy ?? 'launch') === 'none' ? 'Hides a weak game a little longer (under 60 it sells ~5% more) — but the press notices (reputation −0.5), and a decent game sells ~4% less.' : 'The usual: no surprises either way.'}</span>
        </div>
      )}
      {showTeam && <TeamEditor p={p} />}
      {showCo && !p.coDev && (
        <div className="mt-2 rounded-xl bg-bg2/60 p-2.5 text-xs">
          <div className="font-semibold">Bring in a co-development partner</div>
          <p className="mt-0.5 text-ink3">Their team works on the game every day alongside yours (a little buggier — coordination is hard). In return they take a share of its net revenue, for good. Better studios bring more and ask more.</p>
          <ul className="mt-2 space-y-1">
            {codevPartners(s).map((r) => {
              const terms = codevTerms(s, p, r);
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-panel/70 px-2 py-1.5">
                  <span className="min-w-0">
                    <b className="truncate">{r.name}</b>
                    <span className="block text-ink3">{typeof terms === 'string' ? terms : `about ${terms.power.toFixed(1)} extra developers · wants ${Math.round(terms.share * 100)}% of revenue`}</span>
                  </span>
                  {typeof terms !== 'string' && (
                    <Button size="sm" onClick={() => {
                      run({ type: 'coDevelop', projectId: p.id, rivalId: r.id });
                      setShowCo(false);
                    }}>
                      Partner up
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {showCf && !p.crowdfund && (
        <div className="mt-2 rounded-xl bg-bg2/60 p-2.5 text-xs">
          <div className="font-semibold">Crowdfunding campaign</div>
          <p className="mt-0.5 text-ink3">
            30 days, all or nothing. Your fans, reputation, hype and how good the pitch looks decide the pledges — analysts expect around <b className="text-ink">{fmtMoney(expectedPledges(s, p))}</b>, give or take a third. A bigger goal draws more attention and hype if it lands. Stretch goals at 150%, 200% and 300% add content (+1.5% quality each, {STRETCH_DAYS} more days of polish). Backers are promised a delivery date — keep it. Pitch video {fmtMoney(campaignCost(s))}.
          </p>
          {crowdfundBlocked(s, p) ? (
            <p className="mt-1.5 text-bad">{crowdfundBlocked(s, p)}</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['modest', 'ambitious', 'moonshot'] as const).map((t) => (
                <Button key={t} size="sm" variant={t === 'ambitious' ? 'primary' : 'secondary'} onClick={() => {
                  run({ type: 'crowdfund', projectId: p.id, tier: t });
                  setShowCf(false);
                }}>
                  {TIERS[t].label}: {fmtMoney(campaignGoal(s, p, t))}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      {p.crowdfund && p.crowdfund.end === undefined && (
        <div className="mt-2 rounded-xl bg-bg2/60 p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Crowdfunding · {Math.max(0, CAMPAIGN_DAYS - (s.day - p.crowdfund.day))} days left</span>
            <span className="num">
              <b className={p.crowdfund.raised >= p.crowdfund.goal ? 'text-good' : 'text-ink'}>{fmtMoney(p.crowdfund.raised)}</b> of {fmtMoney(p.crowdfund.goal)} · {p.crowdfund.backers.toLocaleString('en-US')} backers
            </span>
          </div>
          <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-bg2">
            <div className={cx('h-full rounded-full', p.crowdfund.raised >= p.crowdfund.goal ? 'bg-good' : 'bg-accent')} style={{ width: `${Math.min(100, (p.crowdfund.raised / (p.crowdfund.goal * STRETCH[STRETCH.length - 1]!)) * 100)}%` }} />
            {[1, ...STRETCH].map((m) => (
              <span key={m} className="absolute top-0 h-full w-0.5 -translate-x-1/2" style={{ left: `${(m / STRETCH[STRETCH.length - 1]!) * 100}%`, background: m === 1 ? 'var(--ink)' : 'var(--panel)', opacity: 0.7 }} title={m === 1 ? 'Goal' : `Stretch: ${STRETCH_NAMES[STRETCH.indexOf(m)]}`} />
            ))}
          </div>
          <div className="mt-1 text-ink3">
            {Math.round((p.crowdfund.raised / p.crowdfund.goal) * 100)}% funded
            {p.crowdfund.stretch > 0 && <> · stretch goals: {STRETCH_NAMES.slice(0, p.crowdfund.stretch).join(', ')}</>}
          </div>
        </div>
      )}
      {p.crowdfund?.success && p.crowdfund.promised !== undefined && (
        <p className={cx('mt-2 text-xs', s.day > p.crowdfund.promised ? 'text-bad' : 'text-ink3')}>
          Crowdfunded {fmtMoney(p.crowdfund.raised)} from {p.crowdfund.backers.toLocaleString('en-US')} backers · promised by {formatDate(p.crowdfund.promised)}
          {s.day > p.crowdfund.promised ? ' — late! Backers are getting angry.' : ''}
          {p.crowdfund.stretch > 0 && <> · stretch goals: {STRETCH_NAMES.slice(0, p.crowdfund.stretch).join(', ')}</>}
        </p>
      )}
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
  const members = p.team.map((id) => s.staff[id]).filter((x): x is NonNullable<typeof x> => !!x);
  const pool = [...members, ...freeStaff(s).filter((x) => !p.team.includes(x.id))];
  const set = (team: string[]) => {
    if (!team.length) return toast({ text: 'Keep at least one person on the game', tone: 'bad' });
    const r = act({ type: 'setTeam', projectId: p.id, team });
    if (!r.ok) toast({ text: r.error, tone: 'bad' });
  };
  return (
    <div className="mt-2 rounded-xl bg-bg2/60 p-2">
      <StaffPicker pool={pool} selected={p.team} onChange={set} cap={cap} genre={p.concept.genre} minOne />
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
  const pitch = s.company.pitch && s.company.pitch.until >= s.day ? s.company.pitch : undefined;
  const pitchStaff = pitch ? s.staff[pitch.staffId] : undefined;
  const renowned = new Set(knownFor(s).map((k) => k.genre));
  // genre cards: where the market is heading and how your studio has done there
  const genreStats = useMemo(() => {
    const open = genres.filter((x) => x.ok).map((x) => x.g.id);
    const pops = open.map((id) => ({ id, pop: genrePopularity(s, id) })).sort((a, b) => b.pop - a.pop);
    const hot = new Set(pops.slice(0, 3).map((x) => x.id));
    const out: Record<string, { n: number; best: number; trend: number; hot: boolean }> = {};
    for (const x of genres) out[x.g.id] = { n: 0, best: 0, trend: genreMomentum(s, x.g.id), hot: hot.has(x.g.id) };
    for (const r of Object.values(s.releases)) {
      const o = out[r.concept.genre];
      if (!o) continue;
      o.n++;
      o.best = Math.max(o.best, Math.round(r.score));
    }
    return out;
    // the market moves monthly; releases change the counts (state is mutated in place, so key on lengths)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.market.trendHistory.length, s.releaseOrder.length, genres.length]);
  const topics = availableTopics(s);
  const firstGenre = (genres.find((g) => g.ok)?.g.id ?? 'action') as GenreId;
  // Planning a sequel pre-fills the wizard from the franchise
  // …and remastering pre-fills it from the original release.
  // …remastering or expanding pre-fills it from an earlier release.
  const [based, setBased] = useState<{ mode: 'remaster' | 'expansion'; rel: Release } | undefined>(() => {
    const p = useGame.getState().wizardPreset;
    const id = p?.remasterOf ?? p?.expansionOf;
    const rel = id ? s.releases[id] : undefined;
    return rel ? { mode: p?.remasterOf ? 'remaster' : 'expansion', rel } : undefined;
  });
  const baseRel = based?.rel;
  const remasterRel = based?.mode === 'remaster' ? based.rel : undefined;
  const expansionRel = based?.mode === 'expansion' ? based.rel : undefined;
  const [presetFr] = useState(() => {
    const p = useGame.getState().wizardPreset;
    const fid = p?.franchiseId ?? (baseRel?.concept.franchiseId && s.franchises[baseRel.concept.franchiseId] ? baseRel.concept.franchiseId : undefined);
    return fid ? s.franchises[fid] : undefined;
  });
  const [genre, setGenre] = useState<GenreId>(baseRel?.concept.genre ?? presetFr?.genre ?? firstGenre);
  // A first-timer's default topic quietly suits the default genre, so the tutorial game starts on a good footing.
  const starterTopic = () => {
    const ok = topics.filter((t) => t.ok).map((t) => t.t.id);
    if (s.releaseOrder.length > 0 || !ok.length) return ok[0];
    return ok.reduce((best, id) => (comboFitValue(firstGenre, id) > comboFitValue(firstGenre, best) ? id : best), ok[0]!);
  };
  const [topic, setTopic] = useState<string>(() => baseRel?.concept.topic ?? presetFr?.topic ?? starterTopic() ?? 'fantasy');
  const [name, setName] = useState(() =>
    remasterRel
      ? `${remasterRel.name} Remastered`
      : expansionRel
        ? `${expansionRel.name}: ${expansionSubtitle(s.day + expansionRel.day)}`
        : presetFr
          ? `${presetFr.name} ${presetFr.entries.length + 1 + (presetFr.origin ? 1 : 0)}`
          : suggestName(s.day, 'fantasy'),
  );
  const [audience, setAudience] = useState<Audience>(baseRel?.concept.audience ?? 'everyone');
  const locked = !!baseRel;
  const [size, setSize] = useState<Size>('small');
  const [monet, setMonet] = useState<Monetization>('premium');
  const [priceTier, setPriceTier] = useState<PriceTier>('standard');
  const [features, setFeatures] = useState<string[]>([]);
  const home = s.company.homeRegion ?? 'na';
  const [localized, setLocalized] = useState<RegionId[]>([]);
  const expPlats = expansionRel ? expansionPlatforms(s, expansionRel) : null;
  const plats = availablePlatforms(s)
    .filter((p) => !expPlats || expPlats.includes(p.id))
    .sort((a, b) => (s.market.users[b.id] ?? 0) - (s.market.users[a.id] ?? 0));
  const [platforms, setPlatforms] = useState<string[]>(() => (expPlats ? expPlats.slice(0, 6) : plats[0] ? [plats[0].id] : []));
  const engines = Object.values(s.engines).sort((a, b) => b.tech - a.tech);
  const [engineId, setEngineId] = useState(engines[0]?.id ?? 'e0');
  const lastGame = [...s.releaseOrder].reverse().map((id) => s.releases[id]!).find((r) => r && !r.concept.expansionOf && !r.concept.remasterOf);
  const copyLast = () => {
    if (!lastGame) return;
    const c = lastGame.concept;
    const genreOk = genres.some((g) => g.ok && g.g.id === c.genre);
    if (genreOk) setGenre(c.genre);
    if (topics.some((x) => x.ok && x.t.id === c.topic)) setTopic(c.topic);
    setAudience(c.audience);
    if (!sizeAllowed(s, c.size)) {
      setSize(c.size);
      setTeam((x) => x.slice(0, BALANCE.SIZE[c.size].teamCap));
    }
    if (!monetizationAllowed(s, c.monetization, genreOk ? c.genre : genre)) setMonet(c.monetization);
    setPriceTier(c.priceTier ?? 'standard');
    const still = c.platforms.filter((pid) => plats.some((p) => p.id === pid));
    if (still.length) setPlatforms(still.slice(0, 6));
    if (s.engines[c.engineId]) setEngineId(c.engineId);
    setFeatures((c.features ?? []).filter((id) => !featuresBlocked(s, [id], c.monetization)));
    setLocalized((c.localized ?? []).filter((r) => r !== home));
    sound.play('click');
  };
  const idle = Object.values(s.staff).filter((x) => (x.assignment.kind === 'idle' || x.assignment.kind === 'research') && !isAway(x));
  const [team, setTeam] = useState<string[]>(() => autoPickTeam(idle, baseRel?.concept.genre ?? presetFr?.genre ?? firstGenre, BALANCE.SIZE.small.teamCap));
  const [franchiseId, setFranchiseId] = useState<string>(presetFr?.id ?? '');
  const [inspiration, setInspiration] = useState<{ genre: GenreId; topic: string; why: string } | null>(null);
  useEffect(() => {
    if (presetFr || baseRel) useGame.setState({ wizardPreset: null });
  }, [presetFr, baseRel]);
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
  const locs = useMemo(() => (yr >= LOC_YEAR ? localized.filter((r) => r !== home && !(s.company.branches ?? []).includes(r)) : []), [yr, localized, home, s.company.branches]);
  const work = workShare({ remasterOf: remasterRel?.id, expansionOf: expansionRel?.id, features, localized: locs });
  const cost = estimateCost(s, size, teamStaff, work);
  const featCost = features.reduce((tt, id) => tt + money(FEATURE_BY_ID[id]?.cost ?? 0, s.day), 0) + locs.length * money(LOC_COST[size], s.day);
  const kitCost = platforms.filter((p) => !s.devkits.includes(p)).reduce((t, p) => t + devkitCost(s, p), 0);
  const deal = s.offers.deals.find((d) => d.id === dealId);
  const liveDealId = deal ? dealId : ''; // the offer may have expired since it was picked
  const liveFeatures = features.filter((id) => !featuresBlocked(s, [id], monet));
  const liveTeam = team.filter((id) => idle.some((x) => x.id === id)); // people may have quit or been reassigned
  const conceptPreview = useMemo(
    () => ({ name, genre, topic, platforms, audience, size, monetization: monet, engineId, franchiseId: franchiseId || undefined, deal: deal ? { ...deal } : undefined, remasterOf: remasterRel?.id, expansionOf: expansionRel?.id, features, localized: locs, priceTier }),
    [name, genre, topic, platforms, audience, size, monet, engineId, franchiseId, deal, remasterRel, expansionRel, features, locs, priceTier],
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
      game: { name, genre, topic, platforms, audience, size, monetization: monet, engineId, franchiseId: franchiseId || undefined, dealId: liveDealId || undefined, team: liveTeam.slice(0, cap), focus, remasterOf: remasterRel?.id, expansionOf: expansionRel?.id, features: liveFeatures, localized: locs, priceTier },
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
      {baseRel && (
        <div className={cx('flex items-center gap-3 rounded-2xl border p-3 text-xs', remasterRel ? 'border-gold/50 bg-gold/10' : 'border-tech/50 bg-tech/10')}>
          <Icon name={remasterRel ? 'sparkle' : 'layers'} size={18} className={cx('shrink-0', remasterRel ? 'text-gold' : 'text-tech')} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {remasterRel ? 'Remastering' : 'Expansion for'} {baseRel.name} ({Math.round(baseRel.score)})
            </div>
            <div className="text-ink3">
              {remasterRel
                ? `Genre, topic and franchise are locked to the original. About ${Math.round((1 - BALANCE.REMASTER_WORK) * 100)}% less work than a new game, but it sells to a smaller, nostalgic market.`
                : `New content for the ${fmtUnits(baseRel.units)} people who own it. Takes about ${Math.round(BALANCE.EXPANSION_WORK * 100)}% of the work of a new game and sells for ${Math.round(BALANCE.EXPANSION_PRICE * 100)}% of the price. It can’t be bigger than the base game, and a good one brings players back to the original.`}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBased(undefined);
              setName(suggestName(s.day, topic));
            }}
          >
            Make a new game instead
          </Button>
        </div>
      )}
      {pitch && pitchStaff && !baseRel && !locked && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-3 py-2.5 text-xs">
          <span className="min-w-0 flex-1 text-ink2">
            ✨ <b className="text-ink">{pitchStaff.name.split(' ')[0]}’s pitch:</b> {pitchText(pitch, true)}. Make it with {pitchStaff.name.split(' ')[0]} on the team before {formatDate(pitch.until)} and it’s their passion project.
          </span>
          <Button
            size="sm"
            onClick={() => {
              if (genres.some((x) => x.ok && x.g.id === pitch.genre)) setGenre(pitch.genre);
              if (topics.some((x) => x.ok && x.t.id === pitch.topic)) setTopic(pitch.topic);
              if (idle.some((x) => x.id === pitch.staffId)) setTeam((tm) => (tm.includes(pitch.staffId) ? tm : [pitch.staffId, ...tm]));
              setFranchiseId('');
              sound.play('click');
            }}
          >
            Use the pitch
          </Button>
        </div>
      )}
      {!baseRel && !locked && !franchiseId && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-bg2/60 px-3 py-2 text-xs">
          <span className="min-w-0 text-ink2">{inspiration && inspiration.genre === genre && inspiration.topic === topic ? <>💡 <b className="text-ink">{GENRE_BY_ID[inspiration.genre].name} × {TOPIC_BY_ID[inspiration.topic]?.name}</b> — {inspiration.why}</> : 'Stuck for an idea? Get a suggestion from the trends and what your studio knows.'}</span>
          <Button size="sm" icon="lightbulb" onClick={() => {
              const idea = suggestConcept(s);
              if (!idea) return;
              setInspiration(idea);
              setGenre(idea.genre);
              setTopic(idea.topic);
              setName(suggestName(Math.random() * 1e6, idea.topic));
            }}>
            Inspire me
          </Button>
        </div>
      )}
      {!baseRel && lastGame && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-bg2/60 px-3 py-2 text-xs">
          <span className="min-w-0 truncate text-ink2">
            Last game: <b className="text-ink">{lastGame.name}</b> · {GENRE_BY_ID[lastGame.concept.genre].name} · {TOPIC_BY_ID[lastGame.concept.topic]?.name ?? lastGame.concept.topic} · {SIZE_LABEL[lastGame.concept.size]}
          </span>
          <Button size="sm" icon="refresh" onClick={copyLast} title="Copy the genre, topic, audience, size, business model, price, platforms and engine (where still available)">
            Same setup
          </Button>
        </div>
      )}
      <Section title="1 · Concept">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Title">
            <div className="flex gap-2">
              <input className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <Button icon="refresh" aria-label="Suggest a name" onClick={() => setName(suggestName(Math.random() * 1e6, topic))} />
            </div>
          </Field>
          {franchises.length > 0 && (
            <Field label={baseRel ? 'Franchise' : 'Sequel to'}>
              <select
                className={inputCls}
                disabled={locked}
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
                    {f.name} · {fmtUnits(f.fans)} fans{f.fatigue > 0.2 ? ' · fatigued' : ''}{cliffhangerPending(s, f.id) ? ' · cliffhanger!' : ''}
                  </option>
                ))}
              </select>
              {franchiseId && !baseRel && cliffhangerPending(s, franchiseId) && <p className="mt-1 text-xs text-good">Fans are waiting to see how the last game’s cliffhanger resolves: this sequel starts with extra hype, and paying it off delights players.</p>}
            </Field>
          )}
        </div>
      </Section>

      <Section title="2 · Genre">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {[...genres].sort((a, b) => Number(b.ok) - Number(a.ok)).map(({ g, ok, why }) => (
            <button
              key={g.id}
              type="button"
              disabled={!ok || (locked && g.id !== genre)}
              onClick={() => {
                setGenre(g.id);
                sound.play('click');
              }}
              title={ok ? g.blurb : why}
              aria-pressed={genre === g.id}
              className={cx('rounded-xl border px-2.5 py-2 text-left text-xs transition disabled:opacity-40', genre === g.id ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2')}
            >
              <div className="flex items-center gap-1">
                <span className="min-w-0 truncate font-semibold">{g.name}</span>
                {ok && renowned.has(g.id) && <span className="shrink-0 text-[11px] text-gold" title="Your studio is known for these — players trust the name (more sales), and expect your usual standard">★</span>}
                {ok && genreStats[g.id]?.hot && <span className="ml-auto shrink-0 rounded-full bg-warn/15 px-1.5 text-[10px] font-bold text-warn" title="One of the three most popular genres right now">Hot</span>}
                {ok && !genreStats[g.id]?.hot && Math.abs(genreStats[g.id]?.trend ?? 0) > 0.08 && (
                  <span className={cx('num ml-auto shrink-0 text-[10px] font-bold', (genreStats[g.id]?.trend ?? 0) > 0 ? 'text-good' : 'text-bad')} title={(genreStats[g.id]?.trend ?? 0) > 0 ? 'Rising: more popular than six months ago' : 'Cooling: less popular than six months ago'}>
                    {(genreStats[g.id]?.trend ?? 0) > 0 ? '▲' : '▼'}
                  </span>
                )}
              </div>
              <div className="truncate text-ink3">{ok ? (genreStats[g.id]?.n ? `${genreStats[g.id]!.n} shipped · best ${genreStats[g.id]!.best}` : 'New to your studio') : why}</div>
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
                disabled={!ok || (locked && t.id !== topic)}
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
            options={(['small', 'medium', 'large', 'aaa'] as Size[]).map((z) => {
              const why = sizeAllowed(s, z) ?? (expansionRel && !expansionSizeOk(expansionRel, z) ? 'An expansion can’t be bigger than its base game' : null);
              return { value: z, label: SIZE_LABEL[z], disabled: !!why, title: why ?? `${Math.round(BALANCE.SIZE[z].days * work)} days · up to ${BALANCE.SIZE[z].teamCap} people` };
            })}
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
              disabled: !!monetizationAllowed(s, m, genre) || (!!expansionRel && m !== 'premium'),
              title: (expansionRel && m !== 'premium' ? 'Expansion packs are one-off purchases' : monetizationAllowed(s, m, genre)) ?? undefined,
            }))}
          />
        </div>
        {priceTierAllowed({ monetization: monet, expansionOf: expansionRel?.id, deal: deal ? { ...deal } : undefined }) && platforms.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Segmented<PriceTier>
              ariaLabel="Launch price"
              value={priceTier}
              onChange={setPriceTier}
              options={(['budget', 'standard', 'premium'] as PriceTier[]).map((tier) => {
                const pl = platformInfo(s, platforms[0]!);
                const price = pl ? launchPrice(s, pl, { ...conceptPreview, priceTier: tier }) : 0;
                const label = { budget: 'Budget', standard: 'Standard', premium: 'Premium' }[tier];
                return { value: tier, label: price ? label + ' · $' + price.toFixed(price < 10 ? 2 : 0) : label };
              })}
            />
            <span className="text-ink3">
              {priceTier === 'budget' ? 'About 30% more buyers (and fans) at 30% less per copy — less money overall, but players love the value.' : priceTier === 'premium' ? 'More money per copy, fewer buyers. Players resent it unless the game is great (85+).' : 'The going rate for a game like this.'}
            </span>
          </div>
        )}
      </Section>

      <Section title={`Signature features (${features.length}/${MAX_FEATURES})`} right={<span className="text-xs text-ink3">Optional · more scope, more payoff in the right genre</span>}>
        <div className="flex flex-wrap gap-1.5">
          {GAME_FEATURES.filter((f) => yr >= f.year).map((f) => {
            const why = featuresBlocked(s, [f.id], monet);
            const on = features.includes(f.id);
            const fit = f.fits[genre];
            const full = !on && features.length >= MAX_FEATURES;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                disabled={!!why || full}
                onClick={() => setFeatures((x) => (on ? x.filter((y) => y !== f.id) : [...x, f.id]))}
                title={`${f.desc}${f.work ? ` · ${f.work > 0 ? '+' : ''}${Math.round(f.work * 100)}% work` : ''}${f.cost ? ` · ${fmtMoney(money(f.cost, s.day))} licence` : ''}${why ? ` · ${why}` : ''}`}
                className={cx(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40',
                  on ? 'border-accent bg-accent text-accent-ink' : 'border-line hover:bg-bg2',
                )}
              >
                {f.name}
                {fit && <span className={cx('rounded-full px-1.5 text-[10px] font-bold', on ? 'bg-white/25' : 'bg-good/15 text-good')}>great fit</span>}
                {!fit && f.misfit < 1 && <span className={cx('rounded-full px-1.5 text-[10px] font-bold', on ? 'bg-white/25' : 'bg-bad/10 text-bad')}>odd fit</span>}
                <span className="num text-[10px] opacity-70">{f.work ? `${f.work > 0 ? '+' : ''}${Math.round(f.work * 100)}%` : f.cost ? fmtMoney(money(f.cost, s.day)) : ''}</span>
              </button>
            );
          })}
          {!GAME_FEATURES.some((f) => yr >= f.year) &&
            (() => {
              const next = [...GAME_FEATURES].sort((a, b) => a.year - b.year)[0];
              return next ? <span className="text-xs text-ink3">None invented yet — the first, {next.name}, arrives around {next.year}.</span> : null;
            })()}
        </div>
        <p className="mt-2 text-[11px] text-ink3">Features add scope (the percentage is extra work) and lift quality in genres they suit; a poor fit drags a little. Some change sales or how players feel — hover for details.</p>
      </Section>

      {yr >= LOC_YEAR && (
        <Section title="Localisation" right={<span className="text-xs text-ink3">Optional · {REGION_BY_ID[home].name} is home</span>}>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {REGIONS.filter((r) => r.id !== home).map((r) => {
              const branch = (s.company.branches ?? []).includes(r.id);
              const on = branch || locs.includes(r.id);
              const gain = regionMix(yr, genre, home, [r.id]).mul / regionMix(yr, genre, home, []).mul - 1;
              const taste = r.taste[genre] ?? 1;
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  disabled={branch}
                  onClick={() => setLocalized((x) => (on ? x.filter((y) => y !== r.id) : [...x, r.id]))}
                  title={r.blurb}
                  className={cx('rounded-xl border px-2.5 py-2 text-left text-xs transition', on ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2')}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold">{r.name}</span>
                    <span className={cx('num font-bold', gain >= 0.08 ? 'text-good' : gain < 0.03 ? 'text-ink3' : 'text-ink2')}>+{Math.round(gain * 100)}%</span>
                  </div>
                  <div className="text-ink3">
                    {Math.round(regionShares(yr)[r.id] * 100)}% of players · {taste >= 1.2 ? `loves ${GENRE_BY_ID[genre].name}` : taste <= 0.8 ? `cool on ${GENRE_BY_ID[genre].name}` : `likes ${GENRE_BY_ID[genre].name}`}
                  </div>
                  <div className="num text-ink3">{branch ? 'Your branch office handles it — free' : `${fmtMoney(money(LOC_COST[size], s.day))} · +${Math.round(LOC_WORK * 100)}% work`}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-ink3">Translated versions reach players who’d otherwise pass. The gain depends on how much each region likes this genre and how much text it has.</p>
        </Section>
      )}

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
                  {launchTitleMul(s, p, s.day + cost.days) > 1.05 && <Pill tone="gold">Launch window</Pill>}
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
                  {COMPANY_BY_ID[d.publisherId]?.name ?? d.publisherId}: {fmtMoney(dealAdvanceFor(d, size, s.day))} advance · {Math.round(d.royalty * 100)}% royalty · min {d.minScore}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {deal && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-bg2/60 p-2 text-xs">
            <CompanyBadge name={COMPANY_BY_ID[deal.publisherId]?.name ?? deal.publisherId} color={COMPANY_BY_ID[deal.publisherId]?.color ?? '#888'} size={28} />
            <div>
              You get <b>{fmtMoney(dealAdvanceFor(deal, size, s.day))}</b> now{deal.size && dealAdvanceFor(deal, size, s.day) < deal.advance ? ` (the full ${fmtMoney(deal.advance)} is for a ${SIZE_LABEL[deal.size]} game)` : ''} and <b>{Math.round(deal.royalty * 100)}%</b> of net revenue. Their distribution gives <b>{Math.round(deal.reach * 100)}%</b> reach. They expect a score of {deal.minScore}+ by {formatDate(deal.deadlineDay, false)}.
            </div>
          </div>
        )}
      </Section>

      <Section title={`7 · Team (${Math.min(team.length, cap)}/${cap})`}>
        <StaffPicker pool={idle} selected={team.filter((id) => idle.some((x) => x.id === id))} onChange={setTeam} cap={cap} genre={genre} />
        {team.length > cap && <p className="mt-1 text-xs text-warn">Only the first {cap} will join a {SIZE_LABEL[size]} game.</p>}
      </Section>

      <Section title="8 · Focus" right={ideal ? <Pill tone="gold">Gold marks = your notes on {GENRE_BY_ID[genre].name}</Pill> : <Pill>Ship {aOrAn(GENRE_BY_ID[genre].name)} game to learn what works</Pill>}>
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
            <div className="num font-semibold">{fmtMoney(cost.total + kitCost + featCost)}</div>
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

const contractSkill = (st: Staff) => Math.max(st.skills.design, st.skills.programming);

function Contracts() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const idle = freeStaff(s);
  const [teamPick, setTeam] = useState<string[]>(() => [...idle].sort((a, b) => contractSkill(b) - contractSkill(a)).slice(0, 2).map((x) => x.id));
  const team = teamPick.filter((id) => idle.some((x) => x.id === id));
  if (!s.offers.contracts.length) return <Empty icon="briefcase" title="No contract offers right now">New offers arrive every month.</Empty>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink3">Contracts pay reliably — great for cash flow early on, or to keep idle staff busy. Missing a deadline costs reputation.</p>
      <div>
        <div className="mb-1 text-xs font-semibold text-ink2">Assign</div>
        <StaffPicker pool={idle} selected={team} onChange={setTeam} cap={12} score={contractSkill} scoreLabel="skill" />
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
