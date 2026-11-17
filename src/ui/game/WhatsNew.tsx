import { useState } from 'react';
import { Icon, type IconName } from '../icons';

/** Bump when adding entries so returning players see the card once. */
export const WHATS_NEW_VERSION = '2026-11-17f';
const KEY = 'ase:whatsNew';

const ITEMS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'sparkle', title: 'Cheats & sandbox mode', body: 'Bend any rule from Menu → Cheats (press `), with one-click presets, or tick Sandbox mode when founding a studio.' },
  { icon: 'trophy', title: 'Gala ceremonies & rivalries', body: 'Win an award and the Golden Pixel Gala celebrates you. Beat rival studios in head-to-head showdowns.' },
  { icon: 'people', title: 'Open betas & retirement', body: 'Test with real players during polish (2005+). Veterans now retire after long careers and join your alumni.' },
  { icon: 'rocket', title: 'Launch titles & sequels', body: 'Ship in a platform’s first months for an early-adopter boost. Sequels are judged against the series’ best.' },
  { icon: 'layers', title: 'Expansions, sales & esports', body: 'Expansion packs, storefront discounts and pro leagues give hits a long, profitable tail.' },
  { icon: 'shield', title: 'Your studio’s identity', body: 'Click your badge in the top-left to rename the studio and choose its colour, shape and emblem.' },
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
