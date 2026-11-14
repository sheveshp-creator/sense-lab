import { describe, expect, it } from 'vitest';
import { HandRecorder } from '../src/core/recorder';
import { HAND_STRIDE } from '../src/features/hand/handFormat';
import { makeHand, POSES } from './helpers/makeHand';
import { framesFromFixture, run } from './helpers/runHands';

describe('HandRecorder', () => {
  it('keeps only the last 2 seconds and reports times relative to the first kept frame', () => {
    const r = new HandRecorder(200);
    const hand = makeHand(POSES.fist!);
    for (let i = 0; i < 150; i++) r.push(1000 + i * 33, hand, 1); // 4.95 s of frames
    const fx = r.toFixture(2000);
    expect(fx.frames[0]!.t).toBe(0);
    expect(fx.frames.at(-1)!.t).toBeLessThanOrEqual(2000);
    expect(fx.frames.at(-1)!.t).toBeGreaterThan(1900);
    expect(fx.frames.length).toBeGreaterThan(55);
    expect(fx.frames.length).toBeLessThan(65);
  });

  it('wraps around when full and still returns frames in time order', () => {
    const r = new HandRecorder(10);
    const hand = makeHand(POSES.fist!);
    for (let i = 0; i < 25; i++) r.push(i * 100, hand, 1);
    const fx = r.toFixture(10_000);
    expect(fx.frames).toHaveLength(10);
    const ts = fx.frames.map((f) => f.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it('handles 0, 1 and 2 hands per frame and an empty recorder', () => {
    const r = new HandRecorder(5);
    expect(r.toFixture().frames).toEqual([]);
    const a = makeHand(POSES.fist!);
    const two = new Float32Array(2 * HAND_STRIDE);
    two.set(a, 0);
    two.set(a, HAND_STRIDE);
    r.push(0, new Float32Array(0), 0);
    r.push(33, a, 1);
    r.push(66, two, 2);
    expect(r.toFixture().frames.map((f) => f.hands.length)).toEqual([0, 1, 2]);
  });

  it('round trip: a recorded fixture replays to the same gesture', () => {
    const r = new HandRecorder(100);
    const hand = makeHand(POSES.thumbsUp!);
    for (let i = 0; i < 20; i++) r.push(i * 33, hand, 1);
    const replay = run(framesFromFixture(JSON.parse(JSON.stringify(r.toFixture()))));
    expect(replay.shown.at(-1)).toBe('thumbsUp');
  });

  it('stores landmark numbers only (no image data)', () => {
    const r = new HandRecorder(5);
    r.push(0, makeHand(POSES.fist!), 1);
    const fx = r.toFixture();
    expect(Object.keys(fx).sort()).toEqual(['frames', 'kind', 'note', 'version']);
    expect(fx.frames[0]!.hands[0]!.every((v) => typeof v === 'number')).toBe(true);
  });
});
