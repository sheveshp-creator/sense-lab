import { describe, expect, it } from 'vitest';
import {
  FINGER_CLOSED,
  FINGER_HALF,
  FINGER_OPEN,
  FingerAnalyzer,
  nextFingerState,
} from '../src/features/hand/fingers';
import { HAND_LANDMARK_FLOATS, HAND_WORLD_OFFSET } from '../src/features/hand/handFormat';
import { makeHand, POSES } from './helpers/makeHand';
import type { HandSpec } from './helpers/makeHand';
import { framesFromFixture } from './helpers/runHands';
import peace from './fixtures/hand_peace.json';
import fist from './fixtures/hand_fist.json';

const analyze = (spec: HandSpec) => {
  const h = makeHand(spec);
  const lm = h.slice(0, HAND_LANDMARK_FLOATS);
  const w = h.slice(HAND_WORLD_OFFSET, HAND_WORLD_OFFSET + HAND_LANDMARK_FLOATS);
  return new FingerAnalyzer().analyze(1, 'Right', 0.9, lm, w, 0);
};

describe('finger curl and state', () => {
  it('open hand: every finger open, low curl', () => {
    const f = analyze(POSES.openPalm!);
    expect(Array.from(f.state)).toEqual([0, 0, 0, 0, 0]);
    for (let i = 0; i < 5; i++) expect(f.curl[i]).toBeLessThan(0.3);
  });

  it('fist: every finger closed', () => {
    const f = analyze(POSES.fist!);
    expect(Array.from(f.state)).toEqual([2, 2, 2, 2, 2]);
  });

  it('half-curled fingers read as half', () => {
    const f = analyze({ curl: [0.5, 0.5, 0.5, 0.5], thumb: 'out' });
    expect([1, 2, 3, 4].map((i) => f.state[i])).toEqual([
      FINGER_HALF,
      FINGER_HALF,
      FINGER_HALF,
      FINGER_HALF,
    ]);
  });

  it('curl rises monotonically with finger bend', () => {
    const curls = [0, 0.25, 0.5, 0.75, 1].map(
      (c) => analyze({ curl: [c, 0, 0, 0], thumb: 'out' }).curl[1]!,
    );
    for (let i = 1; i < curls.length; i++) expect(curls[i]!).toBeGreaterThan(curls[i - 1]!);
  });

  it('thumb: out reads open, tucked across the palm reads closed', () => {
    expect(analyze({ curl: [1, 1, 1, 1], thumb: 'out' }).state[0]).toBe(FINGER_OPEN);
    expect(analyze({ curl: [1, 1, 1, 1], thumb: 'tucked' }).state[0]).toBe(FINGER_CLOSED);
  });

  it('is independent of hand position and size in the image (uses world coordinates)', () => {
    const a = analyze({ ...POSES.peace!, cx: 0.2, cy: 0.3 });
    const b = analyze({ ...POSES.peace!, cx: 0.8, cy: 0.7 });
    expect(Array.from(b.state)).toEqual(Array.from(a.state));
  });

  it('fingertip speed is ~0 for a still hand and positive when it moves', () => {
    const an = new FingerAnalyzer();
    const still = makeHand(POSES.openPalm!);
    const moved = makeHand({ ...POSES.openPalm!, cx: 0.6 });
    const call = (h: Float32Array, t: number) =>
      an.analyze(1, 'Right', 0.9, h.slice(0, 63), h.slice(63, 126), t);
    call(still, 0);
    expect(call(still, 33).tipSpeed[1]).toBeCloseTo(0, 5);
    expect(call(moved, 66).tipSpeed[1]).toBeGreaterThan(1); // 0.1 shift in 33 ms
  });

  it('hysteresis: a value hovering at a boundary does not flicker', () => {
    let s = FINGER_OPEN;
    const seen: number[] = [];
    for (const c of [0.2, 0.35, 0.28, 0.38, 0.33, 0.39]) {
      s = nextFingerState(s, c);
      seen.push(s);
    }
    expect(new Set(seen)).toEqual(new Set([FINGER_OPEN])); // stays open until it crosses 0.4
    expect(nextFingerState(FINGER_OPEN, 0.45)).toBe(FINGER_HALF);
    expect(nextFingerState(FINGER_HALF, 0.65)).toBe(FINGER_CLOSED);
    expect(nextFingerState(FINGER_CLOSED, 0.55)).toBe(FINGER_CLOSED); // sticky above 0.5
    expect(nextFingerState(FINGER_CLOSED, 0.45)).toBe(FINGER_HALF);
  });

  describe('real recorded fixtures', () => {
    it('victory photo: index+middle open, ring+pinky closed', () => {
      const last = framesFromFixture(peace).at(-1)!.hands;
      const f = new FingerAnalyzer().analyze(
        1,
        'Left',
        0.9,
        last.slice(0, 63),
        last.slice(63, 126),
        0,
      );
      expect([f.state[1], f.state[2], f.state[3], f.state[4]]).toEqual([
        FINGER_OPEN,
        FINGER_OPEN,
        FINGER_CLOSED,
        FINGER_CLOSED,
      ]);
    });
    it('fist photo: all five closed', () => {
      const last = framesFromFixture(fist).at(-1)!.hands;
      const f = new FingerAnalyzer().analyze(
        1,
        'Left',
        0.9,
        last.slice(0, 63),
        last.slice(63, 126),
        0,
      );
      expect(Array.from(f.state)).toEqual([2, 2, 2, 2, 2]);
    });
  });
});
