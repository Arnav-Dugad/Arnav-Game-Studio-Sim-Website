import { useMemo } from 'react';
import { BRANCH, REGIONS, regionShares, type RegionId } from '@/data/regions';
import { branchBlocked } from '@/sim/actions';
import { GENRES, GENRE_BY_ID } from '@/data/genres';
import { COMPANY_BY_ID } from '@/data/companies';
import { PERSON_BY_ID } from '@/data/people';
import { fromDay, formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits, money } from '@/sim/util';
import { genrePopularity, livePlatforms, platformName } from '@/sim/systems/market';
import { upcomingReleases } from '@/sim/systems/rivals';
import { FRANCHISES } from '@/data/franchises';
import { parseYM } from '@/sim/calendar';
import { StackedArea, LineChart } from '../charts';
import { Button, Pill, Section, Segmented, cx } from '../components/ui';
import { CompanyBadge } from '../art/CompanyBadge';
import { InitialsBadge } from '../art/Avatar';
import { Icon } from '../icons';
import { useGame } from '../store';
import { nemesis } from '@/sim/systems/rivalry';
import { dayAxis } from '../game/format';

export default function MarketPanel() {
  useGame((g) => g.v);
  const tab = useGame((g) => g.panelTab) ?? 'platforms';
  const setTab = (t: string) => useGame.setState({ panelTab: t });
  return (
    <div>
      <Segmented
        ariaLabel="Market sections"
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: 'platforms', label: 'Platforms' },
          { value: 'trends', label: 'Trends' },
          { value: 'world', label: 'World' },
          { value: 'rivals', label: 'Rivals' },
          { value: 'releases', label: 'Rival releases' },
          { value: 'upcoming', label: 'Coming soon' },
          { value: 'charts', label: 'All-time charts' },
        ]}
      />
      {tab === 'platforms' && <Platforms />}
      {tab === 'trends' && <Trends />}
      {tab === 'world' && <World />}
      {tab === 'rivals' && <Rivals />}
      {tab === 'releases' && <RivalReleases />}
      {tab === 'upcoming' && <Upcoming />}
      {tab === 'charts' && <Charts />}
    </div>
  );
}

