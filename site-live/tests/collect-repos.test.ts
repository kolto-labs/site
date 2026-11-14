import { describe, expect, it } from 'vitest';
import { API, RAW, collectRepos, listOrgRepos, readManifests, type ApiFn, type RawFn } from '../src/content/aggregate.mjs';
import { repo } from './helpers';

const ORG_URL = `${API}/orgs/kolto-labs/repos?per_page=100`;
const gh = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  html_url: `https://github.com/kolto-labs/${name}`,
  default_branch: 'main',
  stargazers_count: 3,
  description: `desc ${name}`,
  language: 'Rust',
  license: { spdx_id: 'MIT' },
  fork: false,
  private: false,
  archived: false,
  ...over,
});
const ok = (json: unknown, status = 200, link: string | null = null) => ({ status, json, link });

interface World {
  repos?: unknown[];
  /** per-URL-suffix overrides; return a value or throw. */
  api?: (url: string) => unknown;
  files?: Record<string, string | null | Error>;
}

function world(w: World = {}) {
  const apiCalls: string[] = [];
  const rawCalls: string[] = [];
  const api: ApiFn = async (url) => {
    apiCalls.push(url);
    const over = w.api?.(url);
    if (over !== undefined) {
      if (over instanceof Error) throw over;
      return over as never;
    }
    if (url === ORG_URL) return ok(w.repos ?? [gh('alpha')]);
    if (url.includes('/releases')) return ok([]);
    if (url.includes('/contributors')) return ok([{}], 200, '<https://api.github.com/x?page=7>; rel="last"');
    if (url.includes('/stats/commit_activity')) return ok([{ total: 4 }, { total: 6 }]);
    throw new Error(`unexpected ${url}`);
  };
  const raw: RawFn = async (url) => {
    rawCalls.push(url);
    const key = url.replace(`${RAW}/kolto-labs/`, '').replace('/main/', '/');
    const v = w.files?.[key];
    if (v instanceof Error) throw v;
    return v ?? null;
  };
  return { api, raw, apiCalls, rawCalls };
}

describe('listOrgRepos', () => {
  it('follows Link rel="next" across pages and filters/sorts the result', async () => {
    const next = `${API}/orgs/kolto-labs/repos?per_page=100&page=2`;
    const { api, apiCalls } = world({
      api: (url) => {
        if (url === ORG_URL) return ok([gh('zeta'), gh('priv', { private: true })], 200, `<${next}>; rel="next", <${next}>; rel="last"`);
        if (url === next) return ok([gh('alpha'), gh('old', { archived: true })]);
      },
    });
    const list = await listOrgRepos(api);
    expect(apiCalls).toEqual([ORG_URL, next]);
    expect(list.map((r) => r.name)).toEqual(['alpha', 'zeta']);
  });

  it('stops after 5 pages even if GitHub keeps saying next', async () => {
    let n = 0;
    const api: ApiFn = async () => {
      n++;
      return ok([gh(`r${n}`)], 200, `<${API}/x?page=${n + 1}>; rel="next"`);
    };
    expect(await listOrgRepos(api)).toHaveLength(5);
    expect(n).toBe(5);
  });

  it('throws when GitHub answers with something other than a list', async () => {
    await expect(listOrgRepos(async () => ok({ message: 'nope' }))).rejects.toThrow(/other than a list/);
  });
});

