/// <reference lib="webworker" />
import { InferenceEngine } from './engine';
import type { WorkerRequest } from './protocol';

// The worker is only a host: the engine does the work and does not know where it runs.
const engine = new InferenceEngine((msg, transfer = []) =>
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer),
);
self.onmessage = (e: MessageEvent<WorkerRequest>) => void engine.handle(e.data);
