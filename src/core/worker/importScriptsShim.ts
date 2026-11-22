/**
 * Makes a module worker look the way MediaPipe's loader expects.
 *
 * Its loader decides "am I in a worker?" with `typeof importScripts === 'function'`. In a module worker
 * importScripts exists but throws a TypeError (Chrome, Firefox), and the loader then falls back to `import()`.
 * Safari and every browser on iOS / iPadOS (WebKit) do not define it at all, so the loader concludes it is on a
 * page and calls `document.createElement`, which does not exist in a worker: "Can't find variable: document".
 *
 * Giving the worker an importScripts that throws the same TypeError makes WebKit take the same path as Chrome.
 * Where it is already defined, nothing changes.
 */
export function ensureImportScripts(scope: { importScripts?: unknown }): boolean {
  if (typeof scope.importScripts === 'function') return false;
  Object.defineProperty(scope, 'importScripts', {
    configurable: true,
    writable: true,
    value: () => {
      throw new TypeError('importScripts is not available in module workers');
    },
  });
  return true;
}
