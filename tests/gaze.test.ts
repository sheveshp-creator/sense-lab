import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAZE_LABEL,
  EYE_OFFSET_FOR_90_DEG,
  GazeTracker,
  NEUTRAL_VERTICAL_OFFSET,
  eyeInHead,
  gazeFrom,
  gazeLabel,
  headAnglesDisplay,
  offsetToDegrees,
} from '../src/features/face/eyes/gaze';
import { eyeAspectRatio } from '../src/features/face/eyes/ear';
import { headPose } from '../src/features/face/pose';
import { BS } from '../src/features/face/blendshapes';
import { CALIBRATION_GRID, GazeCalibration } from '../src/features/face/eyes/calibration';
import { rng } from './helpers/scenes';
import real from './fixtures/eyes_real_photos.json';

/**
 * Landmarks for two eyes built in isotropic units, then divided by `aspect` to get normalised x.
 * h: iris offset along the eye axis in eye widths (+ = image-right); v: + = image-down.
 * `v` defaults to the neutral resting offset, so the default is "looking straight ahead".
 */
function eyes(
  o: { h?: number; v?: number; width?: number; rollDeg?: number; aspect?: number } = {},
) {
  const { h = 0, v = NEUTRAL_VERTICAL_OFFSET, width = 0.1, rollDeg = 0, aspect = 1 } = o;
  const lm = new Float32Array(478 * 3);
  const roll = (rollDeg * Math.PI) / 180;
  const ux = Math.cos(roll);
  const uy = Math.sin(roll); // axis, pointing to image-right
  const nx = -uy;
  const ny = ux; // perpendicular, pointing image-down
  const put = (i: number, x: number, y: number) => lm.set([x / aspect, y, 0], i * 3);
  for (const [cx, corners, iris] of [
    [0.35, [33, 133], 468],
    [0.65, [263, 362], 473],
  ] as const) {
    const cy = 0.45;
    // corners[0] / [1]: which index is on which side does not matter, the code orders by x.
    put(corners[0], cx - (ux * width) / 2, cy - (uy * width) / 2);
    put(corners[1], cx + (ux * width) / 2, cy + (uy * width) / 2);
    put(iris, cx + ux * h * width + nx * v * width, cy + uy * h * width + ny * v * width);
  }
  return lm;
}
const matrixPose = (yawDisplayDeg: number, pitchDeg = 0) => [-yawDisplayDeg, pitchDeg, 0]; // matrix yaw has the opposite sign

describe('iris position inside the eye (eye-in-head)', () => {
  it('looking straight ahead reads as zero', () => {
    const e = eyeInHead(eyes(), 1);
    expect(e.x).toBeCloseTo(0, 6);
    expect(e.y).toBeCloseTo(0, 6);
  });

  it('iris toward the image-right = the user looks to their left = negative x (screen left)', () => {
    expect(eyeInHead(eyes({ h: 0.1 }), 1).x).toBeCloseTo(-0.1, 5);
    expect(eyeInHead(eyes({ h: -0.1 }), 1).x).toBeCloseTo(0.1, 5);
  });

  it('iris below the corner line = looking down = positive y', () => {
    expect(eyeInHead(eyes({ v: NEUTRAL_VERTICAL_OFFSET + 0.05 }), 1).y).toBeCloseTo(0.05, 5);
    expect(eyeInHead(eyes({ v: NEUTRAL_VERTICAL_OFFSET - 0.05 }), 1).y).toBeCloseTo(-0.05, 5);
  });

  it('does not depend on how far away the face is (eye width)', () => {
    const near = eyeInHead(eyes({ h: 0.12, width: 0.14 }), 1);
    const far = eyeInHead(eyes({ h: 0.12, width: 0.04 }), 1);
    expect(far.x).toBeCloseTo(near.x, 5);
  });

  it('does not depend on head roll', () => {
    const level = eyeInHead(eyes({ h: 0.1, v: 0 }), 1);
    for (const roll of [-30, 12, 25, 40]) {
      const r = eyeInHead(eyes({ h: 0.1, v: 0, rollDeg: roll }), 1);
      expect(r.x).toBeCloseTo(level.x, 4);
      expect(r.y).toBeCloseTo(level.y, 4);
    }
  });

  it('does not depend on the frame shape (aspect is applied to x)', () => {
    const sq = eyeInHead(eyes({ h: 0.1, v: 0.02 }), 1);
    const wide = eyeInHead(eyes({ h: 0.1, v: 0.02, aspect: 16 / 9 }), 16 / 9);
    expect(wide.x).toBeCloseTo(sq.x, 5);
    expect(wide.y).toBeCloseTo(sq.y, 5);
  });

  it('converts to degrees with the eyeball geometry: 0 -> 0, symmetric, 90 degrees at the geometric limit', () => {
    expect(offsetToDegrees(0)).toBe(0);
    expect(offsetToDegrees(0.1)).toBeCloseTo(-offsetToDegrees(-0.1), 8);
    expect(offsetToDegrees(0.1)).toBeCloseTo(13.45, 1);
    expect(offsetToDegrees(EYE_OFFSET_FOR_90_DEG)).toBeCloseTo(90, 5);
    expect(offsetToDegrees(5)).toBeCloseTo(90, 5); // clamped, never NaN
  });
});

