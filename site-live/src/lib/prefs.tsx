import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const CRT_KEY = 'kolto:crt';

function readCrt(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(CRT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCrt(on: boolean) {
  try {
    localStorage.setItem(CRT_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked: preference lasts for this page view only */
  }
}

interface Prefs {
  crt: boolean;
  toggleCrt: () => void;
  /** Sound is always off on load (no autoplay); it only turns on from a click or key press. */
  sound: boolean;
  toggleSound: () => void;
  blip: (kind?: 'ok' | 'tick') => void;
  reducedMotion: boolean;
}

const PrefsContext = createContext<Prefs | null>(null);

type AudioModule = typeof import('./audio');
let audioMod: Promise<AudioModule> | null = null;
// Browsers remember a failed dynamic import per URL, so a plain second import('./audio') fails
// again without asking the network. After a failure the chunk's URL is taken from the error and
// loaded again with a throwaway query string, which makes the browser fetch it anew.
let chunkUrl: string | null = null;
let attempts = 0;
function importAudio(): Promise<AudioModule> {
  if (!chunkUrl) return import('./audio');
  return import(/* @vite-ignore */ `${chunkUrl}?retry=${++attempts}`) as Promise<AudioModule>;
}

/** The audio chunk loads on first use. A failed load is not cached: the next call tries again. */
const loadAudio = (): Promise<AudioModule> =>
  (audioMod ??= importAudio().catch((err) => {
    audioMod = null;
    chunkUrl ??= /https?:\/\/[^\s?'"]+\.js/.exec(String(err?.message))?.[0] ?? null;
    throw err;
  }));

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [crt, setCrt] = useState(false);
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setCrt(readCrt());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('crt', crt);
  }, [crt]);

  const toggleCrt = useCallback(() => {
    setCrt((v) => {
      writeCrt(!v);
      return !v;
    });
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundRef.current;
    soundRef.current = next;
    setSound(next);
    // Loading or starting can fail (a dropped chunk, a refused audio context): then sound is off again.
    void loadAudio()
      .then((m) => (next ? m.startMusic() : m.stopMusic()))
      .catch(() => {
        if (next && soundRef.current) {
          soundRef.current = false;
          setSound(false);
        }
      });
  }, []);

  const blip = useCallback(
    (kind: 'ok' | 'tick' = 'ok') => {
      if (!sound) return;
      void loadAudio().then((m) => m.blip(kind)).catch(() => {});
    },
    [sound],
  );

  const value = useMemo(
    () => ({ crt, toggleCrt, sound, toggleSound, blip, reducedMotion }),
    [crt, toggleCrt, sound, toggleSound, blip, reducedMotion],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs outside PrefsProvider');
  return ctx;
}
