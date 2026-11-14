import { HAND_LANDMARK_COUNT } from '../../src/features/hand/handFormat';
import { makeHand, POSES, shiftHand } from './makeHand';
import type { HandSpec } from './makeHand';

/** Camera frame width / height used by the app and the replay tests. */
export const ASPECT = 4 / 3;
export const FRAME_MS = 33;

export interface Frame {
  t: number;
  hands: Float32Array[];
}

/** Palm centre (mean of wrist and the four knuckles) in raw image coordinates. */
const palmRaw = (h: Float32Array): [number, number] => {
  let x = 0;
  let y = 0;
  for (const i of [0, 5, 9, 13, 17]) {
    x += h[i * 3]!;
    y += h[i * 3 + 1]!;
  }
  return [x / 5, y / 5];
};

/**
 * A hand whose palm centre sits at DISPLAY position (xd, yd): what the user sees on the mirrored
 * screen, with y in frame heights and x running 0..ASPECT. Scenario code thinks in display space,
 * so "moves right" means right on screen, whatever the camera does underneath.
 */
export function handAt(spec: HandSpec, xd: number, yd: number): Float32Array {
  const h = makeHand({ ...spec, cx: 0, cy: 0 });
  const [px, py] = palmRaw(h);
  return shiftHand(h, 1 - xd / ASPECT - px, yd - py);
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/** The hand holds still for n frames. */
export function still(spec: HandSpec, at: [number, number], n: number, t0: number): Frame[] {
  return Array.from({ length: n }, (_, i) => ({
    t: t0 + i * FRAME_MS,
    hands: [handAt(spec, at[0], at[1])],
  }));
}

/** The hand moves from one display position to another over n frames (eased, like a real arm). */
export function move(
  spec: HandSpec,
  from: [number, number],
  to: [number, number],
  n: number,
  t0: number,
): Frame[] {
  return Array.from({ length: n }, (_, i) => {
    const u = smooth((i + 1) / n);
    return {
      t: t0 + i * FRAME_MS,
      hands: [handAt(spec, from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u)],
    };
  });
}

/** Two hands (left and right on screen) following position functions, one frame per index. */
export function pair(
  a: HandSpec,
  b: HandSpec,
  pos: (i: number) => [[number, number], [number, number]],
  n: number,
  t0 = 0,
): Frame[] {
  return Array.from({ length: n }, (_, i) => {
    const [pa, pb] = pos(i);
    return { t: t0 + i * FRAME_MS, hands: [handAt(a, pa[0], pa[1]), handAt(b, pb[0], pb[1])] };
  });
}

/** Concatenate segments in time: each segment starts one frame after the previous one ends. */
export function seq(...segs: ((t0: number) => Frame[])[]): Frame[] {
  const out: Frame[] = [];
  let t = 0;
  for (const seg of segs) {
    const frames = seg(t);
    out.push(...frames);
    t = (frames.at(-1)?.t ?? t) + FRAME_MS;
  }
  return out;
}

/** Deterministic noise in [-1, 1] so fixtures are reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 2 ** 32) * 2 - 1;
  };
}

/** Frames -> the JSON layout the dev record button saves. */
export function toFixture(note: string, frames: Frame[]) {
  return {
    kind: 'hands',
    version: 1,
    note,
    frames: frames.map((f) => ({
      t: f.t,
      hands: f.hands.map((h) => Array.from(h, (v) => Math.round(v * 1e6) / 1e6)),
    })),
  };
}

export { HAND_LANDMARK_COUNT, POSES };
