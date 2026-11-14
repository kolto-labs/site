import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../src/content/types';
import type { ReleaseInfo } from '../src/content/project-contract';
import { repo } from './helpers';

const state = vi.hoisted(() => ({ projects: [] as unknown[] }));
vi.mock('../src/content/index', () => ({ content: { get projects() { return state.projects; } } }));

const { buildAggregate, deriveInstall } = await import('../src/content/repos');
const { INSTALLER_ALLOWLIST } = await import('../src/content/installer-allowlist.mjs');

const curated = (slug: string, over: Partial<Project> = {}): Project => ({
  slug,
  name: slug.toUpperCase(),
  repo: null,
  tagline: 'curated tagline',
  description: 'curated description',
  status: 'in-development',
  lang: 'Curated',
  license: 'Curated-1',
  version: null,
  features: ['curated feature'],
  install: { cargo: null, shell: null, powershell: null },
  ...over,
});

const release = (tag: string, over: Partial<ReleaseInfo> = {}): ReleaseInfo => ({
  tag,
  prerelease: false,
  url: `https://github.com/kolto-labs/x/releases/tag/${tag}`,
  publishedAt: '2026-01-01T00:00:00Z',
  assets: [],
  ...over,
});

const meta = { fetchedAt: '2026-01-01T00:00:00.000Z', live: false };
const build = (...repos: ReturnType<typeof repo>[]) => buildAggregate(repos, meta);

beforeEach(() => {
  state.projects = [];
});

describe('buildAggregate: curated matching', () => {
  it('matches a curated entry to a repo case-insensitively and keeps the curated slug and name', () => {
    state.projects = [curated('kotor-formats', { name: 'Kotor Formats' })];
    const a = build(repo('Kotor-Formats'));
    expect(a.listed).toHaveLength(1);
    expect(a.listed[0]).toMatchObject({ slug: 'kotor-formats', name: 'Kotor Formats', curated: true, repo: 'https://github.com/kolto-labs/Kotor-Formats' });
    expect(a.lab).toEqual([]);
  });

  it('lets GitHub win where it has a value and falls back to curated text where it has none', () => {
    state.projects = [curated('a')];
    const withGh = build(repo('a', { description: 'gh desc', language: 'Rust', license: 'MIT' })).listed[0];
    expect(withGh).toMatchObject({ tagline: 'gh desc', lang: 'Rust', license: 'MIT', description: 'curated description' });
    const without = build(repo('a')).listed[0];
    expect(without).toMatchObject({ tagline: 'curated tagline', lang: 'Curated', license: 'Curated-1' });
  });

  it('lists uncurated repos as public, newest push first, after curated ones', () => {
    state.projects = [curated('cur')];
    const a = build(
      repo('old', { pushedAt: '2026-01-01T00:00:00Z' }),
      repo('cur'),
      repo('new', { pushedAt: '2026-06-01T00:00:00Z' }),
    );
    expect(a.listed.map((p) => p.slug)).toEqual(['cur', 'new', 'old']);
    expect(a.listed[1]).toMatchObject({ curated: false, status: 'public', lang: 'Not stated', license: 'Not stated' });
  });
});

describe('buildAggregate: lab vs released', () => {
  it('puts a curated entry with no public repo into lab unless it claims to be released', () => {
    state.projects = [curated('idea', { status: 'planned' }), curated('wip', { status: 'in-development' }), curated('ghost', { status: 'released' })];
    const a = build();
    expect(a.lab.map((p) => p.slug)).toEqual(['idea', 'wip']);
    expect(a.lab[0]).toMatchObject({ repo: null, github: null, release: null, stats: null });
    expect(a.listed).toEqual([]);
  });

  it('marks a repo with a stable release as released', () => {
    state.projects = [curated('a', { status: 'planned' })];
    const p = build(repo('a', { release: release('v1.0.0') })).listed[0];
    expect(p.status).toBe('released');
  });

  it('prerelease-only keeps the curated status, and never says released', () => {
    state.projects = [curated('a', { status: 'in-development' }), curated('b', { status: 'released' })];
    const pre = release('v0.1.0', { prerelease: true });
    const a = build(repo('a', { release: pre }), repo('b', { release: pre }), repo('c', { release: pre }));
    const by = Object.fromEntries(a.listed.map((p) => [p.slug, p.status]));
    expect(by).toEqual({ a: 'in-development', b: 'public', c: 'public' });
  });

  it('a repo with no release at all is public (uncurated) or keeps the curated status', () => {
    state.projects = [curated('a', { status: 'planned' })];
    const a = build(repo('a'), repo('b'));
    expect(a.listed.map((p) => p.status)).toEqual(['planned', 'public']);
  });
});

describe('buildAggregate: version', () => {
  it.each([
    ['v1.2.3', '1.2.3'],
    ['V2.0', '2.0'],
    ['1.0.0', '1.0.0'],
    ['version-3', 'version-3'],
    ['v', 'v'],
  ])('tag %s shows as %s', (tag, shown) => {
    expect(build(repo('a', { release: release(tag) })).listed[0].version).toBe(shown);
  });

  it('falls back to the curated version with no release', () => {
    state.projects = [curated('a', { version: '0.0.1' })];
    expect(build(repo('a')).listed[0].version).toBe('0.0.1');
    expect(build(repo('zzz')).listed[0].version).toBeNull();
  });
});