describe('collectRepos', () => {
  it('throws when the list is empty after filtering', async () => {
    const { api, raw } = world({ repos: [gh('p', { private: true }), gh('a', { archived: true })] });
    await expect(collectRepos({ api, raw })).rejects.toThrow(/zero public repos/);
    const empty = world({ repos: [] });
    await expect(collectRepos({ api: empty.api, raw: empty.raw })).rejects.toThrow(/zero public repos/);
  });

  it('fills one repo from every source on a full run', async () => {
    const { api, raw } = world({
      files: {
        'alpha/Cargo.toml': '[package]\nname = "alpha"\n[[bin]]\nname = "alpha"',
        'alpha/package.json': '{"name":"alpha-js"}',
        'alpha/README.md': '## Features\n- one\n- two',
      },
      api: (url) => (url.includes('/releases') ? ok([{ tag_name: 'v1', html_url: 'u', published_at: '2026-01-01', assets: [{ name: 'a', browser_download_url: 'b', download_count: 9 }] }]) : undefined),
    });
    const { repos, failed, pending } = await collectRepos({ api, raw, stats: true });
    expect({ failed, pending }).toEqual({ failed: 0, pending: 0 });
    expect(repos[0]).toMatchObject({
      name: 'alpha',
      license: 'MIT',
      stars: 3,
      crates: [{ name: 'alpha', bin: true }],
      pkgName: 'alpha-js',
      features: ['one', 'two'],
      release: { tag: 'v1' },
      stats: { downloads: 9, contributors: 7, weeklyCommits: [4, 6] },
    });
  });

  it('does not ask for contributors or commit activity unless stats is set', async () => {
    const { api, raw, apiCalls } = world();
    const r = await collectRepos({ api, raw });
    expect(apiCalls.some((u) => u.includes('/contributors') || u.includes('commit_activity'))).toBe(false);
    expect(r.repos[0].stats.contributors).toBeNull();
  });

  it('detects a src/main.rs binary through the raw probe', async () => {
    const { api, raw } = world({ files: { 'alpha/Cargo.toml': '[package]\nname = "alpha"', 'alpha/src/main.rs': 'fn main(){}' } });
    expect((await collectRepos({ api, raw })).repos[0].crates).toEqual([{ name: 'alpha', bin: true }]);
  });

  it('resolves dependsOn through repo names, crate names and git URLs', async () => {
    const { api, raw } = world({
      repos: [gh('kotor-formats'), gh('tool')],
      files: {
        'kotor-formats/Cargo.toml': '[package]\nname = "kf"',
        'tool/Cargo.toml': '[package]\nname = "tool"\n[dependencies]\nx = { git = "https://github.com/holowan-biolabs/kotor-formats" }\nkf = "1"\nself = { path = "." }',
      },
    });
    const { repos } = await collectRepos({ api, raw });
    expect(repos.find((r) => r.name === 'tool')!.dependsOn).toEqual(['kotor-formats']);
    expect(repos.find((r) => r.name === 'kotor-formats')!.dependsOn).toEqual([]);
  });

  describe('pending vs failed', () => {
    it.each([
      ['202 on contributors', (u: string) => (u.includes('/contributors') ? ok(null, 202) : undefined), 1],
      ['202 on commit activity', (u: string) => (u.includes('commit_activity') ? ok(null, 202) : undefined), 1],
      ['204 on commit activity', (u: string) => (u.includes('commit_activity') ? ok(null, 204) : undefined), 1],
      [
        '202 on both',
        (u: string) => (u.includes('/contributors') || u.includes('commit_activity') ? ok(null, 202) : undefined),
        2,
      ],
    ])('%s counts as pending, not failed', async (_n, api, pending) => {
      const w = world({ api });
      const r = await collectRepos({ api: w.api, raw: w.raw, stats: true });
      expect(r.failed).toBe(0);
      expect(r.pending).toBe(pending);
    });

    it('a 204 on contributors means zero contributors and is neither pending nor failed', async () => {
      const w = world({ api: (u) => (u.includes('/contributors') ? ok(null, 204) : undefined) });
      const r = await collectRepos({ api: w.api, raw: w.raw, stats: true });
      expect(r).toMatchObject({ failed: 0, pending: 0 });
      expect(r.repos[0].stats.contributors).toBe(0);
    });

    it('a 403 counts as failed (the api function rejects)', async () => {
      const w = world({ api: (u) => (u.includes('/contributors') ? new Error('GitHub answered 403') : undefined) });
      const r = await collectRepos({ api: w.api, raw: w.raw, stats: true });
      expect(r.failed).toBe(1);
      expect(r.pending).toBe(0);
    });

    it('keeps the earlier value of a pending field', async () => {
      const prev = [repo('alpha', { stats: { stars: 0, downloads: 0, contributors: 4, weeklyCommits: [1, 2] } })];
      const w = world({ api: (u) => (u.includes('/contributors') || u.includes('commit_activity') ? ok(null, 202) : undefined) });
      const r = await collectRepos({ api: w.api, raw: w.raw, prev, stats: true });
      expect(r.repos[0].stats).toMatchObject({ contributors: 4, weeklyCommits: [1, 2] });
    });
  });

  describe('per-field fallback', () => {
    const prev = [
      repo('alpha', {
        release: { tag: 'v0', prerelease: false, url: 'u', publishedAt: '', assets: [] },
        stats: { stars: 1, downloads: 77, contributors: 4, weeklyCommits: [9] },
        dependsOn: ['kept'],
        crates: [{ name: 'old-crate', bin: false }],
        pkgName: 'old-pkg',
        features: ['old feature'],
      }),
    ];

    it('a failed releases call keeps release and downloads, everything else updates', async () => {
      const w = world({ api: (u) => (u.includes('/releases') ? new Error('boom') : undefined), files: { 'alpha/README.md': '## Features\n- fresh' } });
      const r = await collectRepos({ api: w.api, raw: w.raw, prev, stats: true });
      expect(r.failed).toBe(1);
      expect(r.repos[0]).toMatchObject({ release: { tag: 'v0' }, features: ['fresh'], stats: { downloads: 77, contributors: 7, weeklyCommits: [4, 6], stars: 3 } });
    });

    it('a failed README keeps the earlier features', async () => {
      const w = world({ files: { 'alpha/README.md': new Error('boom') } });
      const r = await collectRepos({ api: w.api, raw: w.raw, prev });
      expect(r.failed).toBe(1);
      expect(r.repos[0].features).toEqual(['old feature']);
    });

    it('a missing README (404) clears features instead of keeping stale ones', async () => {
      const w = world();
      const r = await collectRepos({ api: w.api, raw: w.raw, prev });
      expect(r.failed).toBe(0);
      expect(r.repos[0].features).toEqual([]);
    });

    it('matches the earlier entry case-insensitively', async () => {
      const w = world({ repos: [gh('ALPHA')], api: (u) => (u.includes('/releases') ? new Error('x') : undefined) });
      const r = await collectRepos({ api: w.api, raw: w.raw, prev });
      expect(r.repos[0].release?.tag).toBe('v0');
    });
  });

  describe('manifests degrade independently', () => {
    const prev = [repo('alpha', { dependsOn: ['kept'], crates: [{ name: 'old-crate', bin: false }], pkgName: 'old-pkg' })];
    const cargo = '[package]\nname = "new-crate"\n[[bin]]\nname = "x"';

    it('a rejected Cargo.toml keeps crates and dependsOn but package.json still updates pkgName', async () => {
      const w = world({ files: { 'alpha/Cargo.toml': new Error('boom'), 'alpha/package.json': '{"name":"new-pkg"}' } });
      const r = await collectRepos({ api: w.api, raw: w.raw, prev });
      expect(r.failed).toBe(1);
      expect(r.repos[0]).toMatchObject({ crates: [{ name: 'old-crate', bin: false }], pkgName: 'new-pkg', dependsOn: ['kept'] });
    });

    it('a rejected package.json keeps pkgName but Cargo.toml still updates crates', async () => {
      const w = world({ files: { 'alpha/Cargo.toml': cargo, 'alpha/package.json': new Error('boom') } });
      const r = await collectRepos({ api: w.api, raw: w.raw, prev });
      expect(r.failed).toBe(1);
      expect(r.repos[0]).toMatchObject({ crates: [{ name: 'new-crate', bin: true }], pkgName: 'old-pkg', dependsOn: ['kept'] });
    });

    it('a rejected workspace member leaves crates alone and counts as one failure', async () => {
      const w = world({
        files: { 'alpha/Cargo.toml': '[workspace]\nmembers = ["crates/a"]', 'alpha/crates/a/Cargo.toml': new Error('boom') },
      });
      const r = await collectRepos({ api: w.api, raw: w.raw, prev });
      expect(r.failed).toBe(1);
      expect(r.repos[0].crates).toEqual([{ name: 'old-crate', bin: false }]);
      expect(r.repos[0].dependsOn).toEqual(['kept']);
    });

    it('reads workspace members but skips glob members', async () => {
      const w = world({
        files: {
          'alpha/Cargo.toml': '[workspace]\nmembers = ["crates/a", "crates/*"]',
          'alpha/crates/a/Cargo.toml': '[package]\nname = "a"\n[[bin]]\nname = "a"',
        },
      });
      const r = await collectRepos({ api: w.api, raw: w.raw });
      expect(r.repos[0].crates).toEqual([{ name: 'a', bin: true }]);
      expect(w.rawCalls.some((u) => u.includes('crates/*'))).toBe(false);
    });
  });
});

describe('readManifests', () => {
  it('reports which manifests were read completely', async () => {
    const raw: RawFn = async (url) => {
      if (url.endsWith('package.json')) throw new Error('x');
      return null;
    };
    expect(await readManifests(raw, 'a', 'main')).toMatchObject({ cargoOk: true, pkgOk: false, failed: 1 });
  });
});
