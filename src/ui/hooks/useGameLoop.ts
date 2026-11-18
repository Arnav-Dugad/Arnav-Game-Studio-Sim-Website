import { useEffect } from 'react';
import { advance } from '@/sim/advance';
import { handleEvents, MS_PER_DAY, useGame } from '../store';

/**
 * Fixed-step simulation driver. Real time accumulates; whole days are simulated at the speed's rate.
 * Rendering (Pixi) runs independently at 60fps; React re-renders once per simulated batch.
 */
export function useGameLoop(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(250, now - last);
      last = now;
      const { s, speed, modals } = useGame.getState();
      if (!s || speed === 0 || s.status !== 'running') {
        acc = 0;
        return;
      }
      // Blocking modals pause time (a decision only does when "pause when a decision is needed" is on; otherwise the
      // clock keeps running under it, and an unanswered one settles itself as the event says)
      if (modals.some((m) => (m.kind === 'event' && s.settings.autopause.events) || m.kind === 'gate' || m.kind === 'gameOver' || m.kind === 'insolvent' || m.kind === 'majorNews' || m.kind === 'guide' || m.kind === 'shortcuts' || m.kind === 'bugBash' || m.kind === 'trailerCut' || m.kind === 'coverArt' || m.kind === 'identity')) {
        acc = 0;
        return;
      }
      acc += dt;
      const msPerDay = MS_PER_DAY[speed];
      let days = 0;
      while (acc >= msPerDay && days < 6) {
        acc -= msPerDay;
        days++;
        try {
          handleEvents(advance(s, 1));
        } catch (e) {
          // never spin on a broken day: stop the clock and say so (the save is untouched)
          console.error('Simulation error', e);
          useGame.setState({ speed: 0 });
          useGame.getState().toast({ text: 'Something went wrong simulating this day — the game is paused. Your save is safe.', tone: 'bad' });
          acc = 0;
          break;
        }
        // A pausing event (gate, review, choice) stops the batch on that exact day.
        if (useGame.getState().speed === 0 || s.status !== 'running') {
          acc = 0;
          break;
        }
      }
      if (days > 0) useGame.setState((st) => ({ v: st.v + 1 }));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
