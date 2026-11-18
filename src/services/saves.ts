/**
 * Save system: local-first (IndexedDB) with throttled cloud sync (Firestore).
 * Saves are gzip-compressed JSON, base64 encoded and split into ≤900 KB chunks
 * (Firestore documents max out at 1 MiB). Every save carries schemaVersion + checksum.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { deserialize, hashJson, serialize, stateHash, SCHEMA_VERSION } from '@/sim/save';
import type { GameState } from '@/sim/types';
import { formatDate } from '@/sim/calendar';
import { firebaseConfigured, getFirebase } from './firebase';

export const SLOT_IDS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'] as const;
export type SlotId = (typeof SLOT_IDS)[number];
const CHUNK = 900_000;

export interface SlotMeta {
  name: string;
  companyName: string;
  founderName: string;
  color: string;
  difficulty: string;
  gameDay: number;
  gameDate: string;
  cash: number;
  reputation: number;
  status: string;
  schemaVersion: number;
  updatedAt: number; // ms epoch
  checksum: string;
  bytes: number;
}

interface LocalRecord {
  key: string; // uid/slotId
  meta: SlotMeta;
  data: string; // compressed base64
  synced: boolean;
}

export interface SlotInfo {
  slotId: SlotId;
  local?: SlotMeta & { synced: boolean };
  cloud?: SlotMeta;
  /** Which copy is newest. */
  newest?: 'local' | 'cloud';
  conflict: boolean;
}

// ── compression helpers ──────────────────────────────────────────────────────

async function gzipBase64(text: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return 'raw:' + btoa(unescape(encodeURIComponent(text)));
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return 'gz:' + btoa(bin);
}

