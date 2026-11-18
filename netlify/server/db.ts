import { randomBytes } from 'node:crypto';
import { getDatabase } from '@netlify/database';
import type { Note, Place, Platform } from '../../shared/types.ts';
import type { PhotoRef, ValidNoteInput, ValidNotePatch } from './validate.ts';

export const db = getDatabase();
const { sql } = db;

export const PAGE_SIZE = 50;

interface NoteRow {
  id: string;
  title: string;
  body: string;
  captured_on: Platform;
  device: string | null;
  place: Place | null;
  photo: PhotoRef | null;
  recognized_text: string | null;
  transcript: string | null;
  tags: string[] | null;
  share_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLUMNS = sql.raw(
  'id, title, body, captured_on, device, place, photo, recognized_text, transcript, tags, share_id, created_at, updated_at',
);

export function photoUrl(key: string): string {
  return `/api/photos/${key}`;
}

export function toNote(r: NoteRow): Note {
  const note: Note = {
    id: r.id,
    title: r.title,
    body: r.body,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    capturedOn: r.captured_on,
    tags: r.tags ?? [],
  };
  if (r.device) note.device = r.device;
  if (r.place) note.place = r.place;
  if (r.photo) note.photo = { ...r.photo, url: photoUrl(r.photo.key) };
  if (r.recognized_text) note.recognizedText = r.recognized_text;
  if (r.transcript) note.transcript = r.transcript;
  if (r.share_id) note.shareId = r.share_id;
  return note;
}

const json = (v: unknown) => (v == null ? null : JSON.stringify(v));

export async function listNotes(userId: string, opts: { before: Date | null; q: string | null }): Promise<Note[]> {
  const before = opts.before?.toISOString() ?? null;
  let rows: NoteRow[];
  if (opts.q) {
    const prefix = prefixQuery(opts.q);
    rows = await sql<NoteRow>`
      select ${COLUMNS} from notes
      where user_id = ${userId}
        and (${before}::timestamptz is null or created_at < ${before}::timestamptz)
        and (
          search @@ websearch_to_tsquery('simple', ${opts.q})
          or (${prefix}::text is not null and search @@ to_tsquery('simple', ${prefix}::text))
        )
      order by created_at desc, id desc
      limit ${PAGE_SIZE}`;
  } else {
    rows = await sql<NoteRow>`
      select ${COLUMNS} from notes
      where user_id = ${userId}
        and (${before}::timestamptz is null or created_at < ${before}::timestamptz)
      order by created_at desc, id desc
      limit ${PAGE_SIZE}`;
  }
  return rows.map(toNote);
}

/**
 * A tsquery that matches every bare word as a prefix ("fie no" finds "field
 * notes"), honouring "-word" exclusions, so results appear while someone is
 * still typing. Words are reduced to letters and digits, the same split
 * to_tsvector('simple') makes, so nothing here can be tsquery syntax.
 */
export function prefixQuery(q: string): string | null {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const raw of q.split(/\s+/)) {
    const negated = raw.startsWith('-');
    const words = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (!negated && words.length === 1 && words[0] === 'or') continue;
    for (const w of words) (negated ? exclude : include).push(w);
  }
  if (include.length === 0) return null;
  return [...include.slice(0, 16).map((w) => `${w}:*`), ...exclude.slice(0, 16).map((w) => `!${w}`)].join(' & ');
}

export async function getNote(userId: string, id: string): Promise<Note | null> {
  const [row] = await sql<NoteRow>`select ${COLUMNS} from notes where id = ${id}::uuid and user_id = ${userId}`;
  return row ? toNote(row) : null;
}

export async function createNote(userId: string, n: ValidNoteInput): Promise<Note> {
  const [row] = await sql<NoteRow>`
    insert into notes (user_id, title, body, captured_on, device, place, photo, recognized_text, transcript, tags)
    values (${userId}, ${n.title}, ${n.body}, ${n.capturedOn}, ${n.device}, ${json(n.place)}::jsonb, ${json(n.photo)}::jsonb,
            ${n.recognizedText}, ${n.transcript}, ${n.tags}::text[])
    returning ${COLUMNS}`;
  return toNote(row!);
}

export async function updateNote(userId: string, id: string, p: ValidNotePatch): Promise<Note | null> {
  if (Object.keys(p).length === 0) return getNote(userId, id);
  const has = (k: keyof ValidNotePatch) => k in p;
  const [row] = await sql<NoteRow>`
    update notes set
      title = case when ${has('title')}::boolean then ${p.title ?? null}::text else title end,
      body = case when ${has('body')}::boolean then ${p.body ?? null}::text else body end,
      tags = case when ${has('tags')}::boolean then ${p.tags ?? null}::text[] else tags end,
      place = case when ${has('place')}::boolean then ${json(p.place)}::jsonb else place end,
      recognized_text = case when ${has('recognizedText')}::boolean then ${p.recognizedText ?? null}::text else recognized_text end,
      transcript = case when ${has('transcript')}::boolean then ${p.transcript ?? null}::text else transcript end,
      updated_at = now()
    where id = ${id}::uuid and user_id = ${userId}
    returning ${COLUMNS}`;
  return row ? toNote(row) : null;
}

/** Returns the deleted note's photo, if it had one, so the caller can remove the blob. */
export async function deleteNote(userId: string, id: string): Promise<{ photo: PhotoRef | null } | null> {
  const [row] = await sql<{ photo: PhotoRef | null }>`
    delete from notes where id = ${id}::uuid and user_id = ${userId} returning photo`;
  return row ?? null;
}

/** Keeps an existing share id, so sharing twice hands out the same link. */
export async function shareNote(userId: string, id: string): Promise<string | null> {
  const [row] = await sql<{ share_id: string }>`
    update notes set share_id = coalesce(share_id, ${newShareId()})
    where id = ${id}::uuid and user_id = ${userId}
    returning share_id`;
  return row?.share_id ?? null;
}

export async function unshareNote(userId: string, id: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    update notes set share_id = null where id = ${id}::uuid and user_id = ${userId} returning id`;
  return rows.length > 0;
}

export async function getSharedNote(shareId: string): Promise<Note | null> {
  const [row] = await sql<NoteRow>`select ${COLUMNS} from notes where share_id = ${shareId}`;
  return row ? toNote(row) : null;
}

export function isShareId(value: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(value);
}

function newShareId(): string {
  return randomBytes(12).toString('base64url');
}
