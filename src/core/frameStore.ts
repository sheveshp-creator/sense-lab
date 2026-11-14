import { createStore } from 'zustand/vanilla';
import type { FaceTrack } from './tracking/faceTracker';
import type { FaceAnalysis } from '../features/face/faceAnalysis';
import { headAnglesDisplay } from '../features/face/eyes/gaze';
import { LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER } from '../features/face/landmarks';
import type { Expression } from '../features/face/expression';
import type { HandPipeline } from '../features/hand/handPipeline';
import type { GestureId } from '../features/hand/types';

/**
 * The read-only view of what the camera sees RIGHT NOW, for the playground demos. Demos get their live data
 * only from here and their discrete events only from the event bus (events/bus.ts): they never touch a model,
 * the worker or the pipeline. Everything is in the on-screen (mirrored) convention the user watches.
 *
 * The arrays and objects are reused every frame (no per-frame allocation): read them inside your own
 * requestAnimationFrame loop with frameStore.getState(), do not keep them across frames and do not store them
 * in React state.
 */
export interface LiveFace {
  id: number;
  /** Face centre across the screen, 0 = left edge, 1 = right edge. */
  cx: number;
  cy: number;
  /** The 52 MediaPipe blendshape scores, 0..1 (see features/face/blendshapes.ts for the names). */
  blendshapes: Float32Array;
  /** Head angles in degrees: +yaw = turned toward screen right, +pitch = chin down, +roll = clockwise on screen. */
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Smoothed expression label and the five scores in EXPRESSIONS order (happy sad angry surprised neutral). */
  expression: Expression;
  scores: Float32Array;
  blinks: number;
  eyesClosed: boolean;
}

export interface LiveHand {
  id: number;
  hand: 'Left' | 'Right';
  /** The one pose shown for this hand (thumbsUp, openPalm, peace ...), or null. */
  gesture: GestureId | null;
  /** Palm centre, in frame heights from the left of the screen (x runs 0..aspect) and from the top (y 0..1). */
  palmX: number;
  palmY: number;
  /** Set while pinching: the pinch point in the same units. */
  pinch: { x: number; y: number; dragging: boolean } | null;
}

export interface LiveTwoHand {
  /** Both hands are open and held: zoom and rotate are being measured. */
  engaged: boolean;
  /** Distance between the hands relative to when they engaged (1 = unchanged). */
  scale: number;
  /** Turn of the line between the hands since they engaged, degrees, counter-clockwise on screen positive. */
  deg: number;
}

export interface FrameState {
  /** performance.now() of the latest published frame. */
  t: number;
  /** Camera frame width / height. Divide x by this to get 0..1 across the screen. */
  aspect: number;
  /** True while the camera pipeline is running. */
  running: boolean;
  faces: readonly LiveFace[];
  hands: readonly LiveHand[];
  twoHand: LiveTwoHand;
  /** When set, publishFrame leaves faces / hands / twoHand alone (see simulate()). */
  simulated: boolean;
}

const facePool = new Map<number, LiveFace>();
const handPool = new Map<number, LiveHand>();
const facesNow: LiveFace[] = [];
const handsNow: LiveHand[] = [];
const twoHandNow: LiveTwoHand = { engaged: false, scale: 1, deg: 0 };

export const frameStore = createStore<FrameState>()(() => ({
  t: 0,
  aspect: 4 / 3,
  running: false,
  faces: facesNow,
  hands: handsNow,
  twoHand: twoHandNow,
  simulated: false,
}));

/** Roll from the line between the eyes, clockwise positive on the mirrored screen (mirroring flips the turn). */
export function rollDegDisplay(lm: ArrayLike<number>, aspect: number): number {
  const ax = lm[LEFT_IRIS_CENTER * 3]! * aspect;
  const ay = lm[LEFT_IRIS_CENTER * 3 + 1]!;
  const bx = lm[RIGHT_IRIS_CENTER * 3]! * aspect;
  const by = lm[RIGHT_IRIS_CENTER * 3 + 1]!;
  const [lx, ly, rx, ry] = ax <= bx ? [ax, ay, bx, by] : [bx, by, ax, ay]; // image-left eye first
  // Raw image: right eye lower than the left eye = clockwise tilt. The mirrored screen shows the opposite.
  return -(Math.atan2(ry - ly, rx - lx) * 180) / Math.PI;
}