async function gunzipBase64(data: string): Promise<string> {
  if (data.startsWith('raw:')) return decodeURIComponent(escape(atob(data.slice(4))));
  const bin = atob(data.slice(3));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export function metaFor(s: GameState, name?: string, checksum?: string): SlotMeta {
  return {
    name: (name ?? s.company.name).slice(0, 60),
    companyName: s.company.name.slice(0, 60),
    founderName: s.company.founderName.slice(0, 60),
    color: s.company.color,
    difficulty: s.settings.difficulty,
    gameDay: s.day,
    gameDate: formatDate(s.day, false),
    cash: Math.round(s.company.cash),
    reputation: Math.round(s.company.reputation),
    status: s.status,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: Date.now(),
    checksum: checksum ?? stateHash(s),
    bytes: 0,
  };
}

// ── IndexedDB ───────────────────────────────────────────────────────────────

let dbp: Promise<IDBPDatabase> | null = null;
function idb(): Promise<IDBPDatabase> {
  dbp ??= openDB('arnav-studio-empire', 1, {
    upgrade(db) {
      db.createObjectStore('saves', { keyPath: 'key' });
    },
  });
  return dbp;
}

export async function saveLocal(uid: string, slotId: SlotId, s: GameState): Promise<SlotMeta> {
  const tomb = tombstones();
  if (tomb.includes(`${uid}/${slotId}`)) setTombstones(tomb.filter((t) => t !== `${uid}/${slotId}`));
  const json = serialize(s);
  const checksum = hashJson(json);
  const data = await gzipBase64(json);
  const meta = { ...metaFor(s, undefined, checksum), bytes: data.length };
  const rec: LocalRecord = { key: `${uid}/${slotId}`, meta, data, synced: false };
  const db = await idb();
  await db.put('saves', rec);
  return meta;
}

async function getLocal(uid: string, slotId: SlotId): Promise<LocalRecord | undefined> {
  const db = await idb();
  return (await db.get('saves', `${uid}/${slotId}`)) as LocalRecord | undefined;
}

/** Mark the local copy synced — only if it is still the exact save that was uploaded. */
async function markSynced(uid: string, slotId: SlotId, checksum: string): Promise<void> {
  const db = await idb();
  const rec = (await db.get('saves', `${uid}/${slotId}`)) as LocalRecord | undefined;
  if (rec && rec.meta.checksum === checksum) await db.put('saves', { ...rec, synced: true });
}

// Slots deleted while offline: remembered so they don't reappear from the cloud, and retried later.
const TOMB_KEY = 'ase:deleted';
function tombstones(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TOMB_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function setTombstones(list: string[]): void {
  try {
    localStorage.setItem(TOMB_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

// ── Firestore ───────────────────────────────────────────────────────────────

/** Firebase handles once the signed-in user has been restored (avoids unauthenticated reads at startup). */
async function cloudReady() {
  const h = await getFirebase();
  await h.auth.authStateReady();
  return h;
}

function cloudEnabled(uid: string): boolean {
  return firebaseConfigured && !uid.startsWith('guest');
}

export async function syncSlot(uid: string, slotId: SlotId): Promise<'synced' | 'skipped' | 'offline'> {
  if (!cloudEnabled(uid)) return 'skipped';
  const rec = await getLocal(uid, slotId);
  if (!rec || rec.synced) return 'skipped';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const { db } = await cloudReady();
  const { doc, setDoc, deleteDoc, serverTimestamp } = await import('firebase/firestore');
  const { getDoc } = await import('firebase/firestore');
  const chunks: string[] = [];
  for (let i = 0; i < rec.data.length; i += CHUNK) chunks.push(rec.data.slice(i, i + CHUNK));
  if (chunks.length > 10) throw new Error('Save is too large to sync');
  // Double-buffered chunks: write the new save into the generation NOT referenced by the current meta,
  // then flip the meta. An interrupted sync can never corrupt the save other devices will load.
  const metaRef = doc(db, 'users', uid, 'slots', slotId);
  const cur = await getDoc(metaRef);
  const curBase = cur.exists() ? Number((cur.data() as { chunkBase?: number }).chunkBase ?? 0) : 10;
  const oldCount = cur.exists() ? Number((cur.data() as { chunkCount?: number }).chunkCount ?? 0) : 0;
  const base = curBase === 0 ? 10 : 0;
  for (let i = 0; i < chunks.length; i++) await setDoc(doc(db, 'users', uid, 'slots', slotId, 'chunks', `c${base + i}`), { data: chunks[i]!, index: base + i });
  const m = rec.meta;
  await setDoc(doc(db, 'users', uid, 'slots', slotId), {
    name: m.name,
    companyName: m.companyName,
    founderName: m.founderName,
    color: m.color,
    difficulty: m.difficulty,
    gameDay: m.gameDay,
    gameDate: m.gameDate,
    cash: m.cash,
    reputation: m.reputation,
    status: m.status,
    schemaVersion: m.schemaVersion,
    checksum: m.checksum,
    bytes: m.bytes,
    chunkCount: chunks.length,
    chunkBase: base,
    updatedAt: serverTimestamp(),
  });
  await markSynced(uid, slotId, m.checksum);
  // tidy up the previous generation (best effort)
  if (cur.exists()) for (let i = 0; i < oldCount; i++) await deleteDoc(doc(db, 'users', uid, 'slots', slotId, 'chunks', `c${curBase + i}`)).catch(() => undefined);
  return 'synced';
}

/**
 * Before writing a brand-new game into a slot that *looks* empty, make sure the cloud doesn't already hold a
 * save there (the slot list may be stale, or the listing may have failed). 'unknown' means we couldn't check.
 */
export async function cloudSlotStatus(uid: string, slotId: SlotId): Promise<'free' | 'taken' | 'unknown'> {
  if (!cloudEnabled(uid)) return 'free';
  if (tombstones().includes(`${uid}/${slotId}`)) return 'free';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'unknown';
  try {
    const { db } = await cloudReady();
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await Promise.race([getDoc(doc(db, 'users', uid, 'slots', slotId)), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8_000))]);
    return snap.exists() ? 'taken' : 'free';
  } catch {
    return 'unknown';
  }
}

async function cloudMetas(uid: string): Promise<Partial<Record<SlotId, SlotMeta & { chunkCount: number }>>> {
  if (!cloudEnabled(uid)) return {};
  try {
    const { db } = await cloudReady();
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(db, 'users', uid, 'slots'));
    const out: Partial<Record<SlotId, SlotMeta & { chunkCount: number }>> = {};
    snap.forEach((d) => {
      const v = d.data() as Record<string, unknown>;
      const ts = v.updatedAt as { toMillis?: () => number } | undefined;
      out[d.id as SlotId] = { ...(v as unknown as SlotMeta & { chunkCount: number }), updatedAt: ts?.toMillis?.() ?? 0 };
    });
    return out;
  } catch (e) {
    console.warn('[saves] could not list cloud saves', e);
    return {};
  }
}

export async function listSlots(uid: string): Promise<SlotInfo[]> {
  // retry deletions that happened offline
  const pending = tombstones().filter((t) => t.startsWith(`${uid}/`));
  for (const t of pending) await deleteSlot(uid, t.split('/')[1] as SlotId).catch(() => undefined);
  const cloud = await cloudMetas(uid);
  const dead = new Set(tombstones());
  const out: SlotInfo[] = [];
  for (const slotId of SLOT_IDS) {
    const loc = await getLocal(uid, slotId).catch(() => undefined);
    const c = dead.has(`${uid}/${slotId}`) ? undefined : cloud[slotId];
    const info: SlotInfo = { slotId, conflict: false };
    if (loc) info.local = { ...loc.meta, synced: loc.synced };
    if (c) info.cloud = c;
    if (info.local && info.cloud) {
      const sameData = info.local.checksum === info.cloud.checksum;
      info.newest = info.local.updatedAt >= info.cloud.updatedAt ? 'local' : 'cloud';
      // Conflict: local has unsynced progress AND cloud has a different, newer save (e.g. another device).
      info.conflict = !sameData && !info.local.synced && info.cloud.updatedAt > info.local.updatedAt;
    } else info.newest = info.local ? 'local' : info.cloud ? 'cloud' : undefined;
    out.push(info);
  }
  return out;
}

export async function loadSlot(uid: string, slotId: SlotId, prefer?: 'local' | 'cloud'): Promise<GameState> {
  const loc = await getLocal(uid, slotId).catch(() => undefined);
  let source: 'local' | 'cloud' = prefer ?? 'local';
  let cloudMeta: (SlotMeta & { chunkCount: number }) | undefined;
  if (cloudEnabled(uid) && (!loc || prefer !== 'local')) {
    cloudMeta = (await cloudMetas(uid))[slotId];
    if (!prefer) source = !loc || (cloudMeta && cloudMeta.updatedAt > loc.meta.updatedAt && loc.synced) ? 'cloud' : 'local';
  }
  if (source === 'cloud' && cloudMeta) {
    const { db } = await cloudReady();
    const { doc, getDoc } = await import('firebase/firestore');
    let data = '';
    const base = Number((cloudMeta as { chunkBase?: number }).chunkBase ?? 0);
    for (let i = 0; i < cloudMeta.chunkCount; i++) {
      const snap = await getDoc(doc(db, 'users', uid, 'slots', slotId, 'chunks', `c${base + i}`));
      if (!snap.exists()) throw new Error('Cloud save is incomplete');
      data += (snap.data() as { data: string }).data;
    }
    const s = deserialize(await gunzipBase64(data));
    if (cloudMeta.checksum && stateHash(s) !== cloudMeta.checksum && cloudMeta.schemaVersion === SCHEMA_VERSION) {
      throw new Error('Cloud save failed its integrity check — try this device’s copy');
    }
    // refresh the local copy
    const db2 = await idb();
    await db2.put('saves', { key: `${uid}/${slotId}`, meta: { ...cloudMeta, bytes: data.length }, data, synced: true } satisfies LocalRecord);
    return s;
  }
  if (!loc) throw new Error('Save not found');
  return deserialize(await gunzipBase64(loc.data));
}

export async function deleteSlot(uid: string, slotId: SlotId): Promise<void> {
  const db = await idb();
  await db.delete('saves', `${uid}/${slotId}`);
  if (!cloudEnabled(uid)) return;
  const key = `${uid}/${slotId}`;
  setTombstones([...new Set([...tombstones(), key])]);
  try {
    const { db: fdb } = await cloudReady();
    const { doc, getDoc, deleteDoc } = await import('firebase/firestore');
    const metaRef = doc(fdb, 'users', uid, 'slots', slotId);
    const snap = await getDoc(metaRef);
    const n = snap.exists() ? Number((snap.data() as { chunkCount?: number }).chunkCount ?? 0) : 0;
    const base = snap.exists() ? Number((snap.data() as { chunkBase?: number }).chunkBase ?? 0) : 0;
    for (let i = 0; i < Math.max(n, 1); i++) await deleteDoc(doc(fdb, 'users', uid, 'slots', slotId, 'chunks', `c${base + i}`)).catch(() => undefined);
    await deleteDoc(metaRef);
    setTombstones(tombstones().filter((t) => t !== key));
  } catch {
    /* offline: the cloud copy will be overwritten next time this slot is used */
  }
}

// ── Profile & hall of fame ─────────────────────────────────────────────────

export interface HallEntry {
  company: string;
  founder: string;
  ending: string;
  years: string;
  score: number;
  bestGame?: string;
  bestScore: number;
  peakValuation: number;
  day: number; // real ms
  /** The run used cheats. */
  cheats?: boolean;
}

const HALL_KEY = (uid: string) => `ase:hall:${uid}`;

export async function getHallOfFame(uid: string): Promise<HallEntry[]> {
  let local: HallEntry[] = [];
  try {
    local = JSON.parse(localStorage.getItem(HALL_KEY(uid)) ?? '[]') as HallEntry[];
  } catch {
    /* ignore */
  }
  if (!cloudEnabled(uid)) return local;
  try {
    const { db } = await cloudReady();
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'users', uid));
    const cloud = (snap.exists() ? ((snap.data() as { hallOfFame?: HallEntry[] }).hallOfFame ?? []) : []) as HallEntry[];
    const all = [...cloud, ...local];
    const seen = new Set<string>();
    return all.filter((e) => (seen.has(`${e.company}${e.day}`) ? false : (seen.add(`${e.company}${e.day}`), true))).sort((a, b) => b.score - a.score).slice(0, 50);
  } catch {
    return local;
  }
}

