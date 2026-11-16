import { useEffect, useRef, useState } from 'react';
import { GENRE_BY_ID } from '@/data/genres';
import { TOPIC_BY_ID } from '@/data/topics';
import { PERSON_BY_ID } from '@/data/people';
import { SKILLS, type Skill } from '@/data/types';
import { formatDate, fromDay } from '@/sim/calendar';
import { fmtMoney, fmtUnits } from '@/sim/util';
import { availablePlatforms, platformName } from '@/sim/systems/market';
import { canPatch, patchCost, portCost } from '@/sim/systems/release';
import { devkitCost } from '@/sim/actions';
import { marketSalary, productivity, moraleTarget, ROLE_NAMES } from '@/sim/systems/staff';
import { creditLimit, monthlyBurn } from '@/sim/systems/finance';
import { runScore } from '@/sim/systems/achievements';
import { qualityToScore } from '@/sim/systems/dev';
import type { Focus3, Specialisation } from '@/sim/types';
import { addHallOfFame, type SlotId } from '@/services/saves';
import { useAuth } from '@/services/auth';
import { Button, BreakdownList, Meter, Modal, Pill, Section, Segmented, Tip, cx } from '../components/ui';
import { EventArt } from '../art/EventArt';
import { Cover } from '../art/Cover';
import { LineChart } from '../charts';
import { Icon } from '../icons';
import { useGame } from '../store';
import { FocusSliders } from './FocusEditor';
import { GuideModal } from './Guide';
import { RivalModal } from './RivalModal';
import { genreExperience, idealFocus, PHASE_NAMES } from './lib';
import { Face, SkillBars, Traits } from '../panels/StaffPanel';
import { sound } from '../sound';
import { navigate } from '../router';
import { prefersReducedMotion, useSettings } from '../settings';

export function ModalHost({ slotId }: { slotId: SlotId }) {
  const modal = useGame((g) => g.modals[0]);
  const pop = useGame((g) => g.popModal);
  useGame((g) => g.v);
  if (!modal) return null;
  switch (modal.kind) {
    case 'event':
      return <EventModal uid={modal.uid} onClose={pop} />;
    case 'reviews':
      return <ReviewsModal releaseId={modal.releaseId} onClose={pop} />;
    case 'release':
      return <ReleaseModal releaseId={modal.releaseId} onClose={pop} />;
    case 'gate':
      return <GateModal projectId={modal.projectId} onClose={pop} />;
    case 'staff':
      return <StaffModal staffId={modal.staffId} onClose={pop} />;
    case 'gameOver':
      return <GameOverModal onClose={pop} slotId={slotId} />;
    case 'insolvent':
      return <InsolventModal onClose={pop} />;
    case 'majorNews':
      return <MajorNewsModal newsId={modal.newsId} onClose={pop} />;
    case 'shortcuts':
      return <ShortcutsModal onClose={pop} />;
    case 'guide':
      return <GuideModal onClose={pop} />;
    case 'rival':
      return <RivalModal rivalId={modal.rivalId} onClose={pop} />;
    default:
      return null;
  }
}

