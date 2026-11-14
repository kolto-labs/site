import { NavLink, Link, useNavigate } from 'react-router';
import { usePrefs } from '../lib/prefs';
import { useHotkeys } from '../lib/hotkeys';
import { hrefFor } from '../lib/seo';
import { glyphPixels } from '../lib/blockfont';
import { PAGES } from '../flags';

export const MENU: { to: string; label: string; key: string }[] = [
  { to: '/play', label: 'Play', key: 'y' },
  { to: '/about', label: 'About', key: 'a' },
  { to: '/projects', label: 'Projects', key: 'p' },
  { to: '/roadmap', label: 'Roadmap', key: 'r' },
  { to: '/faq', label: 'FAQ', key: 'f' },
  ...(PAGES.join ? [{ to: '/join', label: 'Join', key: 'j' }] : []),
  { to: '/credits', label: 'Credits', key: 'd' },
];

/** Site-wide hotkeys besides the menu letters. The footer's keyboard help is built from this and MENU. */
export const EXTRA_KEYS = [
  { key: 'h', label: 'Home' },
  { key: 'm', label: 'Sound on or off' },
  { key: 'c', label: 'CRT effect on or off' },
] as const;

/** Renders a label such as "[A]bout" with the hotkey letter picked out; brackets are decoration only. */
function HotLabel({ label, k }: { label: string; k: string }) {
  const i = label.toLowerCase().indexOf(k);
  if (i < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, i)}
      <span className="hk">
        <span className="hk__b" aria-hidden="true">
          [
        </span>
        {label[i]}
        <span className="hk__b" aria-hidden="true">
          ]
        </span>
      </span>
      {label.slice(i + 1)}
    </>
  );
}

/** The K from the hero logo's pixel face, as SVG path data (9x10 grid). */
export const K_PATH = glyphPixels('K')
  .map(([x, y]) => `M${x} ${y}h1v1h-1z`)
  .join('');

export function KMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-3.5 -3 16 16" aria-hidden="true" focusable="false" className="kmark" shapeRendering="crispEdges">
      <rect x="-3.5" y="-3" width="16" height="16" fill="#072130" />
      <path fill="#4fe3ee" d={K_PATH} />
    </svg>
  );
}

export function Nav() {
  const navigate = useNavigate();
  const { crt, toggleCrt, sound, toggleSound } = usePrefs();

  const extra: Record<(typeof EXTRA_KEYS)[number]['key'], () => void> = { h: () => navigate('/'), m: toggleSound, c: toggleCrt };
  const map: Record<string, () => void> = {};
  for (const m of MENU) map[m.key] = () => navigate(hrefFor(m.to));
  Object.assign(map, extra);
  useHotkeys(map, [navigate, toggleCrt, toggleSound]);

  return (
    <header className="bbs">
      <div className="bbs__inner">
        <Link to="/" className="bbs__brand" aria-keyshortcuts="H">
          <KMark />
          <span className="bbs__brand-text">
            KOLTO<span className="bbs__brand-labs">LABS</span>
          </span>
          <span className="sr-only"> home</span>
        </Link>
        <nav className="bbs__nav" aria-label="Main">
          <ul>
            {MENU.map((m) => (
              <li key={m.to}>
                <NavLink to={hrefFor(m.to)} aria-keyshortcuts={m.key.toUpperCase()} className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                  <HotLabel label={m.label} k={m.key} />
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="bbs__toggles">
          <button type="button" className="bbs__toggle" aria-pressed={sound} onClick={toggleSound} aria-keyshortcuts="M" aria-label="Sound" title="Music and UI sounds (M)">
            <span aria-hidden="true">♪</span>
            <span className="bbs__toggle-label">
              <span className="bbs__toggle-name bbs__toggle-name--hide-sm">Sound</span> <b>{sound ? 'ON' : 'OFF'}</b>
            </span>
          </button>
          <button type="button" className="bbs__toggle" aria-pressed={crt} onClick={toggleCrt} aria-keyshortcuts="C" aria-label="CRT effect" title="Scanlines and vignette (C)">
            <span className="bbs__toggle-label">
              <span className="bbs__toggle-name">CRT</span> <b>{crt ? 'ON' : 'OFF'}</b>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
