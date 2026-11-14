import { RingBuffer } from './ringBuffer';

export type Stage = 'capture' | 'worker' | 'face' | 'hand' | 'gesture' | 'identity' | 'draw';

export interface StatsSnapshot {
  /** Video/draw loop rate. */
  fps: number;
  /** Rate of finished model results; this is the real tracking rate. */
  inferFps: number;
  frameMs: number;
  capture: number;
  worker: number;
  face: number;
  hand: number;
  gesture: number;
  identity: number;
  draw: number;
}

const WINDOW = 60;
/**
 * A gap this long is a pause (tab hidden, camera switched), not a slow frame: it restarts the
 * measurement instead of adding one huge sample to the mean.
 */
const PAUSE_GAP_MS = 1000;

/**
 * Collects timings off the React render path. The UI polls snapshot() a few times
 * per second instead of subscribing per frame (architecture rule 5).
 */
export class StatsCollector {
  private readonly frameTimes = new RingBuffer(WINDOW);
  private readonly stages: Record<Stage, RingBuffer> = {
    capture: new RingBuffer(WINDOW),
    worker: new RingBuffer(WINDOW),
    face: new RingBuffer(WINDOW),
    hand: new RingBuffer(WINDOW),
    gesture: new RingBuffer(WINDOW),
    identity: new RingBuffer(WINDOW),
    draw: new RingBuffer(WINDOW),
  };
  private readonly resultTimes = new RingBuffer(WINDOW);
  private lastFrameAt = -1;
  private lastResultAt = -1;

  /** Call once per processed frame with a performance.now() timestamp. */
  markFrame(now: number): void {
    if (this.lastFrameAt >= 0 && now - this.lastFrameAt < PAUSE_GAP_MS)
      this.frameTimes.push(now - this.lastFrameAt);
    this.lastFrameAt = now;
  }

  /** Call when a model result arrives. */
  markResult(now: number): void {
    if (this.lastResultAt >= 0 && now - this.lastResultAt < PAUSE_GAP_MS)
      this.resultTimes.push(now - this.lastResultAt);
    this.lastResultAt = now;
  }

  record(stage: Stage, ms: number): void {
    this.stages[stage].push(ms);
  }

  snapshot(): StatsSnapshot {
    const frameMs = this.frameTimes.mean();
    const resultMs = this.resultTimes.mean();
    return {
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      inferFps: resultMs > 0 ? 1000 / resultMs : 0,
      frameMs,
      capture: this.stages.capture.mean(),
      worker: this.stages.worker.mean(),
      face: this.stages.face.mean(),
      hand: this.stages.hand.mean(),
      gesture: this.stages.gesture.mean(),
      identity: this.stages.identity.mean(),
      draw: this.stages.draw.mean(),
    };
  }

  reset(): void {
    this.frameTimes.clear();
    this.resultTimes.clear();
    this.lastResultAt = -1;
    for (const s of Object.values(this.stages)) s.clear();
    this.lastFrameAt = -1;
  }
}

/** Shared instance: the frame loop writes, the stats panel reads. */
export const stats = new StatsCollector();
