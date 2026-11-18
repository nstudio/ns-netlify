import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNotes, useSession, type Note, type NotesState, type User } from '../../shared';
import { Header } from './components/Header';
import { Icon } from './components/Icon';
import { useArrivals } from './lib/arrivals';
import { useNativeInfo } from './lib/native';
import { displayTitle, platformLabel } from './lib/notes';
import { Link, navigate, useRoute } from './lib/router';
import { api, auth } from './lib/session';
import { Login } from './pages/Login';
import { NoteDetail } from './pages/NoteDetail';
import { NotFound } from './pages/NotFound';
import { Timeline } from './pages/Timeline';

const MapPage = lazy(() => import('./pages/MapPage'));

export function App() {
  const session = useSession(auth);
  const { path, search } = useRoute();
  const next = search.get('next');

  useEffect(() => {
    if (!session && path !== '/login') navigate(`/login${path !== '/' ? `?next=${encodeURIComponent(path)}` : ''}`, { replace: true });
    if (session && path === '/login') navigate(next?.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
  }, [session, path, next]);

  if (!session) return <Login />;
  return <SignedIn user={session.user} path={path} />;
}

function SignedIn({ user, path }: { user: User; path: string }) {
  const notes = useNotes(api, auth);
  const arrivals = useArrivals(notes);
  const native = useNativeInfo();
  const detail = /^\/notes\/([^/]+)\/?$/.exec(path);

  useEffect(() => {
    if (path === '/map') document.title = 'Map · Field Notes';
    else if (!detail) document.title = 'Field Notes';
  }, [path, detail]);

  let page;
  if (path === '/' || path === '') page = <Timeline user={user} notes={notes} arrivals={arrivals} native={native} />;
  else if (path === '/map')
    page = (
      <Suspense fallback={<div className="map-loading" aria-label="Loading the map" />}>
        <MapPage notes={notes} arrivals={arrivals} />
      </Suspense>
    );
  else if (detail) page = <NoteDetail id={decodeURIComponent(detail[1]!)} notes={notes} />;
  else page = <NotFound />;

  return (
    <div className={`shell ${path === '/map' ? 'shell-map' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header user={user} live={notes.live} path={path} native={native} />
      <main id="main" className="main-area">
        {page}
      </main>
      <LiveToast notes={notes} arrivals={arrivals} path={path} />
    </div>
  );
}

/** A toast for live arrivals the person can't see: on another page or scrolled away from the top. */
function LiveToast({ notes, arrivals, path }: { notes: NotesState; arrivals: Set<string>; path: string }) {
  const seen = useRef(new Set<string>());
  const [toast, setToast] = useState<Note | null>(null);

  useEffect(() => {
    for (const id of arrivals) {
      if (seen.current.has(id)) continue;
      seen.current.add(id);
      const note = notes.notes.find((n) => n.id === id);
      const visible = path === '/' && window.scrollY < 240;
      if (note && !visible) setToast(note);
    }
  }, [arrivals, notes.notes, path]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span className="toast-icon">
        <Icon name="phone" size={16} />
      </span>
      <Link to={`/notes/${toast.id}`} className="toast-body" onClick={() => setToast(null)}>
        <span className="toast-eyebrow">
          <span className="live-dot" /> New from {toast.device ?? platformLabel(toast.capturedOn)}
        </span>
        <span className="toast-title">{displayTitle(toast)}</span>
      </Link>
      <button type="button" className="icon-button toast-close" aria-label="Dismiss" onClick={() => setToast(null)}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
