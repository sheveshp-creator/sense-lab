/**
 * Registers the service worker (public/sw.js) in production builds only: in development it would cache
 * files that change on every save. Failure is harmless, the app simply loads from the network.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // After load, so it never competes with the first paint or the first model download.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* private mode or blocked: no offline cache, everything else works */
    });
  });
}
