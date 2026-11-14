/**
 * Shared contract for the /projects page. The data layer (repos.ts, useProjects.ts,
 * scripts/fetch-repos.mjs) produces these shapes; the dependency layout and the
 * stats panel consume them. Change this file first, then both sides.
 */
import type { ProjectView } from './repos';

export interface ReleaseAsset {
  name: string;
  url: string;
  downloads: number;
}

export interface ReleaseInfo {
  tag: string;
  /** True when this is the newest release but it is marked as a prerelease (the repo has no stable one). */
  prerelease: boolean;
  url: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

export interface ProjectStatsData {
  stars: number;
  /** Sum of download counts across every release asset. */
  downloads: number;
  /** Null when GitHub has not computed it yet (HTTP 202) or the request failed. */
  contributors: number | null;
  /** 52 weekly commit totals, oldest first; null when unavailable. */
  weeklyCommits: number[] | null;
}

/** Everything /projects shows about one project, aggregated from GitHub. */
export interface AggregatedProject extends ProjectView {
  /** Slugs of other listed or lab projects this one depends on directly. */
  dependsOn: string[];
  release: ReleaseInfo | null;
  /** Null for lab projects (no public repo). */
  stats: ProjectStatsData | null;
}

export interface ProjectsAggregate {
  listed: AggregatedProject[];
  lab: AggregatedProject[];
  /** ISO time the data was fetched (build snapshot or live refresh). */
  fetchedAt: string;
  /** True once fresh data from GitHub replaced the build snapshot. */
  live: boolean;
}

/**
 * The bar a stat must clear before it is drawn. A chart whose stat is below its bar
 * is not rendered at all; if no chart clears, the whole stats section is absent.
 * Stars, downloads and commits are summed across all listed projects; contributors use the
 * largest single project (a person on two repos would be counted twice in a sum). Forks are left out: their history is mostly upstream work.
 */
export const STAT_THRESHOLDS = {
  totalStars: 50,
  totalDownloads: 500,
  commitsLastYear: 300,
  contributors: 5,
} as const;
