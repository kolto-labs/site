import type { AddResult, MediaFileInfo, MediaHost, MediaRecord, MediaSource, MediaStoreAdapter } from '../../index';
import type { AdaptiveMusicConfig } from '../../core/config';
import { AdaptiveMusicError } from '../../core/errors';
import { accepted, caps, decode, hash, norm } from './ingest';
import type { Res } from './player';
import { createPlayer } from './player';
import { idbStore, memoryStore } from './store';

export const kind = 'media' as const;

const E = (code: AdaptiveMusicError['code']): AdaptiveMusicError => new AdaptiveMusicError(code);

export function create(h: MediaHost): MediaSource {
  let mem = h.store === null;
  let st: MediaStoreAdapter = h.store ?? (mem ? memoryStore() : idbStore(h.prefix + '-media'));
  let ids: readonly string[] = [];
  const res = new Map<string, Res>();
  const loading = new Map<string, Promise<Res | null>>();

  const S = async <T>(f: (s: MediaStoreAdapter) => Promise<T>): Promise<T> => {
    try {
      return await f(st);
    } catch (err) {
      if ((err as DOMException | null)?.name === 'QuotaExceededError') throw new AdaptiveMusicError('storage-full', undefined, err);
      if (mem) throw err;
      mem = true;
      st = memoryStore();
      h.warn('storage-unavailable', err);
      return f(st);
    }
  };

  const recs = async (): Promise<readonly MediaRecord[]> => {
    const l = await S((s) => s.list());
    ids = l.map((r) => r.id);
    return l;
  };
  const info = (l: readonly MediaRecord[]): MediaFileInfo[] =>
    l.map((r) => ({ id: r.id, size: r.size, type: r.type, seconds: r.seconds, analysed: false, confidence: 0 }));

  const prime = (id: string | null): Promise<Res | null> => {
    const c = h.ctx();
    if (!id || !c) return Promise.resolve(null);
    const have = res.get(id);
    if (have) return Promise.resolve(have);
    let p = loading.get(id);
    if (!p) {
      p = (async () => {
        const r = await S((s) => s.get(id));
        if (!r) return null;
        const buf = await decode(await r.blob.arrayBuffer(), h.lite(), c);
        const x = { id, buf, g: norm(buf) };
        for (const k of [...res.keys()]) if (k !== pl.current()) res.delete(k);
        res.set(id, x);
        return x;
      })()
        .catch(() => null)
        .finally(() => loading.delete(id));
      loading.set(id, p);
    }
    return p;
  };

  const pl = createPlayer(h, { ids: () => ids, get: (id) => res.get(id), prime });

  const one = async (f: File | Blob, cap: AdaptiveMusicConfig['limits']): Promise<string> => {
    if (!accepted(f.type)) throw E('unsupported-type');
    if (f.size > cap.maxBytes) throw E('too-large');
    if (!globalThis.crypto?.subtle) throw E('unsupported');
    const buf = await f.arrayBuffer();
    const id = await hash(buf);
    const l = await recs();
    if (ids.includes(id)) return id;
    if (l.length >= cap.maxFiles || l.reduce((n, r) => n + r.size, f.size) > cap.maxBytes) throw E('storage-full');
    let a: AudioBuffer;
    try {
      a = await decode(buf, h.lite(), null);
    } catch {
      throw E('decode-failed');
    }
    if (a.duration > cap.maxSeconds) throw E('too-long');
    await S((s) => s.put({ id, blob: new Blob([f], { type: f.type }), type: f.type, size: f.size, seconds: a.duration, addedAt: Date.now() }));
    return id;
  };

  return {
    ...pl.src,
    async add(files) {
      const cap = caps(h.limits(), h.lite());
      const out: AddResult[] = [];
      for (const f of files) {
        try {
          out.push({ ok: true, id: await one(f, cap) });
        } catch (err) {
          out.push({ ok: false, code: err instanceof AdaptiveMusicError ? err.code : 'decode-failed' });
        }
      }
      h.files(info(await recs()));
      if (pl.current()) void prime(pl.next());
      return out;
    },
    async remove(x) {
      await S((s) => s.delete(x));
      for (const id of x === 'all' ? [...res.keys()] : x) if (id !== pl.current()) res.delete(id);
      h.files(info(await recs()));
      pl.cut();
    },
    async list() {
      return info(await recs());
    },
    async ready(p) {
      if (!(await recs()).length) return false;
      return !p || !h.ctx() || !!(await prime(pl.want()));
    },
  };
}
