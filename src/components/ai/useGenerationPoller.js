import { useEffect, useState } from 'react';
import { getGeneration } from '../../services/api/aiApi';

const POLL_EVERY_MS = 4000;
const isFinished = (generation) => generation?.status === 'succeeded' || generation?.status === 'failed';

/**
 * Keeps a background AI job (slideshow / AI video) up to date: asks the server every few seconds
 * until it has succeeded or failed, then stops. Always stops when the screen closes.
 * Pass the generation the server returned when the job was started.
 */
export default function useGenerationPoller(startedGeneration) {
  const [generation, setGeneration] = useState(startedGeneration);
  const [lastSeenId, setLastSeenId] = useState(startedGeneration?.id ?? null);

  // A new job was started: show it straight away (adjusting state while rendering, not in an effect).
  if ((startedGeneration?.id ?? null) !== lastSeenId) {
    setLastSeenId(startedGeneration?.id ?? null);
    setGeneration(startedGeneration);
  }

  const id = generation?.id;
  const finished = isFinished(generation);
  useEffect(() => {
    if (!id || finished) return undefined;
    const timer = window.setInterval(() => {
      getGeneration(id)
        .then(setGeneration)
        .catch(() => {}); // a missed poll is fine — the next one will try again
    }, POLL_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [id, finished]);

  return generation;
}
