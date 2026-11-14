import { describe, expect, it } from 'vitest';
import { FaceAnalysis, HISTORY, readHistory } from '../src/features/face/faceAnalysis';
import type { FaceEvent } from '../src/features/face/faceAnalysis';
import { BS } from '../src/features/face/blendshapes';
import { EXPRESSIONS } from '../src/features/face/expression';
import type { ExpressionClassifier } from '../src/features/face/expression';
import type { FaceTrack } from '../src/core/tracking/faceTracker';
import { NEUTRAL_VERTICAL_OFFSET } from '../src/features/face/eyes/gaze';
import { blinkCurve } from './helpers/blinkTraces';

/** A minimal tracked face with the fields the analysis reads. */
function track(
  id: number,
  o: {
    bs?: Partial<Record<keyof typeof BS, number>>;
    noBlendshapes?: boolean;
    earRatio?: number;
    irisH?: number;
    yawDisplay?: number;
    size?: number;
    visible?: boolean;
  } = {},
): FaceTrack {
  const bs = new Float32Array(52);
  if (!o.noBlendshapes)
    for (const [k, v] of Object.entries(o.bs ?? {})) bs[BS[k as keyof typeof BS]] = v!;
  const lm = new Float32Array(478 * 3);
  const put = (i: number, x: number, y: number) => lm.set([x, y, 0], i * 3);
  const width = 0.1;
  const h = (o.earRatio ?? 0.3) * width;
  const irisH = o.irisH ?? 0;
  for (const [cx, p, iris] of [
    [0.35, [33, 160, 158, 133, 153, 144], 468],
    [0.65, [362, 385, 387, 263, 373, 380], 473],
  ] as const) {
    const [p1, p2, p3, p4, p5, p6] = p;
    put(p1, cx - width / 2, 0.45);
    put(p4, cx + width / 2, 0.45);
    put(p2, cx - width / 6, 0.45 - h / 2);
    put(p3, cx + width / 6, 0.45 - h / 2);
    put(p6, cx - width / 6, 0.45 + h / 2);
    put(p5, cx + width / 6, 0.45 + h / 2);
    put(iris, cx + irisH * width, 0.45 + NEUTRAL_VERTICAL_OFFSET * width);
  }
  const size = o.size ?? 0.3;
  return {
    id,
    visible: o.visible ?? true,
    box: { x: 0.2, y: 0.2, w: size, h: size },
    landmarks: lm,
    blendshapes: bs,
    pose: Float32Array.from([-(o.yawDisplay ?? 0), 0, 0]), // matrix yaw is the negative of the display yaw
  } as unknown as FaceTrack;
}

const SMILE = { mouthSmileLeft: 0.85, mouthSmileRight: 0.85 };
/** Runs frames through the analysis at ~30 fps and returns every event. */
function play(a: FaceAnalysis, frames: FaceTrack[][], t0 = 0): FaceEvent[] {
  return frames.flatMap((tracks, i) => a.update(tracks, 1, t0 + i * 33));
}

