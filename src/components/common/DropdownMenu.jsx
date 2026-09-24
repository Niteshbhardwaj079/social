import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_GAP_PX = 8;

/** Flush with the trigger's own "end" edge (right in LTR, left in RTL) or its "start" edge —
 *  mirrors the logical inset-inline-end/start this used to use. */
function horizontalStyle(rect, align) {
  const isRtl = document.documentElement.dir === 'rtl';
  const useRightEdge = (align === 'end') !== isRtl;
  return useRightEdge ? { right: Math.max(0, window.innerWidth - rect.right) } : { left: Math.max(0, rect.left) };
}

/**
 * Renders its open menu into a portal on `document.body`, fixed-positioned from the trigger's own
 * on-screen position — not `position: absolute` inside the trigger's own DOM parent. A menu opened
 * from inside a scrollable container (e.g. a data table with `overflow-x: auto`, which clips
 * `overflow-y` too per the CSS spec) would otherwise be clipped or hidden behind later rows,
 * however high its z-index — that's a stacking-context problem no z-index value can fix from
 * inside the clipped ancestor.
 */
function DropdownMenu({ trigger, children, align = 'end', className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  function openMenu() {
    const rect = triggerRef.current.getBoundingClientRect();
    setStyle({ top: rect.bottom + MENU_GAP_PX, ...horizontalStyle(rect, align) });
    setIsOpen(true);
  }

  // The menu's real height isn't known until it's rendered, so it opens below the trigger as a
  // first guess, then — before the browser paints, so there's no visible flicker — this flips it
  // to open upward instead if that guess would run past the bottom of the viewport and there's
  // more room above than below (a `position: fixed` element doesn't wrap or scroll into view on
  // its own the way normal document flow would).
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current || !triggerRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    if (menuRect.bottom <= window.innerHeight) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    if (triggerRect.top < menuRect.height) return; // no better option either way — leave it be
    setStyle((current) => ({ ...current, top: undefined, bottom: window.innerHeight - triggerRect.top + MENU_GAP_PX }));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleClickOutside(event) {
      if (triggerRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setIsOpen(false);
    }
    // Closing (rather than repositioning) on scroll/resize keeps this simple and matches how
    // most menus behave — an open menu tracking a moving trigger is more surprising than useful.
    function handleDismiss() {
      setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [isOpen]);

  return (
    <>
      <span ref={triggerRef} onClick={() => (isOpen ? setIsOpen(false) : openMenu())}>
        {trigger}
      </span>
      {isOpen && style
        ? createPortal(
            <div ref={menuRef} className={`dropdown-menu-custom show ${className}`.trim()} style={{ position: 'fixed', ...style }}>
              {typeof children === 'function' ? children({ close: () => setIsOpen(false) }) : children}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export default DropdownMenu;
