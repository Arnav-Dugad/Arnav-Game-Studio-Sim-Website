import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { stateHash } from '../../src/sim/save';
import { deleteSlot, listSlots, loadSlot, saveLocal } from '../../src/services/saves';

describe('local saves (IndexedDB)', () => {
  it('round-trips a compressed save and lists it', async () => {
    const s = createGame({ seed: 5, companyName: 'Disk Co', founderName: 'Dee', autopause: false });
    advance(s, 400);
    const meta = await saveLocal('guest-test', 'slot2', s);
    expect(meta.companyName).toBe('Disk Co');
    expect(meta.bytes).toBeGreaterThan(100);
    // gzip should shrink the JSON substantially
    expect(meta.bytes).toBeLessThan(JSON.stringify(s).length);
    const slots = await listSlots('guest-test');
    expect(slots.find((x) => x.slotId === 'slot2')?.local?.companyName).toBe('Disk Co');
    expect(slots.find((x) => x.slotId === 'slot1')?.local).toBeUndefined();
    const loaded = await loadSlot('guest-test', 'slot2');
    expect(stateHash(loaded)).toBe(stateHash(s));
  });

  it('keeps users isolated and deletes cleanly', async () => {
    const a = createGame({ seed: 1, companyName: 'A', founderName: 'a' });
    await saveLocal('guest-a', 'slot1', a);
    expect((await listSlots('guest-b')).every((x) => !x.local)).toBe(true);
    await deleteSlot('guest-a', 'slot1');
    expect((await listSlots('guest-a'))[0]?.local).toBeUndefined();
    await expect(loadSlot('guest-a', 'slot1')).rejects.toThrow();
  });
});
