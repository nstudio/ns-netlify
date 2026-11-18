import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import { relativeTime, type Note, type NotesState } from '../../../shared';
import { PlatformChip } from '../components/Chips';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { MAP_STYLE, maplibregl } from '../lib/maplibre';
import { displayTitle } from '../lib/notes';
import { Link, navigate } from '../lib/router';
import { api } from '../lib/session';

type Placed = Note & { place: NonNullable<Note['place']> };

function toGeoJSON(notes: Placed[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: notes.map((n) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [n.place.lng, n.place.lat] },
      properties: { id: n.id, t: Date.parse(n.createdAt) },
    })),
  };
}

function pinElement(note: Note | undefined, count?: number): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `pin${count ? ' pin-cluster' : ''}${note?.photo ? '' : ' pin-plain'}`;
  el.setAttribute('aria-label', count ? `${count} notes here, zoom in` : note ? displayTitle(note) : 'Note');
  const face = document.createElement('span');
  face.className = 'pin-face';
  if (note?.photo) {
    const img = document.createElement('img');
    img.src = api.photoUrl(note.photo);
    img.alt = '';
    img.decoding = 'async';
    face.append(img);
  }
  el.append(face);
  if (count) {
    const badge = document.createElement('span');
    badge.className = 'pin-count';
    badge.textContent = String(count);
    el.append(badge);
  }
  return el;
}

