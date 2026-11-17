import { useEffect, useState } from 'react';
import { SCENARIOS } from '@/sim/systems/scenarios';
import { OfficeCanvas } from '@/render/OfficeCanvas';
import { advance } from '@/sim/advance';
import type { GameState } from '@/sim/types';
import { PLATFORMS } from '@/data/platforms';
import { COMPANIES } from '@/data/companies';
import { FRANCHISES } from '@/data/franchises';
import { HISTORICAL_EVENTS } from '@/data/events';
import { Wordmark } from '../art/EventArt';
import { Icon, type IconName } from '../icons';
import { Button } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';
import { navigate } from '../router';
import { useAuth } from '@/services/auth';
import { buildDemoState } from './demoState';
import { prefersReducedMotion, useSettings } from '../settings';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'clock', title: '46 years of real history', body: `Start in 1980 and live through ${HISTORICAL_EVENTS.length} real industry events: the ’83 crash, the 3D revolution, Steam, the App Store, free-to-play and more.` },
  { icon: 'controller', title: `${PLATFORMS.length} real platforms`, body: 'From the Atari 2600 to the Switch 2. Install bases rise and fall on their real dates, and you choose where to bet.' },
  { icon: 'company', title: 'Legendary rivals', body: `${COMPANIES.length} real companies compete with you, releasing ${FRANCHISES.reduce((t, f) => t + f.releases.length, 0)} classic games on their real dates.` },
  { icon: 'build', title: 'A living office', body: 'Design your studio tile by tile. Your people blink, type, gossip about your reviews, high-five friends, play foosball, adopt an office cat — and the layout really changes the numbers.' },
  { icon: 'people', title: 'People, not numbers', body: 'Ambitions, hobbies and favourite genres, friendships, office romances and weddings, new babies, summer interns, Studio Awards and a yearbook photo every New Year. Help your team chase their dreams and they’ll never leave.' },
  { icon: 'globe', title: 'A whole world to win', body: 'Four regions with their own tastes. Localise your games, open studios abroad, and watch Japan’s golden age give way to a mobile planet.' },
  { icon: 'flag', title: 'Scenarios', body: `${SCENARIOS.length} curated challenges, from Garage Days to Empire: survive the crash, build a Japanese RPG house, crowdfund your dream, become a media mogul.` },
  { icon: 'sliders', title: 'Deep development', body: 'Seventeen genres × 50+ topics × platforms × audiences. Focus sliders per phase, bugs, crunch, engines and research — set your price, time your reviews, then read an honest post-mortem.' },
  { icon: 'chart', title: 'Build an empire', body: 'Crowdfunding and Early Access, co-development, publishing deals, IPOs and acquisitions, films and toy lines of your series, esports leagues, a subscription pass — then launch your own console. Or go bankrupt trying.' },
  { icon: 'trophy', title: 'Rivals, fans, legacy', body: 'Showdowns with real studios and a yearly awards gala. Fan mail and kids’ crayon drawings of your games, a community to keep healthy, the Hall of Classics — and the story of your studio, written from everything you did.' },
  { icon: 'music', title: 'A soundtrack that ages with you', body: 'Music generated live in your browser: chiptune in the ’80s, FM in the ’90s, soft synths in the 2000s, lo-fi beats after. No downloads, no files.' },
  { icon: 'sparkle', title: 'Sandbox & cheats', body: 'Play it straight, or tick Sandbox mode and bend every rule: money, staff, review scores, trends, rivals and time itself.' },
];

export function Landing() {
  const user = useAuth((a) => a.user);
  const [stateRef] = useState<{ current: GameState | null }>(() => ({ current: buildDemoState() }));

  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current;
      if (!s) return;
      if (s.status !== 'running' || s.releaseOrder.length > 0) stateRef.current = buildDemoState();
      else advance(s, 1);
    }, 350);
    return () => clearInterval(id);
  }, [stateRef]);

  const play = () => navigate(user ? 'slots' : 'login');

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Wordmark />
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Button variant="primary" onClick={() => navigate('slots')}>
              Continue
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate('login')}>
                Sign in
              </Button>
              <Button variant="primary" onClick={() => navigate('signup')}>
                Create account
              </Button>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-4 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            <Icon name="sparkle" size={14} /> A game-studio tycoon
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] sm:text-6xl">
            From a garage in 1980 to a <span className="text-accent">global</span> games empire.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink2">
            Hire legends, design your office, chase trends, outmanoeuvre real rivals and survive four decades of industry upheaval. Every number tells you why it changed.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" icon="play" onClick={play}>
              Play free
            </Button>
            {!user && (
              <Button
                size="lg"
                onClick={() => {
                  useAuth.getState().playAsGuest();
                  navigate('slots');
                }}
              >
                Try as guest
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-ink3">Free in your browser · cloud saves with an account · works offline</p>
        </div>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-line bg-[var(--scene-bg)] shadow-2xl">
          <OfficeCanvas
            className="absolute inset-0"
            ariaLabel="A live preview of a game studio office with staff at work"
            getState={() => stateRef.current}
            getUI={() => ({ floor: 0, build: null, heat: 'none', selectedStaff: null, speed: 1, reducedMotion: prefersReducedMotion(useSettings.getState()) })}
          />
          <div className="glass pointer-events-none absolute bottom-3 left-3 rounded-xl px-3 py-1.5 text-xs font-semibold">Live simulation — not a video</div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="rounded-2xl border border-line bg-panel2/70 p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent">
                <Icon name={f.icon} size={20} />
              </span>
              <h2 className="mt-3 font-display text-lg font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-ink2">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-ink px-6 py-10 text-center text-bg">
          <h2 className="font-display text-3xl font-bold">Your garage is waiting.</h2>
          <p className="max-w-lg opacity-80">Ship your first game in minutes. Build a legacy over hours. Pause any time — your studio saves itself.</p>
          <Button variant="primary" size="lg" icon="rocket" onClick={play}>
            Start your studio
          </Button>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-ink3">
        <p>
          Arnav Game Studio Empire is a work of simulation. Real company, platform, game and people names are used as historical references only; no logos,
          artwork or likenesses are reproduced, and no endorsement is implied. All art is original.
        </p>
      </footer>
    </div>
  );
}
