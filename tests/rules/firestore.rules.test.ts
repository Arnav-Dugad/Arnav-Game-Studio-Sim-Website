/**
 * Firestore security rules tests. Run with the emulator:  npm run test:rules
 * (skipped automatically when FIRESTORE_EMULATOR_HOST is not set).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const run = host ? describe : describe.skip;

const meta = () => ({
  name: 'My Studio',
  companyName: 'My Studio',
  founderName: 'Ada',
  color: '#e07a5f',
  difficulty: 'standard',
  gameDay: 100,
  gameDate: 'Apr 1980',
  cash: 1000,
  reputation: 3,
  status: 'running',
  schemaVersion: 2,
  checksum: 'abc123',
  bytes: 1234,
  chunkCount: 1,
  updatedAt: serverTimestamp(),
});

run('firestore.rules', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    const [h, p] = host!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-ase-rules', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: h!, port: Number(p) } });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => env.clearFirestore());

  it('lets a user write and read their own profile, slots and chunks', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { displayName: 'Alice', email: 'a@x.com', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, 'users/alice/slots/slot1/chunks/c0'), { data: 'gz:abc', index: 0 }));
    await assertSucceeds(setDoc(doc(db, 'users/alice/slots/slot1'), meta()));
    await assertSucceeds(getDoc(doc(db, 'users/alice/slots/slot1')));
    await assertSucceeds(getDocs(collection(db, 'users/alice/slots')));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/slots/slot1')));
  });

  it('blocks other users and anonymous access', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/slots/slot1'), { ...meta(), updatedAt: new Date() });
    });
    const bob = env.authenticatedContext('bob').firestore();
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(bob, 'users/alice/slots/slot1')));
    await assertFails(setDoc(doc(bob, 'users/alice/slots/slot1'), meta()));
    await assertFails(getDoc(doc(anon, 'users/alice/slots/slot1')));
    await assertFails(setDoc(doc(anon, 'users/alice'), { displayName: 'x' }));
  });

  it('validates slot ids, shapes and sizes', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users/alice/slots/slot9'), meta()));
    await assertFails(setDoc(doc(db, 'users/alice/slots/slot1'), { ...meta(), hacked: true }));
    await assertFails(setDoc(doc(db, 'users/alice/slots/slot1'), { ...meta(), chunkCount: 99 }));
    await assertFails(setDoc(doc(db, 'users/alice/slots/slot1/chunks/c0'), { data: 'x'.repeat(900_001), index: 0 }));
    await assertFails(setDoc(doc(db, 'users/alice'), { displayName: 'x'.repeat(61) }));
    await assertFails(setDoc(doc(db, 'users/alice'), { isAdmin: true }));
  });

  it('closes every other collection', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'leaderboard/global'), { x: 1 }));
    await assertFails(getDoc(doc(db, 'leaderboard/global')));
  });
});
