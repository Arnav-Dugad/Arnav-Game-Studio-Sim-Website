import { formatDate } from '@/sim/calendar';
import { MEDIUM_LABEL, sentiment, type BuzzPost } from '../game/buzz';
import { fmtUnits } from '@/sim/util';
import { cx } from './ui';

const AVATAR = [0xe07a5f, 0x3d85c6, 0x5f9e6e, 0x9b6bd3, 0xf2c450, 0xd17be0, 0x4fb3a9];

function hue(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `#${AVATAR[h % AVATAR.length]!.toString(16).padStart(6, '0')}`;
}

/** A feed of player posts. Magazine letters read as letters; later eras look like posts. */
export function BuzzList({ posts, showGame = true }: { posts: BuzzPost[]; showGame?: boolean }) {
  return (
    <ol className="space-y-1.5">
      {posts.map((p) =>
        p.medium === 'letter' ? (
          <li key={p.id} className="rounded-xl border border-line bg-bg2/40 p-2.5">
            <div className="font-display text-sm italic leading-snug">“{p.text}”</div>
            <div className="mt-1 text-[11px] text-ink3">
              — {p.author}
              {showGame && <> · on <b className="text-ink2">{p.game}</b></>} · {MEDIUM_LABEL.letter}, {formatDate(p.day, false)}
            </div>
          </li>
        ) : (
          <li key={p.id} className="flex gap-2.5 rounded-xl border border-line p-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: hue(p.author) }} aria-hidden>
              {p.author[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 text-[11px]">
                <span className={cx('font-semibold text-ink', p.medium === 'bbs' && 'font-mono')}>{p.medium === 'bbs' ? p.author : `@${p.author}`}</span>
                <span className="text-ink3">· {formatDate(p.day)}</span>
                <span className={cx('ml-auto size-1.5 shrink-0 rounded-full', p.tone === 'good' ? 'bg-good' : p.tone === 'bad' ? 'bg-bad' : 'bg-ink3')} aria-label={p.tone === 'good' ? 'positive' : p.tone === 'bad' ? 'negative' : 'neutral'} />
              </div>
              <div className={cx('text-sm leading-snug', p.medium === 'bbs' && 'font-mono text-xs')}>{p.text}</div>
              <div className="mt-0.5 text-[11px] text-ink3">
                {showGame && <>re: <b className="text-ink2">{p.game}</b> · </>}
                {MEDIUM_LABEL[p.medium]}
                {p.likes > 0 && <> · ♥ {fmtUnits(p.likes)}</>}
              </div>
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

/** "78% positive" style summary. */
export function BuzzMeter({ posts }: { posts: BuzzPost[] }) {
  const v = sentiment(posts);
  if (v === null) return null;
  const pct = Math.round(v * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bad/30">
        <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
      </div>
      <span className={cx('num font-semibold', pct >= 60 ? 'text-good' : pct < 40 ? 'text-bad' : 'text-ink2')}>{pct}% positive</span>
    </div>
  );
}
