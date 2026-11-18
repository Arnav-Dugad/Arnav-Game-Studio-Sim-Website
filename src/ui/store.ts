/**
 * UI state + the bridge to the simulation. The GameState object is mutated in place by the sim;
 * `v` is bumped whenever it changes so React re-renders subscribers.
 */
import { RND_BY_ID } from '@/sim/systems/rnd';
import { tierDef } from '@/sim/systems/office';
import { create } from 'zustand';
import { advance } from '@/sim/advance';
import { dispatch, type Action, type ActionResult } from '@/sim/actions';
import type { SimEvent } from '@/sim/ctx';
import type { GameState } from '@/sim/types';
import type { ItemId } from '@/data/facilities';
import { ACHIEVEMENTS } from '@/sim/systems/achievements';
import { RESEARCH_BY_ID } from '@/data/research';
import { fmtMoney } from '@/sim/util';
import { sound } from './sound';

export type Speed = 0 | 1 | 2 | 4;
export const MS_PER_DAY: Record<Exclude<Speed, 0>, number> = { 1: 400, 2: 200, 4: 100 };

export type PanelId = 'develop' | 'staff' | 'office' | 'research' | 'market' | 'finance' | 'company' | 'news' | 'goals' | 'settings' | 'releases' | 'cheats' | 'overview';

export type Modal =
  | { kind: 'event'; uid: number }
  | { kind: 'reviews'; releaseId: string }
  | { kind: 'gate'; projectId: string }
  | { kind: 'gameOver' }
  | { kind: 'insolvent' }
  | { kind: 'majorNews'; newsId: number }
  | { kind: 'bugBash'; projectId: string }
  | { kind: 'trailerCut'; projectId: string }
  | { kind: 'coverArt'; projectId: string }
  | { kind: 'newGame' }
  | { kind: 'staff'; staffId: string }
  | { kind: 'release'; releaseId: string }
  | { kind: 'shortcuts' }
  | { kind: 'guide' }
  | { kind: 'rival'; rivalId: string }
  | { kind: 'gala'; year: number }
  | { kind: 'identity' }
  | { kind: 'studioCard' };

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'neutral' | 'gold';
  icon?: string;
}

export interface Pop {
  id: number;
  amount: number;
  born: number;
}

export type HeatKind = 'none' | 'energy' | 'decor' | 'noise' | 'crowding';

export interface BuildState {
  item?: ItemId;
  rot: 0 | 1;
  moving?: string; // placed item id being moved
  selected?: string; // placed item id selected for actions
}

interface GameStore {
  s: GameState | null;
  v: number;
  slotId: string | null;
  /** Owner of the loaded save — a game is never saved under a different account. */
  uid: string | null;
  speed: Speed;
  lastSpeed: Exclude<Speed, 0>;
  /** The game paused itself for a popup: once the popups are dealt with, time runs again. */
  autoPaused: boolean;
  panel: PanelId | null;
  panelTab: string | null;
  modals: Modal[];
  toasts: Toast[];
  pops: Pop[];
  /** Bumped when the office should celebrate (a hit launch, an award) or sulk (a flop). */
  cheer: number;
  gloom: number;
  build: BuildState | null;
  heat: HeatKind;
  floor: number;
  selectedStaff: string | null;
  lastSavedDay: number;
  /** Pre-fill for the new-game wizard (e.g. planning a sequel). */
  wizardPreset: { franchiseId?: string; remasterOf?: string; expansionOf?: string } | null;
  /** Bumped whenever a preset is set, so an already-open wizard remounts with it. */
  wizardNonce: number;
  onMonth: ((s: GameState) => void) | null;
  /** After any successful action (the game screen saves shortly after, so nothing done while paused is lost). */
  onAction: (() => void) | null;
  load: (s: GameState, slotId: string, uid: string) => void;
  /** Run an action and show its error as a toast (returns success). */
  actOrToast: (a: Action, ok?: string) => boolean;
  unload: () => void;
  act: (a: Action) => ActionResult;
  setSpeed: (sp: Speed) => void;
  togglePause: () => void;
  step: (days: number) => void;
  openPanel: (p: PanelId | null, tab?: string | null) => void;
  pushModal: (m: Modal) => void;
  /** Show a modal immediately on top of the current one (navigation from inside a modal). */
  openModalNow: (m: Modal) => void;
  popModal: () => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  setBuild: (b: BuildState | null) => void;
  setHeat: (h: HeatKind) => void;
  setFloor: (f: number) => void;
  selectStaff: (id: string | null) => void;
  bump: () => void;
}

let nextId = 1;

