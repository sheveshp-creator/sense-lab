import {
  BLENDSHAPE_COUNT,
  BLENDSHAPE_OFFSET,
  FACE_STRIDE,
  LANDMARK_COUNT,
  LANDMARK_FLOATS,
  POSE_OFFSET,
} from '../../features/face/faceFormat';
import { OneEuroFilterArray } from './oneEuro';
import { boxFromLandmarks, matchBoxes } from './matching';
import type { Box } from './matching';

export { iou } from './matching';
export type { Box } from './matching';
import type { OneEuroParams } from './oneEuro';

export interface FaceTrack {
  id: number;
  /** Box around the smoothed landmarks, normalised 0..1. */
  box: Box;
  /** One-Euro-smoothed landmarks (x, y, z triples). */
  landmarks: Float32Array;
  blendshapes: Float32Array;
  /** yaw, pitch, roll in degrees. */
  pose: Float32Array;
  /** True if matched in the latest frame. False while the ID is only being kept alive. */
  visible: boolean;
  lastSeenMs: number;
  /** Frames this track has been matched. */
  hits: number;
  /** @internal */
  filter: OneEuroFilterArray;
}

export interface FaceTrackerOptions {
  /** Keep an ID alive this long after the face disappears. */
  maxMissingMs: number;
  /** A match needs IoU >= this, or a centre distance under maxCentreDist. */
  minIou: number;
  /** Max centre distance, as a fraction of the track box diagonal. */
  maxCentreDist: number;
  /** Gaps longer than this reset the smoothing filter instead of smoothing across the jump. */
  filterResetGapMs: number;
  oneEuro?: Partial<OneEuroParams>;
}

const DEFAULTS: FaceTrackerOptions = {
  maxMissingMs: 500,
  minIou: 0.1,
  maxCentreDist: 0.5,
  filterResetGapMs: 200,
};

/**
 * Matches detected faces to existing tracks between frames so each person keeps one ID.
 * Greedy matching on IoU plus centre distance is enough for <= 4 faces and keeps the code simple.
 */
export class FaceTracker {
  private readonly opts: FaceTrackerOptions;
  private tracks: FaceTrack[] = [];
  private nextId = 1;
  // Scratch space reused every frame.
  private readonly detBoxes: Box[] = [];
  /** detection index -> matched track index (or -1) */
  private readonly detTaken: number[] = [];

  constructor(opts: Partial<FaceTrackerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /** Tracks currently alive, including ones only being kept alive (visible === false). */
  get alive(): readonly FaceTrack[] {
    return this.tracks;
  }

  /**
   * @param faces `count` faces in the faceFormat layout.
   * @param nowMs monotonically increasing time in ms.
   */
  update(faces: Float32Array, count: number, nowMs: number): readonly FaceTrack[] {
    const { tracks, detBoxes, detTaken } = this;
    for (let d = 0; d < count; d++) {
      detBoxes[d] ??= { x: 0, y: 0, w: 0, h: 0 };
      boxFromLandmarks(faces, d * FACE_STRIDE, LANDMARK_COUNT, detBoxes[d]!);
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
        this.applyDetection(tracks[ti]!, faces, d * FACE_STRIDE, nowMs);
      } else {
        const track = this.createTrack();
        this.applyDetection(track, faces, d * FACE_STRIDE, nowMs);
        tracks.push(track);
      }
    }

    // Unmatched tracks stay alive but hidden, then expire.
    for (let t = tracks.length - 1; t >= 0; t--) {
      const tr = tracks[t]!;
      if (tr.lastSeenMs !== nowMs) {
        tr.visible = false;
        if (nowMs - tr.lastSeenMs > this.opts.maxMissingMs) tracks.splice(t, 1);
      }
    }
    return tracks;
  }

  clear(): void {
    this.tracks = [];
  }

  private createTrack(): FaceTrack {
    return {
      id: this.nextId++,
      box: { x: 0, y: 0, w: 0, h: 0 },
      landmarks: new Float32Array(LANDMARK_FLOATS),
      blendshapes: new Float32Array(BLENDSHAPE_COUNT),
      pose: new Float32Array(3),
      visible: true,
      lastSeenMs: -Infinity,
      hits: 0,
      filter: new OneEuroFilterArray(LANDMARK_FLOATS, this.opts.oneEuro),
    };
  }

  private applyDetection(
    track: FaceTrack,
    faces: Float32Array,
    offset: number,
    nowMs: number,
  ): void {
    if (nowMs - track.lastSeenMs > this.opts.filterResetGapMs) track.filter.reset();
    track.filter.filter(
      faces.subarray(offset, offset + LANDMARK_FLOATS),
      track.landmarks,
      nowMs / 1000,
    );
    track.blendshapes.set(faces.subarray(offset + BLENDSHAPE_OFFSET, offset + POSE_OFFSET));
    track.pose.set(faces.subarray(offset + POSE_OFFSET, offset + FACE_STRIDE));
    boxFromLandmarks(track.landmarks, 0, LANDMARK_COUNT, track.box);
    track.visible = true;
    track.lastSeenMs = nowMs;
    track.hits++;
  }
}
