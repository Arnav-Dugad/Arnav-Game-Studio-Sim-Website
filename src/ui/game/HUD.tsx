import { useState } from 'react';
import { OFFICE_TIERS } from '@/data/facilities';
import { weatherGlyph } from '@/render/weather';
import { formatDate, fromDay } from '@/sim/calendar';
import { CAT_LABEL, fmtSharePrice } from './format';
import type { LedgerCat } from '@/sim/types';
import { BD } from '@/sim/breakdown';
import { fmtMoney, fmtUnits } from '@/sim/util';
import { monthlyBurn, trailingRevenue } from '@/sim/systems/finance';
import type { SaveStatus } from '@/services/saves';
import { CompanyBadge } from '../art/CompanyBadge';
import { Icon } from '../icons';
import { BreakdownList, IconButton, Tip, cx } from '../components/ui';
import { useGame, type Speed } from '../store';
import { sound } from '../sound';

const SPEEDS: { s: Speed; icon: 'pause' | 'play' | 'fast' | 'fastest'; label: string; key: string }[] = [
  { s: 0, icon: 'pause', label: 'Pause', key: 'Space' },
  { s: 1, icon: 'play', label: 'Normal speed', key: '1' },
  { s: 2, icon: 'fast', label: 'Fast', key: '2' },
  { s: 4, icon: 'fastest', label: 'Fastest', key: '3' },
];

function lastMonthBreakdown(s: NonNullable<ReturnType<typeof useGame.getState>['s']>) {
  const m = s.finance.ledger[s.finance.ledger.length - 2] ?? s.finance.ledger[s.finance.ledger.length - 1];
  // the month's flows, in and out (the result is the net change in cash, not a balance)
  const bd = new BD('Money in and out', 0);
  if (!m) return bd.done();
  bd.parts = [];
  for (const [k, v] of Object.entries(m.income)) if (v) bd.add(CAT_LABEL[k as LedgerCat] ?? k, v);
  for (const [k, v] of Object.entries(m.expense)) if (v) bd.add(CAT_LABEL[k as LedgerCat] ?? k, -v);
  return bd.done();
}

