import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repo } from './helpers';

const MIN = 60_000;
const T0 = new Date('2026-10-04T12:00:00Z').getTime();
const RESULT_KEY = 'kolto:aggregate:v4';
const FAIL_KEY = 'kolto:aggregate-fail:v4';

type Mod = typeof import('../src/lib/useProjects');

// ---- pure helpers ----------------------------------------------------------------------
describe('isFresh and backedOff', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  const { isFresh, backedOff } = await import('../src/lib/useProjects');
  vi.unstubAllGlobals();
  const stored = (over: Record<string, unknown> = {}) => ({ t: T0, repos: [repo('a')], statsT: T0, complete: true, ...over });
  const full = 15 * MIN;

  it('a complete, young run is fresh for light views', () => {
    expect(isFresh(stored(), T0 + 1, false)).toBe(true);
    expect(isFresh(stored(), T0 + full - 1, false)).toBe(true);
    expect(isFresh(stored(), T0 + full, false)).toBe(false);
  });

  it('is never fresh when null or incomplete', () => {
    expect(isFresh(null, T0, false)).toBe(false);
    expect(isFresh(undefined, T0, false)).toBe(false);
    expect(isFresh(stored({ complete: false }), T0, false)).toBe(false);
  });

  it('a full view also needs young statsT', () => {
    expect(isFresh(stored({ statsT: T0 - full }), T0, false)).toBe(true);
    expect(isFresh(stored({ statsT: T0 - full }), T0, true)).toBe(false);
    expect(isFresh(stored({ statsT: T0 - full + 1 }), T0, true)).toBe(true);
    expect(isFresh(stored({ statsT: null }), T0, true)).toBe(false);
  });

  it('pending stats are retried after 2 minutes, not 15', () => {
    const s = stored({ statsT: null, statsPendingAt: T0 });
    expect(isFresh(s, T0 + 2 * MIN - 1, true)).toBe(true);
    expect(isFresh(s, T0 + 2 * MIN, true)).toBe(false);
    expect(isFresh(s, T0 + 2 * MIN, false)).toBe(true);
  });

  it('backedOff holds for 15 minutes after a failure and never for 0', () => {
    expect(backedOff(0, T0)).toBe(false);
    expect(backedOff(T0, T0 + full - 1)).toBe(true);
    expect(backedOff(T0, T0 + full)).toBe(false);
  });
});

// ---- refresh() with a fake GitHub ------------------------------------------------------
interface Server {
  releases: number | 'ok';
  contributors: number | 'ok';
  commits: number | 'ok';
  orgList: number | 'ok';
  gate?: Promise<void>;
  calls: string[];
}

const orgRepo = {
  name: 'alpha',
  html_url: 'https://github.com/kolto-labs/alpha',
  default_branch: 'main',
  stargazers_count: 1,
  private: false,
  archived: false,
  fork: false,
};

function respond(status: number | 'ok', okBody: unknown, headers: Record<string, string> = {}) {
  if (status === 'ok') return new Response(JSON.stringify(okBody), { status: 200, headers });
  if (status === 202 || status === 204) return new Response(null, { status });
  return new Response('{}', { status });
}

function makeServer(over: Partial<Server> = {}): Server & { fetch: typeof fetch; api: () => string[]; count: (s: string) => number } {
  const s: Server = { releases: 'ok', contributors: 'ok', commits: 'ok', orgList: 'ok', calls: [], ...over };
  const fetcher = async (input: unknown) => {
    const url = String(input);
    s.calls.push(url);
    if (url.startsWith('https://raw.githubusercontent.com')) return new Response('', { status: 404 });
    if (url.includes('/orgs/')) {
      if (s.gate) await s.gate;
      return respond(s.orgList, [orgRepo]);
    }
    if (url.includes('/releases')) return respond(s.releases, []);
    if (url.includes('/contributors')) return respond(s.contributors, [{}], { link: '<https://api.github.com/x?page=6>; rel="last"' });
    if (url.includes('/stats/commit_activity')) return respond(s.commits, [{ total: 5 }]);
    return new Response('{}', { status: 500 });
  };
  return Object.assign(s, {
    fetch: fetcher as unknown as typeof fetch,
    api: () => s.calls.filter((u) => u.startsWith('https://api.github.com')),
    count: (part: string) => s.calls.filter((u) => u.includes(part)).length,
  });
}

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}

const blockedStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const seed = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ t: T0 - MIN, repos: [repo('alpha')], statsT: T0 - MIN, complete: true, statsPendingAt: null, ...over });

