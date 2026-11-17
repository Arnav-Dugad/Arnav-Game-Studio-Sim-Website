import { useEffect, useState } from 'react';
import { FanArt } from '../art/Cover';
import { MAX_PINNED, unreadFanMail } from '@/sim/systems/fanMail';
import { Button } from '../components/ui';
import type { NewsCategory } from '@/data/types';
import { formatDate } from '@/sim/calendar';
import { BuzzList, BuzzMeter } from '../components/BuzzList';
import { Empty, Segmented, cx } from '../components/ui';
import { studioBuzz } from '../game/buzz';
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
  const panelTab = useGame((g) => g.panelTab);
  const [cat, setCat] = useState<NewsCategory | 'all' | 'awards' | 'buzz' | 'mail'>(() => (panelTab === 'awards' ? 'awards' : panelTab === 'buzz' ? 'buzz' : panelTab === 'mail' ? 'mail' : 'all'));
  // Follow requests to jump to a tab while the panel is already open (e.g. the gala's "All results").
  const [seenTab, setSeenTab] = useState(panelTab);
  if (panelTab !== seenTab) {
    setSeenTab(panelTab);
    if (panelTab === 'awards') setCat('awards');
    if (panelTab === 'buzz') setCat('buzz');
    if (panelTab === 'mail') setCat('mail');
  }
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
          { value: 'buzz', label: 'Buzz' },
          { value: 'industry', label: 'Industry' },
          { value: 'platform', label: 'Platforms' },
          { value: 'rival', label: 'Rivals' },
          { value: 'staff', label: 'Staff' },
          { value: 'tech', label: 'Tech' },
          { value: 'awards', label: 'Awards' },
          { value: 'mail', label: unreadFanMail(s) ? `Fan mail (${unreadFanMail(s)})` : 'Fan mail' },
        ]}
      />
      {cat === 'mail' ? (
        <FanMailBox />
      ) : cat === 'awards' ? (
        <Awards />
      ) : cat === 'buzz' ? (
        <Buzz />
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

/** What players are saying about your recent games. */
function Buzz() {
  const s = useGame((g) => g.s)!;
  const posts = studioBuzz(s, 50);
  if (!posts.length) return <Empty icon="people" title="No buzz yet">Release a game and players will start talking about it here.</Empty>;
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-bg2/50 p-2.5">
        <div className="mb-1 text-xs text-ink3">Player sentiment across your recent games</div>
        <BuzzMeter posts={posts} />
      </div>
      <BuzzList posts={posts} />
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

function FanMailBox() {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const unread = unreadFanMail(s);
  useEffect(() => {
    if (unread) act({ type: 'readFanMail' });
  }, [unread, act]);
  const mail = [...(s.fanMail ?? [])].reverse();
  const hasWall = s.office.items.some((i) => i.item === 'fan_wall');
  const pinned = mail.filter((m) => m.pinned).length;
  if (!mail.length) return <Empty icon="heart" title="No fan mail yet">Players write in about games they love (72+). Kids send drawings, too.</Empty>;
  return (
    <div>
      <p className="mb-2 text-xs text-ink3">
        {s.progress.stats.fanMail ?? mail.length} letters and drawings so far. Each one lifts the morale of the people who made that game.{' '}
        {hasWall ? `Pin drawings to your Fan Art Wall (${pinned}/${MAX_PINNED}): each adds a little morale.` : 'Build a Fan Art Wall (Build → Decor) to pin the drawings up.'}
      </p>
      <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2">
        {mail.map((m) =>
          m.kind === 'art' ? (
            <div key={m.id} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-bg2/40 p-2.5">
              <FanArt topic={m.topic} seed={m.seed} caption={m.text} by={`${m.from}${m.age ? `, ${m.age}` : ''}`} size={150} />
              <div className="text-center text-[11px] text-ink3">
                A drawing of <b className="text-ink2">{m.game}</b> · {formatDate(m.day)}
              </div>
              {hasWall && (
                <Button size="sm" variant={m.pinned ? 'primary' : 'secondary'} onClick={() => useGame.getState().actOrToast({ type: 'pinFanArt', id: m.id, on: !m.pinned })}>
                  {m.pinned ? 'Pinned 📌' : 'Pin to the wall'}
                </Button>
              )}
            </div>
          ) : (
            <div key={m.id} className="rounded-xl border border-line bg-[#fffdf6] p-3 text-[#2a2622] dark:bg-[#2b2620] dark:text-[#f1ede6]">
              <p className="text-sm leading-snug" style={{ fontFamily: "'Comic Sans MS','Chalkboard SE','Comic Neue',cursive" }}>
                Dear {s.company.name},<br />
                {m.text}
              </p>
              <p className="mt-1.5 text-right text-xs" style={{ fontFamily: "'Comic Sans MS','Chalkboard SE','Comic Neue',cursive" }}>
                — {m.from}
                {m.age ? `, age ${m.age}` : ''}
              </p>
              <div className="mt-1 text-[11px] opacity-60">
                About {m.game} · {formatDate(m.day)}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
