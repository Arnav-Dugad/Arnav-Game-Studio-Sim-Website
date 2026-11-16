/**
 * Explainable numbers. A Breakdown records how a value was built so the UI can answer "why?".
 */
export interface BreakdownPart {
  label: string;
  value: number;
  kind: 'base' | 'add' | 'mul';
}

export interface Breakdown {
  total: number;
  parts: BreakdownPart[];
}

export class BD {
  parts: BreakdownPart[] = [];
  value: number;
  constructor(label: string, base: number) {
    this.value = base;
    this.parts.push({ label, value: base, kind: 'base' });
  }
  add(label: string, v: number): this {
    if (!Number.isFinite(v) || v === 0) return this;
    this.value += v;
    this.parts.push({ label, value: v, kind: 'add' });
    return this;
  }
  mul(label: string, m: number): this {
    if (!Number.isFinite(m) || Math.abs(m - 1) < 1e-4) return this;
    this.value *= m;
    this.parts.push({ label, value: m, kind: 'mul' });
    return this;
  }
  clamp(min: number, max: number): this {
    this.value = Math.min(max, Math.max(min, this.value));
    return this;
  }
  done(): Breakdown {
    return { total: this.value, parts: this.parts };
  }
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round2 = (v: number) => Math.round(v * 100) / 100;
