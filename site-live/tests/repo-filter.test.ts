import { describe, expect, it } from 'vitest';
import { EXCLUDED_HASHES, ORG, fnv, keepRepo } from '../src/content/repo-filter.mjs';

// The hidden repo is only ever referred to by hash here. Its name must not appear in any file.
describe('fnv', () => {
  it.each([
    ['', 2166136261],
    ['a', 3826002220],
    ['foobar', 3214735720],
  ])('FNV-1a 32 of %j is %i', (s, h) => {
    expect(fnv(s)).toBe(h);
  });

  it('always returns an unsigned 32-bit integer', () => {
    for (const s of ['x', 'kolto-labs', '日本語', 'a'.repeat(500)]) {
      const h = fnv(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('keepRepo', () => {
  const ok = { name: 'kotor-formats', private: false, archived: false, fork: false };

  it('keeps a public, active repo', () => {
    expect(keepRepo(ok)).toBe(true);
  });

  it('keeps forks', () => {
    expect(keepRepo({ ...ok, fork: true })).toBe(true);
  });

  it('drops private, archived and disabled repos', () => {
    expect(keepRepo({ ...ok, private: true })).toBe(false);
    expect(keepRepo({ ...ok, archived: true })).toBe(false);
    expect(keepRepo({ ...ok, disabled: true })).toBe(false);
  });

  it('drops junk input', () => {
    expect(keepRepo(null)).toBe(false);
    expect(keepRepo(undefined)).toBe(false);
    expect(keepRepo({})).toBe(false);
    expect(keepRepo({ name: 5 })).toBe(false);
  });

  it('drops a name whose hash is in EXCLUDED_HASHES (checked with .github, the second entry)', () => {
    expect(fnv('.github')).toBe(EXCLUDED_HASHES[1]);
    expect(keepRepo({ ...ok, name: '.github' })).toBe(false);
  });

  it('matches the exclusion case-insensitively', () => {
    expect(keepRepo({ ...ok, name: '.GitHub' })).toBe(false);
  });

  it('holds two valid 32-bit hashes and nothing else', () => {
    expect(EXCLUDED_HASHES).toHaveLength(2);
    for (const h of EXCLUDED_HASHES) expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
  });

  it('exports the org', () => {
    expect(ORG).toBe('kolto-labs');
  });
});
