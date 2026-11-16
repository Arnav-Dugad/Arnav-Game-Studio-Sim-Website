import { useMemo, type ReactNode } from 'react';
import { ACHIEVEMENTS } from '@/sim/systems/achievements';
import { formatDate, fromDay } from '@/sim/calendar';
import { fmtUnits } from '@/sim/util';
import type { GameState } from '@/sim/types';
import { Empty, cx } from '../components/ui';
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
      icon: r.score >= 85 ? 'crown' : r.score < 45 ? 'skull' : r.concept.remasterOf ? 'sparkle' : 'rocket',
      text: `${r.name} released${r.concept.remasterOf ? ' (remaster)' : ''}`,
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
  return <ol className="ml-3 border-l border-line">{rows}</ol>;
}
