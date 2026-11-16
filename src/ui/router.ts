import { useSyncExternalStore } from 'react';

/** Tiny hash router: '#/play/slot1' → ['play', 'slot1']. */
function current(): string[] {
  const h = typeof location === 'undefined' ? '' : location.hash.replace(/^#\/?/, '');
  return h ? h.split('/').filter(Boolean) : [];
}

let cache = current();
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    cache = current();
    listeners.forEach((l) => l());
  });
}

export function useRoute(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cache,
    () => cache,
  );
}

export function navigate(path: string, replace = false): void {
  const h = `#/${path.replace(/^\//, '')}`;
  if (replace) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
  cache = current();
  listeners.forEach((l) => l());
}
