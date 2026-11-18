/**
 * Head-to-head rivalries. When one of your games launches within six weeks of a rival's game in the same
 * genre (and both are good enough to be compared), the press frames it as a showdown: the better-reviewed
 * game wins. Each rival keeps a win/loss record against you; the one you've clashed with most is your
 * nemesis. Small reputation swings make the clashes matter without dominating the economy.
 */
import { possessive } from '../util';
import { COMPANY_BY_ID } from '../../data/companies';
import { GENRE_BY_ID } from '../../data/genres';
import type { GameState, Release, RivalryRecord } from '../types';
import { addRep, pushNews } from '../util';

export const SHOWDOWN_WINDOW_DAYS = 45;
export const SHOWDOWN_MIN_SCORE = 65;

const rivalName = (s: GameState, id: string) => s.rivals[id]?.name ?? COMPANY_BY_ID[id]?.name ?? id;

/** Compare a new release with rival games of the same genre from the last six weeks. */
export function showdownOnRelease(s: GameState, rel: Release): void {
  if (rel.concept.expansionOf || rel.concept.remasterOf || rel.score < SHOWDOWN_MIN_SCORE) return;
  const foe = s.rivalGames
    .filter((g) => !g.publishedByPlayer && !g.contested && g.genre === rel.concept.genre && rel.day - g.day >= 0 && rel.day - g.day <= SHOWDOWN_WINDOW_DAYS && g.score >= SHOWDOWN_MIN_SCORE)
    .filter((g) => s.rivals[g.company] && !s.rivals[g.company]!.ownedByPlayer)
    .sort((a, b) => b.score - a.score)[0];
  if (!foe) return;
  foe.contested = true; // one showdown per rival game, so releases can't be stacked against it
  const rec: RivalryRecord = ((s.rivalry ??= {})[foe.company] ??= { wins: 0, losses: 0, draws: 0, last: '' });
  const genre = GENRE_BY_ID[rel.concept.genre].name;
  const them = rivalName(s, foe.company);
  const diff = rel.score - foe.score;
  if (Math.abs(diff) <= 1) {
    rec.draws += 1;
    rec.last = `${rel.name} vs ${foe.name}: a draw`;
    pushNews(s, { category: 'studio', headline: `${rel.name} and ${foe.name} fight to a draw`, body: `Critics can't split the season's two big ${genre} games (${rel.score} vs ${foe.score}).`, tone: 'neutral' });
  } else if (diff > 0) {
    rec.wins += 1;
    rec.last = `${rel.name} beat ${foe.name} (${rel.score}–${foe.score})`;
    addRep(s, foe.score >= 80 ? 1 : 0.5, `Beat ${possessive(them)} ${foe.name}`);
    pushNews(s, { category: 'studio', headline: `${rel.name} wins the ${genre} showdown with ${them}`, body: `Reviewers prefer it to ${foe.name} (${rel.score} vs ${foe.score}).${rec.wins >= 3 && rec.wins > rec.losses * 2 ? ` That's ${rec.wins} wins against ${them} now.` : ''}`, tone: 'good' });
  } else {
    rec.losses += 1;
    rec.last = `${foe.name} beat ${rel.name} (${foe.score}–${rel.score})`;
    addRep(s, -0.3, `Lost out to ${possessive(them)} ${foe.name}`);
    pushNews(s, { category: 'studio', headline: `${possessive(them)} ${foe.name} upstages ${rel.name}`, body: `Critics side with the rival in this season's ${genre} battle (${foe.score} vs ${rel.score}).`, tone: 'bad' });
  }
}

/** Your most-clashed-with rival (at least three showdowns), if any. */
export function nemesis(s: GameState): { id: string; name: string; rec: RivalryRecord } | null {
  let best: { id: string; name: string; rec: RivalryRecord } | null = null;
  for (const [id, rec] of Object.entries(s.rivalry ?? {})) {
    const n = rec.wins + rec.losses + rec.draws;
    if (n < 3 || !s.rivals[id]?.alive) continue;
    if (!best || n > best.rec.wins + best.rec.losses + best.rec.draws) best = { id, name: rivalName(s, id), rec };
  }
  return best;
}
