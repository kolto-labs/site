import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { ProjectView } from '../content/repos';
import type { ProjectRef } from '../content/dependency-tree';
import { Md } from './Md';
import { NfoViewer } from './NfoViewer';
import { projectNfo, statusLabel } from '../lib/nfo';
import { CopyButton } from './CopyButton';

const badgeText = (s: ProjectView['status']) =>
  s === 'released' ? 'RELEASED' : s === 'in-development' ? 'IN DEV' : s === 'planned' ? 'PLANNED' : 'PUBLIC';

export function StatusBadge({ status }: { status: ProjectView['status'] }) {
  return (
    <span className={`badge badge--${status}`}>
      <span aria-hidden="true">[ </span>
      <span className="sr-only">Status: </span>
      <span aria-hidden="true">{badgeText(status)}</span>
      <span className="sr-only">{statusLabel(status)}</span>
      <span aria-hidden="true"> ]</span>
    </span>
  );
}

function InfoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="leader">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

export function NfoDialog({ project }: { project: ProjectView }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    setOpen(true);
    ref.current?.showModal();
  };
  const close = () => {
    ref.current?.close();
  };
  return (
    <>
      <button type="button" className="btn btn--sm" onClick={show} aria-haspopup="dialog">
        Read the notes
      </button>
      <dialog
        ref={ref}
        className="nfo-dialog"
        aria-label={`${project.name} release notes`}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="nfo-dialog__inner">
          <button type="button" className="btn btn--sm nfo-dialog__close" onClick={close}>
            Close <kbd>Esc</kbd>
          </button>
          {open ? <NfoViewer title={project.name.toUpperCase()} text={projectNfo(project)} /> : null}
        </div>
      </dialog>
    </>
  );
}

export function installLines(p: ProjectView): { label: string; cmd: string }[] {
  const out: { label: string; cmd: string }[] = [];
  if (p.install.cargo) out.push({ label: 'cargo', cmd: p.install.cargo });
  if (p.install.shell) out.push({ label: 'macOS / Linux', cmd: p.install.shell });
  if (p.install.powershell) out.push({ label: 'Windows', cmd: p.install.powershell });
  return out;
}

type Level = 2 | 3 | 4 | 5 | 6;
const tag = (level: number) => `h${Math.min(6, Math.max(2, level))}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/** "Also uses kq, kotor-formats": links to other projects' anchors on /projects. */
function RelLine({ label, refs }: { label: string; refs: ProjectRef[] }) {
  if (!refs.length) return null;
  return (
    <p className="release__rel">
      {label}{' '}
      {refs.map((r, i) => (
        <span key={r.slug}>
          {i ? ', ' : null}
          <a href={`#${r.slug}`}>{r.name}</a>
        </span>
      ))}
    </p>
  );
}

export function InstallList({ project: p, headingLevel = 4 }: { project: ProjectView; headingLevel?: number }) {
  const installs = installLines(p);
  if (!installs.length) return null;
  const Sub = tag(headingLevel);
  return (
    <>
      <Sub className="release__sub">Install</Sub>
      <ul className="install-list">
        {installs.map((i) => (
          <li key={i.label}>
            <span className="install-list__os">{i.label}</span>
            <code className="install-list__cmd">{i.cmd}</code>
            <CopyButton text={i.cmd} what={`${p.name} ${i.label} install command`} />
          </li>
        ))}
      </ul>
    </>
  );
}

interface Props {
  project: ProjectView;
  /**
   * full: the /projects card. compact: the home page teaser.
   * frame: the details block at the top of a dependency frame; the frame edge carries the name.
   */
  variant?: 'full' | 'compact' | 'frame';
  headingLevel?: Level;
  /** Put id={slug} on the card. Defaults to true for full cards; frames carry the id themselves. */
  anchor?: boolean;
  /** No public repository yet (a lab project). */
  lab?: boolean;
  alsoUses?: ProjectRef[];
  usedBy?: ProjectRef[];
}

export function ReleaseCard({ project: p, variant = 'compact', headingLevel = 3, anchor, lab = false, alsoUses = [], usedBy = [] }: Props) {
  const H = tag(headingLevel);
  const Sub = tag(headingLevel + 1);
  const repoShort = p.repo?.replace(/^https?:\/\/(www\.)?github\.com\//, '');
  const frame = variant === 'frame';
  const full = variant === 'full' || frame;
  const installs = installLines(p);
  const Root = frame ? 'div' : 'article';
  const nameId = `rel-${p.slug}-${variant}`;
  return (
    <Root
      className={`release release--${p.status} release--${variant}${frame ? ' release--full' : ''}${lab ? ' release--lab' : ''}`}
      id={(anchor ?? variant === 'full') ? p.slug : undefined}
      aria-labelledby={frame ? undefined : nameId}
      data-reveal
    >
      <header className="release__head">
        <div className="release__meta">
          <StatusBadge status={p.status} />
          {p.version ? <span className="release__ver">v{p.version}</span> : null}
        </div>
        {frame ? null : (
          <H className="release__name" id={nameId} style={{ ['--len' as string]: Math.max(4, p.name.length) }}>
            {full ? (
              p.name
            ) : (
              <Link to={`/projects/#${p.slug}`} className="release__link">
                {p.name}
              </Link>
            )}
          </H>
        )}
      </header>
      {p.tagline ? <p className="release__tag">{p.tagline}</p> : null}
      {full ? <RelLine label="Also uses" refs={alsoUses} /> : null}
      {full ? <RelLine label="Also used by" refs={usedBy} /> : null}
      <dl className="release__info">
        <InfoRow k="Language" v={p.lang} />
        {full && p.repo ? <InfoRow k="Source" v={<a href={p.repo}>{repoShort}</a>} /> : null}
        {full && lab ? <InfoRow k="Source" v={<span className="release__private">Not public yet</span>} /> : null}
        {full && p.github ? <InfoRow k="Stars" v={p.github.stars} /> : null}
        {full && p.github?.pushedAt ? <InfoRow k="Last push" v={<time dateTime={p.github.pushedAt}>{p.github.pushedAt.slice(0, 10)}</time>} /> : null}
      </dl>
      {full ? (
        <div className="release__body">
          <div className={`release__cols${p.features.length ? '' : ' release__cols--single'}`}>
            {p.description ? <Md source={p.description} className="release__desc" /> : p.repo ? <p className="release__desc muted">No description on GitHub yet.</p> : null}
            {p.features.length ? (
              <div className="release__feat">
                <Sub className="release__sub">Features</Sub>
                <ul className="release__features">
                  {p.features.map((f, i) => (
                    <li key={`${i}:${f}`}>
                      <Md source={f} inline as="span" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <InstallList project={p} headingLevel={headingLevel + 1} />
        </div>
      ) : null}
      <footer className="release__foot">
        {full && p.repo ? (
          <a className="btn btn--sm" href={p.repo}>
            Source on GitHub
          </a>
        ) : null}
        {full ? <NfoDialog project={p} /> : null}
        {!full ? (
          <Link className="release__more" to={`/projects/#${p.slug}`} aria-label={`${p.name}: ${installs.length ? 'details and install' : 'details'}`}>
            {installs.length ? 'details / install' : 'details'}
          </Link>
        ) : null}
      </footer>
    </Root>
  );
}
