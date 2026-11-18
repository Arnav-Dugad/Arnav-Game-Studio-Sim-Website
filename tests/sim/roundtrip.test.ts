import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { deserialize, serialize, stateHash } from '../../src/sim/save';

describe('save round trip at any start year', () => {
  for (const startYear of [1980, 1985, 1995, 2005, 2015, 2020]) {
    it(`${startYear}: loading a save gives back exactly the game that was saved`, () => {
      const s = createGame({ seed: 3, companyName: 'Round Trip', founderName: 'R', startYear, autopause: false });
      expect(stateHash(deserialize(serialize(s)))).toBe(stateHash(s)); // brand new
      const a = deserialize(serialize(s));
      advance(s, 40);
      advance(a, 40);
      expect(stateHash(a)).toBe(stateHash(s)); // and it plays on identically
      expect(stateHash(deserialize(serialize(s)))).toBe(stateHash(s)); // mid-game too
    });
  }
});
