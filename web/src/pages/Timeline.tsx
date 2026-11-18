import { useEffect, useMemo, useRef } from 'react';
import { groupThousands, type Note, type NotesState, type User } from '../../../shared';
import { CaptureCard } from '../components/CaptureCard';
import { Icon } from '../components/Icon';
import { Masonry } from '../components/Masonry';
import { CardSkeleton, NoteCard } from '../components/NoteCard';
import { Topo } from '../components/Topo';
import type { NativeInfo } from '../lib/native';
import { dayLabel, firstName, groupByDay } from '../lib/notes';
import { Link } from '../lib/router';

const PAGE = 50;

function estimate(note: Note, width: number): number {
  const text = 150 + (note.body ? 40 : 0);
  if (!note.photo) return text + 30;
  const ratio = Math.max(note.photo.width / Math.max(note.photo.height, 1), 0.8);
  return width / ratio + text;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Timeline({
  user,
  notes,
  arrivals,
  native,
}: {
  user: User;
  notes: NotesState;
  arrivals: Set<string>;
  native: NativeInfo | null | undefined;
}) {
  const { notes: list, loading, error, query, setQuery, refresh } = notes;
  const groups = useMemo(() => groupByDay(list), [list]);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstLoad = loading && list.length === 0 && !query;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stats = useMemo(() => {
    const places = new Set(list.map((n) => n.place?.name).filter(Boolean));
    const ios = list.filter((n) => n.capturedOn === 'ios').length;
    const android = list.filter((n) => n.capturedOn === 'android').length;
    return { places: places.size, ios, android };
  }, [list]);

  const isEmpty = !loading && !error && list.length === 0 && !query;

  return (
    <div className="timeline-page">
      <div className={`page-wrap timeline-layout ${isEmpty ? 'timeline-solo' : ''}`}>
        <div className="timeline-main">
          <div className="page-head">
            <div>
              <p className="eyebrow">
                {greeting()}, {firstName(user)}
              </p>
              <h1 className="page-title">Field notes</h1>
              {list.length > 0 && !query && (
                <p className="page-stats">
                  <span>
                    <strong>{list.length >= PAGE ? `${PAGE}+` : groupThousands(list.length)}</strong> notes
                  </span>
                  <span>
                    <strong>{stats.places}</strong> {stats.places === 1 ? 'place' : 'places'}
                  </span>
                  {stats.ios > 0 && (
                    <span className="stat-native">
                      <Icon name="phone" size={13} />
                      <strong>{stats.ios}</strong> iPhone
                    </span>
                  )}
                  {stats.android > 0 && (
                    <span className="stat-native">
                      <Icon name="phone" size={13} />
                      <strong>{stats.android}</strong> Android
                    </span>
                  )}
                </p>
              )}
            </div>
            {!isEmpty && (
              <div className="search" role="search">
                <Icon name="search" size={18} className="search-icon" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes, places, text in photos"
                  aria-label="Search notes"
                />
                {loading && query ? (
                  <span className="spinner spinner-dark search-trail" />
                ) : query ? (
                  <button type="button" className="icon-button search-trail" aria-label="Clear search" onClick={() => setQuery('')}>
                    <Icon name="x" size={16} />
                  </button>
                ) : (
                  <kbd className="search-trail">/</kbd>
                )}
              </div>
            )}
          </div>

          {error && list.length === 0 ? (
            <div className="state-card">
              <span className="state-icon state-icon-danger">
                <Icon name="alert" size={24} />
              </span>
              <h2 className="state-title">Couldn't load your notes</h2>
              <p className="state-copy">{error}</p>
              <button type="button" className="button button-primary" onClick={() => void refresh()}>
                <Icon name="refresh" size={16} /> Try again
              </button>
            </div>
          ) : firstLoad ? (
            <section className="day" aria-busy="true" aria-label="Loading notes">
              <div className="day-head">
                <span className="skeleton-line shimmer" style={{ width: 140, height: 22 }} />
              </div>
              <Masonry
                items={[1.33, 0.8, 1.5, 1, 1.78, 0.81]}
                keyOf={(r) => String(r)}
                estimate={(r, w) => w / r + 150}
                render={(r) => <CardSkeleton ratio={r} />}
              />
            </section>
          ) : isEmpty ? (
            <EmptyState native={native} />
          ) : list.length === 0 ? (
            <div className="state-card">
              <span className="state-icon">
                <Icon name="search" size={24} />
              </span>
              <h2 className="state-title">Nothing matches “{query}”</h2>
              <p className="state-copy">Search looks through titles, notes, the text recognized in photos and voice transcripts.</p>
              <button type="button" className="button button-ghost" onClick={() => setQuery('')}>
                Clear search
              </button>
            </div>
          ) : (
            <>
              {query && (
                <p className="results-line">
                  {list.length} {list.length === 1 ? 'note matches' : 'notes match'} <strong>“{query}”</strong>
                </p>
              )}
              {error && (
                <p className="inline-error" role="alert">
                  <Icon name="alert" size={15} /> {error}
                  <button type="button" className="link-button" onClick={() => void refresh()}>
                    Retry
                  </button>
                </p>
              )}
              {groups.map((g, gi) => {
                const { label, detail } = dayLabel(g.first);
                return (
                  <section key={g.key} className="day" aria-labelledby={`day-${g.key}`}>
                    <header className="day-head">
                      <h2 id={`day-${g.key}`} className="day-label">
                        {label}
                      </h2>
                      <span className="day-detail">{detail}</span>
                      <span className="day-rule" />
                      <span className="day-count">
                        {g.notes.length} {g.notes.length === 1 ? 'note' : 'notes'}
                      </span>
                    </header>
                    <Masonry
                      items={g.notes}
                      keyOf={(n) => n.id}
                      estimate={estimate}
                      render={(n, i) => <NoteCard note={n} fresh={arrivals.has(n.id)} eager={gi === 0 && i < 4} />}
                    />
                  </section>
                );
              })}
            </>
          )}
        </div>

        {!isEmpty && (
          <aside className="rail" aria-label="Capture and overview">
            {native && <CaptureCard info={native} variant="rail" />}
            {list.length > 0 && <PlacesCard notes={list} />}
          </aside>
        )}
      </div>
    </div>
  );
}

function PlacesCard({ notes }: { notes: Note[] }) {
  const places = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; id: string }>();
    for (const n of notes) {
      const name = n.place?.name;
      if (!name) continue;
      const cur = counts.get(name);
      if (cur) cur.count++;
      else counts.set(name, { name, count: 1, id: n.id });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [notes]);
  if (!places.length) return null;
  return (
    <section className="rail-card">
      <div className="rail-card-head">
        <h2 className="rail-title">Places</h2>
        <Link to="/map" className="rail-more">
          Open map <Icon name="back" size={14} style={{ transform: 'rotate(180deg)' }} />
        </Link>
      </div>
      <ul className="place-list">
        {places.map((p) => (
          <li key={p.name}>
            <Link to={`/notes/${p.id}`} className="place-row">
              <Icon name="pin" size={15} />
              <span className="place-name">{p.name}</span>
              {p.count > 1 && <span className="place-count">{p.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ native }: { native: NativeInfo | null | undefined }) {
  return (
    <section className="empty">
      <Topo className="empty-topo" seed={5} peaks={5} />
      <div className="empty-inner">
        <span className="empty-icon">
          <Icon name="camera" size={26} />
        </span>
        <h2 className="empty-title">No notes yet — capture your first on your phone</h2>
        <p className="empty-copy">
          Take a photo somewhere worth remembering. Field Notes saves where you were, which way you faced, the words in the picture and
          your voice note, and it shows up here while you're still standing there.
        </p>
        {native ? (
          <CaptureCard info={native} variant="full" />
        ) : native === null ? (
          <p className="empty-hint">
            <Icon name="phone" size={15} /> Open the Field Notes phone app and sign in with this account.
          </p>
        ) : null}
      </div>
    </section>
  );
}
