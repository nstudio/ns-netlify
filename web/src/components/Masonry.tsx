import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const GAP = 20;

/**
 * Columns filled in reading order, each item going to the shortest column.
 * Heights are estimated from photo ratios, so placement is stable while images load.
 */
export function Masonry<T>({
  items,
  minColumn = 260,
  maxColumns = 4,
  estimate,
  render,
  keyOf,
}: {
  items: T[];
  minColumn?: number;
  maxColumns?: number;
  /** Height of an item for a given column width. */
  estimate: (item: T, width: number) => number;
  render: (item: T, index: number) => ReactNode;
  keyOf: (item: T) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = width ? Math.min(maxColumns, Math.max(1, Math.floor((width + GAP) / (minColumn + GAP)))) : 1;
  const colWidth = width ? (width - GAP * (count - 1)) / count : minColumn;
  const columns: { item: T; index: number }[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  items.forEach((item, index) => {
    let c = 0;
    for (let i = 1; i < count; i++) if (heights[i]! < heights[c]! - 1) c = i;
    columns[c]!.push({ item, index });
    heights[c]! += estimate(item, colWidth) + GAP;
  });

  return (
    <div ref={ref} className="masonry" style={{ gap: GAP }}>
      {width > 0 &&
        columns.map((col, i) => (
          <div key={i} className="masonry-col" style={{ gap: GAP }}>
            {col.map(({ item, index }) => (
              <div key={keyOf(item)} className="masonry-item">
                {render(item, index)}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
