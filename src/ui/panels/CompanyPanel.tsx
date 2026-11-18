import { useState } from 'react';
import { MOD_BUDGET, communityBlocked, communityCost, communityPledgeMul, communityUserBonus, hubName } from '@/sim/systems/community';
import { MEDIA, MEDIA_KINDS, mediaBlocked, mediaFee } from '@/sim/systems/media';
import { fanConBlocked, fanConCost, negotiateOdds } from '@/sim/actions';
import { COMPANY_BY_ID } from '@/data/companies';
import { GENRE_BY_ID } from '@/data/genres';
import { TRADE_SHOWS } from '@/data/marketing';
import type { GenreId } from '@/data/types';
import { fromDay, formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits, inflation, money, repGain } from '@/sim/util';
import { fundingAmount, fundingBlocked, ipoEligible, nextFunding, valuation, controlAfterOffering, offeringBlocked } from '@/sim/systems/finance';
import { LineChart } from '../charts';
import { Button, ConfirmButton, Empty, Pill, Section, Segmented, Stat, cx } from '../components/ui';
import { CompanyBadge } from '../art/CompanyBadge';
import { useGame } from '../store';
import { fmtSharePrice } from '../game/format';
import { MAX_SUBSIDIARIES, ownedStudios } from '@/sim/systems/offers';
import { Icon } from '../icons';
import { LABEL_SHARE, LABEL_TIERS, dealAdvance, labelBlocked, signableIndies, talentStars, type DealTier } from '@/sim/systems/publishing';
import { SHOWCASE_MIN_REP, SHOWCASE_MIN_YEAR, showcaseBlocked, showcaseCost, showcaseHype, showcaseName } from '@/sim/systems/showcase';
import { HistoryTab } from './HistoryTab';
import { YearbookTab } from './YearbookTab';
import { SubscriptionTab } from './SubscriptionTab';
import { EsportsTab } from './EsportsTab';
import { CultureTab } from './CultureTab';

export default function CompanyPanel() {
  const tab = useGame((g) => g.panelTab) ?? 'publishing';
  useGame((g) => g.v);
  const setTab = (t: string) => useGame.setState({ panelTab: t });
  return (
    <div>
      <Segmented
        ariaLabel="Company sections"
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: 'culture', label: 'Culture' },
          { value: 'publishing', label: 'Publishing' },
          { value: 'stock', label: 'Stock' },
          { value: 'acquire', label: 'Acquisitions' },
          { value: 'ip', label: 'IP' },
          { value: 'pass', label: 'Pass' },
          { value: 'esports', label: 'Esports' },
          { value: 'history', label: 'History' },
          { value: 'yearbook', label: 'Yearbook' },
          { value: 'community', label: 'Community' },
        ]}
      />
      {tab === 'culture' && <CultureTab />}
      {tab === 'publishing' && <Publishing />}
      {tab === 'stock' && <Stock />}
      {tab === 'acquire' && <Acquire />}
      {tab === 'ip' && <IP />}
      {tab === 'pass' && <SubscriptionTab />}
      {tab === 'esports' && <EsportsTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'yearbook' && <YearbookTab />}
      {tab === 'community' && <CommunityTab />}
    </div>
  );
}

