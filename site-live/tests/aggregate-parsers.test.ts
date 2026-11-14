import { describe, expect, it } from 'vitest';
import { cargoDepNames, gitSegment, parseCargo, parseFeatures, parsePackageJson, summariseReleases } from '../src/content/aggregate.mjs';

describe('parseCargo', () => {
  it('reads the package name', () => {
    expect(parseCargo('[package]\nname = "kotor-formats"\nversion = "0.1.0"').name).toBe('kotor-formats');
  });

  it('reads inline-table dependencies with git, package and path', () => {
    const p = parseCargo(
      [
        '[dependencies]',
        'serde = "1"',
        'kf = { git = "https://github.com/holowan-biolabs/kotor-formats.git", rev = "abc" }',
        'ren = { package = "real-name", version = "2" }',
        "loc = { path = '../loc' }",
      ].join('\n'),
    );
    expect(p.deps).toEqual([
      { key: 'serde', git: undefined, pkg: undefined, path: undefined },
      { key: 'kf', git: 'https://github.com/holowan-biolabs/kotor-formats.git', pkg: undefined, path: undefined },
      { key: 'ren', git: undefined, pkg: 'real-name', path: undefined },
      { key: 'loc', git: undefined, pkg: undefined, path: '../loc' },
    ]);
  });

  it('reads [dependencies.x] tables, dev and build sections', () => {
    const p = parseCargo(
      [
        '[dependencies.kf]',
        'git = "https://github.com/o/kotor-formats"',
        'package = "kf-real"',
        '[dev-dependencies]',
        'tempfile = "3"',
        '[build-dependencies.cc]',
        'path = "../cc"',
      ].join('\n'),
    );
    expect(p.deps.map((d) => d.key)).toEqual(['kf', 'tempfile', 'cc']);
    expect(p.deps[0]).toMatchObject({ git: 'https://github.com/o/kotor-formats', pkg: 'kf-real' });
    expect(p.deps[2]).toMatchObject({ path: '../cc' });
  });

  it('detects [[bin]] and autobins = false', () => {
    expect(parseCargo('[package]\nname = "a"\n[[bin]]\nname = "a"\npath = "src/x.rs"').bin).toBe(true);
    expect(parseCargo('[package]\nname = "a"').bin).toBe(false);
    expect(parseCargo('[package]\nname = "a"').autobins).toBe(true);
    expect(parseCargo('[package]\nname = "a"\nautobins = false').autobins).toBe(false);
  });

  it('does not take a package key from outside [package] as the crate name', () => {
    const p = parseCargo('[dependencies]\nname = "1"\n[package]\nname = "real"');
    expect(p.name).toBe('real');
  });

  it('treats # inside quotes as text and # outside as a comment', () => {
    const p = parseCargo('[package]\nname = "a#b" # trailing\n# [dependencies]\n[dependencies]\nx = { git = "https://h/o/r#frag" } # c');
    expect(p.name).toBe('a#b');
    expect(p.deps).toHaveLength(1);
    expect(p.deps[0].git).toBe('https://h/o/r#frag');
  });

  it('reads workspace members across lines, in either quote style', () => {
    const p = parseCargo('[workspace]\nmembers = [\n  "crates/a", # first\n  \'crates/b\',\n]\n');
    expect(p.members).toEqual(['crates/a', 'crates/b']);
  });

  it('returns an empty shape for empty text', () => {
    expect(parseCargo('')).toEqual({ name: null, members: [], bin: false, autobins: true, deps: [] });
  });
});

describe('gitSegment', () => {
  it.each([
    ['https://github.com/holowan-biolabs/kotor-formats', 'kotor-formats'],
    ['https://github.com/holowan-biolabs/kotor-formats.git', 'kotor-formats'],
    ['https://github.com/holowan-biolabs/kotor-formats/', 'kotor-formats'],
    ['https://github.com/o/r.git#main', 'r'],
    ['git@github.com:o/r.git', 'r'],
    ['github:o/r', 'r'],
    ['o/r', 'r'],
    ['https://github.com/o/R.GIT', 'R'],
  ])('%s -> %s', (url, seg) => {
    expect(gitSegment(url)).toBe(seg);
  });
});

describe('cargoDepNames', () => {
  it('resolves a holowan-biolabs git dependency to the repo name', () => {
    const parsed = parseCargo('[dependencies]\nkf = { git = "https://github.com/holowan-biolabs/kotor-formats" }');
    expect(cargoDepNames(parsed)).toContain('kotor-formats');
  });

  it('adds the key or the rename target, then the git segment', () => {
    const parsed = parseCargo(
      '[dependencies]\na = { git = "https://github.com/o/repo-a.git" }\nb = { package = "real-b", git = "https://github.com/o/repo-b" }\nc = "1"',
    );
    expect(cargoDepNames(parsed)).toEqual(['a', 'repo-a', 'real-b', 'repo-b', 'c']);
  });

  it('skips path-only dependencies but keeps path+git', () => {
    const parsed = parseCargo('[dependencies]\nloc = { path = "../loc" }\nboth = { path = "../b", git = "https://github.com/o/both" }');
    expect(cargoDepNames(parsed)).toEqual(['both', 'both']);
  });
});

