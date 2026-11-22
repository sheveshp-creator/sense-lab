import { FilesetResolver } from '@mediapipe/tasks-vision';

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

let loads = 0;

/** True inside a Web Worker. (importScripts exists in module workers too, but throws, so it cannot be the test.) */
const inWorker = (): boolean =>
  typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

/**
 * The WASM files MediaPipe needs.
 *
 * In a worker we use its ES-module loader (vision_wasm_module_internal.js): the classic one needs
 * importScripts(), which module workers lack, and working around that took eval(), which a strict
 * Content-Security-Policy forbids. The module loader is a plain same-origin import().
 * On the main thread (the fallback path) MediaPipe loads the loader with a <script> tag, which cannot run an
 * ES module, so there we keep the classic loader (that needs no eval either).
 *
 * Why the query string (module loader only): each MediaPipe task imports the loader, takes the global
 * `ModuleFactory` it sets, and clears it. A second task would import the same URL, get the cached module
 * (which does not run again), and find the global empty ("ModuleFactory not set"). A unique URL makes every
 * task a fresh import. The big .wasm file is unaffected, so nothing is downloaded twice.
 */
export async function visionFileset(wasmBaseUrl: string): Promise<WasmFileset> {
  if (!inWorker()) return FilesetResolver.forVisionTasks(wasmBaseUrl, false);
  const fileset = await FilesetResolver.forVisionTasks(wasmBaseUrl, true);
  return { ...fileset, wasmLoaderPath: `${fileset.wasmLoaderPath}?task=${++loads}` };
}

/**
 * A canvas for MediaPipe to bind its WebGL context to, when it runs inside a worker.
 *
 * Without one, MediaPipe decides for itself: it uses an OffscreenCanvas only if the user-agent passes its Safari
 * check (Safari 17 or newer, read from a "Version/17" token). Chrome and Firefox on iPhone and iPad have no such
 * token, so the check fails there, MediaPipe falls back to document.createElement("canvas"), and a worker has no
 * document: "Can't find variable: document". Handing it a canvas skips that guess. One fresh canvas per model:
 * a canvas whose WebGL context failed once cannot be reused for the CPU retry.
 */
export function taskCanvas(): { canvas?: OffscreenCanvas } {
  return inWorker() && typeof OffscreenCanvas !== 'undefined'
    ? { canvas: new OffscreenCanvas(1, 1) }
    : {};
}
