import { useEffect } from 'react';
import { isTypingTarget } from './dom';

type Handler = (e: KeyboardEvent) => void;
type Layer = Record<string, Handler>;

const layers: Layer[] = [];
let installed = false;

function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (isTypingTarget(e.target)) return;
  if (document.querySelector('dialog[open]')) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  for (let i = layers.length - 1; i >= 0; i--) {
    const h = layers[i][key];
    if (h) {
      e.preventDefault();
      h(e);
      return;
    }
  }
}

/**
 * Single-key BBS-style hotkeys. Ignored while typing in form fields, while a modal
 * is open, or with modifier keys, so they never fight the browser or assistive tech.
 * Later-registered layers win (a page can override the global menu).
 */
export function useHotkeys(map: Layer, deps: unknown[] = []) {
  useEffect(() => {
    if (!installed) {
      window.addEventListener('keydown', onKey);
      installed = true;
    }
    const layer = map;
    layers.push(layer);
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
