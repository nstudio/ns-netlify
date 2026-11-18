import { createHash } from 'node:crypto';
import type { User } from '../../shared/types.ts';
import { HttpError } from './errors.ts';
import { isLocalUrl, publicOrigin } from './origin.ts';

const CACHE_MS = 5 * 60_000;
const CACHE_MAX = 10_000;
const IDENTITY_TIMEOUT_MS = 8_000;

interface Cached {
  user: User;
  until: number;
}

const verified = new Map<string, Cached>();
const pending = new Map<string, Promise<User>>();

/** The signed-in user for a request, from `Authorization: Bearer` or (for /api/live) `?token=`. */
export async function requireUser(req: Request, ip: string | undefined, tokenParam?: string | null): Promise<User> {
  const dev = devUser(req, ip, tokenParam);
  if (dev) return dev;
  const header = req.headers.get('authorization');
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? tokenParam ?? null;
  if (!token) throw new HttpError(401, 'Sign in first');
  return verify(token, identityOrigin(req));
}

/** Every deploy of a site shares one Identity, so tokens are checked against the site's own URL whatever Host a request names. */
function identityOrigin(req: Request): string {
  const site = process.env.URL?.replace(/\/$/, '');
  return site && !isLocalUrl(site) ? site : publicOrigin(req);
}

async function verify(token: string, origin: string): Promise<User> {
  const id = createHash('sha256').update(token).digest('hex');
  const hit = verified.get(id);
  if (hit && hit.until > Date.now()) return hit.user;
  if (hit) verified.delete(id);

  let p = pending.get(id);
  if (!p) {
    p = fetchUser(token, origin)
      .then((user) => {
        remember(id, user, token);
        return user;
      })
      .finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

async function fetchUser(token: string, origin: string): Promise<User> {
  let res: Response;
  try {
    res = await fetch(`${origin}/.netlify/identity/user`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
    });
  } catch (e) {
    console.error('[auth] Identity unreachable', { origin, error: (e as Error).message });
    throw new HttpError(503, 'Could not reach Netlify Identity; try again');
  }
  if (res.status === 401 || res.status === 403 || res.status === 400) {
    throw new HttpError(401, 'Your session has expired; sign in again');
  }
  if (!res.ok) {
    console.error('[auth] Identity answered', res.status, { origin });
    throw new HttpError(503, 'Netlify Identity is unavailable; try again');
  }
  const u = (await res.json()) as { id?: unknown; email?: unknown; user_metadata?: { full_name?: unknown } };
  if (typeof u.id !== 'string' || !u.id) throw new HttpError(401, 'Your session has expired; sign in again');
  const user: User = { id: u.id, email: typeof u.email === 'string' ? u.email : '' };
  if (typeof u.user_metadata?.full_name === 'string' && u.user_metadata.full_name) user.name = u.user_metadata.full_name;
  return user;
}

function remember(id: string, user: User, token: string) {
  const now = Date.now();
  const exp = jwtExpiry(token);
  const until = Math.min(now + CACHE_MS, exp ?? now + CACHE_MS);
  if (until <= now) return;
  if (verified.size >= CACHE_MAX) {
    for (const [k, v] of verified) if (v.until <= now) verified.delete(k);
    if (verified.size >= CACHE_MAX) verified.delete(verified.keys().next().value!);
  }
  verified.set(id, { user, until });
}

/** The token's `exp` in epoch ms. Only bounds the cache; Identity is what vouches for the token. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * `netlify dev` serves no Identity, so local runs sign in with
 * `x-dev-user: <email>` (or `?dev_user=` on /api/live). Every condition must
 * hold: the CLI's NETLIFY_DEV flag, a site URL on localhost (a deployed site's
 * URL is set by the platform) and a loopback client, so setting NETLIFY_DEV on
 * a deployed site still can't enable it.
 */
export const DEV_AUTH = process.env.NETLIFY_DEV === 'true' && isLocalUrl(process.env.URL);

function devUser(req: Request, ip: string | undefined, tokenParam?: string | null): User | null {
  if (!DEV_AUTH) return null;
  const email =
    req.headers.get('x-dev-user') ?? (tokenParam === undefined ? null : new URL(req.url).searchParams.get('dev_user'));
  if (!email) return null;
  if (!ip || !LOOPBACK.has(ip)) {
    throw new HttpError(401, 'Dev sign-in only works on localhost');
  }
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(clean)) throw new HttpError(400, 'x-dev-user must be an email address');
  return { id: `dev:${clean}`, email: clean, name: clean.split('@')[0] };
}
