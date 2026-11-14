import { Suspense, useEffect, useRef } from 'react';
import { Routes, Route, useLocation, useNavigationType } from 'react-router';
import { PrefsProvider } from './lib/prefs';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { applyHead, headFor, normalizePath } from './lib/seo';
import { PATHS, pageKeyFor, type PageMap } from './routes';
import { PAGES } from './flags';
import { bootEngine, whenEngine } from './engine';
import { markProgrammaticScroll, notifyRoute } from './engine/host';
import { useWorld } from './engine/react';
import { COL } from './engine/motion/palette.mjs';

let consoleArtPrinted = false;

/** Head sync, scroll/hash handling, focus management and scroll reveals. */
function RouteEffects() {
  const { pathname, hash } = useLocation();
  const nav = useNavigationType();
  const world = useWorld();
  const first = useRef(true);
  const lastPath = useRef(pathname);
  const seoTitle = useRef('');
  const key = useRef(pageKeyFor(pathname));
  key.current = pageKeyFor(pathname);

  useEffect(() => {
    bootEngine(() => key.current);
    notifyRoute(key.current, nav === 'POP');
  }, [pathname, nav]);

  useEffect(() => {
    const route = pageKeyFor(pathname) === 'NotFound' ? '/404' : normalizePath(pathname);
    const head = headFor(route);
    seoTitle.current = head.title;
    if (!first.current) applyHead(head);
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    // a hash naming a dialog (the footer policies) opens it; it is not a scroll target
    const inDialog = Boolean(target?.closest('dialog'));
    const samePage = pathname === lastPath.current;
    lastPath.current = pathname;
    if (target && !inDialog) {
      // wait a frame so lazily loaded pages have painted
      requestAnimationFrame(() => {
        markProgrammaticScroll();
        target.scrollIntoView({ block: 'start' });
      });
    } else if (!first.current && !(inDialog && samePage)) {
      markProgrammaticScroll();
      window.scrollTo(0, 0);
    }
    if (!first.current && !inDialog) {
      const main = document.getElementById('main');
      main?.focus({ preventScroll: true });
    }
    first.current = false;
  }, [pathname, hash]);

  // The visible tab title follows the current SEO route title and the same
  // director event that drives the page's ambient scene. Social/search metadata
  // stays route-specific and untouched by this live interface label.
  useEffect(() => {
    const route = pageKeyFor(pathname) === 'NotFound' ? '/404' : normalizePath(pathname);
    const base = headFor(route).title;
    seoTitle.current = base;
    const event = world?.current;
    const cue = event?.cues[0]?.split('.').at(-1);
    const scene = cue ? cue.replace(/([a-z])([A-Z])/g, '$1 $2') : '';
    document.title = `${base} · ${world?.state ?? 'R0'}${scene ? ` / ${scene}` : ''}`;
  }, [pathname, world?.state, world?.current?.uid]);

  useEffect(() => () => {
    if (seoTitle.current) document.title = seoTitle.current;
  }, []);

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

/** Maps ambient visuals and progress indicators directly to the shared signal stream. */
function EngineSurfaceBindings() {
  useEffect(() => {
    const root = document.documentElement;
    // Keep active hover/focus separate from the engine's rolling 60-second
    // exploration count. The latter feeds music and remains intentionally
    // cumulative; this transient state only drives the visual affordance.
    const interactive = 'a, button, summary, [role=button], [data-hover]';
    let pointerTarget: Element | null = null;
    let focusTarget: Element | null = null;
    const syncActiveHover = () => {
      root.dataset.pointerHover = String(pointerTarget !== null || focusTarget !== null);
    };
    const pointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        pointerTarget = null;
        syncActiveHover();
        return;
      }
      if (!(event.target instanceof Element)) return;
      pointerTarget = event.target.closest(interactive);
      syncActiveHover();
    };
    const pointerOut = (event: PointerEvent) => {
      if (!pointerTarget || !(event.target instanceof Element) || !pointerTarget.contains(event.target)) return;
      if (event.relatedTarget instanceof Node && pointerTarget.contains(event.relatedTarget)) return;
      pointerTarget = event.relatedTarget instanceof Element ? event.relatedTarget.closest(interactive) : null;
      syncActiveHover();
    };
    const focusIn = (event: FocusEvent) => {
      focusTarget = event.target instanceof Element ? event.target.closest(interactive) : null;
      syncActiveHover();
    };
    const focusOut = (event: FocusEvent) => {
      if (!focusTarget || !(event.target instanceof Element) || !focusTarget.contains(event.target)) return;
      focusTarget = event.relatedTarget instanceof Element ? event.relatedTarget.closest(interactive) : null;
      syncActiveHover();
    };
    const clearPointer = () => {
      pointerTarget = null;
      syncActiveHover();
    };
    document.addEventListener('pointerover', pointerOver, true);
    document.addEventListener('pointerout', pointerOut, true);
    document.addEventListener('focusin', focusIn, true);
    document.addEventListener('focusout', focusOut, true);
    window.addEventListener('blur', clearPointer);
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    const originalIcon = icon?.href;
    let dead = false;
    let off: (() => void) | undefined;
    let offWorld: (() => void) | undefined;
    let offRoute: (() => void) | undefined;
    let routeMotionTimeout: number | undefined;
    void whenEngine().then((engine) => {
      if (dead) return;
      const scrollProgress = document.querySelector<HTMLElement>('.reading-progress__scroll');
      const readProgress = document.querySelector<HTMLElement>('.reading-progress__read');
      let lastState = '';
      const refreshIcon = () => {
        const state = engine.director.world().state;
        root.dataset.worldState = state;
        if (!icon || state === lastState) return;
        lastState = state;
        const color = state === 'R3' ? COL.rim : state === 'T3' ? COL.amber : state.startsWith('T') ? COL.phos : COL.cyan;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9" shape-rendering="crispEdges"><rect width="9" height="9" fill="#072130"/><path fill="${color}" d="M1 1h2v7H1zM3 4h2v1H3zM5 2h2v2H5zM5 5h2v2H5z"/></svg>`;
        icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      };
      refreshIcon();
      if (import.meta.env.DEV && !consoleArtPrinted) {
        consoleArtPrinted = true;
        const art = ['       .----.', '   .--/____/--.', '  /  / /  /  / /', ' |__|__|  |__|__|', '   ~  ~  ~  ~'];
        const color = engine.director.world().state === 'R3' ? '#66818a' : '#19e3c1';
        console.info(`%c${art.join('\n')}`, `color:${color};font:12px/1.2 monospace`);
      }
      offWorld = engine.director.on(refreshIcon);
      offRoute = engine.bus.on('route', (event) => {
        if (event.from === null) return;
        const main = document.getElementById('main');
        if (!main) return;
        if (routeMotionTimeout !== undefined) window.clearTimeout(routeMotionTimeout);
        delete main.dataset.routeMotion;
        void main.offsetWidth;
        main.dataset.routeMotion = 'enter';
        routeMotionTimeout = window.setTimeout(() => {
          delete main.dataset.routeMotion;
          routeMotionTimeout = undefined;
        }, 220);
      });
      const apply = (frame: ReturnType<typeof engine.bus.frame>) => {
        root.style.setProperty('--kolto-daylight-tint', `${0.5 + frame.env.daylight * 1.5}%`);
        root.dataset.reducedMotion = String(frame.env.reducedMotion);
        root.dataset.presence = frame.presence.band;
        if (frame.presence.band === 'idle' || frame.presence.band === 'away') root.dataset.idle = 'true';
        else delete root.dataset.idle;
        root.dataset.keyboardNavigation = frame.keys.keyboardNav ? 'true' : 'false';
        root.style.setProperty('--kolto-scroll-depth', String(frame.scroll.depth));
        root.style.setProperty('--kolto-reading-signal', String(frame.reading));
        root.style.setProperty('--kolto-reading-glow', `${8 + frame.reading * 4}px`);
        if (scrollProgress) scrollProgress.setAttribute('aria-valuenow', String(Math.round(frame.scroll.depth * 100)));
        if (readProgress) readProgress.setAttribute('aria-valuenow', String(Math.round(frame.reading * 100)));
      };
      apply(engine.bus.frame());
      off = engine.bus.subscribe(apply);
    }).catch(() => {});
    return () => {
      dead = true;
      off?.();
      offWorld?.();
      offRoute?.();
      if (routeMotionTimeout !== undefined) window.clearTimeout(routeMotionTimeout);
      if (icon && originalIcon) icon.href = originalIcon;
      delete root.dataset.worldState;
      delete root.dataset.reducedMotion;
      delete root.dataset.idle;
      delete root.dataset.presence;
      document.removeEventListener('pointerover', pointerOver, true);
      document.removeEventListener('pointerout', pointerOut, true);
      document.removeEventListener('focusin', focusIn, true);
      document.removeEventListener('focusout', focusOut, true);
      window.removeEventListener('blur', clearPointer);
      delete root.dataset.pointerHover;
      delete root.dataset.keyboardNavigation;
      root.style.removeProperty('--kolto-scroll-depth');
      root.style.removeProperty('--kolto-reading-signal');
      root.style.removeProperty('--kolto-reading-glow');
      root.style.removeProperty('--kolto-daylight-tint');
    };
  }, []);

  return null;
}

