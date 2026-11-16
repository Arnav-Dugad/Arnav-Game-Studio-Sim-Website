/** What does a brand-new player's first game score with the wizard defaults vs. a few sensible picks? */
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import type { GenreId } from '../../src/data/types';

function first(genre: GenreId, topic: string, seed: number, idx = 0): number {
  const s = createGame({ seed, companyName: 'New', founderName: 'N', startYear: 1980, autopause: false });
  const plats = availablePlatforms(s).sort((a, b) => (s.market.users[b.id] ?? 0) - (s.market.users[a.id] ?? 0));
  const r = dispatch(s, { type: 'startGame', game: { name: 'G', genre, topic, platforms: [plats[idx]!.id], audience: 'everyone', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'], dealId: s.offers.deals[0]?.id } });
  if (!r.ok) return -1;
  for (let i = 0; i < 200 && !s.releaseOrder.length; i++) {
    advance(s, 1);
    for (const p of Object.values(s.projects)) if (p.kind === 'game' && p.awaitingGate) dispatch(s, { type: 'continueGate', projectId: p.id });
    s.pendingEvents = [];
  }
  return s.releaseOrder.length ? Math.round(s.releases[s.releaseOrder[0]!]!.score) : -2;
}

const combos: [GenreId, string][] = [['action', 'fantasy'], ['action', 'scifi'], ['adventure', 'fantasy'], ['rpg', 'fantasy'], ['puzzle', 'fantasy'], ['strategy', 'military'], ['sports', 'pro_sports']];
for (const [g, t] of combos) {
  const scores = [1, 2, 3, 4, 5, 6].map((seed) => first(g, t, seed));
  console.log(g.padEnd(10), t.padEnd(12), scores.join(' '));
}
