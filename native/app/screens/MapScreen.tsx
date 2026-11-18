import { useEffect, useRef, useState } from 'react';
import { Screen } from '@nativescript/core';
import { registerElement } from 'dominative';
import { CameraUpdate, MapView, type GoogleMap, type MapReadyEvent, type Marker, type MarkerTapEvent, type Style } from '@nativescript/google-maps';
import { tokens, type Note } from '../shared';
import { Header } from '../components/chrome';
import { Icon } from '../components/ui';
import { noteTitle } from '../components/NoteCard';
import { api } from '../session';
import { loadImage, photoMarker } from '../platform/images';
import { haptic } from '../platform/haptics';

declare module 'dominative' {
  interface NSCustomComponentsMap {
    MapView: MapView;
  }
}

registerElement('mapview', MapView);

/** Paper-toned map, so photos and the teal accents carry the colour. */
const PAPER_STYLE: Style[] = [
  { elementType: 'geometry', stylers: [{ color: '#f2efe8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5b6370' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f7f5f0' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#ece7dd' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dfe8d6' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ece6d8' }] },
  { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e4e3' }] },
];

export function MapScreen({ notes, query, active, onOpen }: { notes: Note[]; query: string; active: boolean; onOpen: (id: string) => void }) {
  const [map, setMap] = useState<GoogleMap | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; signature: string }>());
  const framed = useRef(false);
  const placed = notes.filter((n) => n.place);

  const onReady = (e: MapReadyEvent) => {
    const m = e.map;
    m.mapStyle = PAPER_STYLE;
    m.uiSettings.compassEnabled = true;
    m.uiSettings.mapToolbarEnabled = false;
    m.uiSettings.myLocationButtonEnabled = false;
    setMap(m);
  };

  useEffect(() => {
    if (!map) return;
    const seen = new Set<string>();
    for (const note of placed) {
      seen.add(note.id);
      const signature = `${note.updatedAt}|${note.photo?.key ?? ''}`;
      const existing = markers.current.get(note.id);
      if (existing?.signature === signature) continue;
      if (existing) map.removeMarker(existing.marker);
      const position = { lat: note.place.lat, lng: note.place.lng };
      const marker = map.addMarker({ position, title: noteTitle(note), snippet: note.place.name ?? '', color: tokens.color.accent, userData: { id: note.id } });
      markers.current.set(note.id, { marker, signature });
      if (note.photo) {
        void loadImage(api.photoUrl(note.photo)).then((source) => {
          const entry = markers.current.get(note.id);
          if (!source || entry?.marker !== marker) return;
          const iconImage = photoMarker(source);
          if (!iconImage) return;
          map.removeMarker(marker);
          const withPhoto = map.addMarker({ position, title: noteTitle(note), snippet: note.place.name ?? '', icon: iconImage, anchorU: 0.5, anchorV: 0.5, userData: { id: note.id } });
          markers.current.set(note.id, { marker: withPhoto, signature });
        });
      }
    }
    for (const [id, { marker }] of markers.current) {
      if (!seen.has(id)) {
        map.removeMarker(marker);
        markers.current.delete(id);
      }
    }
  }, [map, notes]);

  const frame = () => {
    if (!map || !placed.length) return;
    const coords = placed.map((n) => ({ lat: n.place.lat, lng: n.place.lng }));
    map.animateCamera(coords.length === 1 ? CameraUpdate.fromCoordinate(coords[0], 15) : CameraUpdate.fromCoordinates(coords, Math.round(64 * Screen.mainScreen.scale)));
  };

  useEffect(() => {
    if (map && active && placed.length && !framed.current) {
      framed.current = true;
      // The map needs a laid-out size before it can fit bounds.
      setTimeout(frame, 300);
    }
  }, [map, active, placed.length]);

  const onMarkerTap = (e: MarkerTapEvent) => {
    const id = e.marker?.userData?.id;
    if (id) {
      haptic('selection');
      onOpen(id);
    }
  };

  return (
    <gridlayout rows="auto, *">
      <Header
        title="Map"
        sub={
          query
            ? `${placed.length} ${placed.length === 1 ? 'place' : 'places'} matching “${query}”`
            : placed.length
              ? `${placed.length} ${placed.length === 1 ? 'place' : 'places'} you’ve been`
              : 'Where your notes were taken'
        }
        right={
          placed.length ? (
            <gridlayout className="icon-button" onTap={frame}>
              <Icon name="locate" size={20} className="icon-button-img" />
            </gridlayout>
          ) : null
        }
      />
      <gridlayout row={1} className="body">
        <mapview lat={20} lng={0} zoom={1.5} preventDefaultMarkerTapBehavior onReady={onReady} onMarkerTap={onMarkerTap} />
        {!placed.length ? (
          <gridlayout columns="auto, *" className="map-empty">
            <Icon name="pin" size={22} style={{ tintColor: tokens.color.accent }} marginRight={12} verticalAlignment="middle" />
            <label col={1} text="Notes you capture with your location appear here, pinned with their photo." className="block-text" textWrap />
          </gridlayout>
        ) : null}
      </gridlayout>
    </gridlayout>
  );
}
