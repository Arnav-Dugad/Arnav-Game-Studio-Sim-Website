import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './ui/settings';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.DEV) {
  void Promise.all([import('./ui/store'), import('./services/auth'), import('./services/saves')]).then(([{ useGame }, { useAuth }, saves]) => {
    (window as unknown as { __ase: unknown }).__ase = { useGame, useAuth, saves };
  });
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
