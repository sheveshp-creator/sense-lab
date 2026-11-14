import { describe, expect, it } from 'vitest';
import { framesFromFixture, run } from './helpers/runHands';
import { pair, seq, toFixture } from './helpers/scenes';
import { POSES } from './helpers/makeHand';
import type { GestureEvent } from '../src/features/hand/types';
import zoomIn from './fixtures/synthetic_zoom_in.json';
import zoomOut from './fixtures/synthetic_zoom_out.json';
import rotateCcw from './fixtures/synthetic_rotate_ccw.json';
import staticPalms from './fixtures/synthetic_static_two_palms.json';
import clap from './fixtures/synthetic_clap.json';
import clapMerge from './fixtures/synthetic_clap_merge.json';
import heart from './fixtures/synthetic_heart.json';
import heartApart from './fixtures/synthetic_heart_apart.json';
import frame from './fixtures/synthetic_frame.json';
import twoFists from './fixtures/synthetic_two_fists.json';
import typing from './fixtures/synthetic_typing.json';

type Fx = Parameters<typeof framesFromFixture>[0];
const play = (fx: unknown) => run(framesFromFixture(fx as Fx));
const of = (events: GestureEvent[], id: string) => events.filter((e) => e.id === id);
const TWO_HAND = ['zoom', 'rotate', 'clap', 'heart', 'frame'];
const twoHandEvents = (events: GestureEvent[]) => events.filter((e) => TWO_HAND.includes(e.id));

describe('zoom', () => {
  it('starts when the open hands move apart, with the scale in its data', () => {
    const { events, pipeline } = play(zoomIn);
    const z = of(events, 'zoom');
    expect(z.map((e) => e.kind)).toContain('start');
    expect(z[0]!.data!.scale).toBeGreaterThan(1.15);
    expect(pipeline.twoHand.scale).toBeGreaterThan(1.8); // 0.4 -> 0.9 apart is ~2.25x, minus smoothing lag
    expect(pipeline.twoHand.scale).toBeLessThan(2.4);
  });

  it('zoom out reads below 1', () => {
    const { events, pipeline } = play(zoomOut);
    expect(of(events, 'zoom')[0]!.data!.scale).toBeLessThan(0.85);
    expect(pipeline.twoHand.scale).toBeLessThan(0.6);
  });

  it('two open palms held still never zoom or rotate', () => {
    expect(twoHandEvents(play(staticPalms).events)).toEqual([]);
  });

  it('does not engage until both hands have been open for ~200 ms', () => {
    const { pipeline } = play({ frames: (zoomIn as Fx).frames.slice(0, 4) });
    expect(pipeline.twoHand.engaged).toBe(false);
  });

  it('exposes the live scale while engaged (for the 3D demo)', () => {
    const { pipeline } = play({ frames: (zoomIn as Fx).frames.slice(0, 20) });
    expect(pipeline.twoHand.engaged).toBe(true);
    expect(pipeline.twoHand.scale).toBeGreaterThan(1);
  });

  it('ends when one hand closes into a fist', () => {
    const open = POSES.openPalm!;
    const frames = seq(
      (t) =>
        pair(
          open,
          open,
          () => [
            [0.47, 0.5],
            [0.87, 0.5],
          ],
          12,
          t,
        ),
      (t) =>
        pair(
          open,
          open,
          (i) => [
            [0.47 - 0.005 * (i + 1) * 2, 0.5],
            [0.87 + 0.005 * (i + 1) * 2, 0.5],
          ],
          14,
          t,
        ),
      (t) =>
        pair(
          open,
          POSES.fist!,
          () => [
            [0.37, 0.5],
            [0.97, 0.5],
          ],
          12,
          t,
        ),
    );
    const { events, pipeline } = play(toFixture('s', frames));
    expect(of(events, 'zoom').map((e) => e.kind)).toEqual(['start', 'end']);
    expect(pipeline.twoHand.engaged).toBe(false);
  });
});

describe('rotate', () => {
  it('starts when the line between the hands turns, counter-clockwise positive', () => {
    const { events, pipeline } = play(rotateCcw);
    const r = of(events, 'rotate');
    expect(r.map((e) => e.kind)).toContain('start');
    expect(r[0]!.data!.deg).toBeGreaterThan(15);
    expect(pipeline.twoHand.deg).toBeGreaterThan(25);
    expect(pipeline.twoHand.deg).toBeLessThan(50);
  });

  it('rotating without moving apart does not report a zoom', () => {
    expect(of(play(rotateCcw).events, 'zoom')).toEqual([]);
  });
});

describe('clap', () => {
  it('fires once when two hands close fast', () => {
    const c = of(play(clap).events, 'clap');
    expect(c).toHaveLength(1);
    expect(c[0]!.kind).toBe('fire');
    expect(c[0]!.data!.speed).toBeGreaterThan(5);
  });

  it('still fires when the hands merge into one detection right after a fast approach', () => {
    expect(of(play(clapMerge).events, 'clap')).toHaveLength(1);
  });

  it('two hands drifting together slowly is not a clap', () => {
    const slow = { frames: (zoomOut as Fx).frames }; // 0.9 -> 0.4 over half a second, then ends: speed is moderate
    expect(of(play(slow).events, 'clap')).toEqual([]);
  });

  it('hands that stay close are not a clap', () => {
    expect(of(play(twoFists).events, 'clap')).toEqual([]);
  });
});

describe('heart', () => {
  it('fires start for thumbs together and index tips together above them', () => {
    expect(of(play(heart).events, 'heart').map((e) => e.kind)).toEqual(['start']);
  });

  it('ends when the hands come apart', () => {
    const fx = heart as Fx;
    const apart = (heartApart as Fx).frames.map((f) => ({ ...f, t: f.t + 31 * 33 }));
    const events = play({ frames: [...fx.frames, ...apart] }).events;
    expect(of(events, 'heart').map((e) => e.kind)).toEqual(['start', 'end']);
  });

  it('does not fire when the hands are apart', () => {
    expect(of(play(heartApart).events, 'heart')).toEqual([]);
  });

  it('two fists side by side are not a heart', () => {
    expect(of(play(twoFists).events, 'heart')).toEqual([]);
  });
});

describe('frame', () => {
  it('starts for two L-shapes at opposite corners, and reports the rectangle', () => {
    const { events, pipeline } = play(frame);
    expect(of(events, 'frame').map((e) => e.kind)).toContain('start');
    expect(pipeline.twoHand.frameRect.valid).toBe(true);
    expect(pipeline.twoHand.frameRect.w).toBeGreaterThan(0.25);
    expect(pipeline.twoHand.frameRect.h).toBeGreaterThan(0.25);
  });

  it('two fists are not a frame, and neither are open palms', () => {
    expect(of(play(twoFists).events, 'frame')).toEqual([]);
    expect(of(play(staticPalms).events, 'frame')).toEqual([]);
  });
});

describe('false-trigger guard', () => {
  it('typing with two hands fires no two-hand gesture', () => {
    expect(twoHandEvents(play(typing).events)).toEqual([]);
  });
});
