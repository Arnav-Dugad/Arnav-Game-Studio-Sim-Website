/**
 * Platform relations: every platform holder keeps score. Great games on their hardware (exclusives most of all)
 * win their favour; flops and neglect cost it. Favoured studios get their launches featured on the storefront
 * (more sales on that platform) and cheaper devkits; a holder you've burned charges more and helps less.
 * Favour drifts back toward neutral over time.
 */
import { COMPANY_BY_ID } from '../../data/companies';
import { clamp } from '../breakdown';
import type { GameState, Release } from '../types';
import { pushNews } from '../util';
import { platformInfo } from './market';

export const FAVOUR_NEUTRAL = 50;
export const FEATURE_AT = 75;
export const FEATURE_MUL = 1.12;

/** The holder whose favour this platform's games affect (none for open platforms or your own hardware). */
export function holderOf(s: GameState, platformId: string): string | null {
  const pl = platformInfo(s, platformId);
  if (!pl || pl.own || !pl.maker || pl.maker === 'various') return null;
  return pl.maker;
}

export function favour(s: GameState, maker: string): number {
  return s.partners?.[maker] ?? FAVOUR_NEUTRAL;
}

export function holderName(maker: string): string {
  return COMPANY_BY_ID[maker]?.name ?? maker;
}

/** Devkit price multiplier from favour. */
export function devkitMul(s: GameState, platformId: string): number {
  const m = holderOf(s, platformId);
  if (!m) return 1;
  const f = favour(s, m);
  return f >= 85 ? 0.5 : f >= 70 ? 0.7 : f <= 25 ? 1.25 : 1;
}

/** On release: the holders of its platforms react (call after the release's potential is set). */
export function partnersOnRelease(s: GameState, rel: Release): void {
  if (rel.concept.expansionOf) return;
  const makers = new Set<string>();
  for (const pid of rel.concept.platforms) {
    const m = holderOf(s, pid);
    if (m) makers.add(m);
  }
  if (!makers.size) return;
  const exclusive = makers.size === 1 && rel.concept.platforms.length === 1;
  const sizeBonus = { small: 0, medium: 0.5, large: 1, aaa: 2 }[rel.concept.size];
  const featured: string[] = [];
  for (const m of makers) {
    const before = favour(s, m);
    // a launch the holder features gets a storefront spot
    if (before >= FEATURE_AT) {
      for (const ps of rel.platforms) if (holderOf(s, ps.platform) === m) ps.potential *= FEATURE_MUL;
      featured.push(holderName(m));
    }
    const d = (rel.score - 65) / 5 + (exclusive ? 4 : 0) + sizeBonus;
    (s.partners ??= {})[m] = Math.round(clamp(before + d, 0, 100) * 10) / 10;
    if (before < FEATURE_AT && s.partners[m]! >= FEATURE_AT) pushNews(s, { category: 'platform', headline: `${holderName(m)} names ${s.company.name} a key partner`, body: 'Your next launches on their platforms will be featured on their storefront, and devkits come cheaper.', tone: 'good' });
  }
  if (featured.length) rel.featuredBy = featured;
}

/** Monthly: favour drifts back toward neutral. */
export function partnersMonthly(s: GameState): void {
  for (const [m, v] of Object.entries(s.partners ?? {})) {
    const next = v + (FAVOUR_NEUTRAL - v) * 0.02;
    s.partners![m] = Math.round(next * 10) / 10;
  }
}
