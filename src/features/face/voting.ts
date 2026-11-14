/** One identity result: the closest registered person and how close. The threshold is applied later. */
export interface Vote {
  /** Closest person's ID, or null if nobody is registered. */
  bestId: string | null;
  /** Cosine similarity to that person. */
  score: number;
}

export interface Verdict {
  /** 'identifying' until enough samples came in, then 'known' or 'unknown'. */
  state: 'identifying' | 'known' | 'unknown';
  personId: string | null;
  /** Mean score of the votes that agree with the verdict. */
  confidence: number;
  votes: number;
}

/**
 * Majority vote over each tracked face's last N identity results, so a single bad sample cannot make
 * the label flicker. The plurality wins; on a tie the previous winner stays if it is one of the tied
 * labels, otherwise "Unknown" wins (when in doubt, do not name someone).
 */
export class IdentityVoter {
  private readonly history = new Map<number, Vote[]>();
  private readonly last = new Map<number, string | null>();

  constructor(
    private readonly window = 5,
    /** Samples needed before a name is shown. */
    private readonly minVotes = 2,
  ) {}

  push(trackId: number, vote: Vote): void {
    let h = this.history.get(trackId);
    if (!h) this.history.set(trackId, (h = []));
    h.push(vote);
    if (h.length > this.window) h.shift();
  }

  /**
   * The current label. The threshold is applied here, not when a vote is stored, so moving the
   * threshold slider immediately re-judges the samples already collected.
   */
  verdict(trackId: number, threshold: number): Verdict {
    const h = (this.history.get(trackId) ?? []).map((v) => ({
      personId: v.bestId !== null && v.score >= threshold ? v.bestId : null,
      score: v.score,
    }));
    if (h.length < this.minVotes)
      return { state: 'identifying', personId: null, confidence: 0, votes: h.length };
    const counts = new Map<string | null, number>();
    for (const v of h) counts.set(v.personId, (counts.get(v.personId) ?? 0) + 1);
    const top = Math.max(...counts.values());
    const tied = [...counts.entries()].filter(([, n]) => n === top).map(([id]) => id);
    const prev = this.last.has(trackId) ? this.last.get(trackId)! : undefined;
    const winner =
      tied.length === 1
        ? tied[0]!
        : tied.includes(prev ?? null) && prev !== undefined
          ? prev
          : null;
    this.last.set(trackId, winner);
    const agreeing = h.filter((v) => v.personId === winner);
    const scores = agreeing.length ? agreeing : h; // unknown with no unknown votes: fall back to all
    const confidence = scores.reduce((a, v) => a + v.score, 0) / scores.length;
    return {
      state: winner === null ? 'unknown' : 'known',
      personId: winner,
      confidence,
      votes: h.length,
    };
  }

  forget(trackId: number): void {
    this.history.delete(trackId);
    this.last.delete(trackId);
  }

  clear(): void {
    this.history.clear();
    this.last.clear();
  }
}
