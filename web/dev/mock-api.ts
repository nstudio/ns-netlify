/**
 * Dev-only stand-in for Netlify Identity and the Field Notes API, served from
 * memory by the Vite dev server (`MOCK=1`). vite.config.ts only loads it for
 * `vite serve`, so it never reaches a production build.
 *
 *   demo@fieldnotes.dev / fieldnotes    a seeded account with notes
 *   any new account                     starts empty (the empty state)
 *   an email containing "+confirm"      signs up but can't log in until confirmed
 *
 * MOCK_LIVE_MS sets how often the live socket pushes a new note (default 10000, 0 turns it off).
 */
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import QRCode from 'qrcode';
import type { Plugin } from 'vite';
import type { LiveEvent, Note, NoteInput, NotePatch, User } from '../../shared/types';
import { SCENES, sceneSvg } from './scenes.ts';

interface Account {
  user: User;
  password: string;
  confirmed: boolean;
  notes: Note[];
}

const accounts = new Map<string, Account>();
const photos = new Map<string, { scene: string; width: number; height: number }>();
const sockets = new Map<string, Set<Duplex>>();

const DEMO_EMAIL = 'demo@fieldnotes.dev';

function photo(scene: keyof typeof SCENES, width: number, height: number) {
  const key = `${scene}-${width}x${height}-${randomUUID().slice(0, 8)}`;
  photos.set(key, { scene, width, height });
  return { key, width, height, url: `/api/photos/${key}` };
}

type Seed = Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'tags'> & { ago: number; tags?: string[] };

const H = 3_600_000;

