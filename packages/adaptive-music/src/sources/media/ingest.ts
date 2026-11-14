import type { AdaptiveMusicConfig } from '../../core/config';

type Limits = AdaptiveMusicConfig['limits'];

const TIER: Readonly<Record<'full' | 'lite', Limits>> = {
  full: { maxFiles: 30, maxBytes: 500 * 1048576, maxSeconds: 720 },
  lite: { maxFiles: 10, maxBytes: 150 * 1048576, maxSeconds: 480 },
};

export const caps = (l: Limits, lite: boolean): Limits => {
  const t = TIER[lite ? 'lite' : 'full'];
  return { maxFiles: Math.min(l.maxFiles, t.maxFiles), maxBytes: Math.min(l.maxBytes, t.maxBytes), maxSeconds: Math.min(l.maxSeconds, t.maxSeconds) };
};

export const accepted = (type: string): boolean => type === '' || type === 'application/ogg' || type.startsWith('audio/');

export async function hash(b: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b));
  let s = '';
  for (const x of d) s += x.toString(16).padStart(2, '0');
  return s;
}

const yieldNow = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export async function decode(b: ArrayBuffer, lite: boolean, c: BaseAudioContext | null): Promise<AudioBuffer> {
  const a = await (lite ? new OfflineAudioContext(1, 1, 24000) : c ?? new OfflineAudioContext(2, 1, 48000)).decodeAudioData(b);
  const n = a.numberOfChannels;
  if (!lite || n === 1) return a;
  const m = new AudioBuffer({ length: a.length, sampleRate: a.sampleRate, numberOfChannels: 1 });
  const o = m.getChannelData(0);
  for (let ch = 0; ch < n; ch++) {
    const d = a.getChannelData(ch);
    for (let i = 0; i < d.length; i += 1 << 20) {
      const e = Math.min(d.length, i + (1 << 20));
      for (let k = i; k < e; k++) o[k] += d[k] / n;
      await yieldNow();
    }
  }
  return m;
}

export function norm(a: AudioBuffer): number {
  let s = 0;
  let k = 0;
  for (let ch = 0; ch < a.numberOfChannels; ch++) {
    const d = a.getChannelData(ch);
    for (let i = 0; i < d.length; i += 31, k++) s += d[i] * d[i];
  }
  const db = 10 * Math.log10(s / Math.max(1, k) + 1e-12);
  return Math.min(4, Math.max(0.05, Math.pow(10, (-19.5 - db) / 20)));
}
