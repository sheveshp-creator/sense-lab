export interface BlinkConfig {
  /** Eyes count as closed once the closure signal rises to this... */
  down: number;
  /** ...and as open again only when it falls to this (lower than `down`: hysteresis). */
  up: number;
  /** A closure shorter than this is noise, not a blink. */
  minMs: number;
  /** A closure longer than this is eyes held shut, not a blink. */
  maxMs: number;
  /** Ignore a new closure this soon after a counted blink. */
  refractoryMs: number;
  /** Updates further apart than this mean the face was lost: start over. */
  gapMs: number;
}

/**
 * Down/up thresholds come from real photos: with eyes open, even a smiling squint rarely goes above
 * 0.3 (98% of in-the-wild photos stay below 0.47, and the ones above are mostly closed eyes), while a
 * closed eye is 0.6 or more. Hysteresis keeps a value hovering near one threshold from counting twice.
 */
export const DEFAULT_BLINK: BlinkConfig = {
  down: 0.55,
  up: 0.3,
  minMs: 30,
  maxMs: 800,
  refractoryMs: 100,
  gapMs: 500,
};

export interface BlinkEvent {
  /** When the eyes re-opened (ms). */
  t: number;
  /** How long they were closed (ms). */
  durationMs: number;
}

/**
 * Counts blinks from a closure signal (0 = open .. 1 = shut). Feed it min(eyeBlinkLeft, eyeBlinkRight):
 * taking the smaller of the two means a wink (one eye) is not a blink.
 */
export class BlinkDetector {
  count = 0;
  /** Eyes closed right now. */
  closed = false;
  /** True while the eyes have been shut longer than maxMs (not counted as a blink). */
  heldShut = false;
  private closedAt = 0;
  private lastBlinkAt = -Infinity;
  private lastT = -Infinity;
  private startedAt = -1;
  private readonly times: number[] = [];
  private readonly cfg: BlinkConfig;

  constructor(cfg: Partial<BlinkConfig> = {}) {
    this.cfg = { ...DEFAULT_BLINK, ...cfg };
  }

  /** Returns the blink if one just finished. */
  update(closure: number, tMs: number): BlinkEvent | null {
    if (this.startedAt < 0) this.startedAt = tMs;
    if (tMs - this.lastT > this.cfg.gapMs) this.closed = false; // face was lost: do not count across the gap
    this.lastT = tMs;
    const { down, up, minMs, maxMs, refractoryMs } = this.cfg;

    if (!this.closed) {
      if (closure >= down && tMs - this.lastBlinkAt >= refractoryMs) {
        this.closed = true;
        this.heldShut = false;
        this.closedAt = tMs;
      }
      return null;
    }
    if (tMs - this.closedAt > maxMs) this.heldShut = true;
    if (closure > up) return null; // still closed (anything above `up` keeps it closed)

    this.closed = false;
    const durationMs = tMs - this.closedAt;
    const wasHeld = this.heldShut;
    this.heldShut = false;
    if (wasHeld || durationMs < minMs) return null;
    this.count++;
    this.lastBlinkAt = tMs;
    this.times.push(tMs);
    if (this.times.length > 600) this.times.shift();
    return { t: tMs, durationMs };
  }

  /**
   * Blinks per minute over the last 60 s. Until 10 s of data exist it reports 0 ("not enough data"),
   * and until a full minute has passed it scales up what it has seen.
   */
  perMinute(nowMs: number): number {
    if (this.startedAt < 0) return 0;
    const span = Math.min(60_000, nowMs - this.startedAt);
    if (span < 10_000) return 0;
    const from = nowMs - 60_000;
    let n = 0;
    for (let i = this.times.length - 1; i >= 0 && this.times[i]! >= from; i--) n++;
    return (n / span) * 60_000;
  }

  reset(): void {
    this.count = 0;
    this.closed = false;
    this.heldShut = false;
    this.lastBlinkAt = -Infinity;
    this.lastT = -Infinity;
    this.startedAt = -1;
    this.times.length = 0;
  }
}