export const useGame = create<GameStore>((set, get) => ({
  s: null,
  v: 0,
  slotId: null,
  uid: null,
  speed: 0,
  lastSpeed: 1,
  autoPaused: false,
  panel: null,
  panelTab: null,
  modals: [],
  toasts: [],
  pops: [],
  cheer: 0,
  gloom: 0,
  build: null,
  heat: 'none',
  floor: 0,
  selectedStaff: null,
  lastSavedDay: 0,
  wizardPreset: null,
  wizardNonce: 0,
  onMonth: null,
  onAction: null,
  load: (s, slotId, uid) => {
    // Re-surface anything that was waiting for the player when the game was saved.
    const modals: Modal[] = [];
    if (s.status !== 'running') modals.push({ kind: 'gameOver' });
    else {
      for (const e of s.pendingEvents) modals.push({ kind: 'event', uid: e.uid });
      for (const p of Object.values(s.projects)) if (p.kind === 'game' && p.awaitingGate) modals.push({ kind: 'gate', projectId: p.id });
    }
    set({ s, slotId, uid, v: get().v + 1, speed: 0, autoPaused: false, modals, toasts: [], pops: [], panel: null, build: null, heat: 'none', floor: 0, lastSavedDay: s.day });
  },
  unload: () => set({ s: null, slotId: null, uid: null, speed: 0, modals: [], toasts: [], pops: [], panel: null, build: null }),
  actOrToast: (a, ok) => {
    const r = get().act(a);
    if (!r.ok) get().toast({ text: r.error, tone: 'bad' });
    else if (ok) get().toast({ text: ok, tone: 'good' });
    return r.ok;
  },
  act: (a) => {
    const s = get().s;
    if (!s) return { ok: false, error: 'No game loaded' };
    const r = dispatch(s, a);
    if (r.ok) {
      handleEvents(r.events);
      // a smaller office may have fewer floors than the one you were looking at
      const floors = tierDef(s.office.tier).floors;
      set({ v: get().v + 1, ...(get().floor >= floors ? { floor: floors - 1 } : {}) });
      get().onAction?.();
    } else {
      sound.play('error');
    }
    return r;
  },
  setSpeed: (sp) => {
    if (sp !== 0) set({ lastSpeed: sp });
    set({ speed: sp, autoPaused: false });
  },
  togglePause: () => {
    const { speed, lastSpeed } = get();
    set({ speed: speed === 0 ? lastSpeed : 0, autoPaused: false });
  },
  step: (days) => {
    const s = get().s;
    if (!s || s.status !== 'running') return;
    const ev = advance(s, days);
    handleEvents(ev);
    set({ v: get().v + 1 });
  },
  openPanel: (p, tab = null) => {
    sound.play('click');
    const next = get().panel === p && !tab ? null : p;
    // build mode lives with the office: switching to another panel ends it, closing the office sheet doesn't (on a phone the
    // sheet is the furniture catalogue — closing it is how you get back to the floor)
    const keep = next === 'office' || (next === null && get().panel === 'office');
    set({ panel: next, panelTab: tab, build: keep ? get().build : null });
  },
  pushModal: (m) => set({ modals: [...get().modals, m] }),
  openModalNow: (m) => set({ modals: [m, ...get().modals.filter((x) => JSON.stringify(x) !== JSON.stringify(m))] }),
  popModal: () => {
    const modals = get().modals.slice(1);
    set({ modals });
    // the last popup is answered: carry on at the speed the player was playing at
    const { autoPaused, lastSpeed, s } = get();
    if (!modals.length && autoPaused && s?.status === 'running') set({ speed: lastSpeed, autoPaused: false });
  },
  toast: (t) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-4), { ...t, id }] });
    setTimeout(() => get().dismissToast(id), 5200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setBuild: (b) => set(b ? { build: b } : { build: null, heat: 'none' }), // overlays belong to build mode: leaving it clears them
  setHeat: (h) => set({ heat: h }),
  setFloor: (f) => set({ floor: Math.max(0, Math.round(f)) }),
  selectStaff: (id) => set({ selectedStaff: id }),
  bump: () => set({ v: get().v + 1 }),
}));

