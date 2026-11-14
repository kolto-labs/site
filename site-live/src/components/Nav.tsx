import { useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router';
import { usePrefs } from '../lib/prefs';
import { useHotkeys } from '../lib/hotkeys';
import { hrefFor } from '../lib/seo';
import { glyphPixels } from '../lib/blockfont';
import { PAGES } from '../flags';
import { SiteSettingsButton, openSiteSettings, openUserFiles } from './SiteSettings';
import { USER_MEDIA_UI } from '../flags';

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
  { key: 's', label: 'Switch music' },
  { key: 't', label: 'Site settings' },
  { key: '?', label: 'Keyboard shortcuts' },
  ...(USER_MEDIA_UI ? [{ key: 'u', label: 'Add your music' }] : []),
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
  const { crt, toggleCrt, sound, toggleSound, music, setMusic } = usePrefs();

  useEffect(() => {
    if (!USER_MEDIA_UI) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const clear = () => {
      depth = 0;
      document.documentElement.classList.remove('media-dragging');
    };
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      document.documentElement.classList.add('media-dragging');
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) document.documentElement.classList.remove('media-dragging');
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      clear();
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('audio/'));
      if (files.length) void import('../lib/prefs').then((m) => m.mediaFiles.add(files));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('blur', clear);
    return () => {
      clear();
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('blur', clear);
    };
  }, []);

  const nextMusic = () => setMusic(music === 'classic' ? 'generated' : music === 'generated' && USER_MEDIA_UI ? 'media' : 'classic');
  const extra: Record<string, () => void> = {
    h: () => navigate('/'),
    m: toggleSound,
    c: toggleCrt,
    s: nextMusic,
    t: () => openSiteSettings(),
    '?': () => navigate({ hash: '#accessible-navigation' }, { preventScrollReset: true }),
  };
  if (USER_MEDIA_UI) extra.u = openUserFiles;
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
          <SiteSettingsButton />
        </div>
      </div>
    </header>
  );
}
