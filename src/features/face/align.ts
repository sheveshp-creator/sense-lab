import { LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER } from './landmarks';

/**
 * The standard 5-point template for 112x112 ArcFace-style models, in the order
 * [eye on the image's left, eye on the image's right, nose tip, mouth corner left, mouth corner right].
 */
export const TEMPLATE_112 = [
  38.2946, 51.6963, 73.5318, 51.5014, 56.0252, 71.7366, 41.5493, 92.3655, 70.7299, 92.2041,
];

const NOSE_TIP = 1;
const MOUTH_A = 61;
const MOUTH_B = 291;

/**
 * Five key points in PIXELS from the 478 normalised mesh landmarks: eye centres (iris centres),
 * nose tip and mouth corners. Left/right means left/right in the IMAGE, decided by x, so the
 * result does not depend on MediaPipe's own left/right naming or on mirroring.
 * @param lm 478 x (x, y, z), normalised 0..1
 * @param out 10 numbers: x0, y0, x1, y1, ...
 */
export function fivePoints(
  lm: ArrayLike<number>,
  width: number,
  height: number,
  out: Float32Array | number[],
): void {
  const pt = (i: number, k: number) => lm[i * 3 + k]! * (k === 0 ? width : height);
  const eyeA = LEFT_IRIS_CENTER;
  const eyeB = RIGHT_IRIS_CENTER;
  const [e0, e1] = pt(eyeA, 0) <= pt(eyeB, 0) ? [eyeA, eyeB] : [eyeB, eyeA];
  const [m0, m1] = pt(MOUTH_A, 0) <= pt(MOUTH_B, 0) ? [MOUTH_A, MOUTH_B] : [MOUTH_B, MOUTH_A];
  const order = [e0, e1, NOSE_TIP, m0, m1];
  for (let i = 0; i < 5; i++) {
    out[i * 2] = pt(order[i]!, 0);
    out[i * 2 + 1] = pt(order[i]!, 1);
  }
}

/** Similarity transform x' = a*x - b*y + tx, y' = b*x + a*y + ty (rotation + uniform scale + shift). */
export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

/**
 * Least-squares similarity transform taking `src` points onto `dst` points (both x0,y0,x1,y1,...).
 * Closed form (no reflection): centre both sets, then the rotation-scale comes from dot and cross sums.
 */
export function similarityTransform(src: ArrayLike<number>, dst: ArrayLike<number>): Similarity {
  const n = src.length / 2;
  let scx = 0;
  let scy = 0;
  let dcx = 0;
  let dcy = 0;
  for (let i = 0; i < n; i++) {
    scx += src[i * 2]!;
    scy += src[i * 2 + 1]!;
    dcx += dst[i * 2]!;
    dcy += dst[i * 2 + 1]!;
  }
  scx /= n;
  scy /= n;
  dcx /= n;
  dcy /= n;
  let num1 = 0;
  let num2 = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i * 2]! - scx;
    const sy = src[i * 2 + 1]! - scy;
    const dx = dst[i * 2]! - dcx;
    const dy = dst[i * 2 + 1]! - dcy;
    num1 += sx * dx + sy * dy;
    num2 += sx * dy - sy * dx;
    den += sx * sx + sy * sy;
  }
  if (den === 0) return { a: 1, b: 0, tx: dcx - scx, ty: dcy - scy };
  const a = num1 / den;
  const b = num2 / den;
  return { a, b, tx: dcx - (a * scx - b * scy), ty: dcy - (b * scx + a * scy) };
}

export const applySimilarity = (t: Similarity, x: number, y: number): [number, number] => [
  t.a * x - t.b * y + t.tx,
  t.b * x + t.a * y + t.ty,
];