/** Translate sim events into modals, toasts, sounds and number pops. */
export function handleEvents(events: SimEvent[]): void {
  const g = useGame.getState();
  const s = g.s;
  if (!s || !events.length) return;
  let pause = false;
  /** Game over or broke: the player decides when time moves again. */
  let hardStop = false;
  /** This batch opened a popup — answering it (and any others) resumes time. Pauses without a popup stay paused. */
  let popped = false;
  let reviewsShown = 0;
  const moreLaunches: string[] = [];
  let income = 0;
  let gala = false;
  let cheer = false;
  for (const e of events) {
    switch (e.type) {
      case 'release': {
        const sc = s.releases[e.releaseId]?.score ?? 60;
        if (sc >= 75) cheer = true;
        else if (sc < 45) useGame.setState((st) => ({ gloom: st.gloom + 1 }));
        break;
      }
      case 'income':
        if (e.source === 'sales') income += e.amount;
        else g.toast({ text: `Contract paid ${fmtMoney(e.amount)}`, tone: 'good', icon: 'cash' });
        break;
      case 'reviews':
        // several launches on one day: show the first two in full, list the rest
        if (reviewsShown < 2) {
          g.pushModal({ kind: 'reviews', releaseId: e.releaseId });
          sound.play('review');
          if (s.settings.autopause.releases) pause = popped = true;
        } else moreLaunches.push(e.releaseId);
        reviewsShown += 1;
        break;
      case 'event':
        g.pushModal({ kind: 'event', uid: e.uid });
        sound.play('notify');
        if (s.settings.autopause.events) pause = popped = true;
        break;
      case 'gate':
        g.pushModal({ kind: 'gate', projectId: e.projectId });
        sound.play('notify');
        pause = popped = true;
        break;
      case 'achievement': {
        const a = ACHIEVEMENTS.find((x) => x.id === e.id);
        g.toast({ text: `Achievement: ${a?.name ?? e.id}`, tone: 'gold', icon: a?.icon ?? 'trophy' });
        sound.play('levelUp');
        break;
      }
      case 'researchDone':
        g.toast({ text: `Research complete: ${RESEARCH_BY_ID[e.id]?.name ?? RND_BY_ID[e.id]?.name ?? e.id}`, tone: 'good', icon: 'research' });
        sound.play('success');
        if (s.settings.autopause.research) pause = true;
        break;
      case 'staffRetired':
        g.toast({ text: `${e.name} retires after ${e.years} years 🎉`, tone: 'gold', icon: 'heart' });
        break;
      case 'staffQuit':
        g.toast({ text: `${e.name} quit (${e.reason})`, tone: 'bad', icon: 'staff' });
        sound.play('fail');
        break;
      case 'staffSick':
        break;
      case 'hired':
        sound.play('success');
        break;
      case 'insolvent':
        g.pushModal({ kind: 'insolvent' });
        sound.play('error');
        pause = true;
        hardStop = true;
        break;
      case 'gameOver':
        g.pushModal({ kind: 'gameOver' });
        pause = true;
        hardStop = true;
        break;
      case 'award':
        gala = true; // one ceremony for all of this year's wins
        break;
      case 'news':
        if (e.major) {
          g.pushModal({ kind: 'majorNews', newsId: e.newsId });
          pause = popped = true;
        }
        break;
      case 'month':
        g.onMonth?.(s);
        break;
      case 'projectDone':
        if (e.kind === 'engine') {
          g.toast({ text: 'New engine ready!', tone: 'good', icon: 'gear' });
          sound.play('success');
        }
        break;
      case 'milestone':
        sound.play('success');
        break;
      case 'toast':
        g.toast({ text: e.text, tone: e.tone });
        if (e.text.startsWith('📬')) sound.play('mail');
        break;
      default:
        break;
    }
  }
  if (moreLaunches.length) {
    const list = moreLaunches.map((id) => s.releases[id]).filter((r): r is NonNullable<typeof r> => !!r);
    if (list.length) g.toast({ text: `Also launched: ${list.map((r) => `${r.name} (${r.score})`).join(', ')} — reviews in Releases`, tone: 'neutral', icon: 'news' });
  }
  if (gala) cheer = true;
  if (cheer) useGame.setState((st) => ({ cheer: st.cheer + 1 }));
  if (gala) {
    const year = g.s?.awardHistory?.[g.s.awardHistory.length - 1]?.year;
    if (year !== undefined && !g.modals.some((m) => m.kind === 'gala')) {
      g.pushModal({ kind: 'gala', year });
      sound.play('fanfare');
      pause = popped = true;
    }
  }
  if (income > 0) {
    const id = nextId++;
    useGame.setState({ pops: [...useGame.getState().pops.slice(-5), { id, amount: income, born: performance.now() }] });
    setTimeout(() => useGame.setState({ pops: useGame.getState().pops.filter((p) => p.id !== id) }), 1600);
    sound.play(income > 1_000_000 ? 'bigCoin' : 'coin');
  }
  // the last project just finished and nothing else is underway: stop the clock rather than burn salaries
  // in silence (a panel may be hiding the idle reminder)
  const idleNow =
    events.some((e) => e.type === 'projectDone') &&
    !Object.keys(s.projects).length &&
    !s.research.active &&
    !(s.hardware ?? []).some((h) => h.status === 'dev') &&
    !Object.values(s.staff).some((x) => x.assignment.kind === 'training') &&
    s.status === 'running' &&
    g.speed > 0;
  if (idleNow) {
    g.toast({ text: 'Nothing in development — time paused. Start a game or take a contract.', tone: 'neutral', icon: 'hourglass' });
    pause = true;
    hardStop = true;
  }
  if (pause) useGame.setState((st) => ({ speed: 0, autoPaused: hardStop ? false : st.autoPaused || (popped && st.speed > 0) }));
}
