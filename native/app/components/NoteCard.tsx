import { Screen } from '@nativescript/core';
import { altitude, heading, relativeTime, titleFrom, type Note } from '../shared';
import { api } from '../session';
import { Chip, Icon, RemoteImage, slideIn } from './ui';

export function noteTitle(note: Note): string {
  return note.title?.trim() || titleFrom(note.body ?? '') || 'Untitled note';
}

export function deviceLabel(note: Note): string {
  if (note.device) return note.device;
  return note.capturedOn === 'ios' ? 'iPhone' : note.capturedOn === 'android' ? 'Android' : 'Web';
}

export function NoteChips({ note }: { note: Note }) {
  const p = note.place;
  return (
    <wraplayout className="chips">
      {p?.heading != null ? <Chip name="heading" rotate={p.heading} text={heading(p.heading)} tone="accent" /> : null}
      {p?.altitude != null ? <Chip name="mountain" text={altitude(p.altitude)} /> : null}
      {note.recognizedText ? <Chip name="text" text="Text" /> : null}
      {note.transcript ? <Chip name="wave" text="Voice" /> : null}
      <Chip name={note.capturedOn === 'web' ? 'globe' : 'phone'} text={deviceLabel(note)} tone={note.capturedOn === 'web' ? 'plain' : 'native'} />
    </wraplayout>
  );
}

const CARD_WIDTH = () => Screen.mainScreen.widthDIPs - 34;

export function NoteCard({ note, fresh, onOpen }: { note: Note; fresh: boolean; onOpen: (id: string) => void }) {
  const w = CARD_WIDTH();
  const photoHeight = note.photo ? Math.round(Math.min((w * note.photo.height) / note.photo.width, w * 1.15)) : 0;
  return (
    <stacklayout className={`card ${fresh ? 'fresh' : ''}`} onTap={() => onOpen(note.id)} onLoaded={fresh ? slideIn : undefined}>
      {note.photo ? <RemoteImage url={api.photoUrl(note.photo)} height={photoHeight} className="card-photo" /> : null}
      <stacklayout className="card-body">
        {fresh ? <label text="JUST ARRIVED" className="fresh-badge" /> : null}
        <label text={noteTitle(note)} className="card-title" textWrap />
        {note.body ? <label text={note.body} className="card-text" textWrap maxLines={2} /> : null}
        <NoteChips note={note} />
        <gridlayout columns="auto, *, auto" className="card-meta">
          {note.place ? <Icon name="pin" size={14} className="meta-icon" /> : null}
          <label col={1} text={note.place?.name ?? (note.place ? 'Pinned on the map' : '')} className="meta-text" />
          <label col={2} text={relativeTime(note.createdAt)} className="meta-text" />
        </gridlayout>
      </stacklayout>
    </stacklayout>
  );
}
