import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre finds its worker next to its own module, which bundling moves.
maplibregl.setWorkerUrl(new URL(workerUrl, location.href).href);

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export { maplibregl };
