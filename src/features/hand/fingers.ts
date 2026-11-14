import {
  FINGER_JOINTS,
  FINGER_TIPS,
  INDEX_MCP,
  INDEX_TIP,
  MIDDLE_MCP,
  PINKY_MCP,
  THUMB_IP,
  THUMB_MCP,
  THUMB_TIP,
  WRIST,
} from './landmarks';
import type { HandFrame } from './types';
import { HandMotion } from './dynamic/motion';
import type { Handedness } from '../../core/tracking/handTracker';

export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export type FingerName = (typeof FINGER_NAMES)[number];

export const FINGER_OPEN = 0;
export const FINGER_HALF = 1;
export const FINGER_CLOSED = 2;
export const FINGER_STATE_NAMES = ['open', 'half', 'closed'] as const;

const DEG = 180 / Math.PI;
const PALM_POINTS = [WRIST, INDEX_MCP, MIDDLE_MCP, 13, PINKY_MCP] as const;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function dist3(p: Float32Array, a: number, b: number): number {
  return Math.hypot(
    p[a * 3]! - p[b * 3]!,
    p[a * 3 + 1]! - p[b * 3 + 1]!,
    p[a * 3 + 2]! - p[b * 3 + 2]!,
  );
}

/** Angle at joint b between the segments b->a and b->c, in degrees. 180 = straight. */
function angleAt(p: Float32Array, a: number, b: number, c: number): number {
  const ux = p[a * 3]! - p[b * 3]!;
  const uy = p[a * 3 + 1]! - p[b * 3 + 1]!;
  const uz = p[a * 3 + 2]! - p[b * 3 + 2]!;
  const vx = p[c * 3]! - p[b * 3]!;
  const vy = p[c * 3 + 1]! - p[b * 3 + 1]!;
  const vz = p[c * 3 + 2]! - p[b * 3 + 2]!;
  const denom = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz);
  if (denom === 0) return 180;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / denom))) * DEG;
}

/** Angle in degrees between the vectors a1->a2 and b1->b2. */
function vectorAngle(p: Float32Array, a1: number, a2: number, b1: number, b2: number): number {
  const ux = p[a2 * 3]! - p[a1 * 3]!;
  const uy = p[a2 * 3 + 1]! - p[a1 * 3 + 1]!;
  const uz = p[a2 * 3 + 2]! - p[a1 * 3 + 2]!;
  const vx = p[b2 * 3]! - p[b1 * 3]!;
  const vy = p[b2 * 3 + 1]! - p[b1 * 3 + 1]!;
  const vz = p[b2 * 3 + 2]! - p[b1 * 3 + 2]!;
  const d = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz);
  return d === 0
    ? 0
    : Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / d))) * DEG;
}

/** Cosine of the angle between a->b and screen "up" (world y points down, so up = -y). */
function upness(p: Float32Array, a: number, b: number): number {
  const len = dist3(p, a, b);
  return len === 0 ? 0 : -(p[b * 3 + 1]! - p[a * 3 + 1]!) / len;
}

/**
 * Curl of the four long fingers from three joint flexions (knuckle, middle, tip joint), measured
 * in world space so it does not depend on how far the hand is from the camera or on its rotation.
 * Straight finger: all three angles near 180 (sum of flexions ~ 0). Fist: ~ 250 degrees.
 */
export const FLEX_STRAIGHT = 30;
export const FLEX_FIST = 240;

function longFingerCurl(w: Float32Array, finger: number): number {
  const [mcp, pip, dip, tip] = FINGER_JOINTS[finger]!;
  const flex =
    180 -
    angleAt(w, WRIST, mcp, pip) +
    (180 - angleAt(w, mcp, pip, dip)) +
    (180 - angleAt(w, pip, dip, tip));
  return clamp01((flex - FLEX_STRAIGHT) / (FLEX_FIST - FLEX_STRAIGHT));
}

/**
 * The thumb folds sideways across the palm instead of curling like the other fingers, so joint
 * angles alone miss it. Main signal: how far the tip is from the index knuckle relative to palm
 * width (far = out to the side, near = tucked). Secondary: bend at the thumb's last joint.
 */
export const THUMB_SPREAD_CLOSED = 0.5;
export const THUMB_SPREAD_OPEN = 1.0;

function thumbCurl(w: Float32Array, palmSize: number): number {
  const spread = dist3(w, THUMB_TIP, INDEX_MCP) / palmSize;
  const bySpread =
    1 - clamp01((spread - THUMB_SPREAD_CLOSED) / (THUMB_SPREAD_OPEN - THUMB_SPREAD_CLOSED));
  const byBend = clamp01((180 - angleAt(w, THUMB_MCP, THUMB_IP, THUMB_TIP)) / 70);
  return 0.7 * bySpread + 0.3 * byBend;
}

/** Hysteresis thresholds: a state only changes after crossing the far side, which stops flicker. */
const OPEN_ENTER = 0.3;
const OPEN_EXIT = 0.4;
const CLOSED_ENTER = 0.6;
const CLOSED_EXIT = 0.5;

export function nextFingerState(prev: number, curl: number): number {
  if (prev === FINGER_OPEN)
    return curl > OPEN_EXIT ? (curl > CLOSED_ENTER ? FINGER_CLOSED : FINGER_HALF) : FINGER_OPEN;
  if (prev === FINGER_CLOSED)
    return curl < CLOSED_EXIT ? (curl < OPEN_ENTER ? FINGER_OPEN : FINGER_HALF) : FINGER_CLOSED;
  if (curl < OPEN_ENTER) return FINGER_OPEN;
  if (curl > CLOSED_ENTER) return FINGER_CLOSED;
  return FINGER_HALF;
}

