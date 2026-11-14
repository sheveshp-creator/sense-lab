import { describe, expect, it } from 'vitest';
import {
  applySimilarity,
  fivePoints,
  similarityTransform,
  TEMPLATE_112,
} from '../src/features/face/align';
import { headPose, NEUTRAL_NOSE_RATIO } from '../src/features/face/pose';
import { laplacianVariance, qualityProblem, toGray } from '../src/features/face/quality';
import { LANDMARK_COUNT } from '../src/features/face/faceFormat';

/** 478 landmarks with only the points the identity code reads filled in (raw, un-mirrored image). */
function face(p: {
  eyeL: [number, number];
  eyeR: [number, number];
  nose: [number, number];
  mouthL: [number, number];
  mouthR: [number, number];
}) {
  const lm = new Float32Array(LANDMARK_COUNT * 3);
  const set = (i: number, [x, y]: [number, number]) => lm.set([x, y, 0], i * 3);
  // MediaPipe indices: 468 and 473 iris centres, 1 nose tip, 61 and 291 mouth corners.
  set(468, p.eyeL);
  set(473, p.eyeR);
  set(1, p.nose);
  set(61, p.mouthL);
  set(291, p.mouthR);
  return lm;
}
const FRONT = {
  eyeL: [0.4, 0.4],
  eyeR: [0.6, 0.4],
  nose: [0.5, 0.55],
  mouthL: [0.43, 0.65],
  mouthR: [0.57, 0.65],
} as const;
const mk = (o: Partial<Record<keyof typeof FRONT, [number, number]>> = {}) =>
  face({ ...FRONT, ...o } as never);

describe('alignment', () => {
  it('recovers a known similarity transform exactly', () => {
    // Move the template by rotation 20 degrees, scale 1.7, shift (30, -12), then solve back.
    const a = 1.7 * Math.cos((20 * Math.PI) / 180);
    const b = 1.7 * Math.sin((20 * Math.PI) / 180);
    const src: number[] = [];
    for (let i = 0; i < 5; i++) {
      const x = TEMPLATE_112[i * 2]!;
      const y = TEMPLATE_112[i * 2 + 1]!;
      src.push(a * x - b * y + 30, b * x + a * y - 12);
    }
    const t = similarityTransform(src, TEMPLATE_112);
    for (let i = 0; i < 5; i++) {
      const [x, y] = applySimilarity(t, src[i * 2]!, src[i * 2 + 1]!);
      expect(x).toBeCloseTo(TEMPLATE_112[i * 2]!, 3);
      expect(y).toBeCloseTo(TEMPLATE_112[i * 2 + 1]!, 3);
    }
    // The solved scale is the inverse of what we applied.
    expect(Math.hypot(t.a, t.b)).toBeCloseTo(1 / 1.7, 4);
  });

  it('maps noisy points onto the template with a small residual (least squares)', () => {
    const src = TEMPLATE_112.map((v, i) => v * 2.1 + (i % 2 ? 40 : 15) + (i % 3) * 0.4);
    const t = similarityTransform(src, TEMPLATE_112);
    let worst = 0;
    for (let i = 0; i < 5; i++) {
      const [x, y] = applySimilarity(t, src[i * 2]!, src[i * 2 + 1]!);
      worst = Math.max(worst, Math.hypot(x - TEMPLATE_112[i * 2]!, y - TEMPLATE_112[i * 2 + 1]!));
    }
    expect(worst).toBeLessThan(1.5);
  });

  it('handles degenerate input (all points identical) without NaN', () => {
    const t = similarityTransform([5, 5, 5, 5, 5, 5], TEMPLATE_112);
    expect(Number.isFinite(t.a) && Number.isFinite(t.tx)).toBe(true);
  });

  it('fivePoints returns pixels ordered image-left to image-right whatever the landmark naming', () => {
    const out = new Float32Array(10);
    fivePoints(mk(), 640, 480, out);
    // eye L, eye R, nose, mouth L, mouth R
    expect(Array.from(out)).toEqual(
      [
        0.4 * 640,
        0.4 * 480,
        0.6 * 640,
        0.4 * 480,
        0.5 * 640,
        0.55 * 480,
        0.43 * 640,
        0.65 * 480,
        0.57 * 640,
        0.65 * 480,
      ].map((v) => Math.fround(v)),
    );
    // Swap which iris/mouth index sits on the left: the output order must not change.
    const swapped = mk({
      eyeL: [0.6, 0.4],
      eyeR: [0.4, 0.4],
      mouthL: [0.57, 0.65],
      mouthR: [0.43, 0.65],
    });
    const out2 = new Float32Array(10);
    fivePoints(swapped, 640, 480, out2);
    expect(Array.from(out2)).toEqual(Array.from(out));
  });
});

