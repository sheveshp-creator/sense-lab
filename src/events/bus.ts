import type { GestureEvent, GestureId } from '../features/hand/types';
import type { Expression } from '../features/face/expression';

/** Every event the UI can react to. Add new families here ("face:recognized", ...). */
type GestureEvents = { [K in GestureId as `gesture:${K}`]: GestureEvent };

export interface FaceEvents {
  /** A blink finished (eyes re-opened). */
  'face:blink': { trackId: number; count: number; t: number; durationMs: number };
  /** A face's expression label changed (after smoothing). */
  'face:expression': { trackId: number; from: Expression; to: Expression; t: number };
}

export type AppEvents = GestureEvents & FaceEvents;

type Handler<T> = (payload: T) => void;

/** Minimal typed pub/sub. Events are rare (gesture changes), unlike per-frame data. */
export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>();
  private readonly any = new Set<(name: keyof E, payload: E[keyof E]) => void>();

  on<K extends keyof E>(name: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  /** Subscribe to every event (used by the gesture timeline). */
  onAny(fn: (name: keyof E, payload: E[keyof E]) => void): () => void {
    this.any.add(fn);
    return () => this.any.delete(fn);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    this.handlers.get(name)?.forEach((fn) => (fn as Handler<E[K]>)(payload));
    this.any.forEach((fn) => fn(name, payload));
  }
}

export const bus = new EventBus<AppEvents>();
