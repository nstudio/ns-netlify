/**
 * The contract between the Netlify Server API (netlify/server), the web app
 * (web/) and the phone app (native/). Everything here runs in a browser, in
 * Node and in NativeScript, so it uses no DOM, Node or NativeScript APIs.
 */

export type Platform = 'ios' | 'android' | 'web';

export interface Place {
  lat: number;
  lng: number;
  /** Metres. */
  accuracy?: number;
  /** Metres above sea level. */
  altitude?: number;
  /** Degrees from true north the device faced when the note was captured. */
  heading?: number;
  /** A human name for the spot, from the device's reverse geocoder. */
  name?: string;
}

export interface Photo {
  /** Netlify Blobs key; unguessable, so photo URLs can be public and cached for good. */
  key: string;
  width: number;
  height: number;
  /** `/api/photos/<key>`, relative to the API base. */
  url: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  capturedOn: Platform;
  /** The device's model, e.g. "iPhone 17 Pro". */
  device?: string;
  place?: Place;
  photo?: Photo;
  /** Text the phone recognized in the photo, on the device. */
  recognizedText?: string;
  /** A voice note's transcript, recognized on the device. */
  transcript?: string;
  tags: string[];
  /** Set while the note has a public link: `/n/<shareId>`. */
  shareId?: string;
}

export interface NoteInput {
  title: string;
  body?: string;
  capturedOn: Platform;
  device?: string;
  place?: Place;
  photo?: Omit<Photo, 'url'>;
  recognizedText?: string;
  transcript?: string;
  tags?: string[];
}

export type NotePatch = Partial<Pick<Note, 'title' | 'body' | 'tags' | 'place' | 'recognizedText' | 'transcript'>>;

export interface User {
  id: string;
  email: string;
  name?: string;
}

/** Messages the server sends on `/api/live`. */
/** `created` is true for a newly captured note, false for an edit, so clients highlight only arrivals. */
export type LiveEvent = { type: 'ready' } | { type: 'note'; note: Note; created: boolean } | { type: 'deleted'; id: string };

/**
 * The HTTP API, relative to the API base (the site's URL, or a deploy's):
 *
 *   GET    /api/me                  → { user: User }
 *   GET    /api/notes?q=&before=    → { notes: Note[] }       newest first, 50 a page; q searches title, body, recognized text and transcript
 *   GET    /api/notes/:id           → { note: Note }
 *   POST   /api/notes               NoteInput → { note: Note }
 *   PATCH  /api/notes/:id           NotePatch → { note: Note }
 *   DELETE /api/notes/:id           → 204
 *   POST   /api/photos              image/jpeg body, x-width and x-height headers → { key, width, height, url }
 *   GET    /api/photos/:key         → the image, public, immutable
 *   POST   /api/notes/:id/share     → { shareId, url }
 *   DELETE /api/notes/:id/share     → 204
 *   GET    /api/live?token=         WebSocket of LiveEvent for the token's user
 *   GET    /n/:shareId              → the shared note as a web page
 *
 * Every /api route except photos takes `Authorization: Bearer <Netlify Identity access token>`.
 * Errors are `{ error: string }` with a 4xx or 5xx status.
 */
