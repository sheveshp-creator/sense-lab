import { describe, expect, it } from 'vitest';
import { createStaticDetectors } from '../src/features/hand/static';
import { FingerAnalyzer } from '../src/features/hand/fingers';
import { GestureEngine } from '../src/features/hand/engine';
import { crossCheck } from '../src/features/hand/builtinLabels';
import { holdPose, makeHand, POSES } from './helpers/makeHand';
import { framesFromFixture, run } from './helpers/runHands';
import thumbsUp from './fixtures/hand_thumbs_up.json';
import thumbsDown from './fixtures/hand_thumbs_down.json';
import peace from './fixtures/hand_peace.json';
import pointingUp from './fixtures/hand_pointing_up.json';
import fist from './fixtures/hand_fist.json';

/** The tag shown once a pose has been held for a while. */
/** Static poses only: motion gestures (point, pinch ...) have their own tests. */
const STATIC_IDS = new Set(createStaticDetectors().map((d) => d.id));
const isStatic = (e: { id: string }) => STATIC_IDS.has(e.id);

const settle = (pose: string) => run(holdPose(POSES[pose]!, 15)).shown.at(-1);

describe('static gestures on synthetic poses', () => {
  // five and openPalm are the same pose; the engine shows openPalm (higher priority).
  const expected: Record<string, string> = {
    thumbsUp: 'thumbsUp',
    thumbsDown: 'thumbsDown',
    peace: 'peace',
    openPalm: 'openPalm',
    fist: 'fist',
    pointingUp: 'pointingUp',
    ok: 'ok',
    rock: 'rock',
    one: 'pointingUp', // pointing up wins over "one" (same pose)
    two: 'two',
    three: 'three',
    four: 'four',
    five: 'openPalm',
  };
  for (const [pose, tag] of Object.entries(expected)) {
    it(`${pose} shows "${tag}"`, () => {
      expect(settle(pose)).toBe(tag);
    });
  }

  it('shows a single tag per hand, never two at once', () => {
    for (const pose of Object.keys(POSES)) {
      const { events } = run(holdPose(POSES[pose]!, 15));
      const starts = events.filter((e) => e.kind === 'start' && isStatic(e)).length;
      expect(starts, pose).toBe(1);
    }
  });

  it('every detector fires on its own when run alone (numbers 1-5 included)', () => {
    const ids = (pose: string) => {
      const detectors = createStaticDetectors();
      const fired = new Set<string>();
      for (const f of holdPose(POSES[pose]!, 10)) {
        const frame = analyzeFor(f.hands);
        for (const d of detectors)
          if (d.update(frame).some((e) => e.kind === 'start')) fired.add(d.id);
      }
      return fired;
    };
    expect(ids('one').has('one')).toBe(true);
    expect(ids('two').has('two')).toBe(true);
    expect(ids('three').has('three')).toBe(true);
    expect(ids('four').has('four')).toBe(true);
    // "five" is shadowed by openPalm in the engine but its own detector still fires.
    expect(ids('five').has('five')).toBe(true);
    expect(ids('openPalm').has('openPalm')).toBe(true);
  });

  it('peace (V) and two (fingers together) are told apart', () => {
    expect(settle('peace')).toBe('peace');
    expect(settle('two')).toBe('two');
  });
});

describe('timing rules (detector level, no tracker smoothing)', () => {
  /** Feeds poses straight into one detector and returns its events with the frame index. */
  function feed(id: string, steps: [pose: string, frames: number][]) {
    const det = createStaticDetectors().find((d) => d.id === id)!;
    const an = new FingerAnalyzer();
    const out: { kind: string; frame: number }[] = [];
    let n = 0;
    for (const [pose, frames] of steps) {
      const h = makeHand(POSES[pose]!);
      for (let i = 0; i < frames; i++, n++) {
        const f = an.analyze(1, 'Right', 0.9, h.slice(0, 63), h.slice(63, 126), n * 33);
        for (const e of det.update(f)) out.push({ kind: e.kind, frame: n });
      }
    }
    return out;
  }

  it('fires on exactly the 3rd held frame, not before', () => {
    expect(feed('fist', [['fist', 6]])).toEqual([{ kind: 'start', frame: 2 }]);
  });

  it('a pose held for only 2 frames never fires', () => {
    expect(
      feed('fist', [
        ['fist', 2],
        ['openPalm', 5],
      ]),
    ).toEqual([]);
  });

  it('ends after 2 frames of something else', () => {
    const ev = feed('fist', [
      ['fist', 6],
      ['openPalm', 4],
    ]);
    expect(ev).toEqual([
      { kind: 'start', frame: 2 },
      { kind: 'end', frame: 7 },
    ]);
  });

  it('a single dropped frame does not end a gesture', () => {
    const ev = feed('fist', [
      ['fist', 6],
      ['openPalm', 1],
      ['fist', 6],
    ]);
    expect(ev.map((e) => e.kind)).toEqual(['start']);
  });

  it('cooldown: after ending, the same gesture waits 300 ms before it can start again', () => {
    // fist ends at frame 7 (t = 231 ms); the fist returns at frame 8 and is held from then on.
    const ev = feed('fist', [
      ['fist', 6],
      ['openPalm', 2],
      ['fist', 20],
    ]);
    const starts = ev.filter((e) => e.kind === 'start');
    expect(starts).toHaveLength(2);
    // Held for 3 frames by frame 10 (t = 330), but 330 - 231 = 99 ms < 300 ms: delayed, not lost.
    expect(starts[1]!.frame).toBeGreaterThanOrEqual(7 + Math.ceil(300 / 33));
  });
});

