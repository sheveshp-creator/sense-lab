import { useEffect, useState } from 'react';
import { live } from '../../core/pipeline';
import { readHistory } from '../../features/face/faceAnalysis';
import type { GazeLabel } from '../../features/face/eyes/gaze';
import type { Expression } from '../../features/face/expression';

/** A plain-data copy of what Face Lab shows, taken a few times per second (never per frame). */
export interface FaceSnapshot {
  trackId: number;
  now: number;
  expression: Expression;
  scores: number[];
  blinks: number;
  blinksPerMinute: number;
  closure: number;
  eyesClosed: boolean;
  heldShut: boolean;
  signal: 'blendshape' | 'landmarks';
  gaze: { x: number; y: number; eyeX: number; eyeY: number; label: GazeLabel; valid: boolean };
  history: { t: number[]; closure: number[]; gazeX: number[] };
  blinkTimes: number[];
}

/** Polls the primary face's analysis at ~10 Hz. Null when no face is in view. */
export function useFaceSnapshot(intervalMs = 100): FaceSnapshot | null {
  const [snap, setSnap] = useState<FaceSnapshot | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const s = live.analysis?.primary;
      if (!s) {
        setSnap(null);
        return;
      }
      const now = performance.now();
      const h = readHistory(s, now);
      setSnap({
        trackId: s.trackId,
        now,
        expression: s.expression.label,
        scores: Array.from(s.expression.scores),
        blinks: s.blink.count,
        blinksPerMinute: s.blink.perMinute(now),
        closure: s.closure,
        eyesClosed: s.blink.closed,
        heldShut: s.blink.heldShut,
        signal: s.signal,
        gaze: {
          x: s.gaze.x,
          y: s.gaze.y,
          eyeX: s.gaze.eyeX,
          eyeY: s.gaze.eyeY,
          label: s.gaze.label,
          valid: s.gaze.valid,
        },
        history: { t: h.t, closure: h.closure, gazeX: h.gazeX },
        blinkTimes: s.blinkTimes.filter((t) => now - t <= 10_000),
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return snap;
}
