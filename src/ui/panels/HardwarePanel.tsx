import { useState } from 'react';
import { RESEARCH_BY_ID } from '@/data/research';
import { formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits, money } from '@/sim/util';
import { MARKETING, MIN_REPUTATION, RESEARCH_ID, TIERS, WHOLESALE, canDesignConsole, consoleProfit, consoleSpec, frontierTech, launchPotential, packInMul, mediaFor, priceBounds, priceFactor, projectsTargeting, refPrice, supportFactor, unitCost, type ConsoleKind, type ConsoleMarketing, type ConsoleTier, plannedLaunchDay } from '@/sim/systems/hardware';
import type { Action } from '@/sim/actions';
import type { PlayerConsole } from '@/sim/types';
import { fromDay } from '@/sim/calendar';
import { Sparkline } from '../charts';
import { BreakdownList, Button, Empty, Field, Meter, Pill, Section, Segmented, Stat, Tip, cx, inputCls } from '../components/ui';
import { Icon } from '../icons';
import { useGame } from '../store';

export default function HardwarePanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const researched = s.research.done.includes(RESEARCH_ID);
  const consoles = [...(s.hardware ?? [])].reverse();
  return (
    <div>
      <p className="mb-3 text-xs text-ink3">
        Become a platform holder. Hardware sells on thin margins (often at a loss at launch), but every game sold on your platform pays you a licence fee — and your own games there pay no platform cut at all.
      </p>
      {!researched ? (
        <Empty icon="controller" title="No hardware lab yet">
          Research <b>{RESEARCH_BY_ID[RESEARCH_ID]?.name}</b> in the Business branch to design your own console.
        </Empty>
      ) : (
        <>
          {consoles.map((c) => (
            // remount when the sim changes price/fee/status so local edits never resurrect stale values
            <ConsoleCard key={`${c.id}-${c.status}-${c.price}-${c.feeRate}`} c={c} />
          ))}
          <Designer key={s.hardware?.length ?? 0} />
        </>
      )}
    </div>
  );
}

