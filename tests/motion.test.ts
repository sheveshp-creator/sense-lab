import { describe, expect, it } from 'vitest';
import { countReversals, HandMotion } from '../src/features/hand/dynamic/motion';

const feed = (xs: number[], dt = 33) => {
  const m = new HandMotion();
  xs.forEach((x, i) => m.push(i * dt, x, 0.5, x, 0.5, 1, 0.2));
  return m;
};

describe('HandMotion ring buffer', () => {
  it('index 0 is the newest sample', () => {
    const m = feed([1, 2, 3]);
    expect([m.px(0), m.px(1), m.px(2)]).toEqual([3, 2, 1]);
    expect(m.t(0)).toBe(66);
  });

  it('wraps around after 64 samples and keeps the newest 64', () => {
    const m = feed(Array.from({ length: 100 }, (_, i) => i));
    expect(m.length).toBe(HandMotion.CAPACITY);
    expect(m.px(0)).toBe(99);
    expect(m.px(63)).toBe(36);
  });

  it('countWithin respects the time window and minT', () => {
    const m = feed(Array.from({ length: 20 }, (_, i) => i)); // 33 ms apart
    expect(m.countWithin(100)).toBe(4); // 0, 33, 66, 99 ms back
    expect(m.countWithin(10_000)).toBe(20);
    expect(m.countWithin(10_000, 330)).toBe(10);
  });

  it('keeps about 2 seconds at 30 fps (more than the ~1 s detectors need)', () => {
    const m = feed(Array.from({ length: 64 }, (_, i) => i));
    expect(m.t(0) - m.t(63)).toBeGreaterThan(2000);
  });
});

describe('countReversals', () => {
  const zig = (n: number, amp: number) =>
    Array.from({ length: n }, (_, i) =>
      Math.floor(i / 5) % 2 === 0 ? (i % 5) * amp : (5 - (i % 5)) * amp,
    );

  it('counts direction changes of a zigzag', () => {
    expect(countReversals(feed(zig(30, 0.05)), 5000, 0.1)).toBeGreaterThanOrEqual(4);
  });

  it('ignores wiggles smaller than the amplitude', () => {
    expect(countReversals(feed(zig(30, 0.005)), 5000, 0.1)).toBe(0);
  });

  it('a straight line has no reversals', () => {
    expect(countReversals(feed(Array.from({ length: 20 }, (_, i) => i * 0.05)), 5000, 0.05)).toBe(
      0,
    );
  });

  it('only looks inside the window', () => {
    const m = feed([...zig(30, 0.05), ...Array.from({ length: 30 }, (_, i) => 0.3 + i * 0.01)]);
    expect(countReversals(m, 600, 0.1)).toBe(0); // the last ~0.6 s is a straight line
  });
});
