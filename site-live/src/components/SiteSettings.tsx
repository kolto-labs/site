import { useRef, useSyncExternalStore, type ChangeEvent, type MouseEvent } from 'react';
import { usePrefs, mediaFiles, type MusicSource, type TempoMode, type VisitsMode } from '../lib/prefs';
import { USER_MEDIA_UI } from '../flags';
import { PolicyLink } from './Policies';
import '../styles/policy.css';

const DIALOG_ID = 'site-settings';

/** Where focus goes when the dialog closes: the control that opened it, else the header button. */
let returnTo: HTMLElement | null = null;
let fileInput: HTMLInputElement | null = null;

/** Opens Site settings. `trigger` gets focus back on close; without one, the focused element does. */
export function openSiteSettings(trigger?: HTMLElement | null) {
  const d = document.getElementById(DIALOG_ID);
  if (!(d instanceof HTMLDialogElement) || d.open) return;
  const active = document.activeElement;
  returnTo = trigger ?? (active instanceof HTMLElement && active !== document.body ? active : null);
  d.showModal();
}

/** Opens the dev-only file picker from the U shortcut or a file drop. */
export function openUserFiles() {
  if (USER_MEDIA_UI) fileInput?.click();
}

/** A 9x9 pixel gear, drawn like the header's K mark. */
const GEAR = [
  '....#....',
  '.#.###.#.',
  '..#####..',
  '.###.###.',
  '###...###',
  '.###.###.',
  '..#####..',
  '.#.###.#.',
  '....#....',
];
const GEAR_PATH = GEAR.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `M${x} ${y}h1v1h-1z` : ''))).join('');

function Gear() {
  return (
    <svg width="12" height="12" viewBox="0 0 9 9" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
      <path fill="currentColor" d={GEAR_PATH} />
    </svg>
  );
}

function Radio<T extends string>({ name, value, current, onPick, children }: { name: string; value: T; current: T; onPick: (v: T) => void; children: string }) {
  return (
    <label className="site-settings__opt">
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onPick(value)} />
      {children}
    </label>
  );
}

/** DEV-ONLY (USER_MEDIA_UI): the files row. Production builds drop it with the flag. */
function FilesRow() {
  const count = useSyncExternalStore(mediaFiles.subscribe, mediaFiles.count, () => 0);
  const input = useRef<HTMLInputElement>(null);
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = '';
    void mediaFiles.add(files);
  };
  return (
    <div className="site-settings__files">
      <span>Your files: {count}.</span>
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => input.current?.click()}>
        Add files
      </button>
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => void mediaFiles.removeAll()} disabled={count === 0}>
        Remove all
      </button>
      <input
        ref={(el) => {
          input.current = el;
          fileInput = el;
        }}
        type="file"
        accept="audio/*"
        multiple
        hidden
        tabIndex={-1}
        onChange={onPick}
      />
    </div>
  );
}

/**
 * The header's Settings button and the Site settings dialog it opens. Every control applies at once and
 * reads the same prefs as the header toggles and hotkeys. The dialog is in the prerendered HTML, closed.
 */
export function SiteSettingsButton() {
  const { crt, toggleCrt, sound, toggleSound, music, setMusic, tempo, setTempo, visits, setVisits, forgetVisits } = usePrefs();
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const onClose = () => {
    const t = returnTo;
    returnTo = null;
    const target = t?.isConnected && t.getClientRects().length > 0 ? t : button.current;
    requestAnimationFrame(() => {
      if (document.querySelector('dialog[open]')) return;
      if (target?.isConnected && document.activeElement !== target) target.focus({ preventScroll: true });
    });
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className="bbs__toggle"
        onClick={(e) => openSiteSettings(e.currentTarget)}
        aria-haspopup="dialog"
        aria-keyshortcuts="T"
        aria-label="Site settings"
        title="Site settings (T)"
      >
        <Gear />
        <span className="bbs__toggle-label bbs__toggle-name--settings">Settings</span>
      </button>
      <dialog
        ref={dialog}
        id={DIALOG_ID}
        className="policy-dialog site-settings"
        aria-labelledby={`${DIALOG_ID}-title`}
        onClose={onClose}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="policy-dialog__inner">
          <div className="policy-dialog__head">
            <h2 className="policy-dialog__title" id={`${DIALOG_ID}-title`}>
              Site settings
            </h2>
            <button type="button" className="btn btn--sm policy-dialog__close" onClick={() => dialog.current?.close()}>
              Close <kbd>Esc</kbd>
            </button>
          </div>
          <div className="policy-dialog__body site-settings__body">
            <section aria-labelledby="ss-display">
              <h3 id="ss-display">Display</h3>
              <label className="site-settings__opt">
                <input type="checkbox" checked={crt} onChange={toggleCrt} />
                Show scanlines
              </label>
              <p className="site-settings__note">Motion follows your system setting.</p>
            </section>

            <section aria-labelledby="ss-sound">
              <h3 id="ss-sound">Sound</h3>
              <label className="site-settings__opt">
                <input type="checkbox" checked={sound} onChange={toggleSound} />
                Play sound
              </label>
              <fieldset>
                <legend>Choose music</legend>
                <Radio<MusicSource> name="ss-music" value="classic" current={music} onPick={setMusic}>
                  Classic
                </Radio>
                <Radio<MusicSource> name="ss-music" value="generated" current={music} onPick={setMusic}>
                  Generated score
                </Radio>
                {/* DEV-ONLY (USER_MEDIA_UI) */}
                {USER_MEDIA_UI && (
                  <Radio<MusicSource> name="ss-music" value="media" current={music} onPick={setMusic}>
                    Your files
                  </Radio>
                )}
              </fieldset>
              <fieldset aria-describedby="ss-tempo-note">
                <legend>Set tempo</legend>
                <Radio<TempoMode> name="ss-tempo" value="range" current={tempo} onPick={setTempo}>
                  Keep between 98 and 116 BPM
                </Radio>
                <Radio<TempoMode> name="ss-tempo" value="follow" current={tempo} onPick={setTempo}>
                  Follow your activity
                </Radio>
                <p id="ss-tempo-note" className={`site-settings__note${music === 'generated' ? ' is-idle' : ''}`}>
                  Tempo changes apply to the generated score.
                </p>
              </fieldset>
              <fieldset>
                <legend>Remember visits</legend>
                <Radio<VisitsMode> name="ss-visits" value="off" current={visits} onPick={setVisits}>
                  Start each visit from zero
                </Radio>
                <Radio<VisitsMode> name="ss-visits" value="local" current={visits} onPick={setVisits}>
                  Remember visits on this device
                </Radio>
                <button type="button" className="btn btn--sm btn--ghost" onClick={forgetVisits}>
                  Forget visits
                </button>
              </fieldset>
              {/* DEV-ONLY (USER_MEDIA_UI) */}
              {USER_MEDIA_UI && <FilesRow />}
            </section>

            <section aria-labelledby="ss-keys">
              <h3 id="ss-keys">Keys</h3>
              <PolicyLink id="accessible-navigation" className="btn btn--sm btn--ghost">
                Show keyboard shortcuts
              </PolicyLink>
            </section>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** The footer's "Site settings" entry. */
export function SiteSettingsLink() {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openSiteSettings(e.currentTarget);
  };
  return (
    <a href={`#${DIALOG_ID}`} aria-haspopup="dialog" onClick={onClick}>
      Site settings
    </a>
  );
}
