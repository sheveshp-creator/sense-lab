/**
 * Describes one face-embedding ONNX model: where it lives and how its input must be prepared.
 * Embeddings from different models are NOT comparable, so people are saved together with `id`.
 */
export interface IdentityModelSpec {
  /** Stored with every registered person. Change it whenever the model file changes. */
  id: string;
  /** File name inside public/models/ (served from our own origin). */
  file: string;
  /** Square input size in pixels. */
  size: number;
  /** Pixel value p becomes (p - mean) * scale. Channels are RGB, planar (NCHW). */
  mean: number;
  scale: number;
  /** Embedding length. */
  dim: number;
  /** Cosine similarity at or above which two faces count as the same person, per the model authors. */
  authorsThreshold: number;
}

/**
 * SFace (OpenCV Zoo, "face_recognition_sface_2021dec"), a MobileFaceNet trained with the SFace loss.
 * Apache-2.0. Takes RGB 0..255 with no normalisation (OpenCV feeds it blobFromImage(scale=1, swapRB)).
 * The fp32 file is 38.7 MB; the int8 one is 9.9 MB.
 */
export const SFACE_INT8: IdentityModelSpec = {
  id: 'sface-2021dec-int8',
  file: 'face_recognition_sface_2021dec_int8.onnx',
  size: 112,
  mean: 0,
  scale: 1,
  dim: 128,
  authorsThreshold: 0.363,
};

export const SFACE_FP32: IdentityModelSpec = {
  ...SFACE_INT8,
  id: 'sface-2021dec-fp32',
  file: 'face_recognition_sface_2021dec.onnx',
};

/**
 * fp32 is the default: measured on this project's eval (scripts/eval-identity.mjs) it gives the same
 * accuracy as int8 but runs 2-5x faster in onnxruntime-web (22 ms with WebGPU, 42 ms with WASM, versus
 * 100 ms for int8 on WASM), because the int8 graph is dequantised on the CPU. int8 is 4x smaller to
 * download, so it stays available: set this to SFACE_INT8 and run `WITH_INT8=1 ./scripts/fetch-models.sh`.
 */
export const ACTIVE_IDENTITY_MODEL: IdentityModelSpec = SFACE_FP32;
