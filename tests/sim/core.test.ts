import { describe, expect, it } from 'vitest';
import { fromDay, toDay, weekday, parseYM, formatDate } from '../../src/sim/calendar';
import { Rng, seedRng } from '../../src/sim/rng';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { deserialize, migrate, serialize, stateHash, SCHEMA_VERSION } from '../../src/sim/save';
import { runBot } from '../bots/run';

describe('calendar', () => {
  it('round-trips days and dates', () => {
    for (const d of [0, 1, 59, 60, 365, 366, 10_000, 16_800, 20_000]) {
      const c = fromDay(d);
      expect(toDay(c.year, c.month, c.day)).toBe(d);
    }
    expect(fromDay(0)).toEqual({ year: 1980, month: 1, day: 1 });
    expect(fromDay(toDay(2000, 2, 29))).toEqual({ year: 2000, month: 2, day: 29 });
  });
  it('knows weekdays (1980-01-01 was a Tuesday)', () => {
    expect(weekday(0)).toBe(1);
    expect(weekday(toDay(2026, 11, 16))).toBe(0); // Monday
  });
  it('parses YYYY-MM and formats', () => {
    expect(fromDay(parseYM('1985-10'))).toEqual({ year: 1985, month: 10, day: 1 });
    expect(formatDate(0)).toBe('Jan 1, 1980');
  });
});

describe('rng', () => {
  it('is deterministic per seed and well distributed', () => {
    const a = new Rng(seedRng(42));
    const b = new Rng(seedRng(42));
    const xs = Array.from({ length: 1000 }, () => a.next());
    const ys = Array.from({ length: 1000 }, () => b.next());
    expect(xs).toEqual(ys);
    const mean = xs.reduce((t, x) => t + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('different seeds diverge', () => {
    expect(new Rng(seedRng(1)).next()).not.toBe(new Rng(seedRng(2)).next());
  });
});

describe('determinism', () => {
  it('same seed + same bot decisions → identical state hash', () => {
    const a = runBot('steady', 777, 6);
    const b = runBot('steady', 777, 6);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });
  it('different seeds produce different histories', () => {
    expect(stateHash(runBot('steady', 1, 3).state)).not.toBe(stateHash(runBot('steady', 2, 3).state));
  });
});

describe('saves', () => {
  it('round-trips through JSON and keeps simulating identically', () => {
    const s = createGame({ seed: 9, companyName: 'Save Co', founderName: 'Ada', autopause: false });
    advance(s, 200);
    const copy = deserialize(serialize(s));
    expect(stateHash(copy)).toBe(stateHash(s));
    advance(s, 100);
    advance(copy, 100);
    expect(stateHash(copy)).toBe(stateHash(s));
  });
  it('migrates v1 saves to the current schema', () => {
    const s = createGame({ seed: 3, companyName: 'Old', founderName: 'Bo' });
    const raw = JSON.parse(serialize(s));
    raw.schemaVersion = 1;
    delete raw.company.policies;
    delete raw.company.recruiting;
    delete raw.market.scheduleIndex;
    const m = migrate(raw);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.company.policies.salaryPolicy).toBe('market');
    expect(m.market.scheduleIndex).toBe(0);
  });
  it('rejects garbage and future versions', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 5 })).toThrow(/newer/);
  });
});
