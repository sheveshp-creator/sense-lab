import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { taskCanvas, visionFileset } from '../mediapipeFileset';
import {
  BLENDSHAPE_OFFSET,
  FACE_STRIDE,
  LANDMARK_COUNT,
  MAX_FACES,
  POSE_OFFSET,
} from './faceFormat';

export interface FaceDetector {
  delegate: 'GPU' | 'CPU';
  /** Returns the packed faces buffer (count * FACE_STRIDE floats). The buffer is new each call so it can be transferred. */
  detect(bitmap: ImageBitmap, timestampMs: number): { count: number; data: Float32Array };
}

/** Rotation (column-major 4x4) to yaw/pitch/roll degrees, assuming R = Ry(yaw) * Rx(pitch) * Rz(roll). */
function writePose(m: ArrayLike<number>, out: Float32Array, o: number): void {
  const r02 = m[8]!;
  const r22 = m[10]!;
  const r12 = m[9]!;
  const r10 = m[1]!;
  const r11 = m[5]!;
  const deg = 180 / Math.PI;
  out[o] = Math.atan2(r02, r22) * deg;
  out[o + 1] = Math.asin(Math.max(-1, Math.min(1, -r12 / Math.hypot(r02, r12, r22)))) * deg;
  out[o + 2] = Math.atan2(r10, r11) * deg;
}

/**
 * VIDEO mode tracks across frames (use for the camera). IMAGE mode treats every call as an unrelated
 * photo (use for the eval script and still images).
 */
export async function createFaceDetector(
  wasmBaseUrl: string,
  modelUrl: string,
  mode: 'VIDEO' | 'IMAGE' = 'VIDEO',
): Promise<FaceDetector> {
  const fileset = await visionFileset(wasmBaseUrl);
  const create = (delegate: 'GPU' | 'CPU') =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl, delegate },
      ...taskCanvas(),
      runningMode: mode,
      numFaces: MAX_FACES,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });

  let delegate: 'GPU' | 'CPU' = 'GPU';
  let landmarker: FaceLandmarker;
  try {
    landmarker = await create('GPU');
  } catch {
    // No WebGL in this worker (e.g. some headless or old devices): CPU still works, just slower.
    delegate = 'CPU';
    landmarker = await create('CPU');
  }

  let lastTs = -1;
  return {
    delegate,
    detect(bitmap, timestampMs) {
      // MediaPipe requires strictly increasing timestamps in VIDEO mode.
      const ts = Math.max(Math.round(timestampMs), lastTs + 1);
      lastTs = ts;
      const res =
        mode === 'VIDEO' ? landmarker.detectForVideo(bitmap, ts) : landmarker.detect(bitmap);
      const count = Math.min(res.faceLandmarks.length, MAX_FACES);
      const data = new Float32Array(count * FACE_STRIDE);
      for (let f = 0; f < count; f++) {
        const base = f * FACE_STRIDE;
        const lm = res.faceLandmarks[f]!;
        for (let i = 0; i < LANDMARK_COUNT; i++) {
          const p = lm[i]!;
          const o = base + i * 3;
          data[o] = p.x;
          data[o + 1] = p.y;
          data[o + 2] = p.z;
        }
        const cats = res.faceBlendshapes[f]?.categories;
        if (cats) for (const c of cats) data[base + BLENDSHAPE_OFFSET + c.index] = c.score;
        const m = res.facialTransformationMatrixes[f]?.data;
        if (m) writePose(m, data, base + POSE_OFFSET);
      }
      return { count, data };
    },
  };
}
