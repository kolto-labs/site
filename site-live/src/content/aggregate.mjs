// The GitHub aggregator, shared by scripts/fetch-repos.mjs (build time) and
// src/lib/useProjects.ts (browser). Plain JS so Node can run it without a TypeScript step.
//
// It talks to GitHub through two injected functions, so each side picks its own transport
// (plain fetch at build time, a cached and ETag-aware fetch in the browser):
//   api(url) -> { status, json, link }   api.github.com. Resolves for 200, 202, 204; rejects otherwise.
//   raw(url) -> string | null            raw.githubusercontent.com. null on 404; rejects on other failures.
import { ORG, keepRepo } from './repo-filter.mjs';
import { installerAllowed } from './installer-allowlist.mjs';

export const API = 'https://api.github.com';
export const RAW = 'https://raw.githubusercontent.com';

/** Every public, kept repo of the org as raw API objects, following the Link rel="next" header. */
export async function listOrgRepos(api) {
  const all = [];
  let url = `${API}/orgs/${ORG}/repos?per_page=100`;
  for (let page = 0; url && page < 5; page++) {
    const { json, link } = await api(url);
    if (!Array.isArray(json)) throw new Error('GitHub answered with something other than a list');
    all.push(...json);
    url = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return all.filter(keepRepo).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

// ---- manifests -------------------------------------------------------------------------

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '#') return line.slice(0, i);
  }
  return line;
}

/** Last path segment of a git URL or "owner/repo" shorthand, without a .git suffix or ref. */
export function gitSegment(url) {
  const s = String(url).replace(/[?#].*$/, '').replace(/\/+$/, '').split(/[/:]/).pop() ?? '';
  return s.replace(/\.git$/i, '');
}

const DEP_SECTION = /(?:^|\.)(?:dependencies|dev-dependencies|build-dependencies)$/;
const DEP_TABLE = /(?:^|\.)(?:dependencies|dev-dependencies|build-dependencies)\.([^.]+)$/;
const unquote = (s) => s.trim().replace(/^["']|["']$/g, '');

/**
 * Just enough TOML to read a Cargo manifest: package name, workspace members, whether it
 * declares a binary (`[[bin]]`) or turns off the automatic one (`autobins = false`), and every dependency's key, `package` rename, git URL and path.
 */
export function parseCargo(text) {
  const out = { name: null, members: [], bin: false, autobins: true, deps: [] };
  const clean = text.split('\n').map(stripComment).join('\n');
  const m = clean.match(/^\s*members\s*=\s*\[([\s\S]*?)\]/m);
  if (m) out.members = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
  let section = '';
  let table = null; // [dependencies.foo] style entry being filled
  for (const line of clean.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const h = t.match(/^\[\[?([^\]]+)\]\]?$/);
    if (h) {
      section = h[1].trim();
      table = null;
      if (/^\[\[\s*bin\s*\]\]$/.test(t)) out.bin = true;
      const tm = section.match(DEP_TABLE);
      if (tm) {
        table = { key: unquote(tm[1]) };
        out.deps.push(table);
      }
      continue;
    }
    const kv = t.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (!kv) continue;
    const key = unquote(kv[1]);
    const val = kv[2];
    if (section === 'package' && key === 'name') out.name = unquote(val);
    else if (section === 'package' && key === 'autobins') out.autobins = unquote(val) !== 'false';
    else if (table) {
      if (key === 'git') table.git = unquote(val);
      else if (key === 'package') table.pkg = unquote(val);
      else if (key === 'path') table.path = unquote(val);
    } else if (DEP_SECTION.test(section)) {
      out.deps.push({
        key,
        git: val.match(/\bgit\s*=\s*["']([^"']+)["']/)?.[1],
        pkg: val.match(/\bpackage\s*=\s*["']([^"']+)["']/)?.[1],
        path: val.match(/\bpath\s*=\s*["']([^"']+)["']/)?.[1],
      });
    }
  }
  return out;
}

/** Names a manifest's dependencies could go by: the crate (or rename target) and the git repo name. */
export function cargoDepNames(parsed) {
  const names = [];
  for (const d of parsed.deps) {
    if (d.path && !d.git) continue; // path deps stay inside the repo
    names.push(d.pkg || d.key);
    if (d.git) names.push(gitSegment(d.git));
  }
  return names;
}

export function parsePackageJson(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { name: null, names: [] };
  }
  const names = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [k, v] of Object.entries(j?.[field] ?? {})) {
      names.push(k);
      if (k.startsWith('@')) names.push(k.split('/').pop());
      if (typeof v === 'string' && /^(git|github:|https?:|[\w.-]+\/[\w.-]+)/.test(v)) names.push(gitSegment(v));
    }
  }
  return { name: typeof j?.name === 'string' ? j.name : null, names };
}

