import { createFaceDetector } from '../../features/face/detect';
import type { FaceDetector } from '../../features/face/detect';
import { fivePoints } from '../../features/face/align';
import { FACE_STRIDE, LANDMARK_FLOATS } from '../../features/face/faceFormat';
import { IdentityModelMissing, loadIdentityEngine } from '../../features/face/identity';
import type { IdentityEngine } from '../../features/face/identity';
import { headPose } from '../../features/face/pose';
import { createGestureRecognizer, createHandDetector } from '../../features/hand/detect';
import type { GestureHints, HandDetector } from '../../features/hand/detect';
import { TASK_FACE, TASK_GESTURE, TASK_HAND, TASK_IDENTITY } from '../../features/hand/handFormat';
import { IDENTITY_HEADER } from './protocol';
import type {
  FrameResult,
  IdentityStatus,
  ModelName,
  ModelUrls,
  StillResult,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

const EMPTY = new Float32Array(0);
const pts = new Float32Array(10);

/** Centre of the bounding box of one face's landmarks (normalised). */
function faceCentre(faces: Float32Array, d: number, out: { x: number; y: number }): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const o = d * FACE_STRIDE;
  for (let i = o; i < o + LANDMARK_FLOATS; i += 3) {
    const x = faces[i]!;
    const y = faces[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  out.x = (minX + maxX) / 2;
  out.y = (minY + maxY) / 2;
}

/** Largest face by landmark bounding-box area. */
function largestFace(faces: Float32Array, count: number): number {
  let best = 0;
  let bestArea = -1;
  for (let d = 0; d < count; d++) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = d * FACE_STRIDE; i < d * FACE_STRIDE + LANDMARK_FLOATS; i += 3) {
      minX = Math.min(minX, faces[i]!);
      maxX = Math.max(maxX, faces[i]!);
      minY = Math.min(minY, faces[i + 1]!);
      maxY = Math.max(maxY, faces[i + 1]!);
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area > bestArea) {
      bestArea = area;
      best = d;
    }
  }
  return best;
}

