import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { CRITIQUE, PRAISE, generateReviews } from '../../src/sim/systems/release';
import { Rng, seedRng } from '../../src/sim/rng';
import type { Breakdown } from '../../src/sim/breakdown';

const keyOf = (dict: Record<string, string[]>, sentence: string) => Object.entries(dict).find(([, xs]) => xs.includes(sentence))?.[0];

describe('review blurbs', () => {
  it('never praise and knock the same thing, and never praise effort that wasn’t there', () => {
    const s = createGame({ seed: 1, companyName: 'R', founderName: 'R', startYear: 1980, autopause: false });
    const quality: Breakdown = {
      total: 0.46,
      parts: [
        { label: 'Development effort', value: 0.49, kind: 'base' },
        { label: 'Design/tech balance (56% design, ideal 45%)', value: 0.87, kind: 'mul' },
        { label: 'Action × Aliens fit', value: 1.1, kind: 'mul' },
        { label: 'Audience fit', value: 0.85, kind: 'mul' },
        { label: 'Engine tech (1.7)', value: 1.06, kind: 'mul' },
        { label: 'Visionary ideas', value: 1.06, kind: 'mul' },
        { label: 'Topic trend', value: 0.98, kind: 'mul' },
      ],
    };
    for (let seed = 1; seed <= 60; seed++) {
      const rng = new Rng(seedRng(seed));
      const { reviews } = generateReviews(rng, s, quality, 58, 0, 'action', 'Hidden Quest');
      for (const r of reviews) {
        const sentences = r.blurb.match(/[^.!?]+[.!?]/g)?.map((x) => x.trim()) ?? [];
        const praised = sentences.map((x) => keyOf(PRAISE, x)).filter(Boolean);
        const knocked = sentences.map((x) => keyOf(CRITIQUE, x)).filter(Boolean);
        for (const k of praised) expect(knocked).not.toContain(k);
        expect(praised).not.toContain('effort');
      }
    }
  });

  it('only knocks things that actually dragged the game down', () => {
    const s = createGame({ seed: 1, companyName: 'R', founderName: 'R', startYear: 1980, autopause: false });
    const quality: Breakdown = {
      total: 0.66,
      parts: [
        { label: 'Development effort', value: 0.8, kind: 'base' },
        { label: 'Action × Aliens fit', value: 1.05, kind: 'mul' },
        { label: 'Audience fit', value: 1.0, kind: 'mul' },
        { label: 'Engine tech (2.0)', value: 1.04, kind: 'mul' },
        { label: 'Fresh idea', value: 1.03, kind: 'mul' },
      ],
    };
    for (let seed = 1; seed <= 40; seed++) {
      const { reviews } = generateReviews(new Rng(seedRng(seed)), s, quality, 66, 0, 'action', 'Fine Game');
      for (const r of reviews) {
        const sentences = r.blurb.match(/[^.!?]+[.!?]/g)?.map((x) => x.trim()) ?? [];
        const knocked = sentences.map((x) => keyOf(CRITIQUE, x)).filter(Boolean);
        for (const k of knocked) expect(['balance', 'focus', 'mild']).toContain(k);
      }
    }
  });
});
