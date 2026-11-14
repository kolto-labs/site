import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../lib/prefs';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

interface Props {
  text: string;
  label?: string;
  /** Accessible description of what is copied, e.g. "install command". */
  what?: string;
  className?: string;
}

export function CopyButton({ text, label = 'Copy', what, className = 'btn btn--sm' }: Props) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<number | undefined>(undefined);
  const { blip } = usePrefs();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onClick = async () => {
    const ok = await copyText(text);
    setState(ok ? 'ok' : 'fail');
    if (ok) blip('tick');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1800);
  };
  return (
    <>
      <button type="button" className={className} onClick={onClick} aria-label={what ? `${label} ${what}` : undefined}>
        {state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'ok' ? `Copied ${what ?? 'text'} to clipboard` : state === 'fail' ? 'Copy failed. Select the text and copy it manually.' : ''}
      </span>
    </>
  );
}
