import type { ModelName } from './worker/protocol';

/** What each model is called in sentences shown to people. */
export const MODEL_LABEL: Record<ModelName, string> = {
  face: 'face tracking',
  hand: 'hand tracking',
  gesture: 'gesture cross-check',
  identity: 'face recognition',
};

/** What still works when that model is missing, so a failure never sounds like the whole app is broken. */
const STILL_WORKS: Record<ModelName, string> = {
  face: 'Hands and the playground demos that only need hands still work.',
  hand: 'Face tracking still works.',
  gesture: 'Hand tracking still works; gesture names may be a little less sure.',
  identity: 'Faces are still tracked, but they will not get names.',
};

/**
 * Turns the raw reason a model failed to load into one sentence a person can act on, plus what still works.
 * The raw text stays available for the details line; this never hides it, it just leads with the cause.
 */
export function friendlyModelError(model: ModelName, raw: string): { title: string; hint: string } {
  const name = MODEL_LABEL[model];
  const text = raw.toLowerCase();
  let hint: string;
  if (
    /404|not found|missing|no such file|failed to fetch|networkerror|load failed|network/.test(text)
  ) {
    hint = 'The model file could not be downloaded. Check your connection, then try again.';
  } else if (/webgl|gl context|gpu|texture/.test(text)) {
    hint =
      'This device could not start its graphics acceleration for the model. Try again, or reload the page.';
  } else if (/memory|allocation|out of/.test(text)) {
    hint = 'The device ran out of memory loading the model. Close other tabs and try again.';
  } else {
    hint = 'Something went wrong while loading it. Try again, or reload the page.';
  }
  return { title: `Could not load ${name}.`, hint: `${hint} ${STILL_WORKS[model]}` };
}

/** One sentence for "tracking stopped working while the camera is fine". */
export function friendlyRuntimeError(raw: string): string {
  return `Tracking stopped working (${raw.slice(0, 120)}). Reload the page to start it again.`;
}
