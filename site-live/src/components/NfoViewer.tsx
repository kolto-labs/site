import { useId, useMemo, useState, type ReactNode } from 'react';
import { CopyButton } from './CopyButton';
import { NfoRail } from '../placements/nfo/NfoRail';

const ART = /(\.{3,}|[·∙]{2,})/;

/** Tint dotted leaders as a quiet terminal-style reading aid. */
function colorize(line: string, key: number): ReactNode {
  const parts = line.split(ART);
  return parts.map((part, i) => {
    if (!part) return null;
    if (i % 2 === 1) {
      const cls = 'nfo-lead';
      return (
        <span key={`${key}-${i}`} className={cls}>
          {part}
        </span>
      );
    }
    return part;
  });
}

export function frameNfo(text: string): { lines: string[]; cols: number; framed: string } {
  const raw = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\n+$/, '').split('\n');
  const cols = Math.max(1, ...raw.map((line) => [...line].length));
  return { lines: raw, cols, framed: raw.join('\n') };
}

interface Props {
  /** Short label shown in the viewer header. */
  title: string;
  text: string;
  caption?: ReactNode;
  /** Show only this many rows until the reader expands the viewer. */
  clampRows?: number;
}

export function NfoViewer({ title, text, caption, clampRows }: Props) {
  const [expanded, setExpanded] = useState(false);
  const scrollId = useId();
  const { lines, cols } = useMemo(() => frameNfo(text), [text]);
  const clamped = Boolean(clampRows && lines.length > clampRows && !expanded);

  return (
    <figure className="nfo" data-reveal>
      <div className="nfo__bar">
        <span className="nfo__file">
          {title}
        </span>
        <span className="nfo__meta">
          {cols} columns · {lines.length} lines
        </span>
        <span className="nfo__actions">
          <CopyButton text={text} label="Copy" what={title} />
        </span>
      </div>
      <div
        id={scrollId}
        className={`nfo__scroll${clamped ? ' is-clamped' : ''}`}
        tabIndex={0}
        role="region"
        aria-label={`${title}, plain-text document`}
        style={clampRows ? { ['--rows' as string]: clampRows } : undefined}
      >
        <pre className="nfo__pre" style={{ ['--cols' as string]: cols }}>
          {lines.map((l, i) => (
            <span key={i}>
              {colorize(l, i)}
              {'\n'}
            </span>
          ))}
        </pre>
      </div>
      {clampRows && lines.length > clampRows ? (
        <div className="nfo__more">
          <button type="button" className="btn btn--sm btn--ghost" aria-expanded={expanded} aria-controls={scrollId} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Collapse' : `Read all ${lines.length} lines`}
          </button>
        </div>
      ) : null}
      <NfoRail />
      {caption ? <figcaption className="nfo__caption">{caption}</figcaption> : null}
    </figure>
  );
}
