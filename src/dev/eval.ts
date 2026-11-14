import { WorkerClient } from '../core/worker/client';
import type { IdentityStatus } from '../core/worker/protocol';
import { SFACE_FP32, SFACE_INT8 } from '../features/face/identityModel';
import { BLENDSHAPE_OFFSET, POSE_OFFSET } from '../features/face/faceFormat';
import { EXPRESSIONS, RuleBasedClassifier } from '../features/face/expression';
import { BS } from '../features/face/blendshapes';
import { eyeAspectRatio } from '../features/face/eyes/ear';
import { eyeInHead, gazeFrom, headAnglesDisplay } from '../features/face/eyes/gaze';
import type { IdentityProvider } from '../features/face/identity';

/**
 * Dev-only bridge for scripts/eval-identity.mjs: runs the real worker (face landmarks, alignment, ONNX
 * embedding) on still images handed in by the script. Options come from the query string:
 *   ?model=fp32|int8   ?provider=auto|wasm|webgpu
 */
const q = new URLSearchParams(location.search);
const spec = q.get('model') === 'int8' ? SFACE_INT8 : SFACE_FP32;
const provider = (q.get('provider') ?? 'auto') as IdentityProvider;
const base = `${location.origin}/models`;

const client = new WorkerClient();
const ready: Promise<IdentityStatus> = client
  .init({
    wasmBaseUrl: `${base}/wasm`,
    faceModelUrl: `${base}/face_landmarker.task`,
    handModelUrl: `${base}/hand_landmarker.task`,
    gestureModelUrl: `${base}/gesture_recognizer.task`,
    ortBaseUrl: `${base}/ort/`,
    identityModelUrl: `${base}/${spec.file}`,
    identityModel: spec,
    identityProvider: provider,
  })
  .then(() => client.ensure('identity'))
  .then((s) => s.identity!)
  .catch((e: unknown) => {
    // A failed load carries the status in the client's model state (missing file, wasm error, ...).
    const st = client.models.identity.identity;
    if (st) return st;
    throw e;
  });

export interface EvalRow {
  faces: number;
  embedding: number[] | null;
  sharpness: number;
  brightness: number;
  yaw: number;
  pitch: number;
  /** Packed face (landmarks, blendshapes, head pose) of the largest face. */
  face: number[] | null;
  ms: number;
}

/** What the app's expression classifier says about one packed face. */
export interface ExpressionVerdict {
  label: string;
  scores: Record<string, number>;
}

const classifier = new RuleBasedClassifier();

/** Eye measurements the app's own code makes for one packed face (for checking them on real photos). */
export interface EyesAnalysis {
  closureBlendshape: number;
  ear: number;
  eyeOffsetX: number;
  eyeOffsetY: number;
  eyeDegX: number;
  eyeDegY: number;
  headYaw: number;
  headPitch: number;
  gazeX: number;
  gazeY: number;
  /** Gaze implied by MediaPipe's own eyeLook blendshapes (+x = user's right), 0..1 scale. */
  blendshapeGazeX: number;
  blendshapeGazeY: number;
}

declare global {
  interface Window {
    __eval: {
      ready: Promise<IdentityStatus>;
      embed: (base64: string, mime: string) => Promise<EvalRow>;
      expression: (face: number[]) => ExpressionVerdict;
      eyes: (face: number[]) => EyesAnalysis;
    };
  }
}

window.__eval = {
  ready,
  eyes(face) {
    const lm = face.slice(0, 1434);
    const b = face.slice(BLENDSHAPE_OFFSET, POSE_OFFSET);
    const pose = face.slice(POSE_OFFSET);
    const eye = eyeInHead(lm, 1);
    const g = gazeFrom(eye, pose);
    const head = headAnglesDisplay(pose);
    // ARKit naming: eyeLookOutRight = the subject's right eye turned toward the subject's right.
    const gx =
      (b[BS.eyeLookOutRight]! -
        b[BS.eyeLookInRight]! +
        b[BS.eyeLookInLeft]! -
        b[BS.eyeLookOutLeft]!) /
      2;
    const gy =
      (b[BS.eyeLookDownLeft]! +
        b[BS.eyeLookDownRight]! -
        b[BS.eyeLookUpLeft]! -
        b[BS.eyeLookUpRight]!) /
      2;
    return {
      closureBlendshape: Math.min(b[BS.eyeBlinkLeft]!, b[BS.eyeBlinkRight]!),
      ear: eyeAspectRatio(lm, 1),
      eyeOffsetX: eye.x,
      eyeOffsetY: eye.y,
      eyeDegX: g.eyeX,
      eyeDegY: g.eyeY,
      headYaw: head.yaw,
      headPitch: head.pitch,
      gazeX: g.x,
      gazeY: g.y,
      blendshapeGazeX: gx,
      blendshapeGazeY: gy,
    };
  },
  expression(face) {
    const scores = new Float32Array(EXPRESSIONS.length);
    const label = classifier.classify(face.slice(BLENDSHAPE_OFFSET, POSE_OFFSET), scores);
    return { label, scores: Object.fromEntries(EXPRESSIONS.map((e, i) => [e, scores[i]!])) };
  },
  async embed(base64, mime) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    const t0 = performance.now();
    const r = await client.embedStill(bitmap);
    return {
      faces: r.faces,
      embedding: r.embedding ? Array.from(r.embedding) : null,
      sharpness: r.sharpness,
      brightness: r.brightness,
      yaw: r.yaw,
      pitch: r.pitch,
      face: r.face ? Array.from(r.face) : null,
      ms: performance.now() - t0,
    };
  },
};
