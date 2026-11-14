import { describe, expect, it } from 'vitest';
import { framesFromFixture, run } from './helpers/runHands';
import { handAt, move, seq, still, toFixture } from './helpers/scenes';
import { POSES } from './helpers/makeHand';
import { FingerAnalyzer } from '../src/features/hand/fingers';
import { createDynamicSet } from '../src/features/hand/dynamic';
import type { HandSpec } from './helpers/makeHand';
import type { GestureEvent } from '../src/features/hand/types';
import wave from './fixtures/synthetic_wave.json';
import circleCw from './fixtures/synthetic_circle_cw.json';
import circleCcw from './fixtures/synthetic_circle_ccw.json';
import pinchDrag from './fixtures/synthetic_pinch_drag.json';
import talking from './fixtures/synthetic_talking_idle.json';
import slowSweep from './fixtures/synthetic_slow_sweep.json';
import typing from './fixtures/synthetic_typing.json';
import pointingUp from './fixtures/hand_pointing_up.json';
import swipeRight from './fixtures/real_swipe_right.json';
import swipeLeft from './fixtures/real_swipe_left.json';
import swipeUp from './fixtures/real_swipe_up.json';
import swipeDown from './fixtures/real_swipe_down.json';

type Fx = Parameters<typeof framesFromFixture>[0];
const replay = (fx: unknown) => run(framesFromFixture(fx as Fx)).events;
const ids = (events: GestureEvent[], kind?: string) =>
  events.filter((e) => !kind || e.kind === kind).map((e) => e.id);
const OPEN = POSES.openPalm!;
const FIST = POSES.fist!;

/** Runs a scene built in display space (see helpers/scenes.ts). */
const play = (frames: ReturnType<typeof seq>) => replay(toFixture('scene', frames));
const swipes = (events: GestureEvent[]) => events.filter((e) => e.id.startsWith('swipe'));

