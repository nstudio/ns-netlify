import { altitude, heading, type Note } from '../../../shared';
import { platformLabel } from '../lib/notes';
import { Icon } from './Icon';

export function PlatformChip({ note }: { note: Pick<Note, 'capturedOn' | 'device'> }) {
  const label = platformLabel(note.capturedOn);
  return (
    <span className="chip chip-native" title={note.device ? `Captured on ${note.device}` : `Captured on ${label}`}>
      <Icon name="phone" size={13} />
      {label}
    </span>
  );
}

export function HeadingArrow({ degrees, size = 13 }: { degrees: number; size?: number }) {
  return <Icon name="arrow" size={size} style={{ transform: `rotate(${degrees}deg)` }} className="heading-arrow" />;
}

/** The facts a card shows at a glance. */
export function NoteChips({ note }: { note: Note }) {
  const p = note.place;
  return (
    <div className="chips">
      <PlatformChip note={note} />
      {p?.heading != null && (
        <span className="chip" title="Direction the phone faced">
          <HeadingArrow degrees={p.heading} />
          {heading(p.heading)}
        </span>
      )}
      {p?.altitude != null && (
        <span className="chip" title="Altitude">
          <Icon name="mountain" size={13} />
          {altitude(p.altitude)}
        </span>
      )}
      {note.recognizedText && (
        <span className="chip chip-soft" title="Text recognized in the photo, on the phone">
          <Icon name="scan" size={13} />
          Text
        </span>
      )}
      {note.transcript && (
        <span className="chip chip-soft" title="Voice note transcript">
          <Icon name="wave" size={13} />
          Voice
        </span>
      )}
      {note.shareId && (
        <span className="chip chip-accent" title="Has a public link">
          <Icon name="link" size={13} />
          Shared
        </span>
      )}
    </div>
  );
}
