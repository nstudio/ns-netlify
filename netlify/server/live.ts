import { upgradeWebSocket, type WebSocket } from '@netlify/server';
import pg from 'pg';
import type { LiveEvent } from '../../shared/types.ts';
import { db, getNote } from './db.ts';
import { HttpError } from './errors.ts';

/** Seconds between protocol pings; a socket that misses a pong for this long is dropped. */
const PING_SECONDS = 25;
const LISTEN_TIMEOUT_MS = 5_000;

interface Notification {
  op: 'insert' | 'update' | 'delete';
  id: string;
  user_id: string;
}

type ListenClient = pg.Client;

/**
 * LISTEN needs a session of its own. Netlify Database hands out Neon's pooled
 * endpoint (`<endpoint>-pooler.…`), which accepts LISTEN but never delivers
 * notifications, so the listener connects to the same endpoint directly.
 */
export function directConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.hostname = url.hostname.replace(/^([^.]+)-pooler\./, '$1.');
    return url.toString();
  } catch {
    return connectionString;
  }
}

const byUser = new Map<string, Set<WebSocket>>();
let listener: { client: ListenClient; close: () => void } | null = null;
let connecting: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;
let stopped = false;

export function openLiveSocket(req: Request, userId: string): Response {
  const { socket, response } = upgradeWebSocket(req, { idleTimeout: PING_SECONDS });
  let set = byUser.get(userId);
  if (!set) byUser.set(userId, (set = new Set()));
  set.add(socket);
  socket.addEventListener('open', () => send(socket, { type: 'ready' }));
  socket.addEventListener('close', () => {
    const s = byUser.get(userId);
    s?.delete(socket);
    if (s?.size === 0) byUser.delete(userId);
  });
  return response;
}

/** Resolves once this instance is listening, so a socket's `ready` means no change can slip past it. */
export async function ensureListening(): Promise<void> {
  if (listener) return;
  connecting ??= connect().finally(() => (connecting = null));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      connecting,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('LISTEN timed out')), LISTEN_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    console.error('[live] not listening:', (e as Error).message);
    throw new HttpError(503, 'Live updates are unavailable; try again');
  } finally {
    clearTimeout(timer);
  }
}

async function connect(): Promise<void> {
  if (stopped) throw new Error('shutting down');
  clearTimeout(retryTimer);
  retryTimer = undefined;
  const client: ListenClient = new pg.Client({ connectionString: directConnectionString(db.connectionString) });
  try {
    await client.connect();
  } catch (e) {
    void client.end().catch(() => {});
    throw e;
  }
  let closed = false;
  const close = () => {
    if (closed) return false;
    closed = true;
    if (listener?.client === client) listener = null;
    void client.end().catch(() => {});
    return true;
  };
  const drop = (err?: Error) => {
    if (!close()) return;
    console.error('[live] LISTEN connection lost:', err?.message ?? 'ended');
    // Changes made until LISTEN is back would be missed; 1012 makes clients reconnect at once and refetch.
    for (const set of byUser.values()) for (const s of set) s.close(1012, 'Catching up');
    scheduleReconnect();
  };
  client.on('error', drop);
  client.on('end', drop);
  client.on('notification', (msg) => {
    if (msg.channel === 'notes' && msg.payload) void dispatch(msg.payload);
  });
  try {
    await client.query('LISTEN notes');
  } catch (e) {
    close();
    throw e;
  }
  listener = { client, close: () => void close() };
  retryDelay = 1000;
  console.log('[live] listening on "notes"');
}

function scheduleReconnect() {
  if (stopped || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    if (listener || connecting) return;
    connecting = connect()
      .catch((e) => {
        console.error('[live] reconnect failed:', (e as Error).message);
        retryDelay = Math.min(retryDelay * 2, 30_000);
        scheduleReconnect();
      })
      .finally(() => (connecting = null));
  }, retryDelay);
}

async function dispatch(payload: string): Promise<void> {
  let n: Notification;
  try {
    n = JSON.parse(payload) as Notification;
  } catch {
    return;
  }
  const sockets = byUser.get(n.user_id);
  if (!sockets?.size) return;
  if (n.op === 'delete') {
    for (const s of sockets) send(s, { type: 'deleted', id: n.id });
    return;
  }
  try {
    const note = await getNote(n.user_id, n.id);
    if (!note) return;
    for (const s of byUser.get(n.user_id) ?? []) send(s, { type: 'note', note, created: n.op === 'insert' });
  } catch (e) {
    console.error('[live] could not load note', n.id, (e as Error).message);
  }
}

function send(socket: WebSocket, event: LiveEvent) {
  if (socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify(event));
  } catch (e) {
    console.error('[live] send failed:', (e as Error).message);
  }
}

export async function stopListening(): Promise<void> {
  stopped = true;
  clearTimeout(retryTimer);
  const current = listener;
  if (!current) return;
  try {
    await current.client.query('UNLISTEN *');
  } catch {
    // The connection is going away either way.
  }
  current.close();
}
