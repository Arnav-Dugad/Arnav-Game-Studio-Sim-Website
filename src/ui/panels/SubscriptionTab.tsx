import { useState } from 'react';
import { RESEARCH_BY_ID } from '@/data/research';
import { formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits } from '@/sim/util';
import { SUB_CANNIBALIZE, SUB_MIN_GAMES, SUB_MIN_REP, SUB_RESEARCH, canLaunchSub, catalogValue, subLaunchCost, subRefPrice, subServerCost, subTarget } from '@/sim/systems/subscription';
import { Sparkline } from '../charts';
import { BreakdownList, Button, Field, Section, Stat, Tip, inputCls } from '../components/ui';
import { Icon } from '../icons';
import { useGame } from '../store';

const fmtPrice = (n: number) => `$${n.toFixed(2)}`;

export function SubscriptionTab() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const sub = s.subscription;
  const ref = subRefPrice(s);
  const [name, setName] = useState(sub?.name ?? `${s.company.name.split(' ')[0]} Pass`);
  const [price, setPrice] = useState(() => Math.round((sub?.active ? sub.price : ref) * 100) / 100);
  const [confirmClose, setConfirmClose] = useState(false);
  const act = useGame.getState().actOrToast;
  const preview = subTarget(s, price);
  const monthly = preview.subsM * 1e6 * price * 0.7 - preview.subsM * 1e6 * subServerCost(s);
  const blocked = canLaunchSub(s);

  return (
    <div>
      <p className="mb-3 text-xs text-ink3">
        An all-you-can-play monthly pass for your back catalogue. Subscribers drift toward a level set by how many good, recent games you have, your reputation and your price. It brings recurring income, but each subscriber costs server time, and older games (over a year old) sell {Math.round(SUB_CANNIBALIZE * 100)}% fewer copies while the pass runs.
      </p>
      {sub?.active ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Subscribers" value={fmtUnits(sub.subscribers)} sub={`peak ${fmtUnits(sub.peak)}`} />
            <Stat label="Price" value={`${fmtPrice(sub.price)}/mo`} sub={`players expect ~${fmtPrice(ref)}`} />
            <Stat label="Lifetime revenue" value={fmtMoney(sub.revenue)} tone="good" sub={`since ${formatDate(sub.launchedDay, false)}`} />
          </div>
          <Section title={sub.name} right={sub.history.length > 1 ? <Sparkline values={sub.history.slice(-36)} ariaLabel="Subscribers per month" /> : undefined}>
            <Tip content={<BreakdownList bd={subTarget(s).why} format={(v) => `${v.toFixed(2)}M`} title="Where subscribers are heading" />}>
              <span className="cursor-help text-xs text-ink2 underline decoration-dotted">
                Heading toward {fmtUnits(subTarget(s).subsM * 1e6)} subscribers · catalogue strength {catalogValue(s).toFixed(1)}
              </span>
            </Tip>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Monthly price" hint={`At this price: ~${fmtUnits(preview.subsM * 1e6)} subscribers, ~${fmtMoney(monthly)}/mo after store cut and servers`}>
                <input type="number" min={Math.ceil(ref * 0.25 * 2) / 2} max={Math.floor(ref * 4 * 2) / 2} step={0.5} className={inputCls} value={price} onChange={(e) => setPrice(Math.min(Math.floor(ref * 4 * 2) / 2, Math.max(Math.ceil(ref * 0.25 * 2) / 2, Number(e.target.value) || ref)))} />
              </Field>
              <Button size="sm" disabled={price === sub.price} onClick={() => act({ type: 'setSubscriptionPrice', price }, 'Price updated')}>
                Apply
              </Button>
            </div>
            <div className="mt-3 flex justify-end">
              {confirmClose ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setConfirmClose(false);
                    act({ type: 'closeSubscription' }, `${sub.name} closed`);
                  }}
                >
                  Confirm shutdown (reputation −2)
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmClose(true)}>
                  Shut down…
                </Button>
              )}
            </div>
          </Section>
        </>
      ) : blocked ? (
        <div className="rounded-xl bg-bg2/60 p-3 text-xs text-ink3">
          <Icon name="lock" size={14} className="mr-1 inline" />
          {blocked}
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            <li className={s.research.done.includes(SUB_RESEARCH) ? 'text-good' : ''}>Research {RESEARCH_BY_ID[SUB_RESEARCH]?.name}</li>
            <li className={s.releaseOrder.length >= SUB_MIN_GAMES ? 'text-good' : ''}>
              {SUB_MIN_GAMES}+ released games (you have {s.releaseOrder.length})
            </li>
            <li className={s.company.reputation >= SUB_MIN_REP ? 'text-good' : ''}>
              Reputation {SUB_MIN_REP}+ (you have {Math.round(s.company.reputation)})
            </li>
          </ul>
        </div>
      ) : (
        <Section title={sub ? 'Relaunch your pass' : 'Launch a pass'}>
          <div className="space-y-2 rounded-2xl border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Name">
                <input className={inputCls} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={`Monthly price · players expect ~${fmtPrice(ref)} (${fmtPrice(ref * 0.25)}–${fmtPrice(ref * 4)})`}>
                <input type="number" min={Math.ceil(ref * 0.25 * 2) / 2} max={Math.floor(ref * 4 * 2) / 2} step={0.5} className={inputCls} value={price} onChange={(e) => setPrice(Math.min(Math.floor(ref * 4 * 2) / 2, Math.max(Math.ceil(ref * 0.25 * 2) / 2, Number(e.target.value) || ref)))} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg2/60 p-2.5 text-xs">
              <Tip content={<BreakdownList bd={preview.why} format={(v) => `${v.toFixed(2)}M`} title="Expected subscribers" />}>
                <span className="cursor-help">
                  Expect ~<b className="num">{fmtUnits(preview.subsM * 1e6)}</b> subscribers in a year or so · ~{fmtMoney(monthly)}/mo
                </span>
              </Tip>
              <Button variant="primary" size="sm" onClick={() => act({ type: 'launchSubscription', name, price }, `${name} is live!`)}>
                Launch · {fmtMoney(subLaunchCost(s))}
              </Button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
