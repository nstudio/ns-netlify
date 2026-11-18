import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { altitude, ApiError, coordinates, groupThousands, heading, relativeTime, type Note, type NotePatch, type NotesState } from '../../../shared';
import { PlatformChip } from '../components/Chips';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { displayTitle, longDate, platformLabel } from '../lib/notes';
import { Link, navigate } from '../lib/router';
import { api } from '../lib/session';
import { NotFound } from './NotFound';

const MiniMap = lazy(() => import('../components/MiniMap'));

/** A note outside the loaded page, such as an old deep link; null when it doesn't exist or isn't this person's. */
async function findNote(id: string): Promise<Note | null> {
  try {
    return await api.note(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function NoteDetail({ id, notes }: { id: string; notes: NotesState }) {
  const fromList = notes.notes.find((n) => n.id === id);
  const [found, setFound] = useState<Note | null | undefined>(undefined);
  const note = fromList ?? found ?? undefined;

  useEffect(() => {
    if (fromList || notes.loading || notes.query || found !== undefined) return;
    let alive = true;
    void findNote(id)
      .catch(() => null)
      .then((n) => alive && setFound(n));
    return () => {
      alive = false;
    };
  }, [id, fromList, notes.loading, notes.query, notes.notes, found]);

  useEffect(() => {
    if (note) document.title = `${displayTitle(note)} · Field Notes`;
  }, [note]);

  if (!note) {
    if (found === null || (!notes.loading && notes.error && !fromList))
      return <NotFound title="Note not found" copy="It may have been deleted, or it belongs to another account." />;
    return <DetailSkeleton />;
  }
  return <Detail key={note.id} note={note} notes={notes} />;
}

function Detail({ note, notes }: { note: Note; notes: NotesState }) {
  const [save, setSave] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const title = displayTitle(note);

  async function patch(p: NotePatch) {
    setSave('saving');
    setSaveError(null);
    try {
      await notes.update(note.id, p);
      setSave('saved');
    } catch (e) {
      setSave('error');
      setSaveError((e as Error).message);
    }
  }

  useEffect(() => {
    if (save !== 'saved') return;
    const t = setTimeout(() => setSave('idle'), 2200);
    return () => clearTimeout(t);
  }, [save]);

  return (
    <div className="page-wrap detail">
      <div className="detail-bar">
        <Link to="/" className="back-link">
          <Icon name="back" size={16} /> All notes
        </Link>
        <span className={`save-state save-${save}`} role="status" aria-live="polite">
          {save === 'saving' && (
            <>
              <span className="spinner spinner-dark" /> Saving
            </>
          )}
          {save === 'saved' && (
            <>
              <Icon name="check" size={15} /> Saved
            </>
          )}
          {save === 'error' && (
            <>
              <Icon name="alert" size={15} /> {saveError ?? 'Not saved'}
            </>
          )}
        </span>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          {note.photo && (
            <figure className="detail-photo">
              {note.photo.height > note.photo.width && <img className="detail-photo-backdrop" src={api.photoUrl(note.photo)} alt="" aria-hidden="true" />}
              <Photo photo={note.photo} alt={title} eager />
            </figure>
          )}

          <div className="detail-head">
            <p className="detail-when">
              <time dateTime={note.createdAt}>{longDate(note.createdAt)}</time>
              <span className="detail-ago">{relativeTime(note.createdAt)}</span>
            </p>
            <EditableTitle value={note.title} placeholder={title} onCommit={(t) => patch({ title: t })} />
            <EditableBody value={note.body} onCommit={(b) => patch({ body: b })} />
            <TagEditor tags={note.tags} onChange={(tags) => patch({ tags })} />
          </div>

          {note.recognizedText && (
            <section className="block block-scan">
              <header className="block-head">
                <span className="block-icon">
                  <Icon name="scan" size={18} />
                </span>
                <div>
                  <h2 className="block-title">Recognized in the photo</h2>
                  <p className="block-sub">Read on the {platformLabel(note.capturedOn)}, on the device</p>
                </div>
                <CopyButton text={note.recognizedText} label="Copy text" />
              </header>
              <p className="scan-text">{note.recognizedText}</p>
            </section>
          )}

          {note.transcript && (
            <section className="block block-voice">
              <header className="block-head">
                <span className="block-icon">
                  <Icon name="wave" size={18} />
                </span>
                <div>
                  <h2 className="block-title">Voice note</h2>
                  <p className="block-sub">Transcribed on the {platformLabel(note.capturedOn)}</p>
                </div>
              </header>
              <div className="voice-wave" aria-hidden="true">
                {Array.from({ length: 120 }, (_, i) => (
                  <span key={i} style={{ height: `${14 + Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.23) + 0.35 * Math.sin(i * 2.7)) * 64}%` }} />
                ))}
              </div>
              <blockquote className="transcript">{note.transcript}</blockquote>
            </section>
          )}
        </div>

        <aside className="detail-side">
          {note.place && <PlaceCard place={note.place} />}

          <section className="side-card">
            <h2 className="side-title">Captured</h2>
            <dl className="facts">
              <div>
                <dt>Device</dt>
                <dd className="fact-device">
                  <PlatformChip note={note} />
                  {note.device && <span>{note.device}</span>}
                </dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>{longDate(note.createdAt)}</dd>
              </div>
              {note.updatedAt !== note.createdAt && (
                <div>
                  <dt>Edited</dt>
                  <dd>{relativeTime(note.updatedAt)}</dd>
                </div>
              )}
              {note.photo && (
                <div>
                  <dt>Photo</dt>
                  <dd className="mono">
                    {groupThousands(note.photo.width)} × {groupThousands(note.photo.height)}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <ShareCard note={note} />

          <button type="button" className="button button-danger-ghost button-block" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={16} /> Delete note
          </button>
        </aside>
      </div>

      <ConfirmDelete
        open={confirmDelete}
        title={title}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await notes.remove(note.id);
          navigate('/', { replace: true });
        }}
      />
    </div>
  );
}

function EditableTitle({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = draft.trim();
    if (v !== value.trim()) onCommit(v);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setDraft(value);
      requestAnimationFrame(() => e.currentTarget?.blur());
    }
  };
  return (
    <input
      className="edit-title"
      value={draft}
      placeholder={placeholder}
      aria-label="Title"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
    />
  );
}

function EditableBody({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(value), [value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  return (
    <textarea
      ref={ref}
      className="edit-body"
      value={draft}
      rows={2}
      placeholder="Add a note…"
      aria-label="Note"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim().replace(/^#/, '').toLowerCase();
    setDraft('');
    if (t && !tags.includes(t)) onChange([...tags, t]);
  };
  return (
    <div className="tags" aria-label="Tags">
      {tags.map((t) => (
        <span key={t} className="tag">
          <span className="tag-hash">#</span>
          {t}
          <button type="button" className="tag-remove" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <label className="tag-add">
        <Icon name="tag" size={14} />
        <input
          value={draft}
          placeholder={tags.length ? 'Add tag' : 'Add a tag'}
          aria-label="Add a tag"
          onChange={(e) => setDraft(e.target.value.replace(',', ''))}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
            if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
          }}
        />
      </label>
    </div>
  );
}

function Compass({ degrees }: { degrees: number }) {
  return (
    <svg className="compass" viewBox="0 0 64 64" role="img" aria-label={`Facing ${heading(degrees)}`}>
      <circle cx="32" cy="32" r="29" className="compass-ring" />
      {Array.from({ length: 24 }, (_, i) => (
        <line
          key={i}
          x1="32"
          y1={i % 6 === 0 ? 6 : 7.5}
          x2="32"
          y2={i % 6 === 0 ? 12 : 10}
          className={i % 6 === 0 ? 'compass-tick-major' : 'compass-tick'}
          transform={`rotate(${i * 15} 32 32)`}
        />
      ))}
      <text x="32" y="22" className="compass-n">
        N
      </text>
      <g transform={`rotate(${degrees} 32 32)`} className="compass-needle">
        <path d="M32 9 37 32 32 29 27 32Z" className="compass-needle-fore" />
        <path d="M32 55 37 32 32 35 27 32Z" className="compass-needle-aft" />
      </g>
      <circle cx="32" cy="32" r="2.6" className="compass-hub" />
    </svg>
  );
}

function PlaceCard({ place }: { place: NonNullable<Note['place']> }) {
  return (
    <section className="side-card place-card">
      <div className="minimap-wrap">
        <Suspense fallback={<div className="minimap minimap-loading" />}>
          <MiniMap place={place} />
        </Suspense>
      </div>
      <div className="place-body">
        <h2 className="place-title">
          <Icon name="pin" size={16} />
          {place.name ?? 'Unnamed place'}
        </h2>
        <p className="place-coords mono">
          {coordinates(place)}
          {place.accuracy != null && <span className="place-acc"> ± {Math.round(place.accuracy)} m</span>}
        </p>
        {(place.heading != null || place.altitude != null) && (
          <div className="place-instruments">
            {place.heading != null && (
              <div className="instrument">
                <Compass degrees={place.heading} />
                <div>
                  <p className="instrument-label">Facing</p>
                  <p className="instrument-value">{heading(place.heading)}</p>
                </div>
              </div>
            )}
            {place.altitude != null && (
              <div className="instrument">
                <span className="instrument-icon">
                  <Icon name="mountain" size={22} />
                </span>
                <div>
                  <p className="instrument-label">Altitude</p>
                  <p className="instrument-value">{altitude(place.altitude)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className={`button button-ghost button-small ${done ? 'is-done' : ''}`}
      onClick={() =>
        void navigator.clipboard
          ?.writeText(text)
          .then(() => setDone(true))
          .catch(() => {})
      }
    >
      <Icon name={done ? 'check' : 'copy'} size={14} /> {done ? 'Copied' : label}
    </button>
  );
}

function ShareCard({ note }: { note: Note }) {
  const [shareId, setShareId] = useState(note.shareId ?? null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setShareId(note.shareId ?? null), [note.shareId]);
  const link = url ?? (shareId ? `${location.origin}/n/${shareId}` : null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (shareId) {
        await api.unshare(note.id);
        setShareId(null);
        setUrl(null);
      } else {
        const r = await api.share(note.id);
        setShareId(r.shareId);
        setUrl(r.url);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`side-card share-card ${shareId ? 'is-on' : ''}`}>
      <div className="share-head">
        <div>
          <h2 className="side-title">Public link</h2>
          <p className="side-sub">{shareId ? 'Anyone with the link can see this note.' : 'Only you can see this note.'}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!shareId}
          aria-label="Share with a public link"
          className="switch"
          disabled={busy}
          onClick={() => void toggle()}
        >
          <span className="switch-thumb" />
        </button>
      </div>
      {link && (
        <div className="share-link">
          <input readOnly value={link} aria-label="Public link" onFocus={(e) => e.currentTarget.select()} className="mono" />
          <CopyButton text={link} />
          <a className="icon-button" href={link} target="_blank" rel="noreferrer" aria-label="Open the public page">
            <Icon name="external" size={16} />
          </a>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          <Icon name="alert" size={15} /> {error}
        </p>
      )}
    </section>
  );
}

function ConfirmDelete({ open, title, onCancel, onConfirm }: { open: boolean; title: string; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => e.target === ref.current && onCancel()}
      aria-labelledby="delete-title"
    >
      <div className="dialog-body">
        <span className="state-icon state-icon-danger">
          <Icon name="trash" size={22} />
        </span>
        <h2 id="delete-title" className="dialog-title">
          Delete this note?
        </h2>
        <p className="dialog-copy">
          “{title}” and its photo will be gone from the web and your phone, and any public link stops working. This can't be undone.
        </p>
        {error && (
          <p className="form-error" role="alert">
            <Icon name="alert" size={15} /> {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onCancel} autoFocus>
            Keep it
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {busy ? <span className="spinner" /> : <Icon name="trash" size={16} />} Delete
          </button>
        </div>
      </div>
    </dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="page-wrap detail" aria-busy="true" aria-label="Loading note">
      <div className="detail-bar">
        <Link to="/" className="back-link">
          <Icon name="back" size={16} /> All notes
        </Link>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <div className="skeleton-photo shimmer detail-photo" style={{ aspectRatio: '4 / 3' }} />
          <div className="skeleton-line shimmer" style={{ width: '30%', marginTop: 24 }} />
          <div className="skeleton-line skeleton-title shimmer" style={{ width: '70%', height: 34 }} />
          <div className="skeleton-line shimmer" style={{ width: '90%' }} />
        </div>
        <aside className="detail-side">
          <div className="side-card shimmer" style={{ height: 320 }} />
        </aside>
      </div>
    </div>
  );
}
