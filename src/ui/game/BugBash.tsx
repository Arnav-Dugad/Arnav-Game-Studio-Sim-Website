import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../components/ui';
import { useGame } from '../store';
import { sound } from '../sound';

const DURATION = 20;

interface Bug {
  id: number;
  x: number;
  y: number;
  born: number;
  life: number;
  hue: number;
  squashed?: number;
}

/** Twenty seconds of whack-a-bug during polish: every squash shaves ~1% off the game's bugs (25% at most). */
export function BugBashModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const p = s.projects[projectId];
  const [phase, setPhase] = useState<'ready' | 'play' | 'done'>('ready');
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [hits, setHits] = useState(0);
  const [now, setNow] = useState(0);
  const start = useRef(0);
  const nextId = useRef(1);
  const applied = useRef(false);

  useEffect(() => {
    if (phase !== 'play') return;
    start.current = performance.now();
    let spawnAt = 0;
    let raf = 0;
    const loop = () => {
      const t = (performance.now() - start.current) / 1000;
      setNow(t);
      if (t >= DURATION) {
        setPhase('done');
        return;
      }
      if (t >= spawnAt) {
        // faster and shorter-lived as time goes on
        spawnAt = t + Math.max(0.28, 0.75 - t * 0.022);
        const life = Math.max(0.75, 1.6 - t * 0.04);
        setBugs((bs) => [...bs.filter((b) => (b.squashed ? t - b.squashed < 0.35 : t - b.born < b.life)), { id: nextId.current++, x: 6 + Math.random() * 82, y: 8 + Math.random() * 76, born: t, life, hue: Math.floor(Math.random() * 4) }]);
      } else setBugs((bs) => bs.filter((b) => (b.squashed ? t - b.squashed < 0.35 : t - b.born < b.life)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'done' || applied.current) return;
    applied.current = true;
    useGame.getState().actOrToast({ type: 'bugBash', projectId, hits }, `Bug bash: ${hits} squashed!`);
  }, [phase, hits, projectId]);

  if (!p || p.kind !== 'game') return null;
  const pct = Math.min(25, hits);
  return (
    <Modal open onClose={phase === 'play' ? () => undefined : onClose} title="Bug bash" dismissable={phase !== 'play'}>
      <h2 className="font-display text-xl font-semibold">Bug bash: {p.concept.name}</h2>
      {phase === 'ready' && (
        <>
          <p className="mt-1 text-sm text-ink2">The whole team plays the build for an afternoon. Squash as many bugs as you can in {DURATION} seconds — every squash fixes about 1% of the remaining bugs (up to 25%). One bug bash per game.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button variant="primary" icon="play" onClick={() => setPhase('play')}>
              Start!
            </Button>
          </div>
        </>
      )}
      {phase !== 'ready' && (
        <>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span>
              Squashed <b className="num">{hits}</b>
            </span>
            <span className="num text-ink3">{phase === 'play' ? `${Math.max(0, DURATION - now).toFixed(1)}s` : 'Done'}</span>
          </div>
          <div className="relative mt-2 h-72 select-none overflow-hidden rounded-xl border border-line bg-[#1e232b]" style={{ touchAction: 'none' }}>
            {/* a fake game screen */}
            <div className="absolute inset-x-0 bottom-0 h-8 bg-[#2f8a63]" />
            <div className="absolute bottom-8 left-[12%] h-10 w-6 rounded bg-[#e07a5f]" />
            <div className="absolute bottom-16 left-[40%] h-3 w-24 rounded bg-[#8a6440]" />
            <div className="absolute bottom-28 left-[70%] h-3 w-16 rounded bg-[#8a6440]" />
            {bugs.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-label="Bug"
                disabled={phase !== 'play' || !!b.squashed}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (b.squashed || phase !== 'play') return;
                  setBugs((bs) => bs.map((x) => (x.id === b.id ? { ...x, squashed: now } : x)));
                  setHits((h) => h + 1);
                  sound.play('click');
                }}
                className="absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center text-2xl transition-transform"
                style={{ left: `${b.x}%`, top: `${b.y}%`, transform: `translate(-50%, -50%) scale(${b.squashed ? 1.4 : Math.min(1, (now - b.born) * 5)})`, opacity: b.squashed ? 0.4 : 1, filter: `hue-rotate(${b.hue * 70}deg)` }}
              >
                {b.squashed ? '💥' : '🐛'}
              </button>
            ))}
            {phase === 'done' && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 text-center text-white">
                <div>
                  <div className="font-display text-3xl font-bold">{hits} squashed</div>
                  <div className="text-sm opacity-80">About {pct}% of the remaining bugs fixed</div>
                </div>
              </div>
            )}
          </div>
          {phase === 'done' && (
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={onClose}>
                Back to work
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
