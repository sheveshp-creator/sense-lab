/**
 * Eye aspect ratio (EAR) from the landmarks: eye height over eye width. Used as a fallback blink
 * signal when the blendshape scores are not available. Six points per eye, the classic EAR set
 * mapped onto MediaPipe's mesh indices: [outer corner, upper 1, upper 2, inner corner, lower 2, lower 1].
 */
const EYE_A = [33, 160, 158, 133, 153, 144] as const;
const EYE_B = [362, 385, 387, 263, 373, 380] as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function ear(lm: ArrayLike<number>, p: readonly number[], aspect: number): number {
  const d = (i: number, j: number) =>
    Math.hypot((lm[i * 3]! - lm[j * 3]!) * aspect, lm[i * 3 + 1]! - lm[j * 3 + 1]!);
  const [p1, p2, p3, p4, p5, p6] = p as [number, number, number, number, number, number];
  const width = d(p1, p4);
  return width > 0 ? (d(p2, p6) + d(p3, p5)) / (2 * width) : 0;
}

/** Mean EAR of both eyes. About 0.25-0.35 open, below 0.15 closed. */
export function eyeAspectRatio(lm: ArrayLike<number>, aspect = 1): number {
  return (ear(lm, EYE_A, aspect) + ear(lm, EYE_B, aspect)) / 2;
}

/**
 * Turns EAR into the same 0..1 closure signal the blink detector uses. EAR differs between people, so
 * the "open" level is learned: the highest recent EAR, decaying slowly so it adapts if the user moves.
 */
export class EarClosure {
  private open = 0;

  constructor(
    /** Per-update decay of the learned open level. 0.999 at 30 Hz forgets over about half a minute. */
    private readonly decay = 0.999,
  ) {}

  update(earValue: number): number {
    this.open = Math.max(this.open * this.decay, earValue);
    if (this.open <= 0) return 0;
    // EAR falls to about 20-30% of its open value when the eye closes: 1 at 30%.
    return clamp01((1 - earValue / this.open) / 0.7);
  }

  reset(): void {
    this.open = 0;
  }
}
