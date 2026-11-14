/**
 * Fixed-size ring buffer of numbers with a running sum, so mean() is O(1).
 * Backed by a Float64Array: pushing never allocates (hot path, called every frame).
 */
export class RingBuffer {
  private readonly data: Float64Array;
  private head = 0;
  private size = 0;
  private sum = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('RingBuffer capacity must be a positive integer');
    }
    this.data = new Float64Array(capacity);
  }

  get length(): number {
    return this.size;
  }

  push(value: number): void {
    if (this.size === this.capacity) {
      this.sum -= this.data[this.head]!; // overwrite the oldest value
    } else {
      this.size++;
    }
    this.data[this.head] = value;
    this.sum += value;
    this.head = (this.head + 1) % this.capacity;
  }

  /** Mean of the stored values, or 0 when empty. */
  mean(): number {
    return this.size === 0 ? 0 : this.sum / this.size;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
    this.sum = 0;
  }
}
