import { chooseThread } from './capabilities';

/**
 * Must match MODELS_CACHE in public/sw.js: the service worker serves models from this cache, so a file
 * stored here by the page is a cache hit for the worker (and for every later visit).
 */
const MODELS_CACHE = 'senselab-models-v1';
const FILES = ['face_landmarker.task', 'wasm/vision_wasm_module_internal.wasm'];

let pending: Promise<void> | null = null;

async function prefetchOne(url: string): Promise<void> {
  try {
    if ('caches' in window) {
      const cache = await caches.open(MODELS_CACHE);
      if (!(await cache.match(url))) await cache.add(url);
    } else {
      await (await fetch(url)).arrayBuffer(); // no Cache Storage here: at least warm the HTTP cache
    }
  } catch {
    /* offline or blocked: the worker fetches it when it needs it */
  }
}

/**
 * Starts downloading the two files the first face box waits for (the face model and MediaPipe's WASM, the
 * bulk of the first-visit wait) once the user has ticked the consent box. They are about to press Start, and
 * these seconds of reading would otherwise be idle network time.
 *
 * Same-origin static files only, and no camera is touched, so this stays inside the privacy rules.
 * Hand and recognition models are not prefetched: they load on first use.
 */
export function prefetchFaceStack(): void {
  if (pending || chooseThread() !== 'worker') return;
  const base = `${location.origin}${import.meta.env.BASE_URL}models`;
  pending = Promise.all(FILES.map((f) => prefetchOne(`${base}/${f}`))).then(() => undefined);
}

/**
 * Resolves when the prefetch (if one started) has finished or failed. The pipeline waits for it before asking
 * the worker for the models: otherwise the worker would start a second download of a file that is still
 * arriving. It is the same bytes the worker would download anyway, so waiting is never slower.
 */
export const prefetchSettled = (): Promise<void> => pending ?? Promise.resolve();