async function setup(server: ReturnType<typeof makeServer>, storage: unknown = memoryStorage()) {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('fetch', server.fetch);
  const mod: Mod = await import('../src/lib/useProjects');
  return mod;
}

/** Let the next-tick job start and every pending promise finish. */
async function done<T>(p: Promise<T>): Promise<T> {
  let finished = false;
  void p.then(
    () => (finished = true),
    () => (finished = true),
  );
  for (let i = 0; i < 50 && !finished; i++) await vi.advanceTimersByTimeAsync(0);
  return p;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('refresh()', () => {
  it('a fresh cache makes 0 fetches, for light and full', async () => {
    const server = makeServer();
    const { refresh } = await setup(server, memoryStorage({ [RESULT_KEY]: seed() }));
    const light = await done(refresh(false));
    const full = await done(refresh(true));
    expect(server.calls).toEqual([]);
    expect(light?.live).toBe(true);
    expect(full?.listed[0].slug).toBe('alpha');
  });

  it('a stale statsT refetches only the full tier', async () => {
    const server = makeServer();
    const { refresh } = await setup(server, memoryStorage({ [RESULT_KEY]: seed({ statsT: T0 - 20 * MIN }) }));
    await done(refresh(false));
    expect(server.calls).toEqual([]);
    await done(refresh(true));
    expect(server.count('/contributors')).toBe(1);
    expect(server.count('/stats/commit_activity')).toBe(1);
  });

  it('a light run keeps statsT and its age', async () => {
    const old = T0 - 30 * MIN;
    const storage = memoryStorage({ [RESULT_KEY]: seed({ t: T0 - 20 * MIN, statsT: old }) });
    const server = makeServer();
    const { refresh } = await setup(server, storage);
    await done(refresh(false));
    expect(server.count('/contributors') + server.count('/stats/commit_activity')).toBe(0);
    expect(server.count('/orgs/')).toBe(1);
    const stored = JSON.parse(storage.getItem(RESULT_KEY)!);
    expect(stored.statsT).toBe(old);
    expect(stored.t).toBe(T0);
    expect(stored.complete).toBe(true);
  });

  it('a full run stamps statsT', async () => {
    const storage = memoryStorage();
    const { refresh } = await setup(makeServer(), storage);
    await done(refresh(true));
    const stored = JSON.parse(storage.getItem(RESULT_KEY)!);
    expect(stored.statsT).toBe(T0);
    expect(stored.repos[0].stats).toMatchObject({ contributors: 6, weeklyCommits: [5] });
  });

  describe('failure backoff', () => {
    it('a run with a failed request is stored as not live and backs off for 15 minutes', async () => {
      const server = makeServer({ releases: 500 });
      const storage = memoryStorage();
      const { refresh } = await setup(server, storage);
      const first = await done(refresh(false));
      expect(first?.live).toBe(false);
      expect(JSON.parse(storage.getItem(RESULT_KEY)!).complete).toBe(false);
      expect(storage.getItem(FAIL_KEY)).toBe(String(T0));
      const calls = server.calls.length;

      vi.setSystemTime(T0 + 14 * MIN);
      const again = await done(refresh(false));
      expect(server.calls).toHaveLength(calls);
      expect(again?.live).toBe(false);

      vi.setSystemTime(T0 + 15 * MIN);
      await done(refresh(false));
      expect(server.calls.length).toBeGreaterThan(calls);
    });

    it('a 403 from GitHub counts as a failure', async () => {
      const server = makeServer({ contributors: 403 });
      const storage = memoryStorage();
      const { refresh } = await setup(server, storage);
      const r = await done(refresh(true));
      expect(r?.live).toBe(false);
      expect(storage.getItem(FAIL_KEY)).toBe(String(T0));
    });

    it('a failed org list returns the stale cache, or null with none, and backs off', async () => {
      const server = makeServer({ orgList: 500 });
      const storage = memoryStorage();
      const { refresh } = await setup(server, storage);
      expect(await done(refresh(false))).toBeNull();
      const calls = server.calls.length;
      vi.setSystemTime(T0 + 5 * MIN);
      expect(await done(refresh(false))).toBeNull();
      expect(server.calls).toHaveLength(calls);

      const stale = makeServer({ orgList: 500 });
      const m = memoryStorage({ [RESULT_KEY]: seed({ t: T0 - 60 * MIN, statsT: T0 - 60 * MIN }) });
      vi.setSystemTime(T0);
      const { refresh: refresh2 } = await setup(stale, m);
      const r = await done(refresh2(false));
      expect(r?.live).toBe(false);
      expect(r?.listed[0].slug).toBe('alpha');
    });

    it('a failure recorded by another tab is honoured', async () => {
      const server = makeServer();
      const { refresh } = await setup(server, memoryStorage({ [FAIL_KEY]: String(T0 - MIN) }));
      expect(await done(refresh(false))).toBeNull();
      expect(server.calls).toEqual([]);
    });

    it('a success clears the recorded failure', async () => {
      const storage = memoryStorage({ [FAIL_KEY]: String(T0 - 20 * MIN) });
      const { refresh } = await setup(makeServer(), storage);
      await done(refresh(false));
      expect(storage.getItem(FAIL_KEY)).toBeNull();
    });
  });

  describe('pending stats (202)', () => {
    it('is not a failure, keeps the run live, and retries after 2 minutes', async () => {
      const server = makeServer({ contributors: 202 });
      const storage = memoryStorage();
      const { refresh } = await setup(server, storage);
      const r = await done(refresh(true));
      expect(r?.live).toBe(true);
      expect(storage.getItem(FAIL_KEY)).toBeNull();
      const stored = JSON.parse(storage.getItem(RESULT_KEY)!);
      expect(stored.statsT).toBeNull();
      expect(stored.statsPendingAt).toBe(T0);
      const calls = server.calls.length;

      vi.setSystemTime(T0 + 119_000);
      await done(refresh(true));
      expect(server.calls).toHaveLength(calls);

      server.contributors = 'ok';
      vi.setSystemTime(T0 + 2 * MIN);
      await done(refresh(true));
      expect(server.calls.length).toBeGreaterThan(calls);
      const after = JSON.parse(storage.getItem(RESULT_KEY)!);
      expect(after.statsT).toBe(T0 + 2 * MIN);
      expect(after.statsPendingAt).toBeNull();
    });

    it('light views stay fresh while stats are pending', async () => {
      const server = makeServer({ commits: 204 });
      const { refresh } = await setup(server);
      await done(refresh(true));
      const calls = server.calls.length;
      vi.setSystemTime(T0 + 5 * MIN);
      await done(refresh(false));
      expect(server.calls).toHaveLength(calls);
    });
  });

  it('blocked storage still has a TTL and a backoff', async () => {
    const server = makeServer();
    const { refresh } = await setup(server, blockedStorage);
    const r = await done(refresh(false));
    expect(r?.live).toBe(true);
    const calls = server.calls.length;
    expect(calls).toBeGreaterThan(0);

    vi.setSystemTime(T0 + MIN);
    await done(refresh(false));
    expect(server.calls).toHaveLength(calls);

    vi.setSystemTime(T0 + 16 * MIN);
    await done(refresh(false));
    expect(server.calls.length).toBeGreaterThan(calls);
  });

  it('blocked storage keeps the failure backoff too', async () => {
    const server = makeServer({ orgList: 500 });
    const { refresh } = await setup(server, blockedStorage);
    expect(await done(refresh(false))).toBeNull();
    const calls = server.calls.length;
    vi.setSystemTime(T0 + MIN);
    await done(refresh(false));
    expect(server.calls).toHaveLength(calls);
  });

  describe('job merging', () => {
    it('same-tick light and full requests share one run at the full tier', async () => {
      const server = makeServer();
      const { refresh } = await setup(server);
      const a = refresh(false);
      const b = refresh(true);
      const c = refresh(false);
      expect(b).toBe(a);
      expect(c).toBe(a);
      await done(a);
      expect(server.count('/orgs/')).toBe(1);
      expect(server.count('/contributors')).toBe(1);
    });

    it('a full request queued behind a failed light run makes 0 calls', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const server = makeServer({ releases: 500, gate });
      const { refresh } = await setup(server);
      const light = refresh(false);
      await vi.advanceTimersByTimeAsync(0); // the light run starts and waits at the gate
      expect(server.count('/orgs/')).toBe(1);
      const full = refresh(true); // queued behind the light run
      expect(full).not.toBe(light);
      release();
      const [l, f] = await Promise.all([done(light), done(full)]);
      expect(l?.live).toBe(false);
      expect(f?.live).toBe(false);
      expect(server.count('/orgs/')).toBe(1);
      expect(server.count('/contributors')).toBe(0);
      expect(server.count('/stats/commit_activity')).toBe(0);
    });

    it('a full request queued behind a good light run still runs, once', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const server = makeServer({ gate });
      const { refresh } = await setup(server);
      const light = refresh(false);
      await vi.advanceTimersByTimeAsync(0);
      const full = refresh(true);
      release();
      await Promise.all([done(light), done(full)]);
      expect(server.count('/orgs/')).toBe(2);
      expect(server.count('/contributors')).toBe(1);
    });
  });
});
