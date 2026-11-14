import { content, SITE_URL, LINKS } from '../content';
import { snapshotAggregate } from '../content/repos';
import { PAGES } from '../flags';

const ALL_ROUTES = ['/', '/about', '/projects', '/roadmap', '/faq', '/join', '/credits', '/play'] as const;
export type SiteRoute = (typeof ALL_ROUTES)[number];
/** Routes that get a page, a sitemap entry and an llms.txt line. /join is left out while PAGES.join is off. */
export const ROUTES: readonly SiteRoute[] = ALL_ROUTES.filter((r) => r !== '/join' || PAGES.join);

/** Canonical path form: trailing slash (matches Cloudflare's auto-trailing-slash for dir/index.html). */
export const hrefFor = (route: string) => (route === '/' ? '/' : `${route.replace(/\/+$/, '')}/`);

export const normalizePath = (pathname: string) => {
  const p = pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
  return p === '' ? '/' : p;
};

const FALLBACK_META: Record<string, { title: string; description: string }> = {
  '/': { title: 'Kolto Labs — Life support for the Odyssey engine', description: 'Open-source tools for KotOR I & II.' },
  '/404': { title: 'File not found — Kolto Labs', description: 'That page does not exist.' },
};

export interface Head {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  ogType: string;
  robots: string;
  jsonLd: object[];
}

/** Strip markdown to plain text for meta and JSON-LD. */
export function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function orgLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#org`,
    name: 'Kolto Labs',
    alternateName: 'koltolabs',
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/icon-512.png`,
    description: content.press.boilerplateShort,
    sameAs: [LINKS.github],
  };
}

function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: 'Kolto Labs',
    url: `${SITE_URL}/`,
    inLanguage: 'en',
    publisher: { '@id': `${SITE_URL}/#org` },
  };
}

function projectsLd() {
  const { listed, lab } = snapshotAggregate;
  return [...listed, ...lab].map((p) => {
    const ld: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: p.name,
      description: `${p.tagline} ${plain(p.description)}`.trim(),
      programmingLanguage: p.lang,
      url: `${SITE_URL}/projects/#${p.slug}`,
      creator: { '@id': `${SITE_URL}/#org` },
      creativeWorkStatus: p.status === 'in-development' ? 'In development' : p.status === 'planned' ? 'Planned' : 'Published',
      keywords: 'KotOR, Knights of the Old Republic, Odyssey engine, modding',
    };
    // only real SPDX identifiers become licence URLs (skips "TBD", "Follows upstream", ...)
    const spdx = p.license?.split(/\s*(?:,|\/|\bOR\b|\bAND\b)\s*/)[0];
    if (spdx && /^[A-Za-z0-9.+-]+$/.test(spdx) && !/^tbd$/i.test(spdx)) ld.license = `https://spdx.org/licenses/${spdx}.html`;
    if (p.repo) ld.codeRepository = p.repo;
    if (p.version) ld.version = p.version;
    return ld;
  });
}

function faqLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: content.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: plain(f.a) },
    })),
  };
}

function breadcrumbLd(route: string, title: string) {
  if (route === '/') return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Kolto Labs', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: title.split(/\s[—|-]\s/)[0], item: `${SITE_URL}${hrefFor(route)}` },
    ],
  };
}

export function headFor(route: string): Head {
  const is404 = route === '/404';
  const meta = content.meta[route] ?? FALLBACK_META[route] ?? FALLBACK_META['/'];
  const jsonLd: object[] = [];
  if (route === '/') jsonLd.push(orgLd(), websiteLd());
  else if (!is404) jsonLd.push(orgLd());
  if (route === '/projects') jsonLd.push(...projectsLd());
  if (route === '/faq' && content.faq.length) jsonLd.push(faqLd());
  if (!is404) {
    const bc = breadcrumbLd(route, meta.title);
    if (bc) jsonLd.push(bc);
  }
  return {
    title: meta.title,
    description: meta.description,
    canonical: is404 ? '' : `${SITE_URL}${hrefFor(route)}`,
    ogImage: `${SITE_URL}/og-image.png`,
    ogType: route === '/' ? 'website' : 'article',
    robots: is404 ? 'noindex' : 'index, follow',
    jsonLd,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Serialized <head> tags for the prerenderer. */
export function headHtml(h: Head): string {
  const tags = [
    `<title>${esc(h.title)}</title>`,
    `<meta name="description" content="${esc(h.description)}">`,
    `<meta name="robots" content="${h.robots}">`,
    h.canonical && `<link rel="canonical" href="${esc(h.canonical)}">`,
    `<meta property="og:site_name" content="Kolto Labs">`,
    `<meta property="og:type" content="${h.ogType}">`,
    `<meta property="og:title" content="${esc(h.title)}">`,
    `<meta property="og:description" content="${esc(h.description)}">`,
    h.canonical && `<meta property="og:url" content="${esc(h.canonical)}">`,
    `<meta property="og:image" content="${esc(h.ogImage)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="The Kolto Labs logo, the tagline Life support for the Odyssey engine, and a list of released and in-development projects">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(h.title)}">`,
    `<meta name="twitter:description" content="${esc(h.description)}">`,
    `<meta name="twitter:image" content="${esc(h.ogImage)}">`,
    ...h.jsonLd.map((ld) => `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`),
  ];
  return tags.filter(Boolean).join('\n    ');
}

/** Client-side head sync after navigation. */
export function applyHead(h: Head) {
  document.title = h.title;
  const set = (sel: string, attr: string, val: string) => {
    const el = document.head.querySelector(sel);
    if (el) el.setAttribute(attr, val);
  };
  set('meta[name="description"]', 'content', h.description);
  set('meta[name="robots"]', 'content', h.robots);
  set('link[rel="canonical"]', 'href', h.canonical);
  set('meta[property="og:title"]', 'content', h.title);
  set('meta[property="og:description"]', 'content', h.description);
  set('meta[property="og:url"]', 'content', h.canonical);
  set('meta[property="og:type"]', 'content', h.ogType);
  set('meta[name="twitter:title"]', 'content', h.title);
  set('meta[name="twitter:description"]', 'content', h.description);
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
  for (const ld of h.jsonLd) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  }
}
