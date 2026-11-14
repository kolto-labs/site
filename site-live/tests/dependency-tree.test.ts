import { describe, expect, it } from 'vitest';
import { buildDependencyForest, forestSlugs, type FrameNode } from '../src/content/dependency-tree';
import { agg, proj } from './helpers';

const forestOf = (listed: ReturnType<typeof proj>[], lab: ReturnType<typeof proj>[] = []) => buildDependencyForest(agg(listed, lab));
const find = (forest: FrameNode[], slug: string): FrameNode | undefined => {
  for (const n of forest) {
    if (n.project.slug === slug) return n;
    const hit = find(n.children, slug);
    if (hit) return hit;
  }
  return undefined;
};
const kids = (n: FrameNode | undefined) => n?.children.map((c) => c.project.slug);

describe('buildDependencyForest', () => {
  it('nests a project inside its only dependency', () => {
    const f = forestOf([proj('core'), proj('app', { dependsOn: ['core'] })]);
    expect(f.map((n) => n.project.slug)).toEqual(['core']);
    expect(kids(f[0])).toEqual(['app']);
    expect(f[0].children[0].level).toBe(1);
    expect(f[0].usedByCount).toBe(1);
  });

  it('diamond: the deepest dependency is the frame, the other becomes alsoUses', () => {
    // a <- b, a <- e <- c, d uses b and c. c is deeper (2) than b (1).
    const f = forestOf([
      proj('a'),
      proj('b', { dependsOn: ['a'] }),
      proj('e', { dependsOn: ['a'] }),
      proj('c', { dependsOn: ['e'] }),
      proj('d', { dependsOn: ['b', 'c'] }),
    ]);
    const d = find(f, 'd')!;
    expect(find([find(f, 'c')!], 'd')).toBe(d); // d sits inside c
    expect(d.alsoUses.map((r) => r.slug)).toEqual(['b']);
    expect(d.level).toBe(3);
    expect(find(f, 'b')!.usedByElsewhere.map((r) => r.slug)).toEqual(['d']);
  });

  it('tie: equal depth goes to the earlier dependsOn entry', () => {
    const base = [proj('x'), proj('y')];
    const first = forestOf([...base, proj('z', { dependsOn: ['x', 'y'] })]);
    expect(first.map((n) => n.project.slug)).toEqual(['x', 'y']);
    expect(kids(find(first, 'x'))).toEqual(['z']);
    expect(find(first, 'z')!.alsoUses.map((r) => r.slug)).toEqual(['y']);

    const swapped = forestOf([...base, proj('z', { dependsOn: ['y', 'x'] })]);
    expect(kids(find(swapped, 'y'))).toEqual(['z']);
    expect(find(swapped, 'z')!.alsoUses.map((r) => r.slug)).toEqual(['x']);
  });

  it('breaks a 2-cycle and still draws both once', () => {
    const f = forestOf([proj('a', { dependsOn: ['b'] }), proj('b', { dependsOn: ['a'] })]);
    expect(forestSlugs(f).sort()).toEqual(['a', 'b']);
    expect(f).toHaveLength(1);
  });

  it('breaks a 3-cycle and still draws all once', () => {
    const f = forestOf([
      proj('a', { dependsOn: ['b'] }),
      proj('b', { dependsOn: ['c'] }),
      proj('c', { dependsOn: ['a'] }),
    ]);
    expect(forestSlugs(f).sort()).toEqual(['a', 'b', 'c']);
    expect(f).toHaveLength(1);
  });

  it('ignores a self reference', () => {
    const f = forestOf([proj('a', { dependsOn: ['a'] })]);
    expect(f).toHaveLength(1);
    expect(f[0].children).toEqual([]);
    expect(f[0].alsoUses).toEqual([]);
    expect(f[0].usedByCount).toBe(0);
  });

  it('ignores an unknown slug', () => {
    const f = forestOf([proj('a', { dependsOn: ['ghost'] })]);
    expect(f.map((n) => n.project.slug)).toEqual(['a']);
    expect(f[0].alsoUses).toEqual([]);
  });

  it('ignores a duplicate dependsOn entry', () => {
    const f = forestOf([proj('a'), proj('b', { dependsOn: ['a', 'a'] })]);
    expect(f[0].usedByCount).toBe(1);
    expect(f[0].children).toHaveLength(1);
    expect(find(f, 'b')!.alsoUses).toEqual([]);
  });

  it('marks lab entries, lab depending on listed', () => {
    const f = forestOf([proj('core')], [proj('plan', { dependsOn: ['core'] })]);
    const plan = find(f, 'plan')!;
    expect(plan.lab).toBe(true);
    expect(find(f, 'core')!.lab).toBe(false);
    expect(kids(f[0])).toEqual(['plan']);
  });

  it('puts a listed project inside a lab frame when it depends on a lab entry', () => {
    const f = forestOf([proj('app', { dependsOn: ['idea'] })], [proj('idea')]);
    expect(f.map((n) => n.project.slug)).toEqual(['idea']);
    expect(f[0].lab).toBe(true);
    expect(kids(f[0])).toEqual(['app']);
    expect(find(f, 'app')!.lab).toBe(false);
  });

  it('usedByElsewhere lists dependents drawn in a deeper frame, not those inside', () => {
    const f = forestOf([
      proj('a'),
      proj('b', { dependsOn: ['a'] }), // inside a
      proj('d'),
      proj('e', { dependsOn: ['d'] }),
      proj('c', { dependsOn: ['a', 'e'] }), // deeper frame is e
    ]);
    const a = find(f, 'a')!;
    expect(kids(a)).toEqual(['b']);
    expect(a.usedByCount).toBe(2);
    expect(a.usedByElsewhere.map((r) => r.slug)).toEqual(['c']);
  });

  it('forestSlugs has no duplicates and covers every slug', () => {
    const listed = [
      proj('a'),
      proj('b', { dependsOn: ['a', 'c'] }),
      proj('c', { dependsOn: ['a'] }),
      proj('d', { dependsOn: ['b', 'c', 'a', 'ghost', 'd'] }),
      proj('p', { dependsOn: ['q'] }),
      proj('q', { dependsOn: ['p'] }),
    ];
    const lab = [proj('l', { dependsOn: ['d', 'a'] })];
    const slugs = forestSlugs(forestOf(listed, lab));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect([...slugs].sort()).toEqual([...listed, ...lab].map((p) => p.slug).sort());
  });

  it('keeps the first of two entries with the same slug', () => {
    const slugs = forestSlugs(forestOf([proj('a'), proj('a')]));
    expect(slugs).toEqual(['a']);
  });
});
