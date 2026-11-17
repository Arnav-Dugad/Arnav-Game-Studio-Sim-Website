/**
 * Office grid: placement validity and layout metrics (energy-station distance, crowding, decor auras,
 * noise, facility powers). Metrics are deterministic and shared with the renderer's heat-maps.
 */
import { ITEM_BY_ID, OFFICE_TIERS, type ItemDef, type OfficeTierDef } from '../../data/facilities';
import type { GameState, LayoutCache, PlacedItem } from '../types';

export function tierDef(tier: number): OfficeTierDef {
  return OFFICE_TIERS[Math.max(0, Math.min(OFFICE_TIERS.length - 1, tier - 1))]!;
}

export function footprint(it: PlacedItem): { w: number; h: number } {
  const d = ITEM_BY_ID[it.item];
  return it.rot ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

/** Cells blocked on a floor: Map key = y*W+x → item id. */
export function occupancy(s: GameState, floor: number): Map<number, string> {
  const t = tierDef(s.office.tier);
  const occ = new Map<number, string>();
  for (const it of s.office.items) {
    if (it.floor !== floor) continue;
    const { w, h } = footprint(it);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occ.set((it.y + dy) * t.w + (it.x + dx), it.id);
  }
  return occ;
}

/** The doorway/stairs tile on each floor (kept clear so the floor stays reachable). */
/** Extra unlock conditions beyond year and research (or null when met). */
export function itemRequirement(s: GameState, def: { requires?: 'franchise3' }): string | null {
  if (def.requires === 'franchise3' && !Object.values(s.franchises).some((f) => f.entries.length >= 3)) return 'Needs a franchise with three games';
  return null;
}

export function entrance(s: GameState): { x: number; y: number } {
  const t = tierDef(s.office.tier);
  return { x: Math.floor(t.w / 2), y: t.h - 1 };
}

export function canPlace(
  s: GameState,
  def: ItemDef,
  floor: number,
  x: number,
  y: number,
  rot: 0 | 1,
  ignoreId?: string,
  occPre?: Map<number, string>,
): { ok: boolean; reason?: string } {
  const t = tierDef(s.office.tier);
  if (floor < 0 || floor >= t.floors) return { ok: false, reason: 'No such floor' };
  const w = rot ? def.h : def.w;
  const h = rot ? def.w : def.h;
  if (x < 0 || y < 0 || x + w > t.w || y + h > t.h) return { ok: false, reason: 'Out of bounds' };
  const occ = occPre ?? occupancy(s, floor);
  const ent = entrance(s);
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      const o = occ.get(cy * t.w + cx);
      if (o && o !== ignoreId) return { ok: false, reason: 'Space occupied' };
      if (cx === ent.x && cy === ent.y) return { ok: false, reason: 'Keep the entrance clear' };
    }
  // Ensure the floor stays connected: every item must have a free adjacent tile reachable from entrance.
  const test: PlacedItem = { id: '__test', item: def.id, floor, x, y, rot };
  const items = s.office.items.filter((i) => i.id !== ignoreId).concat(test);
  if (!allReachable({ ...s, office: { ...s.office, items } }, floor)) return { ok: false, reason: 'Would block a walkway' };
  return { ok: true };
}

function neighbors4(x: number, y: number): [number, number][] {
  return [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ];
}

/** BFS distances from a set of start cells over free tiles. */
function bfs(s: GameState, floor: number, starts: [number, number][]): Int32Array {
  const t = tierDef(s.office.tier);
  const occ = occupancy(s, floor);
  const dist = new Int32Array(t.w * t.h).fill(-1);
  const q: number[] = [];
  for (const [x, y] of starts) {
    const k = y * t.w + x;
    if (x < 0 || y < 0 || x >= t.w || y >= t.h) continue;
    if (dist[k] !== -1) continue;
    dist[k] = 0;
    q.push(k);
  }
  let head = 0;
  while (head < q.length) {
    const k = q[head++]!;
    const x = k % t.w;
    const y = (k - x) / t.w;
    for (const [nx, ny] of neighbors4(x, y)) {
      if (nx < 0 || ny < 0 || nx >= t.w || ny >= t.h) continue;
      const nk = ny * t.w + nx;
      if (dist[nk] !== -1 || occ.has(nk)) continue;
      dist[nk] = dist[k]! + 1;
      q.push(nk);
    }
  }
  return dist;
}

function adjacentFree(s: GameState, it: PlacedItem, occ: Map<number, string>): [number, number][] {
  const t = tierDef(s.office.tier);
  const { w, h } = footprint(it);
  const out: [number, number][] = [];
  for (let dy = -1; dy <= h; dy++)
    for (let dx = -1; dx <= w; dx++) {
      const inside = dx >= 0 && dx < w && dy >= 0 && dy < h;
      const corner = (dx === -1 || dx === w) && (dy === -1 || dy === h);
      if (inside || corner) continue;
      const x = it.x + dx;
      const y = it.y + dy;
      if (x < 0 || y < 0 || x >= t.w || y >= t.h) continue;
      if (!occ.has(y * t.w + x)) out.push([x, y]);
    }
  return out;
}

