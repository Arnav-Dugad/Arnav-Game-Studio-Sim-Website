import { useState } from 'react';
import type { NewsCategory } from '@/data/types';
import { formatDate } from '@/sim/calendar';
import { Empty, Segmented, cx } from '../components/ui';
import { Icon, type IconName } from '../icons';
import { useGame } from '../store';

const CAT_ICON: Record<NewsCategory, IconName> = {
  industry: 'globe',
  platform: 'controller',
  rival: 'company',
  studio: 'building',
  staff: 'staff',
  market: 'market',
  tech: 'flask',
};

export default function NewsPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const [cat, setCat] = useState<NewsCategory | 'all' | 'awards'>(() => (useGame.getState().panelTab === 'awards' ? 'awards' : 'all'));
  const news = [...s.news].reverse().filter((n) => cat === 'all' || n.category === cat);
  return (
    <div>
      <Segmented
        ariaLabel="News filter"
        value={cat}
        onChange={setCat}
        className="mb-3"
        options={[
          { value: 'all', label: 'All' },
          { value: 'studio', label: 'You' },
          { value: 'industry', label: 'Industry' },
          { value: 'platform', label: 'Platforms' },
          { value: 'rival', label: 'Rivals' },
          { value: 'staff', label: 'Staff' },
          { value: 'tech', label: 'Tech' },
          { value: 'awards', label: 'Awards' },
        ]}
      />
      {cat === 'awards' ? (
        <Awards />
      ) : (
        <>
      {news.length === 0 && <Empty icon="news" title="Nothing here yet" />}
      <ol className="space-y-1.5">
        {news.slice(0, 150).map((n) => (
          <li key={n.id} className="flex gap-3 rounded-xl border border-line p-2.5">
            <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', n.tone === 'good' ? 'bg-good/15 text-good' : n.tone === 'bad' ? 'bg-bad/15 text-bad' : 'bg-bg2 text-ink2')}>
              <Icon name={CAT_ICON[n.category]} size={15} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-snug">{n.headline}</div>
              {n.body && <div className="mt-0.5 text-xs text-ink2">{n.body}</div>}
              <div className="num mt-0.5 text-[11px] text-ink3">{formatDate(n.day)}</div>
            </div>
          </li>
        ))}
      </ol>
        </>
      )}
    </div>
  );
}

/** Golden Pixel Gala results, newest year first. */
function Awards() {
  const s = useGame((g) => g.s)!;
  const years = [...(s.awardHistory ?? [])].reverse();
  if (!years.length) return <Empty icon="trophy" title="No ceremonies yet">The Golden Pixel Gala is held every January for the year before.</Empty>;
  return (
    <div className="space-y-3">
      {years.map((y) => (
        <section key={y.year} className="rounded-2xl border border-line p-3">
          <h3 className="font-display mb-1.5 text-sm font-semibold">Golden Pixel Gala {y.year}</h3>
          <ul className="space-y-1 text-xs">
            {y.winners.map((w) => (
              <li key={w.category} className={cx('flex items-center gap-2 rounded-lg px-2 py-1', w.mine ? 'bg-gold/15' : 'bg-bg2/50')}>
                <Icon name={w.category === 'Game of the Year' ? 'trophy' : 'medal'} size={13} className={w.mine ? 'text-gold' : 'text-ink3'} />
                <span className="w-32 shrink-0 text-ink3">{w.category}</span>
                {w.mine && w.releaseId ? (
                  <button type="button" className="min-w-0 truncate text-left font-semibold hover:underline" onClick={() => useGame.getState().pushModal({ kind: 'release', releaseId: w.releaseId! })}>
                    {w.name}
                  </button>
                ) : (
                  <span className="min-w-0 truncate font-semibold">{w.name}</span>
                )}
                <span className="ml-auto shrink-0 truncate text-ink3">{w.company}</span>
                <span className="num w-7 shrink-0 text-right font-semibold">{w.score}</span>
              </li>
            ))}
            {y.winners.length === 0 && <li className="text-ink3">No game impressed the jury enough this year.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
