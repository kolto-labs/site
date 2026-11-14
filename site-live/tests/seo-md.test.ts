import { describe, expect, it } from 'vitest';
import { renderMd } from '../src/components/Md';
import { ROUTES, headFor, headHtml, hrefFor, normalizePath, plain, type Head } from '../src/lib/seo';

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const SAFE = /^(https?:|mailto:|\/|#)/i;

describe('headHtml JSON-LD', () => {
  const head = (over: Partial<Head> = {}): Head => ({
    title: 't',
    description: 'd',
    canonical: 'https://x/',
    ogImage: 'https://x/o.png',
    ogType: 'website',
    robots: 'index, follow',
    jsonLd: [],
    ...over,
  });
  const scripts = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  it('escapes </script> in GitHub-sourced text so it cannot close the tag', () => {
    const evil = 'x</script><script>alert(1)</script><!-- <img src=x onerror=alert(1)>';
    const html = headHtml(head({ jsonLd: [{ '@type': 'SoftwareSourceCode', description: evil }] }));
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html.match(/<script/g)).toHaveLength(1);
    const [body] = scripts(html);
    expect(body).not.toContain('<');
    expect(JSON.parse(body).description).toBe(evil); // still round-trips for crawlers
  });

  it('escapes every ld+json block, not just the first', () => {
    const html = headHtml(head({ jsonLd: [{ a: '</script>' }, { b: '<!--' }, { c: '<script>' }] }));
    expect(html.match(/<\/script>/g)).toHaveLength(3);
    for (const body of scripts(html)) expect(body).not.toContain('<');
  });

  it('escapes quotes and angle brackets in the title and description attributes', () => {
    const html = headHtml(head({ title: 'a"><script>x</script>', description: '"><img onerror=x>' }));
    expect(html).not.toContain('<script>x');
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('every real route yields exactly one closing tag per JSON-LD block', () => {
    for (const route of [...ROUTES, '/404']) {
      const h = headFor(route);
      const html = headHtml(h);
      expect(html.match(/<\/script>/g)?.length ?? 0, route).toBe(h.jsonLd.length);
      for (const body of scripts(html)) expect(() => JSON.parse(body), route).not.toThrow();
    }
  });
});

describe('seo helpers', () => {
  it('hrefFor and normalizePath agree on the trailing slash', () => {
    expect(hrefFor('/')).toBe('/');
    expect(hrefFor('/about')).toBe('/about/');
    expect(hrefFor('/about///')).toBe('/about/');
    expect(normalizePath('/about/')).toBe('/about');
    expect(normalizePath('/about/index.html')).toBe('/about');
    expect(normalizePath('/index.html')).toBe('/');
    expect(normalizePath('')).toBe('/');
  });

  it('plain strips markdown to text', () => {
    expect(plain('# Hi\n\n- **bold** [link](http://x) `code` ![i](a.png)\n```\nfence\n```')).toBe('Hi bold link code');
  });

  it('404 is noindex with no canonical', () => {
    const h = headFor('/404');
    expect(h.robots).toBe('noindex');
    expect(h.canonical).toBe('');
  });
});

describe('renderMd with hostile markdown', () => {
  it('escapes raw HTML blocks and inline tags', () => {
    const out = renderMd('<script>alert(1)</script>\n\nhi <img src=x onerror=alert(1)> there <b>b</b>');
    expect(out).not.toMatch(/<script|<img|<b>/i);
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes raw HTML in inline mode too', () => {
    const out = renderMd('<iframe src=//evil></iframe> x', true);
    expect(out).not.toMatch(/<iframe/i);
  });

  it.each([
    ['javascript', '[x](javascript:alert(1))'],
    ['mixed case', '[x](JaVaScRiPt:alert(1))'],
    ['data', '[x](data:text/html;base64,PHNjcmlwdD4=)'],
    ['vbscript', '[x](vbscript:msgbox(1))'],
    ['decimal entity', '[x](&#106;avascript:alert(1))'],
    ['hex entity', '[x](&#x6A;avascript:alert(1))'],
    ['entity in the colon', '[x](javascript&colon;alert(1))'],
    ['entity-encoded data', '[x](&#100;ata:text/html,hi)'],
    ['angle-bracket destination', '[x](<javascript:alert(1)>)'],
    ['reference link', '[x][r]\n\n[r]: javascript:alert(1)'],
    ['autolink', '<javascript:alert(1)>'],
    ['leading space', '[x]( javascript:alert(1))'],
    ['file', '[x](file:///etc/passwd)'],
  ])('drops a %s link target but keeps the label', (_n, md) => {
    const out = renderMd(md);
    expect(out).not.toMatch(/href="(javascript|vbscript|data|file):/i);
    expect(out).not.toContain('<a');
    for (const h of hrefs(out)) expect(h).toMatch(SAFE);
  });

  it('keeps the label text when it drops the link', () => {
    const out = renderMd('[click me](javascript:alert(1))');
    expect(out).toContain('click me');
    expect(out).not.toContain('<a');
  });

  it('keeps safe links and marks external ones noopener noreferrer', () => {
    const out = renderMd('[a](https://example.com/p?q=1&r=2) [b](/projects/) [c](#top) [d](mailto:a@b.c)');
    expect(out).toContain('<a href="https://example.com/p?q=1&amp;r=2" rel="noopener noreferrer">a</a>');
    expect(out).toContain('<a href="/projects/">b</a>');
    expect(out).toContain('<a href="#top">c</a>');
    expect(out).toContain('<a href="mailto:a@b.c">d</a>');
  });

  it('escapes a title that tries to break out of the attribute', () => {
    const out = renderMd('[x](https://a.b "t\\" onmouseover=\\"alert(1)")');
    expect(out).toContain('title="t&quot; onmouseover=&quot;alert(1)"'); // quotes escaped: it stays inside the attribute
    expect(out.match(/<a [^>]*>/)![0]).toMatch(/^<a href="[^"]*" title="[^"]*" rel="[^"]*">$/); // no extra attribute got in
  });

  it('never emits an image tag; images become escaped alt text', () => {
    const out = renderMd('![a" onerror="alert(1)](https://x/y.png) ![<b>](x.png)');
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/<b>/);
  });

  it('survives null-ish input', () => {
    expect(renderMd(undefined as unknown as string)).toBe('');
  });
});
