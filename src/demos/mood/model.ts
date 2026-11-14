import type { LiveFace } from '../../core/frameStore';
import { EXPRESSIONS } from '../../features/face/expression';
import type { Expression } from '../../features/face/expression';

/** 60 s of history at 4 samples a second. */
const CAPACITY = 240;
const INTERVAL_MS = 250;

export interface MoodSeries {
  /** Sample times (ms), oldest first. */
  t: number[];
  /** One array per expression, in EXPRESSIONS order, 0..1 (NaN where nobody was in view). */
  values: number[][];
}

/**
 * Mood Meter: the average of every visible face's expression scores, sampled 4 times a second into a 60 s
 * history. "Mood" is the app's reading of what faces are doing, not of how people feel.
 */
export class MoodModel {
  paused = false;
  /** Faces in view at the last sample and how many show each expression. */
  faceCount = 0;
  counts: Record<Expression, number> = { happy: 0, sad: 0, angry: 0, surprised: 0, neutral: 0 };
  private readonly t = new Float64Array(CAPACITY);
  private readonly v = EXPRESSIONS.map(() => new Float32Array(CAPACITY));
  private head = 0;
  private size = 0;
  private lastAt = -Infinity;

  /** Records a sample if 250 ms have passed (and not paused). Returns true if it did. */
  sample(now: number, faces: readonly LiveFace[]): boolean {
    this.faceCount = faces.length;
    for (const e of EXPRESSIONS) this.counts[e] = 0;
    for (const f of faces) this.counts[f.expression]++;
    if (this.paused || now - this.lastAt < INTERVAL_MS) return false;
    this.lastAt = now;
    this.t[this.head] = now;
    EXPRESSIONS.forEach((_, k) => {
      let sum = 0;
      for (const f of faces) sum += f.scores[k]!;
      this.v[k]![this.head] = faces.length ? sum / faces.length : Number.NaN;
    });
    this.head = (this.head + 1) % CAPACITY;
    this.size = Math.min(this.size + 1, CAPACITY);
    return true;
  }

  /** The history inside the last `windowMs`, oldest first. */
  read(now: number, windowMs = 60_000): MoodSeries {
    const out: MoodSeries = { t: [], values: EXPRESSIONS.map(() => []) };
    for (let k = this.size - 1; k >= 0; k--) {
      const i = (this.head - 1 - k + CAPACITY) % CAPACITY;
      if (now - this.t[i]! > windowMs) continue;
      out.t.push(this.t[i]!);
      EXPRESSIONS.forEach((_, s) => out.values[s]!.push(this.v[s]![i]!));
    }
    return out;
  }

  /** The expression with the highest average right now, or null with nobody in view. */
  room(): Expression | null {
    if (this.size === 0) return null;
    const i = (this.head - 1 + CAPACITY) % CAPACITY;
    if (Number.isNaN(this.v[0]![i]!)) return null;
    let best = 0;
    for (let k = 1; k < EXPRESSIONS.length; k++) if (this.v[k]![i]! > this.v[best]![i]!) best = k;
    return EXPRESSIONS[best]!;
  }

  reset(): void {
    this.head = 0;
    this.size = 0;
    this.lastAt = -Infinity;
  }
}
