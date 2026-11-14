import { HandPipeline } from '../../src/features/hand/handPipeline';
import { HAND_STRIDE } from '../../src/features/hand/handFormat';
import type { GestureEvent } from '../../src/features/hand/types';

export interface TimedHands {
  t: number;
  hands: Float32Array;
}

/** Same stack the app uses (tracker -> finger analyzer -> gesture engine), fed frame by frame. */
export function run(frames: TimedHands[], pipeline = new HandPipeline()) {
  const events: GestureEvent[] = [];
  const shown: (string | null)[] = [];
  for (const f of frames) {
    events.push(...pipeline.update(f.hands, f.hands.length / HAND_STRIDE, f.t));
    shown.push(pipeline.views[0]?.gesture ?? null);
  }
  return { events, shown, pipeline };
}

/** Loads a recorded fixture (tests/fixtures/*.json) as frames. */
export function framesFromFixture(fx: {
  frames: { t: number; hands: number[][] }[];
}): TimedHands[] {
  return fx.frames.map((f) => ({
    t: f.t,
    hands: Float32Array.from(f.hands.flat()),
  }));
}
