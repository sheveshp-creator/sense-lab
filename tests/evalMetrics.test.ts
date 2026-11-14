import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/features/face/evalMetrics.ts';
import { l2Normalize } from '../src/features/face/matching';
import type { LabeledEmbedding } from '../src/features/face/evalMetrics.ts';

const unit = (...v: number[]) => l2Normalize(Float32Array.from(v));
const person = (name: string, base: number[], n: number, wobble = 0.02): LabeledEmbedding[] =>
  Array.from({ length: n }, (_, i) => ({
    person: name,
    embedding: unit(...base.map((b, k) => b + wobble * Math.sin(i * 1.7 + k))),
  }));

describe('evaluate (false accept / false reject)', () => {
  const T = [0.1, 0.5, 0.9, 0.999];

  it('well separated people: nothing wrong between the clusters', () => {
    const s = [
      ...person('a', [1, 0, 0], 6),
      ...person('b', [0, 1, 0], 6),
      ...person('c', [0, 0, 1], 6),
    ];
    const { results } = evaluate(s, T);
    const mid = results.find((r) => r.threshold === 0.5)!;
    expect(mid.falseRejectRate).toBe(0);
    expect(mid.falseAcceptRate).toBe(0);
    expect(mid.genuine).toBe(18);
    expect(mid.impostor).toBe(18 * 2);
  });

  it('a very high threshold rejects genuine matches; a very low one accepts strangers', () => {
    const s = [...person('a', [1, 0.1, 0], 6, 0.2), ...person('b', [0.6, 1, 0], 6, 0.2)];
    const { results } = evaluate(s, [0.0, 0.9999]);
    expect(results[0]!.falseAcceptRate).toBeGreaterThan(0.5); // threshold 0: strangers get in
    expect(results[1]!.falseRejectRate).toBe(1); // threshold ~1: nobody matches
  });

  it('rates move monotonically with the threshold', () => {
    const s = [
      ...person('a', [1, 0.4, 0], 8, 0.3),
      ...person('b', [0.5, 1, 0.2], 8, 0.3),
      ...person('c', [0, 0.5, 1], 8, 0.3),
    ];
    const th = [0.2, 0.4, 0.6, 0.8, 0.95];
    const { results } = evaluate(s, th);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.falseRejectRate).toBeGreaterThanOrEqual(results[i - 1]!.falseRejectRate);
      expect(results[i]!.falseAcceptRate).toBeLessThanOrEqual(results[i - 1]!.falseAcceptRate);
    }
  });

  it('leave-one-out: a probe is never scored against a mean that contains itself', () => {
    // Person a has an outlier image. If the probe were included in its own mean, the outlier would score
    // high; held out, it must score low.
    const s = [
      ...person('a', [1, 0, 0], 4),
      { person: 'a', embedding: unit(0, 1, 0) },
      ...person('b', [0, 0, 1], 4),
    ];
    const { genuineScores } = evaluate(s, [0.5]);
    expect(Math.min(...genuineScores)).toBeLessThan(0.1);
  });

  it('enrollCount limits how many images build the reference', () => {
    // a: three images near x, then three near y. With enrollCount=2 the reference is x-only,
    // so the y images score badly; with all images the reference is mixed and they score better.
    const a = [...person('a', [1, 0, 0], 3, 0), ...person('a', [0, 1, 0], 3, 0)];
    const b = person('b', [0, 0, 1], 4, 0);
    const limited = evaluate([...a, ...b], [0.5], 3, 2);
    const full = evaluate([...a, ...b], [0.5], 3);
    expect(limited.results[0]!.falseRejectRate).toBeGreaterThan(full.results[0]!.falseRejectRate);
  });

  it('people with too few images are not probes but still count as strangers', () => {
    const s = [
      ...person('a', [1, 0, 0], 5),
      ...person('b', [0, 1, 0], 5),
      ...person('tiny', [0, 0, 1], 1),
    ];
    const { results } = evaluate(s, [0.5], 3);
    expect(results[0]!.genuine).toBe(10); // tiny is not a probe
    expect(results[0]!.impostor).toBe(10 * 2); // but each probe is checked against a, b, tiny minus itself
  });

  it('no data gives zero rates instead of NaN', () => {
    const { results } = evaluate([], [0.5]);
    expect(results[0]).toMatchObject({
      falseRejectRate: 0,
      falseAcceptRate: 0,
      genuine: 0,
      impostor: 0,
    });
  });
});
