import { HandTracker } from '../../core/tracking/handTracker';
import type { HandTrack } from '../../core/tracking/handTracker';
import { FingerAnalyzer } from './fingers';
import { GestureEngine } from './engine';
import { crossCheck } from './builtinLabels';
import type { CrossCheck } from './builtinLabels';
import { HINT_STRIDE } from './handFormat';
import { createStaticDetectors } from './static';
import { createDynamicSet } from './dynamic';
import type { PinchState } from './dynamic/pinch';
import { createTwoHandSet } from './twoHand';
import type { FrameRect } from './twoHand/frame';
import type { TwoHandFrame } from './twoHand/types';
import type { GestureEvent, GestureId, HandFrame } from './types';

/** How long a GestureRecognizer label stays valid. It runs less often than the landmarker. */
const HINT_MAX_AGE_MS = 600;
/** Max wrist distance (normalised) to pair a hint with a tracked hand. */
const HINT_MAX_DIST = 0.2;

export interface HandView {
  track: HandTrack;
  frame: HandFrame;
  /** The one static pose shown for this hand. */
  gesture: GestureId | null;
  gestureConfidence: number;
  cross: CrossCheck;
  /** Held motion gestures right now (point, pinch, pinchDrag). Updated from start/end events. */
  active: Set<GestureId>;
  /** Live pinch pointer, or null when not pinching. */
  pinch: PinchState | null;
}

/** Two-hand state the renderer and demos read every frame. */
export interface TwoHandState {
  /** Exactly two hands are visible. */
  pair: boolean;
  /** Both hands open and held: zoom/rotate are being measured. */
  engaged: boolean;
  /** Distance between hands relative to when the grip engaged (1 = unchanged). */
  scale: number;
  /** Angle change since the grip engaged, degrees, counter-clockwise positive. */
  deg: number;
  gapPalms: number;
  /** Held two-hand shapes right now. */
  active: Set<GestureId>;
  frameRect: FrameRect;
}

export interface LastFire {
  id: GestureId;
  t: number;
  hand: string;
  data?: Record<string, number>;
}

/**
 * Everything hand-related after the worker: tracking, finger analysis, static poses, motion
 * gestures, two-hand gestures and the cross-check against MediaPipe's labels. The app and the
 * tests use this same class, so what tests replay is what the app runs.
 */
export class HandPipeline {
  readonly tracker = new HandTracker();
  private readonly analyzer = new FingerAnalyzer();
  private readonly engine = new GestureEngine(createStaticDetectors());
  private readonly dynamic = createDynamicSet();
  private readonly twoHandSet = createTwoHandSet();
  /** Visible hands from the latest update. The array and its objects are reused. */
  readonly views: HandView[] = [];
  private readonly pool = new Map<number, HandView>();
  private readonly pair: TwoHandFrame = {
    t: 0,
    a: null as never,
    b: null as never,
    distance: 0,
    gapPalms: 0,
    angleDeg: 0,
  };
  readonly twoHand: TwoHandState = {
    pair: false,
    engaged: false,
    scale: 1,
    deg: 0,
    gapPalms: 0,
    active: new Set(),
    frameRect: this.twoHandSet.frameRect,
  };
  /** Most recent one-shot gesture (swipe, wave, clap, circle), for on-screen feedback. */
  lastFire: LastFire | null = null;

  get visibleCount(): number {
    return this.views.length;
  }

  /** Frame width / height of the camera image. Motion is measured in units of frame height. */
  set aspect(v: number) {
    this.analyzer.aspect = v;
  }

