import { describe, expect, it } from 'vitest';
import { cosine, l2Normalize, matchPerson, meanEmbedding } from '../src/features/face/matching';
import real from './fixtures/identity_embeddings.json';

const unit = (...v: number[]) => l2Normalize(Float32Array.from(v));

describe('cosine matching', () => {
  it('l2Normalize gives unit length and leaves a zero vector alone', () => {
    const v = l2Normalize(Float32Array.from([3, 4]));
    expect(Math.hypot(v[0]!, v[1]!)).toBeCloseTo(1, 6);
    expect(Array.from(l2Normalize(new Float32Array(3)))).toEqual([0, 0, 0]);
  });

  it('cosine: identical = 1, orthogonal = 0, opposite = -1', () => {
    expect(cosine(unit(1, 2, 3), unit(1, 2, 3))).toBeCloseTo(1, 6);
    expect(cosine(unit(1, 0), unit(0, 1))).toBeCloseTo(0, 6);
    expect(cosine(unit(1, 0), unit(-1, 0))).toBeCloseTo(-1, 6);
  });

  it('meanEmbedding is the normalised centroid', () => {
    const m = meanEmbedding([unit(1, 0), unit(0, 1)]);
    expect(m[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(m[1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(Math.hypot(m[0]!, m[1]!)).toBeCloseTo(1, 6);
  });

  const people = [
    { id: 'a', name: 'Alice', mean: unit(1, 0, 0) },
    { id: 'b', name: 'Bob', mean: unit(0, 1, 0) },
  ];

  it('picks the closest person when they reach the threshold', () => {
    const m = matchPerson(unit(0.9, 0.1, 0), people, 0.5);
    expect(m.personId).toBe('a');
    expect(m.name).toBe('Alice');
    expect(m.score).toBeGreaterThan(0.9);
  });

  it('is Unknown below the threshold, but still reports the best score and who it was closest to', () => {
    const m = matchPerson(unit(0.3, 0.2, 0.9), people, 0.5);
    expect(m.personId).toBeNull();
    expect(m.name).toBeNull();
    expect(m.bestId).toBe('a');
    expect(m.score).toBeLessThan(0.5);
  });

  it('the threshold is inclusive', () => {
    const q = unit(1, 0, 0);
    expect(matchPerson(q, people, 1).personId).toBe('a');
    expect(matchPerson(q, people, 1.0001).personId).toBeNull();
  });

  it('with nobody registered it returns Unknown and score 0', () => {
    expect(matchPerson(unit(1, 0), [], 0.5)).toEqual({
      personId: null,
      name: null,
      score: 0,
      bestId: null,
    });
  });

  it('compares against every person, not just the first', () => {
    const m = matchPerson(unit(0, 1, 0), people, 0.5);
    expect(m.personId).toBe('b');
  });
});

describe('matching on REAL SFace embeddings (public LFW photos of 6 people)', () => {
  type S = { person: string; embedding: number[] };
  const samples = real.samples as S[];
  const names = [...new Set(samples.map((s) => s.person))];
  const registered = names.slice(0, 5); // the 6th person is never registered: the "stranger"
  const stranger = names[5]!;
  const of = (p: string) =>
    samples.filter((s) => s.person === p).map((s) => Float32Array.from(s.embedding));

  // Register each person from their first 5 photos; probe with the other 3.
  const gallery = registered.map((p) => ({
    id: p,
    name: p,
    mean: meanEmbedding(of(p).slice(0, 5)),
  }));

  it('has the expected shape', () => {
    expect(real.dim).toBe(128);
    expect(names).toHaveLength(6);
    for (const s of samples) expect(Math.hypot(...s.embedding)).toBeCloseTo(1, 3);
  });

  it('names every held-out photo of a registered person correctly at the default threshold (0.5)', () => {
    let correct = 0;
    let total = 0;
    for (const p of registered) {
      for (const e of of(p).slice(5)) {
        total++;
        if (matchPerson(e, gallery, 0.5).personId === p) correct++;
      }
    }
    expect(total).toBe(15);
    expect(correct).toBe(total);
  });

  it('shows the unregistered person as Unknown at 0.5', () => {
    for (const e of of(stranger)) expect(matchPerson(e, gallery, 0.5).personId).toBeNull();
  });

  it('a threshold that is too low lets the stranger in: the slider matters', () => {
    const accepted = of(stranger).filter(
      (e) => matchPerson(e, gallery, 0.15).personId !== null,
    ).length;
    expect(accepted).toBeGreaterThan(0);
  });

  it('same-person scores are well above different-person scores', () => {
    const same: number[] = [];
    const diff: number[] = [];
    for (const g of gallery) {
      for (const p of names) {
        for (const e of of(p).slice(5)) (p === g.id ? same : diff).push(cosine(e, g.mean));
      }
    }
    expect(Math.min(...same)).toBeGreaterThan(Math.max(...diff));
  });
});