function seedNotes(): Note[] {
  const seeds: Seed[] = [
    {
      ago: 0.6 * H,
      title: 'Tide pools at Weston Beach',
      body: 'Low tide at 7:40. Ochre sea stars clustered on the north face of the big rock, a dozen giant green anemones in the deeper pool. Water 12°C.',
      capturedOn: 'ios',
      device: 'iPhone 17 Pro',
      place: { lat: 36.5124, lng: -121.9452, altitude: 6, heading: 248, accuracy: 4, name: 'Point Lobos, California' },
      photo: photo('dawnCoast', 1600, 1200),
      transcript: 'Count was fourteen ochre stars and two bat stars. Come back next week at the minus tide.',
      tags: ['tidepools', 'survey'],
    },
    {
      ago: 2.2 * H,
      title: 'Mist Trail junction',
      body: 'Trail sign at the Vernal Fall footbridge. Spray on the steps already, bring a shell.',
      capturedOn: 'android',
      device: 'Pixel 10 Pro',
      place: { lat: 37.7273, lng: -119.5446, altitude: 1230, heading: 75, accuracy: 6, name: 'Yosemite Valley, California' },
      photo: photo('alpine', 1200, 1600),
      recognizedText: 'MIST TRAIL\nVernal Fall Footbridge  0.8 mi\nTop of Vernal Fall  1.3 mi\nNevada Fall  2.7 mi',
      tags: ['hike'],
    },
    {
      ago: 5 * H,
      title: 'Field meeting, trail crew',
      body: '',
      capturedOn: 'ios',
      device: 'iPhone 16',
      place: { lat: 37.7459, lng: -119.5332, altitude: 1215, name: 'Curry Village, Yosemite' },
      transcript:
        'Three things for Thursday. Clear the deadfall above the second bridge, re-stake the meadow closure, and check whether the culvert at mile two is draining after the rain.',
      tags: ['crew'],
    },
    {
      ago: 26 * H,
      title: 'Golden hour on the Alfama',
      body: 'Tram 28 climbing past Miradouro de Santa Luzia, the whole river lit up behind it.',
      capturedOn: 'ios',
      device: 'iPhone 17',
      place: { lat: 38.7118, lng: -9.1303, altitude: 74, heading: 160, accuracy: 5, name: 'Lisbon, Portugal' },
      photo: photo('golden', 1600, 1067),
      tags: ['city', 'light'],
    },
    {
      ago: 28 * H,
      title: 'Café menu, Rue Vieille du Temple',
      body: 'Best croissant of the trip. Prices for the expense report.',
      capturedOn: 'android',
      device: 'Galaxy S26',
      place: { lat: 48.8592, lng: 2.3601, altitude: 38, heading: 12, name: 'Le Marais, Paris' },
      photo: photo('desert', 1200, 1500),
      recognizedText: 'CAFÉ CRÈME ........ 3,80\nCROISSANT ........... 1,90\nTARTINE BEURRE ... 3,20\nJUS D’ORANGE ...... 5,00',
      tags: ['food', 'expenses'],
    },
    {
      ago: 50 * H,
      title: 'Harbour lights, Reykjavík',
      body: 'Wind dropped after dark. The church on the hill is the brightest thing on the skyline.',
      capturedOn: 'ios',
      device: 'iPhone 17 Pro Max',
      place: { lat: 64.1505, lng: -21.9406, altitude: 4, heading: 115, accuracy: 8, name: 'Reykjavík, Iceland' },
      photo: photo('arctic', 1600, 900),
      tags: ['night'],
    },
    {
      ago: 53 * H,
      title: 'Moss garden',
      body: 'Over a hundred kinds of moss, they say. The light through the maples turns everything green.',
      capturedOn: 'android',
      device: 'Pixel 9a',
      place: { lat: 34.9925, lng: 135.6826, altitude: 52, heading: 300, name: 'Saihō-ji, Kyoto' },
      photo: photo('moss', 1200, 1600),
      recognizedText: 'Please stay on the path\n苔を踏まないでください',
      transcript: 'It is completely silent in here except for the water.',
      tags: ['garden', 'japan'],
    },
    {
      ago: 4 * 24 * H,
      title: 'Laguna de los Tres',
      body: 'Last kilometre is brutal. Fitz Roy cleared for about ten minutes, then the cloud came back.',
      capturedOn: 'ios',
      device: 'iPhone 15 Pro',
      place: { lat: -49.2708, lng: -73.0067, altitude: 1180, heading: 285, accuracy: 10, name: 'El Chaltén, Argentina' },
      photo: photo('patagonia', 1600, 1200),
      tags: ['hike', 'patagonia'],
    },
    {
      ago: 4 * 24 * H + 3 * H,
      title: 'Fog on the bridge',
      body: 'Only the tops of the towers above the fog bank.',
      capturedOn: 'android',
      device: 'Pixel 10',
      place: { lat: 37.8324, lng: -122.4795, altitude: 220, heading: 152, name: 'Battery Spencer, San Francisco' },
      photo: photo('fogBay', 1600, 1000),
      tags: ['fog'],
    },
    {
      ago: 6 * 24 * H,
      title: 'Bo-Kaap at dusk',
      body: 'Colours look unreal in this light.',
      capturedOn: 'ios',
      device: 'iPhone 16 Pro',
      place: { lat: -33.9206, lng: 18.4153, altitude: 61, heading: 200, name: 'Cape Town, South Africa' },
      photo: photo('dusk', 1200, 1200),
      tags: ['city'],
    },
  ];
  const now = Date.now();
  return seeds.map(({ ago, tags, ...s }, i) => {
    const t = new Date(now - ago).toISOString();
    return { id: `seed-${i + 1}`, createdAt: t, updatedAt: t, tags: tags ?? [], ...s } as Note;
  });
}

