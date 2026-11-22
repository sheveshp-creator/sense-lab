import type { ThreadMode } from './worker/transport';

/** What this browser can do, probed once. Used to pick the simplest path that works (Safari / iOS in particular). */
export interface Capabilities {
  secureContext: boolean;
  getUserMedia: boolean;
  webAssembly: boolean;
  /** `new Worker(url, { type: 'module' })`. Safari before 15 lacks it. */
  moduleWorker: boolean;
  createImageBitmap: boolean;
  /** requestVideoFrameCallback: without it the frame loop uses requestAnimationFrame (works, may repeat a frame). */
  videoFrameCallback: boolean;
  webgl2: boolean;
  /**
   * A WebGL 2 context on an OffscreenCanvas. The worker path needs it: MediaPipe's GPU delegate draws on an
   * OffscreenCanvas inside the worker. Without it the models run on the page instead.
   */
  offscreenWebgl2: boolean;
  /** WebGPU: only speeds up face recognition; everything works without it. */
  webgpu: boolean;
  serviceWorker: boolean;
}

/** Does this browser read the `type` option of Worker? Only browsers with module-worker support do. */
function supportsModuleWorker(): boolean {
  if (typeof Worker === 'undefined') return false;
  let read = false;
  try {
    const w = new Worker(`${import.meta.env.BASE_URL}worker-probe.js`, {
      get type() {
        read = true;
        return 'module' as const;
      },
    });
    w.terminate();
  } catch {
    return false;
  }
  return read;
}

function supportsOffscreenWebgl2(): boolean {
  try {
    return (
      typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2')
    );
  } catch {
    return false;
  }
}

function supportsWebgl2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export function detectCapabilities(): Capabilities {
  return {
    secureContext: window.isSecureContext,
    getUserMedia: !!navigator.mediaDevices?.getUserMedia,
    webAssembly: typeof WebAssembly === 'object',
    moduleWorker: supportsModuleWorker(),
    createImageBitmap: typeof createImageBitmap === 'function',
    videoFrameCallback: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
    webgl2: supportsWebgl2(),
    offscreenWebgl2: supportsOffscreenWebgl2(),
    webgpu: 'gpu' in navigator,
    serviceWorker: 'serviceWorker' in navigator,
  };
}

/** Things that stop the app completely, in plain words. Empty when the app can run. */
export function blockers(c: Capabilities): string[] {
  const out: string[] = [];
  if (!c.secureContext)
    out.push('The camera needs a secure page (https:// or localhost). Open the HTTPS address.');
  else if (!c.getUserMedia)
    out.push('This browser cannot open a camera. Try a current Safari, Chrome, Edge or Firefox.');
  if (!c.webAssembly) out.push('This browser has no WebAssembly, which the models need.');
  if (!c.createImageBitmap)
    out.push('This browser is too old to pass camera frames to the models.');
  return out;
}

/** Things that work in a simpler or slower way here. Shown as information, not as errors. */
export function degradations(c: Capabilities, thread: ThreadMode): string[] {
  const out: string[] = [];
  if (thread === 'main')
    out.push(
      'Models run on the page itself (no Web Worker path here), so the page may feel less smooth.',
    );
  if (!c.webgl2) out.push('No WebGL 2: the models use the CPU, which is slower.');
  if (!c.webgpu) out.push('No WebGPU: face recognition uses the WASM path (a little slower).');
  if (!c.videoFrameCallback)
    out.push('Frames are timed with the display refresh instead of the camera.');
  return out;
}

/**
 * Where inference should run. Worker unless the browser cannot, or the URL says otherwise (?thread=main or
 * ?thread=worker). The URL override is for testing the fallback on a browser that does support workers.
 */
export function chooseThread(
  caps: Capabilities = detectCapabilities(),
  search: string = location.search,
): ThreadMode {
  const forced = new URLSearchParams(search).get('thread');
  if (forced === 'main' || forced === 'worker') return forced;
  return caps.moduleWorker && caps.offscreenWebgl2 ? 'worker' : 'main';
}

/**
 * Did a model fail to load in the worker because of the worker environment itself (a missing browser API, as on
 * iPhone and iPad browsers), rather than a download problem? Only then is it worth trying the main thread once:
 * a missing file would fail there too.
 */
export function isWorkerEnvironmentError(message: string): boolean {
  if (/404|failed to fetch|network|status/i.test(message)) return false;
  return /document|canvas|offscreen|webgl|gl context|importScripts|not defined|can't find variable|is not a function|undefined/i.test(
    message,
  );
}
