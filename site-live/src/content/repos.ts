/**
 * GitHub-driven project list.
 *
 * Repo data comes from the kolto-labs org (build-time snapshot, refreshed in the browser).
 * GitHub wins where it has an answer; curated entries in content/site-content.json fill the
 * gaps by repo name. Curated entries with no public repo become "lab" projects.
 */
import snapshot from './github-aggregate.json';
import { INSTALLER_ALLOWLIST } from './installer-allowlist.mjs';
import { content } from './index';
import type { AggregatedProject, ProjectsAggregate, ProjectStatsData, ReleaseInfo } from './project-contract';
import type { Project, ProjectStatus } from './types';

export interface RepoInfo {
  name: string;
  description: string | null;
  language: string | null;
  license: string | null;
  stars: number;
  pushedAt: string | null;
  url: string;
  fork: boolean;
}

/** Everything GitHub says about one public repo, as stored in the snapshot. */
export interface RepoData extends RepoInfo {
  defaultBranch: string;
  release: ReleaseInfo | null;
  stats: ProjectStatsData;
  /** Repo names (not owners) this repo's manifests depend on. */
  dependsOn: string[];
  /** Crates this repo provides, from its Cargo workspace. */
  crates: { name: string; bin: boolean }[];
  /** The npm package name, when the repo has a package.json. */
  pkgName: string | null;
  /** Bullets under a "Features" heading in the README. */
  features: string[];
}

/** 'public' = a public repo with no curated write-up. */
export type ViewStatus = ProjectStatus | 'public';

export interface ProjectView extends Omit<Project, 'repo' | 'status'> {
  repo: string | null;
  status: ViewStatus;
  curated: boolean;
  github: RepoInfo | null;
}

const snap = snapshot as unknown as { fetchedAt: string; repos: RepoData[] };
export const snapshotRepos = snap.repos;

const NOT_STATED = 'Not stated';

/**
 * Install commands GitHub can vouch for. The shell and PowerShell commands use the shown
 * release's own asset URL (pinned to its tag), never /releases/latest, which skips prereleases.
 * They appear only for assets listed in INSTALLER_ALLOWLIST (installer-allowlist.mjs).
 * Both set <NAME>_REPO to this repo, so the script downloads from here and not from its built-in default.
 * PowerShell uses Set-Item, not $env:, so the line still works when pasted into a PowerShell prompt.
 * A Rust repo with a binary crate gets `cargo install` naming that crate (the one named like
 * the repo, else the first); a library-only repo gets `cargo add`.
 */
export function deriveInstall(gh: RepoData): Project['install'] {
  const asset = (name: string) => gh.release?.assets.find((a) => a.name === name && INSTALLER_ALLOWLIST.has(a.url));
  const sh = asset('install.sh');
  const ps = asset('install.ps1');
  const repoVar = `${gh.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_REPO`;
  const repoSlug = gh.url.replace(/^https:\/\/github\.com\//, '');
  const bins = gh.crates.filter((c) => c.bin);
  const bin = bins.find((c) => c.name.toLowerCase() === gh.name.toLowerCase()) ?? bins[0];
  const lib = gh.crates.find((c) => c.name === gh.name && !c.bin) ?? gh.crates.find((c) => !c.bin);
  return {
    cargo: bin ? `cargo install --git ${gh.url} ${bin.name} --locked` : lib ? `cargo add ${lib.name} --git ${gh.url}` : null,
    shell: sh ? `curl -LsSf ${sh.url} | ${repoVar}=${repoSlug} sh` : null,
    powershell: ps ? `powershell -ExecutionPolicy ByPass -c "Set-Item Env:${repoVar} ${repoSlug}; irm ${ps.url} | iex"` : null,
  };
}

const orElse = <T>(a: T | null | undefined, b: T): T => (a === null || a === undefined || a === '' ? b : a);

export function buildAggregate(repos: RepoData[], meta: { fetchedAt: string; live: boolean }): ProjectsAggregate {
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  const manifestDeps = new Map<string, string[]>(); // slug -> repo names from manifests
  const listed: AggregatedProject[] = [];
  const lab: AggregatedProject[] = [];
  const used = new Set<string>();

  const fromGithub = (gh: RepoData, c: Project | null): AggregatedProject => {
    const derived = deriveInstall(gh);
    manifestDeps.set(c?.slug ?? gh.name, gh.dependsOn);
    const ci = c?.install;
    // A repo with only prereleases is not "released": keep the curated status (never 'released') or 'public'.
    const stable = Boolean(gh.release && !gh.release.prerelease);
    const status: ViewStatus = stable ? 'released' : c?.status && c.status !== 'released' ? c.status : 'public';
    return {
      slug: c?.slug ?? gh.name,
      name: c?.name ?? gh.name,
      repo: gh.url,
      tagline: orElse(gh.description, c?.tagline ?? ''),
      description: orElse(c?.description, gh.description ?? ''),
      status,
      lang: orElse(gh.language, c?.lang ?? NOT_STATED),
      license: orElse(gh.license, c?.license ?? NOT_STATED),
      version: gh.release ? gh.release.tag.replace(/^v(?=\d)/i, '') : (c?.version ?? null),
      dependsOn: [...(c?.dependsOn ?? [])],
      features: gh.features.length ? gh.features : (c?.features ?? []),
      install: {
        cargo: orElse(ci?.cargo, derived.cargo),
        shell: orElse(ci?.shell, derived.shell),
        powershell: orElse(ci?.powershell, derived.powershell),
      },
      curated: Boolean(c),
      github: gh,
      release: gh.release,
      stats: gh.stats,
    };
  };

  for (const c of content.projects) {
    const gh = byName.get(c.slug.toLowerCase());
    if (gh) {
      used.add(gh.name);
      listed.push(fromGithub(gh, c));
    } else if (c.status !== 'released') {
      lab.push({
        ...c,
        repo: null,
        curated: true,
        github: null,
        dependsOn: [...(c.dependsOn ?? [])],
        release: null,
        stats: null,
      });
    }
  }

  const rest = repos.filter((r) => !used.has(r.name)).sort((a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? ''));
  for (const gh of rest) listed.push(fromGithub(gh, null));

  // Manifest dependencies come from GitHub (repo names), curated ones from the text. Merge,
  // keep only projects that exist on the page, and never point at yourself.
  const slugOf = new Map<string, string>();
  for (const p of [...listed, ...lab]) slugOf.set(p.slug.toLowerCase(), p.slug);
  const repoSlug = new Map(listed.map((p) => [p.github?.name.toLowerCase() ?? p.slug.toLowerCase(), p.slug]));
  for (const p of listed) {
    const fromManifest = (manifestDeps.get(p.slug) ?? []).map((n) => repoSlug.get(n.toLowerCase()));
    const all = [...fromManifest, ...p.dependsOn.map((s) => slugOf.get(s.toLowerCase()))];
    p.dependsOn = [...new Set(all.filter((s): s is string => Boolean(s) && s !== p.slug))];
  }
  for (const p of lab) {
    p.dependsOn = [...new Set(p.dependsOn.map((s) => slugOf.get(s.toLowerCase())).filter((s): s is string => Boolean(s) && s !== p.slug))];
  }
  return { listed, lab, fetchedAt: meta.fetchedAt, live: meta.live };
}

export const snapshotAggregate: ProjectsAggregate = buildAggregate(snapshotRepos, { fetchedAt: snap.fetchedAt, live: false });
