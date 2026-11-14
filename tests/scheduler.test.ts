import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src/core/scheduler/scheduler';
import { StatsCollector } from '../src/core/stats/collector';

describe('Scheduler', () => {
  it('runs every frame by default', () => {
    const s = new Scheduler();
    s.register('face');
    expect([0, 1, 2, 3].map((f) => s.shouldRun('face', f, f * 33))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
  it('skips frames with everyNFrames', () => {
    const s = new Scheduler();
    s.register('hand', { everyNFrames: 2 });
    expect([0, 1, 2, 3].map((f) => s.shouldRun('hand', f, f * 33))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
  it('enforces minIntervalMs', () => {
    const s = new Scheduler();
    s.register('identity', { minIntervalMs: 500 });
    expect(s.shouldRun('identity', 0, 0)).toBe(true);
    expect(s.shouldRun('identity', 1, 300)).toBe(false);
    expect(s.shouldRun('identity', 2, 500)).toBe(true);
  });
  it('can be reconfigured at runtime', () => {
    const s = new Scheduler();
    s.register('face');
    s.configure('face', { everyNFrames: 2 });
    expect(s.shouldRun('face', 1, 0)).toBe(false);
  });
  it('returns false for unknown tasks and throws on configuring them', () => {
    const s = new Scheduler();
    expect(s.shouldRun('nope', 0, 0)).toBe(false);
    expect(() => s.configure('nope', {})).toThrow();
  });
});

describe('StatsCollector', () => {
  it('derives fps from frame intervals', () => {
    const c = new StatsCollector();
    [0, 20, 40, 60].forEach((t) => c.markFrame(t));
    expect(c.snapshot().frameMs).toBe(20);
    expect(c.snapshot().fps).toBeCloseTo(50);
  });
  it('derives inference fps from result intervals, separate from video fps', () => {
    const c = new StatsCollector();
    [0, 100, 200].forEach((t) => c.markResult(t));
    expect(c.snapshot().inferFps).toBeCloseTo(10);
    expect(c.snapshot().fps).toBe(0);
  });
  it('averages stage timings', () => {
    const c = new StatsCollector();
    c.record('worker', 4);
    c.record('worker', 6);
    expect(c.snapshot().worker).toBe(5);
  });
});

describe('StatsCollector pauses', () => {
  it('a long gap (hidden tab) does not enter the frame-time mean', () => {
    const c = new StatsCollector();
    for (let i = 0; i < 10; i++) c.markFrame(i * 33);
    c.markFrame(10 * 33 + 60_000); // tab was hidden for a minute
    for (let i = 1; i < 10; i++) c.markFrame(10 * 33 + 60_000 + i * 33);
    expect(c.snapshot().frameMs).toBeCloseTo(33, 0);
  });
});