describe('correcting for head pose', () => {
  it('matrix yaw has the opposite sign to the on-screen convention; pitch is the same', () => {
    expect(headAnglesDisplay([10, 5, 0])).toEqual({ yaw: -10, pitch: 5 });
  });

  it("head turned 20 deg to the user's right, eyes counter-rotated inside the head: world gaze is straight ahead", () => {
    const eyeOffset = { x: EYE_OFFSET_FOR_90_DEG * Math.sin((-20 * Math.PI) / 180), y: 0 };
    const g = gazeFrom(eyeOffset, matrixPose(20));
    expect(g.eyeX).toBeCloseTo(-20, 3);
    expect(g.x).toBeCloseTo(0, 3);
  });

  it('head turned 20 deg to the right with eyes straight in the head: the gaze points 20 deg right', () => {
    const g = gazeFrom({ x: 0, y: 0 }, matrixPose(20));
    expect(g.x).toBeCloseTo(20, 5);
    // With the sign convention wrong this would be -20: the label must say "right", not "left".
    expect(gazeLabel(g.x, g.y, 'centre')).toBe('right');
  });

  it('eyes and head turning the same way add up; vertical works the same way (chin down + eyes down)', () => {
    const g = gazeFrom({ x: 0.1, y: 0.05 }, matrixPose(10, 8));
    expect(g.x).toBeCloseTo(offsetToDegrees(0.1) + 10, 4);
    expect(g.y).toBeCloseTo(offsetToDegrees(0.05) + 8, 4);
  });
});

describe('left / right / up / down / centre', () => {
  const cfg = DEFAULT_GAZE_LABEL;
  it('inside the centre zone is centre', () => {
    expect(gazeLabel(0, 0, 'centre')).toBe('centre');
    expect(gazeLabel(cfg.enterX - 1, cfg.enterY - 1, 'centre')).toBe('centre');
  });
  it('beyond the zone, the dominant axis wins', () => {
    expect(gazeLabel(-20, 2, 'centre')).toBe('left');
    expect(gazeLabel(20, 2, 'centre')).toBe('right');
    expect(gazeLabel(1, -15, 'centre')).toBe('up');
    expect(gazeLabel(1, 15, 'centre')).toBe('down');
    // Diagonal: compared in units of each zone, vertical 12 deg is "more" than horizontal 13 deg.
    expect(gazeLabel(13, 12, 'centre')).toBe('down');
  });
  it('hysteresis: once "right" it stays right until the gaze falls well inside the zone', () => {
    expect(gazeLabel(cfg.enterX + 1, 0, 'centre')).toBe('right');
    expect(gazeLabel(cfg.enterX - 1, 0, 'centre')).toBe('centre'); // not yet right from centre
    expect(gazeLabel(cfg.enterX - 1, 0, 'right')).toBe('right'); // but stays right once there
    expect(gazeLabel(cfg.enterX * cfg.exitFraction - 0.5, 0, 'right')).toBe('centre');
  });
});

describe('GazeTracker', () => {
  const still = (
    g: GazeTracker,
    h: number,
    v = NEUTRAL_VERTICAL_OFFSET,
    frames = 30,
    closure = 0,
    yaw = 0,
  ) => {
    for (let i = 0; i < frames; i++) g.update(eyes({ h, v }), 1, matrixPose(yaw), closure);
  };

  it('is invalid until the first measurement, then converges to the true gaze', () => {
    const g = new GazeTracker();
    expect(g.valid).toBe(false);
    still(g, -0.12);
    expect(g.valid).toBe(true);
    expect(g.x).toBeCloseTo(offsetToDegrees(0.12), 2);
    expect(g.label).toBe('right');
  });

  it('smooths: a jump is followed gradually, not instantly', () => {
    const g = new GazeTracker();
    still(g, 0, NEUTRAL_VERTICAL_OFFSET, 20);
    g.update(eyes({ h: -0.15 }), 1, matrixPose(0), 0);
    expect(g.x).toBeGreaterThan(0);
    expect(g.x).toBeLessThan(offsetToDegrees(0.15) * 0.6);
  });

  it('holds the last gaze while the eyes are shut (the iris is hidden)', () => {
    const g = new GazeTracker();
    still(g, -0.12);
    const before = g.x;
    still(g, 0.15, NEUTRAL_VERTICAL_OFFSET, 10, 0.9);
    expect(g.x).toBe(before);
  });

  it('does not flicker between right and centre on jittery data near the edge', () => {
    const g = new GazeTracker();
    const r = rng(2);
    let changes = 0;
    let prev = g.label;
    for (let i = 0; i < 300; i++) {
      // Wobbling around the enter threshold of 12 degrees.
      g.update(eyes({ h: -(0.0937 + 0.012 * r()) }), 1, matrixPose(0), 0);
      if (g.label !== prev) changes++;
      prev = g.label;
    }
    expect(changes).toBeLessThanOrEqual(4);
  });

  it('reset() forgets everything', () => {
    const g = new GazeTracker();
    still(g, -0.12);
    g.reset();
    expect(g.valid).toBe(false);
    expect(g.label).toBe('centre');
  });
});

