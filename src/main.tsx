import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/liquid.css';
import './styles/components.css';
import './styles/mobile.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Offline support. Registered only in production so the dev server stays predictable.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // Relative, not '/sw.js': on GitHub Pages the app lives under /<repo>/, and an
    // absolute path would look for the worker at the domain root and register nothing.
    const base = document.baseURI;
    navigator.serviceWorker.register(new URL('sw.js', base), { scope: new URL('./', base).pathname })
      .catch(() => {
        /* offline caching is an enhancement — the app works without it */
      });
  });
}
