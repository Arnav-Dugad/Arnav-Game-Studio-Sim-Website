/** Weather (cosmetic, derived from the date): shared by the office renderer and the HUD. */

/** Rainy days, stable per day: wettest in spring and autumn. */
export function isRainy(day: number, month: number): boolean {
  if (month === 12 || month <= 2) return false; // that's snow
  let h = Math.imul(day ^ 0x9e3779b9, 2654435761) >>> 0;
  h ^= h >>> 15;
  const chance = month >= 3 && month <= 5 ? 0.35 : month >= 9 && month <= 11 ? 0.4 : 0.15;
  return (h % 1000) / 1000 < chance;
}

/** A glyph for the day's weather. */
export function weatherGlyph(day: number, month: number): string {
  if (month === 12 || month <= 2) return '❄️';
  if (isRainy(day, month)) return '🌧️';
  if (month >= 9 && month <= 11) return '🍂';
  if (month >= 3 && month <= 5) return '🌸';
  return '☀️';
}
