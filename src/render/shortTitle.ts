/** A title cut to fit a speech bubble: whole words only, with an ellipsis ("Galaxy of the…", never "Galaxy of the Fina"). */
export function shortTitle(name: string, max: number): string {
  const t = name.trim();
  if (t.length <= max) return t;
  const words = t.split(/\s+/);
  let out = '';
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max - 1) break;
    out = next;
  }
  // a single very long word: cut it, but say so
  return `${(out || t.slice(0, max - 1)).replace(/[\s:,–-]+$/, '')}…`;
}
