import { COMPANY_BY_ID } from '@/data/companies';
import { genreWord } from '@/sim/systems/pitches';
import { useEffect, useRef, useState } from 'react';
import { CAMPAIGN_BOOST, CAMPAIGN_MIN_SCORE, campaignBlocked, campaignCost, campaignFor } from '@/sim/systems/awardsCampaign';
import { licenceDue } from '@/sim/systems/licences';
import { checkInBlocked, checkInLimit, checkInsUsed } from '@/sim/systems/checkIns';
import type { MascotAcc, MascotDesign, MascotKind } from '@/sim/types';
import { Mascot } from '../art/Mascot';
import { StudioStory } from './StudioStory';
import { TrailerCutModal } from './TrailerCut';
import { hobbyOf } from '@/data/hobbies';
import { StudioCardModal } from './StudioCard';
import { TALK_AWAY_DAYS, TALK_YEAR, talkBlocked, talkCost, talkTitle, talkableGames } from '@/sim/systems/talks';
import { lifeLine } from '@/sim/systems/lifeEvents';
import { BugBashModal } from './BugBash';
import { liveEventBlocked, liveEventBoost, liveEventCost, liveEventName } from '@/sim/systems/liveEvents';
import { BEST_FRIENDS, FEUD, relationsOf } from '@/sim/systems/relations';
import { BuzzList, BuzzMeter } from '../components/BuzzList';
import { releaseBuzz } from './buzz';
import { REGIONS, REGION_BY_ID, gameRegions } from '@/data/regions';
import { AMBITION_PENALTY, AMBITION_REWARD, ambitionHint, ambitionText } from '@/sim/systems/ambitions';
import { GENRE_BY_ID } from '@/data/genres';
import { TOPIC_BY_ID } from '@/data/topics';
import { PERSON_BY_ID } from '@/data/people';
import { SKILLS, type Skill } from '@/data/types';
import { formatDate, fromDay } from '@/sim/calendar';
import { aOrAn, fmtMoney, fmtUnits } from '@/sim/util';
import { availablePlatforms, platformName } from '@/sim/systems/market';
import { EXPANSION_MAX_AGE_YEARS, EXPANSION_MIN_SCORE, SALE_DISCOUNTS, canExpand, canPatch, canRemaster, canRunSale, expansionsOf, patchCost, portCost, rereleaseBlocked, rereleaseCost, saleForecast, bundleCost, bundleMul, MAX_BUNDLE } from '@/sim/systems/release';
import { devkitCost } from '@/sim/actions';
import { ROLE_NAMES, SABBATICAL, favouriteGenre, marketSalary, menteesOf, mentorBlocked, moraleTarget, productivity, retirementDay, sabbaticalBlocked, vacationBlocked } from '@/sim/systems/staff';
import { creditLimit, monthlyBurn } from '@/sim/systems/finance';
import { runScore } from '@/sim/systems/achievements';
import { qualityToScore } from '@/sim/systems/dev';
import type { BadgeShape, Focus3, Specialisation } from '@/sim/types';
import { addHallOfFame, type SlotId } from '@/services/saves';
import { useAuth } from '@/services/auth';
import { Button, BreakdownList, Meter, Modal, Pill, Section, Segmented, Tip, cx, inputCls } from '../components/ui';
import { postMortem } from './postmortem';
import { EventArt } from '../art/EventArt';
import { Cover } from '../art/Cover';
import { LineChart } from '../charts';
import { Icon, type IconName } from '../icons';
import { CompanyBadge } from '../art/CompanyBadge';
import { useGame } from '../store';
import { FocusSliders } from './FocusEditor';
import { GuideModal } from './Guide';
import { RivalModal } from './RivalModal';
import { genreExperience, idealFocus, PHASE_NAMES } from './lib';
import { Face, SkillBars, Traits } from '../panels/staffBits';
import { sound } from '../sound';
import { navigate } from '../router';
import { prefersReducedMotion, useSettings } from '../settings';

export function ModalHost({ slotId }: { slotId: SlotId }) {
  const modal = useGame((g) => g.modals[0]);
  const pop = useGame((g) => g.popModal);
  const s = useGame((g) => g.s);
  useGame((g) => g.v);
  // A modal whose subject vanished (staff quit, project cancelled…) must close itself, or it would
  // sit invisibly at the front of the queue and block everything behind it.
  const stale =
    !!modal &&
    !!s &&
    ((modal.kind === 'staff' && !s.staff[modal.staffId]) ||
      ((modal.kind === 'reviews' || modal.kind === 'release') && !s.releases[modal.releaseId]) ||
      (modal.kind === 'gate' && !(s.projects[modal.projectId]?.kind === 'game' && (s.projects[modal.projectId] as { awaitingGate?: boolean }).awaitingGate)) ||
      (modal.kind === 'majorNews' && !s.news.some((n) => n.id === modal.newsId)) ||
      (modal.kind === 'rival' && !s.rivals[modal.rivalId]) ||
      (modal.kind === 'gala' && ![...(s.awardHistory ?? [])].reverse().find((y) => y.year === modal.year)?.winners.some((w) => w.mine)) ||
      (modal.kind === 'bugBash' && s.projects[modal.projectId]?.kind !== 'game') ||
      (modal.kind === 'trailerCut' && s.projects[modal.projectId]?.kind !== 'game') ||
      (modal.kind === 'event' && !s.pendingEvents.some((e) => e.uid === modal.uid)));
  useEffect(() => {
    if (stale) pop();
  }, [stale, pop]);
  if (!modal || stale) return null;
  switch (modal.kind) {
    case 'event':
      return <EventModal key={modal.uid} uid={modal.uid} onClose={pop} />;
    case 'reviews':
      return <ReviewsModal key={modal.releaseId} releaseId={modal.releaseId} onClose={pop} />;
    case 'release':
      return <ReleaseModal key={modal.releaseId} releaseId={modal.releaseId} onClose={pop} />;
    case 'gate':
      return <GateModal key={modal.projectId} projectId={modal.projectId} onClose={pop} />;
    case 'staff':
      return <StaffModal key={modal.staffId} staffId={modal.staffId} onClose={pop} />;
    case 'gameOver':
      return <GameOverModal onClose={pop} slotId={slotId} />;
    case 'insolvent':
      return <InsolventModal onClose={pop} />;
    case 'trailerCut':
      return <TrailerCutModal projectId={modal.projectId} onClose={pop} />;
    case 'bugBash':
      return <BugBashModal key={modal.projectId} projectId={modal.projectId} onClose={pop} />;
    case 'majorNews':
      return <MajorNewsModal newsId={modal.newsId} onClose={pop} />;
    case 'gala':
      return <GalaModal year={modal.year} onClose={pop} />;
    case 'studioCard':
      return <StudioCardModal onClose={pop} />;
    case 'identity':
      return <IdentityModal onClose={pop} />;
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

const BRAND_COLORS = ['#e07a5f', '#d1495b', '#e3b23c', '#5f9e6e', '#2eb5a8', '#3d85c6', '#9b6bd3', '#334155', '#1f2937', '#c2410c'];
const EMBLEMS: IconName[] = ['rocket', 'controller', 'star', 'crown', 'fire', 'zap', 'heart', 'gem', 'diamond', 'leaf', 'shield', 'sun', 'moon', 'music', 'cube', 'phoenix', 'unicorn', 'castle', 'mountain', 'shuriken', 'robot', 'globe', 'flag', 'sparkle', 'coffee', 'pizza', 'lightbulb', 'target'];
const SHAPE_OPTS: { value: BadgeShape; label: string }[] = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'circle', label: 'Circle' },
  { value: 'shield', label: 'Shield' },
  { value: 'hex', label: 'Hexagon' },
];

