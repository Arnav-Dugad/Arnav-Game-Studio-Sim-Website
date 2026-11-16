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
}

type Mode = 'desk' | 'walk' | 'station' | 'away' | 'wander';

interface Agent {
  id: string;
  c: Container;
  fig: Graphics;
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
}

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
  private drag: { x: number; y: number; camX: number; camY: number; moved: boolean; button: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; zoom: number } | null = null;
  private keys = new Set<string>();
  private fitted = '';
  private inset = 0;
  private insetTarget = 0;
  private particles: { g: Graphics; vx: number; vy: number; life: number }[] = [];
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
    this.drag = { x: e.offsetX, y: e.offsetY, camX: this.cam.x, camY: this.cam.y, moved: false, button: e.button };
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
    this.app.canvas.style.cursor = this.cb.getUI().build ? 'crosshair' : this.hoverStaff ? 'pointer' : this.drag?.moved ? 'grabbing' : 'grab';
    if (this.drag) {
      const dx = e.offsetX - this.drag.x;
      const dy = e.offsetY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
      const panButton = this.drag.button === 1 || this.drag.button === 2 || !this.cb.getUI().build?.item;
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
    this.world.scale.set(this.zoom);
    this.world.position.set(this.cam.x, this.cam.y);

    const era = fromDay(s.day).year;
    const eraBucket = era < 2003 ? 'crt' : 'lcd';
    const sKey = `${s.office.tier}|${floor}|${this.P.night}`;
    if (sKey !== this.staticKey) {
      this.staticKey = sKey;
      this.drawStatic(s, floor);
    }
    const iKey = `${s.office.rev ?? 0}|${s.office.tier}|${floor}|${eraBucket}|${this.P.night}|${s.office.items.length}`;
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
    this.syncAgents(s, floor, ui, dt);
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
    const f1 = garage ? mix(P.floorWood, 0x9a9a9a, 0.45) : t.tier >= 3 && floor % 2 === 1 ? P.floorCarpet : P.floorWood;
    const f2 = garage ? mix(P.floorWood2, 0x9a9a9a, 0.45) : t.tier >= 3 && floor % 2 === 1 ? P.floorCarpet2 : P.floorWood2;
    // outer shadow
    g.roundRect(-14, -1.4 * T, W + 28, H + 1.4 * T + 18, 18).fill({ color: 0x000000, alpha: 0.12 });
    // floor
    g.roundRect(-6, -6, W + 12, H + 12, 10).fill(shade(f1, 0.85));
    for (let y = 0; y < t.h; y++)
      for (let x = 0; x < t.w; x++) {
        const c = garage ? ((x + y) % 2 ? f1 : f2) : x % 2 === 0 ? f1 : f2;
        g.rect(x * T, y * T, T, T).fill(c);
        if (!garage) g.rect(x * T, y * T + T - 1, T, 1).fill({ color: 0x000000, alpha: 0.04 });
      }
    // back wall
    g.roundRect(-8, -1.35 * T, W + 16, 1.35 * T, 8).fill(P.wall);
    g.rect(-8, -1.35 * T, W + 16, 8).fill(P.wallTop);
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

  private texFor(id: ItemId, rot: 0 | 1, era: number): { tex: Texture; ox: number; oy: number } {
    const def = ITEM_BY_ID[id];
    const w = rot ? def.h : def.w;
    const h = rot ? def.w : def.h;
    const key = `${id}|${rot}|${era < 2003 ? 'crt' : 'lcd'}|${this.P.night}`;
    const lift = itemLift(id) + 12;
    let tex = this.textures.get(key);
    if (!tex) {
      const g = new Graphics();
      // pad region so generateTexture includes lift and overhangs
      g.rect(-6, -lift, w * T + 12, h * T + lift + 10).fill({ color: 0x000000, alpha: 0.001 });
      drawItem(g, id, w, h, { era, P: this.P });
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
    c.addChild(ring, legL, legR, fig);
    this.itemLayer.addChild(c);
    return { id: st.id, c, fig, look, pose: 'sit', x: 0, y: 0, path: [], mode: 'desk', next: 'desk', wait: 0, cooldown: 3 + Math.random() * 8, bubble: null, bubbleT: 0, icon: null, t: Math.random() * 10, floor: 0, sweat: 0, label: null, ring, legL, legR };
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
    const t = tierDef(s.office.tier);
    const ent = entrance(s);
    const speedMul = ui.reducedMotion ? 0.5 : ui.speed === 0 ? 0.6 : 1;
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
      }
      const desk = st.deskId ? s.office.items.find((i) => i.id === st.deskId) : undefined;
      const agentFloor = desk ? desk.floor : 0;
      const away = st.activity === 'sick' || st.activity === 'vacation';
      a.c.visible = agentFloor === floor && !away;
      a.floor = agentFloor;
      if (!a.c.visible) {
        a.path = [];
        a.mode = 'desk';
        continue;
      }
      if (!a.seat || a.deskId !== st.deskId) {
        a.deskId = st.deskId;
        a.seat = this.seatFor(s, st.deskId, floor) ?? [ent.x, Math.max(0, ent.y - 1)];
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
        if (wantsBreak) {
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
          a.mode = a.next;
          a.wait = a.next === 'station' ? 3 + Math.random() * 3 : a.next === 'wander' ? 1.5 + Math.random() * 2 : 0;
        } else {
          const sp = 2.3 * T * dt * speedMul * (st.activity === 'burnout' ? 0.6 : 1);
          const dx = target[0] - a.x;
          const dy = target[1] - a.y;
          const d = Math.hypot(dx, dy);
          if (d <= sp) {
            a.x = target[0];
            a.y = target[1];
            a.path.shift();
          } else {
            a.x += (dx / d) * sp;
            a.y += (dy / d) * sp;
          }
        }
      } else if (a.mode === 'station' || a.mode === 'wander') {
        a.wait -= dt * speedMul;
        if (a.mode === 'station' && Math.random() < dt * 0.8) this.puff(a.x + 8, a.y - 30, 0xffffff);
        if (a.wait <= 0 && a.seat) {
          const [sx, sy] = this.tileCenter(a.seat[0], a.seat[1]);
          a.path = this.route(s, floor, a, sx, sy);
          a.mode = 'walk';
          a.next = 'desk';
        }
      } else if (a.mode === 'desk' && a.seat) {
        const [sx, sy] = this.tileCenter(a.seat[0], a.seat[1]);
        a.x += (sx - a.x) * Math.min(1, dt * 8);
        a.y += (sy - 10 - a.y) * Math.min(1, dt * 8);
      }
      // Pose & animation
      const atDesk = a.mode === 'desk';
      this.setPose(a, atDesk ? (st.activity === 'burnout' ? 'slump' : 'sit') : 'stand');
      let bob = 0;
      if (a.mode === 'walk') bob = Math.abs(Math.sin(a.t * 12)) * 2.2;
      else if (atDesk && st.activity !== 'burnout' && st.activity !== 'idle') {
        const typing = st.morale > 40 ? 6 : 3;
        bob = Math.abs(Math.sin(a.t * typing)) * (0.8 + (st.productivityWhy?.total ?? 1) * 0.6);
      }
      if (st.morale > 82 && atDesk && Math.sin(a.t * 1.3) > 0.995) bob += 5;
      a.fig.position.set(0, -bob);
      const standing = a.pose !== 'sit' && a.pose !== 'slump';
      a.legL.visible = a.legR.visible = standing;
      if (standing) {
        const swing = a.mode === 'walk' ? Math.sin(a.t * 12) * 2 : 0;
        a.legL.position.set(0, -bob * 0.3 + Math.max(0, swing));
        a.legR.position.set(0, -bob * 0.3 + Math.max(0, -swing));
      }
      a.c.position.set(a.x, a.y);
      a.c.zIndex = a.y + 1;
      a.fig.tint = st.activity === 'burnout' ? 0x9a9a9a : 0xffffff;
      a.ring.visible = ui.selectedStaff === st.id || this.hoverStaff === st.id;
      // crunch sweat
      if (atDesk && st.activity === 'work' && s.projects[st.assignment.kind === 'project' ? st.assignment.id : '']?.kind === 'game') {
        const p = s.projects[(st.assignment as { id: string }).id];
        if (p && p.kind === 'game' && p.crunch && Math.random() < dt * 0.6) this.puff(a.x + 7, a.y - 32, 0x7cc4ef, 0.5);
      }
      // bubbles
      a.bubbleT -= dt;
      if ((st.activity === 'chat' && a.bubbleT < -2 && Math.random() < dt * 2) || (a.mode === 'station' && a.bubbleT < -4 && Math.random() < dt)) {
        this.showBubble(a, a.mode === 'station' ? '☕' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!);
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
          a.label = new Text({ text: st.name, style: { fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: '600', fill: this.P.night ? 0xf1ede6 : 0x2a2622, stroke: { color: this.P.night ? 0x15130f : 0xffffff, width: 3 } } });
          a.label.anchor.set(0.5, 1);
          a.c.addChild(a.label);
        }
        a.label.visible = true;
        a.label.position.set(0, -50);
      } else if (a.label) a.label.visible = false;
    }
    for (const [id, a] of this.agents) {
      if (!seen.has(id)) {
        a.c.destroy({ children: true });
        this.agents.delete(id);
      }
    }
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

  private nearestStation(s: GameState, floor: number, seat: [number, number]): [number, number] | null {
    const t = tierDef(s.office.tier);
    const occ = occupancy(s, floor);
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const it of s.office.items) {
      if (it.floor !== floor || !ITEM_BY_ID[it.item].energy) continue;
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
