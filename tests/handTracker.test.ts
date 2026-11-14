import { describe, expect, it } from 'vitest';
import { HandTracker } from '../src/core/tracking/handTracker';
import { HAND_RIGHT_PROB, HAND_STRIDE } from '../src/features/hand/handFormat';
import { makeHand, POSES } from './helpers/makeHand';

const pack = (...hands: Float32Array[]) => {
  const out = new Float32Array(hands.length * HAND_STRIDE);
  hands.forEach((h, i) => out.set(h, i * HAND_STRIDE));
  return out;
};
const at = (cx: number, rightProb = 0.9) =>
  makeHand({ ...POSES.openPalm!, cx, cy: 0.5, rightProb });

describe('HandTracker', () => {
  it('gives two hands distinct, stable IDs while they move', () => {
    const t = new HandTracker();
    let ids: number[] = [];
    for (let i = 0; i < 30; i++) {
      t.update(pack(at(0.25 + i * 0.002), at(0.75 - i * 0.002)), 2, i * 33);
      ids = t.alive
        .slice()
        .sort((a, b) => a.box.x - b.box.x)
        .map((h) => h.id);
    }
    expect(ids).toEqual([1, 2]);
  });

  it('keeps an ID for 500 ms after the hand disappears, then expires it', () => {
    const t = new HandTracker();
    for (let i = 0; i < 5; i++) t.update(pack(at(0.5)), 1, i * 33);
    t.update(new Float32Array(0), 0, 300);
    expect(t.alive).toHaveLength(1);
    expect(t.alive[0]!.visible).toBe(false);
    t.update(new Float32Array(0), 0, 900);
    expect(t.alive).toHaveLength(0);
    expect(t.expired).toEqual([1]);
    // Comes back after expiry: new ID.
    t.update(pack(at(0.5)), 1, 1000);
    expect(t.alive[0]!.id).toBe(2);
  });

  it('handedness is stable against a few noisy frames', () => {
    const t = new HandTracker();
    for (let i = 0; i < 10; i++) t.update(pack(at(0.5, 0.95)), 1, i * 33);
    expect(t.alive[0]!.handedness).toBe('Right');
    // Two frames the model gets wrong: the label must not flip.
    for (let i = 10; i < 12; i++) t.update(pack(at(0.5, 0.05)), 1, i * 33);
    expect(t.alive[0]!.handedness).toBe('Right');
    // A sustained change does flip it.
    for (let i = 12; i < 40; i++) t.update(pack(at(0.5, 0.05)), 1, i * 33);
    expect(t.alive[0]!.handedness).toBe('Left');
  });

  it('smooths landmarks (output lies between old and new position)', () => {
    const t = new HandTracker();
    t.update(pack(at(0.5)), 1, 0);
    t.update(pack(at(0.52)), 1, 33);
    const x = t.alive[0]!.landmarks[0]!;
    expect(x).toBeGreaterThan(0.5 - 0.0001);
    void HAND_RIGHT_PROB;
    // wrist raw x is cx + 0 = 0.52 at the second frame; smoothed is below that
    expect(x).toBeLessThan(0.52);
  });
});
