import { runBot } from '../../tests/bots/run';
import { fmtMoney } from '../../src/sim/util';
for (const diff of ['relaxed', 'hardcore'] as const)
  for (const bot of ['steady', 'tycoon'] as const)
    for (const seed of [1000, 8919]) {
      const r = runBot(bot, seed, 46, 1980, diff);
      console.log(diff.padEnd(9), bot.padEnd(7), seed, r.endYear, r.state.status, fmtMoney(r.state.progress.stats.peakValuation), 'errors', r.errors.length);
    }
