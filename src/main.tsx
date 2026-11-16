import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './ui/settings';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV) {
  void import('./ui/store').then(({ useGame }) => {
    (window as unknown as { __ase: unknown }).__ase = { useGame };
  });
}
