import { useEffect } from 'react';
import { Button } from '../components/ui';
import { Icon } from '../icons';
import { useGame } from '../store';
import { useSettings } from '../settings';

interface Step {
  title: string;
  body: string;
  /** Advance automatically when true. */
  done?: (g: ReturnType<typeof useGame.getState>) => boolean;
  next?: string;
  target?: string; // data-tutorial attribute to highlight
}

const STEPS: Step[] = [
  { title: 'Welcome to your garage', body: 'You’ve just founded a game studio. Let’s make your first game — it only takes a minute.', next: 'Let’s go' },
  { title: 'Open the Develop panel', body: 'Click Develop on the left (or press N), then choose “New game”.', done: (g) => g.panel === 'develop', target: 'rail-develop' },
  { title: 'Design your game', body: 'Pick a name, genre, topic and platform. Good genre/topic combos score better — but you’ll only learn the fit by shipping. Then press “Start development”.', done: (g) => !!g.s && Object.values(g.s.projects).some((p) => p.kind === 'game'), target: 'start-dev' },
  { title: 'Let time run', body: 'Press play (Space) or pick a speed at the top. Watch your team work. At each phase gate you’ll decide where to focus effort.', done: (g) => g.speed > 0 },
  { title: 'Phase gates & reviews', body: 'When a phase ends, the game pauses so you can adjust focus. When it ships, critics review it — hover any number to see why.', done: (g) => !!g.s && g.s.releaseOrder.length > 0 },
  { title: 'Grow the studio', body: 'Hire people from the Staff panel (H) when you can afford them, and assign someone to Research (R) to unlock new tech.', done: (g) => !!g.s && (g.s.progress.stats.staffHired > 0 || !!g.s.research.active), target: 'rail-staff' },
  { title: 'You’ve got this', body: 'Shape your office in build mode (B) — break areas, décor and space affect morale and productivity. Keep an eye on cash. Good luck!', next: 'Finish' },
];

export function Tutorial() {
  const s = useGame((g) => g.s);
  useGame((g) => g.v);
  const panel = useGame((g) => g.panel);
  const speed = useGame((g) => g.speed);
  const act = useGame((g) => g.act);
  const show = useSettings((x) => x.showTutorial);
  const step = s?.progress.tutorialStep ?? 99;
  const cur = STEPS[step];

  useEffect(() => {
    if (!cur?.done) return;
    if (cur.done(useGame.getState())) act({ type: 'tutorial', step: step + 1 });
  }, [cur, step, act, panel, speed, s?.day]);

  // Highlight the target element
  useEffect(() => {
    if (!cur?.target) return;
    const el = document.querySelector<HTMLElement>(`[data-tutorial="${cur.target}"]`);
    if (!el) return;
    el.style.outline = '3px solid var(--gold)';
    el.style.outlineOffset = '3px';
    return () => {
      el.style.outline = '';
      el.style.outlineOffset = '';
    };
  }, [cur, panel]);

  if (!s || !show || !cur || s.status !== 'running') return null;
  return (
    <div className="glass absolute bottom-20 left-1/2 z-40 w-[min(420px,calc(100vw-1rem))] -translate-x-1/2 rounded-2xl p-4 animate-fade-up sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0" role="region" aria-label="Tutorial">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold">
          <Icon name="lightbulb" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink3">
            Tutorial · {step + 1}/{STEPS.length}
          </div>
          <h3 className="font-display font-semibold">{cur.title}</h3>
          <p className="mt-1 text-sm text-ink2">{cur.body}</p>
          <div className="mt-3 flex gap-2">
            {cur.next && (
              <Button size="sm" variant="primary" onClick={() => act({ type: 'tutorial', step: step + 1 >= STEPS.length ? 99 : step + 1 })}>
                {cur.next}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => act({ type: 'tutorial', step: 99 })}>
              Skip tutorial
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
