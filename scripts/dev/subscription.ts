/** Probe: a studio launches a subscription pass mid-game. Usage: npx tsx scripts/dev/subscription.ts [tycoon|steady] */
import { runBot } from '../../tests/bots/run';
import { makeBot } from '../../tests/bots/bots';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { fromDay } from '../../src/sim/calendar';
import { Rng } from '../../src/sim/rng';
import { catalogValue, subRefPrice, subTarget } from '../../src/sim/systems/subscription';
import { trailingRevenue } from '../../src/sim/systems/finance';
import { fmtMoney } from '../../src/sim/util';

const bot = (process.argv[2] ?? 'tycoon') as 'tycoon' | 'steady';
for (const seed of [1, 2]) {
  const run = runBot(bot, seed, 34);
  const s = run.state;
  if (!s.research.done.includes('biz_subscription')) s.research.done.push('biz_subscription');
  const r = dispatch(s, { type: 'launchSubscription', name: 'Pass', price: subRefPrice(s) });
  console.log(
    `seed ${seed} ${fromDay(s.day).year} games ${s.releaseOrder.length} rep ${Math.round(s.company.reputation)} catalog ${catalogValue(s).toFixed(1)} ref ${subRefPrice(s).toFixed(2)} target ${subTarget(s).subsM.toFixed(2)}M rev12 ${fmtMoney(trailingRevenue(s))}`,
    r.ok ? '' : r,
  );
  const b = makeBot(bot);
  const rng = new Rng([seed, 3, 3, 3]);
  for (let y = 0; y < 6; y++) {
    for (let w = 0; w < 52; w++) {
      b.act(s, rng);
      advance(s, 7);
    }
    const sub = s.subscription;
    if (!sub) break;
    const l = s.finance.ledger[s.finance.ledger.length - 2]!;
    console.log(
      `  ${fromDay(s.day).year} subs ${(sub.subscribers / 1e6).toFixed(2)}M total ${fmtMoney(sub.revenue)} month ${fmtMoney(l.income.subscriptions ?? 0)} vs sales ${fmtMoney(l.income.sales ?? 0)} rev12 ${fmtMoney(trailingRevenue(s))}`,
    );
  }
}