/** Embeds the faces nearest to each requested target centre. Returns the packed records. */
async function embedTargets(
  bitmap: ImageBitmap,
  faces: Float32Array,
  faceCount: number,
  targets: Float32Array,
  eng: IdentityEngine,
): Promise<{ count: number; data: Float32Array }> {
  const stride = IDENTITY_HEADER + eng.dim;
  const records: Float32Array[] = [];
  const used = new Set<number>();
  const c = { x: 0, y: 0 };
  for (let t = 0; t < targets.length / 2; t++) {
    let best = -1;
    let bestD = 0.15; // a face further than this from the requested spot is a different face
    for (let d = 0; d < faceCount; d++) {
      if (used.has(d)) continue;
      faceCentre(faces, d, c);
      const dist = Math.hypot(c.x - targets[t * 2]!, c.y - targets[t * 2 + 1]!);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    if (best < 0) continue;
    used.add(best);
    fivePoints(
      faces.subarray(best * FACE_STRIDE, best * FACE_STRIDE + LANDMARK_FLOATS),
      bitmap.width,
      bitmap.height,
      pts,
    );
    const rec = new Float32Array(stride);
    const q = await eng.embed(bitmap, pts, rec.subarray(IDENTITY_HEADER));
    rec[0] = t;
    rec[1] = q.sharpness;
    rec[2] = q.brightness;
    records.push(rec);
  }
  const data = new Float32Array(records.length * stride);
  records.forEach((r, i) => data.set(r, i * stride));
  return { count: records.length, data };
}

export type Post = (msg: WorkerResponse, transfer?: Transferable[]) => void;

/**
 * All inference lives here, independent of where it runs: inside a Web Worker (the normal case, see
 * inference.worker.ts) or on the main thread (the flagged fallback for browsers where the worker path
 * does not work, see transport.ts). It never touches `self`, so both can host it.
 *
 * Models are loaded on request, one at a time. MediaPipe's loader sets a global while it runs, so two
 * loads at once could trip over each other; a queue also makes the order explicit (face first).
 */
export class InferenceEngine {
  private face: FaceDetector | null = null;
  private hand: HandDetector | null = null;
  private gesture: GestureHints | null = null;
  private identity: IdentityEngine | null = null;
  private urls: ModelUrls | null = null;
  /** Image-mode face detector, created on first use (eval script only). */
  private stillFace: FaceDetector | null = null;
  private readonly requested = new Set<ModelName>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly post: Post) {}

  /** Entry point for every message from the client. Errors are reported, never thrown. */
  async handle(msg: WorkerRequest): Promise<void> {
    try {
      if (msg.type === 'init') {
        this.urls = msg;
        this.post({ type: 'ready' });
      } else if (msg.type === 'load') {
        this.requestLoad(msg.model);
      } else if (msg.type === 'frame') {
        await this.frame(msg);
      } else if (msg.type === 'embedStill') {
        await this.embedStill(msg);
      }
    } catch (err) {
      this.post({
        type: 'error',
        id: msg.type === 'frame' || msg.type === 'embedStill' ? msg.id : undefined,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private requestLoad(model: ModelName): void {
    if (this.requested.has(model)) return;
    this.requested.add(model);
    this.queue = this.queue.then(() => this.load(model));
  }

  private async load(model: ModelName): Promise<void> {
    const u = this.urls;
    if (!u) {
      this.post({ type: 'loadFailed', model, message: 'Worker not initialised' });
      return;
    }
    const t0 = performance.now();
    try {
      let delegate: 'GPU' | 'CPU' | undefined;
      let identity: IdentityStatus | undefined;
      if (model === 'face') {
        this.face = await createFaceDetector(u.wasmBaseUrl, u.faceModelUrl);
        delegate = this.face.delegate;
      } else if (model === 'hand') {
        this.hand = await createHandDetector(u.wasmBaseUrl, u.handModelUrl);
        delegate = this.hand.delegate;
      } else if (model === 'gesture') {
        this.gesture = await createGestureRecognizer(u.wasmBaseUrl, u.gestureModelUrl);
        delegate = this.gesture.delegate;
      } else {
        identity = await this.initIdentity(u);
        if (identity.state !== 'ready') throw new LoadFailure(identity);
      }
      this.post({ type: 'loaded', model, ms: performance.now() - t0, delegate, identity });
    } catch (err) {
      // Forget the request so the client can ask again (the Retry button).
      this.requested.delete(model);
      this.post({
        type: 'loadFailed',
        model,
        message: err instanceof Error ? err.message : String(err),
        identity: err instanceof LoadFailure ? err.status : undefined,
      });
    }
  }

  private async initIdentity(u: ModelUrls): Promise<IdentityStatus> {
    try {
      this.identity = await loadIdentityEngine({
        ortBaseUrl: u.ortBaseUrl,
        modelUrl: u.identityModelUrl,
        spec: u.identityModel,
        provider: u.identityProvider,
      });
      return {
        state: 'ready',
        modelId: u.identityModel.id,
        dim: this.identity.dim,
        provider: this.identity.provider,
        ...(this.identity.fallbackReason ? { fallbackReason: this.identity.fallbackReason } : {}),
      };
    } catch (err) {
      this.identity = null;
      const message = err instanceof Error ? err.message : String(err);
      return err instanceof IdentityModelMissing
        ? { state: 'missing', message }
        : { state: 'error', message };
    }
  }

  private async frame(msg: Extract<WorkerRequest, { type: 'frame' }>): Promise<void> {
    const t0 = performance.now();
    try {
      const r: FrameResult = {
        ran: 0,
        faceCount: 0,
        faces: EMPTY,
        handCount: 0,
        hands: EMPTY,
        hintCount: 0,
        hints: EMPTY,
        identityCount: 0,
        identity: EMPTY,
        faceMs: 0,
        handMs: 0,
        gestureMs: 0,
        identityMs: 0,
        workerMs: 0,
      };
      // Each model is timed on its own so the stats panel can show where the budget goes. A model that is
      // not loaded yet is skipped (the client only asks for loaded ones, this is just a safe guard).
      let t = performance.now();
      if (msg.tasks & TASK_FACE && this.face) {
        const out = this.face.detect(msg.bitmap, msg.timestamp);
        r.ran |= TASK_FACE;
        r.faceCount = out.count;
        r.faces = out.data;
        r.faceMs = performance.now() - t;
      }
      if (msg.tasks & TASK_HAND && this.hand) {
        t = performance.now();
        const out = this.hand.detectHands(msg.bitmap, msg.timestamp);
        r.ran |= TASK_HAND;
        r.handCount = out.count;
        r.hands = out.data;
        r.handMs = performance.now() - t;
      }
      if (msg.tasks & TASK_GESTURE && this.gesture) {
        t = performance.now();
        const out = this.gesture.recognize(msg.bitmap, msg.timestamp);
        r.ran |= TASK_GESTURE;
        r.hintCount = out.count;
        r.hints = out.data;
        r.gestureMs = performance.now() - t;
      }
      // Identity needs this frame's face landmarks, so it only runs together with TASK_FACE.
      if (msg.tasks & TASK_IDENTITY && this.identity && msg.identityTargets && r.ran & TASK_FACE) {
        t = performance.now();
        const out = await embedTargets(
          msg.bitmap,
          r.faces,
          r.faceCount,
          msg.identityTargets,
          this.identity,
        );
        r.ran |= TASK_IDENTITY;
        r.identityCount = out.count;
        r.identity = out.data;
        r.identityMs = performance.now() - t;
      }
      r.workerMs = performance.now() - t0;
      const transfer = [r.faces, r.hands, r.hints, r.identity]
        .filter((a) => a.byteLength > 0)
        .map((a) => a.buffer);
      this.post({ type: 'result', id: msg.id, result: r }, transfer);
    } finally {
      // Always release the bitmap to free GPU memory, even if inference threw.
      msg.bitmap.close();
    }
  }

  private async embedStill(msg: Extract<WorkerRequest, { type: 'embedStill' }>): Promise<void> {
    try {
      if (!this.urls) throw new Error('Worker not initialised');
      this.stillFace ??= await createFaceDetector(
        this.urls.wasmBaseUrl,
        this.urls.faceModelUrl,
        'IMAGE',
      );
      const out = this.stillFace.detect(msg.bitmap, 0);
      const result: StillResult = {
        faces: out.count,
        embedding: null,
        sharpness: 0,
        brightness: 0,
        yaw: 0,
        pitch: 0,
        face: null,
      };
      const transfer: Transferable[] = [];
      if (out.count > 0) {
        const d = largestFace(out.data, out.count);
        const lm = out.data.subarray(d * FACE_STRIDE, d * FACE_STRIDE + LANDMARK_FLOATS);
        const pose = headPose(lm, msg.bitmap.width / msg.bitmap.height);
        result.yaw = pose.yaw;
        result.pitch = pose.pitch;
        result.face = out.data.slice(d * FACE_STRIDE, (d + 1) * FACE_STRIDE);
        transfer.push(result.face.buffer);
        if (this.identity) {
          fivePoints(lm, msg.bitmap.width, msg.bitmap.height, pts);
          const emb = new Float32Array(this.identity.dim);
          const q = await this.identity.embed(msg.bitmap, pts, emb);
          result.embedding = emb;
          result.sharpness = q.sharpness;
          result.brightness = q.brightness;
          transfer.push(emb.buffer);
        }
      }
      this.post({ type: 'still', id: msg.id, result }, transfer);
    } finally {
      msg.bitmap.close();
    }
  }
}

/** Carries the identity status through the shared error path of load(). */
class LoadFailure extends Error {
  constructor(readonly status: IdentityStatus) {
    super(status.state === 'ready' ? 'ok' : status.message);
  }
}
