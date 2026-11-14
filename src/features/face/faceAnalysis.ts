import type { FaceTrack } from '../../core/tracking/faceTracker';
import { BS } from './blendshapes';
import { EarClosure, eyeAspectRatio } from './eyes/ear';
import { BlinkDetector } from './eyes/blink';
import { GazeCalibration } from './eyes/calibration';
import { GazeTracker } from './eyes/gaze';
import { EXPRESSIONS, ExpressionSmoother, RuleBasedClassifier } from './expression';
import type { Expression, ExpressionClassifier } from './expression';

/** ~10 s of history at 30 results per second, for the charts. */
export const HISTORY = 320;

/** All-zero blendshape results in a row before the landmark fallback is used. */
const NO_BLENDSHAPES_FRAMES = 15;

export type FaceEvent =
  | { type: 'blink'; trackId: number; count: number; t: number; durationMs: number }
  | { type: 'expression'; trackId: number; from: Expression; to: Expression; t: number };

/** Everything measured about one tracked face. Read by the overlay and the Face Lab panels. */
export interface FaceState {
  trackId: number;
  expression: ExpressionSmoother;
  blink: BlinkDetector;
  gaze: GazeTracker;
  /** Eye closure now (0 open .. 1 shut), and which signal produced it. */
  closure: number;
  signal: 'blendshape' | 'landmarks';
  /** Rolling history: time, closure and gaze (degrees), newest at `head - 1`. */
  history: {
    t: Float64Array;
    closure: Float32Array;
    gazeX: Float32Array;
    gazeY: Float32Array;
    head: number;
    size: number;
  };
  /** Times of counted blinks, to mark them on the chart. */
  blinkTimes: number[];
  /** @internal */
  raw: Float32Array;
  /** @internal */
  ear: EarClosure;
  /** @internal Consecutive results in which every blendshape score was exactly 0. */
  zeroFrames: number;
}

/**
 * Per-face analysis on the main thread, run once per face result: expression (classifier + smoother),
 * blinks, gaze. Cheap (a few hundred multiplications per face), so it needs no worker.
 */
export class FaceAnalysis {
  readonly states = new Map<number, FaceState>();
  /** The largest visible face: what Face Lab shows. */
  primaryId: number | null = null;
  readonly calibration = new GazeCalibration();

  constructor(private readonly classifier: ExpressionClassifier = new RuleBasedClassifier()) {}

  get primary(): FaceState | null {
    return this.primaryId === null ? null : (this.states.get(this.primaryId) ?? null);
  }

  update(tracks: readonly FaceTrack[], aspect: number, nowMs: number): FaceEvent[] {
    const events: FaceEvent[] = [];
    const alive = new Set<number>();
    let primary: FaceTrack | null = null;
    for (const t of tracks) {
      alive.add(t.id);
      if (!t.visible) continue;
      if (!primary || t.box.w * t.box.h > primary.box.w * primary.box.h) primary = t;
      const s = this.stateFor(t.id);

      // Expression: classifier -> 5-frame average -> label that must hold for a few frames.
      this.classifier.classify(t.blendshapes, s.raw);
      const before = s.expression.label;
      if (s.expression.update(s.raw, nowMs)) {
        events.push({
          type: 'expression',
          trackId: t.id,
          from: before,
          to: s.expression.label,
          t: nowMs,
        });
      }

      // Blink signal: min(left, right) blendshape (a wink is not a blink). A real face never scores exactly
      // 0 on all 52 blendshapes, so only a sustained run of all-zero results (about half a second) means
      // "no blendshapes": then the landmark eye-aspect-ratio takes over. One odd frame must not flip it.
      let sum = 0;
      for (let i = 0; i < t.blendshapes.length; i++) sum += t.blendshapes[i]!;
      s.zeroFrames = sum > 0 ? 0 : s.zeroFrames + 1;
      if (s.zeroFrames < NO_BLENDSHAPES_FRAMES) {
        s.signal = 'blendshape';
        s.closure = Math.min(t.blendshapes[BS.eyeBlinkLeft]!, t.blendshapes[BS.eyeBlinkRight]!);
      } else {
        s.signal = 'landmarks';
        s.closure = s.ear.update(eyeAspectRatio(t.landmarks, aspect));
      }
      const blink = s.blink.update(s.closure, nowMs);
      if (blink) {
        s.blinkTimes.push(blink.t);
        if (s.blinkTimes.length > 200) s.blinkTimes.shift();
        events.push({
          type: 'blink',
          trackId: t.id,
          count: s.blink.count,
          t: blink.t,
          durationMs: blink.durationMs,
        });
      }

      s.gaze.update(t.landmarks, aspect, t.pose, s.closure);

      const h = s.history;
      h.t[h.head] = nowMs;
      h.closure[h.head] = s.closure;
      h.gazeX[h.head] = s.gaze.x;
      h.gazeY[h.head] = s.gaze.y;
      h.head = (h.head + 1) % HISTORY;
      h.size = Math.min(h.size + 1, HISTORY);
    }
    this.primaryId = primary?.id ?? null;
    for (const id of this.states.keys()) if (!alive.has(id)) this.states.delete(id);
    return events;
  }

  clear(): void {
    this.states.clear();
    this.primaryId = null;
  }

  private stateFor(id: number): FaceState {
    let s = this.states.get(id);
    if (!s) {
      s = {
        trackId: id,
        expression: new ExpressionSmoother(),
        blink: new BlinkDetector(),
        gaze: new GazeTracker(),
        closure: 0,
        signal: 'blendshape',
        history: {
          t: new Float64Array(HISTORY),
          closure: new Float32Array(HISTORY),
          gazeX: new Float32Array(HISTORY),
          gazeY: new Float32Array(HISTORY),
          head: 0,
          size: 0,
        },
        blinkTimes: [],
        raw: new Float32Array(EXPRESSIONS.length),
        ear: new EarClosure(),
        zeroFrames: 0,
      };
      this.states.set(id, s);
    }
    return s;
  }
}

/**
 * Copies the last `windowMs` of one face's history, oldest first, as plain arrays for drawing
 * (called by the UI a few times per second, not per frame).
 */
export function readHistory(s: FaceState, nowMs: number, windowMs = 10_000) {
  const { t, closure, gazeX, gazeY, head, size } = s.history;
  const out = {
    t: [] as number[],
    closure: [] as number[],
    gazeX: [] as number[],
    gazeY: [] as number[],
  };
  for (let k = size - 1; k >= 0; k--) {
    const i = (head - 1 - k + HISTORY) % HISTORY;
    if (nowMs - t[i]! > windowMs) continue;
    out.t.push(t[i]!);
    out.closure.push(closure[i]!);
    out.gazeX.push(gazeX[i]!);
    out.gazeY.push(gazeY[i]!);
  }
  return out;
}
