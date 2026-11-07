/**
 * Frontend Entry Point - WallXERP by WallX
 * Deployment verification: Last updated 2026-08-31
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App.tsx';

// Automatically reload the page when a new deployment invalidates cached chunks
window.addEventListener('vite:preloadError', (event) => {
  console.warn(
    'New deployment detected or chunk failed to load. Reloading page...',
    event,
  );
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
