export interface TaskConfig {
  /** Run on every Nth frame (1 = every frame). */
  everyNFrames?: number;
  /** Minimum time between runs in ms (e.g. face identity every ~500 ms). */
  minIntervalMs?: number;
}

interface Task {
  everyNFrames: number;
  minIntervalMs: number;
  lastRunAt: number;
}

/**
 * Decides which models run on a given frame. Each model registers its own cadence.
 * The quality manager (later phase) changes cadence at runtime via configure().
 */
export class Scheduler {
  private readonly tasks = new Map<string, Task>();

  register(id: string, config: TaskConfig = {}): void {
    this.tasks.set(id, {
      everyNFrames: Math.max(1, Math.floor(config.everyNFrames ?? 1)),
      minIntervalMs: config.minIntervalMs ?? 0,
      lastRunAt: -Infinity,
    });
  }

  configure(id: string, config: TaskConfig): void {
    const t = this.tasks.get(id);
    if (!t) throw new Error(`Unknown task: ${id}`);
    if (config.everyNFrames !== undefined)
      t.everyNFrames = Math.max(1, Math.floor(config.everyNFrames));
    if (config.minIntervalMs !== undefined) t.minIntervalMs = config.minIntervalMs;
  }

  /**
   * True if the task should run now. Calling this with true marks the task as run,
   * so call it once per frame per task.
   */
  shouldRun(id: string, frameIndex: number, nowMs: number): boolean {
    const t = this.tasks.get(id);
    if (!t) return false;
    if (frameIndex % t.everyNFrames !== 0) return false;
    if (nowMs - t.lastRunAt < t.minIntervalMs) return false;
    t.lastRunAt = nowMs;
    return true;
  }
}
