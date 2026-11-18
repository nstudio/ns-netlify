import type { Place, Platform } from '../../shared/types.ts';
import { badRequest } from './errors.ts';

export const LIMITS = {
  title: 200,
  body: 20_000,
  text: 20_000,
  device: 100,
  placeName: 200,
  tags: 12,
  tag: 32,
  dimension: 20_000,
} as const;

const PLATFORMS: readonly Platform[] = ['ios', 'android', 'web'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface PhotoRef {
  key: string;
  width: number;
  height: number;
}

export interface ValidNoteInput {
  title: string;
  body: string;
  capturedOn: Platform;
  device: string | null;
  place: Place | null;
  photo: PhotoRef | null;
  recognizedText: string | null;
  transcript: string | null;
  tags: string[];
}

/** Present keys are changes; `null` clears an optional field. */
export interface ValidNotePatch {
  title?: string;
  body?: string;
  tags?: string[];
  place?: Place | null;
  recognizedText?: string | null;
  transcript?: string | null;
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function parseNoteInput(raw: unknown): ValidNoteInput {
  const o = object(raw, 'The note');
  const capturedOn = o.capturedOn;
  if (typeof capturedOn !== 'string' || !PLATFORMS.includes(capturedOn as Platform)) {
    throw badRequest(`capturedOn must be one of ${PLATFORMS.join(', ')}`);
  }
  const note: ValidNoteInput = {
    title: text(o.title, 'title', LIMITS.title, { required: true, trim: true }) ?? '',
    body: text(o.body, 'body', LIMITS.body) ?? '',
    capturedOn: capturedOn as Platform,
    device: text(o.device, 'device', LIMITS.device, { trim: true }) || null,
    place: o.place == null ? null : place(o.place),
    photo: o.photo == null ? null : photo(o.photo),
    recognizedText: text(o.recognizedText, 'recognizedText', LIMITS.text) || null,
    transcript: text(o.transcript, 'transcript', LIMITS.text) || null,
    tags: o.tags == null ? [] : tags(o.tags),
  };
  if (!note.title && !note.body.trim() && !note.photo && !note.recognizedText && !note.transcript) {
    throw badRequest('A note needs a title, a body, a photo or some text');
  }
  return note;
}

export function parseNotePatch(raw: unknown): ValidNotePatch {
  const o = object(raw, 'The change');
  const patch: ValidNotePatch = {};
  if (o.title !== undefined) patch.title = text(o.title, 'title', LIMITS.title, { trim: true }) ?? '';
  if (o.body !== undefined) patch.body = text(o.body, 'body', LIMITS.body) ?? '';
  if (o.tags !== undefined) patch.tags = tags(o.tags);
  if (o.place !== undefined) patch.place = o.place === null ? null : place(o.place);
  if (o.recognizedText !== undefined) patch.recognizedText = text(o.recognizedText, 'recognizedText', LIMITS.text) || null;
  if (o.transcript !== undefined) patch.transcript = text(o.transcript, 'transcript', LIMITS.text) || null;
  return patch;
}

/** Positive integer pixel size from an `x-width`/`x-height` header. */
export function dimension(value: string | null | undefined, name: string): number {
  const n = value == null || !/^\d{1,6}$/.test(value.trim()) ? NaN : Number(value.trim());
  if (!Number.isInteger(n) || n < 1 || n > LIMITS.dimension) {
    throw badRequest(`${name} must be a whole number of pixels from 1 to ${LIMITS.dimension}`);
  }
  return n;
}

function object(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw badRequest(`${what} must be a JSON object`);
  return raw as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number, opts: { required?: boolean; trim?: boolean } = {}): string | undefined {
  if (value == null) {
    if (opts.required) throw badRequest(`${name} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw badRequest(`${name} must be a string`);
  // NUL can't be stored in a Postgres text column.
  const s = (opts.trim ? value.trim() : value).replace(/\u0000/g, '');
  if (s.length > max) throw badRequest(`${name} is longer than ${max} characters`);
  return s;
}

function finite(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw badRequest(`${name} must be a number from ${min} to ${max}`);
  }
  return value;
}

function place(raw: unknown): Place {
  const o = object(raw, 'place');
  const p: Place = {
    lat: finite(o.lat, 'place.lat', -90, 90),
    lng: finite(o.lng, 'place.lng', -180, 180),
  };
  if (o.accuracy != null) p.accuracy = finite(o.accuracy, 'place.accuracy', 0, 1_000_000);
  if (o.altitude != null) p.altitude = finite(o.altitude, 'place.altitude', -12_000, 100_000);
  if (o.heading != null) p.heading = finite(o.heading, 'place.heading', 0, 360);
  const name = text(o.name, 'place.name', LIMITS.placeName, { trim: true });
  if (name) p.name = name;
  return p;
}

function photo(raw: unknown): PhotoRef {
  const o = object(raw, 'photo');
  if (typeof o.key !== 'string' || !isUuid(o.key)) throw badRequest('photo.key is not a key from POST /api/photos');
  const size = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > LIMITS.dimension) {
      throw badRequest(`${name} must be a whole number of pixels from 1 to ${LIMITS.dimension}`);
    }
    return v;
  };
  return { key: o.key, width: size(o.width, 'photo.width'), height: size(o.height, 'photo.height') };
}

function tags(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw badRequest('tags must be an array of strings');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') throw badRequest('tags must be an array of strings');
    const tag = t.trim().replace(/\u0000/g, '');
    if (!tag) continue;
    if (tag.length > LIMITS.tag) throw badRequest(`A tag is longer than ${LIMITS.tag} characters`);
    const k = tag.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(tag);
  }
  if (out.length > LIMITS.tags) throw badRequest(`A note takes at most ${LIMITS.tags} tags`);
  return out;
}
