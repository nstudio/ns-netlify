/** Generated landscape "photos" for the dev mock: layered ridges under a graded sky, with film grain. */

export interface Scene {
  sky: [string, string, string];
  sun?: { x: number; y: number; r: number; color: string };
  ridges: string[];
  water?: string;
  fog?: boolean;
  seed: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

function ridge(width: number, height: number, baseY: number, amp: number, rand: () => number, jag: number): string {
  const steps = 28;
  let d = `M0 ${height} L0 ${baseY.toFixed(1)}`;
  const phase = rand() * 6.28;
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * width;
    const y =
      baseY -
      amp * (0.55 + 0.45 * Math.sin(i * 0.42 + phase)) * (0.6 + rand() * 0.4) -
      jag * (rand() - 0.5) * amp;
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d} L${width} ${height} Z`;
}

export function sceneSvg(scene: Scene, width: number, height: number): string {
  const rand = rng(scene.seed);
  const n = scene.ridges.length;
  const horizon = scene.water ? height * 0.66 : height;
  const ridges = scene.ridges
    .map((color, i) => {
      const baseY = horizon * (0.5 + (i / n) * 0.45) + (scene.water ? 0 : height * 0.06 * i);
      const amp = height * (0.22 - i * 0.03);
      return `<path d="${ridge(width, horizon, baseY, amp, rand, 0.35 + i * 0.1)}" fill="${color}"/>`;
    })
    .join('');
  const sun = scene.sun
    ? `<circle cx="${scene.sun.x * width}" cy="${scene.sun.y * height}" r="${scene.sun.r * width}" fill="${scene.sun.color}" opacity=".95"/>` +
      `<circle cx="${scene.sun.x * width}" cy="${scene.sun.y * height}" r="${scene.sun.r * width * 3}" fill="url(#glow)"/>`
    : '';
  const water = scene.water
    ? `<rect y="${horizon}" width="${width}" height="${height - horizon}" fill="url(#water)"/>` +
      Array.from({ length: 9 }, (_, i) => {
        const y = horizon + 10 + i * ((height - horizon) / 9);
        return `<rect x="${(rand() * width * 0.6).toFixed(0)}" y="${y.toFixed(0)}" width="${(width * (0.15 + rand() * 0.3)).toFixed(0)}" height="2" fill="#fff" opacity=".18"/>`;
      }).join('')
    : '';
  const fog = scene.fog ? `<rect width="${width}" height="${height}" fill="url(#fog)"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${scene.sky[0]}"/><stop offset=".55" stop-color="${scene.sky[1]}"/><stop offset="1" stop-color="${scene.sky[2]}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="${scene.sun?.color ?? '#fff'}" stop-opacity=".45"/><stop offset="1" stop-color="${scene.sun?.color ?? '#fff'}" stop-opacity="0"/></radialGradient>
<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${scene.water ?? '#000'}"/><stop offset="1" stop-color="${scene.ridges[n - 1]}"/></linearGradient>
<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>
<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .09 0"/></filter>
</defs>
<rect width="${width}" height="${height}" fill="url(#sky)"/>${sun}${ridges}${water}${fog}
<rect width="${width}" height="${height}" fill="url(#shade)"/>
<rect width="${width}" height="${height}" filter="url(#grain)"/>
</svg>`;
}

export const SCENES: Record<string, Scene> = {
  dawnCoast: { sky: ['#f6c9a7', '#f3a98b', '#b8c7d8'], sun: { x: 0.72, y: 0.52, r: 0.045, color: '#fff4d6' }, ridges: ['#7d8aa3', '#4d5d78', '#26344d'], water: '#5f7896', seed: 3 },
  alpine: { sky: ['#8fc4ec', '#cfe6f6', '#eef4f7'], ridges: ['#b9c9d8', '#7f95ab', '#4a6178', '#253547'], seed: 9 },
  golden: { sky: ['#f9d77e', '#f4a15d', '#d9705a'], sun: { x: 0.3, y: 0.62, r: 0.06, color: '#fff1c2' }, ridges: ['#b8665a', '#7c3f48', '#3d2236'], seed: 15 },
  arctic: { sky: ['#1c2a4a', '#4a6a8f', '#a6c5d6'], sun: { x: 0.18, y: 0.3, r: 0.02, color: '#e8f6ff' }, ridges: ['#c2d4e0', '#8aa3b8', '#3d5167'], water: '#284460', seed: 21 },
  moss: { sky: ['#dfe9d3', '#b9cfa6', '#7f9e6e'], ridges: ['#6f8f5c', '#4d6e42', '#2f4a2c', '#1b2e1c'], fog: true, seed: 27 },
  patagonia: { sky: ['#5d8fc7', '#a8c8e6', '#f1e7d6'], sun: { x: 0.82, y: 0.2, r: 0.03, color: '#fffbe8' }, ridges: ['#d6dde6', '#8e9cad', '#5a6573', '#2e3540'], seed: 33 },
  fogBay: { sky: ['#c9d1d8', '#dfe3e6', '#eceeef'], ridges: ['#aab3bb', '#7d8992', '#c1503f'], water: '#8b98a3', fog: true, seed: 41 },
  dusk: { sky: ['#2b2350', '#7b4a7d', '#f08a6c'], sun: { x: 0.55, y: 0.7, r: 0.05, color: '#ffd2a6' }, ridges: ['#5b3a64', '#36254a', '#181530'], water: '#4e3a66', seed: 45 },
  desert: { sky: ['#9ad0ec', '#f3e3c3', '#f2c48d'], sun: { x: 0.25, y: 0.25, r: 0.035, color: '#fffbe0' }, ridges: ['#e0a46b', '#c07a4a', '#8b4f32'], seed: 51 },
  forest: { sky: ['#a9d2e8', '#d8ecef', '#e9f1e4'], ridges: ['#8db39a', '#5b8a6c', '#33604a', '#173829'], fog: true, seed: 57 },
};
