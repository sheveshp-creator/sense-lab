import { createTransport } from './transport';
import type { ThreadMode, Transport } from './transport';
import type {
  FrameResult,
  IdentityStatus,
  ModelName,
  ModelUrls,
  StillResult,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

export interface ModelState {
  state: 'idle' | 'loading' | 'ready' | 'error';
  /** Why it failed (raw message; the UI turns it into a friendly one). */
  message?: string;
  /** How long loading took (ms). */
  ms?: number;
  delegate?: 'GPU' | 'CPU';
  /** Identity only: how the embedding model came up. */
  identity?: IdentityStatus;
}

const MODELS: readonly ModelName[] = ['face', 'hand', 'gesture', 'identity'];

/**
 * Main-thread handle to the inference engine (a Web Worker unless told otherwise).
 * Only one frame is in flight at a time: if the engine is busy the new frame is dropped,
 * which keeps latency bounded instead of building a queue.
 * Models load on request (load / ensure); nothing is loaded just by connecting.
 */
export class WorkerClient {
  private readonly transport: Transport;
  private pending: {
    id: number;
    resolve: (r: FrameResult) => void;
    reject: (e: Error) => void;
  } | null = null;
  private nextId = 1;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((e: Error) => void) | null = null;
  private readonly stills = new Map<
    number,
    { resolve: (r: StillResult) => void; reject: (e: Error) => void }
  >();
  private readonly waiters = new Map<
    ModelName,
    { resolve: (s: ModelState) => void; reject: (e: Error) => void }[]
  >();

  /** Current state of every model, for the UI. */
  readonly models: Record<ModelName, ModelState> = {
    face: { state: 'idle' },
    hand: { state: 'idle' },
    gesture: { state: 'idle' },
    identity: { state: 'idle' },
  };
  /** Called whenever a model changes state. */
  onModel: ((model: ModelName, state: ModelState) => void) | null = null;

  constructor(mode: ThreadMode = 'worker') {
    this.transport = createTransport(mode);
    this.transport.onmessage = (m) => this.onMessage(m);
    this.transport.onerror = (message) => this.fail(new Error(message));
  }

  get mode(): ThreadMode {
    return this.transport.mode;
  }

  /** Tells the engine where the model files are. Loads nothing. */
  init(urls: ModelUrls): Promise<void> {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.send({ type: 'init', ...urls });
    });
  }

  /** Starts loading a model if it is not loaded or loading. Safe to call every frame. */
  load(model: ModelName): void {
    const s = this.models[model].state;
    if (s === 'loading' || s === 'ready') return;
    this.setModel(model, { state: 'loading' });
    this.send({ type: 'load', model });
  }

  /** load() that resolves when the model is ready and rejects if it fails. */
  ensure(model: ModelName): Promise<ModelState> {
    return new Promise((resolve, reject) => {
      const s = this.models[model];
      if (s.state === 'ready') return resolve(s);
      const list = this.waiters.get(model) ?? [];
      list.push({ resolve, reject });
      this.waiters.set(model, list);
      this.load(model);
    });
  }

  isReady(model: ModelName): boolean {
    return this.models[model].state === 'ready';
  }

  get busy(): boolean {
    return this.pending !== null;
  }

  /** Transfers the bitmap to the engine. Returns null if it is still busy (bitmap is closed). */
  sendFrame(
    bitmap: ImageBitmap,
    timestamp: number,
    tasks: number,
    identityTargets?: Float32Array,
  ): Promise<FrameResult> | null {
    if (this.pending) {
      bitmap.close();
      return null;
    }
    const id = this.nextId++;
    return new Promise<FrameResult>((resolve, reject) => {
      this.pending = { id, resolve, reject };
      this.send({ type: 'frame', id, bitmap, timestamp, tasks, identityTargets }, [bitmap]);
    });
  }

  /** Embeds the largest face in a still image (used by the eval script). Call one at a time: the model session is shared. */
  embedStill(bitmap: ImageBitmap): Promise<StillResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.stills.set(id, { resolve, reject });
      this.send({ type: 'embedStill', id, bitmap }, [bitmap]);
    });
  }

  terminate(): void {
    this.transport.terminate();
    this.fail(new Error('Worker terminated'));
  }

  private send(msg: WorkerRequest, transfer: Transferable[] = []): void {
    this.transport.postMessage(msg, transfer);
  }

  private setModel(model: ModelName, state: ModelState): void {
    this.models[model] = state;
    this.onModel?.(model, state);
  }

  private onMessage(msg: WorkerResponse): void {
    if (msg.type === 'ready') {
      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
    } else if (msg.type === 'loaded') {
      const s: ModelState = {
        state: 'ready',
        ms: msg.ms,
        delegate: msg.delegate,
        identity: msg.identity,
      };
      this.setModel(msg.model, s);
      for (const w of this.waiters.get(msg.model) ?? []) w.resolve(s);
      this.waiters.delete(msg.model);
    } else if (msg.type === 'loadFailed') {
      const s: ModelState = { state: 'error', message: msg.message, identity: msg.identity };
      this.setModel(msg.model, s);
      for (const w of this.waiters.get(msg.model) ?? []) w.reject(new Error(msg.message));
      this.waiters.delete(msg.model);
    } else if (msg.type === 'result' && this.pending?.id === msg.id) {
      const p = this.pending;
      this.pending = null;
      p.resolve(msg.result);
    } else if (msg.type === 'still') {
      const p = this.stills.get(msg.id);
      this.stills.delete(msg.id);
      p?.resolve(msg.result);
    } else if (msg.type === 'error') {
      const still = msg.id === undefined ? undefined : this.stills.get(msg.id);
      if (still && msg.id !== undefined) {
        this.stills.delete(msg.id);
        still.reject(new Error(msg.message));
      } else if (this.pending && msg.id === this.pending.id) {
        // One bad frame must not end the session: reject it and keep going.
        const p = this.pending;
        this.pending = null;
        p.reject(new Error(msg.message));
      } else {
        this.fail(new Error(msg.message));
      }
    }
  }

  private fail(err: Error): void {
    this.readyReject?.(err); // init failed (the engine did not start)
    this.readyResolve = null;
    this.readyReject = null;
    const p = this.pending;
    this.pending = null;
    p?.reject(err);
    for (const s of this.stills.values()) s.reject(err);
    this.stills.clear();
    for (const list of this.waiters.values()) for (const w of list) w.reject(err);
    this.waiters.clear();
    // Models that were loading will never finish: show them as failed so the UI can offer a retry.
    for (const m of MODELS)
      if (this.models[m].state === 'loading')
        this.setModel(m, { state: 'error', message: err.message });
  }
}
