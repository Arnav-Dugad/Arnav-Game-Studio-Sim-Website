/** A lively scripted studio for the landing page hero (real sim + real renderer). */
import { createGame } from '@/sim/create';
import { dispatch } from '@/sim/actions';
import { candidateToStaff, generateCandidate } from '@/sim/systems/staff';
import { Rng } from '@/sim/rng';
import type { GameState } from '@/sim/types';
import { assignDesks } from '@/sim/systems/office';

export function buildDemoState(): GameState {
  const s = createGame({ seed: 4242, companyName: 'Pixel Forge', founderName: 'Avery', startYear: 1994, autopause: false });
  s.company.cash = 50_000_000;
  s.company.reputation = 40;
  s.office.tier = 2;
  s.office.items = [];
  const place = (item: GameState['office']['items'][number]['item'], x: number, y: number) => dispatch(s, { type: 'placeItem', item, floor: 0, x, y, rot: 0 });
  // desks in two pods
  for (const [x, y] of [
    [2, 2],
    [3, 2],
    [5, 2],
    [6, 2],
    [2, 5],
    [3, 5],
    [5, 5],
    [6, 5],
  ] as [number, number][])
    place('desk_pro', x, y);
  place('kitchen', 11, 1);
  place('coffee_machine', 9, 1);
  place('lounge_sofa', 10, 6);
  place('arcade_cabinet', 13, 4);
  place('plant_large', 0, 1);
  place('plant_large', 8, 4);
  place('plant_small', 4, 8);
  place('bookshelf', 0, 7);
  place('rug', 10, 3);
  place('whiteboard', 4, 0);
  place('aquarium', 11, 8);
  place('neon_sign', 8, 8);
  const rng = new Rng([7, 8, 9, 10]);
  for (let i = 0; i < 7; i++) {
    const c = generateCandidate(s, rng, { quality: 30 });
    const id = `demo${i}`;
    s.staff[id] = candidateToStaff(s, c, id, c.askSalary);
  }
  // assign desks & put everyone to work on a game
  const team = Object.keys(s.staff);
  assignDesks(s);
  const first = dispatch(s, {
    type: 'startGame',
    game: { name: 'Neon Odyssey', genre: 'action', topic: 'cyberpunk', platforms: ['playstation'], audience: 'teen', size: 'medium', monetization: 'premium', engineId: 'e0', team: team.slice(0, 5) },
  });
  if (!first.ok)
    dispatch(s, {
      type: 'startGame',
      game: { name: 'Neon Odyssey', genre: 'action', topic: 'cyberpunk', platforms: ['pc'], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: team.slice(0, 3) },
    });
  for (const id of team.slice(5)) dispatch(s, { type: 'assign', staffId: id, to: 'research' });
  return s;
}
