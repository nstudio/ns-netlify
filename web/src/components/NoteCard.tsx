import { clockTime, type Note } from '../../../shared';
import { displayTitle, platformLabel } from '../lib/notes';
import { Link } from '../lib/router';
import { NoteChips } from './Chips';
import { Icon } from './Icon';
import { Photo } from './Photo';

export function NoteCard({ note, fresh, eager }: { note: Note; fresh: boolean; eager?: boolean }) {
  const title = displayTitle(note);
  const excerpt = note.title.trim() ? note.body : note.body.split('\n').slice(1).join(' ');
  return (
    <article className={`card ${fresh ? 'is-fresh' : ''} ${note.photo ? '' : 'card-text'}`}>
      <Link to={`/notes/${note.id}`} className="card-link" aria-label={title}>
        {note.photo && (
          <div className="card-photo">
            <Photo photo={note.photo} alt="" minRatio={0.8} eager={eager} />
            {fresh && (
              <span className="fresh-badge">
                <span className="live-dot" /> Just arrived from {platformLabel(note.capturedOn)}
              </span>
            )}
          </div>
        )}
        <div className="card-body">
          {!note.photo && fresh && (
            <span className="fresh-badge fresh-badge-inline">
              <span className="live-dot" /> Just arrived from {platformLabel(note.capturedOn)}
            </span>
          )}
          <p className="card-meta">
            <time dateTime={note.createdAt}>{clockTime(note.createdAt)}</time>
            {note.place?.name && (
              <>
                <span className="dot-sep" aria-hidden="true" />
                <span className="card-place">
                  <Icon name="pin" size={13} />
                  {note.place.name}
                </span>
              </>
            )}
          </p>
          <h3 className="card-title">{title}</h3>
          {excerpt.trim() && <p className="card-excerpt">{excerpt}</p>}
          {!note.photo && note.transcript && !excerpt.trim() && <p className="card-excerpt card-quote">“{note.transcript}”</p>}
          <NoteChips note={note} />
        </div>
      </Link>
    </article>
  );
}

export function CardSkeleton({ ratio }: { ratio: number }) {
  return (
    <div className="card card-skeleton" aria-hidden="true">
      <div className="skeleton-photo shimmer" style={{ aspectRatio: String(ratio) }} />
      <div className="card-body">
        <div className="skeleton-line shimmer" style={{ width: '38%' }} />
        <div className="skeleton-line skeleton-title shimmer" style={{ width: '82%' }} />
        <div className="skeleton-line shimmer" style={{ width: '94%' }} />
        <div className="skeleton-line shimmer" style={{ width: '60%' }} />
      </div>
    </div>
  );
}
