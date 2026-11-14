/**
 * Dependency layout for /projects. Pure: no React, no DOM.
 *
 * Rules:
 * - A project sits inside the frame of the dependency that is deepest in the tree
 *   (the most specific one). Ties go to the earlier entry in its `dependsOn`.
 * - Every other dependency becomes an "also uses" link. A project renders once.
 * - A project whose dependent sits in a deeper frame elsewhere lists that dependent
 *   as a "used by" link instead.
 * - Unknown slugs, self references and duplicates in `dependsOn` are ignored.
 *   Cycles are broken: a project only nests inside a strictly shallower one.
 */
import type { AggregatedProject, ProjectsAggregate } from './project-contract';

export interface ProjectRef {
  slug: string;
  name: string;
}

export interface FrameNode {
  project: AggregatedProject;
  /** True for lab projects (no public repo). */
  lab: boolean;
  /** Nesting level on the page: 0 for a root. */
  level: number;
  /** Projects nested inside this one's frame. Empty means it renders as a card. */
  children: FrameNode[];
  /** Number of projects that list this one in `dependsOn`. */
  usedByCount: number;
  /** Dependencies other than the frame this project sits in. */
  alsoUses: ProjectRef[];
  /** Dependents placed in a deeper frame elsewhere on the page. */
  usedByElsewhere: ProjectRef[];
}

const ref = (p: AggregatedProject): ProjectRef => ({ slug: p.slug, name: p.name });

export function buildDependencyForest(aggregate: Pick<ProjectsAggregate, 'listed' | 'lab'>): FrameNode[] {
  const entries = [
    ...aggregate.listed.map((project) => ({ project, lab: false })),
    ...aggregate.lab.map((project) => ({ project, lab: true })),
  ];
  const bySlug = new Map<string, (typeof entries)[number]>();
  for (const e of entries) if (!bySlug.has(e.project.slug)) bySlug.set(e.project.slug, e);
  const unique = [...bySlug.values()];

  const deps = new Map<string, string[]>();
  for (const { project: p } of unique) {
    const seen = new Set<string>();
    deps.set(
      p.slug,
      (p.dependsOn ?? []).filter((d) => d !== p.slug && bySlug.has(d) && !seen.has(d) && (seen.add(d), true)),
    );
  }

  // Depth = 1 + deepest dependency. A dependency still on the stack is a cycle: skip it.
  const depth = new Map<string, number>();
  const onStack = new Set<string>();
  const depthOf = (slug: string): number => {
    const known = depth.get(slug);
    if (known !== undefined) return known;
    onStack.add(slug);
    let d = 0;
    for (const dep of deps.get(slug)!) if (!onStack.has(dep)) d = Math.max(d, depthOf(dep) + 1);
    onStack.delete(slug);
    depth.set(slug, d);
    return d;
  };
  for (const { project: p } of unique) depthOf(p.slug);

  // Parent = deepest dependency that is strictly shallower (so parents can never loop).
  const parent = new Map<string, string | null>();
  for (const { project: p } of unique) {
    let best: string | null = null;
    for (const dep of deps.get(p.slug)!) {
      if (depth.get(dep)! >= depth.get(p.slug)!) continue;
      if (best === null || depth.get(dep)! > depth.get(best)!) best = dep;
    }
    parent.set(p.slug, best);
  }

  const dependents = new Map<string, string[]>();
  for (const { project: p } of unique) for (const dep of deps.get(p.slug)!) {
    const list = dependents.get(dep) ?? [];
    list.push(p.slug);
    dependents.set(dep, list);
  }

  const build = (slug: string, level: number): FrameNode => {
    const { project, lab } = bySlug.get(slug)!;
    const mine = dependents.get(slug) ?? [];
    const children = mine.filter((s) => parent.get(s) === slug).map((s) => build(s, level + 1));
    // A dependent already drawn somewhere inside this frame needs no extra link.
    const inside = new Set(forestSlugs(children));
    return {
      project,
      lab,
      level,
      children,
      usedByCount: mine.length,
      alsoUses: deps.get(slug)!.filter((d) => d !== parent.get(slug)).map((d) => ref(bySlug.get(d)!.project)),
      usedByElsewhere: mine.filter((s) => !inside.has(s)).map((s) => ref(bySlug.get(s)!.project)),
    };
  };

  return unique.filter(({ project: p }) => parent.get(p.slug) === null).map(({ project: p }) => build(p.slug, 0));
}

/** Every slug in a forest, depth first. Handy for checks: each project appears once. */
export function forestSlugs(forest: FrameNode[]): string[] {
  return forest.flatMap((n) => [n.project.slug, ...forestSlugs(n.children)]);
}
