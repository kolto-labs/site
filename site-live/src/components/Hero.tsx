import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { content } from '../content';
import { koltoLogo, maskUri } from '../lib/blockfont';
import { usePrefs } from '../lib/prefs';
import { hrefFor } from '../lib/seo';

function CtaLink({ href, children, primary }: { href: string; children: string; primary?: boolean }) {
  const cls = `btn${primary ? ' btn--primary' : ''}`;
  if (/^https?:/.test(href)) {
    return (
      <a className={cls} href={href}>
        {children}
      </a>
    );
  }
  const [path, hash] = href.split('#');
  return (
    <Link className={cls} to={hrefFor(path || '/') + (hash ? `#${hash}` : '')}>
      {children}
    </Link>
  );
}

export function Hero() {
  const { hero, greets } = content;
  const logo = koltoLogo();
  const fillMask = maskUri(logo.fillPath, logo.w, logo.h);
  const shadowMask = maskUri(logo.shadowPath, logo.w, logo.h);
  const hostRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const { reducedMotion } = usePrefs();

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = () =>
      import('../hero/effect').then((m) => {
        if (cancelled || !canvasRef.current || !hostRef.current) return;
        dispose = m.startHero({
          canvas: canvasRef.current,
          host: hostRef.current,
          logo: logoRef.current,
          text: greets.scroller,
          reduced,
          onLive: () => setLive(true),
        });
      });
    // defer the effect until the browser is idle so it never competes with first paint
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = ric ? ric(start, { timeout: 600 }) : window.setTimeout(start, 120);
    return () => {
      cancelled = true;
      if (!ric) window.clearTimeout(id);
      dispose?.();
    };
  }, [greets.scroller, reducedMotion]);

  return (
    <section ref={hostRef} className={`hero${live ? ' is-live' : ''}`} aria-labelledby="hero-title">
      <canvas ref={canvasRef} className="hero__fx" aria-hidden="true" />
      <div className="hero__poster" aria-hidden="true" />
      <div className="hero__inner page">
        <div
          className="hero__logo"
          ref={logoRef}
          aria-hidden="true"
          style={{ ['--lw' as string]: logo.w, ['--lh' as string]: logo.h }}
        >
          <div className="logo-art logo-art--shadow" style={{ WebkitMaskImage: shadowMask, maskImage: shadowMask }} />
          <div className="logo-art logo-art--fill" style={{ WebkitMaskImage: fillMask, maskImage: fillMask }} />
        </div>
        <div className="hero__copy">
        <p className="hero__kicker">{hero.kicker}</p>
        <h1 id="hero-title" className="hero__title">
          <span className="sr-only">Kolto Labs: </span>
          {hero.headline}
        </h1>
        <p className="hero__sub">{hero.sub}</p>
        <div className="btn-row hero__ctas">
          {hero.ctas.map((c, i) => (
            <CtaLink key={c.href + c.label} href={c.href} primary={i === 0}>
              {c.label}
            </CtaLink>
          ))}
        </div>
        </div>
      </div>
      <p className="hero__static-greets" aria-hidden="true">
        {greets.scroller}
      </p>
    </section>
  );
}
