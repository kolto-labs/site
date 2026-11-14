import { useEffect, useState } from 'react';
import { buildAggregate, snapshotAggregate, snapshotRepos, type RepoData } from '../content/repos';
import { RAW, collectRepos, type ApiFn, type RawFn } from '../content/aggregate.mjs';
import type { ProjectsAggregate } from '../content/project-contract';
import { ORG, keepRepo } from '../content/repo-filter.mjs';
import type { SnapshotFiles } from '../content/types';

/**
 * Live GitHub data, kept cheap. Unauthenticated callers get 60 api.github.com requests per
 * hour per IP, and a 304 answer to If-None-Match still counts against that. So the budget is
 * spent by caching, not by revalidating:
 * - two tiers: "light" (org list + releases, 1 + N requests) and "full" (adds contributors and
 *   commit activity, 1 + 3N). Only /projects asks for full. A full result also serves light views,
 *   but a light run never renews the stats: they carry their own `statsT` age;
 * - the result is cached for 15 minutes in localStorage (shared by tabs) and in module scope
 *   (so blocked storage still has a TTL);
 * - a run with any failed request is stored as not live and backs off for the same 15 minutes;
 * - a stats endpoint that answers 202 (still computing) is not a failure: the run stays live, the
 *   stats keep their old age, and only the full tier asks again after 2 minutes;
 * - file reads go to raw.githubusercontent.com, which has no limit and takes no custom headers. For a
 *   repo in the build snapshot only the files it lists are requested (see `readListed`), because a
 *   probe that misses is a 404 the browser prints to the console. Repos newer than the snapshot are
 *   read in full, since nothing is known about their files;
 * - ETags are kept and sent, which saves bandwidth (and quota for token holders).
 */
// Entries from earlier versions of this cache.
try {
  for (const k of ['kolto:aggregate:v2', 'kolto:aggregate-fail:v2', 'kolto:etags:v2', 'kolto:aggregate:v3', 'kolto:aggregate-fail:v3', 'kolto:etags:v3']) localStorage.removeItem(k);
} catch {}

const RESULT_KEY = 'kolto:aggregate:v4';
const FAIL_KEY = 'kolto:aggregate-fail:v4';
const ETAG_KEY = 'kolto:etags:v4';
const TTL_MS = 15 * 60 * 1000;
/** How soon the stats are asked for again when GitHub answered "still computing" (202). */
const PENDING_RETRY_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 10_000;

export interface Stored {
  t: number;
  repos: RepoData[];
  /** When contributors and commit activity were last fetched in full; null if never. */
  statsT: number | null;
  /** False when some request failed during the run. */
  complete: boolean;
  /** When a full run left stats pending (HTTP 202); null or missing when the stats are settled. */
  statsPendingAt?: number | null;
}

/** True when a failure at `failAt` (0 = none) still holds requests back. */
export function backedOff(failAt: number, now: number): boolean {
  return failAt > 0 && now - failAt < TTL_MS;
}

/** True when `stored` answers a light (or, with `full`, a full) view without any request. */
export function isFresh(stored: Stored | null | undefined, now: number, full: boolean): stored is Stored {
  if (!stored || !stored.complete || now - stored.t >= TTL_MS) return false;
  if (!full) return true;
  if (stored.statsPendingAt) return now - stored.statsPendingAt < PENDING_RETRY_MS;
  return stored.statsT !== null && stored.statsT !== undefined && now - stored.statsT < TTL_MS;
}
type EtagMap = Record<string, { etag: string; status: number; json: unknown; link: string | null }>;

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

// Module-scope copies: they keep the TTL and the backoff when storage is blocked.
let lastRun: Stored | null = null;
let lastFailAt = 0;

function readResult(): Stored | null {
  const s = readJson<Stored>(RESULT_KEY);
  const kept = s && Array.isArray(s.repos) ? s.repos.filter(keepRepo) : [];
  const stored = s && typeof s.t === 'number' && kept.length ? { ...s, repos: kept } : null;
  return stored && (!lastRun || stored.t > lastRun.t) ? stored : lastRun;
}

function makeApi(etags: EtagMap, used: Set<string>): ApiFn {
  return async (url) => {
    used.add(url);
    const known = etags[url];
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', ...(known ? { 'If-None-Match': known.etag } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 304 && known) return { status: known.status, json: known.json, link: known.link };
    if (res.status === 202 || res.status === 204) return { status: res.status, json: null, link: null };
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const json = await res.json();
    const link = res.headers.get('link');
    const etag = res.headers.get('etag');
    // The stored copy of the org list only ever holds repos the site lists.
    if (etag) etags[url] = { etag, status: res.status, json: Array.isArray(json) && url.includes('/orgs/') ? json.filter(keepRepo) : json, link };
    return { status: res.status, json, link };
  };
}

// No custom headers: raw.githubusercontent.com rejects the CORS preflight they would cause.
const raw: RawFn = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`raw answered ${res.status}`);
  return res.text();
};

/**
 * Every repo in the snapshot: "<raw base>/" -> the paths that existed there when it was built, or
 * null when the snapshot has no `files` for it (it predates the field, or the build could not read
 * the repo completely). Read from the snapshot itself, because a live run builds its repos fresh
 * and drops `files`. A repo that is not here (created, renamed or moved to another default branch
 * since the build) is not null: it is a repo the snapshot knows nothing about.
 */
const snapshotFiles = new Map<string, Set<string> | null>();
for (const r of snapshotRepos as (RepoData & SnapshotFiles)[]) {
  snapshotFiles.set(`${RAW}/${ORG}/${r.name}/${r.defaultBranch}/`, Array.isArray(r.files) ? new Set(r.files) : null);
}

