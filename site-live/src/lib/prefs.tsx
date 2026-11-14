import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { USER_MEDIA_UI } from '../flags';
import { getEngine } from '../engine';

const CRT_KEY = 'kolto:crt';
const SOUND_KEY = 'kolto:sound';
const SOUND_COOKIE = 'kolto_sound';

function readSound(): boolean {
  try {
    const choice = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SOUND_COOKIE}=`))?.split('=')[1];
    if (choice === 'on' || choice === 'off') return choice === 'on';
  } catch {
    // Fall back to the device preference when cookies are unavailable.
  }
  return readKey(SOUND_KEY) !== 'off';
}

function writeSound(on: boolean) {
  writeKey(SOUND_KEY, on ? 'on' : 'off');
  try {
    document.cookie = `${SOUND_COOKIE}=${on ? 'on' : 'off'}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {
    // localStorage still remembers the choice when cookies are blocked.
  }
}

/* ---------- sound choices: music source, tempo, visits ---------- */

/** `media` is the visitor's own files. DEV-ONLY (USER_MEDIA_UI): never chosen or restored in production. */
export type MusicSource = 'classic' | 'generated' | 'media';
/** `range` keeps the generated score between 98 and 116 BPM; `follow` lets activity set it. */
export type TempoMode = 'range' | 'follow';
/** `off` starts every visit from zero; `local` keeps a visit count on this device. */
export type VisitsMode = 'off' | 'local';

export interface SoundChoices {
  music: MusicSource;
  tempo: TempoMode;
  visits: VisitsMode;
}

/** What the prerendered HTML shows, and what a first visit gets. */
export const SOUND_DEFAULTS: SoundChoices = Object.freeze({ music: 'classic', tempo: 'range', visits: 'off' });

const MUSIC_KEY = 'kolto:music';
const TEMPO_KEY = 'kolto:tempo';
const VISITS_MODE_KEY = 'kolto:visits-mode';
/** The visit count itself. Kept only while the mode is `local`; written by the audio router, not here. */
export const VISITS_KEY = 'kolto:visits';

function readKey(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice lasts for this page view only */
  }
}

const allowMusic = (v: string | null): v is MusicSource =>
  v === 'classic' || v === 'generated' || (USER_MEDIA_UI && v === 'media'); // DEV-ONLY (USER_MEDIA_UI)

function loadChoices(): SoundChoices {
  const music = readKey(MUSIC_KEY);
  const tempo = readKey(TEMPO_KEY);
  const visits = readKey(VISITS_MODE_KEY);
  return {
    music: allowMusic(music) ? music : SOUND_DEFAULTS.music,
    tempo: tempo === 'range' || tempo === 'follow' ? tempo : SOUND_DEFAULTS.tempo,
    visits: visits === 'off' || visits === 'local' ? visits : SOUND_DEFAULTS.visits,
  };
}

let choices: SoundChoices | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<SoundChoices>) {
  const prev = soundChoices.get();
  const next = { ...prev, ...patch };
  if (next.music === prev.music && next.tempo === prev.tempo && next.visits === prev.visits) return;
  choices = next;
  for (const fn of listeners) fn();
}

/**
 * The sound choices as a small store, so code outside React (the audio router) can read and follow them.
 * Values are read from storage on first use and written only when the visitor changes one.
 */
export const soundChoices = {
  get(): SoundChoices {
    return (choices ??= typeof window === 'undefined' ? SOUND_DEFAULTS : loadChoices());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  setMusic(music: MusicSource) {
    if (!allowMusic(music)) return;
    writeKey(MUSIC_KEY, music);
    update({ music });
  },
  setTempo(tempo: TempoMode) {
    writeKey(TEMPO_KEY, tempo);
    update({ tempo });
  },
  setVisits(visits: VisitsMode) {
    writeKey(VISITS_MODE_KEY, visits);
    if (visits === 'off') writeKey(VISITS_KEY, null);
    update({ visits });
  },
  /** Deletes the stored visit count. The mode stays as it is. */
  forgetVisits() {
    writeKey(VISITS_KEY, null);
  },
};

/** The current sound choices. The server render and hydration see the defaults; stored values follow right after. */
export function useSoundChoices(): SoundChoices {
  return useSyncExternalStore(soundChoices.subscribe, soundChoices.get, () => SOUND_DEFAULTS);
}

/**
 * DEV-ONLY (USER_MEDIA_UI): where picked files go. The audio router registers a handler later;
 * until then picked files are only counted for this page view. Adding files never turns sound on.
 */
export interface MediaFilesHandler {
  add(files: File[]): Promise<number>;
  removeAll(): Promise<void>;
}
let mediaHandler: MediaFilesHandler | null = null;
let mediaCount = 0;
const mediaListeners = new Set<() => void>();
const emitMedia = () => mediaListeners.forEach((fn) => fn());

export const mediaFiles = {
  setHandler(h: MediaFilesHandler | null) {
    mediaHandler = h;
  },
  count: () => mediaCount,
  setCount(count: number) {
    const next = Math.max(0, Math.floor(count));
    if (next === mediaCount) return;
    mediaCount = next;
    emitMedia();
  },
  subscribe(fn: () => void): () => void {
    mediaListeners.add(fn);
    return () => {
      mediaListeners.delete(fn);
    };
  },
  async add(files: File[]) {
    if (!USER_MEDIA_UI || files.length === 0) return;
    mediaCount = mediaHandler ? await mediaHandler.add(files) : mediaCount + files.length;
    emitMedia();
    soundChoices.setMusic('media');
  },
  async removeAll() {
    if (!USER_MEDIA_UI) return;
    await mediaHandler?.removeAll();
    mediaCount = 0;
    emitMedia();
    if (soundChoices.get().music === 'media') soundChoices.setMusic('classic');
  },
};

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
  /** Enabled on a first visit; an explicit choice is remembered on this device. */
  sound: boolean;
  toggleSound: () => void;
  blip: (kind?: 'ok' | 'tick') => void;
  reducedMotion: boolean;
  music: MusicSource;
  setMusic: (m: MusicSource) => void;
  tempo: TempoMode;
  setTempo: (t: TempoMode) => void;
  visits: VisitsMode;
  setVisits: (v: VisitsMode) => void;
  forgetVisits: () => void;
}

