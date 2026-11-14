import { Link } from 'react-router';
import { content, LINKS } from '../content';
import { MENU } from './Nav';
import { hrefFor } from '../lib/seo';
import { Md } from './Md';
import { PolicyDialogs, PolicyLink } from './Policies';

export function Footer() {
  return (
    <footer className="foot">
      <div className="page foot__grid">
        <div className="foot__brand">
          <p className="foot__tag">Life support for the Odyssey engine.</p>
          <p className="foot__links">
            <a href={LINKS.github}>GitHub</a>
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
            <PolicyLink id="re-policy">Reverse-engineering policy</PolicyLink>
          </li>
          <li>
            <PolicyLink id="code-of-conduct">Code of conduct</PolicyLink>
          </li>
          <li>
            <PolicyLink id="accessible-navigation">Accessible navigation</PolicyLink>
          </li>
        </ul>
        <p className="foot__legal">
          <Md source={content.disclaimer} inline as="span" />
        </p>
        <p className="foot__sauce" aria-label="Colophon">
          &copy; 2026 Kolto Labs. Set in Departure Mono and IBM Plex (SIL OFL 1.1).{' '}
          <Link to="/credits/#credits">Credits</Link>
        </p>
      </div>
      <PolicyDialogs />
    </footer>
  );
}
