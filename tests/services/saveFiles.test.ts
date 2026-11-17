import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { readSaveFile } from '../../src/ui/saveFiles';

const file = (text: string) => new File([text], 'save.json', { type: 'application/json' });

describe('save files', () => {
  it('round-trips an exported save (wrapper format) and a raw state', async () => {
    const s = createGame({ seed: 3, companyName: 'Export Co', founderName: 'E' });
    const wrapped = await readSaveFile(file(JSON.stringify({ format: 'arnav-game-studio-save', exportedAt: 'x', state: s })));
    expect(wrapped.company.name).toBe('Export Co');
    const raw = await readSaveFile(file(JSON.stringify(s)));
    expect(raw.day).toBe(s.day);
  });

  it('upgrades old saves and rejects junk with a friendly error', async () => {
    const s = createGame({ seed: 3, companyName: 'Old Co', founderName: 'E' }) as unknown as Record<string, unknown>;
    delete s.hardware;
    s.schemaVersion = 2;
    expect((await readSaveFile(file(JSON.stringify(s)))).hardware).toEqual([]);
    await expect(readSaveFile(file('not json'))).rejects.toThrow(/not JSON/);
    const broken = createGame({ seed: 4, companyName: 'Broken', founderName: 'B' }) as unknown as Record<string, unknown>;
    delete broken.staff;
    await expect(readSaveFile(file(JSON.stringify(broken)))).rejects.toThrow(/missing parts/);
    await expect(readSaveFile(file('{"hello":1}'))).rejects.toThrow();
    await expect(readSaveFile(file(JSON.stringify({ format: 'arnav-game-studio-save', state: { schemaVersion: 99 } })))).rejects.toThrow(/newer version/);
  });
});
