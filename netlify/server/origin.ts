const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * The origin the client used, for absolute links and for reaching this
 * deploy's Identity. `netlify dev` hands the server a request addressed to an
 * internal 127.0.0.1 port, so a loopback origin falls back to the site URL.
 * Never derive it from X-Forwarded-* headers: clients can set those, and this
 * origin decides which Identity server vouches for tokens.
 */
export function publicOrigin(req: Request): string {
  const site = (process.env.URL ?? '').replace(/\/$/, '');
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return site;
  }
  if (LOOPBACK_HOSTS.has(url.hostname) && site) return site;
  return url.origin;
}
