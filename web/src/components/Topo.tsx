import { useMemo } from 'react';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

/** Closed, smoothed ring through `pts`, as a path made of quadratic curves between midpoints. */
function ring(pts: [number, number][]): string {
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const n = pts.length;
  const start = mid(pts[n - 1]!, pts[0]!);
  let d = `M${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const m = mid(p, pts[(i + 1) % n]!);
    d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

/** Decorative topographic contour lines. */
export function Topo({ seed = 7, peaks = 3, className }: { seed?: number; peaks?: number; className?: string }) {
  const paths = useMemo(() => {
    const r = rng(seed);
    const out: string[] = [];
    for (let p = 0; p < peaks; p++) {
      const cx = 120 + r() * 760;
      const cy = 80 + r() * 440;
      const phases = [r() * 6.28, r() * 6.28, r() * 6.28];
      const rings = 7 + Math.floor(r() * 6);
      for (let k = 1; k <= rings; k++) {
        const base = k * 26;
        const pts: [number, number][] = [];
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          const wobble =
            1 +
            0.16 * Math.sin(a * 2 + phases[0]! + k * 0.13) +
            0.09 * Math.sin(a * 3 + phases[1]! - k * 0.2) +
            0.05 * Math.sin(a * 5 + phases[2]!);
          pts.push([cx + Math.cos(a) * base * wobble * 1.25, cy + Math.sin(a) * base * wobble]);
        }
        out.push(ring(pts));
      }
    }
    return out;
  }, [seed, peaks]);
  return (
    <svg className={className} viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
