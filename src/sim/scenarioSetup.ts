/** Founding a studio inside a scenario: the normal new game, then the scenario's setup. */
import { dispatch } from './actions';
import { createGame, type NewGameOptions } from './create';
import { Rng } from './rng';
import { SCENARIO_BY_ID, scenarioCash, scenarioDeadline } from './systems/scenarios';
import { assignDesks } from './systems/office';
import { candidateToStaff, generateCandidate } from './systems/staff';
import type { GameState } from './types';
import { newId, pushNews } from './util';

export function createScenarioGame(o: NewGameOptions & { scenario: string }): GameState {
  const def = SCENARIO_BY_ID[o.scenario];
  if (!def) throw new Error(`Unknown scenario ${o.scenario}`);
  const s = createGame({ ...o, startYear: def.year, homeRegion: def.home ?? 'na', endless: true, sandbox: false });
  // Build the office with a temporary free-build pass (not a cheat: it's the scenario's setup).
  const cheats = s.cheats;
  s.cheats = { ...(cheats ?? {}), freeBuild: true };
  for (let t = 2; t <= (def.tier ?? 1); t++) dispatch(s, { type: 'moveOffice', tier: t });
  if (def.hires) dispatch(s, { type: 'furnishDesks', extra: def.hires });
  s.cheats = cheats;
  const rng = new Rng(s.rng);
  for (let i = 0; i < (def.hires ?? 0); i++) {
    const cand = generateCandidate(s, rng, { quality: (def.hireQuality ?? 0.1) * 100 });
    const id = newId(s, 's');
    s.staff[id] = candidateToStaff(s, cand, id, cand.askSalary);
  }
  assignDesks(s);
  const cash = scenarioCash(def, s.day);
  if (cash !== undefined) s.company.cash = cash;
  if (def.reputation !== undefined) s.company.reputation = def.reputation;
  for (const r of def.research ?? []) if (!s.research.done.includes(r)) s.research.done.push(r);
  if (def.values) {
    s.company.values = [...def.values];
    s.company.valuesDay = s.day;
  }
  s.scenario = { id: def.id, deadlineDay: scenarioDeadline(def), met: {} };
  pushNews(s, { category: 'studio', headline: `Scenario: ${def.name}`, body: `${def.blurb} Deadline: January ${def.until}. Goals are in the Goals panel.`, tone: 'neutral' });
  return s;
}
