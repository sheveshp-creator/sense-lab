import { LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER } from './landmarks';

/**
 * Head pose from mesh geometry alone, as two unitless numbers. Used to guide registration
 * ("turn left", "look up"). Geometry is used instead of the transformation-matrix angles because its
 * left/right sign is defined by what the user sees, not by a matrix convention.
 *
 *  yaw   > 0: face turned toward the right of the SCREEN (the mirrored view the user watches),
 *        < 0: toward the left. About 0.4 is a clear turn of roughly 30-40 degrees.
 *  pitch > 0: chin down, < 0: chin up, relative to a neutral face (0 = looking straight at the camera).
 */
export interface HeadPose {
  yaw: number;
  pitch: number;
}

const NOSE_TIP = 1;
const MOUTH_A = 61;
const MOUTH_B = 291;

/** Where the nose tip sits between eye line and mouth line on a frontal face (measured, see tests). */
export const NEUTRAL_NOSE_RATIO = 0.6;

/**
 * @param lm 478 x (x, y, z) normalised landmarks (raw camera image, not mirrored)
 * @param aspect frame width / height, so x and y are measured in the same units
 */
export function headPose(
  lm: ArrayLike<number>,
  aspect: number,
  out: HeadPose = { yaw: 0, pitch: 0 },
): HeadPose {
  const X = (i: number) => lm[i * 3]! * aspect;
  const Y = (i: number) => lm[i * 3 + 1]!;
  // Eyes ordered by image x, so "left" is the image's left whatever MediaPipe calls it.
  const [l, r] =
    X(LEFT_IRIS_CENTER) <= X(RIGHT_IRIS_CENTER)
      ? [LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER]
      : [RIGHT_IRIS_CENTER, LEFT_IRIS_CENTER];
  const ex = (X(l) + X(r)) / 2;
  const ey = (Y(l) + Y(r)) / 2;
  const mx = (X(MOUTH_A) + X(MOUTH_B)) / 2;
  const my = (Y(MOUTH_A) + Y(MOUTH_B)) / 2;
  const vx = X(r) - X(l); // eye axis
  const vy = Y(r) - Y(l);
  const eyeDist = Math.hypot(vx, vy) || 1e-6;
  const nx = X(NOSE_TIP) - ex;
  const ny = Y(NOSE_TIP) - ey;
  // Nose offset along the eye axis (roll-independent). In the raw image, a face turned to the
  // user's own left shows the nose shifted to image-right; the mirrored screen flips that, so negate.
  out.yaw = -((nx * vx + ny * vy) / (eyeDist * eyeDist));
  // Nose position along the eye-to-mouth axis, 0..1, then relative to the frontal value.
  const ux = mx - ex;
  const uy = my - ey;
  const len2 = ux * ux + uy * uy || 1e-6;
  out.pitch = (nx * ux + ny * uy) / len2 - NEUTRAL_NOSE_RATIO;
  return out;
}
