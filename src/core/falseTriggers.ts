import { bus } from '../events/bus';
import type { GestureEvent, GestureId } from '../features/hand/types';

export interface FalseTriggerSnapshot {
  running: boolean;
  count: number;
  elapsedSec: number;
  /** count / minutes elapsed. 0 until at least a few seconds have passed. */
  perMinute: number;
  byGesture: Record<string, number>;
}

/**
 * Test aid for tuning the guards: start it, then talk, type and move around WITHOUT making any
 * gesture. Every gesture event that fires meanwhile is a false trigger. Counts 'start' and 'fire'
 * events (not 'end', which is just the other half of a start).
 */
export class FalseTriggerCounter {
  private count = 0;
  private startedAt = 0;
  private stoppedAt = 0;
  private running = false;
  private hasStarted = false;
  private byGesture: Record<string, number> = {};
  private off: (() => void) | null = null;

  constructor(private readonly now: () => number = () => performance.now()) {}

  start(): void {
    this.stop();
    this.count = 0;
    this.byGesture = {};
    this.startedAt = this.now();
    this.running = true;
    this.hasStarted = true;
    this.off = bus.onAny((name, e) => {
      // Only gestures can be "false triggers"; blinks and expression changes are not gestures.
      if (String(name).startsWith('gesture:')) {
        const g = e as GestureEvent;
        this.record(g.id, g.kind);
      }
    });
  }

  stop(): void {
    if (!this.running) return;
    this.stoppedAt = this.now();
    this.running = false;
    this.off?.();
    this.off = null;
  }

  /** Public so tests can feed events without the bus. */
  record(id: GestureId, kind: 'start' | 'end' | 'fire'): void {
    if (!this.running || kind === 'end') return;
    this.count++;
    this.byGesture[id] = (this.byGesture[id] ?? 0) + 1;
  }

  snapshot(): FalseTriggerSnapshot {
    const end = this.running ? this.now() : this.stoppedAt;
    const elapsedSec = this.hasStarted ? Math.max(0, (end - this.startedAt) / 1000) : 0;
    return {
      running: this.running,
      count: this.count,
      elapsedSec,
      // Under 5 s a single event would look like dozens per minute, so say nothing yet.
      perMinute: elapsedSec >= 5 ? (this.count / elapsedSec) * 60 : 0,
      byGesture: { ...this.byGesture },
    };
  }
}

export const falseTriggers = new FalseTriggerCounter();
