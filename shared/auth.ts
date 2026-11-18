/**
 * Netlify Identity over its REST endpoints (GoTrue at `/.netlify/identity`),
 * the same ones @netlify/identity calls. A phone has no cookies or redirect
 * pages, so both clients use tokens: email and password for an access token,
 * refreshed before it expires, sent to the API as a bearer token.
 */
import type { User } from './types';

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  user: User;
}

/** Where a client keeps the session: localStorage on the web, ApplicationSettings on phones. */
export interface SessionStore {
  get(): string | null;
  set(value: string): void;
  remove(): void;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface IdentityUser {
  id: string;
  email: string;
  user_metadata?: { full_name?: string };
}

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 60_000;

export class IdentityError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function toUser(u: IdentityUser): User {
  return { id: u.id, email: u.email, ...(u.user_metadata?.full_name ? { name: u.user_metadata.full_name } : {}) };
}

export class Auth {
  private session: Session | null = null;
  private refreshing: Promise<Session | null> | null = null;
  private listeners = new Set<(session: Session | null) => void>();

  /** `siteUrl` is the site or deploy URL; Identity lives at `<siteUrl>/.netlify/identity`. */
  constructor(
    private readonly siteUrl: string,
    private readonly store: SessionStore,
  ) {
    const saved = store.get();
    if (saved) {
      try {
        this.session = JSON.parse(saved) as Session;
      } catch {
        store.remove();
      }
    }
  }

  get current(): Session | null {
    return this.session;
  }

  onChange(listener: (session: Session | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signUp(email: string, password: string, name?: string): Promise<Session> {
    await this.request('/signup', { email, password, data: name ? { full_name: name } : {} });
    return this.logIn(email, password);
  }

  async logIn(email: string, password: string): Promise<Session> {
    const tokens = await this.form('/token', { grant_type: 'password', username: email, password });
    return this.save(tokens);
  }

  logOut(): void {
    const token = this.session?.accessToken;
    this.set(null);
    if (token) void fetch(this.url('/logout'), { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  }

  /** A valid access token, refreshed when it's about to expire; null when signed out or the refresh token was revoked. */
  async token(): Promise<string | null> {
    const s = this.session;
    if (!s) return null;
    if (s.expiresAt - REFRESH_MARGIN_MS > Date.now()) return s.accessToken;
    this.refreshing ??= this.refresh(s.refreshToken).finally(() => (this.refreshing = null));
    return (await this.refreshing)?.accessToken ?? null;
  }

  private async refresh(refreshToken: string): Promise<Session | null> {
    try {
      return await this.save(await this.form('/token', { grant_type: 'refresh_token', refresh_token: refreshToken }));
    } catch (e) {
      if (e instanceof IdentityError && e.status < 500) this.set(null);
      return null;
    }
  }

  private async save(tokens: TokenResponse): Promise<Session> {
    const res = await fetch(this.url('/user'), { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!res.ok) throw new IdentityError(await errorText(res), res.status);
    const session: Session = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      user: toUser((await res.json()) as IdentityUser),
    };
    this.set(session);
    return session;
  }

  private set(session: Session | null): void {
    this.session = session;
    if (session) this.store.set(JSON.stringify(session));
    else this.store.remove();
    for (const l of this.listeners) l(session);
  }

  private url(path: string): string {
    return `${this.siteUrl.replace(/\/$/, '')}/.netlify/identity${path}`;
  }

  private async request(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(this.url(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new IdentityError(await errorText(res), res.status);
    return res.json();
  }

  private async form(path: string, fields: Record<string, string>): Promise<TokenResponse> {
    const body = Object.entries(fields)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const res = await fetch(this.url(path), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) throw new IdentityError(await errorText(res), res.status);
    return (await res.json()) as TokenResponse;
  }
}

async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text) as { error_description?: string; msg?: string; error?: string };
    return j.error_description ?? j.msg ?? j.error ?? `Identity answered ${res.status}`;
  } catch {
    return text || `Identity answered ${res.status}`;
  }
}
