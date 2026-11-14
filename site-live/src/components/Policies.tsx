import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { content } from '../content';
import { Md } from './Md';
import { EXTRA_KEYS, MENU } from './Nav';
import '../styles/policy.css';
import { useWorld } from '../engine/react';

/** Keyboard help, built from the live hotkey map so it can't drift from it. */
function KeyboardHelp() {
  const world = useWorld();
  const keys = [...MENU.map((m) => ({ key: m.key, label: m.label })), ...EXTRA_KEYS];
  return (
    <div className="md policy-dialog__body" data-world-state={world?.state ?? 'R0'}>
      <p>Press ? to open this list. Press a bracketed menu letter to jump there.</p>
      <dl className="policy-keys">
        {keys.map((k) => (
          <div key={k.key}>
            <dt>
              <kbd>{k.key.toUpperCase()}</kbd>
            </dt>
            <dd>{k.label}</dd>
          </div>
        ))}
      </dl>
      <p>Hotkeys pause while you type in a field or while a popup is open.</p>
      <p>Every link and button works with Tab and Enter. Esc closes a popup.</p>
    </div>
  );
}

export const POLICIES = [
  { id: 'code-of-conduct', title: 'Code of conduct', body: <Md source={content.join.conduct} className="policy-dialog__body" /> },
  { id: 'accessible-navigation', title: 'Accessible navigation', body: <KeyboardHelp /> },
] as const;

export type PolicyId = (typeof POLICIES)[number]['id'];

const isPolicyId = (s: string): s is PolicyId => POLICIES.some((p) => p.id === s);

/** The element that opened the current dialog; focus goes back to it on close. */
let lastTrigger: HTMLElement | null = null;

/**
 * A link to `#<id>` that opens the policy dialog. Without JS it is a plain fragment link,
 * and the footer's `:target` fallback shows the text.
 */
export function PolicyLink({ id, className, children }: { id: PolicyId; className?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    lastTrigger = e.currentTarget;
    navigate({ pathname, search, hash: `#${id}` }, { replace: true, preventScrollReset: true });
  };
  return (
    <a href={`#${id}`} className={className} aria-haspopup="dialog" onClick={onClick}>
      {children}
    </a>
  );
}

/**
 * The footer's policy, conduct and keyboard-help texts as closed modal dialogs. They are in the prerendered HTML, so search
 * engines and no-JS readers get the full text. Any URL whose hash is a policy id opens it.
 */
export function PolicyDialogs() {
  const { hash, key } = useLocation();
  const refs = useRef<Partial<Record<PolicyId, HTMLDialogElement | null>>>({});

  useEffect(() => {
    const want = decodeURIComponent(hash.slice(1));
    for (const p of POLICIES) {
      const d = refs.current[p.id];
      if (!d) continue;
      if (p.id === want && !d.open) {
        if (!lastTrigger) {
          const active = document.activeElement;
          lastTrigger = active instanceof HTMLElement && active !== document.body ? active : null;
        }
        d.showModal();
      }
      else if (p.id !== want && d.open) d.close();
    }
  }, [hash, key]);

  const onClose = () => {
    const { pathname, search, hash: current } = window.location;
    if (isPolicyId(decodeURIComponent(current.slice(1)))) {
      window.history.replaceState(window.history.state, '', pathname + search);
    }
    const t = lastTrigger;
    lastTrigger = null;
    (t?.isConnected ? t : document.getElementById('main'))?.focus({ preventScroll: true });
  };

  return (
    <>
      {POLICIES.map((p) => (
        <dialog
          key={p.id}
          id={p.id}
          ref={(el) => {
            refs.current[p.id] = el;
          }}
          className="policy-dialog"
          aria-labelledby={`${p.id}-title`}
          onClose={onClose}
          onClick={(e) => {
            if (e.target === e.currentTarget) e.currentTarget.close();
          }}
        >
          <div className="policy-dialog__inner">
            <div className="policy-dialog__head">
              <h2 className="policy-dialog__title" id={`${p.id}-title`}>
                {p.title}
              </h2>
              <button type="button" className="btn btn--sm policy-dialog__close" onClick={() => refs.current[p.id]?.close()}>
                Close <kbd>Esc</kbd>
              </button>
            </div>
            {p.body}
          </div>
        </dialog>
      ))}
    </>
  );
}
