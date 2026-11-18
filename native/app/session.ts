import { ApplicationSettings } from '@nativescript/core';
import { ApiError, Auth, createApi, IdentityError, type Api, type SessionStore } from './shared';
import { API_BASE } from './config';

// Keyed by API base: each deploy preview's app keeps its own session.
const KEY = `fieldnotes.session:${API_BASE}`;

const store: SessionStore = {
  get: () => ApplicationSettings.getString(KEY, null) ?? null,
  set: (value) => ApplicationSettings.setString(KEY, value),
  remove: () => ApplicationSettings.remove(KEY),
};

export const auth = new Auth(API_BASE, store);

const EXPIRED = 'Your session expired. Sign in again to pick up where you left off.';

/** Why the last session ended, when it wasn't the person signing out. */
let endedBecause: string | null = null;
let signingOut = false;
let wasSignedIn = !!auth.current;

export function takeEndReason(): string | null {
  const reason = endedBecause;
  endedBecause = null;
  return reason;
}

export function signOut(): void {
  signingOut = true;
  try {
    auth.logOut();
  } finally {
    signingOut = false;
  }
}

function expire(): void {
  if (!auth.current) return;
  endedBecause = EXPIRED;
  auth.logOut();
}

// Auth drops the session itself when the server revokes its refresh token.
auth.onChange((session) => {
  if (!session && wasSignedIn && !signingOut) endedBecause ??= EXPIRED;
  wasSignedIn = !!session;
});

const raw = createApi({ baseUrl: API_BASE, token: () => auth.token() });

/** The API, signing out when the server no longer accepts the session's token. */
export const api: Api = Object.fromEntries(
  Object.entries(raw).map(([name, value]) => [
    name,
    typeof value !== 'function'
      ? value
      : async (...args: unknown[]) => {
          try {
            return await (value as (...a: unknown[]) => unknown)(...args);
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) expire();
            throw e;
          }
        },
  ]),
) as unknown as Api;

// photoUrl is synchronous; the wrapper above would turn it into a promise.
api.photoUrl = raw.photoUrl;

/** Preview links @valor/nativescript-websockets, which installs a standard WebSocket global. */
export const WebSocketImpl: typeof WebSocket | undefined = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;

/** A sentence a person can act on, for any error from Identity, the API or the network. */
export function friendlyError(e: unknown): string {
  const message = (e as Error)?.message ?? String(e);
  if (e instanceof IdentityError || e instanceof ApiError) {
    if (e.status === 404 || e.status === 405) return 'Field Notes isn’t answering at this address yet. Try again in a moment.';
    if (e.status >= 500) return 'Field Notes had a problem on its side. Try again in a moment.';
    if (/email not confirmed/i.test(message)) return 'Check your inbox and confirm your email, then sign in.';
    if (/invalid_grant|no user found|invalid password/i.test(message)) return 'That email and password don’t match an account.';
    return message.charAt(0).toUpperCase() + message.slice(1);
  }
  if (/answered 40[45]\b/.test(message)) return 'Field Notes isn’t answering at this address yet. Try again in a moment.';
  if (/answered 5\d\d\b/.test(message)) return 'Field Notes had a problem on its side. Try again in a moment.';
  if (/network|failed to fetch|internet|offline|timed out|resolve host|connection|UnknownHost|NSURLErrorDomain/i.test(message)) {
    return 'You’re offline, or Field Notes can’t be reached. Check your connection and try again.';
  }
  return message;
}
