import { useState } from 'react';
import { Icon, type IconName } from '../icons';

/** Bump when adding entries so returning players see the card once. */
export const WHATS_NEW_VERSION = '2026-11-17q';
const KEY = 'ase:whatsNew';

const ITEMS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'bell', title: 'Shareholder meetings', body: 'Public studios face their shareholders every May: pay a dividend, promise bold growth or hold steady — and if the board turns on you, fight a no-confidence vote or accept a cost-cutting mandate.' },
  { icon: 'star', title: 'Staff ambitions', body: 'People now form personal goals — make a game in a genre they love, ship a hit, earn a raise, do research, master their craft, get a better desk, take a holiday. Help them before the deadline for a big loyalty and morale boost; ignore them and they feel overlooked. Staff → Team → Ambitions.' },
  { icon: 'camera', title: 'Office photo', body: 'Menu → Office photo saves a captioned picture of your studio floor — pets, holiday lights and all.' },
  { icon: 'news', title: 'Player buzz', body: 'News → Buzz: what players say about your games — magazine letters in the 80s, bulletin boards, forums, then social posts and streams. Each game’s page shows its sentiment and top posts.' },
  { icon: 'calendar', title: 'Seasons & holidays', body: 'Snow on the windows, string lights and a tree in December, Santa hats, pumpkins and witch hats at Halloween, autumn leaves and spring flowers, balloons after a party, New Year cheers — and everyone has a birthday (party hat and cake).' },
  { icon: 'heart', title: 'Office pets', body: 'Build menu → Decor: a Studio Cat or an Office Dog. They nap, roam, follow people, sit on keyboards and get fussed over — and lift morale across a wide area. Hover one to learn its name.' },
  { icon: 'people', title: 'Characters come alive', body: 'Everyone now blinks, breathes, smiles or frowns with their mood, talks with their hands, types, sips coffee, waves hello, stretches, yawns, checks their phone, facepalms at bugs, high-fives friends, lounges on sofas — and dances when a game hits.' },
  { icon: 'people', title: 'A living office', body: 'Staff chat about your games, reviews and rivals, play arcade games on breaks, visit teammates to help, think at whiteboards — and greet you on their first day.' },
  { icon: 'sliders', title: 'Signature features', body: 'Open world, online multiplayer, branching story, battle pass and more — up to three per game, each a bet on your genre.' },
  { icon: 'house', title: 'Studio overview & automation', body: 'A home screen of everything needing attention with one-click fixes (O), plus policies that put idle staff on research and send burnt-out people on vacation.' },
  { icon: 'people', title: 'Big-team management', body: 'Filter, search, group and bulk-assign hundreds of staff; every team picker gets search and a one-click “Best team”.' },
  { icon: 'sparkle', title: 'Cheats & sandbox mode', body: 'Bend any rule from Menu → Cheats (press `), with one-click presets, or tick Sandbox mode when founding a studio.' },
  { icon: 'trophy', title: 'Gala ceremonies & rivalries', body: 'Win an award and the Golden Pixel Gala celebrates you. Beat rival studios in head-to-head showdowns.' },
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
