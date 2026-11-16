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
  const [cat, setCat] = useState<NewsCategory | 'all'>('all');
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
        ]}
      />
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
    </div>
  );
}
