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
  { title: 'You’ve got this', body: 'Shape your office in build mode (B) — break areas, décor and space affect morale and productivity. The (?) button at the top has a full guide. Good luck!', next: 'Finish' },
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
  const nextBtn = cur.next && (
    <Button size="sm" variant="primary" onClick={() => act({ type: 'tutorial', step: step + 1 >= STEPS.length ? 99 : step + 1 })}>
      {cur.next}
    </Button>
  );
  return (
    <>
      {/* phones, with a panel open: a slim strip above the bottom bar so the panel stays usable */}
      {panel && (
        <div className="glass absolute bottom-[5.25rem] left-1/2 z-40 flex w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-2 animate-fade-up sm:hidden" role="region" aria-label="Tutorial">
          <Icon name="lightbulb" size={16} className="shrink-0 text-gold" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">
              {step + 1}/{STEPS.length} · {cur.title}
            </div>
            <div className="truncate text-[11px] text-ink3">{cur.body}</div>
          </div>
          {nextBtn}
          <button type="button" className="shrink-0 text-[11px] text-ink3 underline" onClick={() => act({ type: 'tutorial', step: 99 })}>
            Skip
          </button>
        </div>
      )}
      <div className={`glass absolute bottom-20 left-1/2 z-40 w-[min(420px,calc(100vw-1rem))] -translate-x-1/2 rounded-2xl p-4 animate-fade-up sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 ${panel ? 'hidden sm:block' : ''}`} role="region" aria-label="Tutorial">
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
              {nextBtn}
              <Button size="sm" variant="ghost" onClick={() => act({ type: 'tutorial', step: 99 })}>
                Skip tutorial
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
