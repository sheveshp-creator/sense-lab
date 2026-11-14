import {
  HAND_LANDMARK_COUNT,
  HAND_LANDMARK_FLOATS,
  HAND_RIGHT_PROB,
  HAND_SCORE,
  HAND_STRIDE,
  HAND_WORLD_OFFSET,
} from '../../features/hand/handFormat';
import { OneEuroFilterArray } from './oneEuro';
import type { OneEuroParams } from './oneEuro';
import { boxFromLandmarks, matchBoxes } from './matching';
import type { Box } from './matching';

export type Handedness = 'Left' | 'Right';

export interface HandTrack {
  id: number;
  box: Box;
  /** Smoothed image-space landmarks (normalised x, y, z). Used for drawing and motion. */
  landmarks: Float32Array;
  /** Smoothed world landmarks (metres). Used for joint angles: independent of distance to camera. */
  world: Float32Array;
  /** The user's own hand, stabilised so it does not flicker between frames. */
  handedness: Handedness;
  /** Smoothed probability that this is the right hand. */
  rightProb: number;
  score: number;
  visible: boolean;
  lastSeenMs: number;
  hits: number;
  /** Latest GestureRecognizer label index (BUILTIN_LABELS) matched to this hand, cross-check only. */
  builtinLabel: number;
  builtinScore: number;
  builtinAtMs: number;
  /** @internal */
  filter: OneEuroFilterArray;
  /** @internal */
  worldFilter: OneEuroFilterArray;
}

export interface HandTrackerOptions {
  maxMissingMs: number;
  minIou: number;
  maxCentreDist: number;
  filterResetGapMs: number;
  /** EMA weight for the handedness probability (lower = steadier). */
  handednessAlpha: number;
  oneEuro?: Partial<OneEuroParams>;
}

const DEFAULTS: HandTrackerOptions = {
  maxMissingMs: 500,
  minIou: 0.1,
  maxCentreDist: 0.6,
  filterResetGapMs: 200,
  handednessAlpha: 0.15,
};

// Hands move much faster than faces, so the filter reacts earlier (higher minCutoff and beta).
const HAND_ONE_EURO: Partial<OneEuroParams> = { minCutoff: 1.5, beta: 6 };

/** Same idea as FaceTracker: stable IDs by IoU + distance, kept alive for 500 ms, One-Euro smoothed. */
export class HandTracker {
  private readonly opts: HandTrackerOptions;
  private tracks: HandTrack[] = [];
  private nextId = 1;
  private readonly detBoxes: Box[] = [];
  private readonly detTaken: number[] = [];

  constructor(opts: Partial<HandTrackerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  get alive(): readonly HandTrack[] {
    return this.tracks;
  }

  /** IDs of tracks removed by the last update(), so owners can free per-hand state. */
  readonly expired: number[] = [];

  update(hands: Float32Array, count: number, nowMs: number): readonly HandTrack[] {
    const { tracks, detBoxes, detTaken } = this;
    this.expired.length = 0;
    for (let d = 0; d < count; d++) {
      detBoxes[d] ??= { x: 0, y: 0, w: 0, h: 0 };
      boxFromLandmarks(hands, d * HAND_STRIDE, HAND_LANDMARK_COUNT, detBoxes[d]!);
    }
    matchBoxes(
      tracks.map((t) => t.box),
      detBoxes,
      count,
      this.opts,
      detTaken,
    );

    for (let d = 0; d < count; d++) {
      const ti = detTaken[d]!;
      if (ti >= 0) {
        this.apply(tracks[ti]!, hands, d * HAND_STRIDE, nowMs);
      } else {
        const track = this.create();
        this.apply(track, hands, d * HAND_STRIDE, nowMs);
        tracks.push(track);
      }
    }
    for (let t = tracks.length - 1; t >= 0; t--) {
      const tr = tracks[t]!;
      if (tr.lastSeenMs !== nowMs) {
        tr.visible = false;
        if (nowMs - tr.lastSeenMs > this.opts.maxMissingMs) {
          this.expired.push(tr.id);
          tracks.splice(t, 1);
        }
      }
    }
    return tracks;
  }

  clear(): void {
    for (const t of this.tracks) this.expired.push(t.id);
    this.tracks = [];
  }

  private create(): HandTrack {
    const oe = { ...HAND_ONE_EURO, ...this.opts.oneEuro };
    return {
      id: this.nextId++,
      box: { x: 0, y: 0, w: 0, h: 0 },
      landmarks: new Float32Array(HAND_LANDMARK_FLOATS),
      world: new Float32Array(HAND_LANDMARK_FLOATS),
      handedness: 'Right',
      rightProb: -1,
      score: 0,
      visible: true,
      lastSeenMs: -Infinity,
      hits: 0,
      builtinLabel: 0,
      builtinScore: 0,
      builtinAtMs: -Infinity,
      filter: new OneEuroFilterArray(HAND_LANDMARK_FLOATS, oe),
      worldFilter: new OneEuroFilterArray(HAND_LANDMARK_FLOATS, oe),
    };
  }

  private apply(track: HandTrack, hands: Float32Array, o: number, nowMs: number): void {
    if (nowMs - track.lastSeenMs > this.opts.filterResetGapMs) {
      track.filter.reset();
      track.worldFilter.reset();
    }
    const t = nowMs / 1000;
    track.filter.filter(hands.subarray(o, o + HAND_LANDMARK_FLOATS), track.landmarks, t);
    track.worldFilter.filter(
      hands.subarray(o + HAND_WORLD_OFFSET, o + HAND_WORLD_OFFSET + HAND_LANDMARK_FLOATS),
      track.world,
      t,
    );
    boxFromLandmarks(track.landmarks, 0, HAND_LANDMARK_COUNT, track.box);

    // Handedness is noisy frame to frame: smooth the probability, then switch with hysteresis.
    const raw = hands[o + HAND_RIGHT_PROB]!;
    track.rightProb =
      track.rightProb < 0
        ? raw
        : track.rightProb + this.opts.handednessAlpha * (raw - track.rightProb);
    if (track.handedness === 'Right' && track.rightProb < 0.4) track.handedness = 'Left';
    else if (track.handedness === 'Left' && track.rightProb > 0.6) track.handedness = 'Right';
    if (track.hits === 0) track.handedness = track.rightProb >= 0.5 ? 'Right' : 'Left';

    track.score = hands[o + HAND_SCORE]!;
    track.visible = true;
    track.lastSeenMs = nowMs;
    track.hits++;
  }
}
