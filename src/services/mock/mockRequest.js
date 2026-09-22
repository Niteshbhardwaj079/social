const DEFAULT_DELAY_MS = 500;

/**
 * Resolves `data` after a simulated network delay so loading states behave
 * the same way the real API service layer (Phase 2) eventually will.
 */
export function mockRequest(data, delayMs = DEFAULT_DELAY_MS) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(data), delayMs);
  });
}