/** Thrown for a file of a snapshot repo that has no file list. */
class Unlisted extends Error {}

/**
 * `raw`, but a repo in the snapshot is read only at the files it lists. The aggregator probes Cargo.toml,
 * package.json and every crate's src/main.rs, and a probe that misses is a 404 in the console, so a file
 * the snapshot did not list answers null (absent) without a request.
 * - A snapshot repo with no list is unknown, which is not the same as absent: null would wipe its crates
 *   and features, so this throws. The aggregator keeps that repo's earlier values and counts one failed
 *   read per file, which `run` takes back off.
 * - A repo that is not in the snapshot has no earlier values to keep, so it is read for real. Its misses
 *   show as a few console 404s until the next build lists it. Its failures count as failures.
 */
function readListed(unlisted: { n: number }): RawFn {
  return async (url) => {
    for (const [base, files] of snapshotFiles) {
      if (!url.startsWith(base)) continue;
      if (files) return files.has(url.slice(base.length)) ? raw(url) : null;
      unlisted.n++;
      throw new Unlisted(url);
    }
    return raw(url);
  };
}

let latest: ProjectsAggregate | null = null;
// One run at a time. It starts on the next tick, so components that mount together
// (a page asking for stats, the nav asking for releases) share a single run at the highest tier.
let job: { full: boolean; started: boolean; promise: Promise<ProjectsAggregate | null> } | null = null;

const agg = (s: Stored, live: boolean) => buildAggregate(s.repos, { fetchedAt: new Date(s.t).toISOString(), live });

async function run(full: boolean, cached: Stored | null): Promise<ProjectsAggregate | null> {
  const etags = readJson<EtagMap>(ETAG_KEY) ?? {};
  const used = new Set<string>();
  const unlisted = { n: 0 };
  try {
    // Per-field fallback: what this run cannot read keeps the stale cache's (or snapshot's) value.
    const { repos, failed, pending } = await collectRepos({ api: makeApi(etags, used), raw: readListed(unlisted), prev: cached?.repos ?? snapshotRepos, stats: full });
    // A file with no list is not a failed request: none was made. It counted as one failed read, so take it off.
    const complete = failed === unlisted.n;
    // A light run re-stamps `t` but carries the old stats (and their age) over. So does a full run
    // that left stats pending: the new stats are not all in, and `statsPendingAt` schedules a retry.
    const now = Date.now();
    const statsDone = full && pending === 0;
    const stored: Stored = {
      t: now,
      repos,
      statsT: statsDone ? now : (cached?.statsT ?? null),
      complete,
      statsPendingAt: full ? (pending > 0 ? now : null) : (cached?.statsPendingAt ?? null),
    };
    lastRun = stored;
    write(RESULT_KEY, JSON.stringify(stored));
    for (const u of Object.keys(etags)) if (!used.has(u)) delete etags[u];
    write(ETAG_KEY, JSON.stringify(etags));
    if (complete) {
      lastFailAt = 0;
      write(FAIL_KEY, null);
    } else {
      lastFailAt = Date.now();
      write(FAIL_KEY, String(lastFailAt));
    }
    latest = agg(stored, complete);
    return latest;
  } catch {
    lastFailAt = Date.now();
    write(FAIL_KEY, String(lastFailAt));
    return cached ? agg(cached, false) : null; // the stale cache, or null so the snapshot stays
  }
}

const failAt = () => Math.max(lastFailAt, Number(readJson<number>(FAIL_KEY) ?? 0));

/** The answer when no request is needed (fresh cache, or backing off after a failure); null when a run is due. */
function settled(full: boolean): ProjectsAggregate | null | undefined {
  const cached = readResult();
  const now = Date.now();
  if (isFresh(cached, now, full)) {
    latest = agg(cached, true);
    return latest;
  }
  if (backedOff(failAt(), now)) return cached ? agg(cached, false) : null;
  return undefined;
}

export function refresh(full: boolean): Promise<ProjectsAggregate | null> {
  const done = settled(full);
  if (done !== undefined) return Promise.resolve(done);
  if (job && !job.started) {
    job.full ||= full;
    return job.promise;
  }
  if (job && (job.full || !full)) return job.promise;
  const prior = job?.promise ?? Promise.resolve(null); // a light run is under way: let it finish first
  const mine: NonNullable<typeof job> = {
    full,
    started: false,
    promise: prior
      .then(() => new Promise<void>((r) => setTimeout(r, 0)))
      .then(() => {
        mine.started = true;
        // The run before this one may have refreshed the data or failed: look again before spending requests.
        const again = settled(mine.full);
        return again !== undefined ? again : run(mine.full, readResult());
      })
      .finally(() => {
        if (job === mine) job = null;
      }),
  };
  job = mine;
  return mine.promise;
}

/**
 * Everything /projects shows, aggregated from the kolto-labs org. Starts from the build-time
 * snapshot (it matches the prerendered HTML), then swaps in GitHub data after mount.
 * `live` is true only when a run finished with no failed request.
 * Pass `{ stats: true }` for contributors and commit activity (only /projects needs them).
 */
export function useProjects(opts: { stats?: boolean } = {}): ProjectsAggregate {
  const full = Boolean(opts.stats);
  // `latest` is null while the page hydrates, so the first client render equals the prerender.
  const [data, setData] = useState<ProjectsAggregate>(() => latest ?? snapshotAggregate);
  useEffect(() => {
    let mounted = true;
    void refresh(full).then((fresh) => {
      if (mounted && fresh) setData(fresh);
    });
    return () => {
      mounted = false;
    };
  }, [full]);
  return data;
}