function ConsoleCard({ c }: { c: PlayerConsole }) {
  const s = useGame((g) => g.s)!;
  const [price, setPrice] = useState(c.price);
  const [fee, setFee] = useState(Math.round(c.feeRate * 100));
  const [confirm, setConfirm] = useState(false);
  const act = (a: Action, ok?: string) => useGame.getState().actOrToast(a, ok);

  if (c.status === 'dev') {
    const total = c.launchDay - c.devStartDay;
    const pct = ((s.day - c.devStartDay) / Math.max(1, total)) * 100;
    return (
      <Section title={c.name} right={<Pill tone="tech">In development</Pill>}>
        <div className="rounded-2xl border border-line p-3 text-xs">
          <div className="mb-1 flex justify-between">
            <span>
              {TIERS[c.tier].label} {c.kind} · tech {c.tech} · {c.media}
            </span>
            <span className="num text-ink3">launch {formatDate(c.launchDay, false)}</span>
          </div>
          <Meter value={pct} tone="tech" label="Hardware development progress" />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-ink3">
              R&amp;D {fmtMoney(c.rdPaid)} of {fmtMoney(c.rdTotal)} spent
            </span>
            {confirm ? (
              <Button size="sm" variant="danger" onClick={() => act({ type: 'cancelConsole', id: c.id }, `${c.name} cancelled`)}>
                Confirm — write off R&amp;D
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                Cancel project…
              </Button>
            )}
          </div>
        </div>
      </Section>
    );
  }

  const live = c.status === 'live';
  const profit = consoleProfit(c);
  const margin = c.price * WHOLESALE - unitCost(c, s.day);
  const users = s.market.users[c.id] ?? 0;
  const share = s.market.share[c.id] ?? 0;
  return (
    <Section title={c.name} right={live ? <Pill tone="good">On sale</Pill> : <Pill>Retired {c.endDay ? fromDay(c.endDay).year : ''}</Pill>}>
      <div className="rounded-2xl border border-line p-3">
        <div className="mb-2 flex items-center gap-3 text-xs text-ink3">
          <span className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent">
            <Icon name={c.kind === 'handheld' ? 'handheld' : 'controller'} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            {TIERS[c.tier].label} {c.kind} · tech {c.tech} · launched {formatDate(c.launchDay, false)}
            {c.priceWarDay !== undefined && <span className="text-bad"> · price war since {formatDate(c.priceWarDay, false)}</span>}
            {c.potentialWhy && (
              <Tip content={<BreakdownList bd={c.potentialWhy} format={(v) => `${v.toFixed(1)}M`} title="Expected lifetime demand at launch" />}>
                <div className="w-fit cursor-help underline decoration-dotted">Launch forecast {c.potentialM.toFixed(1)}M units</div>
              </Tip>
            )}
          </div>
          {c.monthly.length > 1 && <Sparkline values={c.monthly.slice(-36)} ariaLabel="Monthly hardware sales" />}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Units sold" value={fmtUnits(c.unitsSold)} sub={live ? `${fmtUnits(users * 1e6)} active · ${(share * 100).toFixed(1)}% share` : undefined} />
          <Stat label="Hardware margin" value={fmtMoney(c.hwRevenue - c.hwCost)} tone={c.hwRevenue - c.hwCost >= 0 ? 'good' : 'bad'} sub={live ? `${fmtMoney(margin)} per unit now` : undefined} />
          <Stat label="Licence fees" value={fmtMoney(c.feeRevenue)} tone="good" sub={`${Math.round(c.feeRate * 100)}% of third-party sales`} />
          <Stat label="R&D" value={fmtMoney(c.rdPaid)} />
          <Stat label="Lifetime profit" value={fmtMoney(profit)} tone={profit >= 0 ? 'good' : 'bad'} />
          <Stat label="Exclusives buzz" value={`+${Math.round(c.boost * 100)}%`} sub="from your hit games on it" />
        </div>
        {live && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label={`Retail price · market expects ~${fmtMoney(refPrice(c, s.day))}`} hint={`Demand ×${priceFactor({ ...c, price }, s.day).toFixed(2)} · allowed ${fmtMoney(priceBounds(c, s.day)[0])}–${fmtMoney(priceBounds(c, s.day)[1])}`}>
              <input type="number" min={1} className={inputCls} value={price} onChange={(e) => setPrice(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field label={`Licence fee · ${fee}%`} hint={`Third-party support ×${supportFactor(fee / 100).toFixed(2)}`}>
              <input type="range" min={0} max={50} step={1} value={fee} onChange={(e) => setFee(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Licence fee percentage" />
            </Field>
            <Button
              size="sm"
              disabled={price === c.price && fee === Math.round(c.feeRate * 100)}
              onClick={() =>
                act({ type: 'setConsole', id: c.id, price: price !== c.price ? price : undefined, feeRate: fee !== Math.round(c.feeRate * 100) ? fee / 100 : undefined }, 'Pricing updated')
              }
            >
              Apply
            </Button>
          </div>
        )}
        {live && <PackIn c={c} />}
        {live && (
          <div className="mt-2 flex justify-end">
            {confirm ? (
              <Button size="sm" variant="danger" onClick={() => act({ type: 'retireConsole', id: c.id }, `${c.name} discontinued`)}>
                Confirm discontinue
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={projectsTargeting(s, c.id) > 0}
                onClick={() => setConfirm(true)}
                title={projectsTargeting(s, c.id) > 0 ? 'Finish the games you are making for it first' : 'Stop manufacturing. Owners keep playing for a while, but the user base fades.'}
              >
                Discontinue…
              </Button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

function Designer() {
  const s = useGame((g) => g.s)!;
  const blocked = canDesignConsole(s);
  const [kind, setKind] = useState<ConsoleKind>('console');
  const [tier, setTier] = useState<ConsoleTier>('standard');
  const [marketing, setMarketing] = useState<ConsoleMarketing>('standard');
  const [fee, setFee] = useState(20);
  const n = (s.hardware?.length ?? 0) + 1;
  const [name, setName] = useState(`${s.company.name.split(' ')[0]} ${n === 1 ? 'One' : n === 2 ? 'Two' : n}`);
  const spec = consoleSpec(s, kind, tier);
  const [priceRaw, setPriceRaw] = useState<number | null>(null);
  const price = priceRaw ?? Math.round(spec.refPrice);
  const launchDay = plannedLaunchDay(s.day, spec.months);
  const preview: PlayerConsole = {
    id: 'preview',
    name,
    kind,
    tier,
    tech: spec.tech,
    media: mediaFor(fromDay(launchDay).year),
    status: 'live',
    devStartDay: s.day,
    launchDay,
    endDay: null,
    rdTotal: spec.rdTotal,
    rdPaid: 0,
    price,
    unitCost1980: spec.unitCost1980,
    feeRate: fee / 100,
    marketing,
    potentialM: 0,
    installedM: 0,
    boost: 0,
    unitsSold: 0,
    hwRevenue: 0,
    hwCost: 0,
    feeRevenue: 0,
    monthly: [],
  };
  const why = launchPotential(s, preview, s.day);
  const unit = money(spec.unitCost1980, launchDay);
  const marginAtLaunch = price * WHOLESALE - unit;
  const mktCost = money(MARKETING[marketing].cost, s.day);
  const pf = priceFactor({ ...preview, launchDay: s.day }, s.day);

  return (
    <Section title="Design new hardware">
      {blocked ? (
        <p className="rounded-xl bg-bg2/60 p-3 text-xs text-ink3">
          <Icon name="lock" size={14} className="mr-1 inline" />
          {blocked}
          {s.company.reputation < MIN_REPUTATION && ` (you have ${Math.round(s.company.reputation)}).`}
        </p>
      ) : (
        <div className="space-y-3 rounded-2xl border border-line p-3">
          <Field label="Name">
            <input className={inputCls} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Segmented
            ariaLabel="Hardware type"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setPriceRaw(null);
            }}
            options={[
              { value: 'console', label: 'Home console' },
              { value: 'handheld', label: 'Handheld' },
            ]}
          />
          <div className="grid gap-1.5 sm:grid-cols-3">
            {(Object.keys(TIERS) as ConsoleTier[]).map((t) => {
              const sp = consoleSpec(s, kind, t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tier === t}
                  onClick={() => {
                    setTier(t);
                    setPriceRaw(null);
                  }}
                  className={cx('rounded-xl border p-2 text-left text-xs transition', tier === t ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2')}
                >
                  <div className="flex justify-between font-semibold">
                    <span>{TIERS[t].label}</span>
                    <span className="num">tech {sp.tech}</span>
                  </div>
                  <div className="mt-0.5 text-ink3">{TIERS[t].desc}</div>
                  <div className="num mt-1 text-[10px] text-ink3">
                    R&amp;D {fmtMoney(sp.rdTotal)} · {sp.months} months
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={`Launch price · market expects ~${fmtMoney(spec.refPrice)}`} hint={`Demand ×${pf.toFixed(2)} · ${marginAtLaunch >= 0 ? 'profit' : 'loss'} of ${fmtMoney(Math.abs(marginAtLaunch))} per unit at launch`}>
              <input type="number" min={1} className={inputCls} value={price} onChange={(e) => setPriceRaw(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field label={`Licence fee for other publishers · ${fee}%`} hint={`Third-party support ×${supportFactor(fee / 100).toFixed(2)}`}>
              <input type="range" min={0} max={50} value={fee} onChange={(e) => setFee(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Licence fee percentage" />
            </Field>
          </div>
          <Segmented
            ariaLabel="Launch marketing"
            value={marketing}
            onChange={setMarketing}
            options={(Object.keys(MARKETING) as ConsoleMarketing[]).map((m) => ({ value: m, label: `${MARKETING[m].label}${MARKETING[m].cost ? ` · ${fmtMoney(money(MARKETING[m].cost, s.day))}` : ''}` }))}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg2/60 p-2.5 text-xs">
            <Tip content={<BreakdownList bd={why} format={(v) => `${v.toFixed(1)}M`} title="Expected lifetime demand (at the expected price)" />}>
              <span className="cursor-help">
                Forecast: <b className="num">~{why.total.toFixed(1)}M units</b> lifetime · frontier tech {frontierTech(s)} · {preview.media} media
              </span>
            </Tip>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const ok = useGame.getState().actOrToast({ type: 'designConsole', name, kind, tier, price, feeRate: fee / 100, marketing }, `Hardware project “${name}” started`);
                if (ok) {
                  setPriceRaw(null);
                  setName(`${s.company.name.split(' ')[0]} ${n + 1}`);
                }
              }}
            >
              Start hardware project · {fmtMoney(spec.rdTotal + mktCost)}
            </Button>
          </div>
          <p className="text-[11px] text-ink3">R&amp;D is paid monthly until launch. Release great games exclusively on your console to sell more hardware; a lower licence fee attracts more third-party games.</p>
        </div>
      )}
    </Section>
  );
}

function PackIn({ c }: { c: PlayerConsole }) {
  const s = useGame((g) => g.s)!;
  const games = s.releaseOrder.map((id) => s.releases[id]!).filter((r) => r.concept.platforms.includes(c.id));
  const mul = packInMul(s, c);
  return (
    <div className="mt-2">
      <Field label="Pack-in game" hint={games.length ? (mul > 1 ? `Hardware demand ×${mul.toFixed(2)} · bundled owners become franchise fans` : 'Bundle a great game to sell more hardware') : 'Release or port one of your games to this console to bundle it'}>
        <select
          className={inputCls}
          value={c.packIn ?? ''}
          disabled={!games.length}
          onChange={(e) => useGame.getState().actOrToast({ type: 'setConsole', id: c.id, packIn: e.target.value || null }, e.target.value ? 'Pack-in game set' : 'Pack-in removed')}
        >
          <option value="">None</option>
          {games.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({Math.round(r.score)})
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