/** Studio identity: name, colour, emblem and badge shape. */
function IdentityModal({ onClose }: { onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.actOrToast);
  const [name, setName] = useState(s.company.name);
  const [color, setColor] = useState(s.company.color);
  const [mascot, setMascot] = useState<MascotDesign>(() => s.company.mascot ?? { kind: 'bear', color: s.company.color, acc: 'none' });
  const [emblem, setEmblem] = useState<string | null>(s.company.logo?.emblem ?? null);
  const [shape, setShape] = useState<BadgeShape>(s.company.logo?.shape ?? 'rounded');
  const save = () => {
    if (act({ type: 'setIdentity', name, color, emblem, shape }, 'Studio identity updated')) {
      act({ type: 'setMascot', mascot: { ...mascot, color } });
      onClose();
    }
  };
  return (
    <Modal open onClose={onClose} title="Studio identity">
      <div className="flex items-center gap-4">
        <CompanyBadge name={name || '?'} color={color} size={84} emblem={emblem ?? undefined} shape={shape} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink3">Studio identity</div>
          <input className={cx(inputCls, 'mt-1 font-display text-lg font-semibold')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Studio name" />
        </div>
      </div>
      <Section title="Colour" className="mt-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Studio colour">
          {BRAND_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={cx('size-8 rounded-full ring-offset-2 ring-offset-[var(--panel)] transition', color === c && 'ring-2 ring-ink')} style={{ background: c }} />
          ))}
        </div>
      </Section>
      <Section title="Shape" className="mt-3">
        <Segmented<BadgeShape> ariaLabel="Badge shape" value={shape} onChange={setShape} options={SHAPE_OPTS} />
      </Section>
      <Section title="Mascot" className="mt-3">
        <div className="flex items-start gap-3">
          <Mascot m={{ ...mascot, color }} size={84} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Segmented<MascotKind> ariaLabel="Mascot species" value={mascot.kind} onChange={(kind) => setMascot((m) => ({ ...m, kind }))} options={(['bear', 'cat', 'robot', 'dragon', 'blob', 'bird'] as const).map((k) => ({ value: k, label: k[0]!.toUpperCase() + k.slice(1) }))} />
            <Segmented<MascotAcc> ariaLabel="Mascot accessory" value={mascot.acc} onChange={(acc) => setMascot((m) => ({ ...m, acc }))} options={(['none', 'cap', 'headphones', 'star', 'crown'] as const).map((k) => ({ value: k, label: k === 'none' ? 'Nothing' : k[0]!.toUpperCase() + k.slice(1) }))} />
            <p className="text-[11px] text-ink3">Your mascot wears the studio colour. It stars on the Mascot Statue in the office and on your studio card.</p>
          </div>
        </div>
      </Section>
      <Section title="Emblem" className="mt-3">
        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
          <button type="button" aria-pressed={!emblem} onClick={() => setEmblem(null)} className={cx('grid aspect-square place-items-center rounded-lg border text-xs font-bold', !emblem ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2')} title="Initials">
            Aa
          </button>
          {EMBLEMS.map((e) => (
            <button key={e} type="button" aria-pressed={emblem === e} aria-label={e} onClick={() => setEmblem(e)} className={cx('grid aspect-square place-items-center rounded-lg border', emblem === e ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink2 hover:bg-bg2')}>
              <Icon name={e} size={16} />
            </button>
          ))}
        </div>
      </Section>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save}>
          Save
        </Button>
      </div>
    </Modal>
  );
}

/** The Golden Pixel Gala, when you take home at least one award. */
function GalaModal({ year, onClose }: { year: number; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const reduce = prefersReducedMotion(useSettings.getState());
  const y = [...(s.awardHistory ?? [])].reverse().find((a) => a.year === year);
  const mine = y?.winners.filter((w) => w.mine) ?? [];
  if (!y || !mine.length) return null;
  const goty = y.winners.find((w) => w.category === 'Game of the Year');
  const others = y.winners.filter((w) => !w.mine).slice(0, 6);
  return (
    <Modal open onClose={onClose} title={`Golden Pixel Gala ${year}`}>
      {!reduce && <Confetti />}
      <div className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-gold/15 text-gold">
          <Icon name="trophy" size={32} />
        </div>
        <div className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-gold">Golden Pixel Gala</div>
        <h2 className="font-display text-2xl font-semibold">
          {mine.length === 1 ? 'You won an award!' : `You won ${mine.length} awards!`}
        </h2>
        <p className="mt-1 text-sm text-ink2">
          {goty?.mine ? `${goty.name} is the Game of the Year ${year}. The whole industry is talking about ${s.company.name}.` : `The industry celebrates the best games of ${year}, and ${s.company.name} is on stage.`}
        </p>
      </div>
      <ul className="mt-4 space-y-1.5">
        {mine.map((w) => (
          <li key={w.category} className="flex items-center gap-3 rounded-xl border border-gold/50 bg-gold/10 p-2.5 text-sm">
            <Icon name={w.category === 'Game of the Year' ? 'crown' : 'trophy'} size={18} className="shrink-0 text-gold" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{w.category}</span>
              <span className="text-xs text-ink2">
                {w.name} · {w.score}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <Section title="Other winners" className="mt-4">
          <ul className="text-xs text-ink2">
            {others.map((w) => (
              <li key={w.category} className="flex justify-between gap-2 border-b border-line py-1">
                <span>{w.category}</span>
                <span className="truncate text-right">
                  {w.name} <span className="text-ink3">({w.company})</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            onClose();
            useGame.getState().openPanel('news', 'awards');
          }}
        >
          All results
        </Button>
        <Button variant="primary" onClick={onClose}>
          Back to work
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
            {r.concept.expansionOf && s.releases[r.concept.expansionOf] && <Pill tone="tech">Expansion for {s.releases[r.concept.expansionOf]!.name}</Pill>}
            {r.concept.remasterOf && <Pill tone="gold">Remaster</Pill>}
            {r.modded && <Pill tone="tech">Mod support</Pill>}
            {r.crowdfund && (
              <span title={`${r.crowdfund.backers.toLocaleString('en-US')} backers pledged ${fmtMoney(r.crowdfund.raised)}${r.crowdfund.late > 0 ? ` · shipped ${Math.ceil(r.crowdfund.late / 30)} month(s) late` : ' · delivered on time'}`}>
                <Pill tone={r.crowdfund.late > 0 ? 'bad' : 'good'}>Crowdfunded</Pill>
              </span>
            )}
            {r.earlyAccess && (
              <span title={`${r.earlyAccess.weeks} weeks in Early Access · ${fmtUnits(r.earlyAccess.units)} copies sold before 1.0`}>
                <Pill tone="tech">Early Access graduate</Pill>
              </span>
            )}
            {r.numberOne && <Pill tone="gold">#1 chart-topper</Pill>}
            {r.classic && <Pill tone="gold">Hall of Classics {r.classic}</Pill>}
            {r.shadowDrop && <Pill tone="tech">Shadow drop</Pill>}
            {r.collection && (
              <span title={`Re-released together with ${r.collection.join(', ')}`}>
                <Pill tone="gold">Collection of {r.collection.length + 1}</Pill>
              </span>
            )}
            {r.delisted && <Pill tone="bad">Delisted</Pill>}
            {!r.delisted && licenceDue(r) !== null && (
              <span title="Licensed content: renew or let it be delisted when the licence runs out">
                <Pill>Licensed until {fromDay(licenceDue(r)!).year}</Pill>
              </span>
            )}
            {r.concept.priceTier === 'budget' && <Pill tone="good">Budget price</Pill>}
            {r.concept.priceTier === 'premium' && <Pill tone="gold">Premium price</Pill>}
            {r.documentary && (
              <span title={r.documentary.outcome ? undefined : `The documentary “Making ${r.name}” premieres ${formatDate(r.documentary.premiere)}`}>
                <Pill tone={!r.documentary.outcome ? 'neutral' : r.documentary.outcome === 'acclaimed' || r.documentary.outcome === 'warm' ? 'good' : r.documentary.outcome === 'mixed' ? 'neutral' : 'bad'}>
                  {!r.documentary.outcome ? 'Documentary in the edit' : { acclaimed: 'Acclaimed documentary', warm: 'Documentary: well liked', mixed: 'Documentary: mixed', cautionary: 'Documentary: a cautionary tale' }[r.documentary.outcome]}
                </Pill>
              </span>
            )}
            {r.featuredBy && <Pill tone="good">Featured by {r.featuredBy.join(' & ')}</Pill>}
            {r.coDev && <Pill tone="tech">Co-developed with {r.coDev.name} ({Math.round(r.coDev.share * 100)}%)</Pill>}
            {(r.copycats ?? 0) > 0 && (
              <span title={s.rivalGames.filter((g) => g.copycatOf === r.id).map((g) => `${g.name} (${s.rivals[g.company]?.name ?? g.company})`).join(', ') || undefined}>
                <Pill tone="bad">
                  {r.copycats} knock-off{r.copycats === 1 ? '' : 's'}
                </Pill>
              </span>
            )}
            {expansionsOf(s, r).released.length > 0 && <Pill tone="tech">{expansionsOf(s, r).released.length} expansion{expansionsOf(s, r).released.length > 1 ? 's' : ''}</Pill>}
            {profit < 0 && r.active && r.week < 26 ? (
              <span title={`Still selling: ${fmtMoney(r.net)} earned of a ${fmtMoney(r.devCost)} budget so far`}>
                <Pill>{Math.floor((r.net / Math.max(1, r.devCost)) * 100)}% of budget recouped</Pill>
              </span>
            ) : (
              <Pill tone={profit >= 0 ? 'good' : 'bad'}>
                {profit >= 0 ? 'Profit' : 'Loss'} {fmtMoney(Math.abs(profit))}
              </Pill>
            )}
            {r.awards.map((a) => (
              <Pill key={a} tone="gold">
                🏆 {a}
              </Pill>
            ))}
          </div>
        </div>
      </div>
      <PostMortemCard releaseId={releaseId} />
      <Section title="Weekly sales" className="mt-3">
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
      {r.regionMix && (
        <Section title="Players by region" right={<span className="text-xs text-ink3">{gameRegions(r.concept).length ? `Localised: ${gameRegions(r.concept).map((x) => REGION_BY_ID[x].short).join(', ')}` : 'Not localised'}</span>}>
          <ul className="space-y-1 text-xs">
            {REGIONS.map((rg) => {
              const v = r.regionMix![rg.id] ?? 0;
              return (
                <li key={rg.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0">{rg.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg2">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(v * 100)}%` }} />
                  </span>
                  <span className="num w-20 shrink-0 text-right text-ink2">{fmtUnits(r.units * v)}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      <AwardsSeason releaseId={releaseId} />
      <PostLaunch releaseId={releaseId} />
      <ReleaseBuzz releaseId={releaseId} />
      <Credits releaseId={releaseId} />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {!r.concept.remasterOf && !r.concept.expansionOf && r.score >= EXPANSION_MIN_SCORE && s.day - r.day < EXPANSION_MAX_AGE_YEARS * 365.25 && (
          <Button
            icon="layers"
            disabled={!!canExpand(s, r)}
            title={canExpand(s, r) ?? 'New content for owners of this game: about 40% of the work of a new game, sold at a lower price mostly to people who own it — and it brings lapsed players back'}
            onClick={() => {
              useGame.setState((g) => ({ wizardPreset: { expansionOf: r.id }, wizardNonce: g.wizardNonce + 1 }));
              onClose();
              useGame.getState().openPanel('develop', 'new');
            }}
          >
            Expansion…
          </Button>
        )}
        {!r.concept.remasterOf && !r.concept.expansionOf && r.score >= 70 && (
          <Button
            icon="sparkle"
            disabled={!!canRemaster(s, r)}
            title={canRemaster(s, r) ?? 'Rebuild this classic for modern hardware: about half the work of a new game, sold to a nostalgic audience'}
            onClick={() => {
              useGame.setState((g) => ({ wizardPreset: { remasterOf: r.id }, wizardNonce: g.wizardNonce + 1 }));
              onClose();
              useGame.getState().openPanel('develop', 'new');
            }}
          >
            Remaster…
          </Button>
        )}
        {r.concept.franchiseId && s.franchises[r.concept.franchiseId] && (
          <Button
            variant="primary"
            icon="chain"
            onClick={() => {
              useGame.setState((g) => ({ wizardPreset: { franchiseId: r.concept.franchiseId! }, wizardNonce: g.wizardNonce + 1 }));
              onClose();
              useGame.getState().openPanel('develop', 'new');
            }}
          >
            Plan a sequel
          </Button>
        )}
      </div>
    </Modal>
  );
}

function AwardsSeason({ releaseId }: { releaseId: string }) {
  const s = useGame((g) => g.s)!;
  const r = s.releases[releaseId];
  const yr = fromDay(s.day).year;
  if (!r || fromDay(r.day).year !== yr || r.score < CAMPAIGN_MIN_SCORE || r.concept.remasterOf || r.concept.expansionOf) return null;
  const why = campaignBlocked(s, r);
  const backing = campaignFor(s) === r.id;
  // the competition so far this year
  const rivals = s.rivalGames.filter((g) => fromDay(g.day).year === yr && g.day <= s.day && !g.publishedByPlayer);
  const top = [...rivals].sort((a, b) => b.score - a.score)[0];
  const genreTop = rivals.filter((g) => g.genre === r.concept.genre).sort((a, b) => b.score - a.score)[0];
  const name = (g: (typeof rivals)[number]) => `${g.name} (${s.rivals[g.company]?.name ?? COMPANY_BY_ID[g.company]?.name ?? g.company}, ${g.score})`;
  return (
    <Section title="Awards season">
      <p className="text-xs text-ink2">
        The Golden Pixel Gala is on New Year’s Day. Game of the Year needs 85+ and to beat every rival; Best {GENRE_BY_ID[r.concept.genre].name} needs 80+ and to beat the genre.
        {top && <> Front-runner so far: <b>{name(top)}</b>.</>}
        {genreTop && genreTop !== top && <> Best {genreWord(GENRE_BY_ID[r.concept.genre].name)} rival: <b>{name(genreTop)}</b>.</>}
        {!rivals.length && ' No rival has released anything notable yet this year.'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {backing ? (
          <Pill tone="gold">Campaigning for the gala (+{CAMPAIGN_BOOST} with the jury)</Pill>
        ) : (
          <Button size="sm" icon="trophy" disabled={!!why} title={why ?? undefined} onClick={() => useGame.getState().actOrToast({ type: 'awardsCampaign', releaseId }, `Awards campaign launched for ${r.name}`)}>
            Run an awards campaign · {fmtMoney(campaignCost(s))}
          </Button>
        )}
        {!backing && <span className="text-[11px] text-ink3">{why ?? `+${CAMPAIGN_BOOST} with the jury — enough to tip a close race, not to win a hopeless one. One a year.`}</span>}
      </div>
    </Section>
  );
}

function PostMortemCard({ releaseId }: { releaseId: string }) {
  const r = useGame((g) => g.s!.releases[releaseId]);
  useGame((g) => g.v); // re-render as the game sells (the release is mutated in place)
  const pm = r ? postMortem(r) : null;
  if (!pm) return null;
  const col = (title: string, pts: typeof pm.right, good: boolean) => (
    <div className="min-w-0">
      <div className={cx('mb-1 text-[11px] font-bold uppercase tracking-wide', good ? 'text-good' : 'text-bad')}>{title}</div>
      {pts.length ? (
        <ul className="space-y-1.5">
          {pts.map((p) => (
            <li key={p.text} className="flex gap-1.5 text-xs leading-snug">
              <span aria-hidden className={cx('mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full', good ? 'bg-good' : 'bg-bad')} />
              <span className="min-w-0">
                <span className="text-ink">{p.text}</span>
                {p.lesson && <span className="block text-ink3">Next time: {p.lesson}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink3">{good ? 'Nothing stood out.' : 'Nothing worth worrying about.'}</p>
      )}
    </div>
  );
  return (
    <Section title="Post-mortem" className="mt-4">
      <div className="grid gap-3 rounded-xl border border-line bg-bg2/40 p-3 sm:grid-cols-2">
        <p className={cx('font-display text-sm font-semibold sm:col-span-2', pm.tone === 'good' ? 'text-good' : pm.tone === 'bad' ? 'text-bad' : 'text-ink')}>{pm.verdict}</p>
        {col('What went right', pm.right, true)}
        {col('What went wrong', pm.wrong, false)}
      </div>
    </Section>
  );
}

function Credits({ releaseId }: { releaseId: string }) {
  const s = useGame((g) => g.s)!;
  const r = s.releases[releaseId];
  if (!r?.credits?.length) return null;
  const byRole = new Map<string, NonNullable<typeof r.credits>>();
  for (const c of r.credits) byRole.set(c.role, [...(byRole.get(c.role) ?? []), c]);
  const order = ['founder', 'producer', 'designer', 'programmer', 'artist', 'audio', 'writer', 'qa', 'marketer'];
  const roles = [...byRole.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <Section title="Credits">
      <div className="rounded-xl bg-[#14161b] px-4 py-3 text-center text-[#e9e4dc]">
        <div className="font-display text-sm font-semibold tracking-[0.2em] text-[#f2c450]">{r.name.toUpperCase()}</div>
        <div className="mb-2 text-[10px] uppercase tracking-widest opacity-60">a {s.company.name} production</div>
        {roles.map((role) => (
          <div key={role} className="mb-1.5">
            <div className="text-[10px] uppercase tracking-widest opacity-60">{role === 'founder' ? 'Studio founder' : `${ROLE_NAMES[role as keyof typeof ROLE_NAMES] ?? role}${byRole.get(role)!.length > 1 ? 's' : ''}`}</div>
            {byRole.get(role)!.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!s.staff[c.id]}
                onClick={() => useGame.getState().openModalNow({ kind: 'staff', staffId: c.id })}
                className="block w-full text-sm enabled:hover:underline disabled:opacity-70"
                title={s.staff[c.id] ? 'Open their card' : 'No longer at the studio'}
              >
                {c.name}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

function ReleaseBuzz({ releaseId }: { releaseId: string }) {
  const s = useGame((g) => g.s)!;
  const r = s.releases[releaseId];
  if (!r) return null;
  const posts = releaseBuzz(s, r, 30);
  if (!posts.length) return null;
  return (
    <Section title="What players are saying">
      <div className="mb-2">
        <BuzzMeter posts={posts} />
      </div>
      <BuzzList posts={posts.slice(0, 6)} showGame={false} />
    </Section>
  );
}

function Shipped({ staffId }: { staffId: string }) {
  const s = useGame((g) => g.s)!;
  const games = s.releaseOrder.map((id) => s.releases[id]!).filter((r) => r?.credits?.some((c) => c.id === staffId));
  if (!games.length) return null;
  return (
    <Section title={`Credits (${games.length})`}>
      <ul className="space-y-0.5 text-xs">
        {games
          .slice(-8)
          .reverse()
          .map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold hover:underline" onClick={() => useGame.getState().openModalNow({ kind: 'release', releaseId: r.id })}>
                {r.name}
              </button>
              <span className="text-ink3">{fromDay(r.day).year}</span>
              <span className={cx('num w-7 text-right font-semibold', r.score >= 80 ? 'text-good' : r.score < 50 ? 'text-bad' : '')}>{r.score}</span>
            </li>
          ))}
      </ul>
    </Section>
  );
}

function Mentorship({ staffId }: { staffId: string }) {
  const s = useGame((g) => g.s)!;
  const st = s.staff[staffId];
  if (!st) return null;
  const mentees = menteesOf(s, staffId);
  const canHave = st.level === 'junior' || st.level === 'mid';
  if (!canHave && !mentees.length) return null;
  const mentor = st.mentorId ? s.staff[st.mentorId] : undefined;
  const options = canHave ? Object.values(s.staff).filter((m) => !mentorBlocked(s, st, m) || m.id === st.mentorId) : [];
  return (
    <Section title="Mentorship">
      {canHave && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ink3">Mentor</span>
          <select
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-panel2 px-2"
            value={mentor?.id ?? ''}
            aria-label="Mentor"
            onChange={(e) => useGame.getState().actOrToast({ type: 'setMentor', staffId, mentorId: e.target.value || null }, e.target.value ? 'Mentorship started' : 'Mentorship ended')}
          >
            <option value="">{options.length ? 'No mentor' : 'No one eligible yet'}</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.level === 'lead' ? 'lead' : m.role === 'founder' ? 'founder' : 'senior'})
              </option>
            ))}
          </select>
        </div>
      )}
      {mentees.length > 0 && (
        <p className="text-xs text-ink2">
          Mentoring{' '}
          {mentees.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ', '}
              <button type="button" className="font-semibold hover:underline" onClick={() => useGame.getState().openModalNow({ kind: 'staff', staffId: m.id })}>
                {m.name}
              </button>
            </span>
          ))}{' '}
          (−{mentees.length * 3}% output)
        </p>
      )}
      <p className="mt-1 text-[11px] text-ink3">A senior in the same craft speeds up a junior’s growth (+40% learning) and they grow close; the mentor gives up 3% output per mentee (up to three).</p>
    </Section>
  );
}

/** Book this person's conference talk (one per studio per year). */
function CheckInSection({ staffId }: { staffId: string }) {
  const s = useGame((g) => g.s)!;
  const st = s.staff[staffId];
  if (!st || st.role === 'founder') return null;
  const why = checkInBlocked(s, st);
  const left = Math.max(0, checkInLimit(s) - checkInsUsed(s));
  return (
    <Section
      title="One-on-one"
      right={<span className="text-[11px] text-ink3">{left} of {checkInLimit(s)} left this month</span>}
    >
      {st.checkIn && (
        <blockquote className="mb-2 rounded-xl bg-bg2/60 px-3 py-2 text-xs italic text-ink2">
          “{st.checkIn.line}”<span className="ml-1 not-italic text-ink3">— {formatDate(st.checkIn.day)}</span>
        </blockquote>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon="user" disabled={!!why} title={why ?? undefined} onClick={() => useGame.getState().actOrToast({ type: 'checkIn', staffId }, `You sat down with ${st.name.split(' ')[0]}`)}>
          Check in
        </Button>
        <span className="text-[11px] text-ink3">{why ?? 'Ask how they’re really doing. They’ll tell you what’s on their mind — and feel heard.'}</span>
      </div>
    </Section>
  );
}

function TalkSection({ staffId }: { staffId: string }) {
  const s = useGame((g) => g.s)!;
  const st = s.staff[staffId];
  const games = st ? talkableGames(s, st) : [];
  const [pick, setPick] = useState('');
  if (!st || fromDay(s.day).year < TALK_YEAR || (st.role !== 'founder' && st.level !== 'senior' && st.level !== 'lead') || !games.length) return null;
  const rel = games.find((r) => r.id === pick) ?? games[0]!;
  const why = talkBlocked(s, st);
  return (
    <Section title="Conference talk">
      <div className="flex flex-wrap items-center gap-1.5">
        <select className={inputCls + ' max-w-[13rem] py-1 text-xs'} value={rel.id} onChange={(e) => setPick(e.target.value)} aria-label="Game to talk about">
          {games.slice(0, 12).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({Math.round(r.score)})
            </option>
          ))}
        </select>
        <Button size="sm" icon="megaphone" disabled={!!why} title={why ?? undefined} onClick={() => useGame.getState().actOrToast({ type: 'giveTalk', staffId, releaseId: rel.id }, `${st.name} is off to the Developers Summit 🎤`)}>
          Give the talk
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-ink3">
        “{talkTitle(st, rel)}” — one speaking slot per studio each year ({fmtMoney(talkCost(s))}, {TALK_AWAY_DAYS} days away). A good talk builds reputation and brings better job applicants for three months; a standing ovation also puts {st.name.split(' ')[0]} in front of rival recruiters. Flops make great post-mortems.
      </p>
      {why && s.company.lastTalkDay !== undefined && s.day - s.company.lastTalkDay < 300 && <p className="mt-0.5 text-[11px] text-ink3">This year’s slot is used — the next one opens {formatDate(s.company.lastTalkDay + 300)}.</p>}
    </Section>
  );
}

function Relationships({ staffId }: { staffId: string }) {
  const s = useGame((g) => g.s)!;
  const list = relationsOf(s, staffId).filter((r) => Math.abs(r.v) >= 15).slice(0, 5);
  if (!s.staff[staffId]) return null;
  const label = (v: number) => (v >= BEST_FRIENDS ? 'Best friends' : v >= 25 ? 'Friends' : v > -15 ? 'Colleagues' : v > FEUD ? 'Tension' : 'Feud');
  return (
    <Section title="Relationships">
      <p className="mb-1.5 text-xs text-ink2">
        {hobbyOf(staffId).emoji} Into {hobbyOf(staffId).name.toLowerCase()} · 🎮 loves {GENRE_BY_ID[favouriteGenre(staffId)].name} games
        {lifeLine(s, s.staff[staffId]!) && <> · ❤️ {lifeLine(s, s.staff[staffId]!)}</>}
      </p>
      {(s.staff[staffId]!.honours ?? []).length > 0 && <p className="mb-1.5 text-xs text-gold">🏆 {s.staff[staffId]!.honours!.join(' · ')}</p>}
      <ul className="space-y-1 text-xs">
        {list.map(({ other, v }) => (
          <li key={other.id} className="flex items-center gap-2">
            <button type="button" className="w-28 shrink-0 truncate text-left font-semibold hover:underline" onClick={() => useGame.getState().openModalNow({ kind: 'staff', staffId: other.id })}>
              {other.name}
            </button>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-bg2">
              <span className={cx('absolute top-0 h-full rounded-full', v >= 0 ? 'left-1/2 bg-good' : 'right-1/2 bg-bad')} style={{ width: `${Math.abs(v) / 2}%` }} />
            </span>
            <span className={cx('w-20 shrink-0 text-right', v >= 25 ? 'text-good' : v <= -15 ? 'text-bad' : 'text-ink3')}>{label(v)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-ink3">People grow close working on the same project. Best friends on a team lift morale and chemistry; a feud drags both down.</p>
    </Section>
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
        Decide where the team puts its effort for the next phase. {learned ? 'Gold marks show what worked for this genre before.' : `You haven't shipped ${aOrAn(GENRE_BY_ID[p.concept.genre].name)} game yet — think about what players of this genre care about.`}
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
            {st.intern ? `summer intern (until ${formatDate(st.intern.until, false)})` : st.level} {ROLE_NAMES[st.role]}
            {st.spec && ` · ${SPECS.find((x) => x.id === st.spec)?.label}`} · since {fromDay(st.hiredDay).year} · {st.gamesShipped} games shipped
            {retirementDay(st) !== null && retirementDay(st)! - s.day < 5 * 365 && ` · retires around ${fromDay(retirementDay(st)!).year}`}
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
              <Tip className="w-full" content={<BreakdownList bd={morale} format={(v) => v.toFixed(1)} title="What drives their morale" />}>
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
          {st.ambition && (
            <Section title="Ambition">
              <div className="rounded-xl border border-gold/40 bg-gold/10 p-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <Icon name="star" size={15} className="mt-0.5 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{ambitionText(st, st.ambition)}</div>
                    <div className="text-ink2">{ambitionHint(st.ambition)}</div>
                    <div className={cx('num mt-0.5', st.ambition.until - s.day < 30 ? 'font-semibold text-bad' : 'text-ink3')}>
                      {Math.max(0, st.ambition.until - s.day)} days left · fulfilled: loyalty +{AMBITION_REWARD.loyalty}, morale +{AMBITION_REWARD.morale} · ignored: loyalty {AMBITION_PENALTY.loyalty}
                    </div>
                  </div>
                </div>
                {st.ambition.kind === 'raise' && st.salary < (st.ambition.target ?? 0) && (
                  <Button size="sm" className="mt-2" onClick={() => run({ type: 'setSalary', staffId, salary: Math.max(st.salary, st.ambition!.target!) }, 'Raise given')}>
                    Give the raise ({fmtMoney(st.ambition.target!)}/yr)
                  </Button>
                )}
                {st.ambition.kind === 'research' && st.assignment.kind !== 'research' && (
                  <Button size="sm" className="mt-2" onClick={() => run({ type: 'assign', staffId, to: 'research' }, `${st.name} joins research`)}>
                    Move to research
                  </Button>
                )}
                {st.ambition.kind === 'holiday' && (
                  <Button size="sm" className="mt-2" disabled={!!vacationBlocked(s, st)} title={vacationBlocked(s, st) ?? undefined} onClick={() => run({ type: 'vacation', staffId, days: 14 }, `${st.name} is off for two weeks`)}>
                    Two weeks off
                  </Button>
                )}
              </div>
            </Section>
          )}
          {(st.eotmCount ?? 0) > 0 && <div className="mb-1 text-[11px] text-gold">⭐ Employee of the Month ×{st.eotmCount}{s.eotm?.id === st.id ? ' (this month)' : ''}</div>}
          {(st.dreamsMet ?? 0) > 0 && <div className="mb-2 text-[11px] text-gold">★ {st.dreamsMet} ambition{st.dreamsMet === 1 ? '' : 's'} fulfilled here</div>}
          <Mentorship staffId={staffId} />
          <Relationships staffId={staffId} />
          <Shipped staffId={staffId} />
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
                    {k === 'qa' ? 'QA' : k} ({Math.round(st.skills[k])})
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => run({ type: 'train', staffId, skill }, 'Training started')} disabled={!s.research.done.includes('biz_training') || st.assignment.kind === 'training'} title={s.research.done.includes('biz_training') ? '4 weeks off work, +~8 skill' : 'Research the Training Programme first'}>
                Train
              </Button>
            </div>
          </Section>
          <CheckInSection staffId={staffId} />
          <TalkSection staffId={staffId} />
          <Section title="Time off">
            {(st.vacationDays ?? 0) > 0 ? (
              <p className="text-xs text-ink2">
                {st.leave === 'parental' ? 'On parental leave 👶' : st.leave === 'honeymoon' ? 'On honeymoon 💍' : st.leave === 'conference' ? 'At the Developers Summit 🎤' : st.sabbatical ? 'On sabbatical' : 'On vacation'} — back in {st.vacationDays} day{st.vacationDays === 1 ? '' : 's'}.
              </p>
            ) : (
              <>
                <div className="flex gap-1.5">
                  {([7, 14] as const).map((d) => (
                    <Button key={d} size="sm" disabled={!!vacationBlocked(s, st)} title={vacationBlocked(s, st) ?? undefined} onClick={() => run({ type: 'vacation', staffId, days: d }, `${st.name} is off for ${d === 7 ? 'a week' : 'two weeks'}`)}>
                      {d === 7 ? '1 week' : '2 weeks'}
                    </Button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-ink3">Paid leave: energy refills, burnout drops fast, loyalty rises. Their project slows while they’re away.</p>
                {s.day - st.hiredDay >= SABBATICAL.tenureYears * 365 && st.role !== 'founder' && (
                  <Button size="sm" className="mt-2" icon="leaf" disabled={!!sabbaticalBlocked(s, st)} title={sabbaticalBlocked(s, st) ?? 'Two months away; they come back with +4 skill, +3 potential and +10 loyalty'} onClick={() => run({ type: 'sabbatical', staffId }, `${st.name} is off on a sabbatical`)}>
                    Sabbatical (2 months)
                  </Button>
                )}
              </>
            )}
          </Section>
          {(st.level === 'senior' || st.level === 'lead' || st.role === 'founder') && !st.spec && (
            <Section title="Specialise">
              <div className="grid gap-1">
                {SPECS.map((sp) => (
                  <button key={sp.id} type="button" onClick={() => run({ type: 'setSpec', staffId, spec: sp.id }, `${st.name} is now ${aOrAn(sp.label)}`)} className="rounded-lg border border-line px-2 py-1.5 text-left text-xs hover:bg-bg2">
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
  const scenarioEnd = !!s.scenario?.result && !!s.endReason?.startsWith('Scenario');
  const ending = scenarioEnd && s.scenario?.result === 'won' ? 'Scenario won' : scenarioEnd ? 'Scenario failed' : s.status === 'bankrupt' ? 'Bankrupt' : s.status === 'acquired' ? 'Sold' : 'Retired';
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
      ...(s.cheatsUsed ? { cheats: true } : {}),
    });
  }, [user, s, ending, score]);
  const storyEnd = s.status === 'retired' && (s.endReason?.startsWith('The story') || s.endReason?.startsWith('Scenario'));
  return (
    <Modal open title="The end" dismissable={false}>
      <div className="text-center">
        <div className={cx('mx-auto grid size-16 place-items-center rounded-2xl', s.status === 'bankrupt' ? 'bg-bad/15 text-bad' : 'bg-gold/20 text-gold')}>
          <Icon name={s.status === 'bankrupt' ? 'skull' : 'trophy'} size={32} />
        </div>
        <h2 className="mt-3 font-display text-2xl font-semibold">{scenarioEnd && s.scenario?.result === 'won' ? 'Scenario complete!' : scenarioEnd ? 'Out of time' : storyEnd ? 'You made it to the present day!' : ending}</h2>
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
        <EndingHighlights />
        <div className="mt-3">
          <StudioStory open />
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
            {scenarioEnd ? 'Keep playing' : 'Continue in endless mode'}
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
            openPanel('finance', 'overview');
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
  const yr = fromDay(n.day).year;
  const era = yr < 1995 ? 'paper' : yr < 2008 ? 'tabloid' : 'web';
  const mine = n.category === 'studio';
  return (
    <Modal open onClose={onClose} title="Breaking news">
      {era === 'paper' && (
        <article className="mt-7 rounded-md border border-[#cfc6b3] bg-[#f6f0e2] p-4 text-[#2a2622] shadow-inner" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          <div className="border-b-4 border-double border-[#2a2622] pb-1 text-center text-3xl font-bold tracking-tight">The Gaming Times</div>
          <div className="flex justify-between border-b border-[#2a2622] py-0.5 text-[10px] uppercase tracking-widest">
            <span>{formatDate(n.day)}</span>
            <span>Late edition · 25¢</span>
          </div>
          <h2 className="mt-3 text-center text-3xl font-bold uppercase leading-tight">{n.headline}</h2>
          <div className="mt-3 flex gap-3">
            {mine && <CompanyBadge className="shrink-0" name={s.company.name} color={s.company.color} emblem={s.company.logo?.emblem} shape={s.company.logo?.shape} size={64} />}
            {n.body && <p className="text-sm leading-relaxed [column-gap:1rem] sm:columns-2">{n.body}</p>}
          </div>
        </article>
      )}
      {era === 'tabloid' && (
        <article className="mt-7 overflow-hidden rounded-xl bg-[#111] text-white">
          <div className="flex items-center justify-between bg-[#d8323c] px-3 py-1.5">
            <span className="text-2xl font-black italic tracking-tight">PIXEL WEEKLY</span>
            <span className="text-[10px] font-bold uppercase">{formatDate(n.day, false)} · Special issue</span>
          </div>
          <div className="flex gap-3 p-4">
            {mine && <CompanyBadge className="shrink-0" name={s.company.name} color={s.company.color} emblem={s.company.logo?.emblem} shape={s.company.logo?.shape} size={72} />}
            <div>
              <span className="rounded bg-[#f2c450] px-1.5 py-0.5 text-[10px] font-black uppercase text-black">Exclusive!</span>
              <h2 className="mt-1 text-2xl font-black uppercase leading-tight">{n.headline}</h2>
              {n.body && <p className="mt-1 text-sm text-white/80">{n.body}</p>}
            </div>
          </div>
        </article>
      )}
      {era === 'web' && (
        <article className="mt-7 overflow-hidden rounded-xl border border-line bg-panel2">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="grid size-6 place-items-center rounded-md bg-accent text-xs font-black text-accent-ink">G</span>
            <span className="font-display text-sm font-semibold">GameWire</span>
            <span className="ml-auto rounded-full bg-bad/15 px-2 py-0.5 text-[10px] font-bold uppercase text-bad">● Live</span>
          </div>
          <div className="flex gap-3 p-4">
            {mine && <CompanyBadge className="shrink-0" name={s.company.name} color={s.company.color} emblem={s.company.logo?.emblem} shape={s.company.logo?.shape} size={64} />}
            <div className="min-w-0">
              <div className="text-[11px] text-ink3">{formatDate(n.day)} · {mine ? 'Studios' : 'Industry'}</div>
              <h2 className="mt-0.5 font-display text-2xl font-semibold leading-tight">{n.headline}</h2>
              {n.body && <p className="mt-1 text-sm text-ink2">{n.body}</p>}
              <div className="mt-2 text-[11px] text-ink3">♥ {((2 + (n.id % 9)) * 1.3).toFixed(1)}k · ↻ {(n.id % 7) + 1}k shares</div>
            </div>
          </div>
        </article>
      )}
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
    ['O', 'Studio overview (what needs attention)'],
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
    ['` (backtick)', 'Cheats'],
    ['W A S D / arrows', 'Pan the office'],
    ['+ / − / 0', 'Zoom in / out / fit'],
    ['Ctrl + Z', 'Undo today’s last placement (build mode, full refund)'],
    ['P', 'Office photo'],
    ['V', 'Cinematic mode (the camera wanders the office)'],
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
  const [portChoice, setPort] = useState(ports[0]?.id ?? '');
  const [bundle, setBundle] = useState<string[]>([]);
  const classics = Object.values(s.releases).filter((b) => b.id !== releaseId && !rereleaseBlocked(s, b)).sort((a, b) => b.score - a.score);
  const bundled = bundle.map((id) => s.releases[id]).filter((b): b is NonNullable<typeof b> => !!b && classics.includes(b));
  const port = ports.some((p) => p.id === portChoice) ? portChoice : (ports[0]?.id ?? '');
  const patchWhy = canPatch(s, r);
  const saleWhy = canRunSale(s, r);
  const showSale = r.concept.monetization === 'premium' || r.concept.monetization === 'premium_dlc';
  const tooOld = s.day - r.day > 365 * 4;
  const isLive = r.concept.monetization === 'subscription' || r.concept.monetization === 'f2p' || r.concept.monetization === 'live_service';
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
          {tooOld && ports.length && !rereleaseBlocked(s, r) ? (
            <div className="mt-2">
              <p className="text-ink3">A classic now: re-release it on a modern storefront for a nostalgic audience (once).</p>
              <div className="mt-1.5 flex gap-2">
                <select className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-panel2 px-2" value={port} onChange={(e) => setPort(e.target.value)} aria-label="Re-release on">
                  {ports.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" icon="sparkle" disabled={!port} onClick={() => run({ type: 'rerelease', releaseId, platform: port, bundle: bundled.map((b) => b.id) }, bundled.length ? `The ${r.name} Collection is out!` : `${r.name} is back!`)}>
                  {bundled.length ? 'Release collection' : 'Re-release'} · {fmtMoney(rereleaseCost(s, r) + bundleCost(s, bundled))}
                </Button>
              </div>
              {classics.length > 0 && (
                <div className="mt-2">
                  <p className="text-ink3">Or bundle other classics into a collection (up to {MAX_BUNDLE}): more buyers for each loved game added — and they all count as re-released.</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {classics.slice(0, 10).map((b) => {
                      const on = bundle.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          aria-pressed={on}
                          disabled={!on && bundled.length >= MAX_BUNDLE}
                          onClick={() => setBundle((x) => (on ? x.filter((y) => y !== b.id) : [...x, b.id]))}
                          className={cx('rounded-full border px-2 py-0.5 text-[11px] transition disabled:opacity-40', on ? 'border-accent bg-accent text-accent-ink' : 'border-line hover:bg-bg2')}
                        >
                          {b.name} ({Math.round(b.score)})
                        </button>
                      );
                    })}
                  </div>
                  {bundled.length > 0 && <p className="mt-1 text-ink3">About {Math.round((bundleMul(bundled) - 1) * 100)}% more buyers than {r.name} alone.</p>}
                </div>
              )}
            </div>
          ) : tooOld || !ports.length || r.concept.monetization === 'subscription' ? (
            <p className="mt-2 text-ink3">{r.concept.monetization === 'subscription' ? 'Subscription games can’t be ported.' : tooOld ? (r.rereleased ? 'Already re-released as a classic.' : rereleaseBlocked(s, r) ?? 'Too old to port profitably.') : 'No other platforms available.'}</p>
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
        {isLive && (
          <div className="rounded-xl border border-line p-3 text-xs sm:col-span-2">
            <div className="text-sm font-semibold">Live event</div>
            <p className="mt-0.5 text-ink3">
              Limited-time content brings players back: about a month of live income now for +{Math.round((liveEventBoost(s, r) - 1) * 100)}% for three months. Well-loved games gain the most; players tire of back-to-back events.
              {r.liveEvent && s.day <= r.liveEvent.until ? ` The ${r.liveEvent.name} runs until ${formatDate(r.liveEvent.until)}.` : ''} {r.liveEvents ? `Events so far: ${r.liveEvents}.` : ''}
            </p>
            <Button size="sm" className="mt-2" icon="sparkle" disabled={!!liveEventBlocked(s, r)} title={liveEventBlocked(s, r) ?? undefined} onClick={() => run({ type: 'liveEvent', releaseId }, `The ${liveEventName(s.day)} is live!`)}>
              {liveEventBlocked(s, r) ?? `Run the ${liveEventName(s.day)} · ${fmtMoney(liveEventCost(s, r))}`}
            </Button>
          </div>
        )}
        {showSale && (
          <div className="rounded-xl border border-line p-3 text-xs sm:col-span-2">
            <div className="text-sm font-semibold">Storefront sale</div>
            <p className="mt-0.5 text-ink3">
              Discount it for a burst of sales. Deeper cuts sell more copies (and win more fans) but earn less per copy, and each sale draws a little less than the last. {r.saleCount ? `Sales so far: ${r.saleCount}.` : ''}
            </p>
            {saleWhy ? (
              <p className="mt-2 text-ink3">{saleWhy}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {SALE_DISCOUNTS.map((d) => {
                  const units = saleForecast(s, r, d);
                  return (
                    <Button key={d} size="sm" icon="coin" title={`About ${fmtUnits(units)} extra copies at ${fmtMoney(r.price * (1 - d))} each`} onClick={() => run({ type: 'runSale', releaseId, discount: d }, `${r.name} is ${Math.round(d * 100)}% off`)}>
                      {Math.round(d * 100)}% off · ~{fmtUnits(units)}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

/** Extra lines for the ending screen: the empire's biggest achievements. */
function EndingHighlights() {
  const s = useGame((g) => g.s)!;
  const st = s.progress.stats;
  const hwUnits = (s.hardware ?? []).reduce((t, h) => t + h.unitsSold, 0);
  const lines: string[] = [];
  if (st.totalUnits > 0) lines.push(`${fmtUnits(st.totalUnits)} games sold`);
  if (st.awardsWon > 0) lines.push(`${st.awardsWon} Golden Pixel award${st.awardsWon > 1 ? 's' : ''}`);
  if (hwUnits > 0) lines.push(`${fmtUnits(hwUnits)} consoles sold`);
  if (s.subscription && s.subscription.peak > 0) lines.push(`${fmtUnits(s.subscription.peak)} pass subscribers at peak`);
  if (st.peakValuation > 0) lines.push(`peak valuation ${fmtMoney(st.peakValuation)}`);
  if (!lines.length) return null;
  return <p className="mt-3 text-xs text-ink2">{lines.join(' · ')}</p>;
}
