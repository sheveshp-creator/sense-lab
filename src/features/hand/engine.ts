import type { Handedness } from '../../core/tracking/handTracker';
import type { GestureDetector, GestureEvent, GestureId, HandFrame } from './types';

interface HandState {
  /** Ids whose detector currently reports "held", in registry order of priority. */
  raw: Set<string>;
  shown: GestureId | null;
  shownConfidence: number;
  hand: Handedness;
}

/**
 * Runs every detector on every hand and reduces the result to ONE gesture per hand.
 * Detectors know nothing about each other: "pointing up" and "one" can both be held, and the engine
 * picks the one earlier in the registry (priority = index). It only emits events when the shown
 * gesture changes, so the UI never sees "pointingUp" and "one" at the same time.
 */
export class GestureEngine {
  private readonly priority = new Map<string, number>();
  private readonly hands = new Map<number, HandState>();

  constructor(private readonly detectors: readonly GestureDetector[]) {
    detectors.forEach((d, i) => this.priority.set(d.id, i));
  }

  /** The gesture currently shown for a hand, or null. */
  active(handId: number): { id: GestureId; confidence: number } | null {
    const s = this.hands.get(handId);
    return s?.shown ? { id: s.shown, confidence: s.shownConfidence } : null;
  }

  update(frame: HandFrame): GestureEvent[] {
    let s = this.hands.get(frame.handId);
    if (!s) {
      s = { raw: new Set(), shown: null, shownConfidence: 0, hand: frame.hand };
      this.hands.set(frame.handId, s);
    }
    s.hand = frame.hand;
    const confidences = new Map<string, number>();
    for (const d of this.detectors) {
      for (const e of d.update(frame)) {
        if (e.kind === 'start') {
          s.raw.add(d.id);
          confidences.set(d.id, e.confidence);
        } else {
          s.raw.delete(d.id);
        }
      }
    }
    return this.reconcile(frame.handId, s, frame.t, confidences);
  }

  /** Call when a hand's track expires: ends its gesture and frees detector state. */
  release(handId: number, t: number): GestureEvent[] {
    const s = this.hands.get(handId);
    const out: GestureEvent[] = [];
    if (s?.shown) {
      out.push({ id: s.shown, kind: 'end', handId, hand: s.hand, confidence: 0, t });
    }
    this.hands.delete(handId);
    for (const d of this.detectors) d.release?.(handId);
    return out;
  }

  private reconcile(
    handId: number,
    s: HandState,
    t: number,
    confidences: Map<string, number>,
  ): GestureEvent[] {
    let winner: GestureId | null = null;
    let best = Infinity;
    for (const id of s.raw) {
      const p = this.priority.get(id)!;
      if (p < best) {
        best = p;
        winner = id as GestureId;
      }
    }
    if (winner === s.shown) return [];
    const out: GestureEvent[] = [];
    if (s.shown) out.push({ id: s.shown, kind: 'end', handId, hand: s.hand, confidence: 0, t });
    if (winner) {
      const confidence = confidences.get(winner) ?? 1;
      out.push({ id: winner, kind: 'start', handId, hand: s.hand, confidence, t });
      s.shownConfidence = confidence;
    }
    s.shown = winner;
    return out;
  }
}
