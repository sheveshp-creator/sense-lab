import {
  HAND_LANDMARK_COUNT,
  HAND_RIGHT_PROB,
  HAND_SCORE,
  HAND_STRIDE,
  HAND_WORLD_OFFSET,
} from '../../src/features/hand/handFormat';

/**
 * Parametric SYNTHETIC hand for tests, in metres, palm facing the camera, fingers up (y is down,
 * so up = -y; z negative = towards the camera, which is where fingers curl).
 * It is built from joint angles, so detector tests using it check logic, not real-world accuracy;
 * the real recorded fixtures (tests/fixtures/hand_*.json) cover that.
 */
export type ThumbPose = 'out' | 'tucked' | 'up' | 'down';

export interface HandSpec {
  /** Curl per long finger, 0 = straight .. 1 = fully curled: [index, middle, ring, pinky]. */
  curl: [number, number, number, number];
  thumb: ThumbPose;
  /** If set, the thumb tip is placed exactly on the index fingertip (OK sign). */
  thumbOnIndex?: boolean;
  /** Spread the index and middle fingers apart by this many degrees (V shape). */
  vAngleDeg?: number;
  /** Where the hand sits in the image (normalised). */
  cx?: number;
  cy?: number;
  rightProb?: number;
  /** Rotate the whole hand in the image plane (degrees, clockwise on screen). */
  rotateDeg?: number;
  /** Flip left-right, to make the other hand. */
  mirror?: boolean;
}

type V3 = [number, number, number];

// [x of knuckle, y of knuckle, segment lengths proximal/middle/distal]
const FINGERS: { x: number; y: number; seg: [number, number, number] }[] = [
  { x: -0.0375, y: -0.095, seg: [0.043, 0.025, 0.02] },
  { x: -0.0125, y: -0.1, seg: [0.047, 0.028, 0.022] },
  { x: 0.0125, y: -0.095, seg: [0.043, 0.026, 0.021] },
  { x: 0.0375, y: -0.085, seg: [0.033, 0.019, 0.018] },
];

const THUMBS: Record<ThumbPose, V3[]> = {
  // CMC, MCP, IP, TIP
  out: [
    [-0.025, -0.02, 0],
    [-0.055, -0.04, 0],
    [-0.078, -0.052, 0],
    [-0.097, -0.064, 0],
  ],
  tucked: [
    [-0.025, -0.02, 0],
    [-0.03, -0.05, -0.02],
    [-0.028, -0.068, -0.03],
    [-0.025, -0.08, -0.03],
  ],
  up: [
    [-0.03, -0.03, 0],
    [-0.065, -0.055, 0],
    [-0.08, -0.085, 0],
    [-0.09, -0.115, 0],
  ],
  down: [
    [-0.03, -0.03, 0],
    [-0.065, -0.005, 0],
    [-0.08, 0.025, 0],
    [-0.09, 0.055, 0],
  ],
};

