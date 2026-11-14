// Which repos are listed. Shared by aggregate.mjs (build time and browser).
// Plain JS so Node can run it without a TypeScript step.

export const ORG = 'kolto-labs';

/** FNV-1a 32-bit hash of a string. */
export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Hashes of lowercase repo names that must never be listed as projects. */
export const EXCLUDED_HASHES = [4105863509, 3992490118, 189617587];

/** Public, non-archived, not excluded. Forks stay. */
export function keepRepo(r) {
  if (!r || typeof r.name !== 'string') return false;
  if (r.private || r.archived || r.disabled) return false;
  return !EXCLUDED_HASHES.includes(fnv(r.name.toLowerCase()));
}
