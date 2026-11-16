import { useState } from 'react';
import { ITEMS, OFFICE_TIERS, type ItemCategory } from '@/data/facilities';
import { RESEARCH_BY_ID } from '@/data/research';
import { fromDay } from '@/sim/calendar';
import { fmtMoney, money } from '@/sim/util';
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

export default function OfficePanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const build = useGame((g) => g.build);
  const setBuild = useGame((g) => g.setBuild);
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const [cat, setCat] = useState<ItemCategory | 'all'>('desk');
  const yr = fromDay(s.day).year;
  const t = tierDef(s.office.tier);
  const next = OFFICE_TIERS.find((x) => x.tier === s.office.tier + 1);
  const prev = OFFICE_TIERS.find((x) => x.tier === s.office.tier - 1);
  const L = layout(s);
  const desks = Object.values(L.desks);
  const avg = (f: (d: (typeof desks)[number]) => number) => (desks.length ? desks.reduce((a, d) => a + f(d), 0) / desks.length : 0);
  const noBreak = desks.filter((d) => d.energyDist === Infinity).length;

  return (
    <div>
      <Section title={`${t.name} · tier ${t.tier}`} right={<Pill>{Object.keys(s.staff).length}/{t.staffCap} staff</Pill>}>
        <p className="text-xs text-ink3">{t.desc}</p>
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
          <Button variant={build ? 'primary' : 'secondary'} icon="build" onClick={() => setBuild(build ? null : { rot: 0 })} data-tutorial="build-mode">
            {build ? 'Exit build mode' : 'Edit layout'}
          </Button>
          {next && (
            <Button
              icon="building"
              disabled={s.company.reputation < next.minReputation || s.company.cash < money(next.moveCost, s.day)}
              title={s.company.reputation < next.minReputation ? `Needs ${next.minReputation} reputation` : undefined}
              onClick={() => {
                const r = act({ type: 'moveOffice', tier: next.tier });
                toast(r.ok ? { text: `Welcome to your ${next.name}!`, tone: 'gold', icon: 'building' } : { text: r.error, tone: 'bad' });
              }}
            >
              Move to {next.name} ({fmtMoney(money(next.moveCost, s.day))})
            </Button>
          )}
          {prev && (
            <Button variant="ghost" onClick={() => act({ type: 'moveOffice', tier: prev.tier })} title="Downsize to save rent">
              Downsize
            </Button>
          )}
        </div>
        {next && s.company.reputation < next.minReputation && <p className="mt-1 text-[11px] text-ink3">The {next.name} needs reputation {next.minReputation} (you have {Math.round(s.company.reputation)}).</p>}
      </Section>

      <Section title="Layout health">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Health label="Walk to breaks" value={noBreak ? `${noBreak} desk(s) with none!` : `${avg((d) => d.energyDist).toFixed(1)} tiles`} good={!noBreak && avg((d) => d.energyDist) < 6} />
          <Health label="Décor aura" value={avg((d) => d.decor).toFixed(1)} good={avg((d) => d.decor) > 4} />
          <Health label="Crowding" value={`${avg((d) => d.crowding).toFixed(1)} desks nearby`} good={avg((d) => d.crowding) <= 3} />
          <Health label="Noise" value={avg((d) => d.noise).toFixed(1)} good={avg((d) => d.noise) < 1} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink3">Breaks restore energy; long walks waste time. Décor lifts morale nearby; crowding and noise hurt it. Use the overlays in build mode to see it.</p>
      </Section>

      <Section title="Catalogue">
        <Segmented ariaLabel="Item category" value={cat} onChange={setCat} className="mb-2" options={CATS.map((c) => ({ value: c.id, label: c.label }))} />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ITEMS.filter((i) => cat === 'all' || i.category === cat).map((it) => {
            const lockedYear = yr < it.year;
            const lockedRes = it.research && !s.research.done.includes(it.research);
            const locked = lockedYear || lockedRes;
            const cost = money(it.cost, s.day);
            const active = build?.item === it.id;
            return (
              <button
                key={it.id}
                type="button"
                disabled={!!locked}
                onClick={() => setBuild(active ? { rot: 0 } : { item: it.id, rot: 0 })}
                aria-pressed={active}
                className={cx('rounded-xl border p-2 text-left text-xs transition disabled:opacity-45', active ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{it.name}</span>
                  <span className={cx('num font-semibold', cost > s.company.cash && 'text-bad')}>{fmtMoney(cost)}</span>
                </div>
                <div className="mt-0.5 text-ink3">{locked ? (lockedYear ? `Available in ${it.year}` : `Research ${RESEARCH_BY_ID[it.research!]?.name}`) : it.desc}</div>
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
