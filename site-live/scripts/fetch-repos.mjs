// Snapshot everything /projects shows about the kolto-labs org into
// src/content/github-aggregate.json, so the prerendered HTML has real data. Runs before the build.
// Never fails the build: on any error the existing snapshot stays as it is.
// GITHUB_TOKEN is optional (it only raises the rate limit) and is never logged or written.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORG } from '../src/content/repo-filter.mjs';
import { RAW, collectRepos } from '../src/content/aggregate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'src/content/github-aggregate.json');
const contentFile = join(root, '..', 'content/site-content.json');
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'koltolabs-site-build' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function api(url) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 202 || res.status === 204) return { status: res.status, json: null, link: null };
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${url.replace('https://api.github.com', '')}`);
  return { status: res.status, json: await res.json(), link: res.headers.get('link') };
}

async function raw(url) {
  // Raw files never take the token: they need none, and it should not travel further than it must.
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`raw.githubusercontent.com answered ${res.status} for ${url}`);
  return res.text();
}

// Which files exist, as the aggregator probes them: raw URL -> true (read) or false (404). A read
// that threw is left out of `seen` and put in `broke`, because nothing is known about that file.
const seen = new Map();
const broke = new Set();
async function rawSeen(url) {
  try {
    const text = await raw(url);
    seen.set(url, text !== null);
    return text;
  } catch (err) {
    broke.add(url);
    throw err;
  }
}

/**
 * Paths of the files that exist in repo `r` (see SnapshotFiles in src/content/types.ts). The browser
 * reads these and nothing else, so the 404s are paid here, once per build, and not on every page load.
 * When a read failed, the paths from `oldRepo` stay; with no earlier list there is nothing safe to
 * claim, so this returns undefined and the browser keeps the snapshot's values for the repo.
 */
function filesOf(r, oldRepo) {
  const base = `${RAW}/${ORG}/${r.name}/${r.defaultBranch}/`;
  const found = new Set();
  for (const [url, ok] of seen) if (ok && url.startsWith(base)) found.add(url.slice(base.length));
  if ([...broke].some((url) => url.startsWith(base))) {
    if (!Array.isArray(oldRepo?.files)) return undefined;
    for (const p of oldRepo.files) if (seen.get(base + p) !== false) found.add(p);
  }
  return [...found].sort();
}

let old = null;
try {
  old = JSON.parse(readFileSync(file, 'utf8'));
} catch {}

try {
  // The snapshot is the one place that gets the full tier (contributors, weekly commits).
  const collected = await collectRepos({ api, raw: rawSeen, prev: old?.repos ?? [], stats: true });
  const { failed, pending } = collected;
  const before = new Map((old?.repos ?? []).map((p) => [p.name.toLowerCase(), p]));
  const repos = collected.repos.map((r) => {
    const files = filesOf(r, before.get(r.name.toLowerCase()));
    return files ? { ...r, files } : r;
  });
  if (failed) console.warn(`[repos] WARNING: ${failed} request(s) failed; those fields keep their earlier values`);
  if (pending) console.warn(`[repos] NOTE: ${pending} stats endpoint(s) still being computed by GitHub (202); those keep their earlier values`);
  const same = JSON.stringify(old?.repos) === JSON.stringify(repos);
  if (!same) writeFileSync(file, JSON.stringify({ org: ORG, fetchedAt: new Date().toISOString(), repos }, null, 2) + '\n');

  const have = new Set(repos.map((r) => r.name.toLowerCase()));
  let missing = [];
  try {
    missing = JSON.parse(readFileSync(contentFile, 'utf8')).projects.filter((p) => p.status === 'released' && !have.has(p.slug.toLowerCase())).map((p) => p.slug);
  } catch {}
  if (missing.length) console.warn(`[repos] WARNING: curated released projects with no public repo (they will not be listed): ${missing.join(', ')}`);

  console.log(`[repos] ${repos.length} public repos from ${ORG}${same ? ' (unchanged)' : ''}`);
  for (const r of repos) {
    const s = r.stats;
    const weeks = s.weeklyCommits ? `${s.weeklyCommits.reduce((a, b) => a + b, 0)} commits/52w` : 'weekly commits n/a';
    console.log(
      `[repos]   ${r.name}: release ${r.release ? r.release.tag + (r.release.prerelease ? ' (prerelease)' : '') : 'none'}, ${s.stars} stars, ` +
        `${s.downloads} downloads, contributors ${s.contributors ?? 'n/a'}, ${weeks}, ` +
        `crates [${r.crates.map((c) => c.name + (c.bin ? '*' : '')).join(', ')}], features ${r.features.length}, dependsOn ${JSON.stringify(r.dependsOn)}, files ${r.files ? r.files.length : 'unknown'}`,
    );
  }
} catch (err) {
  console.warn(`[repos] fetch failed (${err.message}); keeping the existing snapshot`);
}
