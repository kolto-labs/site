/**
 * Site content entry point.
 *
 * `@site-content` is an alias (see vite.config.ts + tsconfig paths) that resolves to
 * ../../../content/site-content.json (the copywriter's file, relative to this module)
 * whenever it exists, and to ./placeholder.json otherwise. Swap content by editing
 * that JSON file; no code changes needed.
 */
import raw from '@site-content';
import type { SiteContent, Project } from './types';
import { PAGES } from '../flags';

export type * from './types';

const full = raw as unknown as SiteContent;

/** With PAGES.join off: no /join meta, links into /join point at the home page, and the FAQ points at GitHub. */
function withoutJoin(c: SiteContent): SiteContent {
  const swap = (s: string) => s.replace(/\(\/join\/?#/g, '(/#').replace('See the Join page.', 'Start at [github.com/kolto-labs](https://github.com/kolto-labs).');
  const { '/join': _off, ...meta } = c.meta as Record<string, unknown>;
  return {
    ...c,
    meta: meta as SiteContent['meta'],
    about: { ...c.about, sections: c.about.sections.map((s) => ({ ...s, body: swap(s.body) })) },
    faq: c.faq.map((f) => ({ ...f, a: swap(f.a) })),
  };
}

/** Donation links that are actually live. Empty means no Support link and the original FAQ answer. */
export const SUPPORT_LINKS = (full.support?.links ?? []).filter(
  (l): l is { name: string; url: string } => typeof l.url === 'string' && l.url.length > 0,
);

/** Once a link is live, the `donations` FAQ entry lists them, so the page and its JSON-LD agree. */
function withSupport(c: SiteContent): SiteContent {
  if (!c.support || SUPPORT_LINKS.length === 0) return c;
  const list = SUPPORT_LINKS.map((l) => `[${l.name}](${l.url})`).join(' · ');
  const a = c.support.faq.replace('{links}', list);
  return { ...c, faq: c.faq.map((f) => (f.id === 'donations' ? { ...f, a } : f)) };
}

export const content = withSupport(PAGES.join ? full : withoutJoin(full));

/** Canonical origin. Single place to change after deploy (content.siteUrl wins). */
export const SITE_URL = (content.siteUrl || 'https://kolto-labs.org').replace(/\/+$/, '');

export const LINKS = {
  github: 'https://github.com/kolto-labs',
  // TODO: contact email not yet decided.
  email: null as string | null,
};

export const projectBySlug = (slug: string): Project | undefined =>
  content.projects.find((p) => p.slug === slug);
