import { ITEM_BY_ID } from '@/data/facilities';
import { copyFloorCost } from '@/sim/actions';
import { fmtMoney, money } from '@/sim/util';
import { tierDef } from '@/sim/systems/office';
import { Button, ConfirmButton, Segmented } from '../components/ui';
import { useGame, type HeatKind } from '../store';

/** Contextual toolbar while in build mode: what you're placing, rotate, heat-map, floors. */
export function BuildBar() {
  const deskless = useGame((g) => (g.s ? Object.values(g.s.staff).filter((x) => !x.deskId).length : 0));
  const s = useGame((g) => g.s);
  useGame((g) => g.v);
  const build = useGame((g) => g.build);
  const heat = useGame((g) => g.heat);
  const floor = useGame((g) => g.floor);
  const panelOpen = useGame((g) => g.panel !== null);
  const g = useGame.getState();
  if (!s) return null;
  const t = tierDef(s.office.tier);
  const sel = build?.selected ? s.office.items.find((i) => i.id === build.selected) : undefined;
  const floors = t.floors > 1;
  if (!build && !floors) return null;
  const deskFloor = new Map(s.office.items.map((it) => [it.id, it.floor]));
  const perFloor = Array.from({ length: t.floors }, () => 0);
  for (const st of Object.values(s.staff)) if (st.activity !== 'sick' && st.activity !== 'vacation') perFloor[st.deskId ? (deskFloor.get(st.deskId) ?? 0) : 0]! += 1;
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-2 sm:bottom-4 [@media(max-height:560px)]:bottom-[4.5rem] ${panelOpen ? `lg:pl-[656px]${build ? '' : ' sm:max-lg:hidden'}` : ''}`}>
      <div className="glass pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
        {floors && (
          <Segmented
            ariaLabel="Floor"
            value={floor}
            onChange={(f) => g.setFloor(f)}
            options={Array.from({ length: t.floors }, (_, i) => ({ value: i, label: perFloor[i] ? `F${i + 1} · ${perFloor[i]}` : `F${i + 1}` }))}
          />
        )}
        {build && (
          <>
            {build.item && (
              <span className="text-sm">
                Placing <b>{ITEM_BY_ID[build.item].name}</b> · {fmtMoney(money(ITEM_BY_ID[build.item].cost, s.day))}
              </span>
            )}
            {build.moving && <span className="text-sm">Tap or click where it should go</span>}
            {build.item && <span className="hidden text-xs text-ink3 md:inline">Drag to place a row · arrows + Enter by keyboard</span>}
            {build.moving && <span className="hidden text-xs text-ink3 lg:inline">Arrows + Enter to place by keyboard</span>}
            {sel && !build.moving && (
              <>
                <span className="text-sm font-semibold">{ITEM_BY_ID[sel.item].name}</span>
                <Button size="sm" icon="move" onClick={() => g.setBuild({ rot: sel.rot, moving: sel.id })}>
                  Move
                </Button>
                <Button
                  size="sm"
                  icon="sell"
                  variant="danger"
                  onClick={() => {
                    const r = g.act({ type: 'sellItem', id: sel.id });
                    if (r.ok) g.setBuild({ rot: 0 });
                  }}
                >
                  Sell ({fmtMoney(money(ITEM_BY_ID[sel.item].cost, s.day) * 0.4)})
                </Button>
              </>
            )}
            {floors && !build.item && !build.moving && !sel && (
              <ConfirmButton
                size="sm"
                icon="layers"
                title="Duplicate this floor's layout onto the next floor (items that don't fit are skipped)"
                ask={`Copy F${floor + 1} onto F${((floor + 1) % t.floors) + 1} for up to ${fmtMoney(copyFloorCost(s, floor))}?`}
                onConfirm={() => g.actOrToast({ type: 'copyFloor', from: floor, to: (floor + 1) % t.floors })}
              >
                Copy floor → F{((floor + 1) % t.floors) + 1}
              </ConfirmButton>
            )}
            {(build.item || build.moving) && (
              <Button size="sm" icon="rotate" onClick={() => g.setBuild({ ...build, rot: build.rot ? 0 : 1 })}>
                Rotate (R)
              </Button>
            )}
            <Segmented<HeatKind>
              ariaLabel="Heat map"
              value={heat}
              onChange={(h) => g.setHeat(h)}
              options={[
                { value: 'none', label: 'No overlay' },
                { value: 'energy', label: 'Break access', title: 'Walking distance to coffee/kitchen/lounge' },
                { value: 'decor', label: 'Décor', title: 'Morale aura from plants, art and fun stuff' },
                { value: 'noise', label: 'Quiet', title: 'Green = quiet, red = noisy' },
                { value: 'crowding', label: 'Space', title: 'Green = roomy, red = crowded' },
              ]}
            />
            {deskless > 0 && (
              <Button size="sm" icon="plus" onClick={() => furnish()} title="Place the best available desk in free spots, in rows, until everyone has one">
                Desks for everyone ({deskless})
              </Button>
            )}
            {!panelOpen && (
              <Button
                size="sm"
                icon="build"
                className="sm:hidden [@media(max-height:560px)]:inline-flex"
                onClick={() => {
                  useGame.setState({ panel: 'office' });
                  setTimeout(() => document.getElementById('office-catalogue')?.scrollIntoView({ block: 'start' }), 50); // straight to the furniture
                }}
              >
                Furniture
              </Button>
            )}
            {(build.item || build.moving) && (
              <Button size="sm" variant="ghost" onClick={() => g.setBuild({ rot: build.rot })}>
                Cancel
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => g.setBuild(null)}>
              Done (Esc)
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** One click: desks for everyone who doesn't have one (reports what happened). */
export function furnish(): void {
  const g = useGame.getState();
  if (!g.s) return;
  const before = g.s.office.items.length;
  const r = g.act({ type: 'furnishDesks' });
  const placed = (g.s.office.items.length ?? before) - before;
  const left = Object.values(g.s.staff).filter((x) => !x.deskId).length;
  if (!r.ok) g.toast({ text: r.error, tone: 'bad' });
  else g.toast({ text: `Placed ${placed} desk${placed === 1 ? '' : 's'}${left ? ` · ${left} still without one (no room or cash)` : ' · everyone has a desk'}`, tone: left ? 'neutral' : 'good', icon: 'build' });
}
