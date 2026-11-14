import type { WorkerRequest, WorkerResponse } from './protocol';

/**
 * How the client talks to the inference engine. Two implementations with the same shape:
 *  - 'worker': a module Web Worker (default; architecture rule 1, the UI thread never runs inference)
 *  - 'main':   the engine runs on the UI thread. Only a fallback for browsers where the worker path cannot
 *              work (see capabilities.ts) or for debugging with ?thread=main. It costs UI smoothness.
 */
export type ThreadMode = 'worker' | 'main';

export interface Transport {
  readonly mode: ThreadMode;
  postMessage(msg: WorkerRequest, transfer?: Transferable[]): void;
  onmessage: ((msg: WorkerResponse) => void) | null;
  /** The transport itself broke (worker script failed to start, crashed). */
  onerror: ((message: string) => void) | null;
  terminate(): void;
}

class WorkerTransport implements Transport {
  readonly mode = 'worker';
  onmessage: ((msg: WorkerResponse) => void) | null = null;
  onerror: ((message: string) => void) | null = null;
  private readonly worker: Worker;

  constructor() {
    this.worker = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onmessage?.(e.data);
    this.worker.onerror = (e) => this.onerror?.(e.message || 'Worker crashed');
  }

  postMessage(msg: WorkerRequest, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }

  terminate(): void {
    this.worker.terminate();
  }
}

class MainThreadTransport implements Transport {
  readonly mode = 'main';
  onmessage: ((msg: WorkerResponse) => void) | null = null;
  onerror: ((message: string) => void) | null = null;
  private engine: import('./engine').InferenceEngine | null = null;
  private readonly queue: WorkerRequest[] = [];
  private dead = false;

  constructor() {
    // The engine is a separate chunk: browsers that use the worker never download it on the main thread.
    void import('./engine')
      .then(({ InferenceEngine }) => {
        if (this.dead) return;
        // Replies are delivered asynchronously, like a real worker, so callers see the same ordering.
        this.engine = new InferenceEngine((msg) => queueMicrotask(() => this.onmessage?.(msg)));
        for (const m of this.queue.splice(0)) void this.engine.handle(m);
      })
      .catch((e: unknown) => this.onerror?.(e instanceof Error ? e.message : String(e)));
  }

  postMessage(msg: WorkerRequest): void {
    if (this.engine) void this.engine.handle(msg);
    else this.queue.push(msg);
  }

  terminate(): void {
    this.dead = true;
    this.queue.length = 0;
  }
}

export function createTransport(mode: ThreadMode): Transport {
  return mode === 'main' ? new MainThreadTransport() : new WorkerTransport();
}
