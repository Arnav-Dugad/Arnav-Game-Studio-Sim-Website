import { useState } from 'react';
import { Icon, type IconName } from '../icons';

/** Bump when adding entries so returning players see the card once. */
export const WHATS_NEW_VERSION = '2026-11-17b';
const KEY = 'ase:whatsNew';

const ITEMS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'layers', title: 'Expansion packs', body: 'Give a recent hit more content: less work than a sequel, and it brings players back to the original.' },
  { icon: 'coin', title: 'Storefront sales', body: 'Put older games on sale in the digital era for a burst of copies (open a game → Post-launch).' },
  { icon: 'controller', title: 'Build your own console', body: 'Research the Hardware Lab, then design, price and launch a console or handheld. Rivals answer with price wars.' },
  { icon: 'people', title: 'Subscription pass', body: 'Turn a strong back catalogue into monthly income (Company → Pass).' },
  { icon: 'briefcase', title: 'Publishing label', body: 'Fund indie studios’ games for a share of their revenue.' },
  { icon: 'trophy', title: 'Golden Pixel Gala', body: 'Yearly industry awards with real-history winners (News → Awards).' },
  { icon: 'download', title: 'Export & import saves', body: 'Back up a studio to a file or move it to another device from this screen.' },
  { icon: 'sparkle', title: 'Remasters, vacations, showcases', body: 'Remaster 8-year-old classics, send tired staff on holiday, and host your own showcase once famous.' },
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
