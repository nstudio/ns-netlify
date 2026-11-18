import { Hono, type Context as HonoContext } from 'hono';
import { getWebSockets, onShutdown, type Config, type Context } from '@netlify/server';
import { requireUser } from './auth.ts';
import { publicOrigin } from './origin.ts';
import {
  createNote,
  db,
  deleteNote,
  getNote,
  getSharedNote,
  isShareId,
  listNotes,
  shareNote,
  unshareNote,
  updateNote,
} from './db.ts';
import { HttpError, badRequest, notFound } from './errors.ts';
import { ensureListening, openLiveSocket, stopListening } from './live.ts';
import { assertOwnPhoto, deletePhoto, servePhoto, uploadPhoto } from './photos.ts';
import { renderNotFound, renderSharedNote } from './share-page.ts';
import { isUuid, parseNoteInput, parseNotePatch } from './validate.ts';

export const config: Config = {
  path: ['/api/*', '/n/*'],
};

type Env = { Bindings: Context };
type C = HonoContext<Env>;

const MAX_JSON_BYTES = 256 * 1024;
const MAX_QUERY_CHARS = 200;

const app = new Hono<Env>();

const user = (c: C) => requireUser(c.req.raw, c.env?.ip);

async function readJson(c: C): Promise<unknown> {
  const length = Number(c.req.header('content-length') ?? 0);
  if (length > MAX_JSON_BYTES) throw new HttpError(413, 'Request body is too large');
  const text = await c.req.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, 'Request body is too large');
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest('Request body must be JSON');
  }
}

function noteId(c: C): string {
  const id = c.req.param('id') ?? '';
  if (!isUuid(id)) throw notFound('No such note');
  return id;
}

app.use('*', async (c, next) => {
  const started = Date.now();
  await next();
  const { pathname } = new URL(c.req.url);
  console.log(`${c.req.method} ${pathname} ${c.res.status} ${Date.now() - started}ms`);
});

// Clients authenticate with bearer tokens, never cookies, so any origin may call the API.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-width, x-height',
  'access-control-max-age': '86400',
};

app.options('/api/*', () => new Response(null, { status: 204, headers: CORS }));

// The /api/live upgrade response must reach the platform untouched, so CORS headers are added per route instead of by middleware.
const cors = async (c: C, next: () => Promise<void>) => {
  await next();
  for (const [k, v] of Object.entries(CORS)) c.res.headers.set(k, v);
};

app.get('/api/me', cors, async (c) => c.json({ user: await user(c) }));

app.get('/api/notes', cors, async (c) => {
  const u = await user(c);
  const q = c.req.query('q')?.trim() || null;
  if (q && q.length > MAX_QUERY_CHARS) throw badRequest(`q is longer than ${MAX_QUERY_CHARS} characters`);
  const beforeRaw = c.req.query('before');
  let before: Date | null = null;
  if (beforeRaw) {
    before = new Date(beforeRaw);
    if (Number.isNaN(before.getTime())) throw badRequest('before must be an ISO date, the createdAt of the last note you have');
  }
  return c.json({ notes: await listNotes(u.id, { q, before }) });
});

app.post('/api/notes', cors, async (c) => {
  const u = await user(c);
  const input = parseNoteInput(await readJson(c));
  if (input.photo) await assertOwnPhoto(input.photo.key, u.id);
  return c.json({ note: await createNote(u.id, input) }, 201);
});

app.get('/api/notes/:id', cors, async (c) => {
  const u = await user(c);
  const note = await getNote(u.id, noteId(c));
  if (!note) throw notFound('No such note');
  return c.json({ note });
});

app.patch('/api/notes/:id', cors, async (c) => {
  const u = await user(c);
  const id = noteId(c);
  const note = await updateNote(u.id, id, parseNotePatch(await readJson(c)));
  if (!note) throw notFound('No such note');
  return c.json({ note });
});

app.delete('/api/notes/:id', cors, async (c) => {
  const u = await user(c);
  const deleted = await deleteNote(u.id, noteId(c));
  if (!deleted) throw notFound('No such note');
  if (deleted.photo?.key) await deletePhoto(deleted.photo.key);
  return c.body(null, 204);
});

app.post('/api/notes/:id/share', cors, async (c) => {
  const u = await user(c);
  const shareId = await shareNote(u.id, noteId(c));
  if (!shareId) throw notFound('No such note');
  return c.json({ shareId, url: `${publicOrigin(c.req.raw)}/n/${shareId}` });
});

app.delete('/api/notes/:id/share', cors, async (c) => {
  const u = await user(c);
  if (!(await unshareNote(u.id, noteId(c)))) throw notFound('No such note');
  return c.body(null, 204);
});

app.post('/api/photos', cors, async (c) => {
  const u = await user(c);
  return c.json(await uploadPhoto(c.req.raw, u.id), 201);
});

app.get('/api/photos/:key', cors, (c) => servePhoto(c.req.param('key') ?? ''));

app.get('/api/live', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    throw new HttpError(426, 'Connect to /api/live with a WebSocket');
  }
  const u = await requireUser(c.req.raw, c.env?.ip, c.req.query('token') ?? null);
  await ensureListening();
  return openLiveSocket(c.req.raw, u.id);
});

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  // Unsharing must take effect at once, so neither browsers nor the CDN keep a copy.
  'cache-control': 'public, max-age=0, must-revalidate',
  'content-security-policy':
    "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

app.get('/n/:shareId', async (c) => {
  const shareId = c.req.param('shareId') ?? '';
  const note = isShareId(shareId) ? await getSharedNote(shareId) : null;
  if (!note) return new Response(renderNotFound(), { status: 404, headers: HTML_HEADERS });
  return new Response(renderSharedNote(note, publicOrigin(c.req.raw)), { headers: HTML_HEADERS });
});

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith('/n/')) {
    return new Response(renderNotFound(), { status: 404, headers: HTML_HEADERS });
  }
  return c.json({ error: 'No such endpoint' }, 404);
});

app.onError((err, c) => {
  const { pathname } = new URL(c.req.url);
  if (err instanceof HttpError) {
    if (err.status >= 500) console.error(`[error] ${c.req.method} ${pathname}: ${err.message}`);
    return c.json({ error: err.message }, err.status as 400);
  }
  console.error(`[error] ${c.req.method} ${pathname}`, err);
  return c.json({ error: 'Something went wrong on our side' }, 500);
});

onShutdown(async ({ drained }) => {
  const sockets = getWebSockets();
  console.log(`[shutdown] closing ${sockets.length} WebSocket(s)`);
  for (const socket of sockets) socket.close(1012, 'Server restarting');
  await stopListening();
  await drained;
  await db.pool.end().catch(() => {});
});

export default app;
