import { describe, expect, it } from 'vitest';
import { QUALITY_LEVELS, QualityManager } from '../src/core/scheduler/quality';

/** Feeds up to `n` samples of `cost` ms, 33 ms apart, from time `t`; stops at the first level change. */
function feed(q: QualityManager, cost: number, n: number, t: number) {
  let changed: number | null = null;
  for (let i = 0; i < n; i++) {
    t += 33;
    const r = q.sample(cost, t);
    if (r !== null) {
      changed = r;
      break;
    }
  }
  return { changed, t };
}

describe('QualityManager', () => {
  it('stays put while the cost is inside the budget', () => {
    const q = new QualityManager();
    expect(feed(q, 28, 200, 0).changed).toBeNull();
    expect(q.level).toBe(0);
  });

  it('needs a full window before it decides', () => {
    const q = new QualityManager({ window: 30 });
    expect(feed(q, 80, 29, 0).changed).toBeNull();
    expect(feed(q, 80, 1, 29 * 33).changed).toBe(1);
  });

  it('ignores a few slow outliers (median, not mean)', () => {
    const q = new QualityManager();
    let t = 0;
    for (let i = 0; i < 100; i++) {
      t += 33;
      // 1 slow frame in 5: a mean of ~44 ms, but the typical frame is fine
      expect(q.sample(i % 5 === 0 ? 120 : 20, t)).toBeNull();
    }
  });

  it('steps down one level at a time and stops at the lowest', () => {
    const q = new QualityManager();
    let r = feed(q, 60, 30, 0);
    expect(r.changed).toBe(1);
    r = feed(q, 60, 30, r.t);
    expect(r.changed).toBe(2);
    r = feed(q, 90, 300, r.t); // 90 ms misses even the lowest level's 66 ms deadline
    expect(r.changed).toBeNull();
    expect(q.level).toBe(2);
  });

  it('does not use samples from the previous level to decide the next step', () => {
    const q = new QualityManager();
    const r = feed(q, 60, 30, 0);
    expect(r.changed).toBe(1);
    // 29 more slow samples are still not enough: the window restarted at the change
    expect(feed(q, 60, 29, r.t).changed).toBeNull();
  });

  it('steps up only after the cost has been calm for a while', () => {
    const q = new QualityManager({ upAfterMs: 6000 });
    let r = feed(q, 60, 30, 0); // -> level 1
    r = feed(q, 10, 30, r.t); // window full, calm just started
    expect(q.level).toBe(1);
    r = feed(q, 10, 100, r.t); // 3.3 s of calm: still too early
    expect(q.level).toBe(1);
    feed(q, 10, 120, r.t); // well past 6 s
    expect(q.level).toBe(0);
  });

  it('a cost just under the deadline (the margin) changes nothing', () => {
    const q = new QualityManager();
    const r = feed(q, 60, 30, 0); // -> 1 (deadline 33 ms)
    // 32 ms meets the deadline, but not with the 5% margin needed to try a higher level
    expect(feed(q, 32, 1000, r.t).changed).toBeNull();
    expect(q.level).toBe(1);
  });

  it('doubles the wait after a step up that is immediately reverted', () => {
    const q = new QualityManager({ upAfterMs: 2000, revertWithinMs: 20_000 });
    let r = feed(q, 60, 30, 0); // -> 1
    r = feed(q, 10, 120, r.t); // -> 0 after 2 s of calm
    expect(q.level).toBe(0);
    r = feed(q, 60, 30, r.t); // too slow again -> 1: step up reverted, wait becomes 4 s
    expect(q.level).toBe(1);
    r = feed(q, 10, 30 + 80, r.t); // ~2.6 s calm: would have been enough before
    expect(q.level).toBe(1);
    feed(q, 10, 100, r.t); // past 4 s now
    expect(q.level).toBe(0);
  });

  it('set() jumps to a level and clears the evidence', () => {
    const q = new QualityManager();
    feed(q, 60, 29, 0);
    q.set(2);
    expect(q.level).toBe(2);
    expect(feed(q, 60, 29, 1000).changed).toBeNull();
  });

  it('a machine that cannot hold a level only probes it now and then (back-off)', () => {
    const q = new QualityManager();
    let t = 0;
    let ups = 0;
    // 40 ms per frame at every level: level 2 (66 ms deadline) is fine, levels 0 and 1 (33 ms) are not
    for (let i = 0; i < (10 * 60 * 1000) / 33; i++) {
      t += 33;
      const before = q.level;
      const r = q.sample(40, t);
      if (r !== null && r < before) ups++;
    }
    // 10 minutes: waits of 6, 12, 24, 48, 60... s, so about a dozen probes, not one every ~7 s (~85)
    expect(ups).toBeGreaterThan(3);
    expect(ups).toBeLessThanOrEqual(14);
  });

  it('set() jumps to a level and clears the evidence', () => {
    const q = new QualityManager();
    feed(q, 60, 29, 0);
    q.set(2);
    expect(q.level).toBe(2);
    expect(feed(q, 60, 29, 1000).changed).toBeNull();
  });

  it('the levels get cheaper: less cross-checking, then fewer runs', () => {
    const [hi, mid, lo] = QUALITY_LEVELS;
    expect(hi!.gestureEvery).toBeGreaterThan(0);
    expect(mid!.gestureEvery).toBe(0);
    expect(lo!.faceEvery).toBeGreaterThan(mid!.faceEvery);
    expect(lo!.identity).toBe(false);
    expect(QUALITY_LEVELS.map((l) => l.id)).toEqual([0, 1, 2]);
  });
});