describe('on REAL photos (public in-the-wild photos, numbers only)', () => {
  type Row = {
    tags: string[];
    pose: number[];
    landmarks: Record<string, number[]>;
    blendshapes: Record<string, number>;
  };
  const rows = real.rows as Row[];
  const lmOf = (r: Row) => {
    const lm = new Float32Array(478 * 3);
    for (const [k, v] of Object.entries(r.landmarks)) lm.set(v, Number(k) * 3);
    return lm;
  };
  const corr = (a: number[], b: number[]) => {
    const ma = a.reduce((x, y) => x + y) / a.length;
    const mb = b.reduce((x, y) => x + y) / b.length;
    let sab = 0;
    let sa = 0;
    let sb = 0;
    a.forEach((v, i) => {
      sab += (v - ma) * (b[i]! - mb);
      sa += (v - ma) ** 2;
      sb += (b[i]! - mb) ** 2;
    });
    return sab / Math.sqrt(sa * sb);
  };
  const tagged = (t: string) => rows.filter((r) => r.tags.includes(t));

  it('has the photos the directions were checked on by eye', () => {
    for (const t of ['yaw+', 'yaw-', 'pitch+', 'pitch-', 'gazeImageLeft', 'gazeImageRight'])
      expect(tagged(t)).toHaveLength(5);
    expect(tagged('random').length).toBeGreaterThan(100);
  });

  it('eyes looking toward the image-left (confirmed by looking) read as +x; toward the image-right as -x', () => {
    for (const r of tagged('gazeImageLeft')) expect(eyeInHead(lmOf(r), 1).x).toBeGreaterThan(0.05);
    for (const r of tagged('gazeImageRight')) expect(eyeInHead(lmOf(r), 1).x).toBeLessThan(-0.05);
  });

  it('faces turned toward the image-left read as head yaw +, toward the right as - (confirmed by looking)', () => {
    for (const r of tagged('yaw+')) expect(headAnglesDisplay(r.pose).yaw).toBeGreaterThan(15);
    for (const r of tagged('yaw-')) expect(headAnglesDisplay(r.pose).yaw).toBeLessThan(-15);
  });

  it('chin-down faces read as pitch +, chin-up faces as pitch - (confirmed by looking)', () => {
    for (const r of tagged('pitch+')) expect(headAnglesDisplay(r.pose).pitch).toBeGreaterThan(5);
    for (const r of tagged('pitch-')) expect(headAnglesDisplay(r.pose).pitch).toBeLessThan(-5);
  });

  it('the geometry-based head pose (used for registration) agrees with the matrix angles', () => {
    const geo = rows.map((r) => headPose(lmOf(r), 1));
    const mat = rows.map((r) => headAnglesDisplay(r.pose));
    expect(
      corr(
        geo.map((g) => g.yaw),
        mat.map((m) => m.yaw),
      ),
    ).toBeGreaterThan(0.9);
    expect(
      corr(
        geo.map((g) => g.pitch),
        mat.map((m) => m.pitch),
      ),
    ).toBeGreaterThan(0.75);
  });

  it("the iris-based gaze agrees with MediaPipe's own eye-look scores (sideways strongly, vertical less so)", () => {
    const mine = rows.map((r) => eyeInHead(lmOf(r), 1));
    const b = (r: Row, n: keyof typeof BS) => r.blendshapes[n]!;
    const bsX = rows.map(
      (r) =>
        (b(r, 'eyeLookOutRight') -
          b(r, 'eyeLookInRight') +
          b(r, 'eyeLookInLeft') -
          b(r, 'eyeLookOutLeft')) /
        2,
    );
    const bsY = rows.map(
      (r) =>
        (b(r, 'eyeLookDownLeft') +
          b(r, 'eyeLookDownRight') -
          b(r, 'eyeLookUpLeft') -
          b(r, 'eyeLookUpRight')) /
        2,
    );
    expect(
      corr(
        mine.map((m) => m.x),
        bsX,
      ),
    ).toBeGreaterThan(0.7); // measured 0.79 on ~1000 photos
    expect(
      corr(
        mine.map((m) => m.y),
        bsY,
      ),
    ).toBeGreaterThan(0.4); // measured 0.58
  });

  it('the landmark eye-aspect-ratio tracks the blink blendshapes (the fallback signal is sound)', () => {
    const ear = rows.map((r) => eyeAspectRatio(lmOf(r), 1));
    const closure = rows.map((r) =>
      Math.min(r.blendshapes.eyeBlinkLeft!, r.blendshapes.eyeBlinkRight!),
    );
    expect(corr(ear, closure)).toBeLessThan(-0.7); // measured -0.84
  });
});

