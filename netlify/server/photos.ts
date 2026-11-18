import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import type { Photo } from '../../shared/types.ts';
import { photoUrl } from './db.ts';
import { HttpError, badRequest } from './errors.ts';
import { dimension, isUuid } from './validate.ts';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

interface PhotoMeta {
  [key: string]: string | number;
  userId: string;
  width: number;
  height: number;
  size: number;
  uploadedAt: string;
}

// Strong reads: a client shows the photo, and attaches it to a note, right after uploading it.
const store = () => getStore({ name: 'photos', consistency: 'strong' });

export async function uploadPhoto(req: Request, userId: string): Promise<Photo> {
  const type = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== 'image/jpeg') throw new HttpError(415, 'Send the photo as image/jpeg');
  const width = dimension(req.headers.get('x-width'), 'x-width');
  const height = dimension(req.headers.get('x-height'), 'x-height');
  const declared = Number(req.headers.get('content-length') ?? NaN);
  if (declared > MAX_PHOTO_BYTES) throw tooLarge();

  const bytes = await readLimited(req, MAX_PHOTO_BYTES);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw badRequest('That is not a JPEG');
  }

  const key = randomUUID();
  const metadata: PhotoMeta = { userId, width, height, size: bytes.length, uploadedAt: new Date().toISOString() };
  await store().set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { metadata });
  return { key, width, height, url: photoUrl(key) };
}

/** Rejects a photo that doesn't exist or belongs to someone else. */
export async function assertOwnPhoto(key: string, userId: string): Promise<void> {
  const meta = await store().getMetadata(key);
  if (!meta || meta.metadata.userId !== userId) throw badRequest('photo.key is not a photo you uploaded');
}

export async function servePhoto(key: string): Promise<Response> {
  if (!isUuid(key)) return photoNotFound();
  const blob = await store().getWithMetadata(key, { type: 'stream' });
  if (!blob) return photoNotFound();
  const headers = new Headers({
    'content-type': 'image/jpeg',
    'cache-control': 'public, max-age=31536000, immutable',
    'netlify-cdn-cache-control': 'public, max-age=31536000, immutable, durable',
    'x-content-type-options': 'nosniff',
  });
  const size = blob.metadata.size;
  if (typeof size === 'number') headers.set('content-length', String(size));
  if (blob.etag) headers.set('etag', blob.etag);
  return new Response(blob.data, { headers });
}

export async function deletePhoto(key: string): Promise<void> {
  try {
    await store().delete(key);
  } catch (e) {
    console.error('[photos] could not delete', key, (e as Error).message);
  }
}

function photoNotFound(): Response {
  // Never cached: the success headers are durable, and a cached 404 would outlive the upload it raced.
  return Response.json({ error: 'No such photo' }, { status: 404, headers: { 'cache-control': 'no-store' } });
}

function tooLarge() {
  return new HttpError(413, `Photos can be at most ${MAX_PHOTO_BYTES / 1024 / 1024} MB`);
}

async function readLimited(req: Request, max: number): Promise<Uint8Array> {
  if (!req.body) throw badRequest('Send the photo as the request body');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
