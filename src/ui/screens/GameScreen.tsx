import { useCallback, useEffect, useRef, useState } from 'react';
import { OfficeCanvas } from '@/render/OfficeCanvas';
import type { OfficeRenderer } from '@/render/OfficeRenderer';
import { tierDef } from '@/sim/systems/office';
import { AutoSaver, type SaveStatus, type SlotId } from '@/services/saves';
import { useAuth } from '@/services/auth';
import { useGame, type PanelId } from '../store';
import { useGameLoop } from '../hooks/useGameLoop';
import { useSettings, prefersReducedMotion } from '../settings';
import { HUD } from '../game/HUD';
import { Rail } from '../game/Rail';
import { PanelHost } from '../game/PanelHost';
import { ModalHost } from '../game/ModalHost';
import { Toasts, NumberPops } from '../game/Feedback';
import { Tutorial } from '../game/Tutorial';
import { BuildBar } from '../game/BuildBar';
import { sound } from '../sound';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { navigate } from '../router';

const KEYS: Record<string, PanelId> = { n: 'develop', h: 'staff', b: 'office', r: 'research', m: 'market', f: 'finance', c: 'company', j: 'news', g: 'goals', l: 'releases' };

export function GameScreen({ slotId }: { slotId: SlotId }) {
  const s = useGame((g) => g.s);
  const user = useAuth((a) => a.user);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle' });
  const saverRef = useRef<AutoSaver | null>(null);
  const rendererRef = useRef<OfficeRenderer | null>(null);
  useGameLoop();

  // Autosave: local each in-game month, cloud throttled + on tab hide.
  useEffect(() => {
    if (!user) return;
    const saver = new AutoSaver(user.uid, slotId);
    saverRef.current = saver;
    const unsub = saver.subscribe(setSaveStatus);
    useGame.setState({ onMonth: (st) => void saver.save(st) });
    return () => {
      const st = useGame.getState().s;
      if (st) void saver.save(st, true);
      unsub();
      saver.dispose();
      useGame.setState({ onMonth: null });
    };
  }, [user, slotId]);

  const saveNow = useCallback(() => {
    const st = useGame.getState().s;
    if (st && saverRef.current) {
      void saverRef.current.save(st, true);
      useGame.getState().toast({ text: 'Game saved', tone: 'good', icon: 'save' });
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const g = useGame.getState();
      if (g.modals.length) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        g.togglePause();
        sound.play('click');
      } else if (k === '1') g.setSpeed(1);
      else if (k === '2') g.setSpeed(2);
      else if (k === '3' || k === '4') g.setSpeed(4);
      else if (k === '0' && e.shiftKey) g.setSpeed(0);
      else if (k === 'escape') {
        if (g.build) g.setBuild(null);
        else g.openPanel(null);
      } else if (k === '?') g.pushModal({ kind: 'shortcuts' });
      else if (k === 'p' && e.shiftKey) saveNow();
      else if (KEYS[k] && !(k === 'r' && g.build)) g.openPanel(KEYS[k]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow]);

  // Coin bursts in the office when income lands
  const pops = useGame((g) => g.pops);
  useEffect(() => {
    if (pops.length && useSettings.getState().numberPops) rendererRef.current?.burst(Math.min(12, 3 + pops.length * 2));
  }, [pops]);

  if (!s) return null;
  const tier = tierDef(s.office.tier);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[var(--scene-bg)]">
      <OfficeCanvas
        className="absolute inset-0"
        ariaLabel={`${s.company.name}'s ${tier.name}`}
        getState={() => useGame.getState().s}
        getUI={() => {
          const g = useGame.getState();
          return { floor: g.floor, build: g.build, heat: g.heat, selectedStaff: g.selectedStaff, speed: g.speed, reducedMotion: prefersReducedMotion(useSettings.getState()), leftInset: g.panel ? 640 : 80 };
        }}
        onReady={(r) => (rendererRef.current = r)}
        onStaffClick={(id) => {
          useGame.getState().selectStaff(id);
          useGame.getState().pushModal({ kind: 'staff', staffId: id });
        }}
        onTileClick={(x, y, floor) => {
          const g = useGame.getState();
          const b = g.build;
          if (!b) return;
          if (b.item) {
            const r = g.act({ type: 'placeItem', item: b.item, floor, x, y, rot: b.rot });
            if (r.ok) sound.play('place');
            else g.toast({ text: r.error, tone: 'bad' });
          } else if (b.moving) {
            const it = g.s?.office.items.find((i) => i.id === b.moving);
            const r = g.act({ type: 'moveItem', id: b.moving, floor, x, y, rot: b.rot });
            if (r.ok) {
              sound.play('place');
              g.setBuild({ rot: it?.rot ?? 0, selected: b.moving });
            } else g.toast({ text: r.error, tone: 'bad' });
          } else g.setBuild({ rot: b.rot });
        }}
        onItemClick={(it) => {
          const g = useGame.getState();
          if (g.build && !g.build.item && !g.build.moving) g.setBuild({ rot: it.rot, selected: it.id });
        }}
        onCancel={() => {
          const g = useGame.getState();
          if (g.build?.item || g.build?.moving) g.setBuild({ rot: 0 });
        }}
        onRotate={() => {
          const g = useGame.getState();
          if (g.build) g.setBuild({ ...g.build, rot: g.build.rot ? 0 : 1 });
        }}
      />
      <HUD saveStatus={saveStatus} onSave={saveNow} onExit={() => {
        saveNow();
        navigate('slots');
      }} onZoom={(f) => (f === 0 ? rendererRef.current?.fit() : rendererRef.current?.zoomBy(f))} />
      <Rail />
      <BuildBar />
      <PanelHost />
      <NumberPops />
      <Toasts />
      <Tutorial />
      <ErrorBoundary inline onReset={() => useGame.getState().popModal()}>
        <ModalHost slotId={slotId} />
      </ErrorBoundary>
    </div>
  );
}