describe('swipe', () => {
  const DIST = 0.5; // frame heights: ~2.8 palm lengths
  const cases: [string, [number, number], [number, number]][] = [
    ['swipeRight', [0.4, 0.5], [0.4 + DIST, 0.5]],
    ['swipeLeft', [1.0, 0.5], [1.0 - DIST, 0.5]],
    ['swipeUp', [0.67, 0.75], [0.67, 0.75 - DIST * 0.8]],
    ['swipeDown', [0.67, 0.2], [0.67, 0.2 + DIST * 0.8]],
  ];
  for (const [id, from, to] of cases) {
    for (const [poseName, pose] of [
      ['open palm', OPEN],
      ['fist', FIST],
    ] as const) {
      it(`${id} fires once for a ${poseName} moving that way in 0.3 s`, () => {
        const events = play(
          seq(
            (t) => still(pose, from, 8, t),
            (t) => move(pose, from, to, 9, t),
            (t) => still(pose, to, 12, t),
          ),
        );
        expect(swipes(events).map((e) => e.id)).toEqual([id]);
        expect(swipes(events)[0]!.kind).toBe('fire');
      });
    }
  }

  it('carries distance and speed in its data', () => {
    const e = swipes(
      play(
        seq(
          (t) => still(OPEN, [0.4, 0.5], 8, t),
          (t) => move(OPEN, [0.4, 0.5], [0.9, 0.5], 9, t),
          (t) => still(OPEN, [0.9, 0.5], 8, t),
        ),
      ),
    )[0]!;
    expect(e.data!.distance).toBeGreaterThan(2);
    expect(e.data!.speed).toBeGreaterThan(3.5);
    expect(e.confidence).toBeGreaterThan(0.6);
  });

  it('ignores a slow sweep of the same distance (speed guard)', () => {
    expect(swipes(replay(slowSweep))).toEqual([]);
  });

  it('ignores a short flick (distance guard)', () => {
    const events = play(
      seq(
        (t) => still(OPEN, [0.5, 0.5], 8, t),
        (t) => move(OPEN, [0.5, 0.5], [0.65, 0.5], 5, t),
        (t) => still(OPEN, [0.65, 0.5], 8, t),
      ),
    );
    expect(swipes(events)).toEqual([]);
  });

  it('ignores a mostly-diagonal move (direction dominance guard)', () => {
    const events = play(
      seq(
        (t) => still(OPEN, [0.4, 0.3], 8, t),
        (t) => move(OPEN, [0.4, 0.3], [0.8, 0.65], 9, t),
        (t) => still(OPEN, [0.8, 0.65], 8, t),
      ),
    );
    expect(swipes(events)).toEqual([]);
  });

  it('does not count the hand coming back as a second, opposite swipe', () => {
    const events = play(
      seq(
        (t) => still(OPEN, [0.4, 0.5], 8, t),
        (t) => move(OPEN, [0.4, 0.5], [0.9, 0.5], 9, t),
        (t) => still(OPEN, [0.9, 0.5], 2, t),
        (t) => move(OPEN, [0.9, 0.5], [0.4, 0.5], 9, t), // fast return within 800 ms
        (t) => still(OPEN, [0.4, 0.5], 8, t),
      ),
    );
    expect(swipes(events).map((e) => e.id)).toEqual(['swipeRight']);
  });

  it('allows the same swipe again after the cooldown, and the opposite one after the refractory time', () => {
    const events = play(
      seq(
        (t) => still(OPEN, [0.3, 0.5], 8, t),
        (t) => move(OPEN, [0.3, 0.5], [0.8, 0.5], 9, t),
        (t) => still(OPEN, [0.8, 0.5], 30, t), // 1 s of rest
        (t) => move(OPEN, [0.8, 0.5], [0.3, 0.5], 9, t),
        (t) => still(OPEN, [0.3, 0.5], 8, t),
      ),
    );
    expect(swipes(events).map((e) => e.id)).toEqual(['swipeRight', 'swipeLeft']);
  });

  it('a single huge jump frame is not a swipe (hold-frames guard)', () => {
    const events = play(
      seq(
        (t) => still(OPEN, [0.3, 0.5], 10, t),
        (t) => still(OPEN, [0.9, 0.5], 10, t),
      ),
    );
    expect(swipes(events)).toEqual([]);
  });
});

describe('wave', () => {
  it('fires for an open palm waving side to side', () => {
    const events = replay(wave);
    expect(ids(events, 'fire').filter((i) => i === 'wave').length).toBeGreaterThanOrEqual(1);
  });

  it('fires only once per wave, not on every frame (cooldown)', () => {
    const waves = replay(wave).filter((e) => e.id === 'wave');
    expect(waves.length).toBeLessThanOrEqual(2); // 2 s of waving, 1.5 s cooldown
  });

  it('does not also report the strokes as swipes', () => {
    expect(swipes(replay(wave))).toEqual([]);
  });

  it('a fist moving side to side is not a wave (open-palm guard)', () => {
    const frames: ReturnType<typeof seq> = [];
    for (let i = 0; i < 60; i++)
      frames.push({
        t: i * 33,
        hands: [handAt(FIST, 0.67 + 0.1 * Math.sin((2 * Math.PI * 2.5 * i * 33) / 1000), 0.5)],
      });
    expect(play(frames).filter((e) => e.id === 'wave')).toEqual([]);
  });

  it('one stroke is not a wave (needs 3+ direction changes)', () => {
    const events = play(
      seq(
        (t) => still(OPEN, [0.5, 0.5], 8, t),
        (t) => move(OPEN, [0.5, 0.5], [0.7, 0.5], 8, t),
        (t) => move(OPEN, [0.7, 0.5], [0.5, 0.5], 8, t),
        (t) => still(OPEN, [0.5, 0.5], 8, t),
      ),
    );
    expect(events.filter((e) => e.id === 'wave')).toEqual([]);
  });
});

