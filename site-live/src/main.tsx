import { StrictMode, lazy } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400-italic.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './styles/global.css';
import './styles/chrome.css';
import './styles/hero.css';
import './styles/components.css';
import './styles/gallery.css';
import './styles/pages.css';
import { App } from './App';
import { pageKeyFor, type PageKey, type PageMap } from './routes';
import { loaders } from './loaders';

async function boot() {
  const key = pageKeyFor(window.location.pathname);
  // Load the current page eagerly so hydration never suspends; the rest stay lazy.
  const current = await loaders[key]();
  const pages = Object.fromEntries(
    (Object.keys(loaders) as PageKey[]).map((k) => [k, k === key ? current.default : lazy(loaders[k])]),
  ) as PageMap;

  const root = document.getElementById('root')!;
  const app = (
    <StrictMode>
      <BrowserRouter>
        <App pages={pages} />
      </BrowserRouter>
    </StrictMode>
  );
  // Hydrate only when the served HTML was prerendered for this page (a dev server or an
  // SPA fallback may serve another page's HTML); otherwise render from scratch.
  if (root.firstElementChild && root.dataset.page === key) hydrateRoot(root, app);
  else {
    root.textContent = '';
    createRoot(root).render(app);
  }
}

void boot();
