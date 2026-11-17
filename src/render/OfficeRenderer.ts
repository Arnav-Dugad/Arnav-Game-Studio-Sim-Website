/**
 * Top-down (¾) office renderer. Presentation only: it reads GameState and never mutates it.
 * Staff "life" (walking to the coffee machine, chatting, slumping when burnt out) mirrors the
 * sim's activity flags but uses its own non-deterministic timing, so visuals never affect the sim.
 */
import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { ITEM_BY_ID, type ItemId } from '@/data/facilities';
import { fromDay } from '@/sim/calendar';
import { canPlace, entrance, findPath, footprint, heatField, occupancy, tierDef } from '@/sim/systems/office';
import type { GameState, PlacedItem, Staff } from '@/sim/types';
import { DARK, LIGHT, hexToNum, mix, shade, type ScenePalette } from './palette';
import { T, drawItem, drawPerson, itemLift, lookFor, type Look } from './sprites';
import { PetSystem } from './pets';
import { VisitorSystem } from './visitors';
import { ScreenSystem, type ScreenUser } from './screens';
import { SeasonDecor, birthdayOf, dayOfYear, seasonOf, type Season } from './seasons';
import { animate, createRig, newAnim, reskinRig, setHat, type Anim, type Rig } from './animation';
import { LEISURE, RESEARCH_SPOTS, chatExchange, workExchange, workThought } from './officeLife';

export interface RendererUI {
  floor: number;
  build: { item?: ItemId; rot: 0 | 1; moving?: string; selected?: string } | null;
  heat: 'none' | 'energy' | 'decor' | 'noise' | 'crowding';
  selectedStaff: string | null;
  speed: number;
  reducedMotion: boolean;
  /** Screen-space px covered on the left by UI (rail + open panel); the camera keeps the office clear of it. */
  leftInset?: number;
  /** A dialog is open: the office must not react to the keyboard. */
  modalOpen?: boolean;
}

export interface RendererCallbacks {
  getState: () => GameState | null;
  getUI: () => RendererUI;
  onTileClick?: (x: number, y: number, floor: number) => void;
  onItemClick?: (item: PlacedItem) => void;
  onStaffClick?: (staffId: string) => void;
  onCancel?: () => void;
  onRotate?: () => void;
  /** Drag-to-paint in build mode: one call per new tile under the pointer, then onPaintEnd. */
  onPaint?: (x: number, y: number, floor: number) => void;
  onPaintEnd?: () => void;
}

type Mode = 'desk' | 'walk' | 'station' | 'away' | 'wander' | 'meeting' | 'talk' | 'fun';

interface Talk {
  partner: string;
  lines: string[];
  i: number;
  timer: number;
  host: boolean;
  /** Seconds a non-host waits for the host to arrive before giving up. */
  patience: number;
  /** Friends finish with a high-five. */
  fived?: boolean;
}

interface Agent {
  id: string;
  c: Container;
  fig: Graphics;
  rig: Rig;
  anim: Anim;
  look: Look;
  pose: 'stand' | 'sit' | 'slump';
  x: number;
  y: number;
  path: [number, number][];
  mode: Mode;
  next: Mode;
  wait: number;
  cooldown: number;
  bubble: Container | null;
  bubbleT: number;
  icon: Text | null;
  t: number;
  floor: number;
  deskId?: string;
  seat?: [number, number];
  sweat: number;
  label: Text | null;
  ring: Graphics;
  legL: Graphics;
  legR: Graphics;
  /** 1 = facing right, -1 = left. */
  face: number;
  talk: Talk | null;
  speech: Container | null;
  speechT: number;
  thinkT: number;
  medal?: Graphics;
  /** Last seen level, to celebrate promotions. */
  level?: string;
  /** Why they were away last time we looked (to welcome them back). */
  awayWas?: 'sick' | 'vacation';
}

const pickOne = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const firstName = (n: string) => n.split(' ')[0] ?? n;

const GLYPHS = ['♪', '!', '?', '☕', '💡', '…', '★', '♥'];

