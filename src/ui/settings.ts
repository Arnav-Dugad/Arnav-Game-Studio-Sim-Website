/** Player preferences (per device). Persisted in localStorage; every access is guarded. */
import { create } from 'zustand';

export type ThemePref = 'system' | 'light' | 'dark';
export type MotionPref = 'system' | 'reduce' | 'full';

export interface Settings {
  theme: ThemePref;
  motion: MotionPref;
  uiScale: number; // 0.9 .. 1.25
  showTutorial: boolean;
  numberPops: boolean;
  edgePan: boolean;
  /** Blue/orange instead of green/red for good/bad. */
  colorblind: boolean;
}

const KEY = 'ase:settings';
const DEFAULTS: Settings = { theme: 'system', motion: 'system', uiScale: 1, showTutorial: true, numberPops: true, edgePan: false, colorblind: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

function persist(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem('ase:theme', s.theme);
  } catch {
    /* ignore */
  }
}

export function systemDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function prefersReducedMotion(s: Settings): boolean {
  if (s.motion === 'reduce') return true;
  if (s.motion === 'full') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function applySettings(s: Settings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const dark = s.theme === 'dark' || (s.theme === 'system' && systemDark());
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.reducedMotion = prefersReducedMotion(s) ? 'true' : 'false';
  root.dataset.cb = s.colorblind ? 'true' : 'false';
  root.style.fontSize = `${Math.round(16 * s.uiScale)}px`;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#15130f' : '#f4efe7');
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>((setState, get) => ({
  ...load(),
  set: (patch) => {
    setState(patch);
    const { set: _omit, ...rest } = { ...get(), ...patch };
    void _omit;
    persist(rest);
    applySettings(rest);
  },
}));

export function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
}

if (typeof window !== 'undefined') {
  applySettings(useSettings.getState());
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applySettings(useSettings.getState()));
}
