import { useEffect } from 'react';

/** True when the element is a sideways-scrolling strip that is currently wider than its box. */
function isSidewaysScroller(element) {
  if (element.scrollWidth <= element.clientWidth + 1) return false;
  return /(auto|scroll)/.test(getComputedStyle(element).overflowX);
}

/**
 * Scrolls each sideways strip (tab bars, settings menu...) so a newly selected item sits in the middle.
 * Items that were already selected last time are left alone, so a strip the person scrolled by hand
 * does not jump back whenever something else on the page changes. Returns the selected items.
 */
function centerNewlyActiveItems(root, previouslyActive) {
  const active = new Set(root.querySelectorAll('.is-active, [aria-selected="true"], .active'));
  active.forEach((item) => {
    if (previouslyActive.has(item)) return;
    let strip = item.parentElement;
    while (strip && strip !== root && !isSidewaysScroller(strip)) strip = strip.parentElement;
    if (!strip || strip === root) return;
    const itemBox = item.getBoundingClientRect();
    const stripBox = strip.getBoundingClientRect();
    const offset = itemBox.left + itemBox.width / 2 - (stripBox.left + stripBox.width / 2);
    // Works the same in right-to-left languages, because it only moves by an on-screen distance.
    if (Math.abs(offset) > 1) strip.scrollBy({ left: offset, behavior: 'smooth' });
  });
  return active;
}

/**
 * On a phone, tab bars scroll sideways and the selected tab can sit off screen ("Invoices" on Billing).
 * This keeps every selected tab in view: after a page opens and whenever a different tab is selected.
 * Pass a ref to the page area to watch.
 */
export function useActiveTabInView(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof MutationObserver === 'undefined') return undefined;
    let frame = 0;
    let previouslyActive = new Set();
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        previouslyActive = centerNewlyActiveItems(root, previouslyActive);
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [rootRef]);
}