const LIVE_SEEDS: (Omit<NoteInput, 'photo'> & { scene?: keyof typeof SCENES; size?: [number, number] })[] = [
  {
    title: 'Sea lions on the breakwater',
    body: 'At least forty hauled out, two pups. Loud.',
    capturedOn: 'ios',
    device: 'iPhone 17 Pro',
    place: { lat: 36.6082, lng: -121.8936, altitude: 3, heading: 42, accuracy: 4, name: 'Monterey, California' },
    scene: 'dawnCoast',
    size: [1600, 1200],
    transcript: 'Forty-ish sea lions on the breakwater, two pups near the end.',
    tags: ['wildlife'],
  },
  {
    title: 'Trailhead register',
    body: 'Signed in at 9:10.',
    capturedOn: 'android',
    device: 'Pixel 10 Pro',
    place: { lat: 46.8523, lng: -121.7603, altitude: 1647, heading: 330, accuracy: 7, name: 'Paradise, Mount Rainier' },
    scene: 'alpine',
    size: [1200, 1500],
    recognizedText: 'WILDERNESS PERMIT REQUIRED\nSkyline Trail  5.5 mi loop\nPanorama Point  2.0 mi',
    tags: ['hike'],
  },
  {
    title: 'Dunes after the wind',
    body: 'Ripples reset overnight; tracks from a kit fox across the crest.',
    capturedOn: 'ios',
    device: 'iPhone 16',
    place: { lat: 36.6062, lng: -117.1153, altitude: -10, heading: 95, name: 'Mesquite Flat Dunes, Death Valley' },
    scene: 'desert',
    size: [1600, 1067],
    tags: ['desert'],
  },
  {
    title: 'Redwood canopy',
    body: '',
    capturedOn: 'android',
    device: 'Galaxy S26 Ultra',
    place: { lat: 37.8970, lng: -122.5811, altitude: 95, heading: 0, name: 'Muir Woods, California' },
    scene: 'forest',
    size: [1200, 1600],
    transcript: 'Standing at the base of the tallest one on the loop, the top is lost in the fog.',
    tags: ['forest'],
  },
];
function account(email: string): Account | undefined {
  return accounts.get(email.toLowerCase());
}

function ensureDemo() {
  if (!accounts.has(DEMO_EMAIL))
    accounts.set(DEMO_EMAIL, { user: { id: 'user-demo', email: DEMO_EMAIL, name: 'Ada Field' }, password: 'fieldnotes', confirmed: true, notes: seedNotes() });
}

// Stateless tokens keep sessions valid across dev-server restarts.
function issueToken(email: string) {
  const access_token = `mock.${Buffer.from(JSON.stringify({ email, n: randomUUID() })).toString('base64url')}`;
  return { access_token, refresh_token: `refresh.${Buffer.from(email).toString('base64url')}`, expires_in: 3600, token_type: 'bearer' };
}

function emailFromToken(token: string | null | undefined): string | null {
  if (!token?.startsWith('mock.')) return null;
  try {
    return (JSON.parse(Buffer.from(token.slice(5), 'base64url').toString()) as { email: string }).email;
  } catch {
    return null;
  }
}

function userFor(req: IncomingMessage, url: URL): Account | null {
  const header = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const email = emailFromToken(header ?? url.searchParams.get('token'));
  if (!email) return null;
  ensureDemo();
  let acc = account(email);
  if (!acc) {
    acc = { user: { id: `user-${randomUUID().slice(0, 8)}`, email }, password: '', confirmed: true, notes: [] };
    accounts.set(email.toLowerCase(), acc);
  }
  return acc;
}

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined) return res.end();
  if (typeof body === 'string') return res.end(body);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString();
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function broadcast(email: string, event: LiveEvent) {
  for (const s of sockets.get(email.toLowerCase()) ?? []) wsSend(s, JSON.stringify(event));
}

/* ---------------- Identity (GoTrue) ---------------- */