/** Fills curl[5] from world landmarks. Exported for tests and for threshold calibration. */
export function computeCurl(world: Float32Array, out: Float32Array): number {
  const palmSize = dist3(world, INDEX_MCP, PINKY_MCP) || 1e-6;
  out[0] = thumbCurl(world, palmSize);
  for (let f = 1; f < 5; f++) out[f] = longFingerCurl(world, f);
  return palmSize;
}

interface PerHand {
  frame: HandFrame;
  prevTips: Float32Array;
  prevT: number;
  hasPrev: boolean;
  fresh: boolean;
}

/**
 * Turns a tracked hand's smoothed landmarks into a HandFrame: finger curl, open/half/closed state
 * (with hysteresis), fingertip speed and a few shared metrics. One reused HandFrame per hand ID,
 * so nothing is allocated per frame.
 */
export class FingerAnalyzer {
  private readonly hands = new Map<number, PerHand>();
  /** Frame width / height. Needed to turn normalised x into the same units as y. */
  aspect = 4 / 3;

  analyze(
    handId: number,
    hand: Handedness,
    score: number,
    landmarks: Float32Array,
    world: Float32Array,
    tMs: number,
  ): HandFrame {
    let h = this.hands.get(handId);
    if (!h) {
      h = {
        frame: {
          handId,
          hand,
          t: tMs,
          score,
          landmarks,
          world,
          curl: new Float32Array(5),
          state: new Uint8Array(5),
          tipSpeed: new Float32Array(5),
          metrics: {
            palmSize: 0,
            thumbUp: 0,
            indexUp: 0,
            pinch: 0,
            indexMiddleSpread: 0,
            thumbIndexAngle: 0,
            palmX: 0,
            palmY: 0,
            palmLen: 1e-6,
            tipX: 0,
            tipY: 0,
            thumbX: 0,
            thumbY: 0,
            cornerX: 0,
            cornerY: 0,
            indexDirX: 0,
            indexDirY: -1,
          },
          motion: new HandMotion(),
        },
        prevTips: new Float32Array(10),
        prevT: tMs,
        hasPrev: false,
        fresh: true,
      };
      this.hands.set(handId, h);
    }
    const f = h.frame;
    f.hand = hand;
    f.t = tMs;
    f.score = score;
    f.landmarks = landmarks;
    f.world = world;

    const palmSize = computeCurl(world, f.curl);
    for (let i = 0; i < 5; i++)
      f.state[i] = h.fresh
        ? nextFingerState(FINGER_HALF, f.curl[i]!)
        : nextFingerState(f.state[i]!, f.curl[i]!);
    h.fresh = false;

    const m = f.metrics;
    m.palmSize = palmSize;
    m.thumbUp = upness(world, THUMB_MCP, THUMB_TIP);
    m.indexUp = upness(world, INDEX_MCP, INDEX_TIP);
    m.pinch = dist3(world, THUMB_TIP, INDEX_TIP) / palmSize;
    m.indexMiddleSpread = dist3(world, INDEX_TIP, FINGER_TIPS[2]) / palmSize;

    // Tip speed in image space, in palm lengths (wrist to middle knuckle) per second.
    const palmImg =
      Math.hypot(
        landmarks[MIDDLE_MCP * 3]! - landmarks[WRIST * 3]!,
        landmarks[MIDDLE_MCP * 3 + 1]! - landmarks[WRIST * 3 + 1]!,
      ) || 1e-6;
    const dt = (tMs - h.prevT) / 1000;
    for (let i = 0; i < 5; i++) {
      const tip = FINGER_TIPS[i]!;
      const x = landmarks[tip * 3]!;
      const y = landmarks[tip * 3 + 1]!;
      f.tipSpeed[i] =
        h.hasPrev && dt > 0
          ? Math.hypot(x - h.prevTips[i * 2]!, y - h.prevTips[i * 2 + 1]!) / palmImg / dt
          : 0;
      h.prevTips[i * 2] = x;
      h.prevTips[i * 2 + 1] = y;
    }
    h.prevT = tMs;
    h.hasPrev = true;

    // Display-space positions (mirrored like the selfie view, unit = frame height), plus motion history.
    const a = this.aspect;
    const dx = (i: number) => (1 - landmarks[i * 3]!) * a;
    const dy = (i: number) => landmarks[i * 3 + 1]!;
    let px = 0;
    let py = 0;
    for (const i of PALM_POINTS) {
      px += dx(i);
      py += dy(i);
    }
    m.palmX = px / PALM_POINTS.length;
    m.palmY = py / PALM_POINTS.length;
    m.palmLen = Math.hypot(dx(MIDDLE_MCP) - dx(WRIST), dy(MIDDLE_MCP) - dy(WRIST)) || 1e-6;
    m.tipX = dx(INDEX_TIP);
    m.tipY = dy(INDEX_TIP);
    m.thumbX = dx(THUMB_TIP);
    m.thumbY = dy(THUMB_TIP);
    m.cornerX = dx(INDEX_MCP);
    m.cornerY = dy(INDEX_MCP);
    const ix = m.tipX - m.cornerX;
    const iy = m.tipY - m.cornerY;
    const il = Math.hypot(ix, iy) || 1;
    m.indexDirX = ix / il;
    m.indexDirY = iy / il;
    m.thumbIndexAngle = vectorAngle(world, THUMB_MCP, THUMB_TIP, INDEX_MCP, INDEX_TIP);
    const open = 1 - (f.curl[1]! + f.curl[2]! + f.curl[3]! + f.curl[4]!) / 4;
    h.frame.motion.push(tMs, m.palmX, m.palmY, m.tipX, m.tipY, open, m.palmLen);
    return f;
  }

  release(handId: number): void {
    this.hands.delete(handId);
  }
}
