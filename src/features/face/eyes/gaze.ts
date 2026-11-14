/**
 * Where the eyes look, from the iris position and the head pose.
 *
 * Convention (the same as the mirrored view the user watches): +x = the user's right = screen right,
 * +y = down. "left" therefore means the user looks toward the left of the screen.
 */
import { LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER } from '../landmarks';

export type GazeLabel = 'centre' | 'left' | 'right' | 'up' | 'down';

/** Eye corners (outer, inner) of the subject's right and left eye. */
const EYES = [
  { iris: RIGHT_IRIS_CENTER, corners: [33, 133] },
  { iris: LEFT_IRIS_CENTER, corners: [362, 263] },
] as const;

/**
 * An eyeball is ~24 mm across and an eye opening ~28 mm wide, so an iris centre offset of `o` eye widths
 * is a rotation of about asin(o / 0.43). Rough: it ignores that people differ.
 */
export const EYE_OFFSET_FOR_90_DEG = 0.43;

/**
 * The iris sits a little above the line between the eye corners even when looking straight ahead.
 * Median over ~1000 real photos: -0.07 eye widths (v is positive downward). Removed so that 0 = straight.
 */
export const NEUTRAL_VERTICAL_OFFSET = -0.07;

const DEG = 180 / Math.PI;

export interface EyeInHead {
  /** Iris offset in eye widths, display convention: + = toward the user's right. */
  x: number;
  /** + = down, with the neutral offset removed. */
  y: number;
}

/**
 * Iris centre relative to the eye corners, averaged over both eyes. Measured along the line through
 * the corners (so a rolled head does not matter) and in units of the eye width (so distance to the
 * camera does not matter).
 * @param lm 478 x (x, y, z) normalised landmarks (raw camera image, not mirrored)
 */
export function eyeInHead(
  lm: ArrayLike<number>,
  aspect: number,
  out: EyeInHead = { x: 0, y: 0 },
): EyeInHead {
  let h = 0;
  let v = 0;
  for (const eye of EYES) {
    const px = (i: number) => lm[i * 3]! * aspect;
    const py = (i: number) => lm[i * 3 + 1]!;
    const [a, b] = eye.corners;
    // Order the corners by image x, so the axis always points to the image's right.
    const [l, r] = px(a) <= px(b) ? [a, b] : [b, a];
    const ax = px(r) - px(l);
    const ay = py(r) - py(l);
    const w = Math.hypot(ax, ay) || 1e-6;
    const ix = px(eye.iris) - px(l);
    const iy = py(eye.iris) - py(l);
    h += (ix * ax + iy * ay) / (w * w) - 0.5; // 0 at the middle, + toward image-right
    // Perpendicular to the axis, pointing image-down.
    const cx = (px(l) + px(r)) / 2;
    const cy = (py(l) + py(r)) / 2;
    v += ((px(eye.iris) - cx) * -ay + (py(eye.iris) - cy) * ax) / (w * w);
  }
  // Image-right is screen-left in the mirrored view, so flip x.
  out.x = -h / 2;
  out.y = v / 2 - NEUTRAL_VERTICAL_OFFSET;
  return out;
}

export const offsetToDegrees = (o: number): number =>
  Math.asin(Math.max(-1, Math.min(1, o / EYE_OFFSET_FOR_90_DEG))) * DEG;

/**
 * Head yaw / pitch in degrees in the display convention (+yaw = turned to the user's right, +pitch =
 * chin down) from the transformation-matrix angles stored with each face. The matrix yaw has the
 * opposite sign: checked against the mesh-geometry yaw on ~1000 real photos (correlation -0.96), whose
 * direction was in turn confirmed by looking at the extreme photos. Pitch has the same sign.
 */
export function headAnglesDisplay(pose: ArrayLike<number>): { yaw: number; pitch: number } {
  return { yaw: -pose[0]!, pitch: pose[1]! };
}