/** Called by the pipeline after every result. Copies the latest data into the pooled views. */
export function publishFrame(src: {
  tracks: readonly FaceTrack[];
  analysis: FaceAnalysis;
  hands: HandPipeline;
  aspect: number;
  t: number;
}): void {
  if (frameStore.getState().simulated) return;
  facesNow.length = 0;
  for (const tr of src.tracks) {
    if (!tr.visible) continue;
    const st = src.analysis.states.get(tr.id);
    if (!st) continue;
    let f = facePool.get(tr.id);
    if (!f) {
      f = {
        id: tr.id,
        cx: 0,
        cy: 0,
        blendshapes: tr.blendshapes,
        yawDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        expression: 'neutral',
        scores: new Float32Array(5),
        blinks: 0,
        eyesClosed: false,
      };
      facePool.set(tr.id, f);
    }
    const head = headAnglesDisplay(tr.pose);
    f.blendshapes = tr.blendshapes;
    f.cx = 1 - (tr.box.x + tr.box.w / 2);
    f.cy = tr.box.y + tr.box.h / 2;
    f.yawDeg = head.yaw;
    f.pitchDeg = head.pitch;
    f.rollDeg = rollDegDisplay(tr.landmarks, src.aspect);
    f.expression = st.expression.label;
    f.scores.set(st.expression.scores);
    f.blinks = st.blink.count;
    f.eyesClosed = st.blink.closed;
    facesNow.push(f);
  }
  // Forget pooled views of faces that are gone, so IDs can be reused cleanly.
  if (facePool.size > 16)
    for (const id of facePool.keys()) if (!facesNow.some((x) => x.id === id)) facePool.delete(id);

  handsNow.length = 0;
  for (const v of src.hands.views) {
    let h = handPool.get(v.track.id);
    if (!h) {
      h = { id: v.track.id, hand: 'Right', gesture: null, palmX: 0, palmY: 0, pinch: null };
      handPool.set(v.track.id, h);
    }
    h.hand = v.track.handedness;
    h.gesture = v.gesture;
    h.palmX = v.frame.metrics.palmX;
    h.palmY = v.frame.metrics.palmY;
    if (v.pinch) {
      if (!h.pinch) h.pinch = { x: 0, y: 0, dragging: false };
      h.pinch.x = v.pinch.x;
      h.pinch.y = v.pinch.y;
      h.pinch.dragging = v.pinch.dragging;
    } else h.pinch = null;
    handsNow.push(h);
  }
  if (handPool.size > 16)
    for (const id of handPool.keys()) if (!handsNow.some((x) => x.id === id)) handPool.delete(id);

  const th = src.hands.twoHand;
  twoHandNow.engaged = th.engaged;
  twoHandNow.scale = th.scale;
  twoHandNow.deg = th.deg;
  frameStore.setState({ t: src.t, aspect: src.aspect });
}

/**
 * Replaces the live data with made-up data and stops the pipeline publishing over it. For tests of the
 * demos' own logic (the real-model paths are tested with a fake camera instead). Call with no argument to stop.
 */
export function simulate(parts?: {
  faces?: LiveFace[];
  hands?: LiveHand[];
  twoHand?: LiveTwoHand;
}): void {
  if (!parts) {
    frameStore.setState({
      simulated: false,
      faces: facesNow,
      hands: handsNow,
      twoHand: twoHandNow,
    });
    return;
  }
  frameStore.setState({
    simulated: true,
    faces: parts.faces ?? [],
    hands: parts.hands ?? [],
    twoHand: parts.twoHand ?? { engaged: false, scale: 1, deg: 0 },
    t: performance.now(),
  });
}

/** Pipeline stopped: nothing is in view any more. */
export function resetFrameStore(): void {
  facesNow.length = 0;
  handsNow.length = 0;
  facePool.clear();
  handPool.clear();
  twoHandNow.engaged = false;
  twoHandNow.scale = 1;
  twoHandNow.deg = 0;
  frameStore.setState({ running: false, t: performance.now() });
}
