import { useEffect, useState } from 'react';
import { Dialogs, Screen } from '@nativescript/core';
import { altitude, ApiError, clockTime, coordinates, heading, relativeTime, shortDate, type Note, type NotesState } from '../shared';
import { API_BASE } from '../config';
import { deviceLabel, noteTitle } from '../components/NoteCard';
import { Icon, RemoteImage } from '../components/ui';
import { api, friendlyError } from '../session';
import { haptic } from '../platform/haptics';
import { systemBars } from '../platform/insets';
import { openInMaps, shareLink } from '../platform/system';

/** "5 min ago · 14:05" for recent notes, "Mar 4, 14:05" for older ones. */
function when(iso: string): string {
  const recent = Date.now() - Date.parse(iso) < 48 * 3600_000;
  return recent ? `${relativeTime(iso)} · ${clockTime(iso)}` : `${shortDate(iso)}, ${clockTime(iso)}`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <stacklayout className="stat">
      <label text={value} className="stat-value" />
      <label text={label} className="stat-label" />
    </stacklayout>
  );
}

type Fetched = { state: 'loading' } | { state: 'found'; note: Note } | { state: 'gone' } | { state: 'error'; message: string };

/**
 * `listed` is the note from the live list; a note outside it (filtered out by a
 * search, past the first page, or just deleted) is fetched on its own.
 */
export function NoteDetail({ id, listed, notes, onBack }: { id: string; listed: Note | undefined; notes: NotesState; onBack: () => void }) {
  const [busy, setBusy] = useState<'share' | 'delete' | null>(null);
  const [fetched, setFetched] = useState<Fetched>({ state: 'loading' });
  const top = systemBars().top;

  useEffect(() => {
    if (listed) return;
    let live = true;
    setFetched({ state: 'loading' });
    api
      .note(id)
      .then((n) => live && setFetched({ state: 'found', note: n }))
      .catch((e) => live && setFetched(e instanceof ApiError && e.status === 404 ? { state: 'gone' } : { state: 'error', message: friendlyError(e) }));
    return () => {
      live = false;
    };
  }, [id, !listed]);

  const note = listed ?? (fetched.state === 'found' ? fetched.note : undefined);

  if (!note) {
    return (
      <gridlayout rows="auto, *" className="detail">
        <gridlayout className="detail-bar" paddingTop={8 + top} horizontalAlignment="left">
          <gridlayout className="round-button" onTap={onBack}>
            <Icon name="back" size={20} className="round-button-icon" />
          </gridlayout>
        </gridlayout>
        {fetched.state === 'loading' ? (
          <activityindicator row={1} busy color="#05bdba" />
        ) : (
          <label row={1} text={fetched.state === 'error' ? fetched.message : 'This note was deleted.'} className="empty-text" textWrap verticalAlignment="middle" margin="0 32" />
        )}
      </gridlayout>
    );
  }

  const w = Screen.mainScreen.widthDIPs;
  const photoHeight = note.photo ? Math.round(Math.min((w * note.photo.height) / note.photo.width, w * 1.25)) : 0;
  const p = note.place;
  const stats: [string, string][] = [];
  if (p?.heading != null) stats.push([heading(p.heading), 'FACING']);
  if (p?.altitude != null) stats.push([altitude(p.altitude), 'ALTITUDE']);
  if (p?.accuracy != null) stats.push([`±${Math.round(p.accuracy)} m`, 'ACCURACY']);

  const share = async () => {
    setBusy('share');
    try {
      const { shareId, url } = await api.share(note.id);
      haptic('light');
      shareLink(/^https?:/.test(url) ? url : `${API_BASE.replace(/\/$/, '')}/n/${shareId}`, noteTitle(note));
    } catch (e) {
      void Dialogs.alert({ title: 'Couldn’t make a link', message: friendlyError(e), okButtonText: 'OK' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await Dialogs.confirm({
      title: 'Delete this note?',
      message: 'It disappears from the web and every device, along with any shared link.',
      okButtonText: 'Delete',
      cancelButtonText: 'Cancel',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await notes.remove(note.id);
      haptic('success');
      onBack();
    } catch (e) {
      setBusy(null);
      void Dialogs.alert({ title: 'Couldn’t delete it', message: friendlyError(e), okButtonText: 'OK' });
    }
  };

  const backButton = (
    <gridlayout className="detail-bar" paddingTop={8 + top} verticalAlignment="top" horizontalAlignment="left">
      <gridlayout className="round-button" onTap={onBack}>
        <Icon name="back" size={20} className="round-button-icon" />
      </gridlayout>
    </gridlayout>
  );

  return (
    <gridlayout className="detail">
      <scrollview>
        <stacklayout>
          {note.photo ? <RemoteImage url={api.photoUrl(note.photo)} height={photoHeight} className="detail-photo" /> : <stacklayout height={64 + top} className="ink" />}
          <stacklayout className="detail-body">
            <label text={noteTitle(note)} className="detail-title" textWrap />
            <label text={`${when(note.createdAt)} · ${deviceLabel(note)}`} className="detail-meta" textWrap />
            {note.body ? <label text={note.body} className="detail-text" textWrap /> : null}

            {p ? (
              <stacklayout className="place-card">
                <gridlayout columns="auto, *">
                  <gridlayout className="compass">
                    <Icon name={p.heading != null ? 'heading' : 'pin'} size={22} className="compass-needle" rotate={p.heading ?? 0} />
                  </gridlayout>
                  <stacklayout col={1} verticalAlignment="middle">
                    <label text={p.name ?? 'Pinned spot'} className="place-name" textWrap />
                    <label text={coordinates(p)} className="place-coords" />
                  </stacklayout>
                </gridlayout>
                {stats.length ? (
                  <gridlayout columns="*, *, *">
                    {stats.map(([value, label], i) => (
                      <stacklayout key={label} col={i}>
                        <Stat value={value} label={label} />
                      </stacklayout>
                    ))}
                  </gridlayout>
                ) : null}
                <label text="Open in Maps  →" className="place-link" onTap={() => openInMaps(p.lat, p.lng, p.name ?? noteTitle(note))} />
              </stacklayout>
            ) : null}

            {note.recognizedText ? (
              <>
                <label text="TEXT IN THE PHOTO" className="block-title" />
                <stacklayout className="block">
                  <label text={note.recognizedText} className="block-text mono" textWrap />
                </stacklayout>
              </>
            ) : null}

            {note.transcript ? (
              <>
                <label text="VOICE NOTE" className="block-title" />
                <stacklayout className="block">
                  <label text={`“${note.transcript}”`} className="block-text" textWrap />
                </stacklayout>
              </>
            ) : null}

            <gridlayout columns="*, 12, *" className="actions" marginBottom={systemBars().bottom}>
              <button text={busy === 'share' ? 'Making a link…' : note.shareId ? 'Share link' : 'Share'} className="primary" isEnabled={!busy} onTap={() => void share()} />
              <button col={2} text={busy === 'delete' ? 'Deleting…' : 'Delete'} className="danger-button" isEnabled={!busy} onTap={() => void remove()} />
            </gridlayout>
          </stacklayout>
        </stacklayout>
      </scrollview>
      {note.photo ? <stacklayout height={top + 96} verticalAlignment="top" className="photo-scrim" isUserInteractionEnabled={false} /> : null}
      {backButton}
    </gridlayout>
  );
}