function allReachable(s: GameState, floor: number): boolean {
  const t = tierDef(s.office.tier);
  const occ = occupancy(s, floor);
  const ent = entrance(s);
  const dist = bfs(s, floor, [[ent.x, ent.y]]);
  for (const it of s.office.items) {
    if (it.floor !== floor) continue;
    const adj = adjacentFree(s, it, occ);
    if (!adj.some(([x, y]) => dist[y * t.w + x]! >= 0)) return false;
  }
  return true;
}

/** Shortest walking path (for the renderer). Returns tiles from start to goal inclusive, or null. */
export function findPath(s: GameState, floor: number, from: [number, number], to: [number, number]): [number, number][] | null {
  const t = tierDef(s.office.tier);
  const dist = bfs(s, floor, [to]);
  const k0 = from[1] * t.w + from[0];
  if (dist[k0] === undefined || dist[k0] < 0) return null;
  const path: [number, number][] = [from];
  let [x, y] = from;
  let guard = 0;
  while ((x !== to[0] || y !== to[1]) && guard++ < 2000) {
    let best: [number, number] | null = null;
    let bd = dist[y * t.w + x]!;
    for (const [nx, ny] of neighbors4(x, y)) {
      if (nx < 0 || ny < 0 || nx >= t.w || ny >= t.h) continue;
      const d = dist[ny * t.w + nx]!;
      if (d >= 0 && d < bd) {
        bd = d;
        best = [nx, ny];
      }
    }
    if (!best) break;
    [x, y] = best;
    path.push([x, y]);
  }
  return path;
}

let layoutVersion = 0;

export function computeLayout(s: GameState): LayoutCache {
  const t = tierDef(s.office.tier);
  const cache: LayoutCache = {
    version: ++layoutVersion,
    desks: {},
    meeting: 0,
    qa: 0,
    servers: 0,
    audio: 0,
    mocap: 0,
    training: 0,
    research: 0,
    marketing: 0,
    trophies: 0,
    deskTierById: {},
  };
  // Facility powers (diminishing for stacked effects)
  const powers: Record<string, number[]> = {};
  for (const it of s.office.items) {
    const d = ITEM_BY_ID[it.item];
    if (d.effect && d.power) (powers[d.effect] ??= []).push(d.power);
  }
  const dim = (arr: number[] | undefined) => {
    if (!arr) return 0;
    const sorted = [...arr].sort((a, b) => b - a);
    let total = 0;
    sorted.forEach((p, i) => (total += p * Math.pow(0.7, i)));
    return total;
  };
  cache.meeting = Math.min(0.15, dim(powers.meeting));
  cache.qa = dim(powers.qa);
  cache.servers = (powers.servers ?? []).length;
  cache.audio = dim(powers.audio);
  cache.mocap = dim(powers.mocap);
  cache.training = dim(powers.training);
  cache.research = dim(powers.research);
  cache.marketing = dim(powers.marketing);
  cache.trophies = (powers.trophies ?? []).length;

  for (let floor = 0; floor < t.floors; floor++) {
    const items = s.office.items.filter((i) => i.floor === floor);
    const occ = occupancy(s, floor);
    const desks = items.filter((i) => ITEM_BY_ID[i.item].category === 'desk');
    if (!desks.length) continue;
    // One multi-source BFS per distinct energy-station strength (few distinct values).
    const byGain = new Map<number, [number, number][]>();
    for (const st of items) {
      const g = ITEM_BY_ID[st.item].energy;
      if (!g) continue;
      const arr = byGain.get(g) ?? [];
      arr.push(...adjacentFree(s, st, occ));
      byGain.set(g, arr);
    }
    const fields = [...byGain.entries()].map(([gain, starts]) => ({ gain, dist: bfs(s, floor, starts) }));
    // Desk-count grid for O(1)-ish crowding lookups
    const deskGrid = new Uint8Array(t.w * t.h);
    for (const d of desks) deskGrid[d.y * t.w + d.x] = 1;
    // Only items that emit something matter for auras
    const emitters = items
      .map((it) => {
        const d = ITEM_BY_ID[it.item];
        const fp = footprint(it);
        return { d, cx: it.x + fp.w / 2 - 0.5, cy: it.y + fp.h / 2 - 0.5 };
      })
      .filter((e) => e.d.aura || e.d.noise || e.d.effect === 'training');
    for (const desk of desks) {
      const seat = adjacentFree(s, desk, occ);
      let bestDist = Infinity;
      let bestGain = 0;
      let bestScore = -Infinity;
      for (const f of fields) {
        let dmin = Infinity;
        for (const [x, y] of seat) {
          const d = f.dist[y * t.w + x]!;
          if (d >= 0 && d < dmin) dmin = d;
        }
        if (dmin === Infinity) continue;
        const score = f.gain - dmin * 1.2;
        if (score > bestScore) {
          bestScore = score;
          bestDist = dmin;
          bestGain = f.gain;
        }
      }
      let crowd = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = desk.x + dx;
          const y = desk.y + dy;
          if ((dx || dy) && x >= 0 && y >= 0 && x < t.w && y < t.h) crowd += deskGrid[y * t.w + x]!;
        }
      let decor = 0;
      let pet = 0;
      let noise = 0;
      let training = 0;
      for (const e of emitters) {
        const dist = Math.max(Math.abs(e.cx - desk.x), Math.abs(e.cy - desk.y));
        if (e.d.aura && e.d.radius && dist <= e.d.radius + 0.5) {
          const v = e.d.aura * (1 - dist / (e.d.radius + 1.5));
          // a pet roams: the best one nearby counts, more pets don't stack
          if (e.d.id === 'pet_cat' || e.d.id === 'pet_dog') pet = Math.max(pet, v);
          else decor += v;
        }
        if (e.d.noise && dist <= 3.5) noise += e.d.noise * (1 - dist / 4.5);
        if (e.d.effect === 'training' && dist <= 3) training += (e.d.power ?? 0) * 0.5;
      }
      cache.desks[desk.id] = {
        deskId: desk.id,
        floor,
        x: desk.x,
        y: desk.y,
        energyDist: bestDist,
        energyGain: bestGain,
        crowding: crowd,
        decor: Math.max(0, decor + pet),
        noise,
        trainingBoost: training,
      };
      cache.deskTierById[desk.id] = ITEM_BY_ID[desk.item].deskTier ?? 1;
    }
  }
  return cache;
}

