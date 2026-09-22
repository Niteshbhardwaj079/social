import { useEffect, useState } from 'react';
import { getUiScale } from '../utils/uiScale';

// 1 on a normal screen, ~2 on a 4K screen. Re-reads whenever the window is resized
// (the root font-size is set by media queries, so it changes exactly then).
function useUiScale() {
  const [scale, setScale] = useState(getUiScale);

  useEffect(() => {
    function handleResize() {
      setScale(getUiScale());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return scale;
}

export default useUiScale;
