import { HAND_STRIDE, MAX_HANDS } from '../features/hand/handFormat';

export interface HandFixture {
  kind: 'hands';
  version: 1;
  note: string;
  /** Each frame: t in ms (relative to the first frame) and the raw hands in the handFormat layout. */
  frames: { t: number; hands: number[][] }[];
}

/**
 * Rolling buffer of the latest raw hand results, so a dev button can save the last couple of
 * seconds as a fixture for tests. Preallocated: pushing a frame does not allocate.
 * Stores landmarks only (never images), in line with the privacy rules.
 */
export class HandRecorder {
  private readonly slots: Float32Array[];
  private readonly counts: Int8Array;
  private readonly times: Float64Array;
  private head = 0;
  private size = 0;

  constructor(readonly capacity = 150) {
    this.slots = Array.from({ length: capacity }, () => new Float32Array(MAX_HANDS * HAND_STRIDE));
    this.counts = new Int8Array(capacity);
    this.times = new Float64Array(capacity);
  }

  push(tMs: number, hands: Float32Array, count: number): void {
    const n = Math.min(count, MAX_HANDS);
    this.slots[this.head]!.set(hands.subarray(0, n * HAND_STRIDE));
    this.counts[this.head] = n;
    this.times[this.head] = tMs;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  get length(): number {
    return this.size;
  }

  /** The last `windowMs` of frames as a fixture object. */
  toFixture(windowMs = 2000, note = 'Recorded with the dev record button'): HandFixture {
    const frames: HandFixture['frames'] = [];
    if (this.size === 0) return { kind: 'hands', version: 1, note, frames };
    const lastIdx = (this.head - 1 + this.capacity) % this.capacity;
    const lastT = this.times[lastIdx]!;
    let first = -1;
    for (let k = this.size - 1; k >= 0; k--) {
      const idx = (this.head - 1 - k + this.capacity) % this.capacity;
      const t = this.times[idx]!;
      if (lastT - t > windowMs) continue;
      if (first < 0) first = t;
      const hands: number[][] = [];
      for (let h = 0; h < this.counts[idx]!; h++) {
        const slice = this.slots[idx]!.subarray(h * HAND_STRIDE, (h + 1) * HAND_STRIDE);
        hands.push(Array.from(slice, (v) => Math.round(v * 1e6) / 1e6));
      }
      frames.push({ t: Math.round(t - first), hands });
    }
    return { kind: 'hands', version: 1, note, frames };
  }
}

/** Shared recorder the pipeline writes to and the Hand Lab dev button reads from. */
export const handRecorder = new HandRecorder();
