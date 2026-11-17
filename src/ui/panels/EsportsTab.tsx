import { useState } from 'react';
import { formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits } from '@/sim/util';
import {
  canFoundLeague,
  ESPORTS_RESEARCH,
  LEAGUE_MAX_LIVE,
  LEAGUE_MIN_REP,
  LEAGUE_MIN_SCORE,
  LEAGUE_TIERS,
  leagueCandidates,
  leagueMonthlyCost,
  leagueMonthlyProfit,
  leaguePrize,
  leagueSetupCost,
  leagueViewers,
  liveLeagues,
  revenuePerViewer,
} from '@/sim/systems/esports';
import { RESEARCH_BY_ID } from '@/data/research';
import type { EsportsLeague, LeagueTier } from '@/sim/types';
import { Sparkline } from '../charts';
import { BreakdownList, Button, Empty, Field, Meter, Pill, Section, Segmented, Stat, Tip, cx, inputCls } from '../components/ui';
import { useGame } from '../store';

const TIER_NAME: Record<LeagueTier, string> = { regional: 'Circuit', pro: 'Pro League', world: 'World Championship' };
const START_PRESTIGE: Record<LeagueTier, number> = { regional: 3, pro: 8, world: 15 };

export function EsportsTab() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const leagues = s.leagues ?? [];
  const live = liveLeagues(s);
  const closed = leagues.filter((l) => l.status === 'closed');
  if (!s.research.done.includes(ESPORTS_RESEARCH))
    return (
      <Empty icon="trophy" title="Esports leagues">
        Research {RESEARCH_BY_ID[ESPORTS_RESEARCH]?.name ?? 'Esports'} (Business branch, from 2009) to run pro leagues for your competitive games.
      </Empty>
    );
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink3">
        Run a league for one of your competitive games. Viewers come from its player base, its reviews and the league’s prestige, which builds season after season. Sponsors and broadcasters pay per viewer; running the league and the yearly prize pool cost money. Leagues also turn viewers into franchise fans, keep the game selling, and move to a strong sequel automatically.
      </p>
      {live.map((lg) => (
        <LeagueCard key={lg.id} lg={lg} />
      ))}
      <FoundLeague />
      {closed.length > 0 && (
        <Section title="Past leagues">
          <ul className="space-y-1 text-xs">
            {closed.map((l) => (
              <li key={l.id} className="flex justify-between gap-2 border-b border-line py-1">
                <span className="truncate">
                  {l.name} · {l.seasons} season{l.seasons === 1 ? '' : 's'} · peak {fmtUnits(l.peakViewers)} viewers
                </span>
                <span className={cx('num shrink-0', l.revenue - l.costs >= 0 ? 'text-good' : 'text-bad')}>{fmtMoney(l.revenue - l.costs)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function LeagueCard({ lg }: { lg: EsportsLeague }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.actOrToast);
  const [confirm, setConfirm] = useState(false);
  const rel = s.releases[lg.releaseId];
  if (!rel) return null;
  const v = leagueViewers(s, rel, lg.tier, lg.prestige);
  const monthly = v.viewers * revenuePerViewer(s) - leagueMonthlyCost(s, lg.tier);
  const age = (s.day - rel.day) / 365.25;
  return (
    <Section
      title={lg.name}
      right={
        <span className="flex items-center gap-2">
          <Pill tone="tech">{LEAGUE_TIERS[lg.tier].label}</Pill>
          {lg.history.length > 1 && <Sparkline values={lg.history.slice(-36)} ariaLabel="Viewers per month" />}
        </span>
      }
    >
      <div className="text-xs text-ink3">
        Playing {rel.name} ({rel.score}) · since {formatDate(lg.foundedDay, false)} · {lg.seasons} season{lg.seasons === 1 ? '' : 's'} played
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tip content={<BreakdownList bd={v.why} format={(x) => (x > 50 ? fmtUnits(x) : x.toFixed(2))} title="Where viewers come from" />}>
          <div className="w-full cursor-help">
            <Stat label="Monthly viewers" value={fmtUnits(lg.viewers)} sub={`peak ${fmtUnits(lg.peakViewers)}`} />
          </div>
        </Tip>
        <Stat label="Per month" value={fmtMoney(monthly)} tone={monthly >= 0 ? 'good' : 'bad'} sub={`+ ${fmtMoney(leaguePrize(s, lg.tier))} prize pool a year`} />
        <Stat label="Lifetime" value={fmtMoney(lg.revenue - lg.costs)} tone={lg.revenue >= lg.costs ? 'good' : 'bad'} sub={`${fmtMoney(lg.revenue)} in`} />
        <div className="rounded-xl bg-bg2/60 p-2">
          <div className="text-xs text-ink3">Prestige</div>
          <div className="num font-semibold">{Math.round(lg.prestige)}</div>
          <Meter value={lg.prestige} tone="gold" label="Prestige" />
        </div>
      </div>
      {age > 6 && <p className="mt-2 text-xs text-warn">{rel.name} is getting old and viewers are drifting away. A strong sequel in the same genre would take over the league.</p>}
      <div className="mt-2 flex justify-end gap-2">
        {confirm ? (
          <>
            <span className="self-center text-xs text-ink2">End the league{lg.prestige > 50 ? ' (fans will be disappointed)' : ''}?</span>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button size="sm" variant="danger" onClick={() => act({ type: 'closeLeague', id: lg.id })}>
              End league
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            End league…
          </Button>
        )}
      </div>
    </Section>
  );
}

function FoundLeague() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.actOrToast);
  const cands = leagueCandidates(s).filter((r) => !canFoundLeague(s, r));
  const [relId, setRelId] = useState(cands[0]?.id ?? '');
  const [tier, setTier] = useState<LeagueTier>('regional');
  const rel = s.releases[relId];
  const [name, setName] = useState(rel ? `${rel.name} ${TIER_NAME.regional}` : '');
  const [touched, setTouched] = useState(false);
  if (liveLeagues(s).length >= LEAGUE_MAX_LIVE)
    return <p className="text-xs text-ink3">You’re running the maximum of {LEAGUE_MAX_LIVE} leagues. End one to start another.</p>;
  if (!cands.length)
    return (
      <Section title="Start a league">
        <p className="text-xs text-ink3">
          No game can host a new league right now. You need a competitive game (shooter, strategy, fighting, MMO, sports or racing) scoring {LEAGUE_MIN_SCORE}+ from the last six years, in a franchise without a league, and {LEAGUE_MIN_REP}+ reputation.
        </p>
      </Section>
    );
  const why = canFoundLeague(s, rel);
  const pick = (id: string, t: LeagueTier) => {
    const r = s.releases[id];
    if (!touched && r) setName(`${r.name} ${TIER_NAME[t]}`);
  };
  const v = rel ? leagueViewers(s, rel, tier, START_PRESTIGE[tier]).viewers : 0;
  const profit = rel ? leagueMonthlyProfit(s, rel, tier, START_PRESTIGE[tier]) : 0;
  const cost = leagueSetupCost(s, tier);
  return (
    <Section title="Start a league">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Game">
          <select
            className={inputCls}
            value={relId}
            onChange={(e) => {
              setRelId(e.target.value);
              pick(e.target.value, tier);
            }}
          >
            {cands.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.score}) · {fmtUnits(r.units)} sold
              </option>
            ))}
          </select>
        </Field>
        <Field label="League name">
          <input
            className={inputCls}
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              setTouched(true);
            }}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Segmented<LeagueTier>
          ariaLabel="League tier"
          value={tier}
          onChange={(t) => {
            setTier(t);
            pick(relId, t);
          }}
          options={(['regional', 'pro', 'world'] as LeagueTier[]).map((t) => ({ value: t, label: LEAGUE_TIERS[t].label, title: `Setup ${fmtMoney(leagueSetupCost(s, t))} · running ${fmtMoney(leagueMonthlyCost(s, t))}/mo · prize pool ${fmtMoney(leaguePrize(s, t))}/yr` }))}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Setup</div>
          <div className="num font-semibold">{fmtMoney(cost)}</div>
        </div>
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Running + prizes</div>
          <div className="num font-semibold">{fmtMoney(leagueMonthlyCost(s, tier) + leaguePrize(s, tier) / 12)}/mo</div>
        </div>
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Viewers at launch</div>
          <div className="num font-semibold">{fmtUnits(v)}</div>
        </div>
        <div className="rounded-xl bg-bg2/70 p-2">
          <div className="text-ink3">Per month at launch</div>
          <div className={cx('num font-semibold', profit >= 0 ? 'text-good' : 'text-bad')}>{fmtMoney(profit)}</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink3">Prestige grows every season, so viewers and income climb over the first few years. Bigger tiers draw far more viewers but cost more.</p>
      <div className="mt-2 flex items-center justify-end gap-2">
        {why && <span className="text-xs text-ink3">{why}</span>}
        <Button variant="primary" icon="trophy" disabled={!!why || s.company.cash < cost} onClick={() => act({ type: 'foundLeague', releaseId: relId, tier, name })}>
          Found league · {fmtMoney(cost)}
        </Button>
      </div>
    </Section>
  );
}
