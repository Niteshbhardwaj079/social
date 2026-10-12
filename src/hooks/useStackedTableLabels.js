import { useEffect } from 'react';

/** Copies each column's heading onto its cells as data-label, which the phone layout shows next to the value. */
function labelCells(root) {
  root.querySelectorAll('table.data-table--stack').forEach((table) => {
    const headings = Array.from(table.querySelectorAll('thead th'), (th) => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((row) => {
      Array.from(row.children).forEach((cell, index) => {
        const label = headings[index] ?? '';
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
      });
    });
  });
}

/**
 * Tables with the class "data-table--stack" turn into one card per row on a phone (see
 * styles/components/_tables.scss). Each value then needs its column name beside it; this fills that in
 * from the table's own headings, so the page code stays a plain table. Pass a ref to the page area.
 */
export function useStackedTableLabels(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof MutationObserver === 'undefined') return undefined;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => labelCells(root));
    };
    // Only rows being added or replaced matter here (setting data-label is not watched, so no loop).
    const observer = new MutationObserver(schedule);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [rootRef]);
}
