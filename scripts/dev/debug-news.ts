import { runBot } from '../../tests/bots/run';
const r = runBot((process.argv[2] ?? 'steady') as never, Number(process.argv[3] ?? 16838), Number(process.argv[4] ?? 6));
const s = r.state;
const counts: Record<string, number> = {};
for (const n of s.news) { const k = n.headline.replace(/[0-9]+/g, '#').replace(/fit-#|trend-#|steady Games/g, 'X').slice(0, 45); counts[k] = (counts[k] ?? 0) + 1; }
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v}\t${k}`).join('\n'));
console.log('rep', s.company.reputation, 'tier', s.office.tier);