describe('point', () => {
  const pointSpec: HandSpec = POSES.pointingUp!;
  it('starts on a real pointing-up photo, with the ray pointing up', () => {
    const start = replay(pointingUp).find((e) => e.id === 'point' && e.kind === 'start');
    expect(start).toBeDefined();
    expect(start!.data!.dy!).toBeLessThan(-0.7); // display y grows down, so up is negative
    expect(Math.abs(start!.data!.dx!)).toBeLessThan(0.7);
  });

  it('reports the pointing direction: rotate the hand and the ray follows', () => {
    const dir = (deg: number) => {
      const frames = still({ ...pointSpec, rotateDeg: deg }, [0.67, 0.5], 12, 0);
      return play(frames).find((e) => e.id === 'point' && e.kind === 'start')!.data!;
    };
    // -180 and 180 are the same direction: compare modulo 360.
    const norm = (a: number) => ((a % 360) + 360) % 360;
    const angle = (deg: number) => norm(dir(deg).angleDeg!);
    expect(angle(0)).toBeCloseTo(90, -1); // up
    // Rotating the hand 90 degrees clockwise (raw image) turns it to point right in the raw
    // image, which is LEFT on the mirrored display.
    expect(angle(90)).toBeCloseTo(180, -1);
    expect(Math.min(angle(-90), 360 - angle(-90))).toBeCloseTo(0, -1);
  });

  it('needs 4 held frames: a hand passing through the pose does not fire', () => {
    // Detector level (no tracker smoothing, which would blur an instant pose change).
    const det = createDynamicSet().detectors.find((d) => d.id === 'point')!;
    const an = new FingerAnalyzer();
    const feed = (spec: HandSpec, n: number, t0: number) =>
      Array.from({ length: n }, (_, i) => {
        const h = handAt(spec, 0.67, 0.5);
        return det.update(
          an.analyze(1, 'Right', 0.9, h.slice(0, 63), h.slice(63, 126), t0 + i * 33),
        ).length;
      }).reduce((a, b) => a + b, 0);
    expect(feed(OPEN, 5, 0) + feed(pointSpec, 3, 200) + feed(OPEN, 8, 300)).toBe(0);
    // Four frames is enough:
    expect(feed(pointSpec, 4, 600)).toBe(1);
  });

  it('ends when the pose is released', () => {
    const events = play(
      seq(
        (t) => still(pointSpec, [0.67, 0.5], 10, t),
        (t) => still(OPEN, [0.67, 0.5], 10, t),
      ),
    );
    expect(events.filter((e) => e.id === 'point').map((e) => e.kind)).toEqual(['start', 'end']);
  });

  it('a fist is not pointing, and an open palm is not pointing', () => {
    expect(play(still(FIST, [0.67, 0.5], 15, 0)).filter((e) => e.id === 'point')).toEqual([]);
    expect(play(still(OPEN, [0.67, 0.5], 15, 0)).filter((e) => e.id === 'point')).toEqual([]);
  });
});

