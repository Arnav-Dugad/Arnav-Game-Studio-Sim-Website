import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Every event that offers something you pay for must also offer something free: otherwise a broke studio
 * would face a choice with nothing it can pick (the UI has a "let it pass" escape, but it should be rare).
 */
describe('event options', () => {
  it('every event with paid options also has a free one', () => {
    const src = readFileSync('src/sim/systems/events.ts', 'utf8');
    const body = src.slice(src.indexOf('export const EVENT_DEFS'));
    const defs = body.split(/\n {2}\{\n {4}id: '/).slice(1);
    const bad: string[] = [];
    for (const d of defs) {
      const id = d.slice(0, d.indexOf("'"));
      const make = d.split('resolve:')[0] ?? '';
      const opts = make.match(/\{ id: '[a-z_]+', label:[^\n]*\}/g) ?? [];
      if (!opts.length) continue;
      const paid = opts.filter((o) => /cost: /.test(o));
      if (paid.length && paid.length === opts.length) bad.push(id);
    }
    expect(bad).toEqual([]);
  });
});
