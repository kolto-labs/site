const UPSTREAM = new URL('https://play.swkotor.net');
const PRIMARY = 'play.kolto-labs.org';
const HOSTS = new Set([UPSTREAM.hostname, 'www.play.swkotor.net', PRIMARY, 'play.swkotor.org']);

function rewrite(value, requestUrl, canonical = false) {
  if (!value) return value;
  if (!canonical && !/^https?:\/\//i.test(value) && !value.startsWith('//')) return value;
  try {
    const target = new URL(value, UPSTREAM);
    if (!HOSTS.has(target.hostname)) return value;
    target.protocol = 'https:';
    target.hostname = canonical ? PRIMARY : requestUrl.hostname;
    return target.toString();
  } catch {
    return value;
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    const target = new URL(UPSTREAM);
    target.pathname = url.pathname;
    target.search = url.search;
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('accept-encoding', 'identity');
    const origin = headers.get('origin');
    if (origin === url.origin) headers.set('origin', UPSTREAM.origin);
    const referer = headers.get('referer');
    if (referer?.startsWith(url.origin + '/')) headers.set('referer', referer.replace(url.origin, UPSTREAM.origin));
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    if (upstream.status === 101) return upstream;
    const out = new Headers(upstream.headers);
    for (const key of ['content-encoding', 'content-length', 'transfer-encoding', 'connection']) out.delete(key);
    if (out.has('location')) out.set('location', rewrite(out.get('location'), url));
    if (out.get('access-control-allow-origin') === UPSTREAM.origin) out.set('access-control-allow-origin', url.origin);
    // Keep any upstream session cookie scoped to the hostname serving the mirror.
    const cookies = upstream.headers.getAll('set-cookie');
    if (cookies.length) {
      out.delete('set-cookie');
      for (const cookie of cookies) out.append('set-cookie', cookie.replace(/;\s*Domain=\.?(?:play\.)?swkotor\.net(?=;|$)/ig, ''));
    }
    const response = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
    if (request.method === 'HEAD' || !out.get('content-type')?.includes('text/html')) return response;
    return new HTMLRewriter()
      .on('a[href], link[href]', { element(el) { el.setAttribute('href', rewrite(el.getAttribute('href'), url, el.getAttribute('rel') === 'canonical')); } })
      .on('form[action]', { element(el) { el.setAttribute('action', rewrite(el.getAttribute('action'), url)); } })
      .on('script[src], img[src], iframe[src], source[src]', { element(el) { el.setAttribute('src', rewrite(el.getAttribute('src'), url)); } })
      .on('meta[property="og:url"], meta[name="twitter:url"]', { element(el) { el.setAttribute('content', rewrite(el.getAttribute('content'), url, true)); } })
      .transform(response);
  },
};
