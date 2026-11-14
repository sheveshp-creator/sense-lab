/** The five expressions the app reports. The UI calls them "expressions", not "emotions": they describe
 *  what the face is doing, not what the person feels. */
export const EXPRESSIONS = ['happy', 'sad', 'angry', 'surprised', 'neutral'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/**
 * A classifier turns one face's blendshape scores into a score per expression (0..1, in EXPRESSIONS
 * order) and a label. The rest of the app only knows this interface, so the rule-based v1 can be
 * replaced by a trained model without touching the smoother, the UI or the tests that use it.
 * The label must be the expression with the highest score, so the meter and the label agree.
 */
export interface ExpressionClassifier {
  readonly id: string;
  classify(blendshapes: ArrayLike<number>, out: Float32Array): Expression;
}