describe('pinch and drag', () => {
  it('pinch starts, drag starts once the pointer has moved, both end on release', () => {
    const events = replay(pinchDrag).filter((e) => e.id === 'pinch' || e.id === 'pinchDrag');
    expect(events.map((e) => `${e.id}:${e.kind}`)).toEqual([
      'pinch:start',
      'pinchDrag:start',
      'pinchDrag:end',
      'pinch:end',
    ]);
  });

  it('a pinch without moving never becomes a drag', () => {
    const spec: HandSpec = { ...POSES.ok!, curl: [0.6, 1, 1, 1] };
    const events = play(
      seq(
        (t) => still(OPEN, [0.67, 0.5], 5, t),
        (t) => still(spec, [0.67, 0.5], 12, t),
        (t) => still(OPEN, [0.67, 0.5], 6, t),
      ),
    );
    expect(events.filter((e) => e.id === 'pinchDrag')).toEqual([]);
    expect(events.filter((e) => e.id === 'pinch').map((e) => e.kind)).toEqual(['start', 'end']);
  });

  it('exposes the live pointer while pinching (for Air Draw)', () => {
    const spec: HandSpec = { ...POSES.ok!, curl: [0.6, 1, 1, 1] };
    const frames = seq(
      (t) => still(spec, [0.7, 0.5], 8, t),
      (t) => move(spec, [0.7, 0.5], [0.95, 0.5], 10, t),
    );
    const { pipeline } = run(framesFromFixture(toFixture('s', frames) as Fx));
    const p = pipeline.views[0]!.pinch!;
    expect(p.active).toBe(true);
    // Display x grows to the right on screen, and the hand moved right by ~0.25 frame heights.
    expect(p.dx).toBeGreaterThan(0.1);
  });

  it('a closed fist is not a pinch', () => {
    expect(play(still(FIST, [0.67, 0.5], 20, 0)).filter((e) => e.id === 'pinch')).toEqual([]);
  });

  it('an open hand is not a pinch', () => {
    expect(play(still(OPEN, [0.67, 0.5], 20, 0)).filter((e) => e.id === 'pinch')).toEqual([]);
  });
});

describe('circle', () => {
  it('fires for a pointing finger drawing a clockwise circle', () => {
    const c = replay(circleCw).filter((e) => e.id === 'circle');
    expect(c).toHaveLength(1);
    expect(c[0]!.data!.direction).toBe(1);
  });

  it('reports counter-clockwise circles as direction -1', () => {
    const c = replay(circleCcw).filter((e) => e.id === 'circle');
    expect(c).toHaveLength(1);
    expect(c[0]!.data!.direction).toBe(-1);
  });

  it('does not fire for a straight line or a half circle', () => {
    const line = play(move(POSES.pointingUp!, [0.4, 0.5], [0.9, 0.5], 40, 0));
    expect(line.filter((e) => e.id === 'circle')).toEqual([]);
    const half: ReturnType<typeof seq> = [];
    for (let i = 0; i < 30; i++) {
      const a = (Math.PI * i) / 29;
      half.push({
        t: i * 33,
        hands: [handAt(POSES.pointingUp!, 0.67 + 0.15 * Math.cos(a), 0.5 + 0.15 * Math.sin(a))],
      });
    }
    expect(play(half).filter((e) => e.id === 'circle')).toEqual([]);
  });

  it('does not fire when the hand is not pointing (open palm tracing the same circle)', () => {
    const frames: ReturnType<typeof seq> = [];
    for (let i = 0; i < 48; i++) {
      const a = (2 * Math.PI * i) / 40;
      frames.push({
        t: i * 33,
        hands: [handAt(OPEN, 0.67 + 0.15 * Math.cos(a), 0.5 + 0.15 * Math.sin(a))],
      });
    }
    expect(play(frames).filter((e) => e.id === 'circle')).toEqual([]);
  });
});

describe('false-trigger guards on everyday motion', () => {
  it('10 s of talking with a hand near the chin fires nothing', () => {
    expect(replay(talking).filter((e) => e.kind !== 'end')).toEqual([]);
  });

  it('10 s of typing with two half-curled hands fires nothing', () => {
    const events = replay(typing).filter((e) => e.kind !== 'end');
    expect(events.map((e) => `${e.id}:${e.kind}`)).toEqual([]);
  });
});

describe('swipe on REAL landmarks (hand photo sliding across a fake camera)', () => {
  const cases: [string, unknown][] = [
    ['swipeRight', swipeRight],
    ['swipeLeft', swipeLeft],
    ['swipeUp', swipeUp],
    ['swipeDown', swipeDown],
  ];
  for (const [id, fx] of cases) {
    it(`${id}: fires exactly that swipe, once`, () => {
      expect(swipes(replay(fx)).map((e) => e.id)).toEqual([id]);
    });
  }
});
