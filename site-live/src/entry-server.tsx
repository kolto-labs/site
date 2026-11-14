import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { App } from './App';
import type { PageMap } from './routes';
import Home from './pages/Home';
import About from './pages/About';
import Projects from './pages/Projects';
import Roadmap from './pages/Roadmap';
import Faq from './pages/Faq';
import Join from './pages/Join';
import Credits from './pages/Credits';
import Play from './pages/Play';
import NotFound from './pages/NotFound';

const pages: PageMap = { Home, About, Projects, Roadmap, Faq, Join, Credits, Play, NotFound };

export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App pages={pages} />
      </StaticRouter>
    </StrictMode>,
  );
}

export { headFor, headHtml, hrefFor, ROUTES, plain } from './lib/seo';
export { content, SITE_URL, LINKS } from './content';
export { snapshotAggregate } from './content/repos';
export { koltoLogo } from './lib/blockfont';
export { pageKeyFor } from './routes';
export { PAGES } from './flags';
export { K_PATH } from './components/Nav';
