/** Probe: a mid-game studio launches a console. Prints yearly hardware economics. */
import { runBot } from '../../tests/bots/run';
import { makeBot } from '../../tests/bots/bots';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { fromDay } from '../../src/sim/calendar';
import { Rng } from '../../src/sim/rng';
import { consoleSpec, frontierTech } from '../../src/sim/systems/hardware';
import { fmtMoney } from '../../src/sim/util';

const startYears = Number(process.argv[2] ?? 15);
const tier = (process.argv[3] ?? 'standard') as 'budget' | 'standard' | 'premium';
const priceMul = Number(process.argv[4] ?? 1);
const fee = Number(process.argv[5] ?? 0.2);
for (const seed of [1, 2, 3]) {
  const run = runBot('tycoon', seed, startYears);
  const s = run.state;
  if (!s.research.done.includes('biz_hardware_lab')) s.research.done.push('biz_hardware_lab');
  s.company.reputation = Math.max(s.company.reputation, 60);
  s.company.cash += 5e7;
  const spec = consoleSpec(s, 'console', tier);
  const r = dispatch(s, { type: 'designConsole', name: 'Probe', kind: 'console', tier, price: Math.round(spec.refPrice * priceMul), feeRate: fee, marketing: 'standard' });
  console.log(`seed ${seed} ${fromDay(s.day).year} rep ${Math.round(s.company.reputation)} frontier ${frontierTech(s)} spec`, spec, r.ok ? '' : r);
  const b = makeBot('tycoon');
  const rng = new Rng([seed, 9, 9, 9]);
  for (let y = 0; y < 14; y++) {
    for (let w = 0; w < 52; w++) {
      b.act(s, rng);
      advance(s, 7);
    }
    const hw = s.hardware[0]!;
    console.log(
      `  ${fromDay(s.day).year} ${hw.status} pot ${hw.potentialM.toFixed(1)}M sold ${(hw.unitsSold / 1e6).toFixed(2)}M users ${(s.market.users[hw.id] ?? 0).toFixed(1)}M share ${((s.market.share[hw.id] ?? 0) * 100).toFixed(1)}% hw ${fmtMoney(hw.hwRevenue - hw.hwCost)} fees ${fmtMoney(hw.feeRevenue)} rd ${fmtMoney(hw.rdPaid)} boost ${hw.boost.toFixed(2)} cash ${fmtMoney(s.company.cash)}`,
    );
  }
}
