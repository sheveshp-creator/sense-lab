import { similarityTransform, TEMPLATE_112 } from './align';
import { l2Normalize } from './matching';
import { laplacianVariance, toGray } from './quality';
import type { IdentityModelSpec } from './identityModel';

export type IdentityProvider = 'auto' | 'wasm' | 'webgpu';

export interface IdentityEngine {
  spec: IdentityModelSpec;
  /** Which backend actually runs the model. */
  provider: 'webgpu' | 'wasm';
  /** Why WebGPU was not used, if it was wanted and failed. */
  fallbackReason: string | null;
  /** Embedding length, read from the model. */
  dim: number;
  /**
   * Aligns the face to 112x112 from five key points (pixel coordinates in `bitmap`), runs the model,
   * writes the L2-normalised embedding into `out` and returns the crop's quality numbers.
   */
  embed(
    bitmap: ImageBitmap,
    points: ArrayLike<number>,
    out: Float32Array,
  ): Promise<{ sharpness: number; brightness: number }>;
}

/** The model file is not where it should be (not a failure of the code, a missing download). */
export class IdentityModelMissing extends Error {}

/**
 * Loads the ONNX embedding model with onnxruntime-web, inside the worker. Everything is fetched from
 * our own origin: the model from public/models and the runtime's .wasm files from public/models/ort.
 */
export async function loadIdentityEngine(opts: {
  ortBaseUrl: string;
  modelUrl: string;
  spec: IdentityModelSpec;
  provider: IdentityProvider;
}): Promise<IdentityEngine> {
  const { spec } = opts;
  const res = await fetch(opts.modelUrl);
  const bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  // A dev server answers a missing file with index.html (HTTP 200), so check the content as well.
  const looksLikeHtml = bytes !== null && bytes[0] === 0x3c; // '<'
  if (!bytes || bytes.length < 1000 || looksLikeHtml) {
    throw new IdentityModelMissing(`Model file not found: ${opts.modelUrl}`);
  }

  const wantGpu = opts.provider === 'webgpu' || (opts.provider === 'auto' && 'gpu' in navigator);
  const create = async (gpu: boolean) => {
    // Two builds: "webgpu" carries the WebGPU backend (bigger .wasm); "wasm" is CPU only.
    const ort = gpu ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm');
    ort.env.wasm.wasmPaths = opts.ortBaseUrl;
    // This model lists its weights as graph inputs, which makes the runtime print hundreds of harmless
    // warnings (through console.error). Only real errors are worth showing.
    ort.env.logLevel = 'error';
    // Multi-threading needs cross-origin isolation, which this app does not enable.
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: gpu ? ['webgpu', 'wasm'] : ['wasm'],
      graphOptimizationLevel: 'all',
      // 3 = errors only. The session's own logger is separate from ort.env.logLevel.
      logSeverityLevel: 3,
    });
    return { ort, session };
  };

  let provider: 'webgpu' | 'wasm' = wantGpu ? 'webgpu' : 'wasm';
  let fallbackReason: string | null = null;
  let loaded;
  try {
    loaded = await create(wantGpu);
  } catch (err) {
    if (!wantGpu) throw err;
    provider = 'wasm';
    fallbackReason = err instanceof Error ? err.message : String(err);
    loaded = await create(false);
  }
  const { ort, session } = loaded;
  const inputName = session.inputNames[0]!;
  const outputName = session.outputNames[0]!;

  const S = spec.size;
  const canvas = new OffscreenCanvas(S, S);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const input = new Float32Array(3 * S * S);
  const gray = new Float32Array(S * S);
  let dim = spec.dim;

  return {
    spec,
    get provider() {
      return provider;
    },
    get dim() {
      return dim;
    },
    fallbackReason,
    async embed(bitmap, points, out) {
      const t = similarityTransform(points, TEMPLATE_112);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, S, S);
      // Canvas matrix (a, b, c, d, e, f) maps x' = a x + c y + e, y' = b x + d y + f.
      ctx.setTransform(t.a, t.b, -t.b, t.a, t.tx, t.ty);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const px = ctx.getImageData(0, 0, S, S).data;

      // RGBA -> planar RGB floats, (p - mean) * scale.
      const plane = S * S;
      for (let p = 0, i = 0; p < plane; p++, i += 4) {
        input[p] = (px[i]! - spec.mean) * spec.scale;
        input[plane + p] = (px[i + 1]! - spec.mean) * spec.scale;
        input[2 * plane + p] = (px[i + 2]! - spec.mean) * spec.scale;
      }
      const brightness = toGray(px, gray);
      const sharpness = laplacianVariance(gray, S, S);

      const outputs = await session.run({
        [inputName]: new ort.Tensor('float32', input, [1, 3, S, S]),
      });
      const data = outputs[outputName]!.data as Float32Array;
      dim = data.length;
      for (let i = 0; i < out.length && i < data.length; i++) out[i] = data[i]!;
      l2Normalize(out);
      return { sharpness, brightness };
    },
  };
}
