import { useEffect, useState } from 'react';

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);

    mediaQueryList.addEventListener('change', handleChange);
    setMatches(mediaQueryList.matches);

    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}
