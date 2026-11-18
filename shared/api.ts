import type { LiveEvent, Note, NoteInput, NotePatch, Photo, User } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface ApiOptions {
  /** The site or deploy URL the API is served from. */
  baseUrl: string;
  /** A current access token, or null when signed out. */
  token: () => Promise<string | null>;
}

export type Api = ReturnType<typeof createApi>;

export function createApi({ baseUrl, token }: ApiOptions) {
  const base = baseUrl.replace(/\/$/, '');

  async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const t = await token();
    const init: RequestInit = { method, headers: { ...headers, ...(t ? { authorization: `Bearer ${t}` } : {}) } };
    if (body !== undefined) {
      if (typeof body === 'object' && body !== null && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) {
        init.body = JSON.stringify(body);
        (init.headers as Record<string, string>)['content-type'] = 'application/json';
      } else {
        init.body = body as BodyInit;
      }
    }
    const res = await fetch(`${base}${path}`, init);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON error pages (a proxy, a cold start) still produce a readable error below.
    }
    if (!res.ok) throw new ApiError((json as { error?: string } | null)?.error ?? `The API answered ${res.status}`, res.status);
    return json as T;
  }

  return {
    baseUrl: base,
    me: () => call<{ user: User }>('GET', '/api/me').then((r) => r.user),
    notes: (opts: { q?: string; before?: string } = {}) => {
      const qs = [opts.q && `q=${encodeURIComponent(opts.q)}`, opts.before && `before=${encodeURIComponent(opts.before)}`].filter(Boolean).join('&');
      return call<{ notes: Note[] }>('GET', `/api/notes${qs ? `?${qs}` : ''}`).then((r) => r.notes);
    },
    note: (id: string) => call<{ note: Note }>('GET', `/api/notes/${encodeURIComponent(id)}`).then((r) => r.note),
    create: (input: NoteInput) => call<{ note: Note }>('POST', '/api/notes', input).then((r) => r.note),
    update: (id: string, patch: NotePatch) => call<{ note: Note }>('PATCH', `/api/notes/${encodeURIComponent(id)}`, patch).then((r) => r.note),
    remove: (id: string) => call<void>('DELETE', `/api/notes/${encodeURIComponent(id)}`),
    /** Uploads a JPEG; pass its pixel size so layouts can reserve space before it loads. */
    uploadPhoto: (jpeg: ArrayBuffer | Uint8Array, width: number, height: number) =>
      call<Photo>('POST', '/api/photos', jpeg, { 'content-type': 'image/jpeg', 'x-width': String(width), 'x-height': String(height) }),
    share: (id: string) => call<{ shareId: string; url: string }>('POST', `/api/notes/${encodeURIComponent(id)}/share`),
    unshare: (id: string) => call<void>('DELETE', `/api/notes/${encodeURIComponent(id)}/share`),
    /** A photo's absolute URL. */
    photoUrl: (photo: Pick<Photo, 'url'>) => (/^https?:/.test(photo.url) ? photo.url : `${base}${photo.url}`),
  };
}

export interface LiveOptions {
  baseUrl: string;
  token: () => Promise<string | null>;
  onEvent: (event: LiveEvent) => void;
  /** Called with true when connected, false while reconnecting. */
  onStatus?: (connected: boolean) => void;
  /** The platform's WebSocket; defaults to the global one. */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * Keeps a WebSocket to `/api/live` open, reconnecting with backoff. Netlify
 * Server closes sockets with 1012 when an instance restarts, so that code
 * reconnects at once.
 */
export function connectLive({ baseUrl, token, onEvent, onStatus, WebSocketImpl }: LiveOptions): () => void {
  const WS = WebSocketImpl ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (ms: number) => {
    if (!stopped) timer = setTimeout(open, ms);
  };

  async function open() {
    if (stopped || !WS) return;
    const t = await token();
    if (!t) return schedule(5000);
    const url = `${baseUrl.replace(/\/$/, '').replace(/^http/, 'ws')}/api/live?token=${encodeURIComponent(t)}`;
    const ws = new WS(url);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      onStatus?.(true);
    };
    ws.onmessage = (e: MessageEvent) => {
      try {
        onEvent(JSON.parse(String(e.data)) as LiveEvent);
      } catch {
        // A malformed frame is skipped; the next list refresh catches up.
      }
    };
    ws.onclose = (e: CloseEvent) => {
      if (socket === ws) socket = null;
      onStatus?.(false);
      attempt++;
      schedule(e.code === 1012 ? 0 : Math.min(30_000, 500 * 2 ** Math.min(attempt, 6)));
    };
  }

  void open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close();
  };
}
