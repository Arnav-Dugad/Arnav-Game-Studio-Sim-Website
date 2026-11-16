/** How many awards do bots win over a full run? */
import { runBot } from '../../tests/bots/run';
for (const bot of ['steady', 'tycoon', 'trend'] as const)
  for (const seed of [1000, 8919]) {
    const r = runBot(bot, seed, 46);
    const mine = (r.state.awardHistory ?? []).flatMap((y) => y.winners.filter((w) => w.mine).map((w) => `${y.year}:${w.category}`));
    console.log(bot, seed, 'awards', r.state.progress.stats.awardsWon, mine.slice(0, 8).join(' '));
  }
