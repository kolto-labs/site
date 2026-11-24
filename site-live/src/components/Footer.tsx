import { Link } from 'react-router';
import { LINKS, SUPPORT_LINKS } from '../content';
import { MENU } from './Nav';
import { hrefFor } from '../lib/seo';
import { PolicyDialogs, PolicyLink } from './Policies';
import { SiteSettingsLink } from './SiteSettings';
import { useWorld } from '../engine/react';

export function Footer() {
  const world = useWorld();
  return (
    <footer className="foot" data-world-state={world?.state ?? 'R0'}>
      <div className="page foot__grid">
        <div className="foot__brand">
          <p className="foot__tag">Life support for the Odyssey engine.</p>
          <p className="foot__links">
            <a href={LINKS.github}>GitHub</a>
            {SUPPORT_LINKS.length > 0 && (
              <>
                {' · '}
                <Link to="/faq/#donations">Support</Link>
              </>
            )}
          </p>
        </div>
        <nav className="foot__nav" aria-label="Footer">
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            {MENU.map((m) => (
              <li key={m.to}>
                <Link to={hrefFor(m.to)}>{m.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <ul className="foot__policy">
          <li>
            <PolicyLink id="code-of-conduct">Code of conduct</PolicyLink>
          </li>
          <li>
            <PolicyLink id="accessible-navigation">Accessible navigation</PolicyLink>
          </li>
          <li>
            <SiteSettingsLink />
          </li>
        </ul>
        <p className="foot__sauce" aria-label="Colophon">
          &copy; 2026 Kolto Labs. Set in Departure Mono and IBM Plex.{' '}
          <Link to="/credits/#credits">Credits</Link>
        </p>
        <nav className="foot__indexes" data-world-state={world?.state ?? 'R0'} aria-label="Machine-readable site indexes">
          <span className="foot__indexes-label" aria-hidden="true">INDEX / {world?.state ?? 'R0'}</span>
          <a href="/feed.xml">Updates feed</a>
          <a href="/llms.txt">Text index</a>
        </nav>
        <figure className="foot__og" data-world-state={world?.state ?? 'R0'}>
          <a href="/og-image.png" aria-label="Open the Kolto Labs social preview image">
            <span className="foot__og-visual">
              <img src="/og-image.png" alt="Kolto Labs social preview" width="1200" height="630" loading="lazy" />
              <span className="foot__og-state" aria-hidden="true">{world?.state ?? 'R0'}</span>
            </span>
          </a>
          <figcaption>Share card · {world?.state ?? 'R0'}</figcaption>
        </figure>
      </div>
      <PolicyDialogs />
    </footer>
  );
}
