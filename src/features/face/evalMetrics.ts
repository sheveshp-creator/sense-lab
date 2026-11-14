// Plain functions only: the eval script in scripts/ loads this file directly in Node.
import { cosine, meanEmbedding } from './matching.ts';

export interface LabeledEmbedding {
  person: string;
  embedding: Float32Array;
}

export interface ThresholdResult {
  threshold: number;
  /** Share of same-person comparisons that scored below the threshold (a real person turned away). */
  falseRejectRate: number;
  /** Share of different-person comparisons that scored at or above it (a stranger let in). */
  falseAcceptRate: number;
  genuine: number;
  impostor: number;
}

/**
 * Leave-one-out evaluation that mirrors how the app works (a person is a mean of their samples):
 * for every image, build its person's mean from their OTHER images, then
 *  - genuine: score the image against that mean,
 *  - impostor: score the image against every other person's full mean.
 * People with fewer than minImages images are skipped as probes (they still count as impostors).
 * `enrollCount` limits how many other images build the person's mean (the app builds it from the 5-10
 * frames of one registration session, so a small number is the realistic case). Impostor means always
 * use the same limit, taken from the first images in the folder.
 */
export function evaluate(
  samples: LabeledEmbedding[],
  thresholds: number[],
  minImages = 3,
  enrollCount = Infinity,
): { results: ThresholdResult[]; genuineScores: number[]; impostorScores: number[] } {
  const byPerson = new Map<string, Float32Array[]>();
  for (const s of samples) byPerson.set(s.person, [...(byPerson.get(s.person) ?? []), s.embedding]);
  const means = new Map<string, Float32Array>();
  for (const [p, e] of byPerson) means.set(p, meanEmbedding(e.slice(0, enrollCount)));

  const genuineScores: number[] = [];
  const impostorScores: number[] = [];
  for (const [person, embs] of byPerson) {
    if (embs.length < minImages) continue;
    embs.forEach((probe, i) => {
      const others = embs.filter((_, j) => j !== i).slice(0, enrollCount);
      genuineScores.push(cosine(probe, meanEmbedding(others)));
      for (const [other, mean] of means)
        if (other !== person) impostorScores.push(cosine(probe, mean));
    });
  }
  const results = thresholds.map((threshold) => ({
    threshold,
    falseRejectRate:
      genuineScores.filter((s) => s < threshold).length / Math.max(1, genuineScores.length),
    falseAcceptRate:
      impostorScores.filter((s) => s >= threshold).length / Math.max(1, impostorScores.length),
    genuine: genuineScores.length,
    impostor: impostorScores.length,
  }));
  return { results, genuineScores, impostorScores };
}
