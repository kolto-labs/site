import type { AggregatedProject, ProjectStatsData, ProjectsAggregate } from '../src/content/project-contract';
import type { RepoData } from '../src/content/repos';

export interface ProjOpts {
  dependsOn?: string[];
  fork?: boolean;
  stats?: Partial<ProjectStatsData> | null;
}

/** A minimal AggregatedProject for the pure layout and gate tests. */
export function proj(slug: string, opts: ProjOpts = {}): AggregatedProject {
  const stats: ProjectStatsData | null =
    opts.stats === null ? null : { stars: 0, downloads: 0, contributors: null, weeklyCommits: null, ...opts.stats };
  return {
    slug,
    name: slug.toUpperCase(),
    repo: null,
    tagline: '',
    description: '',
    status: 'released',
    lang: 'Rust',
    license: 'MIT',
    version: null,
    features: [],
    install: { cargo: null, shell: null, powershell: null },
    curated: false,
    github: opts.fork === undefined ? null : ({ fork: opts.fork } as AggregatedProject['github']),
    dependsOn: opts.dependsOn ?? [],
    release: null,
    stats,
  };
}

export const agg = (listed: AggregatedProject[], lab: AggregatedProject[] = []): ProjectsAggregate => ({
  listed,
  lab,
  fetchedAt: '2026-01-01T00:00:00.000Z',
  live: false,
});

/** A RepoData with sensible defaults. */
export function repo(name: string, over: Partial<RepoData> = {}): RepoData {
  return {
    name,
    description: null,
    language: null,
    license: null,
    stars: 0,
    pushedAt: null,
    url: `https://github.com/kolto-labs/${name}`,
    fork: false,
    defaultBranch: 'main',
    release: null,
    stats: { stars: 0, downloads: 0, contributors: null, weeklyCommits: null },
    dependsOn: [],
    crates: [],
    pkgName: null,
    features: [],
    ...over,
  };
}