async function identity(req: IncomingMessage, res: ServerResponse, path: string) {
  ensureDemo();
  if (path === '/signup' && req.method === 'POST') {
    const { email, password, data } = JSON.parse(await readBody(req)) as { email: string; password: string; data?: { full_name?: string } };
    if (account(email)) return send(res, 422, { code: 422, msg: 'A user with this email address has already been registered' });
    const acc: Account = {
      user: { id: `user-${randomUUID().slice(0, 8)}`, email, ...(data?.full_name ? { name: data.full_name } : {}) },
      password,
      confirmed: !email.includes('+confirm'),
      notes: [],
    };
    accounts.set(email.toLowerCase(), acc);
    return send(res, 200, { id: acc.user.id, email, user_metadata: { full_name: data?.full_name }, confirmation_sent_at: acc.confirmed ? undefined : new Date().toISOString() });
  }
  if (path === '/token' && req.method === 'POST') {
    await delay(350);
    const form = new URLSearchParams(await readBody(req));
    if (form.get('grant_type') === 'refresh_token') {
      const email = Buffer.from((form.get('refresh_token') ?? '').replace(/^refresh\./, ''), 'base64url').toString();
      return email ? send(res, 200, issueToken(email)) : send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
    }
    const acc = account(form.get('username') ?? '');
    if (!acc || acc.password !== form.get('password'))
      return send(res, 400, { error: 'invalid_grant', error_description: 'No user found with that email, or password invalid.' });
    if (!acc.confirmed) return send(res, 400, { error: 'invalid_grant', error_description: 'Email not confirmed' });
    return send(res, 200, issueToken(acc.user.email));
  }
  if (path === '/user') {
    const email = emailFromToken(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    const acc = email && account(email);
    if (!acc) return send(res, 401, { code: 401, msg: 'Invalid token' });
    return send(res, 200, { id: acc.user.id, email: acc.user.email, user_metadata: acc.user.name ? { full_name: acc.user.name } : {} });
  }
  if (path === '/logout') return send(res, 204);
  send(res, 404, { msg: 'Not found' });
}

/* ---------------- API ---------------- */

function matches(n: Note, q: string) {
  const hay = [n.title, n.body, n.recognizedText, n.transcript, n.place?.name, ...n.tags].join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

async function apiRoute(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname;
  const photoMatch = /^\/api\/photos\/([^/]+)$/.exec(path);
  if (photoMatch && req.method === 'GET') {
    const p = photos.get(photoMatch[1]!);
    if (!p) return send(res, 404, { error: 'No such photo' });
    await delay(120 + Math.random() * 300);
    return send(res, 200, sceneSvg(SCENES[p.scene]!, p.width, p.height), { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=31536000, immutable' });
  }

  const acc = userFor(req, url);
  if (!acc) return send(res, 401, { error: 'Sign in first' });
  await delay(150 + Math.random() * 250);

  if (path === '/api/me') return send(res, 200, { user: acc.user });

  if (path === '/api/notes' && req.method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    const before = url.searchParams.get('before');
    const list = acc.notes.filter((n) => (!q || matches(n, q)) && (!before || n.createdAt < before)).slice(0, 50);
    return send(res, 200, { notes: list });
  }

  if (path === '/api/notes' && req.method === 'POST') {
    const input = JSON.parse(await readBody(req)) as NoteInput;
    const t = new Date().toISOString();
    const note: Note = {
      ...input,
      id: randomUUID(),
      body: input.body ?? '',
      tags: input.tags ?? [],
      createdAt: t,
      updatedAt: t,
      photo: input.photo ? { ...input.photo, url: `/api/photos/${input.photo.key}` } : undefined,
    };
    acc.notes.unshift(note);
    broadcast(acc.user.email, { type: 'note', note, created: true });
    return send(res, 200, { note });
  }

  const noteMatch = /^\/api\/notes\/([^/]+)(\/share)?$/.exec(path);
  if (noteMatch) {
    const note = acc.notes.find((n) => n.id === decodeURIComponent(noteMatch[1]!));
    if (!note) return send(res, 404, { error: 'No such note' });
    if (noteMatch[2]) {
      if (req.method === 'POST') {
        note.shareId ??= createHash('sha256').update(note.id + Math.random()).digest('base64url').slice(0, 12);
        note.updatedAt = new Date().toISOString();
        broadcast(acc.user.email, { type: 'note', note, created: false });
        return send(res, 200, { shareId: note.shareId, url: `${url.origin}/n/${note.shareId}` });
      }
      if (req.method === 'DELETE') {
        delete note.shareId;
        broadcast(acc.user.email, { type: 'note', note, created: false });
        return send(res, 204);
      }
    }
    if (req.method === 'GET' && !noteMatch[2]) return send(res, 200, { note });
    if (req.method === 'PATCH') {
      const patch = JSON.parse(await readBody(req)) as NotePatch;
      Object.assign(note, patch, { updatedAt: new Date().toISOString() });
      broadcast(acc.user.email, { type: 'note', note, created: false });
      return send(res, 200, { note });
    }
    if (req.method === 'DELETE') {
      acc.notes = acc.notes.filter((n) => n !== note);
      broadcast(acc.user.email, { type: 'deleted', id: note.id });
      return send(res, 204);
    }
  }
  send(res, 404, { error: `No route for ${req.method} ${path}` });
}

/* ---------------- WebSocket (RFC 6455, text frames only) ---------------- */

function wsSend(socket: Duplex, text: string) {
  const payload = Buffer.from(text);
  const len = payload.length;
  const header = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : Buffer.alloc(10);
  if (len >= 65536) {
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  if (!socket.destroyed) socket.write(Buffer.concat([header, payload]));
}

function acceptSocket(req: IncomingMessage, socket: Duplex, url: URL) {
  const email = emailFromToken(url.searchParams.get('token'));
  if (!email) {
    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return;
  }
  const accept = createHash('sha1')
    .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const key = email.toLowerCase();
  const set = sockets.get(key) ?? new Set();
  sockets.set(key, set);
  set.add(socket);
  wsSend(socket, JSON.stringify({ type: 'ready' } satisfies LiveEvent));
  socket.on('data', (buf: Buffer) => {
    const opcode = buf[0]! & 0x0f;
    if (opcode === 0x8) socket.end(Buffer.from([0x88, 0]));
    else if (opcode === 0x9) socket.write(Buffer.from([0x8a, 0]));
  });
  const drop = () => set.delete(socket);
  socket.on('close', drop);
  socket.on('error', drop);
}

let liveIndex = 0;

function pushLiveNote() {
  for (const [email, set] of sockets) {
    if (!set.size) continue;
    const acc = account(email);
    if (!acc) continue;
    const { scene, size, ...seed } = LIVE_SEEDS[liveIndex % LIVE_SEEDS.length]!;
    const t = new Date().toISOString();
    const note: Note = {
      ...seed,
      body: seed.body ?? '',
      tags: seed.tags ?? [],
      id: randomUUID(),
      createdAt: t,
      updatedAt: t,
      ...(scene && size ? { photo: photo(scene, size[0], size[1]) } : {}),
    };
    acc.notes.unshift(note);
    broadcast(email, { type: 'note', note, created: true });
  }
  liveIndex++;
}

/* ---------------- Plugin ---------------- */

export function mockApi(): Plugin {
  return {
    name: 'field-notes-mock-api',
    apply: 'serve',
    configureServer(server) {
      ensureDemo();
      const every = Number(process.env.MOCK_LIVE_MS ?? 10_000);
      const timer = every > 0 ? setInterval(pushLiveNote, every) : undefined;
      server.httpServer?.on('close', () => clearInterval(timer));

      server.httpServer?.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/api/live') acceptSocket(req, socket, url);
      });

      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        if (url.pathname === '/native.json') {
          const deviceLink = 'https://preview.nativescript.org/p/field-notes-demo#mock-device-key';
          void QRCode.toString(deviceLink, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0d1117', light: '#ffffff' } }).then((qrSvg) =>
            send(res, 200, { deviceLink, pairUrl: deviceLink, qrSvg, context: 'deploy-preview', commit: '4f9c2e17b3a0d5c8e1f2a3b4c5d6e7f8a9b0c1d2' }),
          );
          return;
        }
        if (url.pathname.startsWith('/.netlify/identity/')) return void identity(req, res, url.pathname.slice('/.netlify/identity'.length));
        if (url.pathname.startsWith('/api/') && url.pathname !== '/api/live') return void apiRoute(req, res, url).catch((e: Error) => send(res, 500, { error: e.message }));
        if (url.pathname.startsWith('/n/')) return send(res, 200, `<!doctype html><title>Shared note</title><p>Mock share page for ${url.pathname}</p>`, { 'content-type': 'text/html' });
        next();
      });
    },
  };
}