export async function addHallOfFame(uid: string, entry: HallEntry): Promise<void> {
  const existing = await getHallOfFame(uid);
  const key = (e: HallEntry) => `${e.company}|${e.years}|${e.ending}`;
  if (existing.some((e) => key(e) === key(entry))) return; // reopening a finished save doesn't duplicate it
  const all = [entry, ...existing].sort((a, b) => b.score - a.score).slice(0, 50);
  try {
    localStorage.setItem(HALL_KEY(uid), JSON.stringify(all));
  } catch {
    /* ignore */
  }
  if (!cloudEnabled(uid)) return;
  try {
    const { db } = await cloudReady();
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', uid), { hallOfFame: all, updatedAt: serverTimestamp() }, { merge: true });
  } catch {
    /* offline */
  }
}

export async function ensureProfile(uid: string, email: string | null, displayName: string | null): Promise<void> {
  if (!cloudEnabled(uid)) return;
  try {
    const { db } = await cloudReady();
    const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) await setDoc(ref, { displayName: (displayName ?? '').slice(0, 60), email: (email ?? '').slice(0, 254), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), hallOfFame: [] });
  } catch {
    /* offline — will retry next session */
  }
}

// ── Autosave controller ─────────────────────────────────────────────────────

export interface SaveStatus {
  state: 'idle' | 'saving' | 'saved' | 'offline' | 'error';
  lastLocal?: number;
  lastCloud?: number;
  error?: string;
}

