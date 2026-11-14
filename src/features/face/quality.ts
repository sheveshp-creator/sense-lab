/**
 * Cheap image-quality checks on the aligned face crop, used to skip unusable frames when
 * registering someone (and to ignore bad samples when recognising).
 */

/** Mean brightness 0..255 and the gray image (Rec. 601 luma) of an RGBA buffer. */
export function toGray(rgba: ArrayLike<number>, gray: Float32Array): number {
  let sum = 0;
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    const g = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
    gray[p] = g;
    sum += g;
  }
  return sum / gray.length;
}

/**
 * Variance of the 3x3 Laplacian: the usual blur measure. Sharp detail makes the response swing a lot
 * (high variance); a blurred or flat image barely responds (low variance).
 */
export function laplacianVariance(gray: ArrayLike<number>, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = gray[i - w]! + gray[i + w]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export interface QualityLimits {
  /** Below this mean brightness the crop is too dark. */
  minBrightness: number;
  /** Above this it is washed out. */
  maxBrightness: number;
  /** Below this Laplacian variance it is too blurry. */
  minSharpness: number;
}

export type QualityProblem = 'dark' | 'bright' | 'blurry';

/** Which quality problem (if any) a crop has. Dark and bright are reported before blur. */
export function qualityProblem(
  sharpness: number,
  brightness: number,
  limits: QualityLimits,
): QualityProblem | null {
  if (brightness < limits.minBrightness) return 'dark';
  if (brightness > limits.maxBrightness) return 'bright';
  if (sharpness < limits.minSharpness) return 'blurry';
  return null;
}
