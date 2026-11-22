import { describe, expect, it } from 'vitest';
import { ensureImportScripts } from '../src/core/worker/importScriptsShim';

/** The exact decision MediaPipe's loader makes (vision_bundle.mjs): page, or worker with import() fallback. */
function loaderPath(
  scope: { importScripts?: unknown },
  hasSelfImport = false,
): 'document' | 'import()' | 'self.import' {
  if (typeof scope.importScripts !== 'function') return 'document';
  try {
    (scope.importScripts as (u: string) => void)('x.js');
    return 'import()'; // loaded as a classic script
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    return hasSelfImport ? 'self.import' : 'import()';
  }
}

describe('ensureImportScripts', () => {
  it('without it, a WebKit module worker (no importScripts) sends the loader to document', () => {
    expect(loaderPath({})).toBe('document');
  });

  it('adds an importScripts that throws a TypeError, so the loader falls back to import()', () => {
    const scope: { importScripts?: unknown } = {};
    expect(ensureImportScripts(scope)).toBe(true);
    expect(typeof scope.importScripts).toBe('function');
    expect(() => (scope.importScripts as () => void)()).toThrow(TypeError);
    expect(loaderPath(scope)).toBe('import()');
  });

  it('leaves an existing importScripts alone (Chrome, Firefox)', () => {
    const original = () => {
      throw new TypeError('module worker');
    };
    const scope: { importScripts?: unknown } = { importScripts: original };
    expect(ensureImportScripts(scope)).toBe(false);
    expect(scope.importScripts).toBe(original);
  });
});
