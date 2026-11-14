import { GestureRecognizer, HandLandmarker } from '@mediapipe/tasks-vision';
import { visionFileset } from '../mediapipeFileset';
import {
  BUILTIN_LABELS,
  HAND_LANDMARK_COUNT,
  HAND_RIGHT_PROB,
  HAND_SCORE,
  HAND_STRIDE,
  HAND_WORLD_OFFSET,
  HINT_STRIDE,
  MAX_HANDS,
} from './handFormat';

export interface HandDetector {
  delegate: 'GPU' | 'CPU';
  detectHands(bitmap: ImageBitmap, timestampMs: number): { count: number; data: Float32Array };
}

export interface GestureHints {
  delegate: 'GPU' | 'CPU';
  /** Runs the (heavier) GestureRecognizer. Only its labels are used, as a cross-check. */
  recognize(bitmap: ImageBitmap, timestampMs: number): { count: number; data: Float32Array };
}

/** Each MediaPipe task needs strictly increasing timestamps of its own. */
class Clock {
  private last = -1;
  next(ms: number): number {
    this.last = Math.max(Math.round(ms), this.last + 1);
    return this.last;
  }
}

/** Tries the GPU delegate first; no WebGL in this context (some headless or old devices) means CPU. */
async function withDelegate<T>(
  create: (delegate: 'GPU' | 'CPU') => Promise<T>,
): Promise<{ task: T; delegate: 'GPU' | 'CPU' }> {
  try {
    return { task: await create('GPU'), delegate: 'GPU' };
  } catch {
    return { task: await create('CPU'), delegate: 'CPU' };
  }
}

const common = { runningMode: 'VIDEO' as const, numHands: MAX_HANDS };

// The two hand models are separate on purpose: the recognizer is the heavy one and only a cross-check,
// so it is loaded the first time a hand is actually in view.
export async function createHandDetector(
  wasmBaseUrl: string,
  handModelUrl: string,
): Promise<HandDetector> {
  const fileset = await visionFileset(wasmBaseUrl);
  const { task: landmarker, delegate } = await withDelegate((d) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: handModelUrl, delegate: d },
      ...common,
    }),
  );
  const handClock = new Clock();

  return {
    delegate,
    detectHands(bitmap, timestampMs) {
      const res = landmarker.detectForVideo(bitmap, handClock.next(timestampMs));
      const count = Math.min(res.landmarks.length, MAX_HANDS);
      const data = new Float32Array(count * HAND_STRIDE);
      for (let h = 0; h < count; h++) {
        const base = h * HAND_STRIDE;
        const lm = res.landmarks[h]!;
        const wl = res.worldLandmarks[h]!;
        for (let i = 0; i < HAND_LANDMARK_COUNT; i++) {
          const o = base + i * 3;
          data[o] = lm[i]!.x;
          data[o + 1] = lm[i]!.y;
          data[o + 2] = lm[i]!.z;
          const w = base + HAND_WORLD_OFFSET + i * 3;
          data[w] = wl[i]!.x;
          data[w + 1] = wl[i]!.y;
          data[w + 2] = wl[i]!.z;
        }
        const cat = res.handedness[h]?.[0];
        // MediaPipe assumes a mirrored (selfie) image. We feed the raw un-mirrored camera frame,
        // so its "Left" is the user's right hand: flip the label.
        const isRight = cat?.categoryName === 'Left';
        const score = cat?.score ?? 0;
        data[base + HAND_RIGHT_PROB] = isRight ? score : 1 - score;
        data[base + HAND_SCORE] = score;
      }
      return { count, data };
    },
  };
}

export async function createGestureRecognizer(
  wasmBaseUrl: string,
  gestureModelUrl: string,
): Promise<GestureHints> {
  const fileset = await visionFileset(wasmBaseUrl);
  const { task: recognizer, delegate } = await withDelegate((d) =>
    GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: gestureModelUrl, delegate: d },
      ...common,
    }),
  );
  const gestureClock = new Clock();
  return {
    delegate,
    recognize(bitmap, timestampMs) {
      const res = recognizer.recognizeForVideo(bitmap, gestureClock.next(timestampMs));
      const count = Math.min(res.landmarks.length, MAX_HANDS);
      const data = new Float32Array(count * HINT_STRIDE);
      for (let h = 0; h < count; h++) {
        const o = h * HINT_STRIDE;
        const g = res.gestures[h]?.[0];
        const idx = g ? (BUILTIN_LABELS as readonly string[]).indexOf(g.categoryName) : 0;
        data[o] = res.landmarks[h]![0]!.x;
        data[o + 1] = res.landmarks[h]![0]!.y;
        data[o + 2] = Math.max(idx, 0);
        data[o + 3] = g?.score ?? 0;
      }
      return { count, data };
    },
  };
}
