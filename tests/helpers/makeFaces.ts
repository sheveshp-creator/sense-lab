import { FACE_STRIDE, LANDMARK_COUNT } from '../../src/features/face/faceFormat';

export interface BoxSpec {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Packs box specs into the faceFormat layout. Landmarks fill a grid whose extremes equal the box. */
export function makeFaces(boxes: BoxSpec[]): Float32Array {
  const out = new Float32Array(boxes.length * FACE_STRIDE);
  boxes.forEach((b, f) => {
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const o = f * FACE_STRIDE + i * 3;
      out[o] = b.cx - b.w / 2 + b.w * ((i % 22) / 21);
      out[o + 1] = b.cy - b.h / 2 + b.h * (Math.floor(i / 22) / 21);
    }
  });
  return out;
}