describe('parsePackageJson', () => {
  it('collects names from all four dependency fields', () => {
    const r = parsePackageJson(
      JSON.stringify({
        name: 'site',
        dependencies: { react: '^19' },
        devDependencies: { vite: '^7' },
        peerDependencies: { a: '*' },
        optionalDependencies: { b: '1' },
      }),
    );
    expect(r.name).toBe('site');
    expect(r.names).toEqual(['react', 'vite', 'a', 'b']);
  });

  it('adds the bare name of a scoped package', () => {
    expect(parsePackageJson('{"dependencies":{"@kolto/core":"1.0.0"}}').names).toEqual(['@kolto/core', 'core']);
  });

  it('adds the repo name of git dependencies and shorthand', () => {
    const r = parsePackageJson(
      JSON.stringify({
        dependencies: {
          a: 'github:kolto-labs/repo-a',
          b: 'git+https://github.com/kolto-labs/repo-b.git',
          c: 'kolto-labs/repo-c',
          d: '^1.2.3',
          e: 'workspace:*',
        },
      }),
    );
    expect(r.names).toEqual(expect.arrayContaining(['repo-a', 'repo-b', 'repo-c']));
    expect(r.names).not.toContain('^1.2.3');
    expect(r.names).not.toContain('*');
  });

  it('returns an empty result for invalid JSON', () => {
    expect(parsePackageJson('{ nope')).toEqual({ name: null, names: [] });
    expect(parsePackageJson('')).toEqual({ name: null, names: [] });
  });

  it('survives JSON that is not an object, and a non-string name', () => {
    expect(parsePackageJson('null')).toEqual({ name: null, names: [] });
    expect(parsePackageJson('{"name": 5}').name).toBeNull();
  });
});

describe('parseFeatures', () => {
  it('reads bullets under a Features heading and stops at the next heading', () => {
    const md = '# T\n\n## Features\n\n- One\n* Two\n+ Three\n\n## Install\n\n- not me\n';
    expect(parseFeatures(md)).toEqual(['One', 'Two', 'Three']);
  });

  it('accepts Key Features and a trailing colon or hashes', () => {
    expect(parseFeatures('### Key Features:\n- a')).toEqual(['a']);
    expect(parseFeatures('## features ##\n- b')).toEqual(['b']);
  });

  it('joins wrapped bullet lines', () => {
    expect(parseFeatures('## Features\n- First line\n  continues here\n- Second')).toEqual(['First line continues here', 'Second']);
  });

  it('skips fenced code, including bullets inside it and headings inside it', () => {
    const md = '## Features\n- before\n```\n- inside\n# not a heading\n```\n- after';
    expect(parseFeatures(md)).toEqual(['before', 'after']);
  });

  it('strips links, images and emphasis', () => {
    const md = '## Features\n- **Fast** [docs](http://x) and `code` ![img](a.png) _ok_';
    expect(parseFeatures(md)).toEqual(['Fast docs and code ok']);
  });

  it('returns [] with no Features heading', () => {
    expect(parseFeatures('# Title\n- a\n- b')).toEqual([]);
    expect(parseFeatures('')).toEqual([]);
  });

  it('handles CRLF', () => {
    expect(parseFeatures('## Features\r\n- a\r\n- b\r\n')).toEqual(['a', 'b']);
  });
});

describe('summariseReleases', () => {
  const rel = (tag: string, at: string, over: Record<string, unknown> = {}, downloads = 0) => ({
    tag_name: tag,
    html_url: `https://x/${tag}`,
    published_at: at,
    prerelease: false,
    draft: false,
    assets: [{ name: 'a', browser_download_url: `https://x/${tag}/a`, download_count: downloads }],
    ...over,
  });

  it('picks the newest stable release and sums downloads over all non-draft releases', () => {
    const s = summariseReleases([
      rel('v1', '2026-01-01T00:00:00Z', {}, 10),
      rel('v2', '2026-02-01T00:00:00Z', {}, 20),
      rel('v3-rc', '2026-03-01T00:00:00Z', { prerelease: true }, 5),
    ]);
    expect(s.release?.tag).toBe('v2');
    expect(s.release?.prerelease).toBe(false);
    expect(s.downloads).toBe(35);
  });

  it('keeps install.sh and install.ps1 out of the shown release, but still counts their downloads', () => {
    const assets = ['a', 'install.sh', 'install.ps1'].map((name) => ({ name, browser_download_url: `https://x/v1/${name}`, download_count: 2 }));
    const s = summariseReleases([rel('v1', '2026-01-01T00:00:00Z', { assets })]);
    expect(s.release?.assets.map((a) => a.name)).toEqual(['a']);
    expect(s.downloads).toBe(6);
  });

  it('ignores drafts, in the pick and in downloads', () => {
    const s = summariseReleases([rel('v1', '2026-01-01T00:00:00Z', {}, 10), rel('v2', '2026-02-01T00:00:00Z', { draft: true }, 999)]);
    expect(s.release?.tag).toBe('v1');
    expect(s.downloads).toBe(10);
  });

  it('with only prereleases, shows the newest one and flags it', () => {
    const s = summariseReleases([
      rel('v0.1-a', '2026-01-01T00:00:00Z', { prerelease: true }),
      rel('v0.1-b', '2026-02-01T00:00:00Z', { prerelease: true }),
    ]);
    expect(s.release?.tag).toBe('v0.1-b');
    expect(s.release?.prerelease).toBe(true);
  });

  it('falls back to created_at and maps assets', () => {
    const s = summariseReleases([{ tag_name: 'v1', html_url: 'u', created_at: '2026-01-01', assets: [{ name: 'x', browser_download_url: 'b', download_count: '3' }] }]);
    expect(s.release?.publishedAt).toBe('2026-01-01');
    expect(s.release?.assets).toEqual([{ name: 'x', url: 'b', downloads: 3 }]);
  });

  it('returns null and 0 for empty and non-array input', () => {
    expect(summariseReleases([])).toEqual({ release: null, downloads: 0 });
    expect(summariseReleases(null)).toEqual({ release: null, downloads: 0 });
    expect(summariseReleases([rel('d', '2026-01-01', { draft: true })])).toEqual({ release: null, downloads: 0 });
  });
});
