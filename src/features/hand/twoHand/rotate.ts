import type { GestureEvent } from '../types';
import type { TwoHandGrip } from './grip';
import type { TwoHandDetector } from './types';
import { NONE } from './common';

/** Rotate: with the grip engaged, the line between the hands turned 15 degrees or more. */
export function createRotate(grip: TwoHandGrip, minDeg = 15, cooldownMs = 500): TwoHandDetector {
  let active = false;
  let endedAt = -Infinity;
  let lastT = 0;
  return {
    id: 'rotate',
    update(f) {
      const t = f?.t ?? lastT;
      lastT = t;
      const changed = Math.abs(grip.deg) >= minDeg;
      if (!active && grip.engaged && changed && t - endedAt >= cooldownMs) {
        active = true;
        const e: GestureEvent = {
          id: 'rotate',
          kind: 'start',
          handId: -1,
          hand: 'Both',
          t,
          confidence: Math.min(1, Math.abs(grip.deg) / (minDeg * 2)),
          data: { deg: grip.deg },
        };
        return [e];
      }
      if (active && !grip.engaged) {
        active = false;
        endedAt = t;
        return [
          {
            id: 'rotate',
            kind: 'end',
            handId: -1,
            hand: 'Both',
            t,
            confidence: 0,
            data: { deg: grip.deg },
          },
        ];
      }
      return NONE;
    },
  };
}