describe('through the full pipeline (tracker smoothing included)', () => {
  it('shows the next gesture after a pose change, and ends the old one', () => {
    const frames = [...holdPose(POSES.fist!, 8), ...holdPose(POSES.openPalm!, 20, 8 * 33)];
    const { events, shown } = run(frames);
    expect(events.filter((e) => e.id === 'fist').map((e) => e.kind)).toEqual(['start', 'end']);
    expect(shown.at(-1)).toBe('openPalm');
  });
});

describe('engine', () => {
  it('priority: the earlier detector in the registry wins when several match', () => {
    const { events } = run(holdPose(POSES.openPalm!, 10));
    expect(events.filter((e) => e.kind === 'start' && isStatic(e)).map((e) => e.id)).toEqual([
      'openPalm',
    ]);
  });

  it('release() ends the shown gesture and clears state when a hand expires', () => {
    const { pipeline } = run(holdPose(POSES.fist!, 8));
    const ended = pipeline.clear(1000);
    expect(ended.map((e) => `${e.id}:${e.kind}`)).toEqual(['fist:end']);
  });

  it('emits a hand-expiry end event through the pipeline', () => {
    const frames = holdPose(POSES.fist!, 8);
    const { pipeline, events } = run(frames);
    // Hand disappears: empty frames until the 500 ms keep-alive passes.
    for (let t = 300; t <= 1000; t += 100)
      events.push(...pipeline.update(new Float32Array(0), 0, t));
    expect(events.filter((e) => e.id === 'fist').map((e) => e.kind)).toEqual(['start', 'end']);
  });

  it('GestureEngine with no detectors shows nothing', () => {
    const e = new GestureEngine([]);
    const { pipeline } = run(holdPose(POSES.fist!, 3));
    expect(e.active(1)).toBeNull();
    expect(pipeline.views).toHaveLength(1);
  });
});

describe('real recorded fixtures (MediaPipe sample photos)', () => {
  const cases: [string, unknown, string][] = [
    ['thumbs up', thumbsUp, 'thumbsUp'],
    ['thumbs down (flipped photo)', thumbsDown, 'thumbsDown'],
    ['victory', peace, 'peace'],
    ['pointing up', pointingUp, 'pointingUp'],
    ['fist', fist, 'fist'],
  ];
  for (const [name, fx, tag] of cases) {
    it(`${name} -> ${tag}, stable over the recording`, () => {
      const { shown } = run(framesFromFixture(fx as Parameters<typeof framesFromFixture>[0]));
      expect(shown.at(-1)).toBe(tag);
      // Once it appears it must not flicker to anything else.
      const first = shown.indexOf(tag);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThanOrEqual(3);
      expect(shown.slice(first).every((s) => s === tag)).toBe(true);
    });
  }
});

describe('cross-check with MediaPipe labels', () => {
  const idx = {
    None: 0,
    Closed_Fist: 1,
    Open_Palm: 2,
    Pointing_Up: 3,
    Thumb_Down: 4,
    Thumb_Up: 5,
    Victory: 6,
    ILoveYou: 7,
  };
  it('agrees on matching labels', () => {
    expect(crossCheck('thumbsUp', idx.Thumb_Up)).toBe('agree');
    expect(crossCheck('fist', idx.Closed_Fist)).toBe('agree');
    expect(crossCheck('peace', idx.Victory)).toBe('agree');
    expect(crossCheck('two', idx.Victory)).toBe('agree');
    expect(crossCheck('pointingUp', idx.Pointing_Up)).toBe('agree');
    expect(crossCheck('rock', idx.ILoveYou)).toBe('agree');
  });
  it('flags disagreement', () => {
    expect(crossCheck('fist', idx.Open_Palm)).toBe('disagree');
    expect(crossCheck('thumbsUp', idx.None)).toBe('disagree');
  });
  it('marks gestures the recognizer cannot name as unsupported, and no gesture as none', () => {
    expect(crossCheck('ok', idx.None)).toBe('unsupported');
    expect(crossCheck('three', idx.None)).toBe('unsupported');
    expect(crossCheck(null, idx.Victory)).toBe('none');
  });
});

// Helper: build a HandFrame for a raw hand (used to run detectors without the engine).
function analyzeFor(hand: Float32Array) {
  analyzer ??= new FingerAnalyzer();
  tick += 33;
  return analyzer.analyze(1, 'Right', 0.9, hand.slice(0, 63), hand.slice(63, 126), tick);
}
let analyzer: FingerAnalyzer | undefined;
let tick = 0;
void makeHand;
