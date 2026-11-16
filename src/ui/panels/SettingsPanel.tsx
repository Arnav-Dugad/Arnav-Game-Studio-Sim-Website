import { useState } from 'react';
import { Button, Section, Segmented } from '../components/ui';
import { useGame } from '../store';
import { useSettings, type MotionPref, type ThemePref } from '../settings';
import { sound } from '../sound';

export default function SettingsPanel() {
  const st = useSettings();
  const s = useGame((g) => g.s);
  useGame((g) => g.v);
  const act = useGame((g) => g.act);
  const [vol, setVol] = useState(sound.volume);
  const [muted, setMuted] = useState(sound.muted);
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
          <Row label="Money pop-ups">
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={st.numberPops} onChange={(e) => st.set({ numberPops: e.target.checked })} />
          </Row>
        </div>
      </Section>
      <Section title="Sound">
        <div className="space-y-2">
          <Row label="Mute">
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
          <Row label={`Volume ${Math.round(vol * 100)}%`}>
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
