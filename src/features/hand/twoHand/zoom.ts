import type { GestureEvent } from '../types';
import type { TwoHandGrip } from './grip';
import type { TwoHandDetector } from './types';
import { NONE } from './common';

/**
 * Zoom: with the grip engaged, the distance between the hands changed by 15% or more.
 * 'start' carries the scale; read grip.scale for the live value. Ends when the grip lets go.
 */
export function createZoom(grip: TwoHandGrip, minChange = 0.15, cooldownMs = 500): TwoHandDetector {
  let active = false;
  let endedAt = -Infinity;
  let lastT = 0;
  return {
    id: 'zoom',
    update(f) {
      const t = f?.t ?? lastT;
      lastT = t;
      const changed = Math.abs(grip.scale - 1) >= minChange;
      if (!active && grip.engaged && changed && t - endedAt >= cooldownMs) {
        active = true;
        const e: GestureEvent = {
          id: 'zoom',
          kind: 'start',
          handId: -1,
          hand: 'Both',
          t,
          confidence: Math.min(1, Math.abs(grip.scale - 1) / (minChange * 2)),
          data: { scale: grip.scale },
        };
        return [e];
      }
      if (active && !grip.engaged) {
        active = false;
        endedAt = t;
        return [
          {
            id: 'zoom',
            kind: 'end',
            handId: -1,
            hand: 'Both',
            t,
            confidence: 0,
            data: { scale: grip.scale },
          },
        ];
      }
      return NONE;
    },
  };
}
