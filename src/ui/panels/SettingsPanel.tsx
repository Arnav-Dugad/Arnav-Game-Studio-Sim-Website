import { useState } from 'react';
import { Button, Section, Segmented } from '../components/ui';
import { useGame } from '../store';
import { useSettings, type MotionPref, type ThemePref } from '../settings';
import { sound } from '../sound';
import { music } from '../music';
import { ambience } from '../ambience';

export default function SettingsPanel() {
  const st = useSettings();
  const s = useGame((g) => g.s);
  useGame((g) => g.v);
  const act = useGame((g) => g.act);
  const [vol, setVol] = useState(sound.volume);
  const [muted, setMuted] = useState(sound.muted);
  const [musicOn, setMusicOn] = useState(music.on);
  const [musicVol, setMusicVol] = useState(music.volume);
  const [ambOn, setAmbOn] = useState(ambience.isOn());
  const [ambVol, setAmbVol] = useState(ambience.volume());
  return (
    <div className="space-y-1 text-sm">
      <Section title="Appearance">
        <div className="space-y-2">
          <Row label="Theme">
            <Segmented<ThemePref>
              ariaLabel="Theme"
              value={st.theme}
              onChange={(v) => st.set({ theme: v })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
          <Row label="Motion">
            <Segmented<MotionPref>
              ariaLabel="Motion"
              value={st.motion}
              onChange={(v) => st.set({ motion: v })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'reduce', label: 'Reduced' },
                { value: 'full', label: 'Full' },
              ]}
            />
          </Row>
          <Row label={`UI size ${Math.round(st.uiScale * 100)}%`}>
            <input type="range" min={0.9} max={1.25} step={0.05} value={st.uiScale} onChange={(e) => st.set({ uiScale: Number(e.target.value) })} aria-label="UI size" />
          </Row>
          <Row label="Colour-blind friendly (blue/orange for good/bad)">
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={st.colorblind} onChange={(e) => st.set({ colorblind: e.target.checked })} />
          </Row>
          <Row label="Money pop-ups">
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={st.numberPops} onChange={(e) => st.set({ numberPops: e.target.checked })} />
          </Row>
        </div>
      </Section>
      <Section title="Sound">
        <div className="space-y-2">
          <Row label="Mute effects">
            <input
              type="checkbox"
              className="size-5 accent-[var(--accent)]"
              checked={muted}
              onChange={(e) => {
                sound.setMuted(e.target.checked);
                setMuted(e.target.checked);
              }}
            />
          </Row>
          <Row label={`Effects volume ${Math.round(vol * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol}
              onChange={(e) => {
                sound.setVolume(Number(e.target.value));
                setVol(Number(e.target.value));
                sound.play('click');
              }}
              aria-label="Volume"
            />
          </Row>
          <Row label="Music">
            <input
              type="checkbox"
              className="size-5 accent-[var(--accent)]"
              checked={musicOn}
              onChange={(e) => {
                music.setOn(e.target.checked);
                setMusicOn(e.target.checked);
              }}
            />
          </Row>
          <Row label={`Music volume ${Math.round(musicVol * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVol}
              disabled={!musicOn}
              onChange={(e) => {
                music.setVolume(Number(e.target.value));
                setMusicVol(Number(e.target.value));
              }}
              aria-label="Music volume"
            />
          </Row>
          <Row label="Office ambience">
            <input
              type="checkbox"
              className="size-5 accent-[var(--accent)]"
              checked={ambOn}
              onChange={(e) => {
                ambience.setOn(e.target.checked);
                setAmbOn(e.target.checked);
              }}
            />
          </Row>
          <Row label={`Ambience volume ${Math.round(ambVol * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={ambVol}
              disabled={!ambOn}
              onChange={(e) => {
                ambience.setVolume(Number(e.target.value));
                setAmbVol(Number(e.target.value));
              }}
              aria-label="Ambience volume"
            />
          </Row>
          <p className="px-1 text-[11px] text-ink3">The soundtrack is generated live and follows the era: chiptune in the ’80s, FM in the ’90s, soft synths after.</p>
        </div>
      </Section>
      {s && (
        <Section title="Auto-pause">
          <div className="space-y-2">
            {(
              [
                ['gates', 'At development phase gates'],
                ['events', 'When a decision is needed'],
                ['releases', 'When reviews come in'],
                ['research', 'When research finishes'],
              ] as const
            ).map(([k, label]) => (
              <Row key={k} label={label}>
                <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={s.settings.autopause[k]} onChange={(e) => act({ type: 'setAutopause', key: k, on: e.target.checked })} />
              </Row>
            ))}
          </div>
        </Section>
      )}
      <Section title="Help">
        <div className="flex flex-wrap gap-2">
          <Button
            icon="book"
            onClick={() => {
              st.set({ showTutorial: true });
              act({ type: 'tutorial', step: 0 });
            }}
          >
            Replay tutorial
          </Button>
          <Button icon="keyboard" onClick={() => useGame.getState().pushModal({ kind: 'shortcuts' })}>
            Keyboard shortcuts
          </Button>
        </div>
      </Section>
      {s && (
        <Section title="Sandbox">
          <p className="mb-2 text-xs text-ink3">Money, staff, games, research and time — bend any rule. Runs that use cheats are marked in the Hall of Fame.</p>
          <Button icon="sparkle" onClick={() => useGame.getState().openPanel('cheats')}>
            Open cheats
          </Button>
        </Section>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-bg2/50 px-3 py-2">
      <span className="text-sm">{label}</span>
      {children}
    </label>
  );
}