export interface Gaze {
  /** Gaze direction relative to the camera, degrees. = eye-in-head + head pose. */
  x: number;
  y: number;
  /** The eye-in-head part alone, degrees. */
  eyeX: number;
  eyeY: number;
}

/**
 * World gaze = where the eyes point inside the head + where the head points. A person looking straight
 * at the screen with the head turned 20 degrees has eyes turned -20 inside the head: the sum is 0.
 */
export function gazeFrom(
  eye: EyeInHead,
  pose: ArrayLike<number>,
  out: Gaze = { x: 0, y: 0, eyeX: 0, eyeY: 0 },
): Gaze {
  const head = headAnglesDisplay(pose);
  out.eyeX = offsetToDegrees(eye.x);
  out.eyeY = offsetToDegrees(eye.y);
  out.x = out.eyeX + head.yaw;
  out.y = out.eyeY + head.pitch;
  return out;
}

export interface GazeLabelConfig {
  /** Beyond this many degrees sideways / vertically the gaze is "left/right" / "up/down". */
  enterX: number;
  enterY: number;
  /** Fraction of the enter distance to fall back below before returning to centre (hysteresis). */
  exitFraction: number;
}

/** Vertical iris travel is smaller than horizontal (the eyelids limit it), so its zone is narrower. */
export const DEFAULT_GAZE_LABEL: GazeLabelConfig = { enterX: 12, enterY: 8, exitFraction: 0.7 };

/** Turns a gaze vector into left / right / up / down / centre, steadied by hysteresis. */
export function gazeLabel(
  x: number,
  y: number,
  prev: GazeLabel,
  cfg: GazeLabelConfig = DEFAULT_GAZE_LABEL,
): GazeLabel {
  const kx = prev === 'left' || prev === 'right' ? cfg.exitFraction : 1;
  const ky = prev === 'up' || prev === 'down' ? cfg.exitFraction : 1;
  const nx = Math.abs(x) / (cfg.enterX * kx);
  const ny = Math.abs(y) / (cfg.enterY * ky);
  if (nx < 1 && ny < 1) return 'centre';
  if (nx >= ny) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

/**
 * Smooths the gaze vector over time (exponential average) and holds the last value while the eyes are
 * shut, since the iris is not visible then.
 */
export class GazeTracker {
  x = 0;
  y = 0;
  eyeX = 0;
  eyeY = 0;
  label: GazeLabel = 'centre';
  /** False until a first measurement has arrived. */
  valid = false;
  private readonly tmpEye: EyeInHead = { x: 0, y: 0 };
  private readonly tmpGaze: Gaze = { x: 0, y: 0, eyeX: 0, eyeY: 0 };

  constructor(
    private readonly alpha = 0.4,
    private readonly closedAbove = 0.4,
    private readonly labelCfg: GazeLabelConfig = DEFAULT_GAZE_LABEL,
  ) {}

  update(lm: ArrayLike<number>, aspect: number, pose: ArrayLike<number>, closure: number): void {
    if (closure >= this.closedAbove) return; // eyes shut: keep the last gaze
    const g = gazeFrom(eyeInHead(lm, aspect, this.tmpEye), pose, this.tmpGaze);
    if (!this.valid) {
      this.x = g.x;
      this.y = g.y;
      this.eyeX = g.eyeX;
      this.eyeY = g.eyeY;
      this.valid = true;
    } else {
      const a = this.alpha;
      this.x += a * (g.x - this.x);
      this.y += a * (g.y - this.y);
      this.eyeX += a * (g.eyeX - this.eyeX);
      this.eyeY += a * (g.eyeY - this.eyeY);
    }
    this.label = gazeLabel(this.x, this.y, this.label, this.labelCfg);
  }

  reset(): void {
    this.valid = false;
    this.label = 'centre';
    this.x = this.y = this.eyeX = this.eyeY = 0;
  }
}
