import type { IdentityModelSpec } from '../../features/face/identityModel';
import type { IdentityProvider } from '../../features/face/identity';

/** Messages between the UI thread and the inference worker. Images only travel main -> worker. */

export interface ModelUrls {
  wasmBaseUrl: string;
  faceModelUrl: string;
  handModelUrl: string;
  gestureModelUrl: string;
  /** Directory (with trailing slash) holding onnxruntime-web's .wasm files. */
  ortBaseUrl: string;
  identityModelUrl: string;
  identityModel: IdentityModelSpec;
  identityProvider: IdentityProvider;
}

/** How the face-identity model came up. The rest of the app works without it. */
export type IdentityStatus =
  | {
      state: 'ready';
      modelId: string;
      dim: number;
      provider: 'webgpu' | 'wasm';
      fallbackReason?: string;
    }
  | { state: 'missing'; message: string }
  | { state: 'error'; message: string };

/** The models that load on demand, one at a time, the first time their feature is needed. */
export type ModelName = 'face' | 'hand' | 'gesture' | 'identity';

export type WorkerRequest =
  | ({ type: 'init' } & ModelUrls)
  | { type: 'load'; model: ModelName }
  | {
      type: 'frame';
      id: number;
      bitmap: ImageBitmap;
      timestamp: number;
      /** Bit mask of TASK_* flags: which models the scheduler wants on this frame. */
      tasks: number;
      /** For TASK_IDENTITY: centres (x, y normalised) of the faces to embed. Matched to detections by distance. */
      identityTargets?: Float32Array;
    }
  | { type: 'embedStill'; id: number; bitmap: ImageBitmap };

export const IDENTITY_HEADER = 4;

export interface FrameResult {
  /** Bit mask of the TASK_* flags that actually ran. */
  ran: number;
  faceCount: number;
  /** faceCount faces in the features/face/faceFormat layout. */
  faces: Float32Array;
  handCount: number;
  /** handCount hands in the features/hand/handFormat layout. */
  hands: Float32Array;
  hintCount: number;
  /** GestureRecognizer hints (HINT_STRIDE floats each). */
  hints: Float32Array;
  /**
   * Embeddings, `identityCount` records of IDENTITY_HEADER + dim floats:
   * [targetIndex, sharpness, brightness, 0, ...embedding].
   */
  identityCount: number;
  identity: Float32Array;
  /** Per-model time inside MediaPipe / ONNX (ms). 0 if the model did not run. */
  faceMs: number;
  handMs: number;
  gestureMs: number;
  identityMs: number;
  /** Total time in the worker for this frame (ms). */
  workerMs: number;
}

/** Result of embedding one still photo (eval script). */
export interface StillResult {
  faces: number;
  /** Largest face's embedding, if any. */
  embedding: Float32Array | null;
  sharpness: number;
  brightness: number;
  /** Head pose proxies (see features/face/pose.ts) of that face. */
  yaw: number;
  pitch: number;
  /** The largest face in the packed faceFormat layout (landmarks, blendshapes, head pose), if any. */
  face: Float32Array | null;
}

export type WorkerResponse =
  /** The worker is up and knows the model URLs. No model is loaded yet. */
  | { type: 'ready' }
  | {
      type: 'loaded';
      model: ModelName;
      ms: number;
      delegate?: 'GPU' | 'CPU';
      identity?: IdentityStatus;
    }
  | { type: 'loadFailed'; model: ModelName; message: string; identity?: IdentityStatus }
  | { type: 'result'; id: number; result: FrameResult }
  | { type: 'still'; id: number; result: StillResult }
  | { type: 'error'; id?: number; message: string };
