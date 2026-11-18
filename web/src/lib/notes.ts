import { shortDate, titleFrom, type Note, type Platform, type User } from '../../../shared';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today", "Yesterday", or "Monday" with "Nov 10" as the detail. */
export function dayLabel(iso: string, now = Date.now()): { label: string; detail: string } {
  const d = new Date(iso);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  const weekday = WEEKDAYS[d.getDay()]!;
  const date = shortDate(iso, now);
  if (days === 0) return { label: 'Today', detail: `${weekday}, ${date}` };
  if (days === 1) return { label: 'Yesterday', detail: `${weekday}, ${date}` };
  if (days < 7) return { label: weekday, detail: date };
  return { label: date, detail: weekday };
}

export interface DayGroup {
  key: string;
  first: string;
  notes: Note[];
}

export function groupByDay(notes: Note[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const n of notes) {
    const key = dayKey(n.createdAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.notes.push(n);
    else groups.push({ key, first: n.createdAt, notes: [n] });
  }
  return groups;
}

export function platformLabel(p: Platform): string {
  return p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : 'Web';
}

export function displayTitle(n: Pick<Note, 'title' | 'body'>): string {
  return n.title.trim() || titleFrom(n.body) || 'Untitled note';
}

export function initials(user: User): string {
  const source = user.name?.trim() || user.email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export function firstName(user: User): string {
  return user.name?.trim().split(/\s+/)[0] || user.email.split('@')[0] || 'there';
}

/** Long weekday and date for a detail page: "Tuesday, Nov 18, 2026 at 14:05". */
export function longDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${WEEKDAYS[d.getDay()]}, ${shortDate(iso, 0)} at ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
