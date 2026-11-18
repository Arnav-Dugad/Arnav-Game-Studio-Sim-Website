import { useCallback, useEffect, useRef, useState } from 'react';
import { possessive } from '@/sim/util';
import { isRainy } from '@/render/weather';
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
import { ProjectDock, YearInReview } from '../game/Dock';
import { sound } from '../sound';
import { music } from '../music';
import { ambience } from '../ambience';
import { formatDate, fromDay } from '@/sim/calendar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { navigate } from '../router';

const KEYS: Record<string, PanelId> = { n: 'develop', h: 'staff', b: 'office', r: 'research', m: 'market', f: 'finance', c: 'company', j: 'news', g: 'goals', l: 'releases', o: 'overview', '`': 'cheats' };

export function GameScreen({ slotId }: { slotId: SlotId }) {
  const s = useGame((g) => g.s);
  const owner = useGame((g) => g.uid);
  const user = useAuth((a) => a.user);
  const wrongUser = !!user && !!owner && user.uid !== owner;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle' });
  const saverRef = useRef<AutoSaver | null>(null);
  const rendererRef = useRef<OfficeRenderer | null>(null);
  const paintRef = useRef({ placed: 0, lastError: '' });
  useGameLoop();
  // Era-aware generative soundtrack (starts on the first click/key if the browser blocks autoplay).
  useEffect(() => {
    music.start({ year: () => fromDay(useGame.getState().s?.day ?? 0).year, active: () => useGame.getState().speed > 0 });
    return () => music.stop();
  }, []);
  // Office ambience: keyboards, chatter, coffee, phones and pets, following what the office is doing.
  useEffect(() => {
    ambience.start(() => {
      const r = rendererRef.current;
      const g = useGame.getState();
      if (!r || !g.s) return null;
      const d = fromDay(g.s.day);
      return { ...r.ambienceStats(), year: d.year, active: g.speed > 0, rain: isRainy(g.s.day, d.month) };
    });
    return () => ambience.stop();
  }, []);

  // Autosave: local each in-game month, cloud throttled + on tab hide.
  useEffect(() => {
    // Only ever save under the account that owns this game.
    if (!owner) return;
    const saver = new AutoSaver(owner, slotId);
    saverRef.current = saver;
    const unsub = saver.subscribe(setSaveStatus);
    // Never write another slot's game into this slot (e.g. if a different save was loaded meanwhile).
    const mine = () => useGame.getState().slotId === slotId;
    useGame.setState({ onMonth: (st) => void (mine() && saver.save(st)) });
    saver.setSource(() => (mine() ? useGame.getState().s : null)); // closing the tab saves even a brand-new game
    // and every change is on disk within a moment or two, so even a reload right after can't lose it
    let pending: ReturnType<typeof setTimeout> | undefined;
    useGame.setState({
      onAction: () => {
        clearTimeout(pending);
        pending = setTimeout(() => {
          const st = useGame.getState().s;
          if (st && mine()) void saver.save(st); // on this device now; the cloud on its usual schedule
        }, 1_200);
      },
    });
    return () => {
      const st = useGame.getState().s;
      if (st && mine()) void saver.save(st, true);
      clearTimeout(pending);
      unsub();
      saver.dispose();
      useGame.setState({ onMonth: null, onAction: null });
    };
  }, [owner, slotId]);

  // If the signed-in account changes underneath us (sign-out, auth restoring after guest play), leave.
  useEffect(() => {
    if (!wrongUser) return;
    useGame.getState().unload();
    navigate('slots', true);
  }, [wrongUser]);

  const saveNow = useCallback(async () => {
    const st = useGame.getState().s;
    if (!st || !saverRef.current || useGame.getState().slotId !== slotId) return;
    await saverRef.current.save(st, true);
    const status = saverRef.current.status;
    if (status.state === 'error') useGame.getState().toast({ text: `Save failed: ${status.error ?? 'unknown error'}`, tone: 'bad' });
    else useGame.getState().toast({ text: status.state === 'offline' ? 'Saved on this device (offline)' : 'Game saved', tone: 'good', icon: 'save' });
  }, [slotId]);

  // Cinematic mode (V): hide the interface and let the camera wander the office
  const [cinema, setCinema] = useState(false);
  const cinemaRef = useRef(false);
  const toggleCinema = useCallback((on?: boolean) => {
    const r = rendererRef.current;
    if (!r) return;
    const next = on ?? !cinemaRef.current;
    if (next === cinemaRef.current) return;
    cinemaRef.current = next;
    r.setCinematic(next);
    if (next) useGame.setState({ panel: null, build: null }); // look-only: nothing open, nothing being built
    setCinema(next);
  }, []);

  // Keyboard shortcuts
  // Office photo (Menu → Office photo, or P)
  const takePhoto = useCallback(async () => {
      const g = useGame.getState();
      const st = g.s;
      if (!st || !rendererRef.current) return;
      const staffN = Object.keys(st.staff).length;
      let blob: Blob | null;
      try {
        blob = await rendererRef.current.snapshot(st.company.name, `${formatDate(st.day)} · ${staffN} ${staffN === 1 ? 'person' : 'people'} · ${st.releaseOrder.length} games released`);
      } catch {
        blob = null;
      }
      if (!blob) return g.toast({ text: 'Couldn’t take the photo', tone: 'bad' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${st.company.name.replace(/[^\w -]+/g, '').trim() || 'studio'} ${fromDay(st.day).year}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      g.toast({ text: 'Office photo saved', tone: 'good', icon: 'camera' });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && useGame.getState().build && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        const r = useGame.getState().act({ type: 'undoPlace' });
        if (r.ok) sound.play('sell');
        else useGame.getState().toast({ text: r.error, tone: 'neutral' });
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const g = useGame.getState();
      if (g.modals.length) return;
      const k = e.key.toLowerCase();
      // Space presses a focused button, option or link; it only pauses when nothing like that has focus
      if (k === ' ' && (e.target as HTMLElement | null)?.closest?.('button, a[href], summary, [role="radio"], [role="tab"], [role="checkbox"], [role="switch"], [role="button"]')) return;
      if (k === ' ') {
        e.preventDefault();
        g.togglePause();
        sound.play('click');
      } else if (k === '1') g.setSpeed(1);
      else if (k === '2') g.setSpeed(2);
      else if (k === '3' || k === '4') g.setSpeed(4);
      else if (k === 'v') toggleCinema();
      else if (k === 'escape' && cinemaRef.current) toggleCinema(false);
      else if (cinemaRef.current) return; // the interface is hidden: no panels
      else if (k === 'escape') {
        // one step back at a time: drop what's in hand (or the selection), then leave build mode, then close the panel
        if (g.build && (g.build.item || g.build.moving || g.build.selected)) g.setBuild({ ...g.build, item: undefined, moving: undefined, selected: undefined });
        else if (g.build) g.setBuild(null);
        else g.openPanel(null);
      } else if (k === '?') g.pushModal({ kind: 'shortcuts' });
      else if (k === 'p' && e.shiftKey) void saveNow();
      else if (k === 'p') void takePhoto();
      else if (KEYS[k] && !(k === 'r' && g.build)) g.openPanel(KEYS[k]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, takePhoto, toggleCinema]);

  // Coin bursts in the office when income lands
  const pops = useGame((g) => g.pops);
  useEffect(() => {
    if (pops.length && useSettings.getState().numberPops) rendererRef.current?.burst(Math.min(12, 3 + pops.length * 2));
  }, [pops]);

  // The team cheers when a hit launches or an award comes home.
  const cheer = useGame((g) => g.cheer);
  useEffect(() => {
    if (cheer > 0) rendererRef.current?.celebrate(!prefersReducedMotion(useSettings.getState()));
  }, [cheer]);
  const gloom = useGame((g) => g.gloom);
  useEffect(() => {
    if (gloom > 0) rendererRef.current?.sulk();
  }, [gloom]);

  if (!s) return null;
  const tier = tierDef(s.office.tier);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[var(--scene-bg)]">
      <OfficeCanvas
        className="absolute inset-0"
        ariaLabel={`${possessive(s.company.name)} ${tier.name}`}
        getState={() => useGame.getState().s}
        getUI={() => {
          const g = useGame.getState();
          const floors = g.s ? tierDef(g.s.office.tier).floors : 1;
          // a smaller office has fewer floors: drawing and input must agree on one that exists
          return { floor: Math.max(0, Math.min(g.floor, floors - 1)), build: g.build, heat: g.heat, selectedStaff: g.selectedStaff, speed: g.speed, reducedMotion: prefersReducedMotion(useSettings.getState()), leftInset: g.panel ? 640 : 80, modalOpen: g.modals.length > 0 };
        }}
        onReady={(r) => {
          rendererRef.current = r;
          if (import.meta.env.DEV) (window as unknown as { __renderer?: unknown }).__renderer = r;
        }}
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
        onPaint={(x, y, floor) => {
          const g = useGame.getState();
          const b = g.build;
          if (!b?.item) return;
          const r = g.act({ type: 'placeItem', item: b.item, floor, x, y, rot: b.rot });
          if (r.ok) {
            paintRef.current.placed += 1;
            sound.play('place');
          } else paintRef.current.lastError = r.error;
        }}
        onPaintEnd={() => {
          const p = paintRef.current;
          const g = useGame.getState();
          if (p.placed > 1) g.toast({ text: `Placed ${p.placed} items`, tone: 'good', icon: 'build' });
          else if (!p.placed && p.lastError) g.toast({ text: p.lastError, tone: 'bad' });
          paintRef.current = { placed: 0, lastError: '' };
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
      {!cinema && (
        <HUD
          saveStatus={saveStatus}
          onSave={() => void saveNow()}
          onExit={async () => {
            useGame.getState().setSpeed(0);
            await saveNow();
            navigate('slots');
            useGame.getState().unload();
          }}
          onZoom={(f) => (f === 0 ? rendererRef.current?.fit() : rendererRef.current?.zoomBy(f))}
          onPhoto={() => void takePhoto()}
          onCinema={() => toggleCinema(true)}
        />
      )}
      {!cinema && (
        <>
          <Rail />
          <BuildBar />
          <ProjectDock />
          <YearInReview />
          <PanelHost />
        </>
      )}
      {cinema && (
        <button type="button" onClick={() => toggleCinema(false)} className="glass absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-semibold text-ink2 opacity-70 transition hover:opacity-100">
          Cinematic mode · press V or Esc to return
        </button>
      )}
      <NumberPops />
      <Toasts />
      {!cinema && <Tutorial />}
      <ErrorBoundary inline onReset={() => useGame.getState().popModal()}>
        <ModalHost slotId={slotId} />
      </ErrorBoundary>
    </div>
  );
}
