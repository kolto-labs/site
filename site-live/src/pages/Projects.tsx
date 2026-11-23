import { useEffect, useMemo, useState } from 'react';
import type { ViewStatus } from '../content/repos';
import { useProjects } from '../lib/useProjects';
import { PageHead } from '../components/PageHead';
import { Rule } from '../components/Scramble';
import { ProjectNode } from '../components/ProjectFrame';
import ProjectStats from '../components/ProjectStats';
import { buildDependencyForest } from '../content/dependency-tree';
import type { ProjectsAggregate } from '../content/project-contract';

const GROUPS: { status: ViewStatus; heading: string; id: string; note?: string }[] = [
  { status: 'released', heading: 'Released tools', id: 'released', note: 'Command-line tools and libraries you can use now.' },
  { status: 'in-development', heading: 'In development', id: 'in-development' },
  { status: 'planned', heading: 'Planned and research', id: 'planned' },
  { status: 'public', heading: 'Browse more on GitHub', id: 'public', note: 'Public repositories in the Kolto Labs org.' },
];

const rtf = typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;

function relative(iso: string, now: number): string | null {
  const t = Date.parse(iso);
  if (!rtf || Number.isNaN(t)) return null;
  const s = Math.round((t - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

/** Where the list comes from and how fresh it is. Absolute date first, relative after mount. */
function DataSource({ fetchedAt, live }: Pick<ProjectsAggregate, 'fetchedAt' | 'live'>) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const rel = now === null ? null : relative(fetchedAt, now);
  return (
    <p className={`datasrc${live ? ' datasrc--live' : ''}`}>
      <span className="datasrc__dot" aria-hidden="true">
        ●
      </span>
      {live ? 'Live from' : 'Pulled from'} <a href="https://github.com/kolto-labs">github.com/kolto-labs</a> · updated{' '}
      <time dateTime={fetchedAt} title={fetchedAt}>
        {rel ?? fetchedAt.slice(0, 10)}
      </time>
    </p>
  );
}

export default function Projects() {
  const aggregate = useProjects({ stats: true });
  const { listed, lab } = aggregate;
  const forest = useMemo(() => buildDependencyForest(aggregate), [aggregate]);
  const labRoots = forest.filter((n) => n.lab && n.project.slug !== 'project-telos');
  const mainRoots = forest.filter((n) => n.lab && n.project.slug === 'project-telos');
  const jumpList = [...[...listed, ...lab].filter((x) => x.slug === 'project-telos'), ...[...listed, ...lab].filter((x) => x.slug !== 'project-telos')];
  return (
    <div className="page">
      <PageHead dir="projects" title="Projects" />
      <DataSource fetchedAt={aggregate.fetchedAt} live={aggregate.live} />
      <nav className="jump" aria-label="Projects on this page">
        {jumpList.map((p) => (
          <a key={p.slug} href={`#${p.slug}`} className={`jump__item jump__item--${p.status}`}>
            {p.name}
          </a>
        ))}
      </nav>
      {mainRoots.length ? (
        <section id="kolto-tank" className="section" aria-labelledby="grp-main">
          <Rule id="grp-main">Project Telos: in development</Rule>
          <ul className="release-stack tree-roots">
            {mainRoots.map((n) => (
              <li key={n.project.slug}>
                <ProjectNode node={n} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {GROUPS.map((g) => {
        const roots = forest.filter((n) => !n.lab && n.project.status === g.status);
        if (!roots.length) return null;
        return (
          <section key={g.status} className="section" aria-labelledby={`grp-${g.id}`}>
            <Rule id={`grp-${g.id}`}>{g.heading}</Rule>
            {g.note ? <p className="muted group-note">{g.note}</p> : null}
            <ul className="release-stack tree-roots">
              {roots.map((n) => (
                <li key={n.project.slug}>
                  <ProjectNode node={n} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {labRoots.length ? (
        <section className="section" aria-labelledby="grp-lab">
          <Rule id="grp-lab">Also in the lab: not public yet</Rule>
          <ul className="release-stack tree-roots">
            {labRoots.map((n) => (
              <li key={n.project.slug}>
                <ProjectNode node={n} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ProjectStats aggregate={aggregate} />
    </div>
  );
}
