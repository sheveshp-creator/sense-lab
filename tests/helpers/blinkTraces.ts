import { rng } from './scenes';

/** One synthetic blink: closure rises to `peak` in 60 ms, holds, then falls over 110 ms. */
export function blinkCurve(t: number, start: number, holdMs = 30, peak = 0.9): number {
  const rise = 60;
  const fall = 110;
  const x = t - start;
  if (x < 0) return 0;
  if (x < rise) return (peak * x) / rise;
  if (x < rise + holdMs) return peak;
  if (x < rise + holdMs + fall) return (peak * (rise + holdMs + fall - x)) / fall;
  return 0;
}

export interface Sample {
  t: number;
  closure: number;
}

/**
 * Samples a closure signal at `fps` with deterministic timestamp jitter and noise, like a camera that
 * is not perfectly regular. `fn(t)` gives the noiseless value at time t (ms).
 */
export function sampleTrace(
  fn: (t: number) => number,
  durationMs: number,
  fps = 30,
  noise = 0.02,
  seed = 3,
): Sample[] {
  const r = rng(seed);
  const out: Sample[] = [];
  for (let i = 0; (i * 1000) / fps < durationMs; i++) {
    const t = Math.round((i * 1000) / fps + 3 * r()); // +-3 ms jitter
    out.push({ t, closure: Math.min(1, Math.max(0, fn(t) + noise * r())) });
  }
  return out;
}

/** Sum of blink curves at the given start times. */
export const blinks = (starts: number[], holdMs?: number, peak?: number) => (t: number) =>
  Math.max(0, ...starts.map((s) => blinkCurve(t, s, holdMs, peak)));
