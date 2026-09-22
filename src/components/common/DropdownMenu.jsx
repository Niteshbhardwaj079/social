import { useEffect, useRef, useState } from 'react';

function DropdownMenu({ trigger, children, align = 'end', className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="position-relative" ref={containerRef}>
      <span onClick={() => setIsOpen((value) => !value)}>{trigger}</span>
      {isOpen ? (
        <div
          className={`dropdown-menu-custom position-absolute ${align === 'end' ? 'dropdown-menu-custom--end' : 'dropdown-menu-custom--start'} mt-2 show ${className}`.trim()}
        >
          {typeof children === 'function' ? children({ close: () => setIsOpen(false) }) : children}
        </div>
      ) : null}
    </div>
  );
}

export default DropdownMenu;
