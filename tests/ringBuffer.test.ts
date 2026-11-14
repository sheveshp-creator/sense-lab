import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../src/core/stats/ringBuffer';

describe('RingBuffer', () => {
  it('returns 0 mean when empty', () => {
    expect(new RingBuffer(3).mean()).toBe(0);
  });
  it('averages partially filled buffer', () => {
    const b = new RingBuffer(4);
    b.push(2);
    b.push(4);
    expect(b.length).toBe(2);
    expect(b.mean()).toBe(3);
  });
  it('overwrites the oldest value when full', () => {
    const b = new RingBuffer(3);
    [1, 2, 3, 10].forEach((v) => b.push(v));
    expect(b.length).toBe(3);
    expect(b.mean()).toBe((2 + 3 + 10) / 3);
  });
  it('clear resets state', () => {
    const b = new RingBuffer(2);
    b.push(5);
    b.clear();
    expect(b.length).toBe(0);
    expect(b.mean()).toBe(0);
  });
  it('rejects invalid capacity', () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(1.5)).toThrow();
  });
});
