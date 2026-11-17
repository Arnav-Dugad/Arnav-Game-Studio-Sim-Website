import { useMemo, type ReactNode } from 'react';
import { StudioStory } from '../game/StudioStory';
import { ACHIEVEMENTS } from '@/sim/systems/achievements';
import { formatDate, fromDay, toDay } from '@/sim/calendar';
import { fmtMoney, fmtUnits } from '@/sim/util';
import type { GameState } from '@/sim/types';
import { Button, Empty, cx } from '../components/ui';
import { Icon, type IconName } from '../icons';
import { useGame } from '../store';

interface Entry {
  day: number;
  icon: IconName;
  text: string;
  sub?: string;
  tone?: 'gold' | 'good' | 'bad';
  releaseId?: string;
}

const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Build the studio's story from data the sim already keeps. */
export function studioHistory(s: GameState): Entry[] {
  const out: Entry[] = [];
  const founded = s.finance.ledger[0]?.day;
  if (founded !== undefined) out.push({ day: founded, icon: 'house', text: `${s.company.name} is founded`, sub: 'A garage, a computer and a dream' });
  for (const id of s.releaseOrder) {
    const r = s.releases[id];
    if (!r) continue;
    const big = r.score >= 85 || r.units >= 1_000_000 || r.awards.length > 0 || r.score < 45 || out.filter((e) => e.releaseId).length < 3;
    if (!big) continue;
    out.push({
      day: r.day,
      icon: r.score >= 85 ? 'crown' : r.score < 45 ? 'skull' : r.concept.remasterOf ? 'sparkle' : r.concept.expansionOf ? 'layers' : 'rocket',
      text: `${r.name} released${r.concept.remasterOf ? ' (remaster)' : r.concept.expansionOf ? ' (expansion)' : ''}`,
      sub: `Scored ${Math.round(r.score)} · ${fmtUnits(r.units)} sold${r.awards.length ? ` · ${r.awards.join(', ')}` : ''}`,
      tone: r.score >= 85 ? 'gold' : r.score < 45 ? 'bad' : undefined,
      releaseId: r.id,
    });
  }
  for (const [id, day] of Object.entries(s.progress.achievements)) {
    const a = ACH_BY_ID[id];
    if (a) out.push({ day, icon: (a.icon as IconName) ?? 'trophy', text: `Achievement: ${a.name}`, sub: a.desc, tone: 'good' });
  }
  for (const hw of s.hardware ?? []) {
    if (hw.status === 'dev') continue;
    out.push({ day: hw.launchDay, icon: hw.kind === 'handheld' ? 'handheld' : 'controller', text: `The ${hw.name} launches`, sub: `Your own ${hw.kind}`, tone: 'gold' });
    if (hw.endDay !== null) out.push({ day: hw.endDay, icon: 'box', text: `The ${hw.name} is discontinued`, sub: `${fmtUnits(hw.unitsSold)} units sold` });
  }
  for (const a of s.alumni ?? []) out.push({ day: a.day, icon: 'heart', text: `${a.name} retires`, sub: `${a.years} years at the studio · ${a.games} game${a.games === 1 ? '' : 's'} shipped${a.legend ? ' · a legend' : ''}`, tone: 'good' });
  if (s.subscription) out.push({ day: s.subscription.launchedDay, icon: 'people', text: `${s.subscription.name} launches`, sub: `Peak ${fmtUnits(s.subscription.peak)} subscribers`, tone: 'good' });
  for (const r of Object.values(s.releases)) if (r.classic) out.push({ day: toDay(r.classic), icon: 'medal', text: `${r.name} enters the Hall of Classics`, sub: `Released ${fromDay(r.day).year} · scored ${Math.round(r.score)}`, tone: 'gold', releaseId: r.id });
  if (s.finance.stock) out.push({ day: s.finance.stock.ipoDay, icon: 'chart', text: `${s.company.name} goes public`, tone: 'gold' });
  return out.sort((a, b) => b.day - a.day);
}

