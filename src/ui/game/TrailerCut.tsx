import { useEffect, useRef, useState } from 'react';
import { SHOTS, scoreCut, type ShotId } from './trailer';
import { Button, Modal, cx } from '../components/ui';
import { useGame } from '../store';
import { sound } from '../sound';

const DURATION = 25;

/** Cut the trailer: pick four shots in order before the deadline; good pacing earns hype. */
export function TrailerCutModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const p = s.projects[projectId];
  const [phase, setPhase] = useState<'ready' | 'play' | 'done'>('ready');
  const [cut, setCut] = useState<ShotId[]>([]);
  const [now, setNow] = useState(0);
  const start = useRef(0);
  const applied = useRef(false);
  // six shots to choose from, always including the title card
  const [deck] = useState<ShotId[]>(() => {
    const pool = (Object.keys(SHOTS) as ShotId[]).filter((x) => x !== 'title').sort(() => Math.random() - 0.5).slice(0, 5);
    return [...pool, 'title' as ShotId].sort(() => Math.random() - 0.5);
  });
  const genre = p && p.kind === 'game' ? p.concept.genre : 'action';
  const result = scoreCut(cut, genre);

  useEffect(() => {
    if (phase !== 'play') return;
    start.current = performance.now();
    let raf = 0;
    const loop = () => {
      const t = (performance.now() - start.current) / 1000;
      setNow(t);
      if (t >= DURATION) {
        setPhase('done');
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'done' || applied.current) return;
    applied.current = true;
    const r = scoreCut(cut, genre);
    useGame.getState().actOrToast({ type: 'trailerCut', projectId, points: r.points }, r.points >= 7 ? 'The trailer is a hit! 🎬' : `Trailer cut: ${r.points}/8`);
    sound.play(r.points >= 6 ? 'success' : 'notify');
  }, [phase, cut, genre, projectId]);

  if (!p || p.kind !== 'game') return null;
  const pick = (id: ShotId) => {
    if (phase !== 'play' || cut.includes(id) || cut.length >= 4) return;
    sound.play('click');
    const next = [...cut, id];
    setCut(next);
    if (next.length === 4) setPhase('done');
  };
  return (
    <Modal open onClose={phase === 'play' ? () => undefined : onClose} title="Cut the trailer" dismissable={phase !== 'play'}>
      <h2 className="font-display text-xl font-semibold">Cut the trailer: {p.concept.name}</h2>
      {phase === 'ready' ? (
        <>
          <p className="mt-1 text-sm text-ink2">
            Pick four shots, in order, in {DURATION} seconds. Good trailers <b>open with a hook</b>, take <b>a moment to breathe</b>, <b>build to a climax</b> and <b>end on the title card</b> — and shots that suit the genre land better. A great cut is worth up to +0.4 hype. One trailer per game.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button variant="primary" icon="play" onClick={() => setPhase('play')}>
              Start editing
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span>Your cut: {cut.length}/4</span>
            <span className="num text-ink3">{phase === 'play' ? `${Math.max(0, DURATION - now).toFixed(1)}s` : 'Done'}</span>
          </div>
          {/* the timeline */}
          <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-xl bg-[#14161b] p-2">
            {[0, 1, 2, 3].map((i) => {
              const id = cut[i];
              return (
                <button
                  key={i}
                  type="button"
                  disabled={phase !== 'play' || id === undefined}
                  onClick={() => setCut((c) => c.slice(0, i))}
                  className="grid aspect-video place-items-center rounded-md border border-white/10 text-2xl text-white/40"
                  style={id ? { background: SHOTS[id].bg, color: '#fff' } : undefined}
                  aria-label={id ? `Shot ${i + 1}: ${SHOTS[id].name} (click to cut from here)` : `Empty slot ${i + 1}`}
                >
                  {id ? SHOTS[id].emoji : i + 1}
                </button>
              );
            })}
          </div>
          {/* the footage */}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {deck.map((id) => (
              <button
                key={id}
                type="button"
                disabled={phase !== 'play' || cut.includes(id)}
                onClick={() => pick(id)}
                className={cx('flex flex-col items-center gap-0.5 rounded-xl border border-line p-2 text-xs transition', cut.includes(id) ? 'opacity-30' : 'hover:-translate-y-0.5 hover:shadow')}
                style={{ background: `linear-gradient(${SHOTS[id].bg}, #111)`, color: '#fff' }}
              >
                <span className="text-2xl">{SHOTS[id].emoji}</span>
                <span className="font-semibold">{SHOTS[id].name}</span>
              </button>
            ))}
          </div>
          {phase === 'done' && (
            <div className="mt-3 rounded-xl bg-bg2/60 p-3 text-sm">
              <div className="font-display text-lg font-semibold">
                {result.points >= 7 ? 'A masterpiece of a trailer' : result.points >= 5 ? 'A strong trailer' : result.points >= 3 ? 'A decent trailer' : 'A forgettable trailer'} · {result.points}/8
              </div>
              <ul className="mt-1 text-xs text-ink2">
                {result.why.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <div className="mt-3 flex justify-end">
                <Button variant="primary" onClick={onClose}>
                  Release it
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
