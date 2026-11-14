import { BS } from '../blendshapes';
import { EXPRESSIONS } from './types';
import type { Expression, ExpressionClassifier } from './types';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0 at or below `lo`, 1 at or above `hi`, linear in between. */
const ramp = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo));

/**
 * Thresholds and weights of the v1 rules. They were read off the distributions of real photos (posed
 * CK+ and in-the-wild AffectNet, see the README) and then adjusted by a small search on a TUNING split
 * only; accuracy is reported on photos held out from that. Every number has a plain meaning:
 * "this blendshape starts to count at lo and counts fully at hi".
 */
export interface RuleParams {
  smileLo: number;
  smileHi: number;
  /** Brow raise (inner and outer) starts to count at upLo, fully at upHi. */
  upLo: number;
  upHi: number;
  /** Surprise = brows up + jaw open + eyes wide, with these weights. */
  surpriseBrow: number;
  surpriseJaw: number;
  surpriseWide: number;
  /** Anger = brows pulled down + eyes squinted + lips pressed. */
  downLo: number;
  downHi: number;
  angerDown: number;
  angerSquint: number;
  angerPress: number;
  /** Sadness = inner brows raised more than the outer ones, plus a pushed-up or pursed lower lip. */
  sadLo: number;
  sadHi: number;
  sadBrow: number;
  sadMouth: number;
  /** An expression must reach this evidence level or the face counts as neutral. */
  minEvidence: number;
}

export const DEFAULT_RULES: RuleParams = {
  smileLo: 0.23,
  smileHi: 0.84,
  upLo: 0,
  upHi: 0.71,
  surpriseBrow: 0.5,
  surpriseJaw: 0.46,
  surpriseWide: 0.4,
  downLo: 0.18,
  downHi: 0.7,
  angerDown: 0.77,
  angerSquint: 0.35,
  angerPress: 0.12,
  sadLo: 0.04,
  sadHi: 0.64,
  sadBrow: 0.77,
  sadMouth: 0.43,
  minEvidence: 0.21,
};

const HAPPY = 0,
  SAD = 1,
  ANGRY = 2,
  SURPRISED = 3,
  NEUTRAL = 4;

/**
 * v1: rules over the 52 blendshape scores. Each expression gets an evidence score from the few
 * blendshapes that define it; a smile suppresses the others (a laughing mouth also opens the jaw and
 * raises the brows), raised brows suppress anger. "Neutral" is a real competing score that falls as
 * any expression's evidence rises and wins exactly when none reaches `minEvidence`.
 *
 * Known weak spots, measured: sad and angry overlap with neutral in ordinary photos, and the model's
 * mouthFrown, cheekSquint and noseSneer outputs are almost always zero, so no rule leans on them.
 */
export class RuleBasedClassifier implements ExpressionClassifier {
  readonly id = 'rules-v1';
  private readonly neutralK: number;

  constructor(private readonly p: RuleParams = DEFAULT_RULES) {
    // Neutral = 1 - k * strongest evidence. It beats an expression with evidence e exactly when
    // 1 - k*e > e, i.e. e < 1/(1+k); choosing k = 1/minEvidence - 1 puts that boundary at minEvidence.
    this.neutralK = 1 / p.minEvidence - 1;
  }

  classify(b: ArrayLike<number>, out: Float32Array): Expression {
    const p = this.p;
    const smile = (b[BS.mouthSmileLeft]! + b[BS.mouthSmileRight]!) / 2;
    const innerUp = b[BS.browInnerUp]!;
    const outerUp = (b[BS.browOuterUpLeft]! + b[BS.browOuterUpRight]!) / 2;
    const down = (b[BS.browDownLeft]! + b[BS.browDownRight]!) / 2;
    const squint = (b[BS.eyeSquintLeft]! + b[BS.eyeSquintRight]!) / 2;
    const wide = (b[BS.eyeWideLeft]! + b[BS.eyeWideRight]!) / 2;
    const press = (b[BS.mouthPressLeft]! + b[BS.mouthPressRight]!) / 2;
    const frown = (b[BS.mouthFrownLeft]! + b[BS.mouthFrownRight]!) / 2;
    const jaw = b[BS.jawOpen]!;

    const happy = ramp(smile, p.smileLo, p.smileHi);
    const brows = (ramp(innerUp, p.upLo, p.upHi) + ramp(outerUp, p.upLo, p.upHi)) / 2;

    const surprised =
      (p.surpriseBrow * brows +
        p.surpriseJaw * ramp(jaw, 0.1, 0.55) +
        p.surpriseWide * ramp(wide, 0.03, 0.3)) *
      (1 - 0.9 * happy);
    const angry =
      (p.angerDown * ramp(down, p.downLo, p.downHi) +
        p.angerSquint * ramp(squint, 0.3, 0.7) +
        p.angerPress * ramp(press, 0.1, 0.4)) *
      (1 - 0.9 * happy) *
      (1 - 0.8 * brows);
    const sadBrow = ramp(innerUp - 0.6 * outerUp, p.sadLo, p.sadHi);
    const lowerLip = Math.max(
      ramp(b[BS.mouthShrugLower]!, 0.05, 0.4),
      ramp(b[BS.mouthPucker]!, 0.1, 0.6),
      ramp(frown, 0.05, 0.3),
    );
    const sad =
      (p.sadBrow * sadBrow + p.sadMouth * lowerLip) *
      (1 - 0.9 * happy) *
      (1 - 0.6 * ramp(jaw, 0.1, 0.5));

    // The weights of an expression can add up to more than 1, so keep every score a valid 0..1.
    const h = clamp01(happy);
    const sd = clamp01(sad);
    const an = clamp01(angry);
    const su = clamp01(surprised);
    out[HAPPY] = h;
    out[SAD] = sd;
    out[ANGRY] = an;
    out[SURPRISED] = su;
    const strongest = Math.max(h, sd, an, su);
    out[NEUTRAL] = clamp01(1 - this.neutralK * strongest);

    let best = 0;
    for (let i = 1; i < EXPRESSIONS.length; i++) if (out[i]! > out[best]!) best = i;
    return EXPRESSIONS[best]!;
  }
}
