/** Economy probe: expected lifetime units/revenue vs dev cost per era, size and score. */
import { createGame } from '../src/sim/create';
import { BALANCE } from '../src/data/balance';
import { salesPotential, gamePrice, netPerUnit } from '../src/sim/systems/release';
import { availablePlatforms } from '../src/sim/systems/market';
import { marketSalary, emptySkills } from '../src/sim/systems/staff';
import { sizeDailyCost } from '../src/sim/systems/dev';
import { fmtMoney, fmtUnits } from '../src/sim/util';
import type { Size } from '../src/sim/types';
const sizes: Size[] = ['small', 'medium', 'large', 'aaa'];
const repByYear = (y: number) => Math.min(75, 10 + (y - 1980) * 1.4);
for (const year of [1980, 1983, 1986, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025]) {
  const s = createGame({ seed: 1, companyName: 'P', founderName: 'P', startYear: year });
  s.company.reputation = repByYear(year);
  const plats = availablePlatforms(s).filter((p) => p.kind === 'console' || p.kind === 'computer').sort((a, b) => (s.market.users[b.id] ?? 0) - (s.market.users[a.id] ?? 0)).slice(0, 2);
  const sk = emptySkills(); sk.design = 55;
  const sal = marketSalary(s, sk);
  const row: string[] = [`${year} rep${Math.round(s.company.reputation)} [${plats.map((p) => p.id + ':' + Math.round(s.market.users[p.id] ?? 0) + 'M').join(',')}] sal ${fmtMoney(sal)}`];
  for (const size of sizes) {
    const sz = BALANCE.SIZE[size];
    const cost = sz.typicalTeam * sal * (sz.days / 365) + sizeDailyCost(size, s.day) * sz.days;
    const cells: string[] = [];
    for (const score of [60, 70, 80, 90]) {
      const pot = salesPotential(s, { name: 'x', genre: 'action', topic: 'scifi', platforms: plats.map((p) => p.id), audience: 'teen', size, monetization: 'premium', engineId: 'e0' }, score, 0.3);
      let units = 0, net = 0;
      for (const p of pot.platforms) { const price = gamePrice(s, p.pl, size, 'premium'); units += p.potential; net += p.potential * netPerUnit(s, p.pl, price, true); }
      cells.push(`${score}:${fmtUnits(units)}/${fmtMoney(net)}`);
    }
    row.push(`  ${size.padEnd(6)} cost ${fmtMoney(cost).padEnd(7)} ${cells.join('  ')}`);
  }
  console.log(row.join('\n'));
}