export function HistoryTab() {
  const s = useGame((g) => g.s)!;
  const v = useGame((g) => g.v);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => studioHistory(s), [s, v]);
  if (entries.length <= 1) return <Empty icon="book" title="Your story is just beginning">Ship games, win awards and grow — the highlights will appear here.</Empty>;
  const rows: ReactNode[] = [];
  let lastYear = -1;
  entries.forEach((e, i) => {
    const y = fromDay(e.day).year;
    if (y !== lastYear) rows.push(<li key={`y${y}`} className="font-display -ml-3 mb-2 mt-1 bg-panel py-0.5 text-sm font-semibold text-ink3">{y}</li>);
    lastYear = y;
    rows.push(
      <li key={`${e.day}-${i}`} className="relative mb-3 pl-5">
        <span className={cx('absolute -left-3 top-0 grid size-6 place-items-center rounded-full border border-line bg-panel', e.tone === 'gold' && 'text-gold', e.tone === 'good' && 'text-good', e.tone === 'bad' && 'text-bad')}>
          <Icon name={e.icon} size={13} />
        </span>
        {e.releaseId ? (
          <button type="button" className="text-left text-sm font-semibold hover:underline" onClick={() => useGame.getState().pushModal({ kind: 'release', releaseId: e.releaseId! })}>
            {e.text}
          </button>
        ) : (
          <div className="text-sm font-semibold">{e.text}</div>
        )}
        <div className="text-xs text-ink3">
          {formatDate(e.day, false)}
          {e.sub ? ` · ${e.sub}` : ''}
        </div>
      </li>,
    );
  });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" icon="camera" onClick={() => useGame.getState().openModalNow({ kind: 'studioCard' })}>
          Studio card
        </Button>
      </div>
      <StudioStory />
      <Records />
      <ol className="ml-3 border-l border-line">{rows}</ol>
    </div>
  );
}

/** All-time bests, at a glance. */
function Records() {
  const s = useGame((g) => g.s)!;
  const rels = Object.values(s.releases);
  if (!rels.length) return null;
  const by = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, b) => (f(b) > f(a) ? b : a));
  const best = by(rels, (r) => r.score);
  const seller = by(rels, (r) => r.units);
  const earner = by(rels, (r) => r.net - r.devCost);
  const frs = Object.values(s.franchises);
  const fr = frs.length ? by(frs, (f) => f.fans) : undefined;
  const years = new Map<number, number>();
  for (const m of s.finance.ledger) {
    const y = fromDay(m.day).year;
    // Operating income only: selling assets, windfalls and cheat top-ups aren't revenue.
    const inc = Object.entries(m.income).reduce((t, [k, v]) => t + (k === 'asset_sales' || k === 'other_income' ? 0 : (v ?? 0)), 0);
    years.set(y, (years.get(y) ?? 0) + inc);
  }
  const bestYear = [...years.entries()].sort((a, b) => b[1] - a[1])[0];
  const st = s.progress.stats;
  const open = (id: string) => useGame.getState().pushModal({ kind: 'release', releaseId: id });
  const tiles: { label: string; value: string; sub: string; icon: IconName; onClick?: () => void }[] = [
    { label: 'Highest rated', value: best.name, sub: `Critics ${best.score} · users ${best.userScore}`, icon: 'star', onClick: () => open(best.id) },
    { label: 'Best seller', value: seller.name, sub: `${fmtUnits(seller.units)} copies`, icon: 'disc', onClick: () => open(seller.id) },
    { label: 'Most profitable', value: earner.name, sub: `${fmtMoney(earner.net - earner.devCost)} profit`, icon: 'money', onClick: () => open(earner.id) },
  ];
  if (fr && fr.fans > 0) tiles.push({ label: 'Biggest franchise', value: fr.name, sub: `${fmtUnits(fr.fans)} fans · ${fr.entries.length} game${fr.entries.length === 1 ? '' : 's'}`, icon: 'chain' });
  if (bestYear && bestYear[1] > 0) tiles.push({ label: 'Best year', value: String(bestYear[0]), sub: `${fmtMoney(bestYear[1])} revenue`, icon: 'calendar' });
  tiles.push({ label: 'Career', value: `${st.gamesReleased} games`, sub: `${fmtUnits(st.totalUnits)} sold · ${st.awardsWon} award${st.awardsWon === 1 ? '' : 's'} · ${st.hits} hit${st.hits === 1 ? '' : 's'}`, icon: 'trophy' });
  return (
    <section aria-label="Studio records">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink3">Studio records</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((x) => {
          const body = (
            <>
              <div className="flex items-center gap-1.5 text-[11px] text-ink3">
                <Icon name={x.icon} size={12} /> {x.label}
              </div>
              <div className="truncate text-sm font-semibold">{x.value}</div>
              <div className="truncate text-[11px] text-ink3">{x.sub}</div>
            </>
          );
          return x.onClick ? (
            <button key={x.label} type="button" onClick={x.onClick} className="min-w-0 rounded-xl border border-line bg-bg2/40 p-2 text-left hover:bg-bg2">
              {body}
            </button>
          ) : (
            <div key={x.label} className="min-w-0 rounded-xl border border-line bg-bg2/40 p-2">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
