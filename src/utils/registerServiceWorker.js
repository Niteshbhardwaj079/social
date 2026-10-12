/**
 * Registers public/sw.js, which makes the app installable ("Add to Home screen") and shows an offline
 * page without internet. Only in the built app: during `npm run dev` a service worker would just get
 * in the way of hot reload. Any failure is ignored — the app works the same without it.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