export function HUD({ saveStatus, onSave, onExit, onZoom, onPhoto, onCinema }: { saveStatus: SaveStatus; onSave: () => void; onExit: () => void; onZoom: (f: number) => void; onPhoto?: () => void; onCinema?: () => void }) {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const speed = useGame((g) => g.speed);
  const setSpeed = useGame((g) => g.setSpeed);
  const pushModal = useGame((g) => g.pushModal);
  const openPanel = useGame((g) => g.openPanel);
  const [menu, setMenu] = useState(false);
  const burn = monthlyBurn(s);
  const runway = s.company.cash > 0 ? s.company.cash / Math.max(1, burn - trailingRevenue(s) / 12) : 0;
  const stock = s.finance.stock;
  const cashTone = s.company.cash < 0 ? 'text-bad' : s.company.cash < burn * 2 ? 'text-warn' : 'text-ink';

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-wrap items-start gap-2 p-2 sm:p-3">
      <div className="glass pointer-events-auto flex items-center gap-2.5 rounded-2xl py-1.5 pl-1.5 pr-3">
        <button type="button" className="rounded-xl transition hover:scale-105" title="Studio identity" aria-label="Edit studio identity" onClick={() => pushModal({ kind: 'identity' })}>
          <CompanyBadge name={s.company.name} color={s.company.color} size={34} emblem={s.company.logo?.emblem} shape={s.company.logo?.shape} />
        </button>
        <div className="min-w-0">
          <div className="max-w-40 truncate font-display text-sm font-semibold leading-tight">{s.company.name}</div>
          <div className="num text-xs text-ink3" aria-live="polite">
            {formatDate(s.day)} <span aria-hidden title="Today’s weather">{weatherGlyph(s.day, fromDay(s.day).month)}</span>
          </div>
        </div>
      </div>

      <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-2xl p-1" role="group" aria-label="Game speed">
        {SPEEDS.map((x) => (
          <IconButton key={x.s} icon={x.icon} label={`${x.label} (${x.key})`} active={speed === x.s} onClick={() => setSpeed(x.s)} disabled={s.status !== 'running'} />
        ))}
      </div>

      <div className="glass pointer-events-auto flex items-center divide-x divide-line rounded-2xl" data-tutorial="hud-cash">
        <Tip content={<BreakdownList bd={lastMonthBreakdown(s)} format={(v) => fmtMoney(v)} title="Last month's cash flow" result="Net change" />} side="bottom">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Icon name="cash" size={16} className="text-gold" />
            <div>
              <div className={cx('num font-display text-sm font-semibold leading-tight', cashTone)}>{fmtMoney(s.company.cash)}</div>
              <div className="num text-[10px] text-ink3">burn {fmtMoney(burn)}/mo{runway > 0 && runway < 6 ? ` · ${runway.toFixed(1)} mo runway` : ''}</div>
            </div>
          </div>
        </Tip>
        <Tip content={<RepWhy />} side="bottom">
          <div className="flex items-center gap-1.5 px-2 py-2 sm:px-3">
            <Icon name="reputation" size={16} className="text-accent" />
            <span className="num text-sm font-semibold">{Math.round(s.company.reputation)}</span>
          </div>
        </Tip>
        <Tip content={<span>Fans boost launch sales and franchise sequels.</span>} side="bottom">
          <div className="flex items-center gap-1.5 px-2 py-2 sm:px-3">
            <Icon name="fans" size={16} className="text-art" />
            <span className="num text-sm font-semibold sm:hidden">{fmtUnits(s.company.fans)}</span>
            <span className="num hidden text-sm font-semibold sm:inline">{Math.round(s.company.fans).toLocaleString()}</span>
          </div>
        </Tip>
        {stock && (
          <button type="button" onClick={() => openPanel('company', 'stock')} className="flex items-center gap-1.5 px-3 py-2">
            <Icon name="chart" size={16} className="text-tech" />
            <span className="num text-sm font-semibold">{fmtSharePrice(stock.price)}</span>
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="glass pointer-events-auto hidden items-center gap-0.5 rounded-2xl p-1 md:flex">
          <IconButton icon="minus" label="Zoom out (-)" onClick={() => onZoom(1 / 1.2)} />
          <IconButton icon="target" label="Fit office (0)" onClick={() => onZoom(0)} />
          <IconButton icon="plus" label="Zoom in (+)" onClick={() => onZoom(1.2)} />
        </div>
        <div className="glass pointer-events-auto flex items-center rounded-2xl p-1 md:hidden">
          <IconButton icon="target" label="Fit office (0)" onClick={() => onZoom(0)} />
        </div>
        <div className="glass pointer-events-auto flex items-center gap-1 rounded-2xl p-1">
          <SaveBadge st={saveStatus} onSave={onSave} />
          <IconButton icon="help" label="How to play" onClick={() => pushModal({ kind: 'guide' })} />
          <div className="relative">
            <IconButton icon="menu" label="Menu" onClick={() => setMenu((m) => !m)} aria-expanded={menu} />
            {menu && (
              <div className="glass absolute right-0 top-11 z-50 w-48 rounded-xl p-1 animate-pop" role="menu" onMouseLeave={() => setMenu(false)}>
                {[
                  { icon: 'save' as const, label: 'Save now', run: onSave },
                  ...(onPhoto ? [{ icon: 'camera' as const, label: 'Office photo (P)', run: onPhoto }] : []),
                  ...(onCinema ? [{ icon: 'eye' as const, label: 'Cinematic mode (V)', run: onCinema }] : []),
                  { icon: 'settings' as const, label: 'Settings', run: () => openPanel('settings') },
                  { icon: 'sparkle' as const, label: 'Cheats ( ` )', run: () => openPanel('cheats') },
                  { icon: 'book' as const, label: 'How to play', run: () => pushModal({ kind: 'guide' }) },
                  { icon: 'keyboard' as const, label: 'Shortcuts (?)', run: () => pushModal({ kind: 'shortcuts' }) },
                  { icon: 'logout' as const, label: 'Save & exit', run: onExit },
                ].map((m) => (
                  <button
                    key={m.label}
                    role="menuitem"
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-bg2"
                    onClick={() => {
                      sound.play('click');
                      setMenu(false);
                      m.run();
                    }}
                  >
                    <Icon name={m.icon} size={16} />
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function SaveBadge({ st, onSave }: { st: SaveStatus; onSave: () => void }) {
  const label =
    st.state === 'saving' ? 'Saving…' : st.state === 'offline' ? 'Offline — saved on this device' : st.state === 'error' ? `Save error: ${st.error ?? ''}` : st.lastCloud ? 'Saved to cloud' : st.lastLocal ? 'Saved on this device' : 'Not saved yet';
  const icon = st.state === 'offline' || st.state === 'error' ? 'cloud-off' : 'cloud';
  return (
    <IconButton
      icon={icon}
      label={`${label} — click to save (Shift+P)`}
      onClick={onSave}
      className={cx(st.state === 'saving' && 'animate-pulse', st.state === 'error' && 'text-bad', st.state === 'offline' && 'text-warn')}
    />
  );
}

function RepWhy() {
  const s = useGame((g) => g.s)!;
  const log = [...(s.company.repLog ?? [])].reverse().slice(0, 8);
  return (
    <div className="min-w-60 text-xs">
      <div className="font-semibold">Reputation {Math.round(s.company.reputation)}/100</div>
      <p className="mt-0.5 text-ink3">Affects hiring quality, sales reach, publisher terms and office moves.</p>
      <p className="mt-1 text-ink2">Earn it with well-reviewed games (70+), awards and shipping regularly; flops, missed deadlines and scandals cost it.</p>
      {(() => {
        const next = OFFICE_TIERS.find((o) => o.tier === s.office.tier + 1);
        return next && next.minReputation > s.company.reputation ? (
          <p className="mt-1 font-semibold text-accent">
            The {next.name} needs {next.minReputation} — {Math.ceil(next.minReputation - s.company.reputation)} to go.
          </p>
        ) : null;
      })()}
      {log.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-line pt-2">
          {log.map((e, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="text-ink2">
                {e.reason} <span className="text-ink3">· {formatDate(e.day, false)}</span>
              </span>
              <span className={cx('num font-semibold', e.delta >= 0 ? 'text-good' : 'text-bad')}>
                {e.delta >= 0 ? '+' : ''}
                {e.delta.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
