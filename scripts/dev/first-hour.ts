/** What does a sensible new player earn from their first few games? */
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { fmtMoney } from '../../src/sim/util';
import { formatDate } from '../../src/sim/calendar';
for (const seed of [1, 2, 3]) {
  const s = createGame({ seed, companyName: 'H', founderName: 'H', autopause: false });
  const plan = [
    { genre: 'action', topic: 'aliens', platforms: ['atari_2600'] },
    { genre: 'adventure', topic: 'fantasy', platforms: ['apple_ii'] },
    { genre: 'shooter', topic: 'space', platforms: ['atari_2600'], deal: true },
  ] as const;
  const out: string[] = [];
  for (const g of plan) {
    const deal = 'deal' in g ? s.offers.deals[0]?.id : undefined;
    const r = dispatch(s, { type: 'startGame', game: { name: g.genre, genre: g.genre, topic: g.topic, platforms: [...g.platforms], audience: 'everyone', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'], dealId: deal } });
    if (!r.ok) { out.push('ERR ' + r.error); continue; }
    advance(s, 75);
  }
  advance(s, 200);
  for (const id of s.releaseOrder) { const x = s.releases[id]!; out.push(`${formatDate(x.day, false)} ${x.name} ${x.score} units ${x.units} net ${fmtMoney(x.net)}${x.concept.deal ? ' (deal)' : ''}`); }
  console.log(`seed ${seed}: cash ${fmtMoney(s.company.cash)} on ${formatDate(s.day, false)}\n  ` + out.join('\n  '));
}
