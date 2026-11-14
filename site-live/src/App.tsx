import { Suspense, useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router';
import { PrefsProvider } from './lib/prefs';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { applyHead, headFor, normalizePath } from './lib/seo';
import { PATHS, pageKeyFor, type PageMap } from './routes';
import { PAGES } from './flags';

/** Head sync, scroll/hash handling, focus management and scroll reveals. */
function RouteEffects() {
  const { pathname, hash } = useLocation();
  const first = useRef(true);
  const lastPath = useRef(pathname);

  useEffect(() => {
    const route = pageKeyFor(pathname) === 'NotFound' ? '/404' : normalizePath(pathname);
    if (!first.current) applyHead(headFor(route));
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    // a hash naming a dialog (the footer policies) opens it; it is not a scroll target
    const inDialog = Boolean(target?.closest('dialog'));
    const samePage = pathname === lastPath.current;
    lastPath.current = pathname;
    if (target && !inDialog) {
      // wait a frame so lazily loaded pages have painted
      requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    } else if (!first.current && !(inDialog && samePage)) {
      window.scrollTo(0, 0);
    }
    if (!first.current && !inDialog) {
      const main = document.getElementById('main');
      main?.focus({ preventScroll: true });
    }
    first.current = false;
  }, [pathname, hash]);

  // scroll reveals: observe every [data-reveal] as it appears
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-app', 'ready');
    if (!root.classList.contains('reveal-ready') || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );
    const scan = () => document.querySelectorAll('[data-reveal]:not(.is-in):not([data-observed])').forEach((el) => {
      el.setAttribute('data-observed', '');
      io.observe(el);
    });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.getElementById('main') ?? document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      // drop the markers so a re-run (StrictMode in dev) observes these elements again
      document.querySelectorAll('[data-observed]').forEach((el) => el.removeAttribute('data-observed'));
    };
  }, []);

  return null;
}

function Loading() {
  return (
    <div className="page loading" role="status">
      <span aria-hidden="true">▒▒▒ </span>Loading…
    </div>
  );
}

export function App({ pages }: { pages: PageMap }) {
  return (
    <PrefsProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path={PATHS.Home} element={<pages.Home />} />
            <Route path={PATHS.About} element={<pages.About />} />
            <Route path={PATHS.Projects} element={<pages.Projects />} />
            <Route path={PATHS.Roadmap} element={<pages.Roadmap />} />
            <Route path={PATHS.Faq} element={<pages.Faq />} />
            {PAGES.join ? <Route path={PATHS.Join} element={<pages.Join />} /> : null}
            <Route path={PATHS.Credits} element={<pages.Credits />} />
            <Route path={PATHS.Play} element={<pages.Play />} />
            <Route path="*" element={<pages.NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <div className="crt-overlay" aria-hidden="true" />
      <RouteEffects />
    </PrefsProvider>
  );
}