describe('FaceAnalysis', () => {
  it('reports an expression change only after it has been stable, as one event', () => {
    const a = new FaceAnalysis();
    const events = play(a, [
      ...Array(10).fill([track(1)]),
      ...Array(15).fill([track(1, { bs: SMILE })]),
    ]);
    const changes = events.filter((e) => e.type === 'expression');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ trackId: 1, from: 'neutral', to: 'happy' });
    expect(a.primary!.expression.label).toBe('happy');
  });

  it('a one-frame smile does not change the expression', () => {
    const a = new FaceAnalysis();
    const events = play(a, [
      ...Array(10).fill([track(1)]),
      [track(1, { bs: SMILE })],
      ...Array(10).fill([track(1)]),
    ]);
    expect(events.filter((e) => e.type === 'expression')).toEqual([]);
  });

  it('counts blinks from the blendshapes and reports each one as an event', () => {
    const a = new FaceAnalysis();
    const frames: FaceTrack[][] = [];
    for (let i = 0; i < 270; i++) {
      const c = Math.max(
        blinkCurve(i * 33, 1000),
        blinkCurve(i * 33, 4000),
        blinkCurve(i * 33, 7000),
      );
      frames.push([track(1, { bs: { jawOpen: 0.01, eyeBlinkLeft: c, eyeBlinkRight: c } })]);
    }
    const blinks = play(a, frames).filter((e) => e.type === 'blink');
    expect(blinks).toHaveLength(3);
    expect(blinks.map((b) => (b as { count: number }).count)).toEqual([1, 2, 3]);
    expect(a.primary!.blink.count).toBe(3);
    expect(a.primary!.signal).toBe('blendshape');
  });

  it('a wink (one eye) is not a blink', () => {
    const a = new FaceAnalysis();
    const frames: FaceTrack[][] = [];
    for (let i = 0; i < 150; i++)
      frames.push([
        track(1, { bs: { eyeBlinkLeft: blinkCurve(i * 33, 1000), eyeBlinkRight: 0.02 } }),
      ]);
    expect(play(a, frames).filter((e) => e.type === 'blink')).toEqual([]);
  });

  it('falls back to the landmark eye-aspect-ratio when there are no blendshape scores', () => {
    const a = new FaceAnalysis();
    const frames: FaceTrack[][] = [];
    for (let i = 0; i < 270; i++) {
      const c = Math.max(blinkCurve(i * 33, 1500), blinkCurve(i * 33, 5000));
      frames.push([track(1, { noBlendshapes: true, earRatio: 0.3 * (1 - 0.9 * c) })]);
    }
    const events = play(a, frames);
    expect(events.filter((e) => e.type === 'blink')).toHaveLength(2);
    expect(a.primary!.signal).toBe('landmarks');
  });

  it("measures gaze: looking to the user's left reads left, head turned the other way is corrected", () => {
    const a = new FaceAnalysis();
    // Iris toward the image-right = user looks to their own left = screen left.
    play(a, Array(40).fill([track(1, { irisH: 0.14 })]));
    expect(a.primary!.gaze.label).toBe('left');
    expect(a.primary!.gaze.x).toBeLessThan(-12);

    // Head turned 25 deg to the user's right with the eyes counter-rotated inside the head: centre.
    const b = new FaceAnalysis();
    const counter = -0.43 * Math.sin((25 * Math.PI) / 180); // eye offset (eye widths) for -25 deg
    // irisH positive = toward image-right = display left = negative gaze, so use the opposite sign:
    play(b, Array(40).fill([track(1, { irisH: -counter, yawDisplay: 25 })]));
    expect(Math.abs(b.primary!.gaze.x)).toBeLessThan(2);
    expect(b.primary!.gaze.label).toBe('centre');
  });

  it('keeps one state per face and picks the biggest visible face as primary', () => {
    const a = new FaceAnalysis();
    play(
      a,
      Array(5).fill([
        track(1, { size: 0.15 }),
        track(2, { size: 0.4 }),
        track(3, { size: 0.6, visible: false }),
      ]),
    );
    expect(a.states.size).toBe(2); // face 3 is only being kept alive (not visible): not analysed
    expect(a.primaryId).toBe(2); // and it is the biggest, but it does not count
  });

  it('forgets a face when its track goes away', () => {
    const a = new FaceAnalysis();
    play(a, Array(5).fill([track(1), track(2)]));
    play(a, Array(5).fill([track(2)]), 1000);
    expect([...a.states.keys()]).toEqual([2]);
    play(a, [[]], 2000);
    expect(a.states.size).toBe(0);
    expect(a.primary).toBeNull();
  });

  it('one frame of all-zero blendshapes does not switch the blink signal to the landmarks', () => {
    const a = new FaceAnalysis();
    play(a, [
      ...Array(20).fill([track(1, { bs: { jawOpen: 0.01 } })]),
      [track(1, { noBlendshapes: true })],
      ...Array(5).fill([track(1, { bs: { jawOpen: 0.01 } })]),
    ]);
    expect(a.primary!.signal).toBe('blendshape');
    // ...but a sustained run of them does.
    play(a, Array(20).fill([track(1, { noBlendshapes: true })]), 2000);
    expect(a.primary!.signal).toBe('landmarks');
    // And it comes back as soon as blendshapes return.
    play(a, [[track(1, { bs: { jawOpen: 0.01 } })]], 4000);
    expect(a.primary!.signal).toBe('blendshape');
  });

  it('keeps ~10 s of history for the charts and returns it oldest first', () => {
    const a = new FaceAnalysis();
    const n = HISTORY + 50;
    play(
      a,
      Array.from({ length: n }, (_, i) => [
        track(1, { bs: { eyeBlinkLeft: i / n, eyeBlinkRight: i / n } }),
      ]),
    );
    const h = readHistory(a.primary!, (n - 1) * 33, 60_000);
    expect(h.t).toHaveLength(HISTORY); // ring buffer: the oldest 50 are gone
    expect(h.t).toEqual([...h.t].sort((x, y) => x - y));
    expect(h.closure.at(-1)!).toBeCloseTo((n - 1) / n, 4);
    expect(readHistory(a.primary!, (n - 1) * 33, 1000).t.length).toBeLessThan(40); // time window respected
  });

  it('works with any classifier (the interface), not just the rules', () => {
    const always: ExpressionClassifier = {
      id: 'always-sad',
      classify(_b, out) {
        out.fill(0);
        out[EXPRESSIONS.indexOf('sad')] = 0.9;
        return 'sad';
      },
    };
    const a = new FaceAnalysis(always);
    const events = play(a, Array(15).fill([track(1)]));
    expect(events.find((e) => e.type === 'expression')).toMatchObject({ to: 'sad' });
  });

  it('does not allocate per frame in the steady state (rule 9): the same arrays are reused', () => {
    const a = new FaceAnalysis();
    play(a, Array(5).fill([track(1)]));
    const s = a.primary!;
    const arrays = [s.history.closure, s.history.gazeX, s.raw, s.expression.scores];
    play(a, Array(200).fill([track(1)]), 1000);
    expect([s.history.closure, s.history.gazeX, s.raw, s.expression.scores]).toEqual(arrays);
    expect(a.primary).toBe(s);
  });
});
