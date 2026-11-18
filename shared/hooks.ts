/**
 * React state shared by the web app and the phone app: the session, and the
 * signed-in person's notes kept current by the live socket.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { connectLive, type Api } from './api';
import type { Auth, Session } from './auth';
import type { LiveEvent, Note, NoteInput, NotePatch } from './types';

export function useSession(auth: Auth): Session | null {
  const [session, setSession] = useState(auth.current);
  useEffect(() => auth.onChange(setSession), [auth]);
  return session;
}

export interface NotesState {
  notes: Note[];
  loading: boolean;
  error: string | null;
  /** True while the live socket is connected. */
  live: boolean;
  /** Ids of notes that arrived live in the last few seconds, for a highlight. */
  fresh: Set<string>;
  query: string;
  setQuery: (q: string) => void;
  refresh: () => Promise<void>;
  create: (input: NoteInput) => Promise<Note>;
  update: (id: string, patch: NotePatch) => Promise<Note>;
  remove: (id: string) => Promise<void>;
}

const FRESH_MS = 4000;

export function useNotes(api: Api, auth: Auth, options: { WebSocketImpl?: typeof WebSocket } = {}): NotesState {
  const session = useSession(auth);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const queryRef = useRef(query);
  queryRef.current = query;

  const refresh = useCallback(async () => {
    if (!auth.current) return setNotes([]);
    setLoading(true);
    try {
      setNotes(await api.notes({ q: queryRef.current || undefined }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, auth]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [refresh, query, session?.user.id]);

  const upsert = useCallback((note: Note) => {
    setNotes((list) => {
      const i = list.findIndex((n) => n.id === note.id);
      if (i >= 0) return list.map((n) => (n.id === note.id ? note : n));
      return [note, ...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    return connectLive({
      baseUrl: api.baseUrl,
      token: () => auth.token(),
      WebSocketImpl: options.WebSocketImpl,
      onStatus: (up) => {
        setLive(up);
        // Anything missed while disconnected comes back with a fresh list.
        if (up) void refresh();
      },
      onEvent: (event: LiveEvent) => {
        if (event.type === 'note') {
          if (queryRef.current) return void refresh();
          upsert(event.note);
          if (!event.created) return;
          setFresh((s) => new Set(s).add(event.note.id));
          setTimeout(
            () =>
              setFresh((s) => {
                const next = new Set(s);
                next.delete(event.note.id);
                return next;
              }),
            FRESH_MS,
          );
        } else if (event.type === 'deleted') {
          setNotes((list) => list.filter((n) => n.id !== event.id));
        }
      },
    });
  }, [api, auth, session?.user.id, options.WebSocketImpl, refresh, upsert]);

  return {
    notes,
    loading,
    error,
    live,
    fresh,
    query,
    setQuery,
    refresh,
    create: async (input) => {
      const note = await api.create(input);
      upsert(note);
      return note;
    },
    update: async (id, patch) => {
      const note = await api.update(id, patch);
      upsert(note);
      return note;
    },
    remove: async (id) => {
      await api.remove(id);
      setNotes((list) => list.filter((n) => n.id !== id));
    },
  };
}