export class OfficeRenderer {
  app = new Application();
  private world = new Container();
  private staticLayer = new Container();
  private heatLayer = new Graphics();
  private itemLayer = new Container();
  private fxLayer = new Container();
  private ghost = new Container();
  private textures = new Map<string, Texture>();
  private itemSprites = new Map<string, Sprite>();
  private agents = new Map<string, Agent>();
  /** After the first sync, newly created agents are new hires and say hello. */
  private agentsReady = false;
  /** Who has chatted with whom (pair key → count). Friends seek each other out. */
  private affinity = new Map<string, number>();
  private lunchT = 40 + Math.random() * 40;
  private staticKey = '';
  private itemsKey = '';
  private heatKey = '';
  private ghostKey = '';
  private P: ScenePalette = LIGHT;
  private zoom = 1;
  private targetZoom = 1;
  private cam = { x: 0, y: 0 };
  private destroyed = false;
  private ready = false;
  private el: HTMLElement | null = null;
  private hoverTile: [number, number] | null = null;
  private hoverStaff: string | null = null;
  private drag: { x: number; y: number; camX: number; camY: number; moved: boolean; button: number; mouse: boolean; t: number } | null = null;
  private painted: string | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; zoom: number } | null = null;
  private keys = new Set<string>();
  private fitted = '';
  private inset = 0;
  private insetTarget = 0;
  private particles: { g: Graphics; vx: number; vy: number; life: number }[] = [];
  private pets = new PetSystem(this.itemLayer);
  private seasonDecor = new SeasonDecor(this.itemLayer);
  private visitors = new VisitorSystem(this.itemLayer);
  private monitors = new ScreenSystem(this.itemLayer);
  private season: Season | null = null;
  private lastDay = -1;
  private bdayGreeted = new Set<string>();
  private themeObserver: MutationObserver | null = null;

  constructor(private cb: RendererCallbacks) {}

  async init(el: HTMLElement): Promise<void> {
    this.el = el;
    await this.app.init({
      resizeTo: el,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      preference: 'webgl',
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    el.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.app.canvas.style.display = 'block';
    this.itemLayer.sortableChildren = true;
    this.world.addChild(this.staticLayer, this.heatLayer, this.itemLayer, this.ghost, this.fxLayer);
    this.app.stage.addChild(this.world);
    this.readTheme();
    this.themeObserver = new MutationObserver(() => this.readTheme());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.bindInput();
    this.app.ticker.add((tk) => this.update(tk.deltaMS));
    this.ready = true;
  }

  destroy(): void {
    this.destroyed = true;
    this.themeObserver?.disconnect();
    this.unbindInput();
    if (this.ready) {
      for (const t of this.textures.values()) t.destroy(true);
      this.app.destroy(true, { children: true });
    }
  }

  private readTheme(): void {
    const dark = document.documentElement.dataset.theme === 'dark';
    const next = dark ? DARK : LIGHT;
    if (next !== this.P) {
      this.P = next;
      for (const t of this.textures.values()) t.destroy(true);
      this.textures.clear();
      this.staticKey = '';
      this.itemsKey = '';
      for (const a of this.agents.values()) a.c.destroy({ children: true });
      this.agents.clear();
    }
  }

  // ── Camera ───────────────────────────────────────────────────────────────

  fit(): void {
    const s = this.cb.getState();
    if (!s || !this.el) return;
    const t = tierDef(s.office.tier);
    const W = t.w * T;
    const H = (t.h + 1.6) * T;
    const sw = this.el.clientWidth - this.inset;
    const sh = this.el.clientHeight;
    const z = Math.max(0.35, Math.min(2.2, Math.min(sw / (W + 80), sh / (H + 80))));
    this.zoom = this.targetZoom = z;
    this.cam.x = this.inset + (sw - W * z) / 2;
    this.cam.y = (sh - H * z) / 2 + 1.4 * T * z;
  }

  /** Cinematic mode: the camera drifts between interesting moments on its own. */
  private tour: { target: { x: number; y: number } | null; follow: string | null; t: number } | null = null;

  setCinematic(on: boolean): void {
    this.tour = on ? { target: null, follow: null, t: 0 } : null;
    if (!on) this.fit();
  }

  get cinematic(): boolean {
    return !!this.tour;
  }

  private updateTour(dt: number): void {
    const tour = this.tour;
    if (!tour || !this.el) return;
    tour.t -= dt;
    if (tour.t <= 0) {
      tour.t = 6 + Math.random() * 4;
      const visible = [...this.agents.values()].filter((a) => a.c.visible);
      const talking = visible.filter((a) => a.mode === 'talk' || a.speechT > 0);
      const fun = visible.filter((a) => a.mode === 'fun' || a.mode === 'station' || a.mode === 'walk');
      const pool = talking.length && Math.random() < 0.6 ? talking : fun.length && Math.random() < 0.5 ? fun : visible;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      tour.follow = pick?.id ?? null;
      this.targetZoom = 1.6 + Math.random() * 0.8;
    }
    const a = tour.follow ? this.agents.get(tour.follow) : undefined;
    if (!a || !a.c.visible) return;
    // ease towards keeping them centred (a little above, to frame bubbles)
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 0.8);
    const tx = this.el.clientWidth / 2 - a.x * this.zoom;
    const ty = this.el.clientHeight / 2 - (a.y - 24) * this.zoom;
    const k = Math.min(1, dt * 1.2);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  zoomBy(f: number, sx?: number, sy?: number): void {
    if (!this.el) return;
    const cx = sx ?? this.el.clientWidth / 2;
    const cy = sy ?? this.el.clientHeight / 2;
    const nz = Math.max(0.3, Math.min(3, this.targetZoom * f));
    const wx = (cx - this.cam.x) / this.zoom;
    const wy = (cy - this.cam.y) / this.zoom;
    this.targetZoom = nz;
    this.zoom = nz;
    this.cam.x = cx - wx * nz;
    this.cam.y = cy - wy * nz;
  }

  private screenToTile(sx: number, sy: number): [number, number] {
    const wx = (sx - this.cam.x) / this.zoom;
    const wy = (sy - this.cam.y) / this.zoom;
    return [Math.floor(wx / T), Math.floor(wy / T)];
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: this.zoom };
      this.drag = null;
      return;
    }
    this.drag = { x: e.offsetX, y: e.offsetY, camX: this.cam.x, camY: this.cam.y, moved: false, button: e.button, mouse: e.pointerType === 'mouse', t: performance.now() };
    this.app.canvas.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const target = Math.max(0.3, Math.min(3, this.pinch.zoom * (d / this.pinch.d)));
      this.zoomBy(target / this.zoom, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      return;
    }
    this.hoverTile = this.screenToTile(e.offsetX, e.offsetY);
    this.hoverStaff = this.pickStaff(e.offsetX, e.offsetY);
    this.pets.hover(this.hoverStaff ? null : (e.offsetX - this.cam.x) / this.zoom, (e.offsetY - this.cam.y) / this.zoom, this.P.night);
    this.app.canvas.style.cursor = this.cb.getUI().build ? 'crosshair' : this.hoverStaff ? 'pointer' : this.drag?.moved ? 'grabbing' : 'grab';
    if (this.drag) {
      const dx = e.offsetX - this.drag.x;
      const dy = e.offsetY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
      const ui = this.cb.getUI();
      const panButton = this.drag.button === 1 || this.drag.button === 2 || !ui.build?.item;
      // Drag-to-paint: with an item in hand, a left-button drag places one on every tile it crosses.
      // Mouse only (a finger drag pans), and not in the first moments (a second finger may be landing).
      if (this.drag.moved && !panButton && ui.build?.item && this.cb.onPaint && this.drag.mouse && performance.now() - this.drag.t > 80) {
        let [px, py] = this.painted === null ? this.screenToTile(this.drag.x, this.drag.y) : (this.painted.split(',').map(Number) as [number, number]);
        if (this.painted === null) this.cb.onPaint(px, py, ui.floor);
        const [tx, ty] = this.hoverTile;
        // Walk tile by tile so fast drags leave no holes.
        while (px !== tx || py !== ty) {
          const dx = tx - px;
          const dy = ty - py;
          if (Math.abs(dx) >= Math.abs(dy)) px += Math.sign(dx);
          else py += Math.sign(dy);
          this.cb.onPaint(px, py, ui.floor);
        }
        this.painted = `${tx},${ty}`;
      }
      if (this.drag.moved && panButton) {
        this.cam.x = this.drag.camX + dx;
        this.cam.y = this.drag.camY + dy;
      }
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    this.drag = null;
    if (this.painted !== null) {
      this.painted = null;
      this.cb.onPaintEnd?.();
      return;
    }
    if (!d || d.moved) return;
    if (d.button === 2) {
      this.cb.onCancel?.();
      return;
    }
    const ui = this.cb.getUI();
    const [tx, ty] = this.screenToTile(e.offsetX, e.offsetY);
    if (ui.build?.item || ui.build?.moving) {
      this.cb.onTileClick?.(tx, ty, ui.floor);
      return;
    }
    const st = this.pickStaff(e.offsetX, e.offsetY);
    if (st && !ui.build) {
      this.cb.onStaffClick?.(st);
      return;
    }
    const s = this.cb.getState();
    if (s && ui.build) {
      const t = tierDef(s.office.tier);
      const id = occupancy(s, ui.floor).get(ty * t.w + tx);
      const it = id ? s.office.items.find((i) => i.id === id) : undefined;
      if (it) this.cb.onItemClick?.(it);
      else this.cb.onTileClick?.(tx, ty, ui.floor);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
  };

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.key.toLowerCase();
    const ui = this.cb.getUI();
    if (ui.modalOpen) return;
    const focusTag = (document.activeElement as HTMLElement | null)?.tagName;
    if (k === 'enter' && (focusTag === 'BUTTON' || focusTag === 'A')) return; // let focused buttons work
    const placing = !!(ui.build?.item || ui.build?.moving);
    // Keyboard building: arrows move the placement cursor, Enter places.
    if (placing && e.type === 'keydown' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter'].includes(k)) {
      const s = this.cb.getState();
      if (!s) return;
      const t = tierDef(s.office.tier);
      const cur = this.hoverTile ?? [Math.floor(t.w / 2), Math.floor(t.h / 2)];
      if (k === 'enter') {
        this.cb.onTileClick?.(cur[0], cur[1], ui.floor);
      } else {
        const dx = k === 'arrowleft' ? -1 : k === 'arrowright' ? 1 : 0;
        const dy = k === 'arrowup' ? -1 : k === 'arrowdown' ? 1 : 0;
        this.hoverTile = [Math.max(0, Math.min(t.w - 1, cur[0] + dx)), Math.max(0, Math.min(t.h - 1, cur[1] + dy))];
      }
      e.preventDefault();
      return;
    }
    if (e.type === 'keydown') {
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) this.keys.add(k);
      if (k === 'r' && this.cb.getUI().build) this.cb.onRotate?.();
      if (k === '=' || k === '+') this.zoomBy(1.15);
      if (k === '-') this.zoomBy(1 / 1.15);
      if (k === '0') this.fit();
    } else this.keys.delete(k);
  };

  private noMenu = (e: Event) => e.preventDefault();
  private onBlur = () => this.keys.clear();

  private bindInput(): void {
    const c = this.app.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('contextmenu', this.noMenu);
    c.addEventListener('pointerleave', () => (this.hoverTile = null));
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
  }

  private unbindInput(): void {
    if (!this.ready) return;
    const c = this.app.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.noMenu);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
  }

  private pickStaff(sx: number, sy: number): string | null {
    const wx = (sx - this.cam.x) / this.zoom;
    const wy = (sy - this.cam.y) / this.zoom;
    let best: string | null = null;
    let bd = 22;
    for (const a of this.agents.values()) {
      if (!a.c.visible) continue;
      const d = Math.hypot(a.x - wx, a.y - 14 - wy);
      if (d < bd) {
        bd = d;
        best = a.id;
      }
    }
    return best;
  }

  // ── Frame ────────────────────────────────────────────────────────────────

  private update(dtMs: number): void {
    const s = this.cb.getState();
    if (!s || !this.el) return;
    const ui = this.cb.getUI();
    const dt = Math.min(0.1, dtMs / 1000);
    const t = tierDef(s.office.tier);
    const floor = Math.min(ui.floor, t.floors - 1);
    // fit once per office tier / first frame
    // refit on tier change or when the canvas is resized (window resize, orientation change)
    const fitKey = `${s.office.tier}|${Math.round(this.el.clientWidth / 40)}|${Math.round(this.el.clientHeight / 40)}`;
    if (fitKey !== this.fitted && this.el.clientWidth > 0) {
      this.fitted = fitKey;
      this.fit();
    }
    // keep the office clear of side panels (smoothly slide the camera)
    this.insetTarget = this.el.clientWidth > 900 ? (ui.leftInset ?? 0) : 0;
    if (Math.abs(this.insetTarget - this.inset) > 0.5) {
      const step = (this.insetTarget - this.inset) * Math.min(1, dt * 10);
      this.inset += step;
      this.cam.x += step * 0.75;
    }
    // keyboard pan
    const pan = 520 * dt;
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.cam.x += pan;
    if (this.keys.has('d') || this.keys.has('arrowright')) this.cam.x -= pan;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.cam.y += pan;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.cam.y -= pan;
    this.updateTour(dt);
    this.world.scale.set(this.zoom);
    this.world.position.set(this.cam.x, this.cam.y);

    const era = fromDay(s.day).year;
    const eraBucket = era < 2003 ? 'crt' : 'lcd';
    const sKey = `${s.office.tier}|${floor}|${this.P.night}|${s.office.style?.floor ?? ''}|${s.office.style?.wall ?? ''}`;
    if (sKey !== this.staticKey) {
      this.staticKey = sKey;
      this.drawStatic(s, floor);
    }
    this.trophies = Math.min(8, s.progress.stats.awardsWon ?? 0);
    const iKey = `${s.office.rev ?? 0}|${s.office.tier}|${floor}|${eraBucket}|${this.P.night}|${s.office.items.length}|${this.trophies}`;
    if (iKey !== this.itemsKey) {
      this.itemsKey = iKey;
      this.syncItems(s, floor, era);
      for (const a of this.agents.values()) a.seat = undefined; // recompute seats
    }
    const hKey = `${ui.heat}|${s.office.rev ?? 0}|${floor}|${s.office.items.length}`;
    if (hKey !== this.heatKey) {
      this.heatKey = hKey;
      this.drawHeat(s, floor, ui.heat);
    }
    this.updateGhost(s, ui, floor, era);
    this.season = seasonOf(s);
    this.seasonDecor.update(s, floor, dt, this.season, this.P, ui.reducedMotion);
    this.syncAgents(s, floor, ui, dt);
    this.pets.update(s, floor, dt * (ui.speed === 0 ? 0.6 : 1), this.petHost(s, floor), ui.reducedMotion);
    const users: ScreenUser[] = [];
    for (const a of this.agents.values()) {
      if (!a.c.visible || a.mode !== 'desk' || !a.deskId) continue;
      const st = s.staff[a.id];
      if (st && (st.activity === 'work' || st.activity === 'research')) users.push({ deskId: a.deskId, role: st.role, research: st.activity === 'research', phase: a.anim.phase });
    }
    this.monitors.update(s, floor, era, users, dt, ui.reducedMotion);
    this.visitors.update(s, floor, dt * (ui.speed === 0 ? 0.6 : 1), this.visitorHost(s, floor), ui.reducedMotion, this.P);
    this.updateParticles(dt);
  }

  // ── Static floor & walls ─────────────────────────────────────────────────

  private drawStatic(s: GameState, floor: number): void {
    this.staticLayer.removeChildren().forEach((c) => c.destroy());
    const t = tierDef(s.office.tier);
    const P = this.P;
    const g = new Graphics();
    const W = t.w * T;
    const H = t.h * T;
    const garage = t.tier === 1;
    const style = s.office.style?.floor ?? 'auto';
    const dim = P.night ? 0.62 : 1;
    const pair: Record<Exclude<typeof style, 'auto'>, [number, number]> = {
      wood: [P.floorWood, P.floorWood2],
      carpet: [P.floorCarpet, P.floorCarpet2],
      concrete: [shade(0xc9c6c1, dim), shade(0xbfbcb6, dim)],
      tiles: [shade(0xeef0f2, dim), shade(0xdfe3e7, dim)],
      checker: [shade(0xf2efe9, dim), shade(0x3b3f48, P.night ? 0.8 : 1)],
    };
    const [f1, f2] =
      style !== 'auto'
        ? pair[style]
        : [garage ? mix(P.floorWood, 0x9a9a9a, 0.45) : t.tier >= 3 && floor % 2 === 1 ? P.floorCarpet : P.floorWood, garage ? mix(P.floorWood2, 0x9a9a9a, 0.45) : t.tier >= 3 && floor % 2 === 1 ? P.floorCarpet2 : P.floorWood2];
    const checker = style === 'checker' || style === 'tiles' || (style === 'auto' && garage);
    const wallColor = s.office.style?.wall ? shade(hexToNum(s.office.style.wall), P.night ? 0.6 : 1) : P.wall;
    // outer shadow
    g.roundRect(-14, -1.4 * T, W + 28, H + 1.4 * T + 18, 18).fill({ color: 0x000000, alpha: 0.12 });
    // floor
    g.roundRect(-6, -6, W + 12, H + 12, 10).fill(shade(f1, 0.85));
    for (let y = 0; y < t.h; y++)
      for (let x = 0; x < t.w; x++) {
        const c = checker ? ((x + y) % 2 ? f1 : f2) : x % 2 === 0 ? f1 : f2;
        g.rect(x * T, y * T, T, T).fill(c);
        if (!garage) g.rect(x * T, y * T + T - 1, T, 1).fill({ color: 0x000000, alpha: 0.04 });
      }
    // back wall
    g.roundRect(-8, -1.35 * T, W + 16, 1.35 * T, 8).fill(wallColor);
    g.rect(-8, -1.35 * T, W + 16, 8).fill(s.office.style?.wall ? shade(wallColor, 1.12) : P.wallTop);
    g.rect(-8, -8, W + 16, 8).fill(P.trim);
    if (garage) {
      // garage door
      const gw = Math.min(W - 40, 5 * T);
      g.roundRect((W - gw) / 2, -1.2 * T, gw, 1.05 * T, 4).fill(shade(P.wall, 0.9));
      for (let i = 1; i < 5; i++) g.rect((W - gw) / 2, -1.2 * T + i * ((1.05 * T) / 5), gw, 1.5).fill({ color: 0x000000, alpha: 0.12 });
    } else {
      for (let x = 1; x < t.w - 1; x += 3) {
        g.roundRect(x * T + 4, -1.1 * T, 2 * T - 8, 0.75 * T, 4).fill(P.windowFrame);
        g.roundRect(x * T + 7, -1.1 * T + 3, 2 * T - 14, 0.75 * T - 6, 3).fill(P.window);
        g.rect(x * T + T - 1, -1.1 * T + 3, 2, 0.75 * T - 6).fill(P.windowFrame);
        if (!P.night) g.poly([x * T + 10, -1.1 * T + 6, x * T + 22, -1.1 * T + 6, x * T + 12, -0.4 * T, x * T + 4, -0.4 * T]).fill({ color: 0xffffff, alpha: 0.25 });
      }
    }
    // side walls & front ledge with entrance gap
    g.rect(-8, -8, 8, H + 16).fill(P.trim);
    g.rect(W, -8, 8, H + 16).fill(P.trim);
    const ent = entrance(s);
    g.rect(-8, H, ent.x * T + 8, 8).fill(P.trim);
    g.rect((ent.x + 1) * T, H, W - (ent.x + 1) * T + 8, 8).fill(P.trim);
    // doormat
    g.roundRect(ent.x * T + 4, (t.h - 1) * T + 6, T - 8, T - 12, 4).fill({ color: P.accentDesign, alpha: 0.35 });
    // floor label for multi-floor offices
    this.staticLayer.addChild(g);
    if (t.floors > 1) {
      const label = new Text({ text: `Floor ${floor + 1}`, style: { fontFamily: 'Space Grotesk, Inter, sans-serif', fontSize: 14, fill: P.night ? 0xc9c0b4 : 0x5b534a, fontWeight: '600' } });
      label.position.set(10, -1.3 * T + 10);
      this.staticLayer.addChild(label);
    }
  }

  // ── Items ────────────────────────────────────────────────────────────────

  private trophies = 0;
  private agentColor: number | undefined;

  private texFor(id: ItemId, rot: 0 | 1, era: number): { tex: Texture; ox: number; oy: number } {
    const def = ITEM_BY_ID[id];
    const w = rot ? def.h : def.w;
    const h = rot ? def.w : def.h;
    const key = `${id}|${rot}|${era < 2003 ? 'crt' : 'lcd'}|${this.P.night}${id === 'trophy_shelf' ? `|t${this.trophies}` : ''}`;
    const lift = itemLift(id) + 12;
    let tex = this.textures.get(key);
    if (!tex) {
      const g = new Graphics();
      // pad region so generateTexture includes lift and overhangs
      g.rect(-6, -lift, w * T + 12, h * T + lift + 10).fill({ color: 0x000000, alpha: 0.001 });
      drawItem(g, id, w, h, { era, P: this.P, trophies: this.trophies });
      tex = this.app.renderer.generateTexture({ target: g, resolution: 2, antialias: true });
      g.destroy();
      this.textures.set(key, tex);
    }
    return { tex, ox: -6, oy: -lift };
  }

  private syncItems(s: GameState, floor: number, era: number): void {
    for (const sp of this.itemSprites.values()) sp.destroy();
    this.itemSprites.clear();
    for (const it of s.office.items) {
      if (it.floor !== floor) continue;
      const { tex, ox, oy } = this.texFor(it.item, it.rot, era);
      const sp = new Sprite(tex);
      sp.position.set(it.x * T + ox, it.y * T + oy);
      const fp = footprint(it);
      sp.zIndex = it.item === 'rug' || it.item === 'mocap_rig' ? -10_000 + it.y : (it.y + fp.h) * T - 2;
      this.itemLayer.addChild(sp);
      this.itemSprites.set(it.id, sp);
    }
  }

  // ── Heat map ─────────────────────────────────────────────────────────────

  private drawHeat(s: GameState, floor: number, kind: RendererUI['heat']): void {
    const g = this.heatLayer;
    g.clear();
    if (kind === 'none') return;
    const t = tierDef(s.office.tier);
    const f = heatField(s, floor, kind);
    for (let y = 0; y < t.h; y++)
      for (let x = 0; x < t.w; x++) {
        const v = f[y * t.w + x]!;
        const c = v > 0.5 ? mix(0xf2c450, 0x46c07a, (v - 0.5) * 2) : mix(0xf06478, 0xf2c450, v * 2);
        g.rect(x * T + 1, y * T + 1, T - 2, T - 2).fill({ color: c, alpha: 0.38 });
      }
  }

  // ── Ghost (build mode) ───────────────────────────────────────────────────

  private updateGhost(s: GameState, ui: RendererUI, floor: number, era: number): void {
    const b = ui.build;
    const moving = b?.moving ? s.office.items.find((i) => i.id === b.moving) : undefined;
    const itemId = b?.item ?? moving?.item;
    if (!b || !itemId || !this.hoverTile) {
      if (this.ghostKey) {
        this.ghost.removeChildren().forEach((c) => c.destroy());
        this.ghostKey = '';
      }
      // selection outline
      if (b?.selected) {
        const it = s.office.items.find((i) => i.id === b.selected);
        if (it && it.floor === floor) {
          const fp = footprint(it);
          const key = `sel|${it.id}|${it.x}|${it.y}|${fp.w}|${fp.h}`;
          if (key !== this.ghostKey) {
            this.ghost.removeChildren().forEach((c) => c.destroy());
            const g = new Graphics();
            g.roundRect(it.x * T - 2, it.y * T - 2, fp.w * T + 4, fp.h * T + 4, 8).stroke({ width: 3, color: 0xf2c450 });
            this.ghost.addChild(g);
            this.ghostKey = key;
          }
        }
      }
      return;
    }
    const rot = b.rot;
    const [tx, ty] = this.hoverTile;
    const def = ITEM_BY_ID[itemId];
    const ok = canPlace(s, def, floor, tx, ty, rot, moving?.id).ok;
    const key = `${itemId}|${rot}|${tx}|${ty}|${ok}|${floor}`;
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghost.removeChildren().forEach((c) => c.destroy());
    const w = rot ? def.h : def.w;
    const h = rot ? def.w : def.h;
    const base = new Graphics();
    base.roundRect(tx * T, ty * T, w * T, h * T, 6).fill({ color: ok ? 0x46c07a : 0xf06478, alpha: 0.32 });
    base.roundRect(tx * T, ty * T, w * T, h * T, 6).stroke({ width: 2, color: ok ? 0x46c07a : 0xf06478, alpha: 0.9 });
    this.ghost.addChild(base);
    const { tex, ox, oy } = this.texFor(itemId, rot, era);
    const sp = new Sprite(tex);
    sp.alpha = 0.7;
    sp.position.set(tx * T + ox, ty * T + oy);
    this.ghost.addChild(sp);
  }

  // ── Staff agents ────────────────────────────────────────────────────────

  private seatFor(s: GameState, deskId: string | undefined, floor: number): [number, number] | undefined {
    if (!deskId) return undefined;
    const d = s.office.items.find((i) => i.id === deskId);
    if (!d || d.floor !== floor) return undefined;
    const t = tierDef(s.office.tier);
    const occ = occupancy(s, floor);
    const fp = footprint(d);
    const cand: [number, number][] = [
      [d.x, d.y + fp.h],
      [d.x, d.y - 1],
      [d.x - 1, d.y],
      [d.x + fp.w, d.y],
    ];
    for (const [x, y] of cand) if (x >= 0 && y >= 0 && x < t.w && y < t.h && !occ.has(y * t.w + x)) return [x, y];
    return [d.x, d.y + fp.h];
  }

  private makeAgent(st: Staff, color: number): Agent {
    const c = new Container();
    const ring = new Graphics();
    ring.ellipse(0, 0, 13, 5).stroke({ width: 2.5, color: 0xf2c450 });
    ring.visible = false;
    const fig = new Graphics();
    const look = lookFor(st.look, st.role, color);
    drawPerson(fig, look, 'sit', this.P);
    const legL = new Graphics().roundRect(-5, -8, 4, 8, 2).fill(0x3a3f4a);
    const legR = new Graphics().roundRect(1, -8, 4, 8, 2).fill(0x3a3f4a);
    const rig = createRig(fig, look);
    c.addChild(ring, legL, legR, rig.root);
    this.itemLayer.addChild(c);
    return { id: st.id, c, fig, rig, anim: newAnim(), look, pose: 'sit', x: 0, y: 0, path: [], mode: 'desk', next: 'desk', wait: 0, cooldown: 3 + Math.random() * 8, bubble: null, bubbleT: 0, icon: null, t: Math.random() * 10, floor: 0, sweat: 0, label: null, ring, legL, legR, face: 1, talk: null, speech: null, speechT: 0, thinkT: 4 + Math.random() * 10 };
  }

  private setPose(a: Agent, pose: Agent['pose']): void {
    if (a.pose === pose) return;
    a.pose = pose;
    a.fig.clear();
    drawPerson(a.fig, a.look, pose, this.P);
  }

  private tileCenter(x: number, y: number): [number, number] {
    return [x * T + T / 2, y * T + T * 0.72];
  }

  private syncAgents(s: GameState, floor: number, ui: RendererUI, dt: number): void {
    const seen = new Set<string>();
    const color = hexToNum(s.company.color || '#e07a5f');
    if (this.agentColor !== undefined && this.agentColor !== color) {
      // Studio colour changed (identity editor): redress everyone who wears it.
      for (const st of Object.values(s.staff)) {
        const a = this.agents.get(st.id);
        if (!a) continue;
        a.look = lookFor(st.look, st.role, color);
        a.fig.clear();
        drawPerson(a.fig, a.look, a.pose, this.P);
        reskinRig(a.rig, a.look);
      }
    }
    this.agentColor = color;
    const t = tierDef(s.office.tier);
    const ent = entrance(s);
    const speedMul = ui.reducedMotion ? 0.5 : ui.speed === 0 ? 0.6 : 1;
    const era = fromDay(s.day).year;
    const doy = dayOfYear(s);
    const hatSeason = this.season?.hat ?? 'none';
    for (const st of Object.values(s.staff)) {
      seen.add(st.id);
      let a = this.agents.get(st.id);
      if (!a) {
        a = this.makeAgent(st, color);
        this.agents.set(st.id, a);
        const [ex, ey] = this.tileCenter(ent.x, ent.y);
        a.x = ex;
        a.y = ey;
        a.mode = 'walk';
        a.next = 'desk';
        if (this.agentsReady) this.say(a, Math.random() < 0.5 ? 'Hi everyone! 👋' : 'First day! 😊', 3);
      }
      const desk = st.deskId ? s.office.items.find((i) => i.id === st.deskId) : undefined;
      const agentFloor = desk ? desk.floor : 0;
      const away = st.activity === 'sick' || st.activity === 'vacation';
      if (away) a.awayWas = st.activity === 'sick' ? 'sick' : 'vacation';
      else if (a.awayWas && agentFloor === floor && this.agentsReady && !ui.reducedMotion) {
        this.say(a, a.awayWas === 'vacation' ? pickOne(['Back from holiday! 🏖️', 'Did I miss anything?', 'Rested and ready!']) : pickOne(['Feeling better now 🤧', 'I’m back!', 'Did someone water my plant?']), 2.6);
        a.anim.wave = 1.4;
        a.awayWas = undefined;
      } else a.awayWas = undefined;
      a.c.visible = agentFloor === floor && !away;
      a.floor = agentFloor;
      if (!a.c.visible) {
        a.path = [];
        a.mode = 'desk';
        continue;
      }
      if (!a.seat || a.deskId !== st.deskId) {
        a.deskId = st.deskId;
        a.seat = this.seatFor(s, st.deskId, floor) ?? this.standingSpot(s, floor, st.id, ent);
        if (a.mode === 'desk') {
          const [sx, sy] = this.tileCenter(a.seat[0], a.seat[1]);
          a.path = this.route(s, floor, a, sx, sy);
          a.mode = 'walk';
          a.next = 'desk';
        }
      }
      a.t += dt * speedMul;
      a.cooldown -= dt * speedMul;
      // Decide trips
      if (a.mode === 'desk' && a.cooldown <= 0 && !ui.reducedMotion) {
        const wantsBreak = st.activity === 'break' || (st.energy < 45 && Math.random() < 0.3);
        const free = st.assignment.kind === 'idle' || st.activity === 'chat' || (st.activity === 'break' && Math.random() < 0.5);
        if (wantsBreak && !(free && Math.random() < 0.5)) {
          const target = this.nearestStation(s, floor, a.seat!);
          if (target) {
            const [tx, ty] = this.tileCenter(target[0], target[1]);
            a.path = this.route(s, floor, a, tx, ty);
            if (a.path.length) {
              a.mode = 'walk';
              a.next = 'station';
            }
          }
          a.cooldown = 8 + Math.random() * 14;
        } else if (free && Math.random() < 0.4 && this.tryChat(s, floor, a, st, 'social')) {
          a.cooldown = 10 + Math.random() * 12;
        } else if (free && Math.random() < 0.55 && this.tryLeisure(s, floor, a, LEISURE)) {
          a.cooldown = 8 + Math.random() * 10;
        } else if (st.activity === 'research' && Math.random() < 0.18 && this.tryLeisure(s, floor, a, null)) {
          a.cooldown = 12 + Math.random() * 14;
        } else if (st.assignment.kind === 'project' && st.activity === 'work' && Math.random() < 0.07 && this.tryChat(s, floor, a, st, 'work')) {
          a.cooldown = 14 + Math.random() * 16;
        } else if (st.assignment.kind === 'project' && st.activity === 'work' && Math.random() < 0.12) {
          // project teams huddle at a meeting table or whiteboard now and then (cosmetic)
          const target = this.nearestStation(s, floor, a.seat!, 'meeting');
          if (target) {
            const [tx, ty] = this.tileCenter(target[0], target[1]);
            a.path = this.route(s, floor, a, tx, ty);
            if (a.path.length) {
              a.mode = 'walk';
              a.next = 'meeting';
            }
          }
          a.cooldown = 10 + Math.random() * 16;
        } else if (st.assignment.kind === 'idle' && Math.random() < 0.5) {
          const rx = Math.floor(Math.random() * t.w);
          const ry = Math.floor(Math.random() * t.h);
          if (!occupancy(s, floor).has(ry * t.w + rx)) {
            const [tx, ty] = this.tileCenter(rx, ry);
            a.path = this.route(s, floor, a, tx, ty);
            if (a.path.length) {
              a.mode = 'walk';
              a.next = 'wander';
            }
          }
          a.cooldown = 6 + Math.random() * 10;
        } else a.cooldown = 4 + Math.random() * 6;
      }
      // Move
      if (a.mode === 'walk') {
        const target = a.path[0];
        if (!target) {
          if (a.next !== 'fun') a.wait = a.next === 'station' ? 3 + Math.random() * 3 : a.next === 'meeting' ? 4 + Math.random() * 4 : a.next === 'wander' ? 1.5 + Math.random() * 2 : 0;
          a.mode = a.next;
          if (a.mode === 'talk' && a.talk) a.talk.timer = 0.2;
        } else {
          const sp = 2.3 * T * dt * speedMul * (st.activity === 'burnout' ? 0.6 : 1);
          const dx = target[0] - a.x;
          const dy = target[1] - a.y;
          const d = Math.hypot(dx, dy);
          if (Math.abs(dx) > 0.5) a.face = dx > 0 ? 1 : -1;
          if (d <= sp) {
            a.x = target[0];
            a.y = target[1];
            a.path.shift();
          } else {
            a.x += (dx / d) * sp;
            a.y += (dy / d) * sp;
          }
        }
      } else if (a.mode === 'talk') {
        this.updateTalk(s, floor, a, dt * speedMul);
      } else if (a.mode === 'station' || a.mode === 'wander' || a.mode === 'meeting' || a.mode === 'fun') {
        a.wait -= dt * speedMul;
        if (a.mode === 'station' && Math.random() < dt * 0.8) this.puff(a.x + 8, a.y - 30, 0xffffff);
        // Water-cooler talk: someone else on a break nearby? Chat where you stand.
        if ((a.mode === 'station' || a.mode === 'fun' || a.mode === 'wander') && !a.talk && Math.random() < dt * 0.25) this.tryChat(s, floor, a, st, 'nearby');
        if (a.wait <= 0 && a.seat) {
          const [sx, sy] = this.tileCenter(a.seat[0], a.seat[1]);
          a.path = this.route(s, floor, a, sx, sy);
          a.mode = 'walk';
          a.next = 'desk';
        }
      } else if (a.mode === 'desk' && a.seat) {
        if (a.talk && !a.talk.host) {
          a.talk.patience -= dt * speedMul;
          if (a.talk.patience <= 0) a.talk = null;
        }
        const [sx, sy] = this.tileCenter(a.seat[0], a.seat[1]);
        a.x += (sx - a.x) * Math.min(1, dt * 8);
        a.y += (sy - 10 - a.y) * Math.min(1, dt * 8);
      }
      // Pose & animation
      const atDesk = a.mode === 'desk';
      const funGlyph = (a as Agent & { funGlyph?: string }).funGlyph;
      const lounging = a.mode === 'fun' && (funGlyph === '😌' || funGlyph === '😴');
      this.setPose(a, atDesk ? (st.activity === 'burnout' ? 'slump' : 'sit') : lounging ? 'sit' : 'stand');
      let bob = 0;
      if (a.mode === 'walk') bob = Math.abs(Math.sin(a.t * 12)) * 2.2;
      else if (atDesk && st.activity !== 'burnout' && st.activity !== 'idle') {
        const typing = st.morale > 40 ? 6 : 3;
        bob = Math.abs(Math.sin(a.t * typing)) * (0.8 + (st.productivityWhy?.total ?? 1) * 0.6);
      }
      if (st.morale > 82 && atDesk && Math.sin(a.t * 1.3) > 0.995) bob += 5;
      const speaking = a.speechT > 0;
      animate(a.rig, a.anim, {
        dt: dt * speedMul,
        t: a.t,
        pose: a.pose,
        mode: a.mode,
        face: a.face,
        bob,
        speaking,
        listening: a.mode === 'talk' && !speaking,
        morale: st.morale,
        energy: st.energy,
        working: atDesk && (st.activity === 'work' || st.activity === 'research'),
        idle: atDesk && st.assignment.kind === 'idle',
        sleepy: st.activity === 'burnout' || (atDesk && st.energy < 12) || (a.mode === 'fun' && funGlyph === '😴'),
        leisure: a.mode === 'station' ? '☕' : a.mode === 'fun' ? funGlyph : atDesk && st.activity === 'training' ? '📖' : undefined,
        era,
        reducedMotion: ui.reducedMotion,
      });
      const standing = a.pose !== 'sit' && a.pose !== 'slump';
      a.legL.visible = a.legR.visible = standing;
      if (standing) {
        const swing = a.mode === 'walk' ? Math.sin(a.t * 12) * 2 : 0;
        a.legL.position.set(0, -bob * 0.3 + Math.max(0, swing));
        a.legR.position.set(0, -bob * 0.3 + Math.max(0, -swing));
      }
      a.c.position.set(a.x, a.y);
      a.c.zIndex = a.y + 1;
      a.rig.root.tint = st.activity === 'burnout' ? 0x9a9a9a : 0xffffff;
      if (a.level && a.level !== st.level && this.agentsReady && !ui.reducedMotion) {
        a.anim.joy = 2;
        this.say(a, pickOne(['Promoted! 🎉', `I’m ${st.level === 'lead' ? 'a lead' : st.level === 'senior' ? 'senior' : 'mid-level'} now!`, 'Level up! ⭐']), 2.6);
        for (const b of [...this.agents.values()].filter((x) => x !== a && x.c.visible && x.floor === a.floor && !x.talk && Math.hypot(x.x - a.x, x.y - a.y) < 140).slice(0, 2)) {
          this.say(b, pickOne(['Congrats! 🎉', 'Well deserved!', 'Go you!', 'Drinks on you!']), 2.2);
          b.anim.wave = 1.2;
        }
      }
      a.level = st.level;
      const star = s.eotm?.id === st.id;
      if (star && !a.medal) {
        a.medal = new Graphics();
        a.medal.poly([-1.6, -4, 1.6, -4, 0.9, -1, -0.9, -1]).fill(0x3d85c6);
        a.medal.circle(0, 0.6, 2.1).fill(0xf2c450);
        a.medal.star(0, 0.6, 5, 1.3, 0.6).fill(0xfff3c4);
        a.rig.root.addChildAt(a.medal, a.rig.root.getChildIndex(a.rig.armL));
      }
      if (a.medal) {
        a.medal.visible = star;
        a.medal.position.set(-3.5, (a.pose === 'stand' ? -14 : -12) - 4);
      }
      const bday = birthdayOf(st.id) === doy;
      setHat(a.rig, bday ? 'party' : hatSeason, bday ? 0xf2c450 : a.look.top);
      a.ring.visible = ui.selectedStaff === st.id || this.hoverStaff === st.id;
      // crunch sweat
      if (atDesk && st.activity === 'work' && s.projects[st.assignment.kind === 'project' ? st.assignment.id : '']?.kind === 'game') {
        const p = s.projects[(st.assignment as { id: string }).id];
        if (p && p.kind === 'game' && p.crunch && Math.random() < dt * 0.6) this.puff(a.x + 7, a.y - 32, 0x7cc4ef, 0.5);
      }
      // bubbles
      a.bubbleT -= dt;
      a.thinkT -= dt * speedMul;
      if (atDesk && st.activity === 'work' && a.thinkT <= 0 && a.bubbleT < -1 && !ui.reducedMotion) {
        const p = st.assignment.kind === 'project' ? s.projects[st.assignment.id] : undefined;
        const buggy = !!p && p.kind === 'game' && p.bugs > (p.design + p.tech) * 0.06;
        const thought = workThought(st, buggy);
        this.showBubble(a, thought);
        a.bubbleT = 1.8;
        if (thought === '🐛') {
          if (Math.random() < 0.5) a.anim.scratch = 1.4;
          else a.anim.palm = 1.3;
        } else if (thought === '💡') a.anim.idea = 1.2;
        a.thinkT = 10 + Math.random() * 25;
      }
      a.speechT -= dt;
      if (a.speech) {
        a.speech.visible = a.speechT > 0;
        a.speech.position.set(0, -58 - (a.mode === 'desk' ? 0 : 4));
      }
      if ((st.activity === 'chat' && a.bubbleT < -2 && Math.random() < dt * 2) || ((a.mode === 'station' || a.mode === 'meeting') && a.bubbleT < -4 && Math.random() < dt * 1.5)) {
        this.showBubble(a, a.mode === 'station' ? '☕' : a.mode === 'meeting' ? (Math.random() < 0.5 ? '💡' : '📋') : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!);
      }
      if (a.mode === 'fun' && a.bubbleT < 0.5) {
        const g = (a as Agent & { funGlyph?: string }).funGlyph;
        if (g) {
          this.showBubble(a, g);
          a.bubbleT = Math.max(1, a.wait);
        }
      }
      if (a.bubble) {
        a.bubble.visible = a.bubbleT > 0;
        a.bubble.position.set(10, -44 - (1 - Math.max(0, a.bubbleT) / 2) * 4);
      }
      // activity icon
      const iconText = st.activity === 'research' ? '⚗' : st.activity === 'training' ? '📘' : st.activity === 'burnout' ? '☁' : st.assignment.kind === 'idle' && atDesk ? '💤' : '';
      if (iconText) {
        if (!a.icon) {
          a.icon = new Text({ text: iconText, style: { fontSize: 13 } });
          a.icon.anchor.set(0.5);
          a.c.addChild(a.icon);
        }
        a.icon.text = iconText;
        a.icon.visible = true;
        a.icon.position.set(-10, -44 + Math.sin(a.t * 2) * 1.5);
      } else if (a.icon) a.icon.visible = false;
      // hover label
      if (this.hoverStaff === st.id) {
        if (!a.label) {
          a.label = new Text({ text: st.name, style: { fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: '600', align: 'center', fill: this.P.night ? 0xf1ede6 : 0x2a2622, stroke: { color: this.P.night ? 0x15130f : 0xffffff, width: 3 } } });
          a.label.anchor.set(0.5, 1);
          a.c.addChild(a.label);
        }
        a.label.text = `${st.name}${birthdayOf(st.id) === doy ? ' 🎂' : ''}\n${this.doing(s, a, st)}`;
        a.label.visible = true;
        a.label.position.set(0, a.speechT > 0 ? -72 : -50);
      } else if (a.label) a.label.visible = false;
    }
    for (const [id, a] of this.agents) {
      if (!seen.has(id)) {
        // they've left the studio: a farewell walk to the door (if we could see them)
        if (a.c.visible && this.agentsReady && !ui.reducedMotion) this.visitors.farewell(s, floor, { x: a.x, y: a.y }, a.look, this.P, this.visitorHost(s, floor));
        a.c.destroy({ children: true });
        this.agents.delete(id);
      }
    }
    for (const a of this.agents.values()) if (a.talk && !this.agents.get(a.talk.partner)?.c.visible) this.endTalk(s, floor, a);
    this.agentsReady = true;
    this.dailyMoments(s, floor, doy, ui.reducedMotion);
    this.lunchT -= dt * speedMul;
    if (this.lunchT <= 0 && !ui.reducedMotion) {
      this.lunchT = 45 + Math.random() * 60;
      this.lunchRun(s, floor);
    }
  }

  // ── Office life: conversations and leisure (cosmetic) ──────────────────────

  /** Once a day: birthday wishes; on New Year's Day, a party. */
  private dailyMoments(s: GameState, floor: number, doy: number, reducedMotion: boolean): void {
    if (s.day === this.lastDay) return;
    const firstFrame = this.lastDay < 0;
    this.lastDay = s.day;
    this.bdayGreeted.clear();
    const here = [...this.agents.values()].filter((a) => a.c.visible && a.floor === floor);
    if (!here.length) return;
    if (!firstFrame && this.season?.newYear && this.season.dom === 1) {
      this.celebrate(!reducedMotion);
      for (const a of here.slice(0, 6)) this.say(a, pickOne(['Happy New Year! 🎆', `Here’s to ${fromDay(s.day).year}!`, 'New year, new games!', 'Cheers! 🥂']), 3);
      return;
    }
    for (const a of here) {
      const st = s.staff[a.id];
      if (!st || birthdayOf(st.id) !== doy) continue;
      const key = `${st.id}|${s.day}`;
      if (this.bdayGreeted.has(key)) continue;
      this.bdayGreeted.add(key);
      this.showBubble(a, '🎂');
      a.bubbleT = 3;
      a.anim.joy = 1.4;
      const friends = here.filter((b) => b !== a && !b.talk).sort((x, y) => Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y)).slice(0, 3);
      for (const b of friends) {
        this.say(b, pickOne([`Happy birthday, ${firstName(st.name)}! 🎂`, 'Happy birthday! 🎉', `Cake for ${firstName(st.name)}!`]), 2.6);
        b.anim.wave = 1.4;
      }
    }
  }

  /** Who visitors can call on (people at work on this floor), and how staff answer them. */
  private visitorHost(s: GameState, floor: number) {
    return {
      people: () => {
        const out: { id: string; name: string; x: number; y: number; role: string; level: string; project?: string; crunching: boolean }[] = [];
        for (const a of this.agents.values()) {
          if (!a.c.visible || a.floor !== floor || a.mode !== 'desk' || a.talk) continue;
          const st = s.staff[a.id];
          if (!st) continue;
          const p = st.assignment.kind === 'project' ? s.projects[st.assignment.id] : undefined;
          out.push({ id: a.id, name: st.name, x: a.x, y: a.y, role: st.role, level: st.level, project: p?.id, crunching: !!p && p.kind === 'game' && p.crunch });
        }
        return out;
      },
      reply: (id: string, text: string, gesture?: 'wave' | 'laugh' | 'joy') => {
        const a = this.agents.get(id);
        if (!a) return;
        this.say(a, text, 2.4);
        if (gesture) a.anim[gesture] = Math.max(a.anim[gesture], 1.3);
      },
    };
  }

  /** What the pets can see of the office. */
  private petHost(s: GameState, floor: number) {
    return {
      people: () => {
        const out: { id: string; x: number; y: number; mode: string; desk?: [number, number]; working: boolean }[] = [];
        const byId = new Map(s.office.items.map((i) => [i.id, i]));
        for (const a of this.agents.values()) {
          if (!a.c.visible || a.floor !== floor) continue;
          const st = s.staff[a.id];
          const d = a.mode === 'desk' && a.deskId ? byId.get(a.deskId) : undefined;
          const desk: [number, number] | undefined = d ? [d.x * T + T / 2, d.y * T + T * 0.72] : undefined;
          out.push({ id: a.id, x: a.x, y: a.y, mode: a.mode, desk, working: !!st && st.activity === 'work' });
        }
        return out;
      },
      react: (id: string, text: string, gesture: 'laugh' | 'palm' | 'wave') => {
        const a = this.agents.get(id);
        if (!a || a.speechT > 0 || a.talk) return;
        this.say(a, text, 2.2);
        a.anim[gesture] = Math.max(a.anim[gesture], 1.2);
      },
    };
  }

  /** What someone is up to, for the hover label. */
  private doing(s: GameState, a: Agent, st: Staff): string {
    const partner = a.talk ? s.staff[a.talk.partner] : undefined;
    if (partner && (a.mode === 'talk' || (a.mode === 'walk' && a.next === 'talk'))) return `chatting with ${firstName(partner.name)}`;
    if (a.mode === 'fun' || (a.mode === 'walk' && a.next === 'fun')) return st.activity === 'research' ? 'thinking at the whiteboard' : 'taking a break';
    if (a.mode === 'station' || (a.mode === 'walk' && a.next === 'station')) return 'grabbing a coffee';
    if (a.mode === 'meeting' || (a.mode === 'walk' && a.next === 'meeting')) return 'in a team huddle';
    if (a.mode === 'wander') return 'stretching their legs';
    if (st.activity === 'burnout') return 'burnt out';
    if (st.activity === 'research') return 'researching';
    if (st.activity === 'training') return 'in training';
    if (st.assignment.kind === 'project') {
      const p = s.projects[st.assignment.id];
      if (p) return `working on ${p.kind === 'game' ? p.concept.name : p.kind === 'contract' ? 'a contract' : p.name}`;
    }
    return st.assignment.kind === 'idle' ? 'idle — no assignment' : 'working';
  }

  /** Every so often, a few free people head to the kitchen (or coffee) together. */
  private lunchRun(s: GameState, floor: number): void {
    const free = [...this.agents.values()].filter((a) => {
      const st = s.staff[a.id];
      return st && a.c.visible && a.floor === floor && a.mode === 'desk' && !a.talk && (st.assignment.kind === 'idle' || st.activity === 'break' || st.activity === 'chat');
    });
    if (free.length < 2) return;
    const host = free[Math.floor(Math.random() * free.length)]!;
    const spot = this.nearestStation(s, floor, host.seat ?? [0, 0]);
    if (!spot) return;
    const group = free.sort((x, y) => Math.hypot(x.x - host.x, x.y - host.y) - Math.hypot(y.x - host.x, y.y - host.y)).slice(0, 2 + Math.floor(Math.random() * 3));
    this.say(host, pickOne(['Lunch, anyone?', 'Food run!', 'Coffee break?', 'Pizza time!']), 2.4);
    const t = tierDef(s.office.tier);
    const occ = occupancy(s, floor);
    group.forEach((a, i) => {
      const x = Math.max(0, Math.min(t.w - 1, spot[0] + (i % 3) - 1));
      const y = Math.max(0, Math.min(t.h - 1, spot[1] + Math.floor(i / 3)));
      const [tx, ty] = occ.has(y * t.w + x) ? this.tileCenter(spot[0], spot[1]) : this.tileCenter(x, y);
      const path = this.route(s, floor, a, tx, ty);
      if (!path.length) return;
      a.path = path;
      a.mode = 'walk';
      a.next = 'station';
      a.cooldown = 20;
    });
  }

  /** Somewhere for a deskless person to stand (spread out near the entrance, stable per person) instead of all on one tile. */
  private standingSpot(s: GameState, floor: number, id: string, ent: { x: number; y: number }): [number, number] {
    const t = tierDef(s.office.tier);
    const occ = occupancy(s, floor);
    const spots: [number, number][] = [];
    for (let r = 1; r <= 6 && spots.length < 24; r++)
      for (let dx = -r; dx <= r; dx++) {
        const x = ent.x + dx;
        const y = ent.y - r;
        if (x >= 0 && y >= 0 && x < t.w && y < t.h && !occ.has(y * t.w + x)) spots.push([x, y]);
      }
    if (!spots.length) return [ent.x, Math.max(0, ent.y - 1)];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return spots[h % spots.length]!;
  }

  private goDesk(s: GameState, floor: number, a: Agent): void {
    if (!a.seat) return;
    const [sx, sy] = this.tileCenter(a.seat[0], a.seat[1]);
    a.path = this.route(s, floor, a, sx, sy);
    a.mode = 'walk';
    a.next = 'desk';
  }

  private endTalk(s: GameState, floor: number, a: Agent): void {
    const partner = a.talk ? this.agents.get(a.talk.partner) : undefined;
    a.talk = null;
    if (a.mode === 'talk') this.goDesk(s, floor, a);
    if (partner?.talk && partner.talk.partner === a.id) {
      partner.talk = null;
      if (partner.mode === 'talk') this.goDesk(s, floor, partner);
    }
  }

  /** Start a conversation. social: walk over to someone free; work: visit a teammate's desk; nearby: chat where you stand. */
  private tryChat(s: GameState, floor: number, a: Agent, st: Staff, kind: 'social' | 'work' | 'nearby'): boolean {
    if (a.talk) return false;
    const talking = [...this.agents.values()].filter((x) => x.talk?.host).length;
    if (talking >= Math.max(3, Math.min(14, this.agents.size / 12))) return false;
    const range = kind === 'nearby' ? 2.6 * T : 11 * T;
    let best: { b: Agent; bst: Staff; d: number } | null = null;
    for (const b of this.agents.values()) {
      if (b === a || b.talk || !b.c.visible || b.floor !== floor) continue;
      const bst = s.staff[b.id];
      if (!bst) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > range) continue;
      if (kind === 'work') {
        const sameProject = st.assignment.kind === 'project' && bst.assignment.kind === 'project' && bst.assignment.id === st.assignment.id;
        if (!sameProject || b.mode !== 'desk') continue;
      } else {
        const free = bst.assignment.kind === 'idle' || bst.activity === 'break' || bst.activity === 'chat' || b.mode === 'wander' || b.mode === 'station' || b.mode === 'fun';
        if (!free || b.mode === 'walk' || b.mode === 'meeting') continue;
      }
      const real = s.relations?.[a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`] ?? 0;
      if (real <= -25) continue; // they avoid each other
      const friends = Math.max(this.affinity.get(a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`) ?? 0, real / 15);
      const score = (d * (0.6 + Math.random() * 0.8)) / (1 + Math.min(4, friends) * 0.6);
      if (!best || score < best.d) best = { b, bst, d: score };
    }
    if (!best) return false;
    const { b, bst } = best;
    const [l1, r1] = kind === 'work' ? workExchange(st, bst) : chatExchange(s, st, bst);
    const lines = [l1, r1];
    if (kind !== 'work' && Math.random() < 0.6) {
      const [l2, r2] = chatExchange(s, bst, st);
      lines.push(l2, r2);
    }
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const friends = this.affinity.get(key) ?? 0;
    this.affinity.set(key, friends + 1);
    if (friends >= 3 && kind !== 'work' && Math.random() < 0.4) lines[0] = pickOne([`${firstName(bst.name)}! My favourite.`, 'Hey, you!', 'There you are!', 'Coffee buddy!']);
    a.talk = { partner: b.id, lines, i: 0, timer: 0.3, host: true, patience: 30 };
    b.talk = { partner: a.id, lines, i: 0, timer: 0, host: false, patience: 25 };
    if (kind === 'nearby') {
      a.mode = 'talk';
      a.path = [];
      if (b.mode !== 'desk') {
        b.mode = 'talk';
        b.path = [];
      }
      return true;
    }
    // walk to a free tile beside them
    const t = tierDef(s.office.tier);
    const occ = occupancy(s, floor);
    const bx = Math.floor(b.x / T);
    const by = Math.floor((b.y + 6) / T);
    const spots: [number, number][] = [[bx - 1, by], [bx + 1, by], [bx, by + 1], [bx, by - 1], [bx - 1, by + 1], [bx + 1, by + 1]];
    for (const [x, y] of spots) {
      if (x < 0 || y < 0 || x >= t.w || y >= t.h || occ.has(y * t.w + x)) continue;
      const [tx, ty] = this.tileCenter(x, y);
      const path = this.route(s, floor, a, tx, ty);
      if (!path.length) continue;
      a.path = path;
      a.mode = 'walk';
      a.next = 'talk';
      if (b.mode !== 'desk') {
        b.mode = 'talk';
        b.path = [];
      }
      return true;
    }
    a.talk = null;
    b.talk = null;
    return false;
  }

  private updateTalk(s: GameState, floor: number, a: Agent, dt: number): void {
    const tk = a.talk;
    const partner = tk ? this.agents.get(tk.partner) : undefined;
    if (!tk || !partner) {
      this.endTalk(s, floor, a);
      return;
    }
    a.face = partner.x >= a.x ? 1 : -1;
    if (partner.mode === 'talk') partner.face = a.x >= partner.x ? 1 : -1;
    if (!tk.host) {
      // waiting for the host to walk over
      tk.patience -= dt;
      if (tk.patience <= 0) this.endTalk(s, floor, a);
      return;
    }
    tk.timer -= dt;
    if (tk.timer > 0) return;
    if (tk.i >= tk.lines.length) {
      const key = a.id < partner.id ? `${a.id}|${partner.id}` : `${partner.id}|${a.id}`;
      if (!tk.fived && (this.affinity.get(key) ?? 0) >= 2 && Math.random() < 0.6) {
        tk.fived = true;
        a.anim.highfive = partner.anim.highfive = 0.8;
        tk.timer = 0.85;
        return;
      }
      this.endTalk(s, floor, a);
      return;
    }
    const speaker = tk.i % 2 === 0 ? a : partner;
    this.say(speaker, tk.lines[tk.i]!, 2.1);
    tk.i += 1;
    tk.timer = 2.2;
  }

  /** Go and do something on a break (arcade, sofa, bookshelf…) or, with spots=null, think at a research spot. */
  private tryLeisure(s: GameState, floor: number, a: Agent, spots: typeof LEISURE | null): boolean {
    const t = tierDef(s.office.tier);
    const occ = occupancy(s, floor);
    const options = s.office.items.filter((it) => it.floor === floor && (spots ? spots[it.item] : RESEARCH_SPOTS.has(it.item)));
    if (!options.length) return false;
    const it = options[Math.floor(Math.random() * options.length)]!;
    const fp = footprint(it);
    const free: [number, number][] = [];
    for (let dy = -1; dy <= fp.h; dy++)
      for (let dx = -1; dx <= fp.w; dx++) {
        const x = it.x + dx;
        const y = it.y + dy;
        if (x >= 0 && y >= 0 && x < t.w && y < t.h && !occ.has(y * t.w + x)) free.push([x, y]);
      }
    if (!free.length) return false;
    const [x, y] = free[Math.floor(Math.random() * free.length)]!;
    const [tx, ty] = this.tileCenter(x, y);
    const path = this.route(s, floor, a, tx, ty);
    if (!path.length) return false;
    const spec = spots?.[it.item];
    a.path = path;
    a.mode = 'walk';
    a.next = 'fun';
    a.wait = spec ? spec.secs[0] + Math.random() * (spec.secs[1] - spec.secs[0]) : 4 + Math.random() * 4;
    const glyph = spec ? spec.glyph : Math.random() < 0.5 ? '🧠' : '⚗';
    this.showBubble(a, glyph);
    a.bubbleT = -0.5; // shown on arrival
    (a as Agent & { funGlyph?: string }).funGlyph = glyph;
    return true;
  }

  /** A speech bubble with words (sized to the text). */
  private say(a: Agent, text: string, secs: number): void {
    const w = Math.min(170, Math.max(34, 10 + text.length * 5.4));
    if (!a.speech) {
      const c = new Container();
      c.addChild(new Graphics(), new Text({ text: '', style: { fontFamily: 'Inter, sans-serif', fontSize: 9.5, fontWeight: '600', fill: 0x2a2622 } }));
      a.c.addChild(c);
      a.speech = c;
    }
    const bg = a.speech.children[0] as Graphics;
    const tx = a.speech.children[1] as Text;
    bg.clear();
    bg.roundRect(-w / 2, -11, w, 20, 8).fill({ color: 0xffffff, alpha: 0.97 });
    bg.roundRect(-w / 2, -11, w, 20, 8).stroke({ width: 1, color: 0x2a2622, alpha: 0.12 });
    bg.poly([-3, 9, 4, 9, -1, 15]).fill({ color: 0xffffff, alpha: 0.97 });
    tx.text = text;
    tx.anchor.set(0.5);
    tx.position.set(0, -1);
    a.speechT = secs;
    a.speech.visible = true;
    if (/\b(Hi|Hey|Morning|Bye)\b|👋/.test(text)) a.anim.wave = 1.6;
    else if (/\bHa\b|😄|Right\?!|My favourite/.test(text)) a.anim.laugh = 1.3;
  }

  private route(s: GameState, floor: number, a: Agent, wx: number, wy: number): [number, number][] {
    const from: [number, number] = [Math.max(0, Math.floor(a.x / T)), Math.max(0, Math.floor((a.y + 6) / T))];
    const to: [number, number] = [Math.floor(wx / T), Math.floor(wy / T)];
    const t = tierDef(s.office.tier);
    from[0] = Math.min(t.w - 1, from[0]);
    from[1] = Math.min(t.h - 1, from[1]);
    const p = findPath(s, floor, from, to);
    if (!p || p.length === 0) return [[wx, wy]];
    return p.slice(1).map(([x, y]) => this.tileCenter(x, y));
  }

  private nearestStation(s: GameState, floor: number, seat: [number, number], kind: 'energy' | 'meeting' = 'energy'): [number, number] | null {
    const t = tierDef(s.office.tier);
    const occ = occupancy(s, floor);
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const it of s.office.items) {
      const def = ITEM_BY_ID[it.item];
      if (it.floor !== floor || (kind === 'energy' ? !def.energy : def.effect !== 'meeting')) continue;
      const fp = footprint(it);
      for (let dy = -1; dy <= fp.h; dy++)
        for (let dx = -1; dx <= fp.w; dx++) {
          const x = it.x + dx;
          const y = it.y + dy;
          if (x < 0 || y < 0 || x >= t.w || y >= t.h || occ.has(y * t.w + x)) continue;
          const d = Math.abs(x - seat[0]) + Math.abs(y - seat[1]);
          if (d < bd) {
            bd = d;
            best = [x, y];
          }
        }
    }
    return best;
  }

  private showBubble(a: Agent, glyph: string): void {
    if (!a.bubble) {
      const c = new Container();
      const bg = new Graphics();
      bg.roundRect(-11, -11, 22, 20, 8).fill({ color: 0xffffff, alpha: 0.95 });
      bg.poly([-4, 8, 2, 8, -6, 14]).fill({ color: 0xffffff, alpha: 0.95 });
      const tx = new Text({ text: glyph, style: { fontSize: 12, fill: 0x2a2622 } });
      tx.anchor.set(0.5);
      c.addChild(bg, tx);
      a.c.addChild(c);
      a.bubble = c;
    } else {
      const tx = a.bubble.children[1] as Text;
      tx.text = glyph;
    }
    a.bubbleT = 2;
  }

  private puff(x: number, y: number, color: number, scale = 1): void {
    if (this.particles.length > 120) return;
    const g = new Graphics();
    g.circle(0, 0, 2.6 * scale).fill({ color, alpha: 0.8 });
    g.position.set(x, y);
    this.fxLayer.addChild(g);
    this.particles.push({ g, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 10, life: 1.2 });
  }

  /** The whole office celebrates: party bubbles over everyone and (unless motion is reduced) confetti. */
  celebrate(confetti = true): void {
    const agents = [...this.agents.values()].filter((a) => a.c.visible).slice(0, 80);
    const GLYPHS_PARTY = ['🎉', '🥳', '🙌', '⭐'];
    for (const a of agents) {
      this.showBubble(a, GLYPHS_PARTY[Math.floor(Math.random() * GLYPHS_PARTY.length)]!);
      a.bubbleT = 2.5 + Math.random();
      a.anim.joy = 1.8 + Math.random() * 1.4;
    }
    if (!confetti) return;
    const COLORS = [0xe07a5f, 0xf2c450, 0x5f9e6e, 0x3d85c6, 0x9b6bd3];
    for (let i = 0; i < Math.min(60, agents.length * 3); i++) {
      if (this.particles.length > 160) break;
      const a = agents[Math.floor(Math.random() * agents.length)];
      if (!a) break;
      const g = new Graphics();
      g.rect(-2, -1, 4, 2.5).fill(COLORS[i % COLORS.length]!);
      g.rotation = Math.random() * Math.PI;
      g.position.set(a.x + (Math.random() - 0.5) * 20, a.y - 40);
      this.fxLayer.addChild(g);
      this.particles.push({ g, vx: (Math.random() - 0.5) * 60, vy: -70 - Math.random() * 50, life: 1.6 });
    }
  }

  /** A flop: the team sighs. */
  sulk(): void {
    const GLYPHS_SAD = ['😞', '😩', '💧', '🙃'];
    for (const a of [...this.agents.values()].filter((x) => x.c.visible).slice(0, 80)) {
      if (Math.random() < 0.6) {
        this.showBubble(a, GLYPHS_SAD[Math.floor(Math.random() * GLYPHS_SAD.length)]!);
        a.bubbleT = 2 + Math.random();
        a.anim.sad = 2.5 + Math.random() * 2;
      }
    }
  }

  /** What the office sounds like right now (for the ambience engine). */
  ambienceStats(): { working: number; chatting: number; onBreak: number; cats: number; dogs: number } {
    const s = this.cb.getState();
    let working = 0;
    let chatting = 0;
    let onBreak = 0;
    for (const a of this.agents.values()) {
      if (!a.c.visible) continue;
      if (a.mode === 'talk' || a.speechT > 0) chatting++;
      else if (a.mode === 'station' || a.mode === 'fun') onBreak++;
      else if (a.mode === 'desk') {
        const act = s?.staff[a.id]?.activity;
        if (act === 'work' || act === 'research') working++;
      }
    }
    return { working, chatting, onBreak, ...this.pets.counts() };
  }

  /** A captioned PNG of the current floor (photo mode). Hover rings and labels are hidden for the shot. */
  async snapshot(caption: string, sub: string): Promise<Blob | null> {
    if (!this.ready) return null;
    const hidden: Container[] = [];
    for (const a of this.agents.values())
      for (const c of [a.ring, a.label]) if (c?.visible) {
        c.visible = false;
        hidden.push(c);
      }
    if (this.ghost?.visible) {
      this.ghost.visible = false;
      hidden.push(this.ghost);
    }
    this.pets.hover(null, null, this.P.night);
    try {
      const b = this.world.getLocalBounds();
      const res = Math.max(0.5, Math.min(2, 4096 / Math.max(b.width, b.height)));
      const shot = this.app.renderer.extract.canvas({ target: this.world, resolution: res, clearColor: this.P.bg }) as HTMLCanvasElement;
      const bar = Math.round(70 * res);
      const pad = Math.round(28 * res);
      const out = document.createElement('canvas');
      out.width = shot.width + pad * 2;
      out.height = shot.height + pad * 2 + bar;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
      ctx.fillStyle = hex(this.P.bg);
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(shot, pad, pad);
      ctx.fillStyle = this.P.night ? '#f1ede6' : '#2a2622';
      ctx.font = `600 ${Math.round(26 * res)}px "Space Grotesk", Inter, sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(caption, pad, shot.height + pad + bar * 0.55);
      ctx.globalAlpha = 0.6;
      ctx.font = `500 ${Math.round(15 * res)}px Inter, sans-serif`;
      ctx.fillText(sub, pad, shot.height + pad + bar * 0.9);
      return await new Promise((res2) => out.toBlob(res2, 'image/png'));
    } finally {
      for (const c of hidden) c.visible = true;
    }
  }

  /** Coin burst at a world position (sales pops). */
  burst(count = 8): void {
    const s = this.cb.getState();
    if (!s) return;
    const desks = [...this.agents.values()].filter((a) => a.c.visible);
    for (let i = 0; i < Math.min(count, 14); i++) {
      const a = desks[Math.floor(Math.random() * desks.length)];
      if (!a) return;
      const g = new Graphics();
      g.circle(0, 0, 4).fill(0xf2c450);
      g.circle(-1, -1, 1.6).fill({ color: 0xffffff, alpha: 0.7 });
      g.position.set(a.x, a.y - 30);
      this.fxLayer.addChild(g);
      this.particles.push({ g, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 40, life: 1 });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.vy += 30 * dt;
      p.g.alpha = Math.max(0, p.life);
      if (p.life <= 0) {
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }
}