/** Bullets under a "Features" heading in a README, as plain text. Empty when there is none. */
export function parseFeatures(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s+(?:key\s+)?features\s*:?\s*#*\s*$/i.test(l.trim()));
  if (start < 0) return [];
  const items = [];
  let cur = null;
  let fence = false;
  for (const l of lines.slice(start + 1)) {
    if (/^\s*```/.test(l)) fence = !fence;
    if (fence) continue;
    if (/^#{1,6}\s/.test(l)) break;
    const b = l.match(/^([-*+])\s+(.*)$/);
    if (b) {
      cur = b[2];
      items.push(cur);
      continue;
    }
    if (cur !== null && /^\s{2,}\S/.test(l) && !/^\s*[-*+]\s/.test(l)) items[items.length - 1] += ` ${l.trim()}`;
    else if (!l.trim()) cur = null;
  }
  return items
    .map((s) =>
      s
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`]{1,3}/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

// ---- per-repo gathering ----------------------------------------------------------------

const cratePath = (dir) => dir.replace(/^\.?\//, '').replace(/\/$/, '');

/**
 * The crates of a repo's Cargo workspace (the root crate and every plain-path member) and the
 * dependency names found in them. A crate is a binary with a `[[bin]]` section, or with a
 * src/main.rs that autobins has not switched off; the src/main.rs probe is a raw file read.
 * `failed` counts the files that could not be read: when it is not 0, `crates` and `refs` are incomplete.
 */
export async function readCargo(raw, base) {
  const text = await raw(`${base}/Cargo.toml`);
  if (!text) return { crates: [], refs: [], failed: 0 };
  const root = parseCargo(text);
  const dirs = root.members.filter((m) => !/[*?[]/.test(m)).map(cratePath); // globs would need a directory listing
  const crateOf = async (dir, parsed) => {
    if (parsed && parsed.name && !parsed.bin && parsed.autobins) {
      const main = await raw(`${base}/${dir ? `${dir}/` : ''}src/main.rs`);
      if (main !== null) parsed.bin = true;
    }
    return parsed;
  };
  const settled = await Promise.allSettled([
    crateOf('', root),
    ...dirs.map(async (dir) => {
      const t = await raw(`${base}/${dir}/Cargo.toml`);
      return t ? crateOf(dir, parseCargo(t)) : null;
    }),
  ]);
  const crates = [];
  const refs = [];
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'rejected') failed++;
    else if (r.value) {
      if (r.value.name) crates.push({ name: r.value.name, bin: r.value.bin });
      refs.push(...cargoDepNames(r.value));
    }
  }
  return { crates, refs, failed };
}

/**
 * Crates, dependency names and package name from a repo's manifests (raw files, no API quota).
 * Cargo and package.json are read independently: when one fails, the other still counts.
 * `cargoOk` / `pkgOk` say which of them were read completely; `failed` counts unreadable files.
 */
export async function readManifests(raw, name, branch) {
  const base = `${RAW}/${ORG}/${name}/${branch}`;
  const [cargo, pkg] = await Promise.allSettled([readCargo(raw, base), raw(`${base}/package.json`)]);
  const out = { crates: [], refs: [], pkgName: null, cargoOk: false, pkgOk: false, failed: 0 };
  if (cargo.status === 'fulfilled') {
    out.failed += cargo.value.failed;
    out.cargoOk = cargo.value.failed === 0;
    out.crates = cargo.value.crates;
    out.refs.push(...cargo.value.refs);
  } else out.failed++;
  if (pkg.status === 'fulfilled') {
    out.pkgOk = true;
    if (pkg.value) {
      const p = parsePackageJson(pkg.value);
      out.pkgName = p.name;
      out.refs.push(...p.names);
    }
  } else out.failed++;
  return out;
}

function releaseInfo(rel) {
  return {
    tag: rel.tag_name,
    prerelease: Boolean(rel.prerelease),
    url: rel.html_url,
    publishedAt: rel.published_at || rel.created_at || '',
    // Installer scripts stay out of the snapshot unless allow-listed (see installer-allowlist.mjs).
    assets: (rel.assets ?? [])
      .map((a) => ({ name: a.name, url: a.browser_download_url, downloads: Number(a.download_count) || 0 }))
      .filter(installerAllowed),
  };
}

/** The release to show (the newest stable one, else the newest prerelease) and total downloads over all releases. */
export function summariseReleases(list) {
  const rels = (Array.isArray(list) ? list : []).filter((r) => !r.draft);
  const when = (r) => r.published_at || r.created_at || '';
  const newestFirst = [...rels].sort((a, b) => when(b).localeCompare(when(a)));
  const latest = newestFirst.find((r) => !r.prerelease) ?? newestFirst[0] ?? null;
  const downloads = rels.reduce((n, r) => n + (r.assets ?? []).reduce((m, a) => m + (Number(a.download_count) || 0), 0), 0);
  return { release: latest ? releaseInfo(latest) : null, downloads };
}

function contributorCount({ status, json, link }) {
  if (status === 204) return 0;
  const last = link?.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/)?.[1];
  if (last) return Number(last);
  return Array.isArray(json) ? json.length : null;
}

function weeklyTotals({ status, json }) {
  if (status !== 200 || !Array.isArray(json) || !json.length) return null;
  return json.map((w) => Number(w.total) || 0);
}

/**
 * One repo's data. Every network piece is independent: when one fails, that field keeps
 * `old`'s value (the snapshot or the last live result) and the rest still update.
 * `stats` adds contributors and weekly commits (2 more API calls); without it they stay as `old` had them.
 * `fail` is called once per failed request. `pend` is called once per stats endpoint that
 * answered "still computing" (202, or 204 for commit activity): that is not a failure.
 */
async function gatherRepo(api, raw, r, old, stats, fail, pend) {
  const base = `${API}/repos/${ORG}/${r.name}`;
  const branch = r.default_branch || 'main';
  const skip = Promise.resolve(null);
  const [rels, contrib, weekly, manifests, readme] = await Promise.allSettled([
    api(`${base}/releases?per_page=100`),
    stats ? api(`${base}/contributors?per_page=1&anon=true`) : skip,
    stats ? api(`${base}/stats/commit_activity`) : skip,
    readManifests(raw, r.name, branch),
    raw(`${RAW}/${ORG}/${r.name}/${branch}/README.md`),
  ]);
  for (const x of [rels, contrib, weekly, readme]) if (x.status === 'rejected') fail();
  if (manifests.status === 'rejected') fail();
  else for (let i = 0; i < manifests.value.failed; i++) fail();
  if (contrib.status === 'fulfilled' && contrib.value?.status === 202) pend();
  if (weekly.status === 'fulfilled' && (weekly.value?.status === 202 || weekly.value?.status === 204)) pend();
  const os = old?.stats;
  const rel = rels.status === 'fulfilled' ? summariseReleases(rels.value.json) : null;
  const spdx = r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null;
  const got = (x) => x.status === 'fulfilled' && x.value;
  const data = {
    name: r.name,
    description: r.description || null,
    language: r.language || null,
    license: spdx,
    stars: Number(r.stargazers_count) || 0,
    pushedAt: r.pushed_at || null,
    url: r.html_url,
    fork: Boolean(r.fork),
    defaultBranch: branch,
    release: rel ? rel.release : (old?.release ?? null),
    stats: {
      stars: Number(r.stargazers_count) || 0,
      downloads: rel ? rel.downloads : (os?.downloads ?? 0),
      contributors: (got(contrib) ? contributorCount(contrib.value) : null) ?? os?.contributors ?? null,
      weeklyCommits: (got(weekly) ? weeklyTotals(weekly.value) : null) ?? os?.weeklyCommits ?? null,
    },
    dependsOn: old?.dependsOn ?? [],
    crates: old?.crates ?? [],
    pkgName: old?.pkgName ?? null,
    features: readme.status === 'fulfilled' ? (readme.value ? parseFeatures(readme.value) : []) : (old?.features ?? []),
  };
  const m = manifests.status === 'fulfilled' ? manifests.value : null;
  if (m?.cargoOk) data.crates = m.crates;
  if (m?.pkgOk) data.pkgName = m.pkgName;
  // Dependencies come from both manifests, so they only update when every file was read.
  return { data, manifest: m && m.failed === 0 ? m : null };
}

/**
 * The aggregate for every public repo of the org: `{ repos, failed, pending }`. Throws only when
 * the repo list itself cannot be read; everything else degrades per field to `prev` (an earlier
 * RepoData[]). `failed` counts requests that did not answer. `pending` counts stats endpoints
 * GitHub is still computing: those keep their earlier values and the caller should ask again soon.
 */
export async function collectRepos({ api, raw, prev = [], stats = false }) {
  let failed = 0;
  let pending = 0;
  const fail = () => failed++;
  const pend = () => pending++;
  const repos = await listOrgRepos(api);
  if (!repos.length) throw new Error(`${ORG} returned zero public repos after filtering`);
  const before = new Map(prev.map((p) => [p.name.toLowerCase(), p]));
  const results = await Promise.all(repos.map((r) => gatherRepo(api, raw, r, before.get(r.name.toLowerCase()), stats, fail, pend)));

  // name (repo, crate or package) -> repo
  const owner = new Map();
  for (const { data } of results) {
    owner.set(data.name.toLowerCase(), data.name);
    for (const c of data.crates) owner.set(c.name.toLowerCase(), data.name);
    if (data.pkgName) owner.set(data.pkgName.toLowerCase(), data.name);
  }
  for (const { data, manifest } of results) {
    if (!manifest) continue; // manifests unreadable: keep the earlier dependsOn
    const deps = new Set();
    for (const ref of manifest.refs) {
      const hit = owner.get(ref.toLowerCase());
      if (hit && hit !== data.name) deps.add(hit);
    }
    data.dependsOn = [...deps].sort();
  }
  return { repos: results.map((x) => x.data), failed, pending };
}
