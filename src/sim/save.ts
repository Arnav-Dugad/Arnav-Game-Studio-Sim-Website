/**
 * Versioned save schema. Saves are plain JSON of GameState. Each migration upgrades a raw object
 * from version n to n+1; they run in order on load.
 */
import { scheduleIndexFor } from './systems/rivals';
import type { GameState } from './types';

export const SCHEMA_VERSION = 4;

type Raw = Record<string, unknown> & { schemaVersion?: number };

export const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  // v1 → v2: add company policies/recruiting and market.scheduleIndex (introduced during development).
  1: (raw) => {
    const company = (raw.company ?? {}) as Record<string, unknown>;
    company.policies ??= { salaryPolicy: 'market', remote: false, fourDayWeek: false };
    company.recruiting ??= 0;
    company.moraleMods ??= [];
    raw.company = company;
    const market = (raw.market ?? {}) as Record<string, unknown>;
    market.scheduleIndex ??= 0;
    raw.market = market;
    raw.schemaVersion = 2;
    return raw;
  },
  // v2 → v3: hardware division.
  2: (raw) => {
    raw.hardware ??= [];
    raw.schemaVersion = 3;
    return raw;
  },
  // v3 → v4: pets, ambitions, regions (all optional fields; older builds must refuse these saves).
  3: (raw) => {
    raw.schemaVersion = 4;
    return raw;
  },
};

export class SaveError extends Error {}

export function migrate(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') throw new SaveError('Save data is not an object');
  let r = raw as Raw;
  let v = typeof r.schemaVersion === 'number' ? r.schemaVersion : 1;
  if (v > SCHEMA_VERSION) throw new SaveError(`Save is from a newer version (${v}). Please refresh to update the game.`);
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError(`No migration from save version ${v}`);
    r = m(r);
    v = r.schemaVersion as number;
  }
  const s = r as unknown as GameState;
  if (!Array.isArray(s.rng) || s.rng.length !== 4 || typeof s.day !== 'number' || !s.company) throw new SaveError('Save data is corrupted');
  // the real-release schedule is found by date (so a change to the release data never skips one on an old save)
  // (a game that hasn't ticked yet starts at 0 on purpose: last month's releases still come out on its first day)
  if (s.market && s.market.scheduleIndex > 0) s.market.scheduleIndex = scheduleIndexFor(s.day);
  return s;
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(json: string): GameState {
  return migrate(JSON.parse(json));
}

/** Deterministic FNV hash of the full state (for determinism tests and save checksums). */
export function stateHash(s: GameState): string {
  return hashJson(JSON.stringify(s));
}

/** The same hash, from JSON already serialized (saves serialize once, not twice). */
export function hashJson(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
