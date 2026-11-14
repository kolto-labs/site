import type { MediaRecord, MediaStoreAdapter } from '../../index';

const STORES = ['files', 'analysis', 'order'];

export function memoryStore(): MediaStoreAdapter {
  const m = new Map<string, MediaRecord>();
  return {
    async put(r) {
      m.set(r.id, r);
    },
    async get(id) {
      return m.get(id) ?? null;
    },
    async delete(ids) {
      if (ids === 'all') m.clear();
      else for (const i of ids) m.delete(i);
    },
    async list() {
      return [...m.values()];
    },
  };
}

const done = (t: IDBTransaction): Promise<void> =>
  new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(t.error);
  });

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

export function idbStore(name: string): MediaStoreAdapter {
  let db: IDBDatabase | null = null;

  const open = (create: boolean): Promise<IDBDatabase | null> =>
    db
      ? Promise.resolve(db)
      : new Promise((res, rej) => {
          const r = indexedDB.open(name, 1);
          r.onupgradeneeded = (e) => {
            if (!create && e.oldVersion === 0) return r.transaction!.abort();
            for (const s of STORES) r.result.createObjectStore(s);
          };
          r.onsuccess = () => {
            const d = r.result;
            d.onversionchange = () => {
              d.close();
              if (db === d) db = null;
            };
            res((db ??= d));
          };
          r.onerror = (e) => {
            if (create || r.error?.name !== 'AbortError') return rej(r.error);
            e.preventDefault();
            res(null);
          };
        });

  const order = async (t: IDBTransaction, f: (ids: string[]) => string[]): Promise<void> => {
    const o = t.objectStore('order');
    const ids = ((await req(o.get(0))) as string[] | undefined) ?? [];
    o.put(f(ids), 0);
  };

  return {
    async put(r) {
      const d = (await open(true))!;
      const t = d.transaction(['files', 'order'], 'readwrite');
      const { id, ...v } = r;
      t.objectStore('files').put(v, id);
      await order(t, (ids) => [...ids.filter((x) => x !== id), id]);
      await done(t);
    },
    async get(id) {
      const d = await open(false);
      if (!d) return null;
      const v = await req(d.transaction('files').objectStore('files').get(id));
      return v ? { id, ...v } : null;
    },
    async delete(ids) {
      const d = await open(false);
      if (!d) return;
      const t = d.transaction(STORES, 'readwrite');
      if (ids === 'all') for (const s of STORES) t.objectStore(s).clear();
      else {
        for (const id of ids) {
          t.objectStore('files').delete(id);
          t.objectStore('analysis').delete(IDBKeyRange.bound(id + ':', id + ':￿'));
        }
        await order(t, (o) => o.filter((x) => !ids.includes(x)));
      }
      await done(t);
    },
    async list() {
      const d = await open(false);
      if (!d) return [];
      const t = d.transaction(['files', 'order']);
      const f = t.objectStore('files');
      const [ids, keys, vals] = await Promise.all([req(t.objectStore('order').get(0)), req(f.getAllKeys()), req(f.getAll())]);
      const by = new Map(keys.map((k, i) => [k as string, { id: k as string, ...vals[i] } as MediaRecord]));
      const out: MediaRecord[] = [];
      for (const id of (ids as string[] | undefined) ?? []) {
        const r = by.get(id);
        if (r) out.push(r), by.delete(id);
      }
      return [...out, ...by.values()];
    },
  };
}
