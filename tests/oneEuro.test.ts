import { describe, expect, it } from 'vitest';
import { OneEuroFilterArray } from '../src/core/tracking/oneEuro';
import signal from './fixtures/noisy_signal.json';

const std = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

function filterAll(xs: number[]): number[] {
  const f = new OneEuroFilterArray(1);
  const out = new Float32Array(1);
  return xs.map((x, i) => {
    f.filter([x], out, (i * signal.dtMs) / 1000);
    return out[0]!;
  });
}

describe('OneEuroFilterArray', () => {
  it('passes the first sample through unchanged', () => {
    const f = new OneEuroFilterArray(2);
    const out = new Float32Array(2);
    f.filter([0.3, 0.7], out, 0);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(0.7);
  });

  it('removes most jitter from a still signal', () => {
    const noisy = signal.still.slice(10);
    const smooth = filterAll(signal.still).slice(10);
    expect(std(smooth)).toBeLessThan(std(noisy) / 3);
  });

  it('follows a moving signal with small lag', () => {
    const smooth = filterAll(signal.ramp);
    const i = signal.ramp.length - 1;
    const truth = 0.2 + i * 0.004;
    // A speed-adaptive filter should be within a few frames of motion (0.004 per frame).
    expect(Math.abs(smooth[i]! - truth)).toBeLessThan(0.004 * 4);
  });

  it('lags less than a 5-sample moving average on the ramp', () => {
    const smooth = filterAll(signal.ramp);
    const ma = (i: number) => signal.ramp.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5;
    const i = signal.ramp.length - 1;
    const truth = 0.2 + i * 0.004;
    expect(Math.abs(smooth[i]! - truth)).toBeLessThanOrEqual(Math.abs(ma(i) - truth));
  });

  it('handles repeated timestamps without NaN', () => {
    const f = new OneEuroFilterArray(1);
    const out = new Float32Array(1);
    f.filter([1], out, 1);
    f.filter([2], out, 1);
    expect(out[0]).toBe(1);
  });

  it('reset() restarts from the next sample', () => {
    const f = new OneEuroFilterArray(1);
    const out = new Float32Array(1);
    f.filter([0], out, 0);
    f.reset();
    f.filter([5], out, 10);
    expect(out[0]).toBe(5);
  });
});
