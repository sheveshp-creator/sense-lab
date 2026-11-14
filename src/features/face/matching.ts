// Plain functions only (no imports, no enums): the eval script in scripts/ loads this file directly in Node.

export function l2Normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  const n = Math.sqrt(s);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

/** Cosine similarity. Both vectors are expected to be L2-normalised already, so this is a dot product. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

/** Mean of embeddings, re-normalised to unit length (the "centroid" of a person's samples). */
export function meanEmbedding(embeddings: ArrayLike<number>[]): Float32Array {
  const dim = embeddings[0]?.length ?? 0;
  const m = new Float32Array(dim);
  for (const e of embeddings) for (let i = 0; i < dim; i++) m[i]! += e[i]!;
  return l2Normalize(m);
}

export interface Candidate {
  id: string;
  name: string;
  mean: ArrayLike<number>;
}

export interface MatchResult {
  /** The matched person, or null for "Unknown". */
  personId: string | null;
  name: string | null;
  /** Cosine similarity to the closest person, even when it is below the threshold. */
  score: number;
  /** Closest person regardless of the threshold (for diagnostics). */
  bestId: string | null;
}

/** Compares a face against every person; the closest wins if it reaches the threshold. */
export function matchPerson(
  query: ArrayLike<number>,
  people: readonly Candidate[],
  threshold: number,
): MatchResult {
  let best: Candidate | null = null;
  let bestScore = -Infinity;
  for (const p of people) {
    const s = cosine(query, p.mean);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  if (!best) return { personId: null, name: null, score: 0, bestId: null };
  const known = bestScore >= threshold;
  return {
    personId: known ? best.id : null,
    name: known ? best.name : null,
    score: bestScore,
    bestId: best.id,
  };
}
