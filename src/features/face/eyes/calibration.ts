/**
 * Optional 9-point gaze calibration. The user looks at 9 dots on the screen; for each dot we keep the
 * median gaze vector measured while they looked at it, then fit a plain linear map
 *   screenX = a0 + a1 * gazeX + a2 * gazeY        (and the same for screenY)
 * by least squares. Linear is deliberately simple: with 9 noisy points anything fancier would fit the noise.
 */
export type Vec2 = readonly [number, number];

/** 3 x 3 grid in screen fractions (0..1), row by row, kept away from the very edge. */
export const CALIBRATION_GRID: readonly Vec2[] = [
  [0.1, 0.1],
  [0.5, 0.1],
  [0.9, 0.1],
  [0.1, 0.5],
  [0.5, 0.5],
  [0.9, 0.5],
  [0.1, 0.9],
  [0.5, 0.9],
  [0.9, 0.9],
];

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Solves the 3x3 system A x = b (Gaussian elimination with partial pivoting). Null if singular. */
function solve3(A: number[][], b: number[]): [number, number, number] | null {
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-9) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = c + 1; r < 3; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k < 4; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  const x: number[] = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let s = M[r]![3]!;
    for (let k = r + 1; k < 3; k++) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x as [number, number, number];
}

interface Fit {
  x: [number, number, number];
  y: [number, number, number];
}

function fitPoints(pts: { g: Vec2; s: Vec2 }[]): Fit | null {
  // Normal equations for features [1, gx, gy].
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const bx = [0, 0, 0];
  const by = [0, 0, 0];
  for (const { g, s } of pts) {
    const f = [1, g[0], g[1]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) A[i]![j]! += f[i]! * f[j]!;
      bx[i]! += f[i]! * s[0];
      by[i]! += f[i]! * s[1];
    }
  }
  const x = solve3(A, bx);
  const y = solve3(A, by);
  return x && y ? { x, y } : null;
}

const apply = (f: Fit, gx: number, gy: number): [number, number] => [
  f.x[0] + f.x[1] * gx + f.x[2] * gy,
  f.y[0] + f.y[1] * gx + f.y[2] * gy,
];

export interface CalibrationResult {
  ok: boolean;
  /** RMS distance between the dots and where the fit puts them, in screen fractions. */
  rmsError: number;
  /** Same, but each dot predicted by a fit that never saw it: the honest accuracy estimate. */
  leaveOneOutError: number;
  reason?: string;
}

export class GazeCalibration {
  private readonly samples: Vec2[][] = CALIBRATION_GRID.map(() => []);
  private fit: Fit | null = null;
  result: CalibrationResult | null = null;

  constructor(
    /** Targets need at least this many samples to count. */
    private readonly minSamples = 5,
    /** Targets needed for a fit (3 unknowns per axis; more than 3 averages out noise). */
    private readonly minTargets = 6,
  ) {}

  /** Record one gaze measurement made while the user looks at grid target `target`. */
  add(target: number, gx: number, gy: number): void {
    this.samples[target]?.push([gx, gy]);
  }

  sampleCount(target: number): number {
    return this.samples[target]?.length ?? 0;
  }

  get fitted(): boolean {
    return this.fit !== null;
  }

  /** Fits the map from the collected samples. */
  calibrate(): CalibrationResult {
    const pts: { g: Vec2; s: Vec2 }[] = [];
    this.samples.forEach((s, i) => {
      if (s.length >= this.minSamples) {
        pts.push({
          g: [median(s.map((v) => v[0])), median(s.map((v) => v[1]))],
          s: CALIBRATION_GRID[i]!,
        });
      }
    });
    this.fit = null;
    if (pts.length < this.minTargets) {
      return (this.result = {
        ok: false,
        rmsError: NaN,
        leaveOneOutError: NaN,
        reason: `Only ${pts.length} of 9 dots had enough samples`,
      });
    }
    const f = fitPoints(pts);
    if (!f) {
      return (this.result = {
        ok: false,
        rmsError: NaN,
        leaveOneOutError: NaN,
        reason: 'Your gaze barely changed between dots',
      });
    }
    const rms = Math.sqrt(
      pts.reduce((a, p) => {
        const [x, y] = apply(f, p.g[0], p.g[1]);
        return a + (x - p.s[0]) ** 2 + (y - p.s[1]) ** 2;
      }, 0) / pts.length,
    );
    let loo = 0;
    let looN = 0;
    pts.forEach((p, i) => {
      const g = fitPoints(pts.filter((_, j) => j !== i));
      if (!g) return;
      const [x, y] = apply(g, p.g[0], p.g[1]);
      loo += (x - p.s[0]) ** 2 + (y - p.s[1]) ** 2;
      looN++;
    });
    this.fit = f;
    return (this.result = {
      ok: true,
      rmsError: rms,
      leaveOneOutError: looN ? Math.sqrt(loo / looN) : NaN,
    });
  }

  /** Where on the screen (0..1 each way, clamped) a gaze vector points. Null before calibrating. */
  predict(
    gx: number,
    gy: number,
    out: { x: number; y: number } = { x: 0, y: 0 },
  ): { x: number; y: number } | null {
    if (!this.fit) return null;
    const [x, y] = apply(this.fit, gx, gy);
    out.x = Math.min(1, Math.max(0, x));
    out.y = Math.min(1, Math.max(0, y));
    return out;
  }

  clear(): void {
    this.samples.forEach((s) => (s.length = 0));
    this.fit = null;
    this.result = null;
  }
}
