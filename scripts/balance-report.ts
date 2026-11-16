/**
 * Balance report: runs every bot across several seeds and prints a summary table
 * (also written to reports/balance.md). Usage: npm run balance [-- seeds=5 years=46 bots=steady,idle]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { runBot } from '../tests/bots/run';
import type { BotName } from '../tests/bots/bots';
import { fmtMoney } from '../src/sim/util';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=') as [string, string]));
const seeds = Number(args.seeds ?? 4);
const years = Number(args.years ?? 46);
const bots = (args.bots ?? 'idle,steady,aggressive,trend,random,tycoon').split(',') as BotName[];
const verbose = args.verbose === '1';

const lines: string[] = ['# Balance report', '', `seeds=${seeds} years=${years}`, ''];
lines.push('| bot | seed | end | status | cash | valuation | rep | staff | games | best | hits | flops | tier | errors | ms |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const bot of bots) {
  for (let i = 0; i < seeds; i++) {
    const seed = 1000 + i * 7919;
    const r = runBot(bot, seed, years);
    const s = r.state;
    const st = s.progress.stats;
    lines.push(
      `| ${bot} | ${seed} | ${r.endYear} | ${s.status} | ${fmtMoney(s.company.cash)} | ${fmtMoney(st.peakValuation)} | ${Math.round(s.company.reputation)} | ${Object.keys(s.staff).length} | ${st.gamesReleased} | ${st.bestScore} | ${st.hits} | ${st.flops} | ${s.office.tier} | ${r.errors.length} | ${r.ms} |`,
    );
    if (verbose) {
      for (const y of r.years.filter((_, k) => k % 3 === 0)) console.log(bot, seed, JSON.stringify(y));
      const last = s.releaseOrder.slice(-3).map((id) => s.releases[id]!);
      for (const rel of last) console.log('  ', rel.name, rel.concept.size, rel.score, rel.units, fmtMoney(rel.net));
      if (r.errors.length) console.log('  ERR', r.errors.slice(0, 3));
    }
  }
}
const out = lines.join('\n');
console.log(out);
mkdirSync('reports', { recursive: true });
writeFileSync('reports/balance.md', out);
