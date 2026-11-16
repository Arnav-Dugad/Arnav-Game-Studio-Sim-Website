import type { ContractProject } from '../../src/sim/types';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { advance } from '../../src/sim/advance';
const s = createGame({ seed: 3, companyName: 'c', founderName: 'f', autopause: false });
const o = s.offers.contracts[0]!;
console.log('offer', o.title, 'D', o.needDesign, 'T', o.needTech, 'days', o.days, 'pay', o.pay);
console.log(dispatch(s, { type: 'acceptContract', offerId: o.id, team: ['founder'] }));
const p = Object.values(s.projects)[0] as ContractProject;
for (let i = 0; i < 12; i++) { advance(s, 7); const q = s.projects[p.id] as ContractProject; if (!q) { console.log('done at week', i); break; } console.log('week', i, 'D', q.design.toFixed(1), 'T', q.tech.toFixed(1), 'energy', s.staff.founder!.energy.toFixed(0), 'act', s.staff.founder!.activity); }
console.log(s.news.slice(-2).map(n => n.headline));
