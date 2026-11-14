import { useId, useMemo, useState, type ReactNode } from 'react';
import { CopyButton } from './CopyButton';
import { usePrefs } from '../lib/prefs';

const ART = /([─-▟■▪▬▲►▼◄]+|\.{3,}|[·∙]{2,})/;

/** Colour runs of box/block glyphs and dotted leaders; everything else stays plain text. */
function colorize(line: string, key: number): ReactNode {
  const parts = line.split(ART);
  return parts.map((part, i) => {
    if (!part) return null;
    if (i % 2 === 1) {
      const cls = /^[.·∙]+$/.test(part) ? 'nfo-lead' : 'nfo-art';
      return (
        <span key={`${key}-${i}`} className={cls}>
          {part}
        </span>
      );
    }
    return part;
  });
}

export function frameNfo(text: string, title: string): { lines: string[]; cols: number; framed: string } {
  const raw = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\n+$/, '').split('\n');
  const inner = Math.max(76, ...raw.map((l) => [...l].length));
  const pad = (l: string) => l + ' '.repeat(Math.max(0, inner - [...l].length));
  const label = `[ ${title} ]`;
  const topFill = inner - label.length;
  const top = `╔══${label}${'═'.repeat(Math.max(1, topFill))}╗`;
  const bottom = `╚${'═'.repeat(inner + 2)}╝`;
  const body = raw.map((l) => `║ ${pad(l)} ║`);
  const framed = [top, `║ ${pad('')} ║`, ...body, `║ ${pad('')} ║`, bottom].join('\n');
  return { lines: raw.map(pad), cols: inner + 4, framed };
}

interface Props {
  /** Name shown in the frame, e.g. KOLTO LABS */
  title: string;
  text: string;
  /** Download file name */
  filename?: string;
  caption?: ReactNode;
  /** Show only this many rows until the reader expands the viewer. */
  clampRows?: number;
}

export function NfoViewer({ title, text, filename, caption, clampRows }: Props) {
  const [expanded, setExpanded] = useState(false);
  const scrollId = useId();
  const { lines, cols, framed } = useMemo(() => frameNfo(text, title), [text, title]);
  const { blip } = usePrefs();
  const topInner = framed.split('\n')[0];
  const bottom = framed.split('\n').at(-1) ?? '';
  const blank = ' '.repeat(cols - 4);
  const file = filename ?? `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;
  const clamped = Boolean(clampRows && lines.length + 4 > clampRows && !expanded);

  const download = () => {
    const blob = new Blob([framed + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    blip('ok');
  };

  return (
    <figure className="nfo" data-reveal>
      <div className="nfo__bar">
        <span className="nfo__file" aria-hidden="true">
          {title}
        </span>
        <span className="nfo__meta">
          {cols - 4} cols · {lines.length} lines · UTF-8
        </span>
        <span className="nfo__actions">
          <CopyButton text={text} label="Copy" what={title} />
          <button type="button" className="btn btn--sm" onClick={download}>
            Download .txt
          </button>
        </span>
      </div>
      <div
        id={scrollId}
        className={`nfo__scroll${clamped ? ' is-clamped' : ''}`}
        tabIndex={0}
        role="region"
        aria-label={`${title}, plain-text release notes`}
        style={clampRows ? { ['--rows' as string]: clampRows } : undefined}
      >
        <pre className="nfo__pre" style={{ ['--cols' as string]: cols }}>
          <span className="nfo-frame" aria-hidden="true">
            {topInner}
            {'\n'}║ {blank} ║{'\n'}
          </span>
          {lines.map((l, i) => (
            <span key={i}>
              <span className="nfo-frame" aria-hidden="true">
                ║{' '}
              </span>
              {colorize(l, i)}
              <span className="nfo-frame" aria-hidden="true">
                {' '}║
              </span>
              {'\n'}
            </span>
          ))}
          <span className="nfo-frame" aria-hidden="true">
            ║ {blank} ║{'\n'}
            {bottom}
          </span>
        </pre>
      </div>
      {clampRows && lines.length + 4 > clampRows ? (
        <div className="nfo__more">
          <button type="button" className="btn btn--sm btn--ghost" aria-expanded={expanded} aria-controls={scrollId} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Collapse' : `Read all ${lines.length} lines`}
          </button>
        </div>
      ) : null}
      {caption ? <figcaption className="nfo__caption">{caption}</figcaption> : null}
    </figure>
  );
}