// Layout caches are keyed by the office object identity + revision counter.
const layoutCaches = new WeakMap<object, { rev: number; cache: LayoutCache }>();

/** Call after any change to office items or tier. */
export function touchOffice(s: GameState): void {
  s.office.rev = (s.office.rev ?? 0) + 1;
}

export function layout(s: GameState): LayoutCache {
  const rev = s.office.rev ?? 0;
  const hit = layoutCaches.get(s.office);
  if (hit && hit.rev === rev) return hit.cache;
  const cache = computeLayout(s);
  layoutCaches.set(s.office, { rev, cache });
  return cache;
}

export function deskCount(s: GameState): number {
  return s.office.items.filter((i) => ITEM_BY_ID[i.item].category === 'desk').length;
}

/** Assign free desks to staff without one; unassign desks that no longer exist. */
/** Desk metrics depend only on items, not on who sits where — so this does NOT invalidate the layout. */
export function assignDesks(s: GameState): void {
  const deskIds = new Set(s.office.items.filter((i) => ITEM_BY_ID[i.item].category === 'desk').map((i) => i.id));
  const taken = new Set<string>();
  for (const st of Object.values(s.staff)) {
    if (st.deskId && deskIds.has(st.deskId) && !taken.has(st.deskId)) taken.add(st.deskId);
    else delete st.deskId;
  }
  const free = [...deskIds].filter((d) => !taken.has(d));
  for (const st of Object.values(s.staff)) {
    if (!st.deskId && free.length) st.deskId = free.shift();
  }
}

export function freeDesks(s: GameState): number {
  return deskCount(s) - Object.values(s.staff).filter((st) => st.deskId).length;
}

/**
 * Per-tile heat-map values (0..1, higher = better for the player) for build-mode overlays.
 * - energy: closeness to the best energy station (walking distance)
 * - decor: morale aura strength
 * - noise: quietness (1 = silent)
 * - crowding: openness (1 = no desks nearby)
 */
export function heatField(s: GameState, floor: number, kind: 'energy' | 'decor' | 'noise' | 'crowding'): Float32Array {
  const t = tierDef(s.office.tier);
  const out = new Float32Array(t.w * t.h);
  const items = s.office.items.filter((i) => i.floor === floor);
  if (kind === 'energy') {
    const occ = occupancy(s, floor);
    const starts: [number, number][] = [];
    for (const it of items) if (ITEM_BY_ID[it.item].energy) starts.push(...adjacentFree(s, it, occ));
    if (!starts.length) return out;
    const d = bfs(s, floor, starts);
    for (let i = 0; i < out.length; i++) out[i] = d[i]! < 0 ? 0 : Math.max(0, 1 - d[i]! / 14);
    return out;
  }
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      let v = 0;
      for (const it of items) {
        const d = ITEM_BY_ID[it.item];
        const fp = footprint(it);
        const cx = it.x + fp.w / 2 - 0.5;
        const cy = it.y + fp.h / 2 - 0.5;
        const dist = Math.max(Math.abs(cx - x), Math.abs(cy - y));
        if (kind === 'decor' && d.aura && d.radius && dist <= d.radius + 0.5) v += d.aura * (1 - dist / (d.radius + 1.5));
        if (kind === 'noise' && d.noise && dist <= 3.5) v += d.noise * (1 - dist / 4.5);
        if (kind === 'crowding' && d.category === 'desk' && dist <= 2 && dist > 0) v += 1;
      }
      out[y * t.w + x] = kind === 'decor' ? Math.min(1, v / 14) : kind === 'noise' ? Math.max(0, 1 - Math.max(0, v) / 6) : Math.max(0, 1 - v / 8);
    }
  return out;
}