/** Packs one hand into the handFormat layout (landmarks, world landmarks, handedness, score). */
export function makeHand(spec: HandSpec): Float32Array {
  const world: V3[] = new Array(HAND_LANDMARK_COUNT);
  world[0] = [0, 0, 0];
  const flex = [85, 100, 70].map((d) => (d * Math.PI) / 180);

  FINGERS.forEach((f, i) => {
    const c = spec.curl[i]!;
    // Spread index (and middle the other way) around the vertical axis for the V sign.
    const spread = i === 0 ? -(spec.vAngleDeg ?? 0) / 2 : i === 1 ? (spec.vAngleDeg ?? 0) / 2 : 0;
    const sp = (spread * Math.PI) / 180;
    let [x, y, z] = [f.x, f.y, 0];
    world[5 + i * 4] = [x, y, z];
    let theta = 0;
    for (let j = 0; j < 3; j++) {
      theta += flex[j]! * c;
      // Direction: up, tilted sideways by the V angle, curling towards the camera by theta.
      x += Math.sin(sp) * Math.cos(theta) * f.seg[j]!;
      y += -Math.cos(sp) * Math.cos(theta) * f.seg[j]!;
      z += -Math.sin(theta) * f.seg[j]!;
      world[5 + i * 4 + 1 + j] = [x, y, z];
    }
  });

  const thumb = THUMBS[spec.thumb].map((p) => [...p] as V3);
  if (spec.thumbOnIndex) {
    const tip = world[8]!;
    const cmc = thumb[0]!;
    thumb[3] = [...tip];
    thumb[1] = [cmc[0] + (tip[0] - cmc[0]) * 0.4, cmc[1] + (tip[1] - cmc[1]) * 0.4, tip[2] * 0.3];
    thumb[2] = [cmc[0] + (tip[0] - cmc[0]) * 0.75, cmc[1] + (tip[1] - cmc[1]) * 0.75, tip[2] * 0.7];
  }
  for (let j = 0; j < 4; j++) world[1 + j] = thumb[j]!;

  const out = new Float32Array(HAND_STRIDE);
  // Metres -> normalised image units. 1.8 makes the palm (wrist to middle knuckle) ~0.18 of the frame
  // height, a hand at a normal distance from a laptop camera.
  const scale = 1.8;
  const rot = ((spec.rotateDeg ?? 0) * Math.PI) / 180;
  const flip = spec.mirror ? -1 : 1;
  const cx = spec.cx ?? 0.5;
  const cy = spec.cy ?? 0.55;
  for (let i = 0; i < HAND_LANDMARK_COUNT; i++) {
    const [x0, y0, z] = world[i]!;
    const xm = x0 * flip;
    // Rotation in the image plane. y points down, so this is clockwise for positive angles.
    const x = xm * Math.cos(rot) - y0 * Math.sin(rot);
    const y = xm * Math.sin(rot) + y0 * Math.cos(rot);
    out.set([cx + x * scale, cy + y * scale, z * scale], i * 3);
    out.set([x, y, z], HAND_WORLD_OFFSET + i * 3);
  }
  out[HAND_RIGHT_PROB] = spec.rightProb ?? 0.9;
  out[HAND_SCORE] = 0.95;
  return out;
}

/** Moves a hand in the image by (dx, dy) normalised units. Mutates and returns it. */
export function shiftHand(h: Float32Array, dx: number, dy: number): Float32Array {
  for (let i = 0; i < HAND_LANDMARK_COUNT; i++) {
    h[i * 3]! += dx;
    h[i * 3 + 1]! += dy;
  }
  return h;
}

/** Overrides one landmark's image position (normalised). For shapes the pose model cannot make. */
export function setLandmark(h: Float32Array, index: number, x: number, y: number): Float32Array {
  h[index * 3] = x;
  h[index * 3 + 1] = y;
  return h;
}

/** Named poses used across the tests. */
export const POSES: Record<string, HandSpec> = {
  openPalm: { curl: [0, 0, 0, 0], thumb: 'out' },
  fist: { curl: [1, 1, 1, 1], thumb: 'tucked' },
  thumbsUp: { curl: [1, 1, 1, 1], thumb: 'up' },
  thumbsDown: { curl: [1, 1, 1, 1], thumb: 'down' },
  peace: { curl: [0, 0, 1, 1], thumb: 'tucked', vAngleDeg: 35 },
  pointingUp: { curl: [0, 1, 1, 1], thumb: 'tucked' },
  ok: { curl: [0.6, 0, 0, 0], thumb: 'out', thumbOnIndex: true },
  rock: { curl: [0, 1, 1, 0], thumb: 'tucked' },
  one: { curl: [0, 1, 1, 1], thumb: 'tucked' },
  two: { curl: [0, 0, 1, 1], thumb: 'tucked', vAngleDeg: 0 },
  three: { curl: [0, 0, 0, 1], thumb: 'tucked' },
  four: { curl: [0, 0, 0, 0], thumb: 'tucked' },
  five: { curl: [0, 0, 0, 0], thumb: 'out' },
};

/** `frames` identical frames of one pose at ~30 fps. */
export function holdPose(
  spec: HandSpec,
  frames: number,
  t0 = 0,
): { t: number; hands: Float32Array }[] {
  const hand = makeHand(spec);
  return Array.from({ length: frames }, (_, i) => ({ t: t0 + i * 33, hands: hand }));
}
