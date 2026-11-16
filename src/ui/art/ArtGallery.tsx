import type { ReactNode } from 'react';
import { GENRES } from '../../data/genres';
import { TOPICS } from '../../data/topics';
import { Icon, ICON_NAMES } from '../icons';
import { Avatar, InitialsBadge } from './Avatar';
import { CompanyBadge } from './CompanyBadge';
import { Cover } from './Cover';
import { EventArt, GameLogo, Wordmark } from './EventArt';

/** Dev-only visual QA sheet for every hand-built art asset. */

const EVENT_KEYS = [
  'handshake',
  'press',
  'conflict',
  'mountain',
  'pizza',
  'megaphone',
  'contract',
  'crowd',
  'smoke',
  'audit',
  'student',
  'letters',
  'briefcase',
  'shark',
  'lightbulb',
  'heart',
  'calendar',
  'house',
  'robot',
  'trophy',
  'leak',
  'console',
  'unknown-key',
];

const BADGES: [string, string][] = [
  ['Pixel Forge Studios', '#d9262f'],
  ['The Blue Comet Games', '#1f4ea3'],
  ['MegaSoft Interactive', '#7d7d82'],
  ['Northwind Entertainment', '#00a1de'],
  ['Lumen', '#F2C450'],
  ['Red Panda Inc', '#E07A5F'],
];

const SAMPLE_TITLES = ['Starfall', 'Neon Harbor Nights', 'The Last Lighthouse Keeper', 'Dungeon Dash 3', 'Moss & Mortar', 'Velocity Kings Turbo Championship Edition'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display mb-3 text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function ArtGallery() {
  return (
    <div className="min-h-full bg-bg p-6 text-ink">
      <header className="mb-8 flex flex-wrap items-center gap-6">
        <Wordmark />
        <GameLogo size={64} title="Studio logo" />
        <GameLogo size={24} />
        <p className="text-sm text-ink2">Art QA sheet — every asset is hand-authored SVG.</p>
      </header>

      <Section title={`Icons (${ICON_NAMES.length})`}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
          {ICON_NAMES.map((n) => (
            <div key={n} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-panel2 p-2">
              <div className="flex items-center gap-2">
                <Icon name={n} size={24} />
                <Icon name={n} size={16} className="text-accent" />
              </div>
              <span className="text-center text-[10px] text-ink3">{n}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Avatars (seeds 1–24, mood varies)">
        <div className="flex flex-wrap items-end gap-3">
          {Array.from({ length: 24 }, (_, i) => i + 1).map((seed) => {
            const mood = (seed * 37) % 101;
            return (
              <div key={seed} className="flex flex-col items-center gap-1">
                <Avatar seed={seed} size={80} mood={mood} label={`Staff ${seed}`} />
                <div className="flex gap-1">
                  <Avatar seed={seed} size={32} mood={mood} />
                  <Avatar seed={seed} size={32} mood={10} ring="var(--bad)" />
                  <Avatar seed={seed} size={32} mood={95} ring="var(--good)" />
                </div>
                <span className="num text-[10px] text-ink3">
                  #{seed} · {mood}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Avatar seed={7} size={160} mood={90} />
          <Avatar seed={7} size={160} mood={50} />
          <Avatar seed={7} size={160} mood={5} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <InitialsBadge name="Ada Lovelace" size={64} legendary />
          <InitialsBadge name="Grace Brewster Hopper" size={64} />
          <InitialsBadge name="Alan Turing" size={48} legendary />
          <InitialsBadge name="Cher" size={48} />
          <InitialsBadge name="Rosalind Franklin" size={32} color="#E3B23C" />
        </div>
      </Section>

      <Section title="Covers (each genre × 3 topics)">
        <div className="flex flex-col gap-4">
          {GENRES.map((g, gi) => {
            const fits = TOPICS.filter((t) => t.genreFit[g.id] === 3).slice(0, 3);
            const topics = fits.length >= 3 ? fits : [...fits, ...TOPICS.filter((t) => !fits.includes(t)).slice(gi, gi + 3 - fits.length)];
            return (
              <div key={g.id} className="flex flex-wrap items-end gap-3">
                <span className="font-display w-24 text-sm font-semibold text-ink2">{g.name}</span>
                {topics.map((t, ti) => (
                  <div key={t.id} className="flex flex-col items-center gap-1">
                    <Cover
                      title={SAMPLE_TITLES[(gi + ti) % SAMPLE_TITLES.length] ?? 'Untitled'}
                      genre={g.id}
                      topic={t.id}
                      seed={gi * 10 + ti}
                      size={150}
                      score={ti === 0 ? 92 - gi * 4 : ti === 1 ? 64 : undefined}
                    />
                    <span className="text-[10px] text-ink3">{t.name}</span>
                  </div>
                ))}
                <Cover title="Tiny" genre={g.id} topic={topics[0]?.id ?? 'fantasy'} seed={gi} size={64} />
              </div>
            );
          })}
        </div>
        <h3 className="font-display mb-2 mt-6 text-sm font-semibold text-ink2">Every topic motif</h3>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t, i) => (
            <div key={t.id} className="flex flex-col items-center gap-1">
              <Cover title={t.name} genre="unknown" topic={t.id} seed={i} size={96} />
              <span className="text-[10px] text-ink3">{t.id}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Company badges">
        <div className="flex flex-wrap items-center gap-4">
          {BADGES.map(([name, color]) => (
            <div key={name} className="flex items-center gap-2">
              <CompanyBadge name={name} color={color} size={44} />
              <CompanyBadge name={name} color={color} size={24} />
              <span className="text-xs text-ink2">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Event art">
        <div className="flex flex-wrap gap-3">
          {EVENT_KEYS.map((k) => (
            <div key={k} className="flex flex-col items-center gap-1">
              <EventArt art={k} size={120} label={k} />
              <span className="text-[10px] text-ink3">{k}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {EVENT_KEYS.slice(0, 8).map((k) => (
            <EventArt key={k} art={k} size={48} />
          ))}
        </div>
      </Section>
    </div>
  );
}
