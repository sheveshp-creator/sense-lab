import { afterEach, describe, expect, it } from 'vitest';
import { framesFromFixture, run } from './helpers/runHands';
import { move, seq, still, toFixture } from './helpers/scenes';
import { POSES } from './helpers/makeHand';
import { SwipeMeter } from '../src/demos/slides/meter';
import {
  SWIPE_CONFIGS,
  setSwipeSensitivity,
  swipeTuning,
} from '../src/features/hand/dynamic/swipeSensitivity';
import type { SwipeSensitivity } from '../src/features/hand/dynamic/swipeSensitivity';
import type { GestureEvent } from '../src/features/hand/types';
import wave from './fixtures/synthetic_wave.json';
import talking from './fixtures/synthetic_talking_idle.json';
import typing from './fixtures/synthetic_typing.json';
import slowSweep from './fixtures/synthetic_slow_sweep.json';
import swipeLeft from './fixtures/real_swipe_left.json';
import swipeRight from './fixtures/real_swipe_right.json';

const OPEN = POSES.openPalm!;
const swipes = (events: GestureEvent[]) => events.filter((e) => e.id.startsWith('swipe'));
const replay = (fx: unknown) =>
  run(framesFromFixture(fx as Parameters<typeof framesFromFixture>[0])).events;
const withLevel = <T>(level: SwipeSensitivity, fn: () => T): T => {
  swipeTuning.level = level;
  try {
    return fn();
  } finally {
    swipeTuning.level = 'normal';
  }
};

afterEach(() => {
  swipeTuning.level = 'normal';
});

// About 1.7 palm lengths in 0.36 s: quick enough, but shorter than the 2 palms the normal level needs.
const shortSweep = () =>
  toFixture(
    'scene',
    seq(
      (t) => still(OPEN, [0.5, 0.5], 8, t),
      (t) => move(OPEN, [0.5, 0.5], [0.8, 0.5], 11, t),
      (t) => still(OPEN, [0.8, 0.5], 12, t),
    ),
  );

describe('swipe sensitivity', () => {
  it('normal rejects a sweep that is a little short, easy and easiest accept it', () => {
    const fx = shortSweep();
    expect(swipes(withLevel('normal', () => replay(fx)))).toEqual([]);
    expect(swipes(withLevel('easy', () => replay(fx))).map((e) => e.id)).toEqual(['swipeRight']);
    expect(swipes(withLevel('easiest', () => replay(fx))).map((e) => e.id)).toEqual(['swipeRight']);
  });

  it('the real recorded swipes still fire exactly once at every level', () => {
    for (const level of ['normal', 'easy', 'easiest'] as const) {
      expect(swipes(withLevel(level, () => replay(swipeLeft))).map((e) => e.id)).toEqual([
        'swipeLeft',
      ]);
      expect(swipes(withLevel(level, () => replay(swipeRight))).map((e) => e.id)).toEqual([
        'swipeRight',
      ]);
    }
  });

  it('the easier levels still ignore waving, idle talking and typing (the false-trigger recordings)', () => {
    for (const level of ['easy', 'easiest'] as const) {
      for (const [name, fx] of [
        ['wave', wave],
        ['talking', talking],
        ['typing', typing],
      ] as const) {
        expect(swipes(withLevel(level, () => replay(fx))), `${level}: ${name}`).toEqual([]);
      }
    }
  });

  it('easy still ignores the slow sweep (speed guard); easiest is allowed to accept it', () => {
    expect(swipes(withLevel('easy', () => replay(slowSweep)))).toEqual([]);
  });

  it('setSwipeSensitivity changes the level the detector reads', () => {
    setSwipeSensitivity('easy');
    expect(swipeTuning.level).toBe('easy');
    setSwipeSensitivity('normal');
    expect(swipeTuning.level).toBe('normal');
  });

  it('every level is easier than the one before it', () => {
    const n = SWIPE_CONFIGS.normal;
    const e = SWIPE_CONFIGS.easy;
    const x = SWIPE_CONFIGS.easiest;
    expect(e.minDistance).toBeLessThan(n.minDistance);
    expect(x.minDistance).toBeLessThan(e.minDistance);
    expect(e.minSpeed).toBeLessThan(n.minSpeed);
    expect(x.minSpeed).toBeLessThan(e.minSpeed);
  });
});

describe('SwipeMeter', () => {
  const S = { minDistance: 2, minSpeed: 3.5, windowMs: 450 };
  const PALM = 0.18;
  /** Moves `palms` palm lengths sideways over `ms`, sampled every 33 ms. */
  const sweep = (m: SwipeMeter, t0: number, x0: number, palms: number, ms: number) => {
    const n = Math.round(ms / 33);
    for (let i = 0; i <= n; i++) m.push(t0 + i * 33, x0 + (palms * PALM * i) / n, PALM);
    return t0 + n * 33;
  };

  it('reads 0 for a hand that is not moving', () => {
    const m = new SwipeMeter();
    sweep(m, 0, 0.5, 0, 400);
    const r = m.read(400, S);
    expect(r.distance).toBeCloseTo(0, 2);
    expect(r.speed).toBeCloseTo(0, 2);
  });

  it('reaches 1 on both bars for a swipe that is just enough', () => {
    const m = new SwipeMeter();
    const end = sweep(m, 0, 0.3, 2, 400); // 2 palms in 0.4 s = 5 palms/s
    const r = m.read(end, S);
    expect(r.distance).toBeGreaterThanOrEqual(0.95);
    expect(r.speed).toBeGreaterThanOrEqual(1);
  });

  it('shows a short sweep as a partly filled distance bar, speed fine', () => {
    const m = new SwipeMeter();
    const end = sweep(m, 0, 0.3, 1, 200); // 1 palm in 0.2 s
    const r = m.read(end, S);
    expect(r.distance).toBeCloseTo(0.5, 1);
    expect(r.speed).toBeGreaterThan(1);
  });

  it('shows a slow sweep as a partly filled speed bar', () => {
    const m = new SwipeMeter();
    const end = sweep(m, 0, 0.1, 2, 1400); // 2 palms but over 1.4 s: only the last 450 ms count
    const r = m.read(end, S);
    expect(r.speed).toBeLessThan(0.6);
  });

  it('keeps the best attempt visible for a moment after the hand stops, then lets it go', () => {
    const m = new SwipeMeter();
    let t = sweep(m, 0, 0.3, 2.5, 400);
    m.read(t, S);
    const best = m.peak.distance;
    expect(best).toBeGreaterThan(1);
    for (let i = 0; i < 20; i++) {
      t += 33;
      m.push(t, 0.3 + 2.5 * PALM, PALM);
      m.read(t, S);
    }
    expect(m.peak.distance).toBeCloseTo(best, 1); // still showing the swipe 0.6 s later
    for (let i = 0; i < 80; i++) {
      t += 33;
      m.push(t, 0.3 + 2.5 * PALM, PALM);
      m.read(t, S);
    }
    expect(m.peak.distance).toBeLessThan(0.2); // 2.6 s of stillness: gone
  });

  it('clear() forgets the motion', () => {
    const m = new SwipeMeter();
    const end = sweep(m, 0, 0.3, 2.5, 400);
    m.clear();
    expect(m.read(end + 33, S).distance).toBe(0);
  });
});
