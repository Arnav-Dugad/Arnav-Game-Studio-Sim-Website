import { useSettings, type ThemePref } from '../settings';
import { IconButton } from './ui';

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const ICON = { system: 'monitor', light: 'sun', dark: 'moon' } as const;
const LABEL: Record<ThemePref, string> = { system: 'Theme: match system', light: 'Theme: light', dark: 'Theme: dark' };

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  return <IconButton icon={ICON[theme]} label={`${LABEL[theme]} (click to change)`} onClick={() => set({ theme: NEXT[theme] })} />;
}