/** Scroll depth is read from the shared engine frame; it is never persisted. */
function ReadingProgress() {
  return (
    <div className="reading-progress">
      <div className="reading-progress__value reading-progress__scroll" role="progressbar" aria-label="Scroll progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
      <div className="reading-progress__value reading-progress__read" role="progressbar" aria-label="Reading activity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
    </div>
  );
}

function Loading() {
  const world = useWorld();
  return (
    <div className="page loading" role="status" aria-label="Loading page" data-world-state={world?.state ?? 'R0'}>
      <span className="loading__signal" aria-hidden="true">▒▒▒</span>
      <span>Loading…</span>
    </div>
  );
}

/** Print gets a quiet state marker from the same director as the live page. */
function PrintEngineMark() {
  const world = useWorld();
  return (
    <aside className="print-engine-mark" data-world-state={world?.state ?? 'R0'} aria-label={`Scene state ${world?.state ?? 'R0'}`}>
      <span aria-hidden="true">◆</span> Kolto Labs · scene {world?.state ?? 'R0'}
    </aside>
  );
}

export function App({ pages }: { pages: PageMap }) {
  return (
    <PrefsProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Nav />
      <ReadingProgress />
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path={PATHS.Home} element={<pages.Home />} />
            <Route path={PATHS.Play} element={<pages.Play />} />
            <Route path={PATHS.About} element={<pages.About />} />
            <Route path={PATHS.Projects} element={<pages.Projects />} />
            <Route path={PATHS.Roadmap} element={<pages.Roadmap />} />
            <Route path={PATHS.Faq} element={<pages.Faq />} />
            {PAGES.join ? <Route path={PATHS.Join} element={<pages.Join />} /> : null}
            <Route path={PATHS.Credits} element={<pages.Credits />} />
            <Route path="*" element={<pages.NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <PrintEngineMark />
      <div className="crt-overlay" aria-hidden="true" />
      <RouteEffects />
      <EngineSurfaceBindings />
    </PrefsProvider>
  );
}
