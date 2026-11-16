/** Print Golden Pixel Gala winners over a stretch of history (idle studio, real rivals only). */
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';

const start = Number(process.argv[2] ?? 1984);
const s = createGame({ seed: 3, companyName: 'Observer', founderName: 'O', startYear: start, autopause: false, endless: true });
s.company.cash = 1e9; // stay solvent while watching
for (let y = 0; y < 12; y++) {
  advance(s, 366);
  s.company.cash = 1e9;
  s.pendingEvents = [];
}
for (const y of s.awardHistory ?? []) {
  const g = y.winners.find((w) => w.category === 'Game of the Year');
  console.log(y.year, g ? `${g.name} (${g.company}, ${g.score})` : '—', '|', y.winners.filter((w) => w !== g).map((w) => `${w.category.replace('Best ', '')}: ${w.name}`).join('; '));
}