function EventModal({ uid, onClose }: { uid: number; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const e = s.pendingEvents.find((x) => x.uid === uid);
  useEffect(() => {
    if (!e) onClose();
  }, [e, onClose]);
  if (!e) return null;
  return (
    <Modal open title={e.title} dismissable={false}>
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
        <EventArt art={e.art} size={110} />
        <div>
          <h2 className="font-display text-xl font-semibold">{e.title}</h2>
          <p className="mt-1 text-sm text-ink2">{e.body}</p>
          <p className="num mt-1 text-[11px] text-ink3">{formatDate(e.day)}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {e.options.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={o.disabled}
            onClick={() => {
              const r = act({ type: 'resolveEvent', uid, option: o.id });
              if (r.ok) {
                sound.play('click');
                onClose();
              }
            }}
            className="w-full rounded-xl border border-line bg-panel2 p-3 text-left transition hover:border-accent hover:bg-accent/5 disabled:opacity-45"
          >
            <div className="text-sm font-semibold">{o.label}</div>
            <div className="text-xs text-ink3">{o.preview}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function scoreTone(sc: number) {
  return sc >= 85 ? 'text-gold' : sc >= 70 ? 'text-good' : sc >= 50 ? 'text-warn' : 'text-bad';
}

function ReviewsModal({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const r = s.releases[releaseId];
  const reduce = prefersReducedMotion(useSettings.getState());
  const [shown, setShown] = useState(reduce ? 99 : 0);
  useEffect(() => {
    if (!r || shown >= r.reviews.length) return;
    const t = setTimeout(() => {
      setShown((x) => x + 1);
      sound.play('type');
    }, 520);
    return () => clearTimeout(t);
  }, [shown, r]);
  const allShown = !!r && shown >= r.reviews.length;
  useEffect(() => {
    if (allShown && r) sound.play(r.score >= 85 ? 'fanfare' : r.score >= 60 ? 'success' : 'fail');
  }, [allShown, r]);
  if (!r) return null;
  return (
    <Modal open onClose={onClose} title={`Reviews: ${r.name}`} wide>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Cover title={r.name} genre={r.concept.genre} topic={r.concept.topic} seed={r.day} size={140} score={allShown ? r.score : undefined} />
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-ink3">The reviews are in</div>
          <h2 className="font-display text-2xl font-semibold">{r.name}</h2>
          <div className="text-sm text-ink2">
            {GENRE_BY_ID[r.concept.genre].name} · {TOPIC_BY_ID[r.concept.topic]?.name} · {r.concept.platforms.map((p) => platformName(s, p)).join(', ')}
          </div>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <div className="text-xs text-ink3">Critic score</div>
              <div className={cx('num font-display text-5xl font-bold transition-opacity', scoreTone(r.score), allShown ? 'opacity-100' : 'opacity-20')}>{allShown ? r.score : '??'}</div>
            </div>
            <div>
              <div className="text-xs text-ink3">User score</div>
              <Tip content={r.why.user ? <BreakdownList bd={r.why.user} format={(v) => v.toFixed(1)} title="Why players feel this way" /> : ''}>
                <div className={cx('num font-display text-3xl font-semibold', allShown ? scoreTone(r.userScore) : 'opacity-20')}>{allShown ? r.userScore : '??'}</div>
              </Tip>
            </div>
          </div>
          {allShown && r.score >= 85 && !reduce && <Confetti />}
        </div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {r.reviews.map((rv, i) => (
          <li key={rv.outlet} className={cx('rounded-xl border border-line bg-panel2 p-3 transition duration-300', i < shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink3">{rv.outlet}</span>
              <span className={cx('num font-display text-lg font-bold', scoreTone(rv.score))}>{rv.display}</span>
            </div>
            <p className="mt-1 text-sm italic text-ink2">“{rv.blurb}”</p>
          </li>
        ))}
      </ul>
      {allShown && (
        <Section title="What drove the score" className="mt-4">
          <BreakdownList bd={r.quality} format={(v) => v.toFixed(2)} />
        </Section>
      )}
      <div className="mt-2 flex justify-end gap-2">
        {!allShown && (
          <Button variant="ghost" onClick={() => setShown(99)}>
            Skip
          </Button>
        )}
        <Button variant="primary" onClick={onClose}>
          Continue
        </Button>
      </div>
    </Modal>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 36 }, (_, i) => i);
  return (
    <div className="pointer-events-none fixed inset-0 z-[150] overflow-hidden" aria-hidden>
      {pieces.map((i) => (
        <span
          key={i}
          className="absolute top-[-10px] block h-2.5 w-1.5 rounded-sm"
          style={{
            left: `${(i * 97) % 100}%`,
            background: ['var(--accent)', 'var(--gold)', 'var(--good)', 'var(--tech)', 'var(--art)'][i % 5],
            animation: `confetti-fall ${1.6 + (i % 7) * 0.2}s ${(i % 9) * 0.06}s ease-in forwards`,
            transform: `rotate(${i * 37}deg)`,
          }}
        />
      ))}
      <style>{`@keyframes confetti-fall{to{transform:translateY(105vh) rotate(720deg);opacity:.2}}`}</style>
    </div>
  );
}

function ReleaseModal({ releaseId, onClose }: { releaseId: string; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const r = s.releases[releaseId];
  if (!r) return null;
  const series = [...r.weekly.map((u, i) => ({ x: i, y: u }))];
  const profit = r.net - r.devCost;
  return (
    <Modal open onClose={onClose} title={r.name} wide>
      <div className="flex gap-4">
        <Cover title={r.name} genre={r.concept.genre} topic={r.concept.topic} seed={r.day} size={110} score={r.score} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold">{r.name}</h2>
          <div className="text-sm text-ink2">
            Released {formatDate(r.day)} · {GENRE_BY_ID[r.concept.genre].name} · {r.concept.platforms.map((p) => platformName(s, p)).join(', ')}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill tone={r.score >= 70 ? 'good' : 'neutral'}>Critics {r.score}</Pill>
            <Pill>Users {r.userScore}</Pill>
            <Pill>{fmtUnits(r.units)} sold</Pill>
            <Pill tone={profit >= 0 ? 'good' : 'bad'}>
              {profit >= 0 ? 'Profit' : 'Loss'} {fmtMoney(Math.abs(profit))}
            </Pill>
            {r.awards.map((a) => (
              <Pill key={a} tone="gold">
                🏆 {a}
              </Pill>
            ))}
          </div>
        </div>
      </div>
      <Section title="Weekly sales" className="mt-4">
        <LineChart ariaLabel={`${r.name} weekly sales`} height={160} area series={[{ name: 'Units', points: series }]} xFormat={(w) => `wk ${w}`} yFormat={(v) => fmtUnits(v)} />
      </Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Why it scored">
          <BreakdownList bd={r.quality} format={(v) => v.toFixed(2)} />
        </Section>
        {r.why.sales && (
          <Section title="Why it sold">
            <BreakdownList bd={r.why.sales} format={(v) => v.toFixed(3)} />
          </Section>
        )}
      </div>
      <Section title="By platform">
        <ul className="text-sm">
          {r.platforms.map((p) => (
            <li key={p.platform} className="flex justify-between border-b border-line py-1">
              <span>
                {platformName(s, p.platform)} {p.startWeek ? <Pill tone="tech">port</Pill> : null}
              </span>
              <span className="num">{fmtUnits(p.units)}</span>
            </li>
          ))}
        </ul>
      </Section>
      <PostLaunch releaseId={releaseId} />
    </Modal>
  );
}

function GateModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const p = s.projects[projectId];
  const phase = p && p.kind === 'game' ? (Math.min(2, p.phase) as 0 | 1 | 2) : 0;
  const [focus, setFocus] = useState<Focus3>(p && p.kind === 'game' ? p.focus[phase] : [34, 33, 33]);
  if (!p || p.kind !== 'game') return null;
  const learned = genreExperience(s, p.concept.genre) > 0;
  const est = p.qualityPreview ? Math.round(qualityToScore(p.qualityPreview.total)) : null;
  const go = () => {
    act({ type: 'setFocus', projectId, phase, focus });
    act({ type: 'continueGate', projectId });
    if (s.progress.tutorialStep === 3) act({ type: 'tutorial', step: 4 });
    onClose();
    useGame.getState().setSpeed(useGame.getState().lastSpeed);
  };
  return (
    <Modal open onClose={go} title="Phase gate">
      <div className="text-xs uppercase tracking-wide text-ink3">{p.concept.name}</div>
      <h2 className="font-display text-xl font-semibold">
        {PHASE_NAMES[phase - 1] ?? 'Phase'} complete → {PHASE_NAMES[phase]}
      </h2>
      <p className="mt-1 text-sm text-ink2">
        Decide where the team puts its effort for the next phase. {learned ? 'Gold marks show what worked for this genre before.' : `You haven't shipped a ${GENRE_BY_ID[p.concept.genre].name} game yet — think about what players of this genre care about.`}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-bg2 p-2">
          Design <b className="num block text-base">{Math.round(p.design)}</b>
        </div>
        <div className="rounded-xl bg-bg2 p-2">
          Tech <b className="num block text-base">{Math.round(p.tech)}</b>
        </div>
        <div className="rounded-xl bg-bg2 p-2">
          Est. score <b className="num block text-base">{est ?? '—'}</b>
        </div>
      </div>
      <div className="mt-4">
        <FocusSliders phase={phase} value={focus} onChange={setFocus} ideal={learned ? idealFocus(p.concept.genre)[phase] : undefined} />
      </div>
      {p.qualityPreview && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-semibold text-ink2">Why this estimate?</summary>
          <div className="mt-2">
            <BreakdownList bd={p.qualityPreview} format={(v) => v.toFixed(2)} />
          </div>
        </details>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="primary" icon="play" onClick={go}>
          Continue development
        </Button>
      </div>
    </Modal>
  );
}

const SPECS: { id: Specialisation; label: string; desc: string }[] = [
  { id: 'engine_programmer', label: 'Engine Programmer', desc: '+25% engine/AI, faster engine builds' },
  { id: 'lead_designer', label: 'Lead Designer', desc: '+15% gameplay & level design' },
  { id: 'art_director', label: 'Art Director', desc: '+20% graphics & world' },
  { id: 'composer', label: 'Composer', desc: '+30% sound' },
  { id: 'narrative_director', label: 'Narrative Director', desc: '+25% story & dialogue' },
  { id: 'qa_lead', label: 'QA Lead', desc: '+40% bug fixing' },
  { id: 'producer', label: 'Producer', desc: 'Halves team coordination overhead' },
];

function StaffModal({ staffId, onClose }: { staffId: string; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const st = s.staff[staffId];
  const [skill, setSkill] = useState<Skill>('design');
  const [confirmFire, setConfirmFire] = useState(false);
  useEffect(() => () => useGame.getState().selectStaff(null), []);
  if (!st) return null;
  const market = marketSalary(s, st.skills);
  const person = st.personId ? PERSON_BY_ID[st.personId] : undefined;
  const run = (a: Parameters<typeof act>[0], ok?: string) => {
    const r = act(a);
    if (!r.ok) toast({ text: r.error, tone: 'bad' });
    else if (ok) toast({ text: ok, tone: 'good' });
  };
  const morale = st.moraleWhy ?? moraleTarget(s, st);
  const prod = productivity(s, st);
  return (
    <Modal open onClose={onClose} title={st.name} wide>
      <div className="flex items-start gap-4">
        <Face p={st} size={84} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold">{st.name}</h2>
          <div className="text-sm text-ink2">
            {st.level} {ROLE_NAMES[st.role]}
            {st.spec && ` · ${SPECS.find((x) => x.id === st.spec)?.label}`} · since {fromDay(st.hiredDay).year} · {st.gamesShipped} games shipped
          </div>
          {person && <div className="mt-1 text-xs text-gold">★ {person.knownFor}</div>}
          <div className="mt-2">
            <Traits traits={st.traits} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Section title="Skills">
            <SkillBars skills={st.skills} />
            <div className="mt-1 text-[11px] text-ink3">Potential {st.potential}</div>
          </Section>
          <Section title="Condition">
            <div className="space-y-2 text-xs">
              <Tip content={<BreakdownList bd={morale} format={(v) => v.toFixed(1)} title="What drives their morale" />}>
                <div className="w-full cursor-help">
                  <div className="flex justify-between">
                    <span>Morale</span>
                    <span className="num">{Math.round(st.morale)}% → {Math.round(morale.total)}%</span>
                  </div>
                  <Meter value={st.morale} label="Morale" />
                </div>
              </Tip>
              <div>
                <div className="flex justify-between">
                  <span>Energy</span>
                  <span className="num">{Math.round(st.energy)}%</span>
                </div>
                <Meter value={st.energy} label="Energy" />
              </div>
              <div>
                <div className="flex justify-between">
                  <span>Burnout</span>
                  <span className="num">{Math.round(st.burnout)}%</span>
                </div>
                <Meter value={100 - st.burnout} label="Burnout (inverted)" />
              </div>
              <div>
                <div className="flex justify-between">
                  <span>Loyalty</span>
                  <span className="num">{Math.round(st.loyalty)}%</span>
                </div>
                <Meter value={st.loyalty} tone="gold" label="Loyalty" />
              </div>
              <Tip content={<BreakdownList bd={prod} format={(v) => v.toFixed(2)} title="Productivity" />}>
                <div className="cursor-help rounded-lg bg-bg2 px-2 py-1">
                  Productivity <b className="num">{Math.round(prod.total * 100)}%</b> <Icon name="info" size={12} className="inline" />
                </div>
              </Tip>
            </div>
          </Section>
        </div>
        <div>
          {st.role !== 'founder' && (
            <Section title="Pay">
              <div className="text-sm">
                <span className="num font-semibold">{fmtMoney(st.salary)}</span>/yr · market <span className="num">{fmtMoney(market)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => run({ type: 'setSalary', staffId, salary: Math.round(st.salary * 1.1) }, 'Raise given')}>
                  +10% raise
                </Button>
                <Button size="sm" onClick={() => run({ type: 'setSalary', staffId, salary: Math.max(st.salary, market) }, 'Matched market rate')} disabled={st.salary >= market}>
                  Match market
                </Button>
              </div>
            </Section>
          )}
          <Section title="Assignment">
            <Segmented
              ariaLabel="Assignment"
              value={st.assignment.kind === 'project' ? 'project' : st.assignment.kind}
              onChange={(v) => {
                if (v === 'research' || v === 'idle') run({ type: 'assign', staffId, to: v });
              }}
              options={[
                { value: 'idle', label: 'Free' },
                { value: 'research', label: 'Research' },
                { value: 'project', label: 'On a project', disabled: true },
                { value: 'training', label: 'Training', disabled: true },
              ]}
            />
            {st.assignment.kind === 'project' && <p className="mt-1 text-[11px] text-ink3">Set to Free to pull them off their project.</p>}
          </Section>
          <Section title="Training">
            <div className="flex gap-2">
              <select className="h-8 flex-1 rounded-lg border border-line bg-panel2 px-2 text-sm capitalize" value={skill} onChange={(e) => setSkill(e.target.value as Skill)} aria-label="Skill to train">
                {SKILLS.map((k) => (
                  <option key={k} value={k}>
                    {k} ({Math.round(st.skills[k])})
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => run({ type: 'train', staffId, skill }, 'Training started')} disabled={!s.research.done.includes('biz_training')} title={s.research.done.includes('biz_training') ? '4 weeks off work, +~8 skill' : 'Research the Training Programme first'}>
                Train
              </Button>
            </div>
          </Section>
          {(st.level === 'senior' || st.level === 'lead' || st.role === 'founder') && !st.spec && (
            <Section title="Specialise">
              <div className="grid gap-1">
                {SPECS.map((sp) => (
                  <button key={sp.id} type="button" onClick={() => run({ type: 'setSpec', staffId, spec: sp.id }, `${st.name} is now a ${sp.label}`)} className="rounded-lg border border-line px-2 py-1.5 text-left text-xs hover:bg-bg2">
                    <b>{sp.label}</b> <span className="text-ink3">— {sp.desc}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}
          {st.role !== 'founder' && (
            <div className="mt-2">
              {confirmFire ? (
                <Button
                  variant="danger"
                  size="sm"
                  icon="logout"
                  onClick={() => {
                    run({ type: 'fire', staffId }, `${st.name} has left`);
                    onClose();
                  }}
                >
                  Confirm: let {st.name.split(' ')[0]} go (1 month severance)
                </Button>
              ) : (
                <Button variant="ghost" size="sm" icon="logout" onClick={() => setConfirmFire(true)}>
                  Let go…
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function GameOverModal({ onClose, slotId }: { onClose: () => void; slotId: SlotId }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const user = useAuth((a) => a.user);
  const recorded = useRef(false);
  const score = runScore(s);
  const ending = s.status === 'bankrupt' ? 'Bankrupt' : s.status === 'acquired' ? 'Sold' : 'Retired';
  useEffect(() => {
    if (recorded.current || !user || s.status === 'running') return;
    recorded.current = true;
    void addHallOfFame(user.uid, {
      company: s.company.name,
      founder: s.company.founderName,
      ending,
      years: `${s.settings.startYear}–${fromDay(s.day).year}`,
      score,
      bestGame: s.progress.stats.bestGame,
      bestScore: s.progress.stats.bestScore,
      peakValuation: s.progress.stats.peakValuation,
      day: Date.now(),
    });
  }, [user, s, ending, score]);
  const storyEnd = s.status === 'retired' && s.endReason?.startsWith('The story');
  return (
    <Modal open title="The end" dismissable={false}>
      <div className="text-center">
        <div className={cx('mx-auto grid size-16 place-items-center rounded-2xl', s.status === 'bankrupt' ? 'bg-bad/15 text-bad' : 'bg-gold/20 text-gold')}>
          <Icon name={s.status === 'bankrupt' ? 'skull' : 'trophy'} size={32} />
        </div>
        <h2 className="mt-3 font-display text-2xl font-semibold">{storyEnd ? 'You made it to the present day!' : ending}</h2>
        <p className="mt-1 text-sm text-ink2">{s.endReason}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl bg-bg2 p-2">
            Score <b className="num block text-lg">{score.toLocaleString()}</b>
          </div>
          <div className="rounded-xl bg-bg2 p-2">
            Games <b className="num block text-lg">{s.progress.stats.gamesReleased}</b>
          </div>
          <div className="rounded-xl bg-bg2 p-2">
            Best <b className="num block text-lg">{s.progress.stats.bestScore}</b>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink3">Recorded in your Hall of Fame.</p>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {storyEnd && (
          <Button
            variant="primary"
            icon="play"
            onClick={() => {
              act({ type: 'continueEndless' });
              onClose();
            }}
          >
            Continue in endless mode
          </Button>
        )}
        <Button
          onClick={() => {
            onClose();
            navigate('slots');
          }}
        >
          Back to save slots
        </Button>
      </div>
      <span className="sr-only">{slotId}</span>
    </Modal>
  );
}

function InsolventModal({ onClose }: { onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const openPanel = useGame((g) => g.openPanel);
  return (
    <Modal open onClose={onClose} title="Insolvent">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-bad/15 text-bad">
          <Icon name="warning" size={26} />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">You’re out of cash</h2>
          <p className="mt-1 text-sm text-ink2">
            Cash is {fmtMoney(s.company.cash)}. Get back above zero before the grace period ends or the company goes bankrupt. Monthly burn is {fmtMoney(monthlyBurn(s))}.
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        <li>• Borrow (credit available: {fmtMoney(creditLimit(s))})</li>
        <li>• Take contract work for quick income</li>
        <li>• Cut costs: let staff go, downsize the office, sell furniture</li>
        <li>• Sell an IP you don’t need</li>
      </ul>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => {
            onClose();
            openPanel('finance');
          }}
        >
          Finance
        </Button>
        <Button
          onClick={() => {
            onClose();
            openPanel('develop', 'contracts');
          }}
        >
          Contracts
        </Button>
        <Button variant="primary" onClick={onClose}>
          Got it
        </Button>
      </div>
    </Modal>
  );
}

function MajorNewsModal({ newsId, onClose }: { newsId: number; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const n = s.news.find((x) => x.id === newsId);
  if (!n) return null;
  return (
    <Modal open onClose={onClose} title="Breaking news">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Breaking news · {formatDate(n.day, false)}</div>
      <h2 className="mt-2 font-display text-2xl font-semibold leading-tight">{n.headline}</h2>
      {n.body && <p className="mt-2 text-sm text-ink2">{n.body}</p>}
      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          Continue
        </Button>
      </div>
    </Modal>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Space', 'Pause / resume'],
    ['1 · 2 · 3', 'Speed 1× · 2× · 4×'],
    ['N', 'Develop'],
    ['H', 'Staff & hiring'],
    ['B', 'Office / build'],
    ['R', 'Research (rotate while building)'],
    ['M', 'Market'],
    ['L', 'Your games'],
    ['F', 'Finance'],
    ['C', 'Company'],
    ['J', 'News'],
    ['G', 'Goals'],
    ['W A S D / arrows', 'Pan the office'],
    ['+ / − / 0', 'Zoom in / out / fit'],
    ['Shift + P', 'Save now'],
    ['Esc', 'Close panel / exit build mode'],
    ['?', 'This sheet'],
  ];
  return (
    <Modal open onClose={onClose} title="Keyboard shortcuts">
      <h2 className="mb-3 font-display text-xl font-semibold">Keyboard shortcuts</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded-md border border-line bg-bg2 px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
            </dt>
            <dd className="text-ink2">{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

function PostLaunch({ releaseId }: { releaseId: string }) {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const r = s.releases[releaseId]!;
  const ports = availablePlatforms(s).filter((p) => !r.concept.platforms.includes(p.id));
  const [port, setPort] = useState(ports[0]?.id ?? '');
  const patchWhy = canPatch(s, r);
  const tooOld = s.day - r.day > 365 * 4;
  const run = (a: Parameters<typeof act>[0], ok: string) => {
    const res = act(a);
    toast(res.ok ? { text: ok, tone: 'good', icon: 'wrench' } : { text: res.error, tone: 'bad' });
  };
  return (
    <Section title="Post-launch support">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3 text-xs">
          <div className="text-sm font-semibold">Patch it</div>
          <p className="mt-0.5 text-ink3">
            {Math.round(r.bugs)} known bugs · {r.patches ?? 0}/3 patches. Fixing bugs lifts the user score and extends sales.
          </p>
          <Button size="sm" className="mt-2" icon="wrench" disabled={!!patchWhy || s.company.cash < patchCost(s, r)} title={patchWhy ?? undefined} onClick={() => run({ type: 'patchGame', releaseId }, `Patch shipped for ${r.name}`)}>
            {patchWhy ?? `Ship patch · ${fmtMoney(patchCost(s, r))}`}
          </Button>
        </div>
        <div className="rounded-xl border border-line p-3 text-xs">
          <div className="text-sm font-semibold">Port to another platform</div>
          <p className="mt-0.5 text-ink3">An outsourced port launches with a fresh (smaller) sales curve.</p>
          {tooOld || !ports.length ? (
            <p className="mt-2 text-ink3">{tooOld ? 'Too old to port profitably.' : 'No other platforms available.'}</p>
          ) : (
            <div className="mt-2 flex gap-2">
              <select className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-panel2 px-2" value={port} onChange={(e) => setPort(e.target.value)} aria-label="Port to">
                {ports.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={!port} onClick={() => run({ type: 'portGame', releaseId, platform: port }, `${r.name} ported!`)}>
                {fmtMoney(portCost(s, r) + (s.devkits.includes(port) ? 0 : devkitCost(s, port)))}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
