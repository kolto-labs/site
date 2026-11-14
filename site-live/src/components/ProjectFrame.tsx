import { useRef } from 'react';
import type { FrameNode } from '../content/dependency-tree';
import { FrameTrace, useFrameTrace } from '../placements/cards/FrameTrace';
import { ReleaseCard } from './ReleaseCard';

/** Heading level for a node: roots sit under the page's h2 group rules. */
const levelFor = (n: FrameNode) => Math.min(6, 3 + n.level) as 3 | 4 | 5 | 6;

/**
 * One project in the dependency layout. A project that others build on renders as a
 * frame around them; anything else renders as an ordinary card.
 */
export function ProjectNode({ node }: { node: FrameNode }) {
  if (node.children.length) return <ProjectFrame node={node} />;
  return (
    <ReleaseCard
      project={node.project}
      variant="full"
      headingLevel={levelFor(node)}
      lab={node.lab}
      alsoUses={node.alsoUses}
      usedBy={node.usedByElsewhere}
    />
  );
}

export function ProjectFrame({ node }: { node: FrameNode }) {
  const p = node.project;
  const H = `h${levelFor(node)}` as 'h3' | 'h4' | 'h5' | 'h6';
  const labelId = `frame-${p.slug}`;
  const listId = `frame-${p.slug}-list`;
  const ref = useRef<HTMLDivElement>(null);
  const on = useFrameTrace(ref);
  const count = `used by ${node.usedByCount} ${node.usedByCount === 1 ? 'project' : 'projects'}`;
  return (
    <div
      ref={ref}
      role="group"
      className={`frame frame--${p.status}${node.lab ? ' frame--lab' : ''}`}
      id={p.slug}
      aria-labelledby={labelId}
      data-level={Math.min(node.level, 3)}
    >
      <FrameTrace on={on} />
      <H className="frame__label" id={labelId} aria-label={`${p.name}, ${count}`}>
        <span className="frame__glyph" aria-hidden="true">
          ╡
        </span>
        <span className="frame__title">
          <span className="frame__name">{p.name}</span>
          <span className="frame__count">{count}</span>
        </span>
        <span className="frame__glyph" aria-hidden="true">
          ╞
        </span>
      </H>
      <ReleaseCard
        project={p}
        variant="frame"
        headingLevel={levelFor(node)}
        anchor={false}
        lab={node.lab}
        alsoUses={node.alsoUses}
        usedBy={node.usedByElsewhere}
      />
      <div className="frame__body">
        <p className="frame__caption" id={listId}>
          Built on {p.name}
        </p>
        <ul className="frame__list" aria-labelledby={listId}>
          {node.children.map((c) => (
            <li key={c.project.slug}>
              <ProjectNode node={c} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
