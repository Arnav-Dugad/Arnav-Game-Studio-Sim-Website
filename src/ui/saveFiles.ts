/**
 * Save files: export a slot to a JSON file and import one back. Handy for guests (whose saves live only in
 * this browser) and for moving a studio between devices without an account.
 */
import { migrate, SaveError } from '@/sim/save';
import type { GameState } from '@/sim/types';

const FORMAT = 'arnav-game-studio-save';

export function exportSave(s: GameState): void {
  const payload = { format: FORMAT, exportedAt: new Date().toISOString(), state: s };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const year = Math.floor(s.day / 365.2425) + 1980;
  a.href = url;
  a.download = `${s.company.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'studio'}-${year}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

/** Parse and validate an exported file (or a raw state JSON). Throws SaveError with a friendly message. */
export async function readSaveFile(file: File): Promise<GameState> {
  if (file.size > 20_000_000) throw new SaveError('That file is too large to be a save');
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new SaveError('That file isn’t a valid save (not JSON)');
  }
  const obj = raw as { format?: string; state?: unknown };
  const state = obj && typeof obj === 'object' && obj.format === FORMAT ? obj.state : raw;
  const s = migrate(state);
  const isObj = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);
  const ok =
    typeof s.company?.name === 'string' &&
    typeof s.company.founderName === 'string' &&
    Number.isFinite(s.company.cash) &&
    isObj(s.settings) &&
    isObj(s.staff) &&
    isObj(s.projects) &&
    isObj(s.releases) &&
    Array.isArray(s.releaseOrder) &&
    isObj(s.rivals) &&
    isObj(s.franchises) &&
    isObj(s.engines) &&
    isObj(s.office) &&
    Array.isArray(s.office.items) &&
    isObj(s.finance) &&
    Array.isArray(s.finance.ledger) &&
    isObj(s.market) &&
    isObj(s.offers) &&
    isObj(s.progress) &&
    isObj(s.progress.stats) &&
    Array.isArray(s.news) &&
    Array.isArray(s.candidates);
  if (!ok) throw new SaveError('That file is missing parts of a save (it may be damaged or edited)');
  return s;
}
