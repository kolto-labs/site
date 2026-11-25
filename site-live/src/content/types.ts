/** Schema for content/site-content.json (written by the copywriter). */
export type Route = '/' | '/about' | '/projects' | '/roadmap' | '/faq' | '/join' | '/credits' | '/play' | '/404';

export interface MetaEntry {
  title: string;
  description: string;
}

export interface Cta {
  label: string;
  href: string;
}

export type ProjectStatus = 'released' | 'in-development' | 'planned';
export type PhaseStatus = 'done' | 'active' | 'next' | 'later';

export interface Project {
  slug: string;
  name: string;
  /** GitHub URL, or null while the project has no public repo. */
  repo: string | null;
  tagline: string;
  /** Markdown */
  description: string;
  status: ProjectStatus;
  lang: string;
  license: string;
  version: string | null;
  /** Slugs of other projects this one runs on. Set only where the text above says so. */
  dependsOn?: string[];
  features: string[];
  install: {
    cargo: string | null;
    shell: string | null;
    powershell: string | null;
  };
}

/**
 * Added to every repo in src/content/github-aggregate.json by scripts/fetch-repos.mjs.
 * Snapshots written before this field existed have no `files`, and a repo the build could not
 * read completely may lack it too. Read it through this type, never as part of RepoData.
 */
export interface SnapshotFiles {
  /**
   * Paths, relative to the repo root, of the files the aggregator reads that existed on the default
   * branch when the snapshot was built: README.md, Cargo.toml, package.json, crates/x/Cargo.toml,
   * crates/x/src/main.rs. The browser treats any other path as missing until the next build. That is
   * only true for the files the build looked at: which crate paths get probed depends on what
   * Cargo.toml said then. Without the field nothing is known about the repo.
   */
  files?: string[];
}

export interface Phase {
  phase: string;
  title: string;
  status: PhaseStatus;
  progress: number | null;
  items: { text: string; done: boolean }[];
}

export interface SiteContent {
  siteUrl: string;
  meta: Record<string, MetaEntry>;
  hero: {
    kicker: string;
    headline: string;
    sub: string;
    ctas: Cta[];
  };
  /** Pre-formatted, at most 80 columns wide. */
  homeNfo: string;
  disclaimer: string;
  about: { sections: { id: string; heading: string; body: string }[] };
  projects: Project[];
  roadmap: Phase[];
  faq: { id?: string; q: string; a: string }[];
  /** Optional donation links. Nothing renders until at least one url is set. */
  support?: {
    /** FAQ answer used for the `donations` entry once a link is live; `{links}` is replaced. */
    faq: string;
    links: { name: string; url: string | null }[];
  };
  play?: { lede: string; sections: { id: string; heading: string; body: string }[] };
  join: {
    intro: string;
    lookingFor: { role: string; detail: string }[];
    steps: string[];
    rePolicy: string;
    conduct: string;
  };
  greets: {
    communities: { name: string; url: string; why: string }[];
    priorArt: { name: string; by: string | null; url: string; why: string }[];
    scroller: string;
  };
  press: {
    boilerplateShort: string;
    boilerplateLong: string;
  };
  releaseChannels: { name: string; channel: string; desc: string }[];
}
