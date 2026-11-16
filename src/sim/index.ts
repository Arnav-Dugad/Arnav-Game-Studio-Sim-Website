/** Public API of the pure, deterministic simulation. */
export { createGame, type NewGameOptions } from './create';
export { advance, tick, STORY_END_DAY } from './advance';
export { dispatch, type Action, type ActionResult, type StartGamePayload } from './actions';
export { serialize, deserialize, migrate, stateHash, SCHEMA_VERSION } from './save';
export type { SimEvent } from './ctx';
export type * from './types';