describe('deriveInstall', () => {
  const rel = (assets: { name: string; url: string }[], tag = 'v1.0.0') => release(tag, { assets: assets.map((a) => ({ ...a, downloads: 0 })) });

  const SH = 'https://github.com/kolto-labs/x/releases/download/v1.0.0/install.sh';
  const PS = 'https://github.com/kolto-labs/x/releases/download/v1.0.0/install.ps1';
  const KQ_SH = 'https://github.com/kolto-labs/kq/releases/download/v0.3.0/install.sh';
  const KQ_PS = 'https://github.com/kolto-labs/kq/releases/download/v0.3.0/install.ps1';

  it('does not turn a release with install.sh or install.ps1 into curl or irm commands unless allow-listed', () => {
    expect(INSTALLER_ALLOWLIST.has(SH)).toBe(false);
    const i = deriveInstall(repo('x', { release: rel([{ name: 'install.sh', url: SH }, { name: 'install.ps1', url: PS }]) }));
    expect(i.shell).toBeNull();
    expect(i.powershell).toBeNull();
  });

  it('pins an allow-listed installer to the release asset URL, never /releases/latest', () => {
    INSTALLER_ALLOWLIST.add(SH);
    INSTALLER_ALLOWLIST.add(PS);
    try {
      const i = deriveInstall(repo('x', { release: rel([{ name: 'install.sh', url: SH }, { name: 'install.ps1', url: PS }]) }));
      expect(i.shell).toBe(`curl -LsSf ${SH} | sh`);
      expect(i.powershell).toBe(`powershell -ExecutionPolicy ByPass -c "irm ${PS} | iex"`);
      expect(`${i.shell} ${i.powershell}`).not.toContain('releases/latest');
    } finally {
      INSTALLER_ALLOWLIST.delete(SH);
      INSTALLER_ALLOWLIST.delete(PS);
    }
  });

  it('allow-lists kq v0.3.0 and gives pinned commands', () => {
    const i = deriveInstall(repo('kq', { release: rel([{ name: 'install.sh', url: KQ_SH }, { name: 'install.ps1', url: KQ_PS }], 'v0.3.0') }));
    expect(i.shell).toBe(`curl -LsSf ${KQ_SH} | sh`);
    expect(i.powershell).toBe(`powershell -ExecutionPolicy ByPass -c "irm ${KQ_PS} | iex"`);
  });

  it('has no installers without those assets or without a release', () => {
    expect(deriveInstall(repo('x'))).toEqual({ cargo: null, shell: null, powershell: null });
    expect(deriveInstall(repo('x', { release: rel([{ name: 'x.zip', url: 'u' }]) })).shell).toBeNull();
  });

  it('shows no installer for a prerelease-only repo either', () => {
    const url = 'https://github.com/o/x/releases/download/v0.1.0-rc1/install.sh';
    const r = release('v0.1.0-rc1', { prerelease: true, assets: [{ name: 'install.sh', url, downloads: 0 }] });
    expect(deriveInstall(repo('x', { release: r })).shell).toBeNull();
  });

  it('gives bin crates cargo install --git <url> <crate> --locked', () => {
    const r = repo('x', { crates: [{ name: 'x-core', bin: false }, { name: 'x-cli', bin: true }] });
    expect(deriveInstall(r).cargo).toBe('cargo install --git https://github.com/kolto-labs/x x-cli --locked');
  });

  it('prefers the bin crate named like the repo, even in another case', () => {
    const r = repo('Tool', { crates: [{ name: 'helper', bin: true }, { name: 'tool', bin: true }] });
    expect(deriveInstall(r).cargo).toContain(' tool --locked');
  });

  it('gives a library-only repo cargo add', () => {
    const r = repo('x', { crates: [{ name: 'x', bin: false }] });
    expect(deriveInstall(r).cargo).toBe('cargo add x --git https://github.com/kolto-labs/x');
  });

  it('has no cargo command for a non-Rust repo', () => {
    expect(deriveInstall(repo('x')).cargo).toBeNull();
  });

  it('curated install commands override derived ones per field', () => {
    state.projects = [curated('x', { install: { cargo: 'cargo install curated', shell: null, powershell: null } })];
    const sh = 'https://h/install.sh';
    const p = build(repo('x', { crates: [{ name: 'x', bin: true }], release: rel([{ name: 'install.sh', url: sh }]) })).listed[0];
    expect(p.install.cargo).toBe('cargo install curated');
    expect(p.install.shell).toBeNull();
  });
});

describe('buildAggregate: dependsOn', () => {
  it('merges manifest and curated dependencies, dropping self and unknown entries and duplicates', () => {
    state.projects = [curated('app', { dependsOn: ['app', 'ghost', 'LIB', 'idea'] }), curated('idea', { status: 'planned' })];
    const a = build(repo('app', { dependsOn: ['lib', 'app', 'nope'] }), repo('lib'));
    const app = a.listed.find((p) => p.slug === 'app')!;
    expect(app.dependsOn).toEqual(['lib', 'idea']);
  });

  it('cleans lab dependsOn the same way', () => {
    state.projects = [curated('idea', { status: 'planned', dependsOn: ['idea', 'lib', 'ghost', 'LIB'] })];
    const a = build(repo('lib'));
    expect(a.lab[0].dependsOn).toEqual(['lib']);
  });
});