describe('9-point gaze calibration', () => {
  /** Which gaze a user would have when looking at a screen point, for a made-up but plausible affine map. */
  const gazeAt = (sx: number, sy: number): [number, number] => {
    const [a, b, c, d] = [0.022, 0.004, 0.003, 0.045];
    const det = a * d - b * c;
    const x = sx - 0.5;
    const y = sy - 0.5;
    return [(d * x - b * y) / det, (-c * x + a * y) / det];
  };
  const collect = (cal: GazeCalibration, noiseDeg: number, perTarget = 12, seed = 4) => {
    const r = rng(seed);
    CALIBRATION_GRID.forEach(([sx, sy], t) => {
      const [gx, gy] = gazeAt(sx, sy);
      for (let i = 0; i < perTarget; i++) cal.add(t, gx + noiseDeg * r(), gy + noiseDeg * r());
    });
  };

  it('recovers a known gaze-to-screen map from clean data', () => {
    const cal = new GazeCalibration();
    collect(cal, 0);
    const res = cal.calibrate();
    expect(res.ok).toBe(true);
    expect(res.rmsError).toBeLessThan(1e-6);
    const p = cal.predict(...gazeAt(0.3, 0.7))!;
    expect(p.x).toBeCloseTo(0.3, 4);
    expect(p.y).toBeCloseTo(0.7, 4);
  });

  it('with noisy samples the error stays small, and the leave-one-out error is the honest (larger) one', () => {
    const cal = new GazeCalibration();
    collect(cal, 1.5);
    const res = cal.calibrate();
    expect(res.ok).toBe(true);
    expect(res.rmsError).toBeLessThan(0.05);
    expect(res.leaveOneOutError).toBeGreaterThanOrEqual(res.rmsError);
    expect(res.leaveOneOutError).toBeLessThan(0.1);
  });

  it('uses the median per dot, so one wild glance does not wreck the fit', () => {
    const clean = new GazeCalibration();
    collect(clean, 0.5);
    const dirty = new GazeCalibration();
    collect(dirty, 0.5);
    dirty.add(4, 80, -60); // one sample far away, at the centre dot
    clean.calibrate();
    dirty.calibrate();
    const a = clean.predict(0, 0)!;
    const b = dirty.predict(0, 0)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01);
  });

  it('is not ok without enough dots or samples, and says why', () => {
    const cal = new GazeCalibration();
    expect(cal.calibrate().ok).toBe(false);
    for (let t = 0; t < 4; t++) for (let i = 0; i < 10; i++) cal.add(t, i, i);
    const r = cal.calibrate();
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/of 9 dots/);
    expect(cal.predict(0, 0)).toBeNull();
    expect(cal.fitted).toBe(false);
  });

  it('is not ok if the gaze never changed between dots (user stared at one spot)', () => {
    const cal = new GazeCalibration();
    CALIBRATION_GRID.forEach((_, t) => {
      for (let i = 0; i < 8; i++) cal.add(t, 3, 2);
    });
    const r = cal.calibrate();
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/barely changed/);
  });

  it('predictions are clamped to the screen', () => {
    const cal = new GazeCalibration();
    collect(cal, 0);
    cal.calibrate();
    const p = cal.predict(1000, -1000)!;
    expect(p.x).toBe(1);
    expect(p.y).toBe(0);
  });

  it('clear() forgets the fit and the samples', () => {
    const cal = new GazeCalibration();
    collect(cal, 0);
    cal.calibrate();
    cal.clear();
    expect(cal.fitted).toBe(false);
    expect(cal.sampleCount(0)).toBe(0);
    expect(cal.result).toBeNull();
  });
});