  update(hands: Float32Array, count: number, nowMs: number): GestureEvent[] {
    const events: GestureEvent[] = [];
    const tracks = this.tracker.update(hands, count, nowMs);
    for (const id of this.tracker.expired) {
      events.push(...this.endHeld(id, nowMs));
      events.push(...this.engine.release(id, nowMs));
      for (const d of this.dynamic.detectors) d.release?.(id);
      this.analyzer.release(id);
      this.pool.delete(id);
    }
    this.views.length = 0;
    for (const t of tracks) {
      if (!t.visible) continue;
      const frame = this.analyzer.analyze(t.id, t.handedness, t.score, t.landmarks, t.world, nowMs);
      events.push(...this.engine.update(frame));
      let v = this.pool.get(t.id);
      if (!v) {
        v = {
          track: t,
          frame,
          gesture: null,
          gestureConfidence: 0,
          cross: 'none',
          active: new Set(),
          pinch: null,
        };
        this.pool.set(t.id, v);
      }
      for (const d of this.dynamic.detectors) {
        for (const e of d.update(frame)) {
          events.push(e);
          if (e.kind === 'start') v.active.add(e.id);
          else if (e.kind === 'end') v.active.delete(e.id);
        }
      }
      const active = this.engine.active(t.id);
      v.gesture = active?.id ?? null;
      v.gestureConfidence = active?.confidence ?? 0;
      const ps = this.dynamic.pinch.state(t.id);
      v.pinch = ps?.active ? ps : null;
      const fresh = nowMs - t.builtinAtMs <= HINT_MAX_AGE_MS;
      v.cross = crossCheck(v.gesture, fresh ? t.builtinLabel : 0);
      this.views.push(v);
    }
    this.updateTwoHand(nowMs, events);
    for (const e of events) {
      if (e.kind === 'fire')
        this.lastFire = {
          id: e.id,
          t: e.t,
          hand: e.hand === 'Both' ? 'Both' : e.hand,
          data: e.data,
        };
    }
    return events;
  }

  /** A hand that vanishes while pointing or pinching must still emit "end" for what it was holding. */
  private endHeld(handId: number, t: number): GestureEvent[] {
    const v = this.pool.get(handId);
    if (!v) return [];
    return [...v.active].map((id) => ({
      id,
      kind: 'end' as const,
      handId,
      hand: v.frame.hand,
      confidence: 0,
      t,
    }));
  }

  /** Builds the left-to-right hand pair (or null) and runs the grip and the two-hand detectors. */
  private updateTwoHand(t: number, events: GestureEvent[]): void {
    const { grip, detectors } = this.twoHandSet;
    const s = this.twoHand;
    let f: TwoHandFrame | null = null;
    if (this.views.length === 2) {
      const [x, y] = this.views;
      const [a, b] = x!.frame.metrics.palmX <= y!.frame.metrics.palmX ? [x!, y!] : [y!, x!];
      const p = this.pair;
      p.t = t;
      p.a = a.frame;
      p.b = b.frame;
      const am = a.frame.metrics;
      const bm = b.frame.metrics;
      p.distance = Math.hypot(bm.palmX - am.palmX, bm.palmY - am.palmY);
      p.gapPalms = p.distance / ((am.palmLen + bm.palmLen) / 2);
      // Display y grows downward; negate so counter-clockwise on screen is positive.
      p.angleDeg = (Math.atan2(-(bm.palmY - am.palmY), bm.palmX - am.palmX) * 180) / Math.PI;
      f = p;
    }
    grip.update(f);
    for (const d of detectors) {
      for (const e of d.update(f)) {
        events.push(e);
        if (e.kind === 'start') s.active.add(e.id);
        else if (e.kind === 'end') s.active.delete(e.id);
      }
    }
    s.pair = f !== null;
    s.engaged = grip.engaged;
    s.scale = grip.scale;
    s.deg = grip.deg;
    s.gapPalms = f?.gapPalms ?? 0;
  }

  /** Attach GestureRecognizer labels to tracked hands by nearest wrist. */
  applyHints(hints: Float32Array, count: number, nowMs: number): void {
    const taken = new Set<number>();
    for (let h = 0; h < count; h++) {
      const o = h * HINT_STRIDE;
      let best: HandTrack | null = null;
      let bestD = HINT_MAX_DIST;
      for (const t of this.tracker.alive) {
        if (!t.visible || taken.has(t.id)) continue;
        const d = Math.hypot(t.landmarks[0]! - hints[o]!, t.landmarks[1]! - hints[o + 1]!);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      if (best) {
        taken.add(best.id);
        best.builtinLabel = hints[o + 2]!;
        best.builtinScore = hints[o + 3]!;
        best.builtinAtMs = nowMs;
      }
    }
  }

  clear(nowMs: number): GestureEvent[] {
    const events: GestureEvent[] = [];
    for (const t of this.tracker.alive) {
      events.push(...this.endHeld(t.id, nowMs));
      events.push(...this.engine.release(t.id, nowMs));
      for (const d of this.dynamic.detectors) d.release?.(t.id);
    }
    this.tracker.clear();
    this.views.length = 0;
    this.pool.clear();
    this.updateTwoHand(nowMs, events);
    return events;
  }
}
