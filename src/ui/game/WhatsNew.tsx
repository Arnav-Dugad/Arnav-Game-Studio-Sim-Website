import { useState } from 'react';
import { Icon, type IconName } from '../icons';

/** Bump when adding entries so returning players see the card once. */
export const WHATS_NEW_VERSION = '2026-11-17e';
const KEY = 'ase:whatsNew';

const ITEMS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'sparkle', title: 'Cheats & sandbox mode', body: 'Bend any rule from Menu → Cheats (press `), or tick Sandbox mode when founding a studio. Cheated runs are marked in the Hall of Fame.' },
  { icon: 'layers', title: 'Expansion packs', body: 'Give a recent hit more content: less work than a sequel, and it brings players back to the original.' },
  { icon: 'trophy', title: 'Esports & rivalries', body: 'Run leagues for competitive hits (Company → Esports), and win head-to-head showdowns against rival studios.' },
  { icon: 'coin', title: 'Storefront sales', body: 'Put older games on sale in the digital era for a burst of copies (open a game → Post-launch).' },
  { icon: 'music', title: 'A soundtrack that ages with you', body: 'Generated live: chiptune in the ’80s, FM in the ’90s, soft synths after (Settings → Sound).' },
  { icon: 'library', title: 'Your games shelf & records', body: 'See every game as a wall of covers, and your all-time bests in Company → History.' },
];

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === WHATS_NEW_VERSION;
  } catch {
    return true;
  }
}

export function WhatsNew() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, WHATS_NEW_VERSION);
    } catch {
      /* private mode: just hide it for this visit */
    }
    setOpen(false);
  };
  return (
    <section aria-label="What’s new" className="mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4 animate-fade-up">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">What’s new</div>
          <h2 className="font-display text-lg font-semibold">New ways to build your empire</h2>
        </div>
        <button type="button" aria-label="Dismiss what’s new" className="grid size-7 place-items-center rounded-lg text-ink3 hover:bg-bg2" onClick={close}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {ITEMS.map((it) => (
          <li key={it.title} className="flex gap-2.5 text-xs">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
              <Icon name={it.icon} size={14} />
            </span>
            <span>
              <b className="block text-sm">{it.title}</b>
              <span className="text-ink2">{it.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