export default function MapPage({ notes, arrivals }: { notes: NotesState; arrivals: Set<string> }) {
  const placed = useMemo(() => notes.notes.filter((n): n is Placed => !!n.place), [notes.notes]);
  const unplaced = notes.notes.length - placed.length;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const byId = useRef(new Map<string, Placed>());
  const freshRef = useRef(arrivals);
  const markers = useRef(new Map<string, { marker: Marker; sig: string }>());
  const fitted = useRef(false);
  const zoomOnSelect = useRef(0);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [popupEl] = useState(() => document.createElement('div'));

  byId.current = new Map(placed.map((n) => [n.id, n]));
  freshRef.current = arrivals;

  useEffect(() => {
    document.title = 'Map · Field Notes';
    const map = new maplibregl.Map({
      container: container.current!,
      style: MAP_STYLE,
      center: [0, 25],
      zoom: 1.4,
      attributionControl: { compact: true },
      fadeDuration: 150,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    const popup = new maplibregl.Popup({ offset: 64, closeButton: false, maxWidth: '300px', className: 'note-popup', focusAfterOpen: false });
    popup.setDOMContent(popupEl);
    popup.on('close', () => setSelected(null));
    popupRef.current = popup;

    const sync = () => {
      if (!map.getSource('notes') || !map.isSourceLoaded('notes')) return;
      const seen = new Set<string>();
      for (const f of map.querySourceFeatures('notes')) {
        const p = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; newest?: number; id?: string };
        const [lng, lat] = (f.geometry as Point).coordinates as [number, number];
        const key = p.cluster ? `c${p.cluster_id}` : `n${p.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const note = p.cluster ? [...byId.current.values()].find((n) => Date.parse(n.createdAt) === p.newest) : byId.current.get(p.id!);
        const fresh = !!note && !p.cluster && freshRef.current.has(note.id);
        const sig = `${note?.id}|${note?.photo?.key}|${p.point_count ?? ''}|${fresh}`;
        const existing = markers.current.get(key);
        if (existing && existing.sig === sig) continue;
        existing?.marker.remove();
        const el = pinElement(note, p.cluster ? p.point_count : undefined);
        if (fresh) el.classList.add('is-fresh');
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (p.cluster) {
            void (map.getSource('notes') as GeoJSONSource).getClusterExpansionZoom(p.cluster_id!).then((zoom) =>
              map.easeTo({ center: [lng, lat], zoom: Math.min(zoom + 0.5, 16), duration: 600 }),
            );
          } else setSelected(p.id!);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
        markers.current.set(key, { marker, sig });
      }
      for (const [key, { marker }] of markers.current) {
        if (!seen.has(key)) {
          marker.remove();
          markers.current.delete(key);
        }
      }
    };

    map.on('load', () => {
      map.addSource('notes', {
        type: 'geojson',
        data: toGeoJSON([...byId.current.values()]),
        cluster: true,
        clusterRadius: 58,
        clusterMaxZoom: 15,
        clusterProperties: { newest: ['max', ['get', 't']] },
      });
      // Tiles of a source only load while a layer uses it; the pins themselves are HTML markers.
      map.addLayer({ id: 'notes-anchor', type: 'circle', source: 'notes', paint: { 'circle-radius': 0, 'circle-opacity': 0 } });
      setReady(true);
    });
    map.on('render', sync);
    map.on('click', () => setSelected(null));

    return () => {
      for (const { marker } of markers.current.values()) marker.remove();
      markers.current.clear();
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [popupEl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('notes') as GeoJSONSource | undefined)?.setData(toGeoJSON(placed));
    map.triggerRepaint();
    if (!fitted.current && placed.length) {
      fitted.current = true;
      const bounds = new maplibregl.LngLatBounds();
      for (const n of placed) bounds.extend([n.place.lng, n.place.lat]);
      map.fitBounds(bounds, { padding: { top: 90, bottom: 60, left: 60, right: 60 }, maxZoom: 12, duration: 0 });
    }
  }, [ready, placed, arrivals]);

  const selectedNote = selected ? placed.find((n) => n.id === selected) : undefined;

  useEffect(() => {
    const map = mapRef.current;
    const popup = popupRef.current;
    if (!map || !popup) return;
    if (!selectedNote) {
      popup.remove();
      return;
    }
    popup.setLngLat([selectedNote.place.lng, selectedNote.place.lat]);
    // Room above the pin for the popup, which would otherwise spill off a narrow screen.
    // At world zoom the map can't pan far enough vertically to make room for the popup.
    const zoom = Math.max(map.getZoom(), zoomOnSelect.current, 3.5);
    zoomOnSelect.current = 0;
    map.easeTo({ center: [selectedNote.place.lng, selectedNote.place.lat], offset: [0, 150], zoom, duration: zoom > map.getZoom() ? 1200 : 500 });
    // addTo() on an open popup removes it first, which would fire 'close' and clear the selection.
    if (!popup.isOpen()) popup.addTo(map);
  }, [selectedNote]);

  const focusNote = (n: Placed) => {
    zoomOnSelect.current = 13;
    setSelected(n.id);
  };

  return (
    <div className="map-page">
      <aside className="map-panel" aria-label="Notes on the map">
        <div className="map-panel-head">
          <h1 className="map-panel-title">Map</h1>
          <p className="map-panel-sub">
            {placed.length} {placed.length === 1 ? 'note' : 'notes'} with a place
            {unplaced > 0 && <span> · {unplaced} without</span>}
          </p>
        </div>
        <ul className="map-list">
          {placed.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`map-row ${selected === n.id ? 'is-selected' : ''} ${arrivals.has(n.id) ? 'is-fresh' : ''}`}
                onClick={() => focusNote(n)}
              >
                <span className="map-row-thumb">
                  {n.photo ? <img src={api.photoUrl(n.photo)} alt="" loading="lazy" /> : <Icon name="pin" size={18} />}
                </span>
                <span className="map-row-text">
                  <span className="map-row-title">{displayTitle(n)}</span>
                  <span className="map-row-meta">
                    {n.place.name ?? 'Unnamed place'} · {relativeTime(n.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="map-stage">
        <div ref={container} className="map-canvas" />
        {notes.notes.length > 0 && placed.length === 0 && (
          <div className="map-empty">
            <Icon name="pin" size={18} /> None of your notes have a place yet. Capture one on your phone with location on.
          </div>
        )}
        {notes.notes.length === 0 && !notes.loading && (
          <div className="map-empty">
            <Icon name="phone" size={18} /> Notes you capture on your phone appear here, where you took them.
          </div>
        )}
      </div>
      {createPortal(
        selectedNote ? (
          <div className="popup-card">
            {selectedNote.photo && (
              <Link to={`/notes/${selectedNote.id}`} className="popup-photo" tabIndex={-1}>
                <Photo photo={selectedNote.photo} alt="" minRatio={1.4} eager />
              </Link>
            )}
            <div className="popup-body">
              <p className="popup-meta">
                <PlatformChip note={selectedNote} />
                <span>{relativeTime(selectedNote.createdAt)}</span>
              </p>
              <h2 className="popup-title">{displayTitle(selectedNote)}</h2>
              {selectedNote.place.name && (
                <p className="popup-place">
                  <Icon name="pin" size={13} /> {selectedNote.place.name}
                </p>
              )}
              <button type="button" className="button button-primary button-small" onClick={() => navigate(`/notes/${selectedNote.id}`)}>
                Open note <Icon name="back" size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          </div>
        ) : null,
        popupEl,
      )}
    </div>
  );
}
