import { useEffect, useRef } from 'react';
import type { Place } from '../../../shared';
import { MAP_STYLE, maplibregl } from '../lib/maplibre';

/** A small map of one place, with the direction the phone faced as a cone. */
export default function MiniMap({ place }: { place: Place }) {
  const ref = useRef<HTMLDivElement>(null);
  const { lat, lng, heading } = place;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current!,
      style: MAP_STYLE,
      center: [lng, lat],
      zoom: 14.5,
      attributionControl: false,
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    // A compact attribution starts expanded; at this size it should start as the (i) button.
    map.once('load', () => ref.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    const el = document.createElement('div');
    el.className = 'here';
    if (heading != null) {
      const cone = document.createElement('div');
      cone.className = 'here-cone';
      cone.style.transform = `rotate(${heading}deg)`;
      el.append(cone);
    }
    const dot = document.createElement('div');
    dot.className = 'here-dot';
    el.append(dot);
    // Map-aligned so the cone keeps pointing the true heading if the map is rotated.
    new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([lng, lat]).addTo(map);
    return () => map.remove();
  }, [lat, lng, heading]);

  return <div ref={ref} className="minimap" />;
}