/** Fund and publish games by indie studios. */
function Label() {
  const s = useGame((g) => g.s)!;
  const why = labelBlocked(s);
  const deals = [...(s.publishingDeals ?? [])].reverse();
  const indies = signableIndies(s).slice(0, 5);
  if (!s.research.done.includes('biz_self_publishing')) return null;
  return (
    <Section title="Your publishing label">
      <p className="mb-2 text-xs text-ink3">
        Fund an indie studio’s next game. You pay the advance now; when it ships you get {Math.round(LABEL_SHARE * 100)}% of its revenue over six months. Talent and budget make better games — but there are no guarantees.
      </p>
      {deals.length > 0 && (
        <ul className="mb-2 space-y-1">
          {deals.slice(0, 6).map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg bg-bg2/60 px-2.5 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">
                <b>{d.gameName ?? `${GENRE_BY_ID[d.genre]?.name ?? ''} game`}</b> · {d.studio} · {LABEL_TIERS[d.tier].label.toLowerCase()} budget
              </span>
              {d.status === 'dev' ? (
                <Pill tone="tech">ships ~{formatDate(d.releaseDay, false)}</Pill>
              ) : d.gameName === undefined ? (
                <Pill tone="bad">studio closed · {fmtMoney(d.advance)} lost</Pill>
              ) : (
                <>
                  <Pill tone={(d.score ?? 0) >= 75 ? 'good' : (d.score ?? 0) < 55 ? 'bad' : 'neutral'}>{d.score}</Pill>
                  <span className={cx('num w-24 text-right', d.earned >= d.advance ? 'text-good' : 'text-ink2')}>
                    {fmtMoney(d.earned)} / {fmtMoney(d.advance)}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {why ? (
        <p className="text-[11px] text-ink3">{why}</p>
      ) : indies.length === 0 ? (
        <p className="text-[11px] text-ink3">No indie studios are looking for a publisher right now. Check back next month.</p>
      ) : (
        <ul className="space-y-1.5">
          {indies.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 text-xs">
              <CompanyBadge name={r.name} color={r.color} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{r.name}</div>
                <div className="truncate text-ink3">
                  {'★'.repeat(talentStars(r))}
                  <span className="opacity-30">{'★'.repeat(5 - talentStars(r))}</span> talent · {r.genres.map((g) => GENRE_BY_ID[g]?.name).join(', ')} · ~{Math.round(r.staff)} staff
                </div>
              </div>
              <div className="flex gap-1">
                {(Object.keys(LABEL_TIERS) as DealTier[]).map((tier) => (
                  <Button
                    key={tier}
                    size="sm"
                    disabled={s.company.cash < dealAdvance(s, tier)}
                    title={`${LABEL_TIERS[tier].label} budget: ${fmtMoney(dealAdvance(s, tier))} advance, ships in ${Math.round(LABEL_TIERS[tier].days[0] / 30)}–${Math.round(LABEL_TIERS[tier].days[1] / 30)} months`}
                    onClick={() => useGame.getState().actOrToast({ type: 'signIndie', rivalId: r.id, tier }, `${r.name} signed!`)}
                  >
                    <span className="text-ink3">{LABEL_TIERS[tier].label[0]}</span> {fmtMoney(dealAdvance(s, tier))}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Host your own yearly presentation (famous studios only). */
function Showcase() {
  const s = useGame((g) => g.s)!;
  const why = showcaseBlocked(s);
  if (fromDay(s.day).year < SHOWCASE_MIN_YEAR || s.company.reputation < SHOWCASE_MIN_REP - 15) return null;
  return (
    <Section title="Your own showcase">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-2.5 text-xs">
        <Icon name="megaphone" size={18} className="text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{showcaseName(s)}</div>
          <div className="text-ink3">Present every announced game to the world. +{showcaseHype(s).toFixed(2)} hype each, franchise fans +3%, reputation +{repGain(s, 2).toFixed(1)}. Once a year.</div>
        </div>
        <Button size="sm" variant="primary" disabled={!!why} title={why ?? undefined} onClick={() => useGame.getState().actOrToast({ type: 'hostShowcase' }, `${showcaseName(s)} is live — the crowd goes wild!`)}>
          Host · {fmtMoney(showcaseCost(s))}
        </Button>
      </div>
      {why && <p className="mt-1 text-[11px] text-ink3">{why}</p>}
    </Section>
  );
}

function Publishing() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const d = fromDay(s.day);
  const shows = TRADE_SHOWS.filter((t) => t.from <= d.year && (t.to ?? 9999) >= d.year);
  const announced = Object.values(s.projects).filter((p) => p.kind === 'game' && p.announcedDay !== undefined);
  return (
    <div>
      <Section title="Publisher offers">
        {s.offers.deals.length === 0 ? (
          <Empty icon="contract" title="No offers this month">Publishers approach studios with reputation. Offers refresh monthly.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {s.offers.deals.map((o) => {
              const c = COMPANY_BY_ID[o.publisherId];
              return (
                <li key={o.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-xs">
                  <CompanyBadge name={c?.name ?? o.publisherId} color={c?.color ?? '#888'} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {c?.name}
                      {(s.publisherTrust?.[o.publisherId] ?? 0) >= 2 && <span className="ml-1.5 text-xs font-normal text-good">· trusts you</span>}
                      {(s.publisherTrust?.[o.publisherId] ?? 0) <= -1.5 && <span className="ml-1.5 text-xs font-normal text-bad">· wary of you</span>}
                    </div>
                    <div className="text-ink3">
                      {fmtMoney(o.advance)} advance · {Math.round(o.royalty * 100)}% royalty · {Math.round(o.reach * 100)}% reach · {o.minScore}+ score · deadline {formatDate(o.deadlineDay, false)}
                    </div>
                  </div>
                  {!o.negotiated && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="sm" variant="ghost" title={`${Math.round(negotiateOdds(s) * 100)}% chance they agree to +25% advance; otherwise they walk away (and won’t call for months)`} onClick={() => useGame.getState().actOrToast({ type: 'negotiateDeal', dealId: o.id, ask: 'advance' }, 'You made your pitch')}>
                        Ask +25% advance
                      </Button>
                      <Button size="sm" variant="ghost" disabled={o.royalty >= 0.6} title={o.royalty >= 0.6 ? 'Already the best royalty they offer' : `${Math.round(negotiateOdds(s) * 100)}% chance they agree to +5 points of royalty; otherwise they walk away (and won’t call for months)`} onClick={() => useGame.getState().actOrToast({ type: 'negotiateDeal', dealId: o.id, ask: 'royalty' }, 'You made your pitch')}>
                        Ask +5% royalty
                      </Button>
                    </div>
                  )}
                  <Pill>expires {formatDate(o.expiresDay, false)}</Pill>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-1.5 text-[11px] text-ink3">Pick a deal when starting a new game (Develop → New game → Publishing).</p>
      </Section>
      <Label />
      <Showcase />
      <Section title="Trade shows">
        <ul className="space-y-1.5">
          {shows.map((t) => {
            const now = t.month === d.month;
            const done = !!s.eventCooldowns[`show_${t.id}_${d.year}`];
            return (
              <li key={t.id} className={cx('rounded-xl border p-2.5 text-xs', now ? 'border-accent bg-accent/5' : 'border-line')}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{t.name}</span>
                  <Pill tone={now ? 'accent' : 'neutral'}>{now ? 'This month!' : new Date(2000, t.month - 1).toLocaleString('en', { month: 'long' })}</Pill>
                </div>
                {now && !done && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(['Small', 'Medium', 'Large'] as const).map((label, i) => (
                      <Button
                        key={label}
                        size="sm"
                        disabled={!announced.length || s.company.cash < money(t.booths[i]!, s.day)}
                        title={!announced.length ? 'Announce a game first' : `+${t.hype[i]} hype, +${repGain(s, t.rep[i]!).toFixed(1)} reputation`}
                        onClick={() => {
                          const r = act({ type: 'tradeShow', show: t.id, booth: i as 0 | 1 | 2 });
                          toast(r.ok ? { text: `Booth booked at ${t.name}`, tone: 'good', icon: 'megaphone' } : { text: r.error, tone: 'bad' });
                        }}
                      >
                        {label} booth · {fmtMoney(money(t.booths[i]!, s.day))}
                      </Button>
                    ))}
                  </div>
                )}
                {now && done && <div className="mt-1 text-good">You exhibited this year. 🎉</div>}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function Stock() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const [pct, setPct] = useState(25);
  const st = s.finance.stock;
  const elig = ipoEligible(s);
  if (!st)
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Private valuation" value={fmtMoney(valuation(s))} />
          <Stat label="Reputation" value={Math.round(s.company.reputation)} />
        </div>
        <div className="rounded-2xl border border-line p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Venture funding</span>
            <span className="text-xs text-ink3">Investors own {Math.round((s.company.investorStake ?? 0) * 100)}%</span>
          </div>
          <p className="mt-1 text-xs text-ink3">Sell a slice of the studio for cash now. It’s money for growth — but every round shrinks the share you’ll keep when you go public, and below half, rivals can try a hostile takeover.</p>
          {nextFunding(s) ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" icon="coin" disabled={!!fundingBlocked(s)} title={fundingBlocked(s) ?? undefined} onClick={() => useGame.getState().actOrToast({ type: 'raiseFunding' }, 'Funding secured!')}>
                {nextFunding(s)!.name}: {fmtMoney(fundingAmount(s))} for {Math.round(nextFunding(s)!.stake * 100)}%
              </Button>
              {fundingBlocked(s) && <span className="text-xs text-ink3">{fundingBlocked(s)}</span>}
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink3">All private rounds raised.</p>
          )}
        </div>
        <div className="rounded-2xl border border-line p-3 text-sm">
          <div className="font-semibold">Initial public offering</div>
          <p className="mt-1 text-xs text-ink3">Sell part of the company to raise a war chest. Afterwards a board expects growth every quarter — and below 50% ownership, rivals can attempt a hostile takeover.</p>
          {elig.ok ? (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-3 text-xs">
                Sell
                <input type="range" min={10} max={49} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="flex-1" />
                <b className="num w-10">{pct}%</b>
              </label>
              <p className="text-xs">
                Raises about <b>{fmtMoney(valuation(s) * 1.1 * Math.max(0, Math.max(pct / 100, s.company.investorStake ?? 0) - (s.company.investorStake ?? 0)) * 0.94)}</b> · you keep <b>{Math.round((1 - Math.min(0.49, Math.max(pct / 100, s.company.investorStake ?? 0))) * 100)}%</b>
                {(s.company.investorStake ?? 0) > 0 && <span className="text-ink3"> (your investors sell their {Math.round((s.company.investorStake ?? 0) * 100)}% first)</span>}
              </p>
              <Button
                variant="gold"
                icon="bell"
                onClick={() => {
                  const r = act({ type: 'ipo', pct: pct / 100 });
                  toast(r.ok ? { text: 'Ding ding! You are now public.', tone: 'gold', icon: 'bell' } : { text: r.error, tone: 'bad' });
                }}
              >
                Ring the bell
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs font-semibold text-warn">{elig.why}</p>
          )}
        </div>
      </div>
    );
  const own = st.founderShares / st.shares;
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Share price" value={fmtSharePrice(st.price)} tone={st.price >= st.ipoPrice ? 'good' : 'bad'} sub={`IPO ${fmtSharePrice(st.ipoPrice)}`} />
        <Stat label="Market cap" value={fmtMoney(st.price * st.shares)} />
        <Stat label="You own" value={`${Math.round(own * 100)}%`} tone={own < 0.5 ? 'bad' : undefined} />
        <Stat label="Board mood" value={`${Math.round(st.boardMood)}%`} tone={st.boardMood < 35 ? 'bad' : undefined} />
      </div>
      <LineChart ariaLabel="Share price" height={170} area series={[{ name: 'Share price', points: st.history.map((y, i) => ({ x: i, y })) }]} yFormat={fmtSharePrice} xFormat={(i) => `wk ${i}`} />
      <p className="mt-2 text-xs text-ink3">Quarterly profit expectation: {fmtMoney(st.expectation)}. Beat it to lift the price and keep the board happy.</p>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-bg2/60 p-2 text-xs">
        <span>
          Issue 5% more shares for cash (your stake falls to {Math.round(controlAfterOffering(st, 0.05) * 100)}%)
          {controlAfterOffering(st, 0.05) < 0.5 && <b className="ml-1 text-bad">· below 50% — takeover risk</b>}
        </span>
        <Button size="sm" disabled={controlAfterOffering(st, 0.05) < 0.05 || !!offeringBlocked(s)} title={offeringBlocked(s) ?? undefined} onClick={() => useGame.getState().actOrToast({ type: 'secondaryOffering', pct: 0.05 }, 'Shares issued')}>
          +{fmtMoney(st.shares * 0.05 * st.price * 0.92)}
        </Button>
      </div>
      {own < 0.6 && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-bg2/60 p-2 text-xs">
          <span>Buy back 5% of shares to tighten control</span>
          <Button size="sm" onClick={() => useGame.getState().actOrToast({ type: 'buyback', shares: Math.round(st.shares * 0.05) }, 'Shares bought back')}>
            {fmtMoney(st.shares * 0.05 * st.price * 1.05)}
          </Button>
        </div>
      )}
    </div>
  );
}

function Acquire() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const subs = Object.values(s.subsidiaries);
  return (
    <div>
      <Section title="Acquisition targets">
        {s.offers.acquisitions.length === 0 ? (
          <Empty icon="cart" title="No studios for sale right now">{ownedStudios(s) >= MAX_SUBSIDIARIES ? `Your group runs ${MAX_SUBSIDIARIES} studios — the most management can handle.` : s.company.reputation < 35 ? 'Targets appear once your reputation reaches 35.' : 'New targets come up every month or so.'}</Empty>
        ) : (
          <ul className="space-y-1.5">
            {s.offers.acquisitions.map((a) => {
              const r = s.rivals[a.id];
              if (!r) return null;
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-xs">
                  <CompanyBadge name={r.name} color={r.color} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {r.name} {!r.procedural && <Pill tone="gold">Real company</Pill>}
                    </div>
                    <div className="text-ink3">
                      ~{Math.round(r.staff)} staff · rep {Math.round(r.reputation)} · {r.genres.map((g) => GENRE_BY_ID[g]?.name).join(', ')}
                      {!r.procedural && ' · brings its franchises'}
                    </div>
                  </div>
                  <ConfirmButton
                    size="sm"
                    variant="primary"
                    disabled={s.company.cash < a.price || ownedStudios(s) >= MAX_SUBSIDIARIES}
                    title={ownedStudios(s) >= MAX_SUBSIDIARIES ? `Your group already runs ${MAX_SUBSIDIARIES} studios` : undefined}
                    ask={`Buy for ${fmtMoney(a.price)} (${a.price < s.company.cash * 0.01 ? '<1' : Math.round((a.price / Math.max(1, s.company.cash)) * 100)}% of your cash)? It can’t be undone.`}
                    onConfirm={() => {
                      const res = act({ type: 'acquire', targetId: a.id });
                      toast(res.ok ? { text: `${r.name} is now part of ${s.company.name}!`, tone: 'gold', icon: 'cart' } : { text: res.error, tone: 'bad' });
                    }}
                  >
                    {fmtMoney(a.price)}
                  </ConfirmButton>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title={`Subsidiaries (${subs.length})`}>
        {subs.length === 0 ? (
          <p className="text-xs text-ink3">Acquired studios ship their own games and send you the revenue.</p>
        ) : (
          <ul className="space-y-2">
            {subs.map((sub) => (
              <li key={sub.id} className="rounded-xl border border-line p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{sub.name}</span>
                  <span className="text-ink3">
                    {sub.releases} games · {fmtMoney(sub.revenue)} earned · next ~{formatDate(sub.nextReleaseDay, false)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Segmented
                    ariaLabel="Budget"
                    value={sub.budget}
                    onChange={(b) => act({ type: 'setSubsidiary', id: sub.id, budget: b, focusGenre: sub.focusGenre })}
                    options={[
                      { value: 'low', label: 'Low budget' },
                      { value: 'normal', label: 'Normal' },
                      { value: 'high', label: 'High budget' },
                    ]}
                  />
                  <select
                    className="h-8 rounded-lg border border-line bg-panel2 px-2"
                    value={sub.focusGenre ?? ''}
                    onChange={(e) => act({ type: 'setSubsidiary', id: sub.id, budget: sub.budget, focusGenre: (e.target.value || undefined) as GenreId | undefined })}
                    aria-label="Genre focus"
                  >
                    <option value="">Their specialities</option>
                    {Object.values(GENRE_BY_ID).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function IP() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const [openMedia, setOpenMedia] = useState<string | null>(null);
  const fr = Object.values(s.franchises).sort((a, b) => b.fans - a.fans);
  if (!fr.length) return <Empty icon="chain" title="No IP yet">Every game you ship becomes an IP you can build sequels on.</Empty>;
  return (
    <div className="space-y-3">
    <MediaList />
    <ul className="space-y-1.5">
      {fr.map((f) => {
        const price = Math.max(money(5_000, s.day), f.fans * 4 * (f.bestScore / 100) * inflation(s.day) * 0.8);
        return (
          <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-xs">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                {f.name} {f.origin && <Pill tone="gold">Acquired classic</Pill>}
              </div>
              <div className="text-ink3">
                {GENRE_BY_ID[f.genre].name} · {f.entries.length} games · best {f.bestScore} · {fmtUnits(f.fans)} fans
                {f.fatigue > 0.15 && ` · fatigue ${Math.round(f.fatigue * 100)}%`}
              </div>
            </div>
            <Button size="sm" icon="sparkle" variant={openMedia === f.id ? 'primary' : 'secondary'} onClick={() => setOpenMedia((x) => (x === f.id ? null : f.id))} aria-expanded={openMedia === f.id} aria-controls="media-picker">
              Licensing
            </Button>
            {f.fans >= 300_000 && (
              <Button size="sm" icon="people" disabled={!!fanConBlocked(s, f)} title={fanConBlocked(s, f) ?? 'Fans +8%, morale up, hype for any sequel in development'} onClick={() => useGame.getState().actOrToast({ type: 'fanCon', franchiseId: f.id }, `${f.name} Con is a hit!`)}>
                Fan con · {fmtMoney(fanConCost(s, f))}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const r = act({ type: 'sellFranchise', franchiseId: f.id });
                toast(r.ok ? { text: `Sold ${f.name} for ${fmtMoney(price)}`, tone: 'neutral', icon: 'sell' } : { text: r.error, tone: 'bad' });
              }}
            >
              Sell {fmtMoney(price)}
            </Button>
          </li>
        );
      })}
    </ul>
    {openMedia && s.franchises[openMedia] && <MediaPicker franchiseId={openMedia} />}
    </div>
  );
}

/** What licensing deals a series can sign, and on what terms. */
function MediaPicker({ franchiseId }: { franchiseId: string }) {
  const s = useGame((g) => g.s)!;
  const f = s.franchises[franchiseId]!;
  return (
    <div id="media-picker" role="region" aria-label={`License ${f.name}`} className="rounded-2xl border border-line p-3 text-xs">
      <div className="text-sm font-semibold">License {f.name}</div>
      <p className="mt-0.5 text-ink3">
        A licensee pays up front and makes it; it comes out months later. A hit grows the fan base (screen adaptations send people back to the latest game) and pays royalties; a flop embarrasses the series. Hands-off pays the full fee; keeping creative control pays half but makes a hit far likelier. Better games make better adaptations.
      </p>
      <ul className="mt-2 space-y-1">
        {MEDIA_KINDS.map((k) => {
          const d = MEDIA[k];
          const why = mediaBlocked(s, f, k);
          const locked = fromDay(s.day).year < d.year;
          if (locked) return null;
          return (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg2/60 p-2">
              <span>
                <b>{d.name}</b> <span className="text-ink3">· {d.months} months · fans +{Math.round(d.boost * 100)}% on a hit</span>
                {why && <span className="block text-ink3">{why}</span>}
              </span>
              {!why && (
                <span className="flex gap-1.5">
                  <Button size="sm" onClick={() => useGame.getState().actOrToast({ type: 'mediaDeal', franchiseId, kind: k, control: 'licensed' }, `Deal signed: the ${f.name} ${d.noun}`)}>
                    Hands-off {fmtMoney(mediaFee(s, f, k, 'licensed'))}
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => useGame.getState().actOrToast({ type: 'mediaDeal', franchiseId, kind: k, control: 'involved' }, `Deal signed: the ${f.name} ${d.noun}`)}>
                    Creative control {fmtMoney(mediaFee(s, f, k, 'involved'))}
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Deals in production and how past ones did. */
function MediaList() {
  const s = useGame((g) => g.s)!;
  const deals = [...(s.mediaDeals ?? [])].reverse().slice(0, 12);
  if (!deals.length) return null;
  return (
    <div className="rounded-2xl border border-line p-3 text-xs">
      <div className="mb-1.5 text-sm font-semibold">Media & licensing</div>
      <ul className="space-y-1">
        {deals.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2">
            <span>
              <b>{d.name}</b> {MEDIA[d.kind].noun}
              <span className="text-ink3"> · {d.control === 'involved' ? 'creative control' : 'hands-off'} · {fmtMoney(d.fee + (d.bonus ?? 0))}</span>
            </span>
            {d.outcome === undefined ? (
              <span className="text-ink3">out {formatDate(d.releaseDay, false)}</span>
            ) : (
              <Pill tone={d.outcome === 'hit' ? 'good' : d.outcome === 'flop' ? 'bad' : 'neutral'}>{d.outcome === 'hit' ? 'Hit' : d.outcome === 'flop' ? 'Flop' : 'Fine'}</Pill>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The official player community: found it, moderate it, watch its mood. */
function CommunityTab() {
  const s = useGame((g) => g.s)!;
  const cm = s.community;
  if (!cm) {
    const why = communityBlocked(s);
    return (
      <div className="rounded-2xl border border-line p-3 text-sm">
        <div className="font-semibold">Start an official {hubName(s)}</div>
        <p className="mt-1 text-xs text-ink3">
          Give your fans a home. A healthy community lifts user scores at launch (up to +2), brings more crowdfunding backers and talks people out of review bombs. A neglected one turns toxic — and piles on. Health follows how players feel: great games, patches and live events help; crunch scandals and disappointing launches hurt. Moderators keep it civil.
        </p>
        <Button className="mt-2" size="sm" icon="people" disabled={!!why} title={why ?? undefined} onClick={() => useGame.getState().actOrToast({ type: 'foundCommunity' }, 'Community open! 🎉')}>
          Open it · {fmtMoney(communityCost(s))}
        </Button>
        {why && <p className="mt-1 text-xs text-ink3">{why}</p>}
      </div>
    );
  }
  const tone = cm.health >= 70 ? 'text-good' : cm.health < 35 ? 'text-bad' : 'text-ink';
  const mood = cm.health >= 80 ? 'Thriving and welcoming' : cm.health >= 60 ? 'Friendly, mostly' : cm.health >= 40 ? 'Restless' : cm.health >= 25 ? 'Angry' : 'Toxic';
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-bg2/60 p-2.5">
          <div className="text-xs text-ink3">Members</div>
          <div className="num text-lg font-semibold">{fmtUnits(cm.members)}</div>
        </div>
        <div className="rounded-xl bg-bg2/60 p-2.5">
          <div className="text-xs text-ink3">Health</div>
          <div className={cx('num text-lg font-semibold', tone)}>{Math.round(cm.health)}</div>
        </div>
        <div className="rounded-xl bg-bg2/60 p-2.5">
          <div className="text-xs text-ink3">Mood</div>
          <div className={cx('text-sm font-semibold', tone)}>{mood}</div>
        </div>
      </div>
      <p className="text-xs text-ink3">
        At launch: user score {communityUserBonus(s) >= 0 ? '+' : ''}
        {communityUserBonus(s)} · crowdfunding ×{communityPledgeMul(s).toFixed(2)} · review bombs {cm.health < 35 ? 'far more likely' : cm.health > 70 ? 'much rarer' : 'as usual'}.
      </p>
      <div>
        <div className="mb-1 text-xs font-semibold text-ink3">Moderation</div>
        <Segmented
          ariaLabel="Moderation budget"
          value={String(cm.mods)}
          onChange={(v) => useGame.getState().act({ type: 'setModeration', level: Number(v) as 0 | 1 | 2 })}
          options={[0, 1, 2].map((l) => ({ value: String(l), label: l === 0 ? 'None' : `${l === 1 ? 'Part-time' : 'Full team'} · ${fmtMoney(money(MOD_BUDGET[l as 0 | 1 | 2], s.day))}/mo` }))}
        />
        <p className="mt-1 text-xs text-ink3">Moderators lift health (+8 per level) and help the community grow.</p>
      </div>
    </div>
  );
}
