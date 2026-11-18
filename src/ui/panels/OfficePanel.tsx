import { useState } from 'react';
import { StudioHQ } from '../art/StudioHQ';
import { itemRequirement } from '@/sim/systems/office';
import { ITEMS, OFFICE_TIERS, type ItemCategory } from '@/data/facilities';
import { RESEARCH_BY_ID } from '@/data/research';
import { fromDay } from '@/sim/calendar';
import { aOrAn, fmtMoney, inflation, money } from '@/sim/util';
import { layout, tierDef } from '@/sim/systems/office';
import { monthlyRent, monthlyUpkeep } from '@/sim/systems/finance';
import { Button, Pill, Section, Segmented, cx } from '../components/ui';
import { Icon } from '../icons';
import { useGame } from '../store';

const CATS: { id: ItemCategory | 'all'; label: string }[] = [
  { id: 'desk', label: 'Desks' },
  { id: 'energy', label: 'Breaks' },
  { id: 'decor', label: 'Décor' },
  { id: 'room', label: 'Rooms' },
  { id: 'tech', label: 'Tech' },
];

/** A phone-sized screen, where the panel sheet covers the office. */
const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

export default function OfficePanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const build = useGame((g) => g.build);
  const setBuild = useGame((g) => g.setBuild);
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const [cat, setCat] = useState<ItemCategory | 'all'>('desk');
  const [confirmDown, setConfirmDown] = useState(false);
  const [confirmUp, setConfirmUp] = useState(false);
  const yr = fromDay(s.day).year;
  const t = tierDef(s.office.tier);
  const next = OFFICE_TIERS.find((x) => x.tier === s.office.tier + 1);
  const prev = OFFICE_TIERS.find((x) => x.tier === s.office.tier - 1);
  // what the rent will be there (branches abroad keep their own rent)
  const nextRent = next ? monthlyRent(s) + (next.rent - tierDef(s.office.tier).rent) * inflation(s.day) : 0;
  const L = layout(s);
  const desks = Object.values(L.desks);
  const avg = (f: (d: (typeof desks)[number]) => number) => (desks.length ? desks.reduce((a, d) => a + f(d), 0) / desks.length : 0);
  const noBreak = desks.filter((d) => d.energyDist === Infinity).length;

  return (
    <div>
      <Section title={`${t.name} · tier ${t.tier}`} right={<Pill>{Object.keys(s.staff).length}/{t.staffCap} staff</Pill>}>
        <div className="mb-2 overflow-hidden rounded-xl">
          <StudioHQ tier={t.tier} name={s.company.name} month={fromDay(s.day).month} width={560} />
        </div>
        <p className="text-xs text-ink3">{t.desc}</p>
        {next && (
          <p className="mt-1 text-xs text-ink3">
            Next: <b className="text-ink2">{next.name}</b> — room for {next.staffCap} people{next.floors > 1 ? ` on ${next.floors} floors` : ''}, rent {fmtMoney(nextRent)}/mo.
          </p>
        )}
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl bg-bg2/70 p-2">
            <div className="text-ink3">Rent</div>
            <div className="num font-semibold">{fmtMoney(monthlyRent(s))}/mo</div>
          </div>
          <div className="rounded-xl bg-bg2/70 p-2">
            <div className="text-ink3">Upkeep</div>
            <div className="num font-semibold">{fmtMoney(monthlyUpkeep(s))}/mo</div>
          </div>
          <div className="rounded-xl bg-bg2/70 p-2">
            <div className="text-ink3">Floors</div>
            <div className="num font-semibold">
              {t.floors} × {t.w}×{t.h}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant={build ? 'primary' : 'secondary'} icon="build" onClick={() => { setBuild(build ? null : { rot: 0 }); if (!build && narrow()) useGame.setState({ panel: null }); }} data-tutorial="build-mode">
            {build ? 'Exit build mode' : 'Edit layout'}
          </Button>
          {next && (
            <Button
              icon="building"
              disabled={s.company.reputation < next.minReputation || s.company.cash < money(next.moveCost, s.day)}
              title={s.company.reputation < next.minReputation ? `Needs ${next.minReputation} reputation` : undefined}
              variant={confirmUp ? 'primary' : 'secondary'}
              onClick={() => {
                if (!confirmUp) return setConfirmUp(true);
                setConfirmUp(false);
                const r = act({ type: 'moveOffice', tier: next.tier });
                toast(r.ok ? { text: `Welcome to your ${next.name}!`, tone: 'gold', icon: 'building' } : { text: r.error, tone: 'bad' });
              }}
            >
              {confirmUp ? `Confirm: pay ${fmtMoney(money(next.moveCost, s.day))}, rent ${fmtMoney(monthlyRent(s))} → ${fmtMoney(nextRent)}/mo` : `Move to ${next.name} (${fmtMoney(money(next.moveCost, s.day))})…`}
            </Button>
          )}
          {prev &&
            (confirmDown ? (
              <Button variant="danger" onClick={() => { setConfirmDown(false); useGame.getState().actOrToast({ type: 'moveOffice', tier: prev.tier }, `Moved to ${aOrAn(prev.name)}`); }}>
                Confirm downsize (furniture that doesn’t fit is sold at 40%)
              </Button>
            ) : (
              <Button variant="ghost" disabled={Object.keys(s.staff).length > prev.staffCap} onClick={() => setConfirmDown(true)} title="Downsize to save rent">
                Downsize…
              </Button>
            ))}
        </div>
        {prev && Object.keys(s.staff).length > prev.staffCap && <p className="mt-1 text-[11px] text-ink3">Downsizing to the {prev.name} needs {Object.keys(s.staff).length - prev.staffCap} fewer people (it holds {prev.staffCap}).</p>}
        {next && s.company.reputation < next.minReputation && <p className="mt-1 text-[11px] text-ink3">The {next.name} needs reputation {next.minReputation} (you have {Math.round(s.company.reputation)}).</p>}
      </Section>

      <Section title="Layout health">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Health label="Walk to breaks" value={noBreak ? `${noBreak} desk(s) with none!` : `${avg((d) => d.energyDist).toFixed(1)} tiles`} good={!noBreak && avg((d) => d.energyDist) < 6} />
          <Health label="Décor aura" value={avg((d) => d.decor).toFixed(1)} good={avg((d) => d.decor) > 4} />
          <Health label="Crowding" value={`${avg((d) => d.crowding).toFixed(1)} desks nearby`} good={avg((d) => d.crowding) <= 3} />
          <Health label="Noise" value={(Math.abs(avg((d) => d.noise)) < 0.05 ? 0 : avg((d) => d.noise)).toFixed(1)} good={avg((d) => d.noise) < 1} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink3">Breaks restore energy; long walks waste time. Décor lifts morale nearby; crowding and noise hurt it. Use the overlays in build mode to see it.</p>
      </Section>

      <Section title="Style">
        <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Floor style">
          {(['auto', 'wood', 'carpet', 'concrete', 'tiles', 'checker'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={(s.office.style?.floor ?? 'auto') === f}
              onClick={() => useGame.getState().act({ type: 'setOfficeStyle', floor: f, wall: s.office.style?.wall })}
              className={cx('rounded-full border px-2.5 py-1 text-xs capitalize transition', (s.office.style?.floor ?? 'auto') === f ? 'border-accent bg-accent text-accent-ink' : 'border-line hover:bg-bg2')}
            >
              {f === 'auto' ? 'Default floor' : f}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Wall colour">
          <span className="mr-1 text-xs text-ink3">Walls</span>
          {[undefined, '#f3ece2', '#dfe9f2', '#e6f0e1', '#f6e3d8', '#e9e0f2', '#3b3f48'].map((c) => (
            <button
              key={c ?? 'default'}
              type="button"
              role="radio"
              aria-checked={s.office.style?.wall === c}
              aria-label={c ?? 'Default walls'}
              onClick={() => useGame.getState().act({ type: 'setOfficeStyle', floor: s.office.style?.floor ?? 'auto', wall: c })}
              className={cx('size-6 rounded-full border ring-offset-1 ring-offset-[var(--panel)]', s.office.style?.wall === c ? 'ring-2 ring-ink' : 'border-line')}
              style={{ background: c ?? 'linear-gradient(135deg, #f3ece2 50%, #2a2622 50%)' }}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-ink3">Purely cosmetic — make the place yours.</p>
      </Section>

      <Section title="Catalogue">
        <Segmented ariaLabel="Item category" value={cat} onChange={setCat} className="mb-2" options={CATS.map((c) => ({ value: c.id, label: c.label }))} />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ITEMS.filter((i) => cat === 'all' || i.category === cat).map((it) => {
            const lockedYear = yr < it.year;
            const lockedRes = it.research && !s.research.done.includes(it.research);
            const lockedReq = itemRequirement(s, it);
            const locked = lockedYear || lockedRes || !!lockedReq;
            const cost = money(it.cost, s.day);
            const active = build?.item === it.id;
            return (
              <button
                key={it.id}
                type="button"
                disabled={!!locked}
                onClick={() => {
                  setBuild(active ? { rot: 0 } : { item: it.id, rot: 0 });
                  if (!active && narrow()) useGame.setState({ panel: null }); // on a phone: back to the office to place it
                }}
                aria-pressed={active}
                className={cx('rounded-xl border p-2 text-left text-xs transition disabled:opacity-45', active ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{it.name}</span>
                  <span className={cx('num font-semibold', cost > s.company.cash && 'text-bad')}>{fmtMoney(cost)}</span>
                </div>
                <div className="mt-0.5 text-ink3">{locked ? (lockedYear ? `Available in ${it.year}` : lockedRes ? `Research ${RESEARCH_BY_ID[it.research!]?.name}` : lockedReq) : it.desc}</div>
                <div className="mt-1 flex gap-1 text-[10px] text-ink3">
                  <span>
                    {it.w}×{it.h}
                  </span>
                  {it.upkeep > 0 && <span>· {fmtMoney(money(it.upkeep, s.day))}/mo</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Health({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-bg2/70 p-2">
      <Icon name={good ? 'check' : 'warning'} size={16} className={good ? 'text-good' : 'text-warn'} />
      <div>
        <div className="text-ink3">{label}</div>
        <div className="num font-semibold">{value}</div>
      </div>
    </div>
  );
}
