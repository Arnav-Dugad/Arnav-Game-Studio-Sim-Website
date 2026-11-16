import { runBot } from '../../tests/bots/run';
import { fmtMoney } from '../../src/sim/util';
import { fromDay } from '../../src/sim/calendar';
const bot = (process.argv[2] ?? 'steady') as never;
const r = runBot(bot, Number(process.argv[3] ?? 1000), Number(process.argv[4] ?? 10));
const s = r.state;
for (const id of s.releaseOrder) {
  const x = s.releases[id]!;
  console.log(fromDay(x.day).year, x.name.padEnd(8), x.concept.size.padEnd(6), x.concept.genre.padEnd(10), x.concept.platforms.join('+').padEnd(22), 'score', x.score, 'user', x.userScore, 'units', x.units, 'net', fmtMoney(x.net), 'deal', !!x.concept.deal, 'team?', x.quality.parts[0]!.value.toFixed(2), 'q', x.quality.total.toFixed(2));
}
console.log('rep', s.company.reputation, 'cash', fmtMoney(s.company.cash), 'staff', Object.keys(s.staff).length);
console.log(s.news.filter(n=>n.category==='studio').slice(-8).map(n=>n.headline).join('\n'));
