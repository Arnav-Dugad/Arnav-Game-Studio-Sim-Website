import { describe, expect, it } from 'vitest';
import { toDay } from '../../src/sim/calendar';
import { diwali, lunarNewYear } from '../../src/render/seasons';

/** First day the decorations are up, minus the lead-in, = the festival day. */
function festivalDay(test: (d: number) => boolean, from: number, lead: number): number {
  for (let d = from; d < from + 400; d++) if (test(d)) return d + lead;
  return -1;
}

describe('moon-dated festivals', () => {
  it('Lunar New Year lands within a day of the real date', () => {
    for (const [y, m, d] of [[1990, 1, 27], [2015, 2, 19], [2017, 1, 28], [2020, 1, 25], [2023, 1, 22], [2024, 2, 10], [2025, 1, 29]] as const) {
      const got = festivalDay(lunarNewYear, toDay(y, 1, 1), 2);
      expect(Math.abs(got - toDay(y, m, d))).toBeLessThanOrEqual(1);
    }
  });
  it('Diwali lands within a day of the real date', () => {
    for (const [y, m, d] of [[2022, 10, 24], [2023, 11, 12], [2024, 10, 31], [2025, 10, 20]] as const) {
      const got = festivalDay(diwali, toDay(y, 9, 1), 2);
      expect(Math.abs(got - toDay(y, m, d))).toBeLessThanOrEqual(1);
    }
  });
});
