import { Marked } from 'marked';
import { useMemo, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SAFE_HREF = /^(https?:|mailto:|\/|#)/i;
/** Off-site: absolute http(s), or protocol-relative (`//host`, and `/\host`, which browsers read the same way). */
const EXTERNAL_HREF = /^(https?:|\/[\/\\])/i;
/** A same-site path the SPA router can take: starts with one `/` and is not protocol-relative. */
export const isAppPath = (href: string) => href.startsWith('/') && !EXTERNAL_HREF.test(href);

/**
 * Markdown -> HTML with raw HTML disabled (escaped) and only http(s)/mailto/relative links.
 * Content comes from our own JSON, but we treat it as untrusted anyway.
 */
const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!SAFE_HREF.test(href)) return label;
      const external = EXTERNAL_HREF.test(href);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      const rel = external ? ' rel="noopener noreferrer"' : '';
      return `<a href="${escapeHtml(href)}"${t}${rel}>${label}</a>`;
    },
    image({ text }) {
      return escapeHtml(text);
    },
  },
});

export function renderMd(source: string, inline = false): string {
  return (inline ? md.parseInline(source ?? '') : md.parse(source ?? '')) as string;
}

interface Props {
  source: string;
  inline?: boolean;
  className?: string;
  as?: 'div' | 'span';
}

export function Md({ source, inline = false, className, as = 'div' }: Props) {
  const html = useMemo(() => renderMd(source, inline), [source, inline]);
  const navigate = useNavigate();
  const onClick = (e: MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const href = a.getAttribute('href') ?? '';
    if (isAppPath(href)) {
      e.preventDefault();
      navigate(href);
    }
  };
  const Tag = as;
  return <Tag className={['md', className].filter(Boolean).join(' ')} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
