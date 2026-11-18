import { useState } from 'react';
import { COVER_LAYOUTS, COVER_MOTIFS, COVER_PALETTES, Cover, MotifSwatch, defaultCover } from '../art/Cover';
import { Button, Modal, cx } from '../components/ui';
import { useGame } from '../store';
import { sound } from '../sound';

const LAYOUT_NAMES: Record<string, string> = { slash: 'Slash', emblem: 'Emblem', grid: 'Grid', speed: 'Speed lines', bubbly: 'Bubbly', globe: 'Globe', sunburst: 'Sunburst' };
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Design a game's box art: palette, layout and motif, with a live preview. Purely the player's expression. */
export function CoverDesigner({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const act = useGame((g) => g.act);
  const p = s.projects[projectId];
  const game = p && p.kind === 'game' ? p : undefined;
  const auto = game ? defaultCover(game.concept.genre, game.concept.topic, game.startDay) : { pal: 'ember', layout: 'sunburst', motif: 'sparkle' };
  const [d, setD] = useState(() => (game?.concept.cover ? { pal: game.concept.cover.pal, layout: game.concept.cover.layout, motif: game.concept.cover.motif } : auto));
  if (!game) return null;
  const c = game.concept;
  const changed = d.pal !== auto.pal || d.layout !== auto.layout || d.motif !== auto.motif;
  const save = () => {
    const r = act(changed ? { type: 'setCover', projectId, cover: d } : { type: 'setCover', projectId, cover: null });
    if (r.ok) {
      sound.play('click');
      onClose();
    } else useGame.getState().toast({ text: r.error, tone: 'bad' });
  };
  return (
    <Modal open onClose={onClose} title="Design the box art" wide>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <Cover title={c.name} genre={c.genre} topic={c.topic} seed={game.startDay} design={{ ...d, seed: game.startDay }} size={200} className="rounded-[6%] shadow-lg" />
          <p className="max-w-[200px] text-center text-xs text-ink3">How {c.name} will look on shelves, in your release history and on your Studio Card.</p>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">Palette</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Palette">
              {COVER_PALETTES.map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  role="radio"
                  aria-checked={d.pal === pal.id}
                  aria-label={titleCase(pal.id)}
                  title={titleCase(pal.id)}
                  onClick={() => setD({ ...d, pal: pal.id })}
                  className={cx('h-8 w-8 rounded-full border-2 transition', d.pal === pal.id ? 'scale-110 border-ink' : 'border-transparent hover:scale-105')}
                  style={{ background: `linear-gradient(160deg, ${pal.a} 0%, ${pal.b} 70%, ${pal.accent} 100%)` }}
                />
              ))}
            </div>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">Layout</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Layout">
              {COVER_LAYOUTS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={d.layout === l}
                  onClick={() => setD({ ...d, layout: l })}
                  className={cx('rounded-full border px-2.5 py-1 text-xs transition', d.layout === l ? 'border-accent bg-accent/15 text-ink' : 'border-line text-ink2 hover:bg-bg2')}
                >
                  {LAYOUT_NAMES[l] ?? titleCase(l)}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">Motif</h3>
            <div className="mt-1.5 grid max-h-44 grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1.5 overflow-y-auto pr-1" role="radiogroup" aria-label="Motif">
              {COVER_MOTIFS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={d.motif === m}
                  aria-label={titleCase(m)}
                  title={titleCase(m)}
                  onClick={() => setD({ ...d, motif: m })}
                  className={cx('grid place-items-center rounded-lg border-2 transition', d.motif === m ? 'border-ink' : 'border-transparent hover:border-line')}
                >
                  <MotifSwatch motif={m} pal={d.pal} size={36} />
                </button>
              ))}
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" disabled={!changed} onClick={() => setD(auto)}>
              Back to the original
            </Button>
            <Button size="sm" variant="primary" icon="check" onClick={save}>
              Use this cover
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