describe('image quality (the registration filter)', () => {
  const W = 32;
  const checker = Float32Array.from({ length: W * W }, (_, i) =>
    (Math.floor(i / W) + (i % W)) % 2 ? 255 : 0,
  );
  const flat = new Float32Array(W * W).fill(128);
  const ramp = Float32Array.from({ length: W * W }, (_, i) => (i % W) * 8);
  const blur = (g: Float32Array) => {
    const o = new Float32Array(g.length);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < W) {
              s += g[yy * W + xx]!;
              n++;
            }
          }
        o[y * W + x] = s / n;
      }
    return o;
  };

  it('Laplacian variance is high for detail, zero for flat and for a smooth ramp', () => {
    expect(laplacianVariance(checker, W, W)).toBeGreaterThan(10_000);
    expect(laplacianVariance(flat, W, W)).toBe(0);
    expect(laplacianVariance(ramp, W, W)).toBeCloseTo(0, 6);
  });

  it('blurring an image lowers the score a lot', () => {
    const sharp = laplacianVariance(checker, W, W);
    expect(laplacianVariance(blur(checker), W, W)).toBeLessThan(sharp / 20);
  });

  it('toGray returns the mean brightness and the luma image', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]); // white, black
    const gray = new Float32Array(2);
    expect(toGray(rgba, gray)).toBeCloseTo(127.5, 3);
    expect(gray[0]).toBeCloseTo(255, 3);
    expect(gray[1]).toBe(0);
    const red = new Float32Array(1);
    toGray(new Uint8ClampedArray([255, 0, 0, 255]), red);
    expect(red[0]).toBeCloseTo(76.245, 2); // 0.299 * 255
  });

  it('qualityProblem uses the limits measured on real photos (see the README)', () => {
    const limits = { minBrightness: 55, maxBrightness: 215, minSharpness: 40 };
    expect(qualityProblem(120, 120, limits)).toBeNull();
    expect(qualityProblem(25, 120, limits)).toBe('blurry'); // mildly blurred real photos measured 7-25
    expect(qualityProblem(78, 120, limits)).toBeNull(); // sharp real photos measured 78-171
    expect(qualityProblem(120, 49, limits)).toBe('dark'); // darkened real photos measured 39-49
    expect(qualityProblem(120, 65, limits)).toBeNull(); // dimmed but usable measured 65-83
    expect(qualityProblem(120, 230, limits)).toBe('bright');
    expect(qualityProblem(5, 10, limits)).toBe('dark'); // dark is reported first
  });
});

describe('head pose from mesh geometry', () => {
  const ASPECT = 4 / 3;
  it('a frontal face reads as about zero on both axes', () => {
    const p = headPose(mk({ nose: [0.5, 0.4 + NEUTRAL_NOSE_RATIO * 0.25] }), ASPECT);
    expect(p.yaw).toBeCloseTo(0, 3);
    expect(p.pitch).toBeCloseTo(0, 3);
  });

  it("nose shifted toward image-right = turned to the user's left = negative yaw (screen left)", () => {
    const nose: [number, number] = [0.54, 0.4 + NEUTRAL_NOSE_RATIO * 0.25];
    expect(headPose(mk({ nose }), ASPECT).yaw).toBeCloseTo(-0.2, 2);
    const other: [number, number] = [0.46, 0.4 + NEUTRAL_NOSE_RATIO * 0.25];
    expect(headPose(mk({ nose: other }), ASPECT).yaw).toBeCloseTo(0.2, 2);
  });

  it('nose nearer the eyes = chin up = negative pitch; nearer the mouth = chin down = positive', () => {
    expect(headPose(mk({ nose: [0.5, 0.5] }), ASPECT).pitch).toBeLessThan(-0.1);
    expect(headPose(mk({ nose: [0.5, 0.6] }), ASPECT).pitch).toBeGreaterThan(0.1);
  });

  it('is independent of frame aspect and of head roll', () => {
    const base = mk({ nose: [0.54, 0.55] });
    const a = headPose(base, 1);
    const b = headPose(base, 1.7777);
    expect(b.yaw).toBeCloseTo(a.yaw, 6);
    expect(b.pitch).toBeCloseTo(a.pitch, 6);

    // Roll the whole face by 25 degrees around its centre in a square frame: same pose numbers.
    const rolled = new Float32Array(base);
    const c = (25 * Math.PI) / 180;
    for (const i of [468, 473, 1, 61, 291]) {
      const x = base[i * 3]! - 0.5;
      const y = base[i * 3 + 1]! - 0.5;
      rolled[i * 3] = 0.5 + x * Math.cos(c) - y * Math.sin(c);
      rolled[i * 3 + 1] = 0.5 + x * Math.sin(c) + y * Math.cos(c);
    }
    const r = headPose(rolled, 1);
    expect(r.yaw).toBeCloseTo(a.yaw, 4);
    expect(r.pitch).toBeCloseTo(a.pitch, 4);
  });
});