const PrefsContext = createContext<Prefs | null>(null);

type AudioModule = typeof import('./audio');
let audioMod: Promise<AudioModule> | null = null;
// Browsers remember a failed dynamic import per URL, so a plain second import('./audio') fails
// again without asking the network. After a failure the chunk's URL is taken from the error and
// loaded again with a throwaway query string, which makes the browser fetch it anew.
let chunkUrl: string | null = null;
let attempts = 0;
let soundRequest = 0;
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

async function setRoutedSound(on: boolean): Promise<void> {
  const request = ++soundRequest;
  try {
    const { startEngine } = await import('../engine');
    const engine = await startEngine();
    // The user may toggle again while the shared engine chunk is loading. Do
    // not let an older request apply after the newer intent has taken over.
    if (request !== soundRequest) return;
    const audio = await engine.audio();
    if (request !== soundRequest) return;
    await audio.setEnabled(on);
  } catch {
    if (request !== soundRequest) return;
    // Keep the existing standalone tune available if the package chunk or host cannot start.
    const audio = await loadAudio();
    if (request !== soundRequest) return;
    if (on) audio.startMusic();
    else audio.stopMusic();
  }
}

async function playRoutedBlip(kind: 'ok' | 'tick'): Promise<void> {
  try {
    const { startEngine } = await import('../engine');
    const engine = await startEngine();
    (await engine.audio()).blip(kind);
  } catch {
    const audio = await loadAudio();
    audio.blip(kind);
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [crt, setCrt] = useState(false);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    const enabled = readSound();
    soundRef.current = enabled;
    setSound(enabled);
    const failed = () => {
      if (mounted && soundRef.current) {
        soundRef.current = false;
        setSound(false);
      }
    };
    if (enabled) void setRoutedSound(true).catch(failed);
    const unlock = (event: Event) => {
      if (!event.isTrusted || !soundRef.current) return;
      if (event.target instanceof Element && event.target.closest('[data-sound-toggle]')) return;
      if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.key.toLowerCase() === 'm')) return;
      const audio = getEngine()?.audioIfLoaded();
      if (audio && audio.state !== 'running') void audio.setEnabled(true).catch(failed);
    };
    for (const name of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(name, unlock);
    return () => {
      mounted = false;
      for (const name of ['pointerdown', 'touchend', 'keydown']) window.removeEventListener(name, unlock);
      void setRoutedSound(false).catch(() => {});
    };
  }, []);

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
    writeSound(next);
    // Loading or starting can fail (a dropped chunk, a refused audio context): then sound is off again.
    void setRoutedSound(next).catch(() => {
        if (next && soundRef.current) {
          soundRef.current = false;
          setSound(false);
        }
      });
  }, []);

  const blip = useCallback(
    (kind: 'ok' | 'tick' = 'ok') => {
      if (!sound) return;
      void playRoutedBlip(kind).catch(() => {});
    },
    [sound],
  );

  const { music, tempo, visits } = useSoundChoices();

  const value = useMemo(
    () => ({
      crt,
      toggleCrt,
      sound,
      toggleSound,
      blip,
      reducedMotion,
      music,
      setMusic: soundChoices.setMusic,
      tempo,
      setTempo: soundChoices.setTempo,
      visits,
      setVisits: soundChoices.setVisits,
      forgetVisits: soundChoices.forgetVisits,
    }),
    [crt, toggleCrt, sound, toggleSound, blip, reducedMotion, music, tempo, visits],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs outside PrefsProvider');
  return ctx;
}
