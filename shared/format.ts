/**
 * Formatting shared by web and phone. NativeScript's iOS runtime has no Intl,
 * so nothing here calls Intl, toLocaleString or toLocaleDateString.
 */
import type { Place } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "just now", "5 min ago", "3 h ago", "yesterday", then "Mar 4" or "Mar 4, 2025". */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return 'yesterday';
  return shortDate(iso, now);
}

export function shortDate(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? '' : `, ${d.getFullYear()}`}`;
}

/** "14:05" in the device's local time. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 37.7749° N, 122.4194° W */
export function coordinates({ lat, lng }: Pick<Place, 'lat' | 'lng'>, digits = 4): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(digits)}° ${lng >= 0 ? 'E' : 'W'}`;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** 212 → "SW 212°" */
export function heading(degrees: number): string {
  const d = ((Math.round(degrees) % 360) + 360) % 360;
  return `${COMPASS[Math.round(d / 45) % 8]} ${d}°`;
}

/** 1234.5 → "1,235 m" */
export function altitude(metres: number): string {
  return `${groupThousands(Math.round(metres))} m`;
}

export function groupThousands(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The first line of a body, for a note without a title. */
export function titleFrom(body: string, max = 60): string {
  const line = body.trim().split('\n')[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