function Platforms() {
  const s = useGame((g) => g.s)!;
  const hist = s.market.shareHistory.slice(-240);
  const keys = useMemo(() => {
    const tot: Record<string, number> = {};
    for (const h of hist) for (const [k, v] of Object.entries(h.share)) tot[k] = (tot[k] ?? 0) + v;
    return Object.entries(tot)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k]) => k);
  }, [hist]);
  const labels = Object.fromEntries(keys.map((k) => [k, platformName(s, k)]));
  const live = livePlatforms(s).sort((a, b) => (s.market.users[b.id] ?? 0) - (s.market.users[a.id] ?? 0));
  return (
    <div>
      <Section title="Market share over time">
        <StackedArea
          data={hist.map((h) => ({ x: h.day, values: h.share }))}
          keys={keys}
          labels={labels}
          height={210}
          ariaLabel="Platform market share over time"
          xFormat={dayAxis((hist[hist.length - 1]?.day ?? 0) - (hist[0]?.day ?? 0))}
        />
      </Section>
      <Section title="Platforms on sale">
        <ul className="divide-y divide-line">
          {live.map((p) => {
            const owned = s.devkits.includes(p.id);
            const locked = p.research && !s.research.done.includes(p.research);
            const age = (s.day - p.launchDay) / 365;
            return (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="grid size-8 place-items-center rounded-lg bg-bg2 text-ink2">
                  <Icon name={p.kind === 'handheld' ? 'handheld' : p.kind === 'computer' ? 'pc' : p.kind === 'mobile' ? 'mobile' : p.kind === 'vr' ? 'vr' : p.kind === 'cloud' ? 'cloud-game' : 'controller'} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {p.name} {p.own && <Pill tone="gold">Yours</Pill>}
                  </div>
                  <div className="text-xs text-ink3">
                    {p.own ? s.company.name : COMPANY_BY_ID[p.maker]?.name ?? 'Open platform'} · {age < 1 ? 'new!' : `${age.toFixed(0)} yrs old`}
                    {/* no spoilers: only hint at a platform's end in its final year */}
                    {p.endDay !== null && p.endDay - s.day < 365 && ' · being phased out'}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="num font-semibold">{fmtUnits((s.market.users[p.id] ?? 0) * 1e6)} users</div>
                  <div className="num text-ink3">{((s.market.share[p.id] ?? 0) * 100).toFixed(1)}% share</div>
                </div>
                {p.own ? null : locked ? <Pill>Needs research</Pill> : owned ? <Pill tone="good">Kit</Pill> : null}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

/** The world's regions: who plays, what they like, and how your games do there. */
function World() {
  const s = useGame((g) => g.s)!;
  const yr = fromDay(s.day).year;
  const shares = regionShares(yr);
  const home = s.company.homeRegion ?? 'na';
  const mine = s.releaseOrder.slice(-12).map((id) => s.releases[id]!).filter((r) => r?.regionMix);
  const myUnits = (id: RegionId) => mine.reduce((t, r) => t + r.units * (r.regionMix![id] ?? 0), 0);
  const totalMine = REGIONS.reduce((t, r) => t + myUnits(r.id), 0);
  const avail = GENRES.filter((g) => g.year <= yr);
  return (
    <div className="space-y-3">
      {REGIONS.map((r) => {
        const loves = avail.filter((g) => (r.taste[g.id] ?? 1) >= 1.15).sort((a, b) => (r.taste[b.id] ?? 1) - (r.taste[a.id] ?? 1));
        const cool = avail.filter((g) => (r.taste[g.id] ?? 1) <= 0.85);
        return (
          <section key={r.id} className="rounded-2xl border border-line p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-sm font-semibold">
                {r.name} {r.id === home && <Pill tone="gold">Home</Pill>}
              </h3>
              <span className="num text-sm font-semibold">{Math.round(shares[r.id] * 100)}% of players</span>
            </div>
            <p className="mt-0.5 text-xs text-ink2">{r.blurb}</p>
            <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
              {loves.map((g) => (
                <span key={g.id} className="rounded-full bg-good/15 px-2 py-0.5 font-semibold text-good">
                  ♥ {g.name}
                </span>
              ))}
              {cool.map((g) => (
                <span key={g.id} className="rounded-full bg-bg2 px-2 py-0.5 text-ink3">
                  {g.name}
                </span>
              ))}
            </div>
            {totalMine > 0 && <div className="mt-1.5 text-[11px] text-ink3">Your recent games: {Math.round((myUnits(r.id) / totalMine) * 100)}% of copies sold here</div>}
            {r.id !== home && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {(s.company.branches ?? []).includes(r.id) ? (
                  <>
                    <Pill tone="good">Branch office open</Pill>
                    <span className="text-ink3">{fmtMoney(money(BRANCH.rent, s.day))}/mo</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Close the ${r.name} studio? Reopening costs the full fee again.`)) useGame.getState().actOrToast({ type: 'closeBranch', region: r.id }, `Closed the ${r.name} studio`);
                      }}
                    >
                      Close
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" icon="building" disabled={!!branchBlocked(s, r.id)} title={branchBlocked(s, r.id) ?? undefined} onClick={() => useGame.getState().actOrToast({ type: 'openBranch', region: r.id }, `Opened a studio in ${r.name}!`)}>
                      Open a branch · {fmtMoney(money(BRANCH.open, s.day))}
                    </Button>
                    <span className="text-ink3">then {fmtMoney(money(BRANCH.rent, s.day))}/mo · free localisation here and +{Math.round((BRANCH.reach - 1) * 100)}% local reach</span>
                  </>
                )}
              </div>
            )}
          </section>
        );
      })}
      <p className="text-[11px] text-ink3">Localise a game (in the new-game setup) to reach a region’s players properly. The world shifts: Japan’s golden age fades, and the rest of the world becomes the biggest market of all.</p>
    </div>
  );
}

function Trends() {
  const s = useGame((g) => g.s)!;
  const yr = fromDay(s.day).year;
  const genres = GENRES.filter((g) => g.year <= yr);
  const ranked = genres.map((g) => ({ g, pop: genrePopularity(s, g.id), trend: s.market.genreTrend[g.id] ?? 0 })).sort((a, b) => b.pop - a.pop);
  const hist = s.market.trendHistory.slice(-180);
  const top = ranked.slice(0, 5).map((r) => r.g.id);
  return (
    <div>
      <Section title="Hottest genres right now">
        <ul className="space-y-1.5">
          {ranked.map(({ g, pop, trend }) => (
            <li key={g.id} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-2 text-xs">
              <span className="font-semibold">{g.name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-bg2">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (pop / ranked[0]!.pop) * 100)}%` }} />
              </span>
              <span className={cx('num text-right font-semibold', trend > 0.05 ? 'text-good' : trend < -0.05 ? 'text-bad' : 'text-ink3')}>
                {trend > 0.05 ? '▲' : trend < -0.05 ? '▼' : '–'} {Math.round(trend * 100)}%
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-ink3">Trends drift month to month and react to history (the 3D boom, battle royale…). Popular genres sell more; chasing trends risks repetition.</p>
      </Section>
      <Section title="Top genres over time">
        <LineChart
          ariaLabel="Genre popularity over time"
          height={180}
          series={top.map((id) => ({ name: GENRE_BY_ID[id].name, points: hist.map((h) => ({ x: h.day, y: h.trend[id] ?? 0 })) }))}
          xFormat={dayAxis((hist[hist.length - 1]?.day ?? 0) - (hist[0]?.day ?? 0))}
          yFormat={(v) => v.toFixed(1)}
        />
      </Section>
      {s.progress.journal.length > 0 && (
        <Section title="Your design notes">
          <ul className="list-disc space-y-1 pl-5 text-xs text-ink2">
            {s.progress.journal.slice(-14).map((j) => (
              <li key={j}>{j}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Rivals() {
  const s = useGame((g) => g.s)!;
  const rivals = Object.values(s.rivals)
    .filter((r) => r.alive)
    .sort((a, b) => b.reputation - a.reputation);
  const nem = nemesis(s);
  return (
    <ul className="space-y-1.5">
      {rivals.map((r) => {
        const def = COMPANY_BY_ID[r.id];
        const leader = def?.leader ? PERSON_BY_ID[def.leader] : undefined;
        const last = [...s.rivalGames].reverse().find((g) => g.company === r.id);
        return (
          <li key={r.id}>
            <button type="button" onClick={() => useGame.getState().pushModal({ kind: 'rival', rivalId: r.id })} className="flex w-full items-center gap-3 rounded-xl border border-line p-2.5 text-left hover:bg-bg2">
            <CompanyBadge name={r.name} color={r.color} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="truncate">{r.name}</span>
                {r.ownedByPlayer && <Pill tone="gold">Yours</Pill>}
                {r.procedural && <Pill>Indie</Pill>}
                {nem?.id === r.id && <Pill tone="bad">Nemesis</Pill>}
                {s.rivalry?.[r.id] && (
                  <span className="num text-[11px] font-normal text-ink3">
                    {s.rivalry[r.id]!.wins}–{s.rivalry[r.id]!.losses}
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-ink3">
                {r.genres.map((g) => GENRE_BY_ID[g]?.name).filter(Boolean).join(', ')} · ~{Math.round(r.staff)} staff
                {last && ` · latest: ${last.name} (${last.score})`}
              </div>
            </div>
            {leader && (
              <span title={`${leader.name} — ${leader.knownFor}`}>
                <InitialsBadge name={leader.name} size={28} />
              </span>
            )}
            <div className="w-12 text-right">
              <div className="num text-sm font-semibold">{Math.round(r.reputation)}</div>
              <div className="text-[10px] text-ink3">rep</div>
            </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RivalReleases() {
  const s = useGame((g) => g.s)!;
  const games = [...s.rivalGames].reverse().slice(0, 60);
  return (
    <ul className="divide-y divide-line">
      {games.map((g, i) => (
        <li key={`${g.name}-${g.day}-${i}`} className="flex items-center gap-3 py-2 text-sm">
          <span className={cx('num grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold', g.score >= 85 ? 'bg-gold/20 text-gold' : g.score >= 70 ? 'bg-good/15 text-good' : g.score >= 50 ? 'bg-bg2 text-ink2' : 'bg-bad/15 text-bad')}>{g.score}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">
              {g.name} {g.franchise && <Pill tone="accent">Classic</Pill>}
              {g.copycatOf && s.releases[g.copycatOf] && <Pill tone="bad">Copy of {s.releases[g.copycatOf]!.name}</Pill>}
            </div>
            <div className="truncate text-xs text-ink3">
              {s.rivals[g.company]?.name ?? COMPANY_BY_ID[g.company]?.name ?? g.company} · {GENRE_BY_ID[g.genre]?.name} · {g.platforms.map((p) => platformName(s, p)).join(', ')}
            </div>
          </div>
          <span className="num shrink-0 text-xs text-ink3">{formatDate(g.day, false)}</span>
        </li>
      ))}
    </ul>
  );
}

function Upcoming() {
  const s = useGame((g) => g.s)!;
  const list = upcomingReleases(s, s.day, s.day + 365);
  if (!list.length) return <p className="text-sm text-ink3">No major releases announced for the next 12 months.</p>;
  return (
    <div>
      <p className="mb-2 text-xs text-ink3">Big franchise releases announced for the next 12 months. Launching the same genre on the same platforms within about five weeks means sharing the spotlight.</p>
      <ul className="divide-y divide-line">
        {list.map((g) => (
          <li key={`${g.title}-${g.day}`} className="flex items-center gap-3 py-2 text-sm">
            <span className="num w-20 shrink-0 text-xs font-semibold text-accent">{formatDate(g.day, false)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{g.title}</div>
              <div className="truncate text-xs text-ink3">
                {COMPANY_BY_ID[g.company]?.name ?? g.company} · {GENRE_BY_ID[g.genre]?.name} · {g.platforms.map((p) => platformName(s, p)).join(', ')}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Best-selling games so far: real history up to today plus your own releases. */
function Charts() {
  const s = useGame((g) => g.s)!;
  const v = useGame((g) => g.v);
  const rows = useMemo(() => {
    const out: { name: string; company: string; year: number; units: number; score: number; mine: boolean; id?: string }[] = [];
    for (const f of FRANCHISES)
      for (const r of f.releases) {
        const day = parseYM(r.date);
        if (day > s.day) continue;
        // Lifetime sales build up over the first few years on shelves.
        const units = r.unitsM * 1e6 * Math.min(1, (s.day - day) / (365 * 3) + 0.15);
        out.push({ name: r.title, company: COMPANY_BY_ID[f.company]?.name ?? f.company, year: fromDay(day).year, units, score: r.score, mine: false });
      }
    for (const id of s.releaseOrder) {
      const r = s.releases[id];
      if (r) out.push({ name: r.name, company: s.company.name, year: fromDay(r.day).year, units: r.units, score: Math.round(r.score), mine: true, id });
    }
    return out.sort((a, b) => b.units - a.units).slice(0, 30);
    // v: recompute as sales tick
  }, [s, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const myBest = rows.findIndex((r) => r.mine);
  return (
    <div>
      <p className="mb-2 text-xs text-ink3">
        The best-selling games released so far, real classics and yours together.{' '}
        {myBest >= 0 ? <b className="text-gold">Your best seller ranks #{myBest + 1} of {rows.length}.</b> : 'None of yours has cracked the top 30 yet.'}
      </p>
      <ol className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={`${r.name}-${r.year}-${i}`} className={cx('flex items-center gap-3 py-1.5 text-sm', r.mine && 'rounded-lg bg-gold/10 px-1.5')}>
            <span className="num w-6 shrink-0 text-right text-xs font-semibold text-ink3">{i + 1}</span>
            <div className="min-w-0 flex-1">
              {r.mine && r.id ? (
                <button type="button" className="truncate text-left font-semibold hover:underline" onClick={() => useGame.getState().pushModal({ kind: 'release', releaseId: r.id! })}>
                  {r.name}
                </button>
              ) : (
                <div className="truncate font-semibold">{r.name}</div>
              )}
              <div className="truncate text-xs text-ink3">
                {r.company} · {r.year} · {r.score}
              </div>
            </div>
            <span className="num shrink-0 text-xs font-semibold">{fmtUnits(r.units)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
