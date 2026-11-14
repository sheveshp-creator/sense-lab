import { describe, expect, it } from 'vitest';
import { FaceTracker } from '../src/core/tracking/faceTracker';
import { makeFaces } from './helpers/makeFaces';
import type { BoxSpec } from './helpers/makeFaces';
import dropout from './fixtures/faces_two_dropout.json';
import longDropout from './fixtures/faces_long_dropout.json';

interface Fixture {
  frames: { t: number; faces: BoxSpec[] }[];
}

/** Runs a fixture and records the IDs of visible tracks at each frame, ordered by x position. */
function run(fx: Fixture, tracker = new FaceTracker()) {
  return fx.frames.map((fr) => {
    tracker.update(makeFaces(fr.faces), fr.faces.length, fr.t);
    return tracker.alive
      .filter((t) => t.visible)
      .sort((a, b) => a.box.x - b.box.x)
      .map((t) => t.id);
  });
}

describe('FaceTracker', () => {
  it('assigns distinct IDs to faces in the same frame', () => {
    const ids = run(dropout as Fixture)[0]!;
    expect(ids).toEqual([1, 2]);
  });

  it('keeps IDs stable while a face drifts', () => {
    const history = run(dropout as Fixture);
    // Face A is leftmost and always present, so its ID never changes.
    expect(new Set(history.map((ids) => ids[0]))).toEqual(new Set([1]));
  });

  it('keeps the same ID across a dropout shorter than 500 ms', () => {
    const history = run(dropout as Fixture); // B missing for ~495 ms
    const last = history[history.length - 1]!;
    expect(last).toEqual([1, 2]);
  });

  it('hides a missing face but keeps its ID alive, then expires it after 500 ms', () => {
    const tracker = new FaceTracker();
    const fx = longDropout as Fixture;
    let aliveDuringGap = -1;
    let aliveAfterExpiry = -1;
    fx.frames.forEach((fr, i) => {
      tracker.update(makeFaces(fr.faces), fr.faces.length, fr.t);
      if (i === 30) aliveDuringGap = tracker.alive.length; // ~330 ms into the gap
      if (i === 45) aliveAfterExpiry = tracker.alive.length; // ~825 ms into the gap
    });
    expect(aliveDuringGap).toBe(2);
    expect(aliveAfterExpiry).toBe(1);
  });

  it('gives a face that returns after the ID expired a new ID', () => {
    const history = run(longDropout as Fixture);
    expect(history[history.length - 1]).toEqual([1, 3]);
  });

  it('does not swap IDs when two faces are close but separate', () => {
    const tracker = new FaceTracker();
    let ids: number[] = [];
    for (let i = 0; i < 20; i++) {
      const gap = 0.3 - i * 0.005; // faces slowly approach, staying apart
      const faces = [
        { cx: 0.5 - gap / 2, cy: 0.5, w: 0.15, h: 0.2 },
        { cx: 0.5 + gap / 2, cy: 0.5, w: 0.15, h: 0.2 },
      ];
      tracker.update(makeFaces(faces), 2, i * 33);
      ids = tracker.alive
        .slice()
        .sort((a, b) => a.box.x - b.box.x)
        .map((t) => t.id);
    }
    expect(ids).toEqual([1, 2]);
  });

  it('smooths landmarks and copies pose and blendshapes', () => {
    const tracker = new FaceTracker();
    const a = makeFaces([{ cx: 0.5, cy: 0.5, w: 0.2, h: 0.3 }]);
    tracker.update(a, 1, 0);
    const b = makeFaces([{ cx: 0.52, cy: 0.5, w: 0.2, h: 0.3 }]);
    tracker.update(b, 1, 33);
    const t = tracker.alive[0]!;
    // Smoothed output lies between the old and new position, not at the raw new one.
    expect(t.box.x).toBeGreaterThan(0.4);
    expect(t.box.x).toBeLessThan(0.42);
  });
});