type Listener = (s: SaveStatus) => void;

/**
 * Local save every in-game month; cloud sync at most every 60 s, plus on tab hide / close.
 */
/** Resolve when the browser is idle (or after a short wait where idle callbacks aren't supported). */
const waiting = new Set<() => void>();
function idle(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return Promise.resolve();
  return new Promise((res) => {
    const done = () => {
      if (!waiting.delete(done)) return;
      res();
    };
    waiting.add(done);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(done, { timeout: 1500 });
    else setTimeout(done, 50);
  });
}
/** A save that can't wait (tab closing): stop any autosave from waiting for idle time. */
function hurry(): void {
  for (const f of [...waiting]) f();
}

export class AutoSaver {
  status: SaveStatus = { state: 'idle' };
  private listeners = new Set<Listener>();
  private lastCloud = 0;
  private pending: Promise<unknown> = Promise.resolve();
  private latest: GameState | null = null;
  private onHide = () => {
    if (document.visibilityState === 'hidden') void this.flush();
  };
  private onOnline = () => void this.flush();

  constructor(
    private uid: string,
    private slotId: SlotId,
  ) {
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onHide);
    window.addEventListener('online', this.onOnline);
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onHide);
    window.removeEventListener('online', this.onOnline);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.status);
    return () => this.listeners.delete(l);
  }

  private emit(patch: Partial<SaveStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  /** Save locally now; sync to the cloud if the throttle window has passed (or force). */
  save(s: GameState, force = false): Promise<unknown> {
    this.latest = s;
    if (force) hurry();
    this.pending = this.pending.then(async () => {
      try {
        // routine autosaves wait for a quiet moment so they never land mid-frame
        if (!force) await idle();
        this.emit({ state: 'saving' });
        await saveLocal(this.uid, this.slotId, s);
        this.emit({ lastLocal: Date.now() });
        if (force || Date.now() - this.lastCloud > 60_000) {
          const r = await syncSlot(this.uid, this.slotId);
          if (r === 'synced') {
            this.lastCloud = Date.now();
            this.emit({ state: 'saved', lastCloud: this.lastCloud });
          } else this.emit({ state: r === 'offline' ? 'offline' : 'saved' });
        } else this.emit({ state: 'saved' });
      } catch (e) {
        this.emit({ state: navigator.onLine === false ? 'offline' : 'error', error: e instanceof Error ? e.message : String(e) });
      }
    });
    return this.pending;
  }

  flush(): Promise<unknown> {
    return this.latest ? this.save(this.latest, true) : this.pending;
  }
}

/**
 * After a guest creates or signs into an account on this device, move their guest saves into any
 * empty slots of that account (local copies; they sync to the cloud the next time they're saved).
 * Each guest's saves are adopted only once.
 */
export async function adoptGuestSaves(uid: string): Promise<number> {
  let guest: string | null;
  try {
    guest = localStorage.getItem('ase:guest');
    if (!guest || localStorage.getItem('ase:guestAdopted') === guest) return 0;
  } catch {
    return 0;
  }
  const db = await idb();
  const taken = new Set((await listSlots(uid)).filter((x) => x.local || x.cloud).map((x) => x.slotId));
  let moved = 0;
  for (const slotId of SLOT_IDS) {
    const rec = (await db.get('saves', `${guest}/${slotId}`)) as LocalRecord | undefined;
    if (!rec) continue;
    const target = SLOT_IDS.find((id) => !taken.has(id));
    if (!target) break;
    taken.add(target);
    await db.put('saves', { ...rec, key: `${uid}/${target}`, synced: false } satisfies LocalRecord);
    moved++;
  }
  try {
    localStorage.setItem('ase:guestAdopted', guest);
  } catch {
    /* ignore */
  }
  return moved;
}
