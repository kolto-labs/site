/**
 * Decides which stats charts are respectable enough to draw. Pure: no React, no DOM.
 * A chart whose total is below its bar is not returned, so it is never rendered.
 * Null or missing data counts as not passing.
 */
import { STAT_THRESHOLDS, type ProjectsAggregate } from './project-contract';

export interface BarRow {
  slug: string;
  label: string;
  value: number;
}

export type ChartSpec =
  | {
      id: 'commits';
      title: string;
      /** Org-wide commits per week, oldest first. */
      weeks: number[];
      total: number;
    }
  | {
      id: 'downloads' | 'stars' | 'contributors';
      title: string;
      rows: BarRow[];
      /** Gate value: sum for downloads and stars, max for contributors. */
      total: number;
    };

const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

// A fork's commits, contributors and stars are mostly upstream work, not ours.
const ownProjects = (agg: ProjectsAggregate) => (agg.listed ?? []).filter((p) => !p.github?.fork);

function rowsOf(
  agg: ProjectsAggregate,
  pick: (s: NonNullable<ProjectsAggregate['listed'][number]['stats']>) => unknown,
): BarRow[] {
  return ownProjects(agg)
    .map((p) => ({ slug: p.slug, label: p.name, value: p.stats ? num(pick(p.stats)) : 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function selectRespectableCharts(aggregate: ProjectsAggregate | null | undefined): ChartSpec[] {
  if (!aggregate || !Array.isArray(aggregate.listed)) return [];
  const out: ChartSpec[] = [];

  // Commits: align weeks by their newest end, so shorter series still line up with "now".
  const series = ownProjects(aggregate)
    .map((p) => p.stats?.weeklyCommits)
    .filter((w): w is number[] => Array.isArray(w) && w.length > 0);
  if (series.length) {
    const len = Math.min(52, Math.max(...series.map((w) => w.length)));
    const weeks = new Array<number>(len).fill(0);
    for (const w of series) {
      const off = len - w.length;
      w.slice(-len).forEach((v, i) => {
        weeks[Math.max(0, off) + i] += num(v);
      });
    }
    const total = weeks.reduce((a, b) => a + b, 0);
    if (total >= STAT_THRESHOLDS.commitsLastYear) {
      out.push({
        id: 'commits',
        title: 'Commits per week',
        weeks,
        total,
      });
    }
  }

  const downloads = rowsOf(aggregate, (s) => s.downloads);
  const dTotal = downloads.reduce((a, r) => a + r.value, 0);
  if (dTotal >= STAT_THRESHOLDS.totalDownloads) {
    out.push({ id: 'downloads', title: 'Release downloads', rows: downloads, total: dTotal });
  }

  const stars = rowsOf(aggregate, (s) => s.stars);
  const sTotal = stars.reduce((a, r) => a + r.value, 0);
  if (sTotal >= STAT_THRESHOLDS.totalStars) {
    out.push({ id: 'stars', title: 'Stars', rows: stars, total: sTotal });
  }

  // Contributors: gate on the max across projects. The same person often works on
  // several repos, so a sum would double count them.
  const contributors = rowsOf(aggregate, (s) => s.contributors);
  const cMax = contributors.reduce((a, r) => Math.max(a, r.value), 0);
  if (cMax >= STAT_THRESHOLDS.contributors) {
    out.push({ id: 'contributors', title: 'Contributors', rows: contributors, total: cMax });
  }

  return out;
}
