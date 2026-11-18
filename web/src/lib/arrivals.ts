import { useLayoutEffect, useRef, useState } from 'react';
import type { NotesState } from '../../../shared';

/**
 * The fresh notes that are new to this page: only ids the list didn't already
 * hold count, so a note re-captured after a search refresh doesn't flash. A
 * layout effect, so the arrival class is on the card before its first paint.
 */
export function useArrivals({ fresh, notes }: NotesState): Set<string> {
  const known = useRef(new Set<string>());
  const [arrivals, setArrivals] = useState<Set<string>>(() => new Set());

  useLayoutEffect(() => {
    const before = known.current;
    known.current = new Set(notes.map((n) => n.id));
    setArrivals((prev) => {
      const next = new Set<string>();
      for (const id of fresh) if (prev.has(id) || !before.has(id)) next.add(id);
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next;
    });
  }, [fresh, notes]);

  return arrivals;
}
