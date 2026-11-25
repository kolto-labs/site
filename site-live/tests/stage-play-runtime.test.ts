import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs build script without type declarations
import { ENGINE_CSP, engineHeaderRules, isExcluded, parseHeaders } from '../scripts/stage-play-runtime.mjs';

type Rule = { path: string; headers: [string, string][] };

const siteHeaders = `/*
  Content-Security-Policy: default-src 'self'
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
const runtimeHeaders = `# comment
/sourceport/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
`;

const NEVER_STAGED = [
  'original-game/wine-roots/abc/.local-root.zip',
  'original-game/runtime-releases/47d3/boxedwine.wasm',
  'original-game/runtime-local.json',
  'original-game/.runtime-local-x.json',
  'debugger/index.html',
  'index.html',
  '_headers',
  '.gitignore',
];
const STAGED = [
  'tank/index.html',
  'sourceport/index.html',
  'sourceport/build.json',
  'js/engine-select.mjs',
  'engines.json',
  'original-game/index.html',
  // Lookalikes of excluded names that are not excluded paths.
  'tank/_headers.txt',
  'js/index.html',
];

describe('stage-play-runtime exclusions', () => {
  it('never stages game-derived or local-only files', () => {
    expect(NEVER_STAGED.filter((rel) => !isExcluded(rel))).toEqual([]);
  });
  it('stages the player and engine files', () => {
    expect(STAGED.filter((rel) => isExcluded(rel))).toEqual([]);
  });
  it('treats the empty path as not excluded (nothing to copy, nothing refused)', () => {
    expect(isExcluded('')).toBe(false);
  });
});

describe('stage-play-runtime parseHeaders', () => {
  it('returns no rules for empty or comment-only text', () => {
    expect(parseHeaders('')).toEqual([]);
    expect(parseHeaders('# only a comment\n\n')).toEqual([]);
  });
  it('ignores header lines before any path', () => {
    expect(parseHeaders('  X-Orphan: 1\n/a\n  X-Kept: 2\n')).toEqual([{ path: '/a', headers: [['X-Kept', '2']] }]);
  });
  it('keeps a path with an empty header block', () => {
    expect(parseHeaders('/empty\n')).toEqual([{ path: '/empty', headers: [] }]);
  });
  it('keeps colons inside values', () => {
    expect(parseHeaders('/a\n  Link: <https://x/y>; rel=preload\n')[0].headers).toEqual([['Link', '<https://x/y>; rel=preload']]);
  });
});

describe('stage-play-runtime headers', () => {
  const text: string = engineHeaderRules(parseHeaders(siteHeaders), parseHeaders(runtimeHeaders));
  const rules: Rule[] = parseHeaders(text);
  const rule = (path: string) => rules.find((r) => r.path === path);
  const section = (from: string, to?: string) => text.slice(text.indexOf(from), to ? text.indexOf(to) : undefined);
  // Counts lines of the form "  ! <name>", e.g. "  ! Cross-Origin-Opener-Policy" (not "  Cross-Origin-Opener-Policy: x").
  const detachCount = (block: string, name: string) => block.split('\n').filter((line) => line === `  ! ${name}`).length;

  it('detaches each site-wide header once before replacing it', () => {
    const sp = section('/sourceport/*', '/original-game/*');
    expect(detachCount(sp, 'Cross-Origin-Opener-Policy')).toBe(1);
    expect(detachCount(sp, 'Content-Security-Policy')).toBe(1);
    expect(detachCount(sp, 'X-Frame-Options')).toBe(1);
    expect(detachCount(sp, 'Cross-Origin-Embedder-Policy')).toBe(0);
  });

  it('gives the source port isolation and the engine CSP', () => {
    const headers = Object.fromEntries((rule('/sourceport/*')?.headers ?? []).filter(([name]) => !name.startsWith('!')));
    expect(headers['Cross-Origin-Embedder-Policy']).toBe('require-corp');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Content-Security-Policy']).toBe(ENGINE_CSP);
    expect(ENGINE_CSP).toContain("'wasm-unsafe-eval'");
    expect(ENGINE_CSP).toContain("frame-ancestors 'self'");
  });

  it('frames the emulator page same-origin only, without X-Frame-Options: DENY', () => {
    const og = section('/original-game/*');
    expect(detachCount(og, 'X-Frame-Options')).toBe(1);
    expect(og.split('\n').filter((line) => line.startsWith('  X-Frame-Options:'))).toEqual([]);
  });

  it('with no site headers, sets the engine headers without detaching anything', () => {
    const bare: string = engineHeaderRules([], parseHeaders(runtimeHeaders));
    expect(bare.split('\n').filter((line) => line.startsWith('  !'))).toEqual([]);
    expect(bare).toContain('  Cross-Origin-Embedder-Policy: require-corp\n');
  });
});
